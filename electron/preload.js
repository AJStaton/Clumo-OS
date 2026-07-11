// Clumo Preload Script
// Securely exposes Electron APIs to the renderer process

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clumo', {
  // Get available audio sources (windows, screens) for capture
  getAudioSources: () => ipcRenderer.invoke('get-audio-sources'),

  // Get categorized meeting sources (detected meetings, screens, all)
  getMeetingSources: () => ipcRenderer.invoke('get-meeting-sources'),

  // Get the server port (so the web UI knows where to connect)
  getServerPort: () => ipcRenderer.invoke('get-server-port'),

  // Check if running inside Electron (vs plain browser)
  isElectron: true
});
