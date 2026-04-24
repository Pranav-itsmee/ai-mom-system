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

let inMeeting    = false;
let meetingTitle = '';
let meetingLink  = '';
let joinedAt     = null;

// ── hook.js → content.js messages ────────────────────────────────────────────

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.source !== 'aimom-hook') return;

  if (e.data.type === 'AIMOM_RECORDING_STARTED') {
    // Prefer the URL captured at document_start (hook.js) — for Teams this is the real
    // meeting join link before the SPA navigates away to /v2/.
    if (e.data.originalUrl && e.data.originalUrl !== window.location.href) {
      meetingLink = e.data.originalUrl;
    }
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'recording', title: meetingTitle, platform: platform?.label });
    chrome.runtime.sendMessage({
      type: 'RECORDING_STARTED',
      title:       meetingTitle,
      scheduledAt: joinedAt || new Date().toISOString(),
      meetLink:    meetingLink,
      platform:    platform?.label,
    });
  }

  if (e.data.type === 'AIMOM_RECORDING_DONE') {
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'uploading', title: meetingTitle, platform: platform?.label });
    await uploadThroughServiceWorker(e.data);
  }

  if (e.data.type === 'AIMOM_ERROR') {
    console.error('[AI MOM Content]', e.data.error);
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'error', message: e.data.error });
  }
});

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

// ── DOM observer — detect join / end ─────────────────────────────────────────

const observer = new MutationObserver(() => {
  if (!platform) return;

  const bodyText = document.body?.innerText ?? '';

  if (!inMeeting && platform.isInCall()) {
    inMeeting    = true;
    joinedAt     = new Date().toISOString();
    meetingTitle = platform.getTitle();
    // window.location.href may be the SPA shell URL (e.g. teams.live.com/v2/) by this point.
    // The real join link is corrected when AIMOM_RECORDING_STARTED fires with originalUrl from hook.js.
    meetingLink  = window.location.href;
    console.log(`[AI MOM] Joined ${platform.label}: "${meetingTitle}" — recording in 3s`);
    startEndPoll();

    setTimeout(() => {
      window.postMessage({ source: 'aimom-content', type: 'AIMOM_START' }, '*');
    }, 3000);
  }

  if (inMeeting && platform.endPhrases.some((p) => bodyText.includes(p))) {
    stopRecording('phrase');
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
      type:        'UPLOAD',
      data:        base64,
      mimeType,
      title:       meetingTitle,
      scheduledAt: joinedAt || new Date().toISOString(),
      meetLink:    meetingLink,
      platform:    platform?.label,
    });
  } catch (err) {
    console.error('[AI MOM] Upload dispatch failed:', err.message);
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'error', message: err.message });
  }
}
