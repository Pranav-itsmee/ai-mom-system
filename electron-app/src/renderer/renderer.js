// AI MOM Desktop — Renderer Process
// Handles: login, MediaRecorder, upload, screen navigation

const api = window.electronAPI;

// ── State ─────────────────────────────────────────────────────────────────────
let mediaRecorder  = null;
let displayStream  = null;   // full stream (keeps system audio alive)
let chunks         = [];
let timerInterval  = null;
let elapsedSeconds = 0;
let currentMeeting = null;   // { title, platform, startedAt }
let lastMeetingId  = null;   // meeting ID from upload response
let silenceAudioCtx = null;
let silenceInterval = null;

const SILENCE_STOP_AFTER_MS = 90_000;
const SILENCE_GRACE_MS = 30_000;
const SILENCE_RMS_THRESHOLD = 0.012;
const SILENCE_ABORT_NO_AUDIO_MS = 35_000; // abort if no audio at all (pre-join screen)

// ── Screen management ─────────────────────────────────────────────────────────
const SCREENS = ['login', 'idle', 'recording', 'uploading', 'done', 'error', 'settings'];

function showScreen(name) {
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  elapsedSeconds = 0;
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    const h = Math.floor(m / 60);
    const el = document.getElementById('rec-timer');
    if (el) {
      if (h > 0) {
        el.textContent = `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      } else {
        el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return candidates.find(m => {
    try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
  }) ?? '';
}

function showError(msg) {
  const el = document.getElementById('error-detail');
  if (el) el.textContent = msg;
  showScreen('error');
  api.sendStatus('error');
}

function stopSilenceMonitor() {
  if (silenceInterval) {
    clearInterval(silenceInterval);
    silenceInterval = null;
  }
  if (silenceAudioCtx) {
    silenceAudioCtx.close().catch(() => {});
    silenceAudioCtx = null;
  }
}

function abortRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  console.log('[AIMOM] Aborting — no audio detected (likely pre-join screen)');
  stopTimer();
  stopSilenceMonitor();
  mediaRecorder.onstop = () => {
    if (displayStream) { displayStream.getTracks().forEach(t => t.stop()); displayStream = null; }
    mediaRecorder = null;
    chunks = [];
    currentMeeting = null;
  };
  try { mediaRecorder.stop(); } catch {}
  showIdleScreen();
  api.sendStatus('idle');
}

function startSilenceMonitor(stream) {
  stopSilenceMonitor();

  try {
    silenceAudioCtx = new AudioContext();
    const source = silenceAudioCtx.createMediaStreamSource(stream);
    const analyser = silenceAudioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = Date.now();
    let heardAudio = false;
    let silentSince = null;

    silenceInterval = setInterval(() => {
      if (!mediaRecorder || mediaRecorder.state !== 'recording') {
        stopSilenceMonitor();
        return;
      }

      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);

      if (rms >= SILENCE_RMS_THRESHOLD) {
        heardAudio = true;
        silentSince = null;
        return;
      }

      const elapsed = Date.now() - startedAt;

      // Abort early if we've never heard any audio — user hasn't actually joined yet
      if (!heardAudio && elapsed >= SILENCE_ABORT_NO_AUDIO_MS) {
        abortRecording();
        return;
      }

      if (elapsed < SILENCE_GRACE_MS || !heardAudio) return;
      if (!silentSince) {
        silentSince = Date.now();
        return;
      }
      if (Date.now() - silentSince >= SILENCE_STOP_AFTER_MS) {
        console.log('[AIMOM] Sustained silence detected; stopping recording');
        triggerStop();
      }
    }, 1000);
  } catch (err) {
    console.warn('[AIMOM] Silence monitor unavailable:', err?.message ?? err);
  }
}

// ── Recording ─────────────────────────────────────────────────────────────────
async function startRecording(meetingData) {
  currentMeeting = {
    title:     meetingData.title     ?? 'Meeting',
    platform:  meetingData.platform  ?? 'Unknown',
    startedAt: new Date(),
  };
  chunks = [];

  // Update recording screen text
  const platEl = document.getElementById('rec-platform');
  const titleEl = document.getElementById('rec-title');
  if (platEl)  platEl.textContent  = currentMeeting.platform;
  if (titleEl) titleEl.textContent = currentMeeting.title;

  showScreen('recording');
  api.sendStatus('recording');
  startTimer();

  try {
    // Main process has wired setDisplayMediaRequestHandler to auto-answer with the
    // meeting window source + loopback audio — so this call shows NO picker dialog
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1, width: 320, height: 240 },
      audio: { systemAudio: 'include' },
    });

    // Check we actually got audio tracks
    if (displayStream.getAudioTracks().length === 0) {
      stopTimer();
      displayStream.getTracks().forEach(t => t.stop());
      displayStream = null;
      showError('No audio captured. System audio may not be available on this platform.');
      return;
    }

    // Record only the audio — no video data in the file
    const audioOnlyStream = new MediaStream(displayStream.getAudioTracks());
    const mimeType = pickMimeType();
    startSilenceMonitor(audioOnlyStream);

    mediaRecorder = new MediaRecorder(
      audioOnlyStream,
      mimeType ? { mimeType } : undefined,
    );

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    // Handle user clicking "Stop sharing" in the browser's share bar
    displayStream.getVideoTracks().forEach(t => {
      t.addEventListener('ended', () => triggerStop());
    });
    displayStream.getAudioTracks().forEach(t => {
      t.addEventListener('ended', () => triggerStop());
    });

    mediaRecorder.start(10_000); // 10s timeslices

  } catch (err) {
    stopTimer();
    stopSilenceMonitor();
    if (displayStream) { displayStream.getTracks().forEach(t => t.stop()); displayStream = null; }
    const msg = err?.name === 'NotAllowedError'
      ? 'Permission denied for audio capture.'
      : (err?.message ?? 'Unknown error starting recording.');
    showError(msg);
  }
}

function triggerStop() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  stopTimer();
  stopSilenceMonitor();
  showScreen('uploading');
  api.sendStatus('uploading');

  mediaRecorder.onstop = async () => {
    // Stop all tracks AFTER recorder has finalized
    if (displayStream) {
      displayStream.getTracks().forEach(t => t.stop());
      displayStream = null;
    }
    await uploadRecording();
  };

  mediaRecorder.stop();
}

// ── Upload ────────────────────────────────────────────────────────────────────
async function uploadRecording() {
  const blob = new Blob(chunks, {
    type: mediaRecorder?.mimeType || 'audio/webm',
  });
  chunks = [];

  if (blob.size === 0) {
    showError('The recording was empty — no audio was captured.');
    return;
  }

  const serverUrl = await api.getStore('serverUrl') ?? 'http://localhost:5000/api/v1';
  const token     = await api.getStore('token');

  const ext  = blob.type.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('title',        currentMeeting.title);
  form.append('scheduled_at', currentMeeting.startedAt.toISOString());
  form.append('location',     currentMeeting.platform);
  form.append('platform',     currentMeeting.platform);
  form.append('file',         blob, `recording.${ext}`);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${serverUrl}/meetings/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      const fill = document.getElementById('progress-fill');
      const text = document.getElementById('progress-text');
      if (fill) fill.style.width = `${pct}%`;
      if (text) text.textContent = `${pct}%`;
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          lastMeetingId = data?.meeting?.id ?? null;
        } catch {}

        // Save last meeting info
        await api.setStore('lastMeeting', {
          title: currentMeeting.title,
          date:  currentMeeting.startedAt.toISOString(),
          id:    lastMeetingId,
        });

        api.sendDone();
        showDoneScreen();
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try {
          const err = JSON.parse(xhr.responseText);
          if (err?.error) msg = err.error;
        } catch {}
        showError(msg);
      }
    };

    xhr.onerror = () => showError('Network error. Check your connection and try again.');

    xhr.send(form);

  } catch (err) {
    showError(err?.message ?? 'Upload failed.');
  }
}

function showDoneScreen() {
  const el = document.getElementById('done-title');
  if (el) el.textContent = currentMeeting.title;
  showScreen('done');
  api.sendStatus('done');
  currentMeeting = null;
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const serverUrl = document.getElementById('server-url').value.trim().replace(/\/$/, '');
  const email     = document.getElementById('email').value.trim();
  const password  = document.getElementById('password').value;
  const errEl     = document.getElementById('login-error');

  if (!serverUrl || !email || !password) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btn-login');
  btn.textContent = 'Signing in…';
  btn.disabled = true;
  errEl.classList.add('hidden');

  try {
    const res = await fetch(`${serverUrl}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? data?.message ?? 'Login failed');
    }

    await api.setStore('token',     data.token);
    await api.setStore('serverUrl', serverUrl);
    await api.setStore('user',      data.user ?? { email });

    showIdleScreen({ user: data.user ?? { email }, serverUrl });

  } catch (err) {
    errEl.textContent = err.message ?? 'Login failed. Check your credentials.';
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}

