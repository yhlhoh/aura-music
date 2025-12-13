const { app, BrowserWindow , session, Menu} = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../build/icon.png'),
  });
  Menu.setApplicationMenu(null);

  // Load the built Vite app
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // Simulator browser and add Referer header
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/143.0.0.0';
    details.requestHeaders['Referer'] = 'https://song.y-dev.tech/';
    callback({ requestHeaders: details.requestHeaders });
  }

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
