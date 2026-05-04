const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, typed API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Store operations (async)
  getStore:    (key)         => ipcRenderer.invoke('get-store', key),
  setStore:    (key, value)  => ipcRenderer.invoke('set-store', key, value),
  deleteStore: (key)         => ipcRenderer.invoke('delete-store', key),

  // Send status back to main (fire and forget)
  sendStatus:  (status)      => ipcRenderer.send('recording-status', status),
  sendDone:    ()            => ipcRenderer.send('recording-done'),
  hideWindow:  ()            => ipcRenderer.send('window-hide'),

  // Listen for events from main process
  onMeetingStart:  (cb) => ipcRenderer.on('meeting:start',      (_, data) => cb(data)),
  onMeetingEnd:    (cb) => ipcRenderer.on('meeting:end',        ()        => cb()),
  onForceStop:     (cb) => ipcRenderer.on('meeting:force-stop', ()        => cb()),
  onShowLogin:     (cb) => ipcRenderer.on('show-login',         ()        => cb()),
  onShowIdle:      (cb) => ipcRenderer.on('show-idle',          (_, data) => cb(data)),
  onShowSettings:  (cb) => ipcRenderer.on('show-settings',      ()        => cb()),
  onSignedOut:     (cb) => ipcRenderer.on('signed-out',         ()        => cb()),

  // Open URL in system default browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Remove listener helpers (call with same cb reference to clean up)
  removeListener: (channel, cb) => ipcRenderer.removeListener(channel, cb),
});
