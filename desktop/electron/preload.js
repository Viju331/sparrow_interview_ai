const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  isDev: () => ipcRenderer.invoke('app:is-dev'),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Overlay controls
  toggleOverlay: () => ipcRenderer.send('overlay:toggle'),
  setOverlayOpacity: (value) => ipcRenderer.send('overlay:set-opacity', value),
  setOverlayAlwaysOnTop: (value) => ipcRenderer.send('overlay:set-always-on-top', value),
  setOverlayClickThrough: (value) => ipcRenderer.send('overlay:set-click-through', value),
  setIgnoreMouseEvents: (value, forward) => ipcRenderer.send('overlay:set-ignore-mouse-events', value, forward),
  autoShowOverlay: () => ipcRenderer.send('overlay:auto-show'),
  getOverlayState: () => ipcRenderer.invoke('overlay:get-state'),

  // Screen capture
  captureRegion: () => ipcRenderer.invoke('screen:capture-region'),

  // Hotkey management
  applyHotkeys: (bindings) => ipcRenderer.invoke('settings:apply-hotkeys', bindings),

  // Listen for overlay state changes
  onOverlayOpacityChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('overlay:opacity-changed', listener);
    return () => ipcRenderer.removeListener('overlay:opacity-changed', listener);
  },

  onOverlayClickThroughChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('overlay:click-through-changed', listener);
    return () => ipcRenderer.removeListener('overlay:click-through-changed', listener);
  },

  onShortcutTriggered: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('shortcut:triggered', listener);
    return () => ipcRenderer.removeListener('shortcut:triggered', listener);
  },

  // Session overlay mode
  enterOverlayMode: () => ipcRenderer.send('session:enter-overlay-mode'),
  exitOverlayMode: () => ipcRenderer.send('session:exit-overlay-mode'),
  stopSessionFromOverlay: () => ipcRenderer.send('session:stop-from-overlay'),

  onSessionStopRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('session:stop-requested', listener);
    return () => ipcRenderer.removeListener('session:stop-requested', listener);
  },
});
