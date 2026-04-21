const fs   = require('fs');
const os   = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const MeetingRecorder = require('./recorder');
const ffmpegService = require('../services/ffmpeg.service');
const { deleteFile } = require('../utils/fileManager');
const logger = require('../utils/logger');

// ─── Hard media-lock script (injected before Meet loads) ─────────────────────
// Runs in the page context via evaluateOnNewDocument.
// Overrides getUserMedia so the bot can never send real mic/camera to the call.
// Does NOT affect incoming RTCPeerConnection audio tracks (other participants).
function _mediaLockScript() {
  return () => {
    const emptyStream = () => {
      try { return Promise.resolve(new MediaStream()); }
      catch { return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError')); }
    };

    // Override W3C MediaDevices API (used by modern browsers + Google Meet)
    try {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: emptyStream,
        writable: false,
        configurable: false,
      });
    } catch {}

    // Override legacy API
    try { navigator.getUserMedia = (_c, ok) => ok(new MediaStream()); } catch {}
    try { navigator.webkitGetUserMedia = (_c, ok) => ok(new MediaStream()); } catch {}
    try { navigator.mozGetUserMedia = (_c, ok) => ok(new MediaStream()); } catch {}

    // Block chat (C), reactions (E), hand-raise (H) keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (['c', 'C', 'e', 'E', 'h', 'H'].includes(e.key)) {
        e.stopImmediatePropagation();
      }
    }, true);
  };
}

// ─── Google Meet UI selectors ─────────────────────────────────────────────────
const SELECTORS = {
  joinButton: [
    '[data-idom-class="nUpftc"]',
    '[jsname="Qx7uuf"]',
    'button[jsname="V67aGc"]',
    '[data-call-ended="false"] button',
  ],
  muteButton: [
    '[jsname="BOHaEe"]',
    '[aria-label*="microphone"]',
    '[aria-label*="Microphone"]',
  ],
  cameraButton: [
    '[jsname="R3Dmqb"]',
    '[aria-label*="camera"]',
    '[aria-label*="Camera"]',
  ],
  meetingEndedMarkers: [
    '[jsname="r4nke"]',
    '[data-meeting-ended="true"]',
  ],
};

const MAX_MEETING_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours hard cap
const MONITOR_INTERVAL_MS     = 3_000;               // fallback poll every 3 s
const ALONE_TIMEOUT_MS        = 15_000;              // leave 15 s after last participant leaves

// Phrases that unambiguously mean the meeting is over.
// Used by both the MutationObserver (instant) and the poll (fallback).
const MEETING_END_PHRASES = [
  'Meeting ended',
  'This meeting has ended',
  'The meeting has been ended',
  'has been ended by',
  'This call has ended',
  'call has ended',
  'You left the meeting',
  "You've left the call",
  'You left the call',
  'You were removed',
  'removed from the meeting',
  'Return to home screen',
  'Go back to home',
];

// ─── Bot account pool ────────────────────────────────────────────────────────
//
// Each simultaneous meeting MUST use a separate Google account / Chrome profile.
// Google Meet kicks a second session that uses the same account cookies.
//
// ONE-TIME SETUP per bot account:
//   Windows: chrome.exe --user-data-dir=C:\bot-profile-1
//   Mac:     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//              --user-data-dir=/Users/yourname/bot-profile-1
//   → Log into bot1@yourcompany.com, then close Chrome.
//   Repeat for bot2@yourcompany.com with bot-profile-2, etc.
//
// Set in .env  (comma-separated, one path per bot account):
//   BOT_PROFILE_DIRS=/Users/pranav/bot-profile-1,/Users/pranav/bot-profile-2
//
// Fallback (single account, backward-compatible):
//   BOT_PROFILE_DIR=/Users/pranav/bot-chrome-profile
//
function _resolveBotProfiles() {
  // Multi-account: BOT_PROFILE_DIRS takes priority
  if (process.env.BOT_PROFILE_DIRS) {
    return process.env.BOT_PROFILE_DIRS
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  // Single-account fallback
  const single = process.env.BOT_PROFILE_DIR || (
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'bot-chrome-profile')
      : 'C:\\bot-chrome-profile'
  );
  return [single];
}

