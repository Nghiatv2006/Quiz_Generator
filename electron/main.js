const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const { createPool, closePool } = require('./config/db');

// Biến lưu cửa sổ chính
let mainWindow;

// Kiểm tra môi trường dev
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Quiz Generator V2',
    icon: path.join(__dirname, '../public/icon.png'),
    frame: false, // Custom titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load URL
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Window events
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized', false);
  });
}

// App ready
app.whenReady().then(async () => {
  // Kết nối SQL Server trước
  try {
    await createPool();
    console.log('🚀 Database pool initialized');
  } catch (err) {
    console.error('❌ Cannot connect to SQL Server:', err.message);
    console.error('Hãy kiểm tra .env file: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
  }

  // Feature 9: Grant required permissions for voice & anti-cheat
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'microphone', 'fullscreen', 'clipboard-read'].includes(permission);
    console.log(`[Permission] ${permission} → ${allowed ? 'GRANTED' : 'DENIED'}`);
    callback(allowed);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'audioCapture', 'microphone', 'fullscreen', 'clipboard-read'].includes(permission);
  });

  createWindow();

  // Register IPC Handlers
  registerAuthHandlers();
  registerTopicHandlers();
  registerQuestionHandlers();
  registerExamHandlers();
  registerAttemptHandlers();
  registerAIHandlers();
  registerStatsHandlers();
  registerGamificationHandlers();
  registerVoiceHandlers();
  registerWindowHandlers();
});

// Window control handlers
function registerWindowHandlers() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
    return mainWindow?.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());

  ipcMain.handle('dialog:openFile', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options?.filters || [
        { name: 'Documents', extensions: ['pdf', 'docx', 'txt'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result;
  });
}

// Import handlers
function registerAuthHandlers() {
  require('./ipc/authHandlers')(ipcMain);
}
function registerTopicHandlers() {
  require('./ipc/topicHandlers')(ipcMain);
}
function registerQuestionHandlers() {
  require('./ipc/questionHandlers')(ipcMain);
}
function registerExamHandlers() {
  require('./ipc/examHandlers')(ipcMain);
}
function registerAttemptHandlers() {
  require('./ipc/attemptHandlers')(ipcMain);
}
function registerAIHandlers() {
  require('./ipc/aiHandlers')(ipcMain);
}
function registerStatsHandlers() {
  require('./ipc/statsHandlers')(ipcMain);
}
function registerGamificationHandlers() {
  require('./ipc/gamificationHandlers')(ipcMain);
}
function registerVoiceHandlers() {
  require('./ipc/voiceHandlers')(ipcMain);
}

// Quit
app.on('window-all-closed', async () => {
  await closePool();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await closePool();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
