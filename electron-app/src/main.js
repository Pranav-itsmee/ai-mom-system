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

// ── Meeting detection patterns ────────────────────────────────────────────────
// Google Meet window titles by browser:
//   Chrome / Edge / Brave / Opera : "Meet - Title - BrowserName"   (hyphen)
//   Firefox                        : "Meet - Title — Mozilla Firefox"  (em dash U+2014)
//   Popped-out window              : "Meet - abc-defg-hij"  (no browser suffix)
const MEETING_PATTERNS = [
  // Zoom desktop
  { re: /^Zoom Meeting$/i,                           platform: 'Zoom'        },
  { re: /^Zoom Webinar$/i,                           platform: 'Zoom'        },

  // Google Meet — Chrome, Edge, Brave, Opera (' - BrowserName' suffix)
  { re: /^Meet - .+ - .+$/i,                         platform: 'Google Meet' },
  // Google Meet — Firefox (' — Mozilla Firefox' suffix, em dash)
  { re: /^Meet - .+ — .+$/i,                    platform: 'Google Meet' },
  // Google Meet — popped-out window or browser that omits its own name
  { re: /^Meet - [a-z]{3}-[a-z]{4}-[a-z]{3}$/i,     platform: 'Google Meet' },
  // Google Meet — alternate title format used by some Meet versions
  { re: /^.+ - Google Meet$/i,                       platform: 'Google Meet' },

  // Microsoft Teams desktop
  { re: /^Microsoft Teams.*(?:Call|Meeting)/i,       platform: 'Teams'       },
  { re: /^.+ \| Microsoft Teams$/i,                  platform: 'Teams'       },
  { re: /^Microsoft Teams - .+$/i,                   platform: 'Teams'       },

  // Cisco Webex desktop
  { re: /^Cisco Webex (Meeting|Webinar)/i,           platform: 'Webex'       },
];

function extractMeetingTitle(windowName) {
  let m;

  // Google Meet: strip the trailing browser name after the last ' - ' or ' — ' separator.
  // Works for all browsers including Firefox (em dash) and titles that contain dashes.
  if (windowName.startsWith('Meet - ')) {
    const inner = windowName.slice(7); // remove leading "Meet - "
    // Remove "BrowserName" suffix: everything after the last dash/en-dash/em-dash separator
    const stripped = inner.replace(/\s+[–—-]\s+[^–—-]+$/, '').trim();
    return stripped || inner.trim();
  }

  if ((m = windowName.match(/^(.+) - Google Meet$/i)))       return m[1].trim();
  if ((m = windowName.match(/^(.+) \| Microsoft Teams$/i)))  return m[1].trim();
  if ((m = windowName.match(/^Microsoft Teams - (.+)$/i)))   return m[1].trim();
  if (/Zoom Webinar/i.test(windowName))                      return 'Zoom Webinar';
  if (/Zoom Meeting/i.test(windowName))                      return 'Zoom Meeting';
  if (/Cisco Webex/i.test(windowName))                       return 'Webex Meeting';
  return windowName.trim();
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

// ── Meeting detection ─────────────────────────────────────────────────────────
async function detectMeeting() {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] });
    const found = findMeetingSource(sources);

    if (found && !activeMeeting) {
      activeMeeting = found;
      const title = found.title;
      console.log(`[AIMOM] Meeting detected: "${title}" (${found.platform})`);
      setTrayStatus('detected');
      wireDisplayMedia(found);
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('meeting:start', { title, platform: found.platform });
        showMainWindow();
      }, 2000);

    } else if (!found && activeMeeting) {
      console.log('[AIMOM] Meeting ended');
      activeMeeting = null;
      mainWindow?.webContents?.send('meeting:end');
      setTrayStatus('idle');
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