const BOT_PROFILES = _resolveBotProfiles();
logger.info(`Bot profile pool: ${BOT_PROFILES.length} account(s) — ${BOT_PROFILES.join(', ')}`);

// ─── MeetBot singleton ────────────────────────────────────────────────────────
class MeetBot {
  constructor() {
    /** @type {Map<number, { browser, page, recorder, audioPath, sessionDir, profileDir }>} */
    this._active = new Map();
    /** Profiles currently in use — prevents two meetings sharing the same Google account */
    this._usedProfiles = new Set();
  }

  /** Pick the first profile not currently in use. Returns null if none available. */
  _acquireProfile() {
    for (const p of BOT_PROFILES) {
      if (!this._usedProfiles.has(p)) {
        this._usedProfiles.add(p);
        return p;
      }
    }
    return null; // all profiles busy
  }

  _releaseProfile(profileDir) {
    if (profileDir) this._usedProfiles.delete(profileDir);
  }

  /** How many concurrent slots are still free */
  availableSlots() {
    return BOT_PROFILES.length - this._usedProfiles.size;
  }

  async joinMeeting(meeting) {
    if (this._active.has(meeting.id)) {
      logger.warn(`Bot already active for meeting ${meeting.id} — skipping`);
      return;
    }

    // Acquire a free bot account profile
    const profileDir = this._acquireProfile();
    if (!profileDir) {
      const msg =
        `No free bot profile available (${BOT_PROFILES.length} account(s) configured, ` +
        `all ${this._usedProfiles.size} in use). ` +
        `Add more bot accounts via BOT_PROFILE_DIRS in .env to record simultaneous meetings.`;
      logger.error(msg);
      await meeting.update({ status: 'failed' }).catch(() => {});
      return;
    }

    logger.info(`Bot joining: "${meeting.title}" (id=${meeting.id}) using profile: ${profileDir}`);
    this._active.set(meeting.id, null);

    let browser;
    let sessionDir;
    try {
      ({ browser, sessionDir } = await this._launchBrowser(meeting.id, profileDir));
      const page = await browser.newPage();

      await browser
        .defaultBrowserContext()
        .overridePermissions('https://meet.google.com', [
          'camera', 'microphone', 'notifications',
        ]);

      await this._ensureLoggedIn(page, profileDir);

      // Inject BEFORE the Meet page loads:
      //   1. Media lock  — hard-blocks mic/camera at the browser API level
      //   2. Recorder hook — intercepts RTCPeerConnection to capture incoming audio
      await page.evaluateOnNewDocument(_mediaLockScript());
      await page.evaluateOnNewDocument(MeetingRecorder.hookScript());

      await meeting.update({ status: 'recording', started_at: new Date() });

      let loaded = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await page.goto(meeting.meet_link, { waitUntil: 'load', timeout: 60_000 });
          await sleep(8_000); // let Meet's React UI stabilise
          loaded = true;
          break;
        } catch (err) {
          logger.warn(`Navigation attempt ${attempt} failed: ${err.message}`);
        }
      }
      if (!loaded) throw new Error('Failed to load meeting page after 3 attempts');

      await page.bringToFront();
      await this._disableInputDevices(page);
      await this._clickJoinButton(page);
      await sleep(3_000); // wait for in-call UI to settle
      await this._disableInputDevices(page); // re-check after joining

      const recorder = new MeetingRecorder(page);
      const audioPath = await recorder.start(meeting.id);

      const session = { browser, page, recorder, audioPath, sessionDir, profileDir };
      this._active.set(meeting.id, session);

