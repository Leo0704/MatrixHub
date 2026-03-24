import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import log from 'electron-log';
import type { Platform } from '../shared/types.js';
import { jitterDelay } from './utils/page-helpers.js';
import { getFingerprintScript } from './utils/fingerprint-randomizer.js';

// 浏览器实例缓存（按平台区分）
const browserPool: Map<Platform, Browser> = new Map();
const contextPool: Map<string, BrowserContext> = new Map();

// 页面池 - 按账号隔离，每个账号保持登录状态
interface PooledPage {
  page: Page;
  platform: Platform;
  accountId: string | null;  // 账号标识，null 表示未登录
  inUse: boolean;
  lastUsed: number;
  useCount: number;
  isLoggedIn: boolean;
  closeHandler?: () => void;  // 保存关闭事件处理器引用，用于清理
}
const pagePool: PooledPage[] = [];
const MAX_POOL_SIZE_PER_PLATFORM = 5;

// 重要：页面池按账号隔离，不复用跨账号页面
// 登录状态必须保持，不能超时关闭

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
      // 清理关联的 context
      contextPool.delete(platform);
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

  // 启动浏览器
  const browser = await chromium.launch({
    headless: !process.env.DEV_DEBUG_BROWSER,
    args,
  });

  // 创建 context 并设置
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 800 },
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
    permissions: [],
  });

  contextPool.set(platform, context);

  // 注入反检测脚本（运行在浏览器中）
  // 组合：指纹随机化 + Chrome runtime 模拟
  await context.addInitScript(`
    ${getFingerprintScript()}

    // 模拟 Chrome runtime（原有功能保留）
    globalThis.chrome = {
      runtime: { id: undefined, getURL: (s) => s },
      app: {},
      storage: { local: {} },
    };
  `);

  log.info(`浏览器启动成功: ${platform}, User-Agent: ${userAgent.substring(0, 50)}...`);
  return browser;
}

/**
 * 为指定平台创建新页面（按账号隔离的页面池）
 * 关键原则：按 (platform, accountId) 隔离，保持登录状态
 */
export async function createPage(platform: Platform, accountId?: string): Promise<Page> {
  // 查找匹配的已登录页面（按账号隔离）
  if (accountId) {
    const pooled = pagePool.find(
      p => p.platform === platform && p.accountId === accountId && !p.inUse
    );
    if (pooled && (pooled.page as any).isConnected?.() && pooled.isLoggedIn) {
      pooled.inUse = true;
      pooled.lastUsed = Date.now();
      pooled.useCount++;
      log.debug(`[PagePool] 复用账号页面: ${platform}/${accountId} (复用次数: ${pooled.useCount})`);
      return pooled.page;
    }
  }

  // 查找通用未登录页面
  const genericPooled = pagePool.find(
    p => p.platform === platform && p.accountId === null && !p.inUse
  );
  if (genericPooled && (genericPooled.page as any).isConnected?.()) {
    genericPooled.inUse = true;
    genericPooled.lastUsed = Date.now();
    genericPooled.useCount++;
    log.debug(`[PagePool] 复用通用页面: ${platform} (复用次数: ${genericPooled.useCount})`);
    return genericPooled.page;
  }

  // 池已满，关闭一个空闲的同平台页面
  const poolCount = pagePool.filter(p => p.platform === platform).length;
  if (poolCount >= MAX_POOL_SIZE_PER_PLATFORM) {
    const oldest = pagePool
      .filter(p => p.platform === platform && !p.inUse && p.useCount > 1)
      .sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (oldest) {
      log.debug(`[PagePool] 关闭多余页面: ${oldest.platform}/${oldest.accountId || '通用'}`);
      removeFromPool(oldest);
    }
  }

  // 创建新页面
  const browser = await getBrowser(platform);
  let context = contextPool.get(platform);
  if (!context) {
    context = await browser.newContext({
      timezoneId: 'Asia/Shanghai',
      locale: 'zh-CN',
    });
    contextPool.set(platform, context);
  }

  const page = await context.newPage();

  // 设置默认超时
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);

  // 添加到池
  const pooledPage: PooledPage = {
    page,
    platform,
    accountId: accountId ?? null,
    inUse: true,
    lastUsed: Date.now(),
    useCount: 1,
    isLoggedIn: false,
  };

  // 监听页面关闭事件
  const closeHandler = () => {
    const pooled = pagePool.find(p => p.page === page);
    if (pooled) {
      removeFromPool(pooled);
    }
  };
  pooledPage.closeHandler = closeHandler;
  page.on('close', closeHandler);

  pagePool.push(pooledPage);

  log.debug(`[PagePool] 创建新页面: ${platform}/${accountId || '通用'} (池大小: ${pagePool.length})`);
  return page;
}

/**
 * 标记页面为已登录状态
 */
export function markPageLoggedIn(page: Page, accountId: string): void {
  const pooled = pagePool.find(p => p.page === page);
  if (pooled) {
    pooled.isLoggedIn = true;
    pooled.accountId = accountId;
    log.debug(`[PagePool] 页面已登录: ${pooled.platform}/${accountId}`);
  }
}

/**
 * 归还页面到池中（不关闭，保持登录状态）
 */
export async function releasePage(page: Page): Promise<void> {
  const pooled = pagePool.find(p => p.page === page);
  if (pooled) {
    pooled.inUse = false;
    pooled.lastUsed = Date.now();
    log.debug(`[PagePool] 归还页面: ${pooled.platform}/${pooled.accountId || '通用'} (登录状态: ${pooled.isLoggedIn})`);
  }
}

/**
 * 从池中移除页面
 */
function removeFromPool(pooled: PooledPage): void {
  const idx = pagePool.indexOf(pooled);
  if (idx !== -1) {
    pagePool.splice(idx, 1);
  }

  // 移除事件监听器，避免内存泄漏
  if (pooled.closeHandler) {
    pooled.page.removeListener('close', pooled.closeHandler);
  }

  try {
    pooled.page.close();
  } catch (err) {
    log.warn(`[PagePool] 关闭页面失败:`, err);
  }
}

/**
 * 获取页面池状态
 */
export function getPagePoolStatus(): {
  total: number;
  byPlatform: Record<string, { total: number; inUse: number; idle: number; loggedIn: number }>;
} {
  const byPlatform: Record<string, { total: number; inUse: number; idle: number; loggedIn: number }> = {};
  for (const pooled of pagePool) {
    if (!byPlatform[pooled.platform]) {
      byPlatform[pooled.platform] = { total: 0, inUse: 0, idle: 0, loggedIn: 0 };
    }
    byPlatform[pooled.platform].total++;
    if (pooled.inUse) {
      byPlatform[pooled.platform].inUse++;
    } else {
      byPlatform[pooled.platform].idle++;
    }
    if (pooled.isLoggedIn) {
      byPlatform[pooled.platform].loggedIn++;
    }
  }
  return { total: pagePool.length, byPlatform };
}

/**
 * 关闭指定平台的浏览器
 */
export async function closeBrowser(platform: Platform): Promise<void> {
  const browser = browserPool.get(platform);
  const context = contextPool.get(platform);

  // 先关闭 context（释放资源）
  if (context) {
    await context.close();
    contextPool.delete(platform);
  }

  if (browser && browser.isConnected()) {
    await browser.close();
    browserPool.delete(platform);
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
 * 获取浏览器池状态
 */
export function getBrowserPoolStatus(): { activeBrowsers: number; platforms: Platform[] } {
  const activeBrowsers = browserPool.size;
  const platforms = Array.from(browserPool.keys());
  return { activeBrowsers, platforms };
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
