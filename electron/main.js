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
