const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Single Instance Lock ────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let overlayWindow = null;
let overlayOpacity = 0.9;
let overlayAlwaysOnTop = true;
let overlayClickThrough = false;
let overlayFadeTimer = null;

const isDev = !app.isPackaged;

// ─── Overlay Bounds Persistence ──────────────────────────────
function getOverlayConfigPath() {
  return path.join(app.getPath('userData'), 'overlay-bounds.json');
}

function loadOverlayBounds() {
  try {
    const raw = fs.readFileSync(getOverlayConfigPath(), 'utf8');
    const bounds = JSON.parse(raw);
    // Validate bounds are within a visible display
    const displays = screen.getAllDisplays();
    const isVisible = displays.some((display) => {
      const { x, y, width, height } = display.workArea;
      return bounds.x >= x - 100 && bounds.x < x + width &&
        bounds.y >= y - 100 && bounds.y < y + height;
    });
    return isVisible ? bounds : null;
  } catch {
    return null;
  }
}

function saveOverlayBounds() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try {
    const bounds = overlayWindow.getBounds();
    fs.writeFileSync(getOverlayConfigPath(), JSON.stringify(bounds));
  } catch {
    // Silently ignore write errors
  }
}

// ─── Default Hotkey Bindings ─────────────────────────────────
const defaultHotkeyBindings = [
  { action: 'Generate Answer', keys: 'Ctrl + Enter', isEnabled: true },
  { action: 'Screen Capture', keys: 'Ctrl + Shift + Enter', isEnabled: true },
  { action: 'AI Chat', keys: 'Ctrl + Alt + Enter', isEnabled: true },
  { action: 'Toggle Overlay', keys: 'Ctrl + \\', isEnabled: true },
  { action: 'Opacity Down', keys: 'Ctrl + [', isEnabled: true },
  { action: 'Opacity Up', keys: 'Ctrl + ]', isEnabled: true },
  { action: 'Reset Context', keys: 'Ctrl + R', isEnabled: true },
  { action: 'Delete Screenshot', keys: 'Ctrl + Backspace', isEnabled: true },
];

let currentHotkeyBindings = [...defaultHotkeyBindings];

// ─── Main Window ─────────────────────────────────────────────
function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1440, width),
    height: Math.min(900, height),
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#e2e8f0',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    show: false,
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'desktop', 'browser', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Grant microphone and media permissions automatically so getUserMedia works
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'display-capture'];
    callback(allowed.includes(permission));
  });

  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'display-capture'];
    return allowed.includes(permission);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
  });
}

// ─── Overlay Window ──────────────────────────────────────────
function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  const savedBounds = loadOverlayBounds();

  overlayWindow = new BrowserWindow({
    width: savedBounds?.width || 420,
    height: savedBounds?.height || 320,
    x: savedBounds?.x ?? undefined,
    y: savedBounds?.y ?? undefined,
    minWidth: 280,
    minHeight: 200,
    maxWidth: 800,
    maxHeight: 600,
    backgroundColor: '#0f172a',
    frame: false,
    transparent: true,
    alwaysOnTop: overlayAlwaysOnTop,
    resizable: true,
    skipTaskbar: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    overlayWindow.loadURL('http://localhost:4200/#/overlay');
  } else {
    overlayWindow.loadFile(
      path.join(__dirname, '..', 'dist', 'desktop', 'browser', 'index.html'),
      { hash: '/overlay' }
    );
  }

  // Grant mic / media permissions for the overlay window (same default session,
  // but set explicitly here as a safety net in case the session handler runs late)
  overlayWindow.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'microphone', 'audioCapture', 'display-capture'].includes(permission));
  });
  overlayWindow.webContents.session.setPermissionCheckHandler((_wc, permission) =>
    ['media', 'microphone', 'audioCapture', 'display-capture'].includes(permission)
  );

  // Exclude overlay from all screen capture, screenshots, and screen sharing
  // (covers Teams, Google Meet, Skype, Zoom, browser screen sharing, OBS, Win+Shift+S, etc.)
  overlayWindow.setContentProtection(true);

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.focus();
    fadeOverlayTo(overlayOpacity);
  });

  // Save position when moved or resized
  overlayWindow.on('moved', () => saveOverlayBounds());
  overlayWindow.on('resized', () => saveOverlayBounds());

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayClickThrough = false;
  });
}