      logger.info(`Bot joined meeting ${meeting.id} — recording to ${audioPath}`);
      this._startMonitor(meeting, session);

    } catch (err) {
      logger.error(`Bot failed to join meeting ${meeting.id}: ${err.message}`);
      await meeting.update({ status: 'failed' }).catch(() => {});
      if (browser) await browser.close().catch(() => {});
      if (sessionDir) fs.rm(sessionDir, { recursive: true, force: true }, () => {});
      this._releaseProfile(profileDir);
      this._active.delete(meeting.id);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  async _launchBrowser(meetingId, profileDir) {
    // Each concurrent session copies its assigned bot account's profile into a
    // fresh temp dir. This keeps the base profile clean and lets Chrome write
    // session state without corrupting the master copy.
    const sessionDir = path.join(os.tmpdir(), `chrome-profile-${meetingId}-${Date.now()}`);
    try {
      fs.mkdirSync(sessionDir, { recursive: true });

      // Copy the 'Default' subfolder (cookies, localStorage, session tokens)
      const defaultSrc = path.join(profileDir, 'Default');
      const defaultDst = path.join(sessionDir, 'Default');
      if (fs.existsSync(defaultSrc)) {
        fs.cpSync(defaultSrc, defaultDst, { recursive: true, errorOnExist: false });
      } else {
        logger.warn(`Bot profile Default folder not found: ${defaultSrc} — bot may not be signed in`);
      }

      // CRITICAL on Windows: Chrome encrypts cookies with a key stored in
      // 'Local State' (root of the profile dir, NOT inside Default/).
      // Without this file the copied session cookies cannot be decrypted
      // and Chrome treats every request as unauthenticated.
      const localStateSrc = path.join(profileDir, 'Local State');
      const localStateDst = path.join(sessionDir, 'Local State');
      if (fs.existsSync(localStateSrc)) {
        fs.copyFileSync(localStateSrc, localStateDst);
        logger.debug(`Copied Local State from ${profileDir}`);
      } else {
        logger.warn(`Local State not found in ${profileDir} — cookie decryption may fail`);
      }

    } catch (copyErr) {
      logger.warn(`Chrome profile copy failed (non-fatal): ${copyErr.message}`);
    }

    // Resolve Chrome executable: env var → OS default → Puppeteer bundled Chromium
    const chromeExec = process.env.CHROME_EXECUTABLE_PATH || (
      process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    );
    // Fall back to Puppeteer's bundled Chromium if the path doesn't exist
    const executablePath = fs.existsSync(chromeExec) ? chromeExec : undefined;

    const browser = await puppeteer.launch({
      headless: 'new',   // set to 'new' to run invisibly in the background
      ...(executablePath ? { executablePath } : {}),
      userDataDir: sessionDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',  // silent fake mic + black fake camera
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,720',
      ],
      defaultViewport: { width: 1280, height: 720 },
    });
    return { browser, sessionDir };
  }

  async _ensureLoggedIn(page, profileDir) {
    await page.goto('https://accounts.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const url = page.url();
    if (url.includes('accounts.google.com/signin') || url.includes('/v3/signin')) {
      const chromeExec = process.env.CHROME_EXECUTABLE_PATH ||
        (process.platform === 'darwin'
          ? '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
          : '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"');
      throw new Error(
        `Bot Chrome profile is not signed into Google.\n` +
        `Profile dir: ${profileDir}\n` +
        `Run this command, sign in with your bot Google account, then close Chrome:\n` +
        `  ${chromeExec} --user-data-dir=${profileDir}`
      );
    }
    logger.info(`Bot Chrome profile signed in (profile: ${profileDir})`);
  }

  async _disableInputDevices(page) {
    // Wait up to 8 s for the pre-join lobby UI to appear
    await sleep(2_000);

    const disabled = await page.evaluate(() => {
      let micOff = false, camOff = false;

      // Google Meet pre-join buttons use aria-label and aria-pressed
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));

      for (const btn of buttons) {
        const label   = (btn.getAttribute('aria-label') || btn.innerText || '').toLowerCase();
        const pressed = btn.getAttribute('aria-pressed');
        const tooltip = (btn.getAttribute('data-tooltip') || '').toLowerCase();

        const isMic = label.includes('micr') || tooltip.includes('micr') ||
                      btn.getAttribute('jsname') === 'BOHaEe';
        const isCam = label.includes('camera') || tooltip.includes('camera') ||
                      btn.getAttribute('jsname') === 'R3Dmqb';

        if (isMic && pressed !== 'false') {
          btn.click();
          micOff = true;
        }
        if (isCam && pressed !== 'false') {
          btn.click();
          camOff = true;
        }
      }
      return { micOff, camOff };
    });

    logger.debug(`Pre-join: mic toggled=${disabled.micOff}, cam toggled=${disabled.camOff}`);

    // Give Meet a moment to process the toggle, then verify
    await sleep(1_000);

    const state = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      let micOn = false, camOn = false;
      for (const btn of buttons) {
        const label   = (btn.getAttribute('aria-label') || '').toLowerCase();
        const pressed = btn.getAttribute('aria-pressed');
        const isMic   = label.includes('micr') || btn.getAttribute('jsname') === 'BOHaEe';
        const isCam   = label.includes('camera') || btn.getAttribute('jsname') === 'R3Dmqb';
        if (isMic && pressed === 'true') micOn = true;
        if (isCam && pressed === 'true') camOn = true;
      }
      return { micOn, camOn };
    }).catch(() => ({ micOn: false, camOn: false }));

    if (state.micOn || state.camOn) {
      logger.warn(`Devices still on after toggle (mic=${state.micOn}, cam=${state.camOn}) — retrying`);
      await page.evaluate(() => {
        document.querySelectorAll('button, [role="button"]').forEach((btn) => {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          const pressed = btn.getAttribute('aria-pressed');
          if ((label.includes('micr') || label.includes('camera')) && pressed === 'true') {
            btn.click();
          }
        });
      });
      await sleep(500);
    }

    logger.info('Pre-join: microphone and camera are off');
  }

  async _clickJoinButton(page) {
    for (const sel of SELECTORS.joinButton) {
      try {
        await page.waitForSelector(sel, { timeout: 10_000 });
        await page.click(sel);
        logger.info(`Clicked join via selector: ${sel}`);
        await sleep(3_000);
        return;
      } catch { /* try next */ }
    }

    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => /join\s*now?/i.test(b.textContent ?? ''));
      if (btn) { btn.click(); return true; }
      return false;
    });

    if (clicked) {
      logger.info('Clicked join via text-content fallback');
      await sleep(3_000);
    } else {
      throw new Error('Could not locate the Join button on Google Meet');
    }
  }

  /**
   * Poll every 5 s for end conditions:
   *   1. "Meeting ended" / "You left" DOM text  → end immediately
   *   2. Bot is the only participant            → end after 60 s grace period
   *   3. Page navigates away from meet.google.com (bot was kicked) → force-stop
   *   4. Page crash                             → force-stop
   *   5. 4-hour hard cap                        → end
   */
  _startMonitor(meeting, session) {
    const startTime = Date.now();
    let aloneAt  = null;
    let finished = false;

    // Extract the meeting code from the link (e.g. "abc-defg-hij")
    const meetCode = meeting.meet_link.split('/').pop().split('?')[0];

    const end = async (elapsed, force = false) => {
      if (finished) return;
      finished = true;
      clearInterval(intervalHandle);
      await this._endSession(meeting, session, elapsed, force);
    };

    // When Meet ends / bot is kicked, the page navigates to meet.google.com/
    // (home) — the meeting code disappears from the URL.
    session.page.on('framenavigated', async (frame) => {
      if (frame !== session.page.mainFrame()) return;
      const url = frame.url();
      if (!url.includes(meetCode)) {
        logger.warn(`Meeting ${meeting.id}: navigated away from meeting (${url}) — meeting ended or bot was kicked`);
        await end(Date.now() - startTime, true);
      }
    });

    session.page.on('crash', async () => {
      logger.error(`Meeting ${meeting.id}: browser page crashed`);
      await end(Date.now() - startTime, true);
    });

    // ── Instant end detection via MutationObserver ───────────────────────────
    // Fires the moment Google Meet changes the DOM to show an end screen
    // (host ends call, bot removed, etc.) — no polling delay.
    session.page
      .exposeFunction('__onMeetingEndDetected', async () => {
        logger.info(`Meeting ${meeting.id}: host ended the call — stopping immediately`);
        await end(Date.now() - startTime, false);
      })
      .catch(() => {}); // ignore if already exposed

    session.page
      .evaluate((phrases) => {
        const check = () => {
          const body = document.body?.innerText ?? '';
          if (phrases.some((p) => body.includes(p))) {
            window.__onMeetingEndDetected?.();
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(document.body, { childList: true, subtree: true });
        check(); // run immediately in case the text is already present
      }, MEETING_END_PHRASES)
      .catch(() => {});

    const intervalHandle = setInterval(async () => {
      try {
        const elapsed = Date.now() - startTime;

        if (elapsed > MAX_MEETING_DURATION_MS) {
          logger.warn(`Meeting ${meeting.id} hit 4-hour cap — leaving`);
          await end(elapsed);
          return;
        }

        const { meetingEnded, alone, waitingCount } = await session.page
          .evaluate((markers, phrases) => {
            const body  = document.body?.innerText ?? '';
            const title = document.title ?? '';
            const admitButtons = document.querySelectorAll(
              'button[aria-label*="Admit"], button[aria-label*="admit"]'
            );
            return {
              meetingEnded: (
                markers.some((sel) => !!document.querySelector(sel)) ||
                phrases.some((p) => body.includes(p))                ||
                title.includes('Meeting ended')                       ||
                title.includes('Left the meeting')
              ),
              alone: (
                body.includes("You're the only one here")             ||
                body.includes('Only you are in the call')             ||
                body.includes('No one else is here')                  ||
                body.includes("You're the only one in this call")     ||
                body.includes('Waiting for others to join')           ||
                body.includes('No one else has joined')
              ),
              waitingCount: admitButtons.length,
            };
          }, SELECTORS.meetingEndedMarkers, MEETING_END_PHRASES)
          .catch((err) => {
            // Page session closed / target destroyed = bot was kicked or meeting ended.
            // Don't silently swallow — trigger end immediately.
            const msg = err.message ?? '';
            if (
              msg.includes('Session closed')       ||
              msg.includes('Target closed')        ||
              msg.includes('context was destroyed')||
              msg.includes('Execution context')    ||
              msg.includes('detached')             ||
              msg.includes('Protocol error')
            ) {
              logger.warn(`Meeting ${meeting.id}: page session lost (${msg.split('\n')[0]}) — ending session`);
              end(Date.now() - startTime, true);
            }
            return { meetingEnded: false, alone: false };
          });

        if (meetingEnded) {
          logger.info(`Meeting ${meeting.id}: meeting ended — stopping recording`);
          await end(elapsed);
          return;
        }

        // Track waiting count on the session for the admit API to inspect
        if (waitingCount !== session.waitingCount) {
          session.waitingCount = waitingCount;
          if (waitingCount > 0) {
            logger.info(`Meeting ${meeting.id}: ${waitingCount} participant(s) waiting in lobby — use POST /api/v1/meetings/${meeting.id}/admit to let them in`);
          }
        }

        if (alone) {
          if (!aloneAt) {
            aloneAt = Date.now();
            logger.info(`Meeting ${meeting.id}: bot is the only participant — will leave in ${ALONE_TIMEOUT_MS / 1000}s if no one rejoins`);
          } else if (Date.now() - aloneAt >= ALONE_TIMEOUT_MS) {
            logger.info(`Meeting ${meeting.id}: alone for ${ALONE_TIMEOUT_MS / 1000}s — leaving`);
            await end(elapsed);
          }
        } else {
          if (aloneAt) logger.info(`Meeting ${meeting.id}: participant rejoined — staying`);
          aloneAt = null;
        }
      } catch (err) {
        logger.error(`Monitor error for meeting ${meeting.id}: ${err.message}`);
        await end(Date.now() - startTime, true);
      }
    }, MONITOR_INTERVAL_MS);

    session.intervalHandle = intervalHandle;
  }

  /** Returns the number of participants currently waiting in the lobby (0 if no active session). */
  getWaitingCount(meetingId) {
    return this._active.get(meetingId)?.waitingCount ?? 0;
  }

  /**
   * Admit all participants currently waiting in the lobby.
   * Must only be called when explicitly triggered by an authorised API request —
   * the bot never auto-admits on its own.
   *
   * @param {number} meetingId
   * @returns {Promise<string[]>} names of admitted participants (empty if none waiting)
   */
  async admitWaiting(meetingId) {
    const session = this._active.get(meetingId);
    if (!session || !session.page) throw new Error(`No active bot session for meeting ${meetingId}`);

    const admitted = await session.page.evaluate(() => {
      const names = [];

      // Find every individual "Admit" button (one per waiting participant)
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const btn of buttons) {
        const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase().trim();
        // Match "Admit" but not "Admit all" (handled separately below)
        if (label === 'admit' || label.startsWith('admit ')) {
          // Try to read the participant name from nearest labelled ancestor
          const nameEl = btn.closest('[data-participant-id]')
            ?.querySelector('[data-self-name], [data-resolved-name], [jsname="r4nke"]');
          names.push(nameEl?.textContent?.trim() || 'Unknown');
          btn.click();
        }
      }

      // Fallback: "Admit all" button (covers the case where the people panel is open)
      if (names.length === 0) {
        const admitAll = buttons.find((b) =>
          (b.getAttribute('aria-label') || b.textContent || '').toLowerCase().includes('admit all')
        );
        if (admitAll) {
          admitAll.click();
          names.push('(admit-all)');
        }
      }

      return names;
    }).catch((err) => {
      logger.error(`admitWaiting page eval failed: ${err.message}`);
      return [];
    });

    logger.info(`Meeting ${meetingId}: admitted — ${admitted.join(', ') || 'none waiting'}`);
    return admitted;
  }

  /**
   * Stop recording, close browser, convert to MP3, send to Claude.
   * If force=true the page is already gone — use forceStop() on the recorder
   * and process whatever chunks made it to disk.
   *
   * @param {boolean} force - true when page crashed or bot was kicked
   */
  async _endSession(meeting, session, elapsedMs, force = false) {
    const durationSeconds = Math.round(elapsedMs / 1000);

    // ── Stop the recorder ────────────────────────────────────────────────────
    let webmPath;
    if (force) {
      webmPath = session.recorder.forceStop();
    } else {
      try {
        webmPath = await session.recorder.stop();
      } catch (err) {
        logger.error(`Recorder stop error for meeting ${meeting.id}: ${err.message}`);
        webmPath = session.recorder.forceStop(); // use whatever is on disk
      }
    }

    // ── Close browser ────────────────────────────────────────────────────────
    await session.browser.close().catch((err) =>
      logger.error(`Browser close error: ${err.message}`)
    );
    this._active.delete(meeting.id);

    // Release the bot account back into the pool for the next meeting
    this._releaseProfile(session.profileDir);
    logger.info(`Profile released: ${session.profileDir} (${this.availableSlots()}/${BOT_PROFILES.length} slots now free)`);

    // Clean up the per-session Chrome profile directory
    if (session.sessionDir) {
      fs.rm(session.sessionDir, { recursive: true, force: true }, (err) => {
        if (err) logger.warn(`Could not remove session profile dir: ${err.message}`);
      });
    }

    await meeting
      .update({ status: 'processing', ended_at: new Date(), duration_seconds: durationSeconds })
      .catch(() => {});

    // ── Validate the audio file ──────────────────────────────────────────────
    if (!webmPath || !fs.existsSync(webmPath)) {
      logger.error(`Meeting ${meeting.id}: audio file not found — cannot generate MOM`);
      await meeting.update({ status: 'failed' }).catch(() => {});
      return;
    }

    const fileSize = fs.statSync(webmPath).size;
    if (fileSize < 4096) { // < 4 KB means effectively nothing was recorded
      logger.error(`Meeting ${meeting.id}: audio file too small (${fileSize} bytes) — skipping`);
      await meeting.update({ status: 'failed' }).catch(() => {});
      return;
    }

    logger.info(
      `Meeting ${meeting.id} ended. Duration: ${durationSeconds}s. ` +
      `Audio: ${(fileSize / 1024 / 1024).toFixed(1)} MB. Converting to MP3…`
    );

    // ── FFmpeg: webm → mp3 ───────────────────────────────────────────────────
    const mp3Path = webmPath.replace(/\.webm$/i, '.mp3');
    try {
      await ffmpegService.convertVideoToAudio(webmPath, mp3Path);
      await meeting.update({ audio_path: mp3Path }).catch(() => {});
      deleteFile(webmPath);

      logger.info(`MP3 ready → ${mp3Path}. Starting Claude MOM generation…`);

      // ── Claude: transcribe + generate MOM ───────────────────────────────
      const claudeService = require('../services/claude.service');
      await claudeService.generateMOM(meeting.id, mp3Path);

      logger.info(`MOM generation complete for meeting ${meeting.id}`);
    } catch (err) {
      logger.error(`Post-recording pipeline failed for meeting ${meeting.id}: ${err.message}`);
      await meeting.update({ status: 'failed' }).catch(() => {});
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = new MeetBot();
