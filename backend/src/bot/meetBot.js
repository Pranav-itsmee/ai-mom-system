const fs = require('fs');
const puppeteer = require('puppeteer');
const MeetingRecorder = require('./recorder');
const ffmpegService = require('../services/ffmpeg.service');
const { deleteFile } = require('../utils/fileManager');
const logger = require('../utils/logger');

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
const MONITOR_INTERVAL_MS     = 5_000;               // check every 5 seconds
const ALONE_TIMEOUT_MS        = 60_000;              // leave after 60 s alone

// ─── Dedicated bot Chrome profile ────────────────────────────────────────────
// ONE-TIME SETUP: run the command below, log into pranav.itsmee.official@gmail.com,
// then close Chrome. The bot reuses the saved session automatically after that.
//
//   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=C:\bot-chrome-profile
//
const BOT_PROFILE_DIR = 'C:\\bot-chrome-profile';

// ─── MeetBot singleton ────────────────────────────────────────────────────────
class MeetBot {
  constructor() {
    /** @type {Map<number, { browser, page, recorder, audioPath }>} */
    this._active = new Map();
  }

  async joinMeeting(meeting) {
    if (this._active.has(meeting.id)) {
      logger.warn(`Bot already active for meeting ${meeting.id} — skipping`);
      return;
    }

    logger.info(`Bot joining: "${meeting.title}" (id=${meeting.id})`);
    this._active.set(meeting.id, null);

    let browser;
    try {
      browser = await this._launchBrowser();
      const page = await browser.newPage();

      await browser
        .defaultBrowserContext()
        .overridePermissions('https://meet.google.com', [
          'camera', 'microphone', 'notifications',
        ]);

      await this._ensureLoggedIn(page);

      // Inject RTCPeerConnection hook BEFORE the Meet page loads
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

      const recorder = new MeetingRecorder(page);
      const audioPath = await recorder.start(meeting.id);

      const session = { browser, page, recorder, audioPath };
      this._active.set(meeting.id, session);

      logger.info(`Bot joined meeting ${meeting.id} — recording to ${audioPath}`);
      this._startMonitor(meeting, session);

    } catch (err) {
      logger.error(`Bot failed to join meeting ${meeting.id}: ${err.message}`);
      await meeting.update({ status: 'failed' }).catch(() => {});
      if (browser) await browser.close().catch(() => {});
      this._active.delete(meeting.id);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  async _launchBrowser() {
    return puppeteer.launch({
      headless: false,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      userDataDir: BOT_PROFILE_DIR,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--use-fake-ui-for-media-stream',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
      ],
      defaultViewport: null,
    });
  }

  async _ensureLoggedIn(page) {
    await page.goto('https://accounts.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const url = page.url();
    if (url.includes('accounts.google.com/signin') || url.includes('/v3/signin')) {
      throw new Error(
        'Bot Chrome profile is not signed into Google. ' +
        'Run this command ONCE, log in to pranav.itsmee.official@gmail.com, then close Chrome:\n' +
        '  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir=C:\\bot-chrome-profile'
      );
    }
    logger.info('Bot Chrome profile is signed in — proceeding');
  }

  async _disableInputDevices(page) {
    for (const selectorList of [SELECTORS.muteButton, SELECTORS.cameraButton]) {
      for (const sel of selectorList) {
        try {
          const el = await page.$(sel);
          if (el) {
            const pressed = await page.$eval(sel, (b) => b.getAttribute('aria-pressed'));
            if (pressed === 'true') {
              await el.click();
              logger.debug(`Toggled off: ${sel}`);
            }
            break;
          }
        } catch { /* try next */ }
      }
    }
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

    const intervalHandle = setInterval(async () => {
      try {
        const elapsed = Date.now() - startTime;

        if (elapsed > MAX_MEETING_DURATION_MS) {
          logger.warn(`Meeting ${meeting.id} hit 4-hour cap — leaving`);
          await end(elapsed);
          return;
        }

        const { meetingEnded, alone } = await session.page
          .evaluate((markers) => {
            const body  = document.body?.innerText ?? '';
            const title = document.title ?? '';
            return {
              meetingEnded: (
                markers.some((sel) => !!document.querySelector(sel)) ||
                body.includes('Meeting ended')          ||
                body.includes('This meeting has ended') ||
                body.includes('You left the meeting')   ||
                body.includes("You've left the call")   ||
                body.includes('has ended')              ||
                title.includes('Meeting ended')
              ),
              alone: (
                body.includes("You're the only one here") ||
                body.includes('Only you are in the call') ||
                body.includes('No one else is here')
              ),
            };
          }, SELECTORS.meetingEndedMarkers)
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
