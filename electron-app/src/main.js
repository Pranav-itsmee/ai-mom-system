const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, desktopCapturer } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { findMeetingSource } = require('./meetingDetection');

// ── Store (initialized after app ready so getPath works) ──────────────────────
let store = null;

function initStore() {
  try {
    store = new Store({ name: 'aimom-config' });
    store.store; // trigger read/parse to catch corrupt files early
  } catch {
    try {
      const fs = require('fs');
      const configPath = path.join(app.getPath('userData'), 'aimom-config.json');
      fs.unlinkSync(configPath);
    } catch {}
    store = new Store({ name: 'aimom-config' });
  }
}

// ── Fallback tray icon — teal 16×16 PNG encoded as data URL ──────────────────
const FALLBACK_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h' +
  'AAAAMUlEQVQ4jWNgGAWDGfz/z8BAmMHIyMiAl8GoAaMGjBowasCoAaMGjBowas' +
  'CoAaMGAAC0nwQBnp7V1wAAAABJRU5ErkJggg==';

function makeIcon(filename) {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', filename));
    if (!img.isEmpty()) return img;
  } catch {}
  return nativeImage.createFromDataURL(FALLBACK_ICON);
}

// ── App state ─────────────────────────────────────────────────────────────────
let tray           = null;
let mainWindow     = null;
let detectInterval = null;
let activeMeeting  = null; // truthy when in a meeting
let isQuitting     = false;
let pendingMeeting  = null; // candidate detected but not yet confirmed
let pendingTicks    = 0;    // consecutive ticks the candidate has been seen
let noMeetingTicks  = 0;    // consecutive ticks with no meeting window seen
const CONFIRM_TICKS = 2;   // require 2 consecutive detections (~6s) before starting
const END_TICKS     = 3;   // require 3 consecutive absences (~9s) before stopping — handles Zoom window transitions

// Returns true for generic fallback titles that carry no meeting-specific info
function isGenericTitle(title) {
  return /^(zoom (meeting|webinar)|zoom workplace|google meet|teams meeting|meet|[a-z]{3}-[a-z]{4}-[a-z]{3})$/i.test((title ?? '').trim());
}

// ── Meeting detection ─────────────────────────────────────────────────────────
async function detectMeeting() {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] });
    const found = findMeetingSource(sources);

    if (found) {
      noMeetingTicks = 0; // reset end-grace counter on any detection

      if (!activeMeeting) {
        // Require CONFIRM_TICKS consecutive detections before firing
        if (pendingMeeting && pendingMeeting.id === found.id) {
          pendingTicks++;
        } else {
          pendingMeeting = found;
          pendingTicks = 1;
          console.log(`[AIMOM] Meeting candidate: "${found.title}" (${found.platform}) tick 1/${CONFIRM_TICKS}`);
        }

        if (pendingTicks >= CONFIRM_TICKS) {
          activeMeeting = pendingMeeting;
          pendingMeeting = null;
          pendingTicks = 0;
          const title = activeMeeting.title;
          console.log(`[AIMOM] Meeting confirmed: "${title}" (${activeMeeting.platform})`);
          setTrayStatus('detected');
          wireDisplayMedia(activeMeeting);
          setTimeout(() => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            mainWindow.webContents.send('meeting:start', { title, platform: activeMeeting.platform });
            showMainWindow();
          }, 1000);
        } else {
          console.log(`[AIMOM] Meeting candidate tick ${pendingTicks}/${CONFIRM_TICKS}`);
        }
      } else {
        // Meeting still in progress — upgrade title if a better (non-generic) one appears
        if (found.title !== activeMeeting.title &&
            isGenericTitle(activeMeeting.title) &&
            !isGenericTitle(found.title)) {
          console.log(`[AIMOM] Title upgraded: "${activeMeeting.title}" → "${found.title}"`);
          activeMeeting = { ...activeMeeting, ...found };
          mainWindow?.webContents?.send('meeting:update', { title: found.title, platform: found.platform });
        }
      }

    } else {
      // No meeting window visible this tick
      pendingMeeting = null;
      pendingTicks = 0;

      if (activeMeeting) {
        noMeetingTicks++;
        // Grace period: Zoom/Teams can briefly close their window during transitions.
        // Only declare meeting ended after END_TICKS consecutive absent ticks.
        if (noMeetingTicks >= END_TICKS) {
          console.log('[AIMOM] Meeting ended (confirmed after grace period)');
          activeMeeting = null;
          noMeetingTicks = 0;
          mainWindow?.webContents?.send('meeting:end');
          setTrayStatus('idle');
        } else {
          console.log(`[AIMOM] Meeting window absent tick ${noMeetingTicks}/${END_TICKS} — waiting`);
        }
      }
    }
  } catch (err) {
    // Ignore — detection errors are non-fatal
  }
}

