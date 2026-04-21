const STATUS_LABELS = {
  idle:      'Idle — join a Google Meet to start recording',
  recording: (t) => `🔴 Recording: "${t}"`,
  uploading: (t) => `⬆️ Uploading "${t}" to AI pipeline…`,
  done:      (t) => `✅ MOM being generated for "${t}"`,
  error:     (m) => `❌ ${m || 'Upload failed'}`,
};

async function load() {
  const { apiUrl, jwtToken } = await chrome.storage.sync.get(['apiUrl', 'jwtToken']);
  document.getElementById('apiUrl').value   = apiUrl   || 'http://localhost:5000/api/v1';
  document.getElementById('jwtToken').value = jwtToken || '';

  try {
    const s = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    _renderStatus(s);
  } catch {}
}

document.getElementById('save').addEventListener('click', async () => {
  const apiUrl   = document.getElementById('apiUrl').value.trim().replace(/\/$/, '');
  const jwtToken = document.getElementById('jwtToken').value.trim();
  await chrome.storage.sync.set({ apiUrl, jwtToken });
  const msg = document.getElementById('savedMsg');
  msg.textContent = '✓ Saved!';
  setTimeout(() => { msg.textContent = ''; }, 2000);
});

function _renderStatus(s) {
  if (!s) return;
  const el  = document.getElementById('status');
  const key = s.status || 'idle';
  el.className = `status ${key}`;
  const label = STATUS_LABELS[key];
  el.textContent = typeof label === 'function'
    ? label(s.title || s.message || '')
    : label;
}

load();
