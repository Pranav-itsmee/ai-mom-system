// Runs in the isolated extension world — monitors meeting state and relays
// messages between hook.js (MAIN world) and background.js (service worker).
// Works across Google Meet, Microsoft Teams, and Zoom web client.

// ── Platform detection ────────────────────────────────────────────────────────

const PLATFORM_CONFIG = {
  meet: {
    label: 'Google Meet',
    isInCall: () =>
      !!(document.querySelector('[jsname="haAclf"]') ||
         document.querySelector('[data-call-ended="false"]') ||
         document.querySelector('[jsname="CQylAd"]')),
    getTitle: () =>
      document.title.replace(/\s*[-–]\s*Google Meet\s*$/i, '').trim() ||
      document.querySelector('[data-meeting-title]')?.textContent?.trim() ||
      'Google Meet Recording',
    endPhrases: [
      'Meeting ended', 'This meeting has ended', 'has been ended by',
      'This call has ended', 'You left the meeting', "You've left the call",
      'You left the call', 'You were removed', 'Return to home screen',
    ],
    // Scrape participant names (and emails where accessible) from the Meet UI.
    // Meet shows names on video tiles; emails only appear for Workspace accounts
    // via data-hovercard-id attributes.
    getParticipants: () => {
      const found = new Map();
      // Video tiles — always rendered during a call
      document.querySelectorAll('[data-participant-id]').forEach(el => {
        const name = (
          el.querySelector('[data-self-name]')?.textContent ||
          el.querySelector('[jsname="EydYod"]')?.textContent ||
          el.querySelector('[jsname="rxQTgd"]')?.textContent
        )?.trim();
        if (!name || name.length < 2) return;
        // Workspace accounts sometimes expose email via hovercard id
        const hovercard = el.querySelector('[data-hovercard-id]')?.getAttribute('data-hovercard-id') || '';
        const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(hovercard) ? hovercard : null;
        const existing = found.get(name);
        found.set(name, { name, email: existing?.email || email || null });
      });
      // People panel (if open) — may reveal more names
      document.querySelectorAll('[data-requested-participant-id]').forEach(el => {
        const name = (
          el.querySelector('[jsname="DnM5Nc"]')?.textContent ||
          el.querySelector('[data-name]')?.getAttribute('data-name')
        )?.trim();
        if (name && name.length >= 2 && !found.has(name)) {
          found.set(name, { name, email: null });
        }
      });
      return [...found.values()];
    },
  },

  teams: {
    label: 'Microsoft Teams',
    isInCall: () =>
      !!(document.querySelector('[data-tid="hangup-btn"]') ||
         document.querySelector('[data-tid="mute-button"]') ||
         document.querySelector('[aria-label="Leave"]') ||
         /\/(meet|meeting|call)\//.test(location.pathname) ||
         location.search.includes('meetingjoin')),
    getTitle: () =>
      document.querySelector('[data-tid="meet-page-header-title"]')?.textContent?.trim() ||
      document.querySelector('[class*="meeting-title"]')?.textContent?.trim() ||
      document.title.replace(/\s*\|\s*Microsoft Teams\s*$/i, '').trim() ||
      'Teams Meeting',
    endPhrases: [
      'You left the meeting', 'The meeting has ended', 'This call has ended',
      'Meeting ended', 'left the call', 'call has ended', 'The call ended',
    ],
    // Teams roster uses stable data-tid attributes.
    // Emails sometimes appear in the secondary text for org members.
    getParticipants: () => {
      const found = new Map();
      document.querySelectorAll(
        '[data-tid="roster-participant"], [data-tid="call-roster-participant"], [data-tid="participant-item"]'
      ).forEach(el => {
        const name = (
          el.querySelector('[data-tid="roster-participant-name"]')?.textContent ||
          el.querySelector('[data-tid="participant-item-name"]')?.textContent ||
          el.querySelector('[class*="participant-name"]')?.textContent
        )?.trim();
        if (!name || name.length < 2) return;
        // Subtitle sometimes contains email for org/AAD accounts
        const subtitle = (
          el.querySelector('[data-tid="roster-participant-secondary-text"]')?.textContent ||
          el.querySelector('[class*="participant-subtitle"]')?.textContent
        )?.trim() || '';
        const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(subtitle) ? subtitle : null;
        found.set(name, { name, email });
      });
      return [...found.values()];
    },
  },

  zoom: {
    label: 'Zoom',
    // URL /wc/{id}/start (host) or /wc/{id}/join (participant) = actively in a meeting.
    // DOM selectors are a fallback — Zoom's WebAssembly UI loads after document_idle.
    isInCall: () =>
      /\/wc\/\d+\/(start|join)/.test(location.pathname) ||
      !!(document.querySelector('[aria-label="Leave"]') ||
         document.querySelector('[aria-label="End"]') ||
         document.querySelector('[aria-label="End Meeting"]') ||
         document.querySelector('[class*="footer__btns-container"]')),
    getTitle: () =>
      // document.title is reliable: "Pranav's Zoom Meeting" etc.
      document.title.replace(/^\s*Zoom\s*[-|]?\s*/i, '').trim() ||
      document.querySelector('[class*="meeting-topic"]')?.textContent?.trim() ||
      'Zoom Meeting',
    endPhrases: [
      'This meeting has been ended by the host', 'Meeting is over',
      'You have left the meeting', 'The meeting has ended',
      'meeting has ended', 'left the meeting', 'Thank you for joining',
    ],
    // Zoom's web client shows participant names in the participants panel.
    // Emails are never exposed in the Zoom web UI.
    getParticipants: () => {
      const found = new Map();
      document.querySelectorAll(
        '[class*="participants-item"], [class*="participant-item"]'
      ).forEach(el => {
        const name = (
          el.querySelector('[class*="participants-item__name"]')?.textContent ||
          el.querySelector('[class*="participant__name"]')?.textContent ||
          el.querySelector('[class*="displayName"]')?.textContent
        )?.trim();
        if (!name || name.length < 2) return;
        found.set(name, { name, email: null });
      });
      return [...found.values()];
    },
  },
};