// ─── Overlay Fade Animations ─────────────────────────────────
function fadeOverlayTo(target, callback) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  if (overlayFadeTimer) {
    clearInterval(overlayFadeTimer);
    overlayFadeTimer = null;
  }

  // Ensure we start from 0 if the window was just shown
  if (!overlayWindow.isVisible()) overlayWindow.show();
  let current = overlayWindow.getOpacity();
  const diff = target - current;
  const steps = 12;
  const stepSize = diff / steps;
  let step = 0;

  overlayFadeTimer = setInterval(() => {
    step++;
    if (step >= steps || !overlayWindow || overlayWindow.isDestroyed()) {
      if (overlayFadeTimer) clearInterval(overlayFadeTimer);
      overlayFadeTimer = null;
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.setOpacity(target);
      }
      if (callback) callback();
      return;
    }
    current += stepSize;
    overlayWindow.setOpacity(Math.max(0, Math.min(1, current)));
  }, 18);
}

function toggleOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (overlayWindow.isVisible()) {
      // Fade out then hide
      fadeOverlayTo(0, () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
        }
      });
    } else {
      overlayWindow.setOpacity(0);
      overlayWindow.show();
      fadeOverlayTo(overlayOpacity);
    }
  } else {
    createOverlayWindow();
  }
}

function adjustOverlayOpacity(delta) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayOpacity = Math.max(0.3, Math.min(1.0, overlayOpacity + delta));
  overlayWindow.setOpacity(overlayOpacity);
  overlayWindow.webContents.send('overlay:opacity-changed', overlayOpacity);
}

// ─── Click-Through Mode ──────────────────────────────────────
function setOverlayClickThrough(enabled) {
  overlayClickThrough = !!enabled;
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  if (overlayClickThrough) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    overlayWindow.setIgnoreMouseEvents(false);
  }

  overlayWindow.webContents.send('overlay:click-through-changed', overlayClickThrough);
}

// ─── Shortcut Handling ───────────────────────────────────────
function sendShortcutAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shortcut:triggered', action);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('shortcut:triggered', action);
  }
}

function normalizeAccelerator(binding) {
  return binding.keys
    .replaceAll('Ctrl', 'CommandOrControl')
    .replaceAll(' + ', '+');
}

function handleShortcutAction(action) {
  switch (action) {
    case 'Toggle Overlay':
      toggleOverlay();
      return;
    case 'Opacity Down':
      adjustOverlayOpacity(-0.1);
      return;
    case 'Opacity Up':
      adjustOverlayOpacity(0.1);
      return;
    default:
      sendShortcutAction(action);
  }
}

function registerGlobalShortcuts(bindings = currentHotkeyBindings) {
  globalShortcut.unregisterAll();
  const failures = [];

  bindings
    .filter((binding) => binding.isEnabled !== false && binding.keys)
    .forEach((binding) => {
      const accelerator = normalizeAccelerator(binding);
      try {
        const registered = globalShortcut.register(accelerator, () => handleShortcutAction(binding.action));
        if (!registered) {
          failures.push(binding.action);
        }
      } catch {
        failures.push(binding.action);
      }
    });

  return failures;
}

// ─── IPC: App Info ───────────────────────────────────────────
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:is-dev', () => isDev);

