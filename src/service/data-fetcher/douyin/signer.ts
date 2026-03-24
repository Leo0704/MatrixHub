/**
 * 抖音 a_bogus 签名获取
 * 基于 MediaCrawler 的实现
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { Page } from 'playwright';
import log from 'electron-log';

/**
 * 生成随机 webid
 * 对应 Python 实现: help.py::get_web_id()
 */
export function generateWebId(): string {
  const e = (t: number | null): string => {
    if (t !== null) {
      return String(t ^ ((16 * Math.random()) >> (t / 4)));
    }
    const parts = [
      String(Math.floor(1e7)),
      String(Math.floor(1e3)),
      String(Math.floor(4e3)),
      String(Math.floor(8e3)),
      String(Math.floor(1e11)),
    ];
    return parts.join('-');
  };

  const webId = [...e(null)].map((x) => (x in '018' ? e(parseInt(x)) : x)).join('');
  return webId.replace(/-/g, '').slice(0, 19);
}

// 缓存 douyin.js 上下文
let signContext: vm.Context | null = null;

/**
 * 加载并执行 douyin.js 获取签名函数
 */
async function getSignFunction(): Promise<(params: string, userAgent: string) => string> {
  // 如果已经有缓存的上下文，直接返回
  if (signContext) {
    return (signContext as vm.Context)['sign_datail'];
  }

  // 读取 douyin.js
  const douyinJsPath = path.resolve(__dirname, '../../../../libs/douyin.js');
  const douyinJsCode = fs.readFileSync(douyinJsPath, 'utf-8');

  // 创建沙箱上下文
  const sandbox = {
    console: {
      log: () => {},
      error: () => {},
    },
    Math: Math,
    JSON: JSON,
    encodeURIComponent: encodeURIComponent,
    String: String,
    Object: Object,
    Array: Array,
    parseInt: parseInt,
    Date: Date,
  };

  signContext = vm.createContext(sandbox);

  // 执行 JS 代码
  try {
    vm.runInContext(douyinJsCode, signContext, { timeout: 5000 });
    log.debug('[DouYinSigner] douyin.js loaded successfully');
  } catch (err) {
    log.error('[DouYinSigner] Failed to load douyin.js:', err);
    throw new Error('Failed to initialize DouYin signer');
  }

  return (signContext as vm.Context)['sign_datail'];
}

/**
 * 通过 Playwright page 获取 a_bogus (优先方案)
 * 对应 Python 实现: help.py::get_a_bogus_from_playwright()
 * @deprecated 此方法已弃用，仅作为后备方案
 */
async function getABogusFromPage(
  page: Page,
  params: string,
  userAgent: string
): Promise<string> {
  try {
    const aBogus = await page.evaluate(
      `([params, ua]) => window.bdms.init._v[2].p[42].apply(null, [0, 1, 8, params, '', ua])`,
      [params, userAgent]
    );
    return aBogus as string;
  } catch (err) {
    log.warn('[DouYinSigner] page.evaluate approach failed:', err);
    throw err;
  }
}

/**
 * 通过本地 JS 执行获取 a_bogus
 * 对应 Python 实现: help.py::get_a_bogus_from_js()
 */
async function getABogusFromJs(
  params: string,
  userAgent: string
): Promise<string> {
  try {
    const signFn = await getSignFunction();
    return signFn(params, userAgent);
  } catch (err) {
    log.error('[DouYinSigner] JS execution failed:', err);
    throw new Error('Failed to generate a_bogus signature');
  }
}

/**
 * 获取 a_bogus 签名
 * 优先尝试 page.evaluate，失败后回退到本地 JS 执行
 *
 * @param url 请求 URL (不含 query string)
 * @param params  query string 参数
 * @param userAgent User-Agent 字符串
 * @param page Playwright page 实例（可选，用于优先方案）
 */
export async function getABogus(
  url: string,
  params: string,
  userAgent: string,
  page?: Page
): Promise<string> {
  // 优先尝试 page.evaluate
  if (page) {
    try {
      log.debug('[DouYinSigner] Trying page.evaluate approach...');
      return await getABogusFromPage(page, params, userAgent);
    } catch {
      log.debug('[DouYinSigner] page.evaluate failed, falling back to local JS');
    }
  }

  // 回退到本地 JS 执行
  return await getABogusFromJs(params, userAgent);
}

/**
 * 清除签名上下文缓存
 */
export function clearSignContext(): void {
  signContext = null;
}