// ── Idle screen ───────────────────────────────────────────────────────────────
async function showIdleScreen(data) {
  const user      = data?.user      ?? await api.getStore('user');
  const serverUrl = data?.serverUrl ?? await api.getStore('serverUrl');

  const userEl = document.getElementById('idle-user');
  if (userEl) userEl.textContent = user?.name ?? user?.email ?? '';

  // Show last meeting if exists
  const last = await api.getStore('lastMeeting');
  if (last) {
    const lastEl = document.getElementById('last-meeting');
    if (lastEl) {
      lastEl.classList.remove('hidden');
      const titleEl = document.getElementById('last-meeting-title');
      const dateEl  = document.getElementById('last-meeting-date');
      if (titleEl) titleEl.textContent = last.title ?? '';
      if (dateEl) {
        dateEl.textContent = last.date
          ? new Date(last.date).toLocaleString()
          : '';
      }
    }
  }

  showScreen('idle');
  api.sendStatus('idle');
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function showSettingsScreen() {
  const serverUrl = await api.getStore('serverUrl') ?? '';
  const user      = await api.getStore('user');

  const serverEl = document.getElementById('settings-server-url');
  const userEl   = document.getElementById('settings-user-email');
  if (serverEl) serverEl.value    = serverUrl;
  if (userEl)   userEl.textContent = user?.name ?? user?.email ?? 'Unknown';

  showScreen('settings');
}

async function saveSettings() {
  const serverUrl = document.getElementById('settings-server-url').value.trim().replace(/\/$/, '');
  if (serverUrl) await api.setStore('serverUrl', serverUrl);
  showIdleScreen();
}

async function signOut() {
  await api.deleteStore('token');
  await api.deleteStore('user');
  showScreen('login');
  api.sendStatus('idle');
}

// ── Open web app ──────────────────────────────────────────────────────────────
async function openWebApp(meetingId) {
  const serverUrl = await api.getStore('serverUrl') ?? 'http://localhost:5000/api/v1';
  let frontendUrl = serverUrl
    .replace(/\/api\/v1\/?$/, '')
    .replace(':5000', ':3000');

  if (meetingId) frontendUrl += `/meetings/${meetingId}`;

  // Open in the system's default browser via main process IPC
  api.openExternal(frontendUrl);
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Login
  document.getElementById('btn-login')?.addEventListener('click', handleLogin);
  document.getElementById('password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Idle
  document.getElementById('btn-settings')?.addEventListener('click', showSettingsScreen);
  document.getElementById('btn-open-web')?.addEventListener('click', () => openWebApp(null));

  // Recording
  document.getElementById('btn-stop')?.addEventListener('click', triggerStop);

  // Done
  document.getElementById('btn-view-mom')?.addEventListener('click', () => openWebApp(lastMeetingId));
  document.getElementById('btn-done-dismiss')?.addEventListener('click', () => showIdleScreen());

  // Error
  document.getElementById('btn-error-retry')?.addEventListener('click', () => showIdleScreen());
  document.getElementById('btn-error-dismiss')?.addEventListener('click', () => showIdleScreen());

  // Settings
  document.getElementById('btn-settings-close')?.addEventListener('click', () => showIdleScreen());
  document.getElementById('btn-save-settings')?.addEventListener('click', saveSettings);
  document.getElementById('btn-signout')?.addEventListener('click', signOut);
});

// ── IPC events from main process ──────────────────────────────────────────────
api.onShowLogin(()         => showScreen('login'));
api.onShowIdle((data)      => showIdleScreen(data));
api.onShowSettings(()      => showSettingsScreen());
api.onSignedOut(()         => showScreen('login'));

api.onMeetingStart((data)  => {
  // Only start if not already recording or uploading
  const activeScreen = [...document.querySelectorAll('.screen')]
    .find(el => !el.classList.contains('hidden'))?.id ?? '';
  if (activeScreen === 'screen-recording' || activeScreen === 'screen-uploading') return;
  startRecording(data);
});

api.onMeetingEnd(()        => triggerStop());
api.onForceStop(()         => triggerStop());
