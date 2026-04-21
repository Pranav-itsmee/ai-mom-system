// Runs in the isolated extension world and can use Chrome extension APIs.
// It monitors Google Meet state and talks to hook.js through window.postMessage.

const MEETING_END_PHRASES = [
  'Meeting ended',
  'This meeting has ended',
  'has been ended by',
  'This call has ended',
  'You left the meeting',
  "You've left the call",
  'You left the call',
  'You were removed',
  'Return to home screen',
  'Go back to home',
];

let inMeeting = false;
let meetingTitle = '';
let meetingLink = '';
let joinedAt = null;

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.source !== 'aimom-hook') return;

  if (e.data.type === 'AIMOM_RECORDING_STARTED') {
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'recording', title: meetingTitle });
    chrome.runtime.sendMessage({
      type: 'RECORDING_STARTED',
      title: meetingTitle,
      scheduledAt: joinedAt || new Date().toISOString(),
      meetLink: meetingLink,
    });
  }

  if (e.data.type === 'AIMOM_RECORDING_DONE') {
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'uploading', title: meetingTitle });
    await uploadThroughServiceWorker(e.data);
  }

  if (e.data.type === 'AIMOM_ERROR') {
    console.error('[AI MOM Content]', e.data.error);
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'error', message: e.data.error });
  }
});

function isInCall() {
  return !!(
    document.querySelector('[jsname="haAclf"]') ||
    document.querySelector('[data-call-ended="false"]') ||
    document.querySelector('[jsname="CQylAd"]')
  );
}

function getMeetingTitle() {
  return (
    document.title.replace(/\s*[-\u2013]\s*Google Meet\s*$/i, '').trim() ||
    document.querySelector('[data-meeting-title]')?.textContent?.trim() ||
    'Google Meet Recording'
  );
}

const observer = new MutationObserver(() => {
  const bodyText = document.body?.innerText ?? '';

  if (!inMeeting && isInCall()) {
    inMeeting = true;
    joinedAt = new Date().toISOString();
    meetingTitle = getMeetingTitle();
    meetingLink = window.location.href;
    console.log(`[AI MOM] Host joined meeting: "${meetingTitle}" - starting recording in 3s`);

    setTimeout(() => {
      window.postMessage({ source: 'aimom-content', type: 'AIMOM_START' }, '*');
    }, 3000);
  }

  if (inMeeting && MEETING_END_PHRASES.some((p) => bodyText.includes(p))) {
    inMeeting = false;
    console.log('[AI MOM] Meeting ended - stopping recording and uploading');
    window.postMessage({ source: 'aimom-content', type: 'AIMOM_STOP' }, '*');
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function uploadThroughServiceWorker({ data: base64, mimeType }) {
  try {
    await chrome.runtime.sendMessage({
      type: 'UPLOAD',
      data: base64,
      mimeType,
      title: meetingTitle,
      scheduledAt: joinedAt || new Date().toISOString(),
      meetLink: meetingLink,
    });
  } catch (err) {
    console.error('[AI MOM] Upload dispatch failed:', err.message);
    chrome.runtime.sendMessage({ type: 'STATUS', status: 'error', message: err.message });
  }
}
