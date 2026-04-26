// Clumo Electron Main Process
// Launches the embedded server and opens the web UI in a BrowserWindow

const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const ServerManager = require('./server-manager');

let mainWindow = null;
const serverManager = new ServerManager();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Clumo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the web UI from the embedded server
  const port = serverManager.getPort();
  mainWindow.loadURL(`http://localhost:${port}`);

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
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
