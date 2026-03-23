import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import log from 'electron-log';
import type { Platform } from '../shared/types.js';

// 浏览器实例缓存（按平台区分）
const browserPool: Map<Platform, Browser> = new Map();
const contextPool: Map<string, BrowserContext> = new Map();

// 各平台 URL
const PLATFORM_URLS: Record<Platform, string> = {
  douyin: 'https://creator.douyin.com',
  kuaishou: 'https://cp.kuaishou.com',
  xiaohongshu: 'https://creator.xiaohongshu.com',
};

export interface StealthConfig {
  disableWebSecurity?: boolean;
  blockAds?: boolean;
  hidePlaywright?: boolean;
}

/**
 * 获取或创建浏览器实例（复用池）
 */
export async function getBrowser(platform: Platform): Promise<Browser> {
  let browser = browserPool.get(platform);

  if (!browser || !browser.isConnected()) {
    log.info(`启动浏览器: ${platform}`);
    browser = await launchBrowser(platform);
    browserPool.set(platform, browser);

    // 监听断开连接
    browser.on('disconnected', () => {
      log.warn(`浏览器断开连接: ${platform}`);
      browserPool.delete(platform);
    });
  }

  return browser;
}

/**
 * 启动带反检测的浏览器
 */
async function launchBrowser(platform: Platform): Promise<Browser> {
  const userDataDir = getUserDataDir(platform);

  // 确保目录存在
  fs.mkdirSync(userDataDir, { recursive: true });

  const args = [
    // 反检测基础
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',

    // 指纹混淆
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--allow-running-insecure-content',

    // 隐私
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--no-first-run',

    // 性能
    '--disable-crash-reporter',
    '--disable-logging',
    '--mute-audio',
  ];

  // User Agent 轮换
  const userAgent = getRandomUserAgent();

  const browser = await chromium.launch({
    headless: false,  // 开发模式可见，生产模式可改为 true
    userDataDir,
    args,
    locale: 'zh-CN',
    downloadsPath: path.join(app.getPath('userData'), 'downloads'),
  });

  // 设置默认 User Agent
  const context = browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 800 },
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
    permissions: [],
  });

  // 注入反检测脚本
  await context.addInitScript(() => {
    // 移除 webdriver 标识
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true,
    });

    // 模拟 Chrome runtime
    (window as any).chrome = {
      runtime: { id: undefined, getURL: (s: string) => s },
      app: {},
      storage: { local: {} },
    };

    // 随机化 canvas 指纹
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: any[]
    ) {
      const context = originalGetContext.call(this, type, ...args);
      if (type === '2d') {
        const ctx = context as CanvasRenderingContext2D;
        const originalFillText = ctx.fillText;
        ctx.fillText = function (
          this: CanvasRenderingContext2D,
          ...fillArgs
        ) {
          // 添加微小的随机偏移
          const x = (fillArgs[0] as any) as number;
          const y = (fillArgs[1] as any) as number;
          if (typeof x === 'number' && typeof y === 'number') {
            fillArgs[0] = x + (Math.random() - 0.5) * 0.1;
            fillArgs[1] = y + (Math.random() - 0.5) * 0.1;
          }
          return originalFillText.apply(this, fillArgs as any);
        };
      }
      return context;
    };

    // 拦截 automation 相关属性
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = async function (this: any, ...args: any[]) {
      if (args[0]?.name === 'notifications') {
        return Promise.resolve({ state: 'default' } as any);
      }
      return originalQuery.apply(this, args);
    };
  });

  contextPool.set(platform, context);

  log.info(`浏览器启动成功: ${platform}, User-Agent: ${userAgent.substring(0, 50)}...`);
  return browser;
}

/**
 * 为指定平台创建新页面
 */
export async function createPage(platform: Platform): Promise<Page> {
  const browser = await getBrowser(platform);
  const context = contextPool.get(platform) ?? browser.newContext({
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
  });

  const page = await context.newPage();

  // 设置默认超时
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);

  return page;
}

/**
 * 关闭指定平台的浏览器
 */
export async function closeBrowser(platform: Platform): Promise<void> {
  const browser = browserPool.get(platform);
  if (browser && browser.isConnected()) {
    await browser.close();
    browserPool.delete(platform);
    contextPool.delete(platform);
    log.info(`浏览器已关闭: ${platform}`);
  }
}

/**
 * 关闭所有浏览器
 */
export async function closeAllBrowsers(): Promise<void> {
  for (const platform of browserPool.keys()) {
    await closeBrowser(platform);
  }
}

/**
 * 截图保存（调试用）
 */
export async function screenshot(page: Page, name: string): Promise<string> {
  const screenshotsDir = path.join(app.getPath('userData'), 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const filePath = path.join(screenshotsDir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: false });

  log.debug(`截图已保存: ${filePath}`);
  return filePath;
}

// User Agent 池
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getUserDataDir(platform: Platform): string {
  const base = app.getPath('userData');
  return path.join(base, 'browser-profiles', platform);
}
