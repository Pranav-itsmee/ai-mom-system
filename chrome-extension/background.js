// Service worker — handles status tracking, badge updates, and the actual upload fetch.
// Upload is done here (not in content.js) because service workers have no mixed-content
// restrictions and can reliably reach http://localhost from https://meet.google.com.

let currentStatus = { status: 'idle' };
let resetTimer    = null;

const BADGE = {
  recording: { text: '●', color: '#ef4444' },
  uploading: { text: '↑',  color: '#f59e0b' },
  done:      { text: '✓',  color: '#10b981' },
  error:     { text: '!',  color: '#ef4444' },
  idle:      { text: '',   color: '#6b7280' },
};

async function clearSavedAuth() {
  await chrome.storage.sync.remove(['extensionToken', 'jwtToken', 'user']);
}

async function notifyTokenExpired(message = 'Extension access expired — please set it up again.') {
  await clearSavedAuth();
  try {
    await chrome.runtime.sendMessage({ type: 'TOKEN_EXPIRED', message });
  } catch {}
}

async function getAuthConfig() {
  const { apiUrl, extensionToken, jwtToken } = await chrome.storage.sync.get([
    'apiUrl',
    'extensionToken',
    'jwtToken',
  ]);
  return {
    apiUrl,
    token: extensionToken || jwtToken || null,
  };
}

function setStatus(msg) {
  currentStatus = msg;
  const b = BADGE[msg.status] ?? BADGE.idle;
  chrome.action.setBadgeText({ text: b.text });
  chrome.action.setBadgeBackgroundColor({ color: b.color });

  // Auto-reset to idle after done or error so the badge doesn't stick forever
  if (resetTimer) clearTimeout(resetTimer);
  if (msg.status === 'done' || msg.status === 'error') {
    resetTimer = setTimeout(() => {
      currentStatus = { status: 'idle' };
      chrome.action.setBadgeText({ text: '' });
      resetTimer = null;
    }, 5 * 60 * 1000); // 5 minutes
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // ── Status update from content.js ──────────────────────────────────────────
  if (msg.type === 'STATUS') {
    setStatus(msg);

    if (msg.status === 'done') {
      chrome.notifications.create({
        type:    'basic',
        iconUrl: 'icon.png',
        title:   'AI MOM Ready',
        message: `MOM is being generated for "${msg.title || 'your meeting'}"`,
      });
    }
    if (msg.status === 'error') {
      chrome.notifications.create({
        type:    'basic',
        iconUrl: 'icon.png',
        title:   'AI MOM — Upload Failed',
        message: msg.message || 'Unknown error',
      });
    }
  }

  // ── Popup requests current status ─────────────────────────────────────────
  if (msg.type === 'GET_STATUS') {
    sendResponse(currentStatus);
    return true;
  }

  if (msg.type === 'RECORDING_STARTED') {
    setStatus({ status: 'recording', title: msg.title });

    getAuthConfig().then(({ apiUrl, token }) => {
      if (!apiUrl || !token) {
        setStatus({ status: 'error', message: 'Not logged in — open the AI MOM extension and log in' });
        notifyTokenExpired();
        return;
      }

      fetch(`${apiUrl}/meetings/extension/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title:        msg.title || 'Google Meet Recording',
          scheduled_at: msg.scheduledAt || new Date().toISOString(),
          meet_link:    msg.meetLink,
          participants: msg.participants || [],
        }),
      })
        .then(async (res) => {
          if (res.status === 401) { notifyTokenExpired(); throw new Error('Session expired'); }
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Server ${res.status}`);
          }
          return res.json();
        })
        .then(() => {
          console.log('[AI MOM] Backend meeting marked as recording');
        })
        .catch((err) => {
          console.error('[AI MOM] Failed to mark recording:', err.message);
          setStatus({ status: 'error', message: err.message });
        });
    });

    sendResponse({ ok: true });
    return true;
  }

  // ── Content script delegates the upload here ──────────────────────────────
  // This avoids mixed-content issues (https meet.google.com → http localhost).
  if (msg.type === 'UPLOAD') {
    setStatus({ status: 'uploading', title: msg.title });

    getAuthConfig().then(({ apiUrl, token }) => {
      if (!apiUrl || !token) {
        setStatus({ status: 'error', message: 'Not configured — open the AI MOM popup and set up the extension' });
        notifyTokenExpired();
        return;
      }

      // base64 → Uint8Array → Blob
      const binary = atob(msg.data);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: msg.mimeType });

      const form = new FormData();
      form.append('file',         blob, 'recording.webm');
      form.append('title',        msg.title       || 'Google Meet Recording');
      form.append('scheduled_at', msg.scheduledAt || new Date().toISOString());
      if (msg.meetLink)      form.append('meet_link',    msg.meetLink);
      if (msg.platform)      form.append('platform',     msg.platform);
      if (msg.participants?.length) form.append('participants', JSON.stringify(msg.participants));

      fetch(`${apiUrl}/meetings/upload`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      })
        .then(async (res) => {
          if (res.status === 401) {
            notifyTokenExpired();
            throw new Error('Extension access expired');
          }
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Server ${res.status}`);
          }
          return res.json();
        })
        .then(() => {
          console.log('[AI MOM] Upload successful');
          setStatus({ status: 'done', title: msg.title });
        })
        .catch((err) => {
          console.error('[AI MOM] Upload failed:', err.message);
          setStatus({ status: 'error', message: err.message });
        });
    });

    sendResponse({ ok: true });
    return true; // keep message channel open for async
  }
});
