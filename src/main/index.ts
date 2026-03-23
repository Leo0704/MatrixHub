import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import { getDb, closeDb } from '../service/db.js';
import { registerIpcHandlers } from '../service/ipc-handlers.js';
import { createServiceRunner } from '../service/service-process.js';
import { closeAllBrowsers } from '../service/platform-launcher.js';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.initialize(); // 确保日志初始化

const isDev = !app.isPackaged;

// 单例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log.warn('另一个实例已在运行，退出');
  app.quit();
}

log.info('=== AI矩阵运营大师 启动 ===');
log.info(`版本: ${app.getVersion()}`);
log.info(`Electron: ${process.versions.electron}`);
log.info(`Chrome: ${process.versions.chrome}`);
log.info(`Node: ${process.versions.node}`);
log.info(`平台: ${process.platform}`);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serviceRunner: ReturnType<typeof createServiceRunner> | null = null;

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

  // 打开外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`窗口加载失败: ${errorCode} - ${errorDescription}`);
  });
}

function createTray(): void {
  // 创建透明图标占位
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: '关于',
      click: () => {
        mainWindow?.webContents.send('menu:about');
        mainWindow?.show();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('AI矩阵运营大师');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建任务',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-task'),
        },
        {
          label: '新建 AI 生成',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow?.webContents.send('menu:new-ai-task'),
        },
        { type: 'separator' },
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('menu:settings'),
        },
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
      label: '任务',
      submenu: [
        {
          label: '查看概览',
          click: () => mainWindow?.webContents.send('menu:view-overview'),
        },
        {
          label: '查看内容',
          click: () => mainWindow?.webContents.send('menu:view-content'),
        },
        { type: 'separator' },
        {
          label: '暂停所有任务',
          click: () => mainWindow?.webContents.send('menu:pause-tasks'),
        },
        {
          label: '恢复所有任务',
          click: () => mainWindow?.webContents.send('menu:resume-tasks'),
        },
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
        {
          label: '关于',
          click: () => mainWindow?.webContents.send('menu:about'),
        },
        {
          label: '打开日志',
          click: () => {
            const logPath = log.transports.file.getFile().path;
            shell.showItemInFolder(logPath);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function initializeServices(): Promise<void> {
  log.info('初始化服务...');

  // 1. 初始化数据库
  log.info('初始化数据库...');
  getDb();

  // 2. 注册 IPC 处理器
  log.info('注册 IPC 处理器...');
  registerIpcHandlers();

  // 3. 启动服务循环（在主进程中直接运行）
  // 注意：生产环境应该 fork 到独立进程
  log.info('启动任务服务循环...');
  serviceRunner = createServiceRunner();
  await serviceRunner.start();

  log.info('服务初始化完成');
}

async function shutdownServices(): Promise<void> {
  log.info('关闭服务...');

  // 停止服务循环
  if (serviceRunner) {
    serviceRunner.stop();
  }

  // 关闭所有浏览器
  await closeAllBrowsers();

  // 关闭数据库
  closeDb();

  log.info('服务已关闭');
}

// 全局异常处理
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  // 生产环境不要立即退出
  if (!isDev) {
    log.error('生产环境遇到未捕获异常，记录日志但不退出');
  }
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

// 单例锁 - 第二个实例尝试打开时
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  log.info('App ready');

  try {
    await initializeServices();
    createMenu();
    createWindow();
    createTray();
  } catch (error) {
    log.error('初始化失败:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS 保持运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  log.info('=== AI矩阵运营大师 关闭 ===');
  await shutdownServices();
});

// 防止 app 退出时数据库连接未关闭
app.on('will-quit', async () => {
  await shutdownServices();
});