// ── Auto-answer getDisplayMedia with meeting window + loopback audio ──────────
function wireDisplayMedia(meetingSource) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.session.setDisplayMediaRequestHandler((_req, callback) => {
    desktopCapturer.getSources({ types: ['window', 'screen'] })
      .then(sources => {
        const target =
          sources.find(s => s.id === meetingSource.id) ??
          findMeetingSource(sources);
        callback({ video: target ?? sources[0], audio: 'loopback' });
      })
      .catch(() => callback({}));
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function setTrayStatus(status) {
  if (!tray) return;
  const tips = {
    idle:      'AI MOM — Ready to record',
    detected:  'AI MOM — Starting…',
    recording: 'AI MOM — Recording',
    uploading: 'AI MOM — Uploading…',
    done:      'AI MOM — Done',
    error:     'AI MOM — Error',
  };
  tray.setToolTip(tips[status] ?? 'AI MOM');
  tray.setImage(
    ['recording', 'detected'].includes(status)
      ? makeIcon('icon-recording.png')
      : makeIcon('icon.png')
  );
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildMenu() {
  const user       = store?.get('user');
  const loggedIn   = !!store?.get('token');
  return Menu.buildFromTemplate([
    { label: loggedIn ? `${user?.name ?? user?.email ?? 'Signed in'}` : 'Not signed in', enabled: false },
    { type: 'separator' },
    { label: 'Show AI MOM', click: showMainWindow },
    {
      label: 'Open Web App',
      click: () => {
        const url = (store?.get('serverUrl') ?? 'http://localhost:5000/api/v1')
          .replace(/\/api\/v1\/?$/, '').replace(':5000', ':3000');
        shell.openExternal(url);
      },
    },
    {
      label:   'Stop Recording Now',
      enabled: activeMeeting !== null,
      click:   () => { mainWindow?.webContents?.send('meeting:force-stop'); showMainWindow(); },
    },
    { type: 'separator' },
    {
      label:   'Sign Out',
      enabled: loggedIn,
      click:   () => {
        store?.delete('token');
        store?.delete('user');
        showMainWindow();
        mainWindow?.webContents?.send('signed-out');
        setTrayStatus('idle');
        tray.setContextMenu(buildMenu());
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  400,
    height: 540,
    title:  'AI MOM',
    show:   false,
    frame:  true,
    resizable:   false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: '#0F172A',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!store?.get('token')) {
      mainWindow.webContents.send('show-login');
    } else {
      mainWindow.webContents.send('show-idle', {
        user:      store.get('user'),
        serverUrl: store.get('serverUrl'),
      });
    }
  });
}

function createTray() {
  tray = new Tray(makeIcon('icon.png'));
  tray.setToolTip('AI MOM — Ready to record');
  tray.setContextMenu(buildMenu());

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
      return;
    }
    // Position near the tray icon
    const { screen } = require('electron');
    const tb = tray.getBounds();
    const wb = mainWindow.getBounds();
    const wa = screen.getPrimaryDisplay().workArea;
    const x  = Math.min(Math.max(Math.round(tb.x + tb.width / 2 - wb.width / 2), wa.x), wa.x + wa.width - wb.width);
    const y  = tb.y > wa.height / 2 ? tb.y - wb.height - 4 : tb.y + tb.height + 4;
    mainWindow.setPosition(x, y);
    showMainWindow();
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────────
function registerIPC() {
  ipcMain.handle('get-store',     (_e, k)    => store?.get(k));
  ipcMain.handle('set-store',     (_e, k, v) => store?.set(k, v));
  ipcMain.handle('delete-store',  (_e, k)    => store?.delete(k));
  ipcMain.handle('open-external', (_e, url)  => shell.openExternal(url));

  ipcMain.on('recording-status', (_e, status) => {
    setTrayStatus(status);
    tray?.setContextMenu(buildMenu());
  });
  ipcMain.on('recording-done', () => {
    activeMeeting = null;
    setTrayStatus('idle');
    tray?.setContextMenu(buildMenu());
  });
  // Probe failed (pre-join / idle window) — reset so next real window can be detected
  ipcMain.on('probe-cancelled', () => {
    activeMeeting  = null;
    pendingMeeting = null;
    pendingTicks   = 0;
    noMeetingTicks = 0;
    setTrayStatus('idle');
    tray?.setContextMenu(buildMenu());
    console.log('[AIMOM] Probe cancelled — reset detection state');
  });
  ipcMain.on('window-hide', () => mainWindow?.hide());
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }

  initStore();
  registerIPC();
  createWindow();
  createTray();

  // Always show on launch so login/settings are discoverable during setup.
  mainWindow.center();
  mainWindow.show();
  mainWindow.focus();

  detectInterval = setInterval(detectMeeting, 3000);
});

app.on('second-instance', showMainWindow);
app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { if (detectInterval) clearInterval(detectInterval); });

if (process.platform === 'darwin') {
  app.whenReady().then(() => { if (app.dock) app.dock.hide(); });
}
