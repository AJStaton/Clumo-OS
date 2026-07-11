// Clumo Electron Main Process
// Launches the embedded server and opens the web UI in a BrowserWindow

const { app, BrowserWindow, ipcMain, desktopCapturer, session, shell } = require('electron');
const path = require('path');
const ServerManager = require('./server-manager');

// --- Test-mode hook (used by Playwright Electron specs) ---
// When launched with --test (or CLUMO_TEST_MODE=1), Chromium synthesizes
// fake mic/desktopCapturer streams so GUI tests don't need real audio or
// OS-level media permissions. Test mode also forwards CLUMO_FAKE_PROVIDER
// into the embedded server so the AI provider returns canned responses
// instead of calling OpenAI/Azure.
const TEST_MODE = process.argv.includes('--test') || process.env.CLUMO_TEST_MODE === '1';
if (TEST_MODE) {
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  console.log('[Electron] Running in TEST_MODE (fake media + fake provider)');
}

const ICON_PATH = path.join(__dirname, 'build', 'icon.png');

let mainWindow = null;
const serverManager = new ServerManager({
  // In TEST_MODE always resolve the server entry from the dev layout so
  // Playwright runs against the in-repo server (not a packaged build).
  serverEntry: TEST_MODE ? path.join(__dirname, '..', 'server', 'index.js') : undefined,
  extraEnv: TEST_MODE ? { CLUMO_FAKE_PROVIDER: '1' } : {}
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Clumo',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Load the web UI from the embedded server
  const port = serverManager.getPort();
  const appOrigin = `http://localhost:${port}`;
  mainWindow.loadURL(appOrigin);

  // Navigation hardening: keep the window pinned to the local app origin, and never
  // open in-app child windows. External links go to the system browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // On macOS, override the dock icon (otherwise it shows the bundled Electron atom in dev)
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(ICON_PATH); } catch (err) { console.warn('[Electron] dock.setIcon failed:', err); }
  }

  // Start the embedded server
  try {
    await serverManager.start();
    console.log(`[Electron] Server running on port ${serverManager.getPort()}`);
  } catch (err) {
    console.error('[Electron] Failed to start server:', err);
    app.quit();
    return;
  }

  // Handle audio source requests from the renderer
  ipcMain.handle('get-audio-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        fetchWindowIcons: true
      });

      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    } catch (err) {
      console.error('[Electron] Failed to get desktop sources:', err);
      return [];
    }
  });

  // Smart meeting source detection
  const MEETING_PATTERNS = [
    { pattern: /Zoom Meeting|^Zoom$/i, label: 'Zoom' },
    { pattern: /Microsoft Teams/i, label: 'Microsoft Teams' },
    { pattern: /Webex/i, label: 'Webex' },
    { pattern: /Meet\s*[-\u2013]\s*.+/i, label: 'Google Meet' },
    { pattern: /teams\.microsoft\.com/i, label: 'Teams (browser)' },
    { pattern: /zoom\.us/i, label: 'Zoom (browser)' }
  ];

  ipcMain.handle('get-meeting-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        fetchWindowIcons: true
      });

      const meetings = [];
      const screens = [];
      const allSources = [];

      for (const source of sources) {
        const mapped = {
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL()
        };

        allSources.push(mapped);

        if (source.id.startsWith('screen:')) {
          screens.push(mapped);
          continue;
        }

        for (const { pattern, label } of MEETING_PATTERNS) {
          if (pattern.test(source.name)) {
            meetings.push({ ...mapped, meetingApp: label });
            break;
          }
        }
      }

      return { meetings, screens, allSources };
    } catch (err) {
      console.error('[Electron] Failed to get meeting sources:', err);
      return { meetings: [], screens: [], allSources: [] };
    }
  });

  ipcMain.handle('get-server-port', () => {
    return serverManager.getPort();
  });

  // Grant media permissions for audio capture
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      console.log('[Electron] Granting media permission');
      callback(true);
    } else {
      callback(false);
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  serverManager.stop();
});
