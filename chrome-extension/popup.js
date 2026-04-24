const STATUS_LABELS = {
  idle:      'Idle — join a Google Meet to start recording',
  recording: (t) => `🔴 Recording: "${t}"`,
  uploading: (t) => `⬆️ Uploading "${t}" to AI pipeline…`,
  done:      (t) => `✅ MOM being generated for "${t}"`,
  error:     (m) => `❌ ${m || 'Upload failed'}`,
};

async function load() {
  const { apiUrl, jwtToken, userEmail } = await chrome.storage.sync.get(['apiUrl', 'jwtToken', 'userEmail']);
  document.getElementById('apiUrl').value = apiUrl || 'https://mom.mosaique.work/api/v1';

  if (jwtToken && userEmail) {
    showLoggedIn(userEmail);
  } else {
    showLoginForm();
  }

  try {
    const s = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    _renderStatus(s);
  } catch {}
}

function showLoggedIn(email) {
  document.getElementById('loginForm').style.display   = 'none';
  document.getElementById('loggedInRow').style.display = 'block';
  document.getElementById('loggedInEmail').textContent = email;
}

function showLoginForm() {
  document.getElementById('loginForm').style.display   = 'block';
  document.getElementById('loggedInRow').style.display = 'none';
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const apiUrl   = document.getElementById('apiUrl').value.trim().replace(/\/$/, '');
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const msgEl    = document.getElementById('loginMsg');
  const btn      = document.getElementById('loginBtn');

  if (!apiUrl || !email || !password) {
    msgEl.className = 'msg err';
    msgEl.textContent = 'Fill in all fields.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Logging in…';
  msgEl.textContent = '';

  try {
    const res = await fetch(`${apiUrl}/auth/extension-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

    await chrome.storage.sync.set({ apiUrl, jwtToken: data.token, userEmail: data.user.email });

    msgEl.className = 'msg ok';
    msgEl.textContent = '✓ Logged in!';
    document.getElementById('password').value = '';
    setTimeout(() => showLoggedIn(data.user.email), 600);
  } catch (err) {
    msgEl.className = 'msg err';
    msgEl.textContent = err.message || 'Login failed.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await chrome.storage.sync.remove(['jwtToken', 'userEmail']);
  document.getElementById('email').value    = '';
  document.getElementById('password').value = '';
  document.getElementById('loginMsg').textContent = '';
  showLoginForm();
});

document.getElementById('apiUrl').addEventListener('change', async () => {
  const apiUrl = document.getElementById('apiUrl').value.trim().replace(/\/$/, '');
  await chrome.storage.sync.set({ apiUrl });
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
