import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import log from 'electron-log';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

log.info('=== AI矩阵运营大师 启动 ===');
log.info(`版本: ${app.getVersion()}`);
log.info(`Electron: ${process.versions.electron}`);
log.info(`Chrome: ${process.versions.chrome}`);
log.info(`Node: ${process.versions.node}`);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  log.info('创建主窗口...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0a0a0b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    log.info('窗口 ready-to-show');
    mainWindow?.show();
  });

  if (isDev) {
    log.info('加载开发服务器: http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    log.info(`加载生产文件: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`窗口加载失败: ${errorCode} - ${errorDescription}`);
  });
}

function createTray(): void {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);

  tray.setToolTip('AI矩阵运营大师');
  tray.setContextMenu(contextMenu);
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建任务', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new-task') },
        { type: 'separator' },
        { label: '设置', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu:settings') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => mainWindow?.webContents.send('menu:about') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers
ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:get-path', (_event, name: string) => {
  return app.getPath(name as any);
});

// 全局异常处理
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

app.whenReady().then(() => {
  log.info('App ready');
  createMenu();
  createWindow();
  createTray();

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
  log.info('=== AI矩阵运营大师 关闭 ===');
});
