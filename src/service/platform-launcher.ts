import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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
  createdAt: number;         // 页面创建时间
  closeHandler?: () => void;  // 保存关闭事件处理器引用，用于清理
  removed?: boolean;          // 防止 double-removal 标志
}
const pagePool: PooledPage[] = [];

// 页面池配置
const POOL_CONFIG = {
  maxPoolSizePerPlatform: 5,
  idleTimeoutMs: 30 * 60 * 1000,     // 30分钟空闲超时
  cleanupIntervalMs: 5 * 60 * 1000,  // 5分钟检查一次
  maxPageAgeMs: 4 * 60 * 60 * 1000,  // 4小时最大存活
  preserveLoggedInPages: true,       // 保留已登录页面
};

// 清理定时器
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

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
      // 清理所有关联的页面
      cleanupPagesForPlatform(platform);
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
    if (pooled && !pooled.page.isClosed() && pooled.isLoggedIn) {
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
  if (genericPooled && !genericPooled.page.isClosed()) {
    genericPooled.inUse = true;
    genericPooled.lastUsed = Date.now();
    genericPooled.useCount++;
    log.debug(`[PagePool] 复用通用页面: ${platform} (复用次数: ${genericPooled.useCount})`);
    return genericPooled.page;
  }

  // 池已满，使用增强的 LRU 驱逐策略
  const poolCount = pagePool.filter(p => p.platform === platform).length;
  if (poolCount >= POOL_CONFIG.maxPoolSizePerPlatform) {
    const candidates = pagePool
      .filter(p => p.platform === platform && !p.inUse)
      .map(p => ({
        pooled: p,
        // LRU 评分：使用频率 + 最近使用时间 + 登录状态
        score: calculateLRUScore(p),
      }))
      .sort((a, b) => a.score - b.score);

    if (candidates.length > 0) {
      const toEvict = candidates[0].pooled;
      log.debug(`[PagePool] LRU 驱逐页面: ${toEvict.platform}/${toEvict.accountId || '通用'} (评分: ${candidates[0].score.toFixed(2)})`);
      removeFromPool(toEvict);
    }
  }

  // 创建新页面
  const browser = await getBrowser(platform);
  let context = contextPool.get(platform);
  if (!context) {
    context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1280, height: 800 },
      timezoneId: 'Asia/Shanghai',
      locale: 'zh-CN',
      permissions: [],
    });

    // 注入反检测脚本
    await context.addInitScript(`
      ${getFingerprintScript()}
      globalThis.chrome = {
        runtime: { id: undefined, getURL: (s) => s },
        app: {},
        storage: { local: {} },
      };
    `);

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
    createdAt: Date.now(),
  };

  // 监听页面关闭事件
  const closeHandler = () => {
    const pooled = pagePool.find(p => p.page === page);
    if (pooled && !pooled.removed) {
      pooled.removed = true;
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
 * 清理指定平台的所有页面（当浏览器断开连接时调用）
 */
function cleanupPagesForPlatform(platform: Platform): void {
  const pagesToRemove = pagePool.filter(p => p.platform === platform);
  for (const pooled of pagesToRemove) {
    // 从池中移除
    const idx = pagePool.indexOf(pooled);
    if (idx !== -1) {
      pagePool.splice(idx, 1);
    }
    // 安全移除事件监听器
    if (pooled.closeHandler) {
      try {
        pooled.page.removeListener('close', pooled.closeHandler);
      } catch (err) {
        // 页面可能已经关闭，忽略错误
      }
    }
    // 尝试关闭页面（可能已经无效）
    try {
      if (!pooled.page.isClosed()) {
        pooled.page.close().catch(() => {});
      }
    } catch {
      // 页面已经关闭或无效，忽略错误
    }
  }
  log.info(`[PagePool] 清理了 ${pagesToRemove.length} 个页面: ${platform}`);
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
    try {
      pooled.page.removeListener('close', pooled.closeHandler);
    } catch (err) {
      // 页面可能已经关闭，忽略错误
    }
  }

  try {
    pooled.page.close();
  } catch (err) {
    log.warn(`[PagePool] 关闭页面失败:`, err);
  }
}

/**
 * 计算 LRU 评分（越低越应该被驱逐）
 */
function calculateLRUScore(pooled: PooledPage): number {
  const now = Date.now();
  const ageMs = now - pooled.createdAt;
  const idleMs = now - pooled.lastUsed;

  // 评分组成：
  // - 使用频率权重 (0-1): 使用次数越多，分数越高
  const useScore = Math.min(pooled.useCount / 10, 1) * 0.3;
  // - 最近使用权重 (0-1): 最近使用过的，分数越高
  const recencyScore = Math.max(0, 1 - idleMs / POOL_CONFIG.idleTimeoutMs) * 0.3;
  // - 登录状态权重 (0-1): 已登录的页面，分数越高
  const loginScore = pooled.isLoggedIn ? 0.4 : 0;

  return useScore + recencyScore + loginScore;
}

/**
 * 启动页面池清理定时器
 */
export function startPoolCleanup(): void {
  if (cleanupInterval) {
    log.warn('[PagePool] 清理定时器已在运行');
    return;
  }

  cleanupInterval = setInterval(() => {
    cleanupIdlePages();
  }, POOL_CONFIG.cleanupIntervalMs);

  log.info(`[PagePool] 清理定时器已启动 (间隔: ${POOL_CONFIG.cleanupIntervalMs / 60000}分钟)`);
}

/**
 * 清理空闲超时的页面
 */
function cleanupIdlePages(): void {
  const now = Date.now();
  const toRemove: PooledPage[] = [];

  for (const pooled of pagePool) {
    // 跳过使用中的页面
    if (pooled.inUse) continue;

    const idleMs = now - pooled.lastUsed;
    const ageMs = now - pooled.createdAt;

    // 保留已登录页面（除非超过最大存活时间）
    if (POOL_CONFIG.preserveLoggedInPages && pooled.isLoggedIn) {
      if (ageMs < POOL_CONFIG.maxPageAgeMs) continue;
      log.debug(`[PagePool] 已登录页面超龄: ${pooled.platform}/${pooled.accountId} (存活: ${Math.round(ageMs / 60000)}分钟)`);
    }

    // 空闲超时
    if (idleMs > POOL_CONFIG.idleTimeoutMs) {
      log.debug(`[PagePool] 页面空闲超时: ${pooled.platform}/${pooled.accountId || '通用'} (空闲: ${Math.round(idleMs / 60000)}分钟)`);
      toRemove.push(pooled);
    }
    // 最大存活时间
    else if (ageMs > POOL_CONFIG.maxPageAgeMs) {
      log.debug(`[PagePool] 页面超龄: ${pooled.platform}/${pooled.accountId || '通用'} (存活: ${Math.round(ageMs / 60000)}分钟)`);
      toRemove.push(pooled);
    }
  }

  // 执行清理
  for (const pooled of toRemove) {
    log.info(`[PagePool] 清理页面: ${pooled.platform}/${pooled.accountId || '通用'}`);
    removeFromPool(pooled);
  }

  if (toRemove.length > 0) {
    log.info(`[PagePool] 清理完成，关闭 ${toRemove.length} 个页面，当前池大小: ${pagePool.length}`);
  }
}

/**
 * 停止页面池清理定时器
 */
export function stopPoolCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log.info('[PagePool] 清理定时器已停止');
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
  const screenshotsDir = process.env.MATRIX_USER_DATA
  ? path.join(process.env.MATRIX_USER_DATA, 'screenshots')
  : path.join(os.tmpdir(), 'matrixhub-screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const filePath = path.join(screenshotsDir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: false });

  log.debug(`截图已保存: ${filePath}`);
  return filePath;
}

// User Agent 池
const USER_AGENTS = [
  // Chrome 120-123 多版本
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  // Firefox
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  // Safari (macOS)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  // Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/123.0',
  // 移动端 (iOS/Android)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getUserDataDir(platform: Platform): string {
  const base = process.env.MATRIX_USER_DATA
    || path.join(os.tmpdir(), 'matrixhub-browser-profiles');
  return path.join(base, platform);
}
