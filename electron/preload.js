// Preload script for Electron
// This script runs before the web page is loaded and has access to both
// the DOM and Node.js APIs

const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
});
