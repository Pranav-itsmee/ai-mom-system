const STATUS_LABELS = {
  idle:      'Idle — join a Google Meet, Teams or Zoom to start',
  recording: (t, p) => `🔴 Recording${p ? ` [${p}]` : ''}: "${t}"`,
  uploading: (t) => `⬆️ Uploading "${t}" to AI pipeline…`,
  done:      (t) => `✅ MOM being generated for "${t}"`,
  error:     (m) => `❌ ${m || 'Upload failed'}`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name = '') {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function showLogin() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('main-view').style.display  = 'none';
}

function showMain(user, apiUrl) {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('main-view').style.display  = 'block';

  document.getElementById('avatar').textContent     = initials(user.name);
  document.getElementById('user-name').textContent  = user.name;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('server-display').textContent = apiUrl;
  document.getElementById('new-server-url').value   = apiUrl;
}

function renderStatus(s) {
  if (!s) return;
  const el  = document.getElementById('status');
  const key = s.status || 'idle';
  el.className = `status ${key}`;
  const label = STATUS_LABELS[key];
  el.textContent = typeof label === 'function'
    ? label(s.title || s.message || '', s.platform)
    : (label || 'Idle');
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  const { apiUrl, extensionToken, jwtToken, user } = await chrome.storage.sync.get([
    'apiUrl',
    'extensionToken',
    'jwtToken',
    'user',
  ]);
  const token = extensionToken || jwtToken;

  // Pre-fill API URL in login form
  document.getElementById('apiUrl').value = apiUrl || 'https://mom.mosaique.work/api/v1';

  if (token && user) {
    showMain(user, apiUrl);
    try {
      const s = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      renderStatus(s);
    } catch {}
  } else {
    showLogin();
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

document.getElementById('login-btn').addEventListener('click', async () => {
  const apiUrl   = document.getElementById('apiUrl').value.trim().replace(/\/$/, '');
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errEl    = document.getElementById('login-err');
  const btn      = document.getElementById('login-btn');

  errEl.textContent = '';
  if (!apiUrl || !email || !password) {
    errEl.textContent = 'Please fill in all fields.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Setting up…';

  try {
    const res = await fetch(`${apiUrl}/auth/extension-login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || `Error ${res.status}`);
    }

    // Persist the extension-specific token so setup is one-time on this browser.
    await chrome.storage.sync.set({
      apiUrl,
      extensionToken: data.token,
      user:           { name: data.user?.name || email, email: data.user?.email || email },
    });
    await chrome.storage.sync.remove(['jwtToken']);

    document.getElementById('password').value = '';
    showMain({ name: data.user?.name || email, email: data.user?.email || email }, apiUrl);

  } catch (err) {
    errEl.textContent = err.message.includes('Failed to fetch')
      ? 'Cannot reach server — check the URL.'
      : (err.message || 'Login failed');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Set Up Extension';
  }
});

// Allow pressing Enter in password field to submit
document.getElementById('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});

// ── Logout ────────────────────────────────────────────────────────────────────

document.getElementById('logout-btn').addEventListener('click', async () => {
  await chrome.storage.sync.remove(['extensionToken', 'jwtToken', 'user']);
  showLogin();
});

// ── Change server (inline) ────────────────────────────────────────────────────

document.getElementById('change-server-btn').addEventListener('click', () => {
  const ed = document.getElementById('server-edit');
  ed.style.display = ed.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('save-server-btn').addEventListener('click', async () => {
  const newUrl = document.getElementById('new-server-url').value.trim().replace(/\/$/, '');
  if (!newUrl) return;
  // Update stored URL and clear token so user must re-login to the new server
  await chrome.storage.sync.set({ apiUrl: newUrl });
  await chrome.storage.sync.remove(['extensionToken', 'jwtToken', 'user']);
  document.getElementById('apiUrl').value = newUrl;
  document.getElementById('server-edit').style.display = 'none';
  showLogin();
});

// ── Listen for token-expired message from background ─────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOKEN_EXPIRED') {
    chrome.storage.sync.remove(['extensionToken', 'jwtToken', 'user']);
    showLogin();
    document.getElementById('login-err').textContent = msg.message || 'Extension access expired — please set it up again.';
  }
});

boot();