// ─── IPC: Region Capture ─────────────────────────────────────
ipcMain.handle('screen:capture-region', async () => {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  // Create transparent fullscreen window on primary display for region selection
  const selectorWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  selectorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      * { margin: 0; padding: 0; }
      html, body { width: 100vw; height: 100vh; overflow: hidden; cursor: crosshair; background: rgba(0,0,0,0.25); }
      #selection { position: absolute; border: 2px solid #22c55e; background: rgba(34,197,94,0.12); pointer-events: none; display: none; }
      #coords { position: fixed; top: 10px; left: 10px; color: #fff; font: 12px monospace; pointer-events: none; }
    </style>
    </head>
    <body>
      <div id="selection"></div>
      <div id="coords">Click and drag to select a region. Press Escape to cancel.</div>
      <script>
        let startX = 0, startY = 0, isDragging = false;
        const sel = document.getElementById('selection');
        const coords = document.getElementById('coords');

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            window.__regionResult = null;
            document.title = 'region-cancel';
          }
        });

        document.addEventListener('mousedown', (e) => {
          startX = e.clientX; startY = e.clientY; isDragging = true;
          sel.style.display = 'block';
          sel.style.left = startX + 'px'; sel.style.top = startY + 'px';
          sel.style.width = '0px'; sel.style.height = '0px';
        });

        document.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
          const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
          sel.style.left = x + 'px'; sel.style.top = y + 'px';
          sel.style.width = w + 'px'; sel.style.height = h + 'px';
          coords.textContent = w + ' x ' + h;
        });

        document.addEventListener('mouseup', (e) => {
          if (!isDragging) return;
          isDragging = false;
          const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
          const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
          if (w > 10 && h > 10) {
            document.title = JSON.stringify({ x, y, width: w, height: h });
          } else {
            document.title = 'region-cancel';
          }
        });
      </script>
    </body>
    </html>
  `)}`);

  return new Promise((resolve) => {
    selectorWindow.webContents.on('page-title-updated', (_event, title) => {
      selectorWindow.close();
      if (title === 'region-cancel') {
        resolve(null);
      } else {
        try {
          resolve(JSON.parse(title));
        } catch {
          resolve(null);
        }
      }
    });

    selectorWindow.on('closed', () => resolve(null));
  });
});

// ─── IPC: Hotkeys ────────────────────────────────────────────
ipcMain.handle('settings:apply-hotkeys', (_event, bindings) => {
  currentHotkeyBindings = Array.isArray(bindings) && bindings.length > 0 ? bindings : [...defaultHotkeyBindings];
  return registerGlobalShortcuts(currentHotkeyBindings);
});

// ─── IPC: Overlay Controls ───────────────────────────────────
ipcMain.on('overlay:toggle', () => toggleOverlay());

ipcMain.on('overlay:set-opacity', (_event, value) => {
  overlayOpacity = Math.max(0.3, Math.min(1.0, value));
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setOpacity(overlayOpacity);
  }
});

ipcMain.on('overlay:set-always-on-top', (_event, value) => {
  overlayAlwaysOnTop = !!value;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setAlwaysOnTop(overlayAlwaysOnTop);
  }
});

ipcMain.on('overlay:set-click-through', (_event, value) => {
  setOverlayClickThrough(value);
});

ipcMain.on('overlay:set-ignore-mouse-events', (_event, value, forward) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (value) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: !!forward });
  } else {
    overlayWindow.setIgnoreMouseEvents(false);
  }
});

ipcMain.on('overlay:auto-show', () => {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible()) {
    toggleOverlay();
  }
});

ipcMain.handle('overlay:get-state', () => ({
  isVisible: overlayWindow ? overlayWindow.isVisible() : false,
  opacity: overlayOpacity,
  alwaysOnTop: overlayAlwaysOnTop,
  clickThrough: overlayClickThrough,
}));

// ─── IPC: Window Controls ────────────────────────────────────
ipcMain.on('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

// ─── IPC: Session Overlay Mode ─────────────────────────────
ipcMain.on('session:enter-overlay-mode', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  } else {
    // Already exists — ensure visible and on top
    if (!overlayWindow.isVisible()) overlayWindow.show();
    fadeOverlayTo(overlayOpacity);
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.focus();
  }
  // Give the overlay window time to render Angular before hiding the main window
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  }, 600);
});

ipcMain.on('session:exit-overlay-mode', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    overlayWindow = null;
  }
});

ipcMain.on('session:stop-from-overlay', () => {
  // Send stop signal FIRST (while both windows are still alive) so the
  // session component's listener definitely receives it before any window state changes
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('session:stop-requested');
  }

  // Then close the overlay and reveal the main window
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    overlayWindow = null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

// ─── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();
  registerGlobalShortcuts();
});

// Focus existing window when second instance is attempted
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ─── Error Handling ──────────────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('[SparrowInterviewAI] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[SparrowInterviewAI] Unhandled rejection:', reason);
});