function detectPlatform() {
  const host = location.hostname;
  if (host === 'meet.google.com')                        return 'meet';
  if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'teams';
  if (host === 'app.zoom.us')                            return 'zoom';
  return null;
}

const platformKey = detectPlatform();
const platform    = PLATFORM_CONFIG[platformKey];

if (!platform) {
  console.warn('[AI MOM] Unknown platform — content script inactive');
}

// ── State ─────────────────────────────────────────────────────────────────────

let inMeeting      = false;
let meetingTitle   = '';
let meetingLink    = '';
let joinedAt       = null;
let participantMap = new Map(); // name → {name, email}

// ── Participant scraping ──────────────────────────────────────────────────────

function scanParticipants() {
  if (!inMeeting || !platform?.getParticipants) return;
  platform.getParticipants().forEach(p => {
    const existing = participantMap.get(p.name);
    if (!existing) {
      participantMap.set(p.name, p);
    } else if (p.email && !existing.email) {
      // Upgrade name-only entry with email if we now see it
      participantMap.set(p.name, { ...existing, email: p.email });
    }
  });
}

// Scan every 30 s — catches participants who open/close their panel mid-meeting
setInterval(scanParticipants, 30_000);

// ── End detection helpers ─────────────────────────────────────────────────────

// Zoom/Teams use WebAssembly/SPA UI — end phrases may never appear in the DOM.
// Poll isInCall() every 3s as a reliable fallback for URL-based end detection.
let endPollTimer = null;

function stopRecording(reason) {
  if (!inMeeting) return;
  inMeeting = false;
  clearInterval(endPollTimer);
  endPollTimer = null;
  console.log(`[AI MOM] ${platform.label} meeting ended (${reason}) — stopping recording`);
  window.postMessage({ source: 'aimom-content', type: 'AIMOM_STOP' }, '*');
}

function startEndPoll() {
  if (endPollTimer) return;
  endPollTimer = setInterval(() => {
    if (!inMeeting) { clearInterval(endPollTimer); endPollTimer = null; return; }
    if (!platform.isInCall()) stopRecording('poll');
  }, 3000);
}

// ── hook.js → content.js messages ────────────────────────────────────────────

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.source !== 'aimom-hook') return;

  if (e.data.type === 'AIMOM_RECORDING_STARTED') {
    // Prefer the URL captured at document_start (hook.js) — for Teams this is the real
    // meeting join link before the SPA navigates away to /v2/.
    if (e.data.originalUrl && e.data.originalUrl !== window.location.href) {
      meetingLink = e.data.originalUrl;
    }
    scanParticipants();
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'recording', title: meetingTitle, platform: platform?.label });
    chrome.runtime.sendMessage({
      type:         'RECORDING_STARTED',
      title:        meetingTitle,
      scheduledAt:  joinedAt || new Date().toISOString(),
      meetLink:     meetingLink,
      platform:     platform?.label,
      participants: [...participantMap.values()],
    });
  }

  if (e.data.type === 'AIMOM_RECORDING_DONE') {
    scanParticipants(); // final scan before upload
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'uploading', title: meetingTitle, platform: platform?.label });
    await uploadThroughServiceWorker(e.data);
  }

  if (e.data.type === 'AIMOM_ERROR') {
    console.error('[AI MOM Content]', e.data.error);
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'error', message: e.data.error });
  }
});

// ── DOM observer — detect join / end ─────────────────────────────────────────

const observer = new MutationObserver(() => {
  if (!platform) return;

  const bodyText = document.body?.innerText ?? '';

  if (!inMeeting && platform.isInCall()) {
    inMeeting      = true;
    joinedAt       = new Date().toISOString();
    meetingTitle   = platform.getTitle();
    participantMap = new Map(); // reset for fresh meeting
    // window.location.href may be the SPA shell URL (e.g. teams.live.com/v2/) by this point.
    // The real join link is corrected when AIMOM_RECORDING_STARTED fires with originalUrl from hook.js.
    meetingLink  = window.location.href;
    console.log(`[AI MOM] Joined ${platform.label}: "${meetingTitle}" — recording in 3s`);
    startEndPoll();
    scanParticipants();

    setTimeout(() => {
      window.postMessage({ source: 'aimom-content', type: 'AIMOM_START' }, '*');
    }, 3000);
  }

  if (inMeeting) {
    scanParticipants();
    if (platform.endPhrases.some((p) => bodyText.includes(p))) {
      stopRecording('phrase');
    }
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// ── Upload via service worker ─────────────────────────────────────────────────

async function uploadThroughServiceWorker({ data: base64, mimeType }) {
  try {
    await chrome.runtime.sendMessage({
      type:         'UPLOAD',
      data:         base64,
      mimeType,
      title:        meetingTitle,
      scheduledAt:  joinedAt || new Date().toISOString(),
      meetLink:     meetingLink,
      platform:     platform?.label,
      participants: [...participantMap.values()],
    });
  } catch (err) {
    console.error('[AI MOM] Upload dispatch failed:', err.message);
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'error', message: err.message });
  }
}
