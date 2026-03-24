/**
 * 抖音 a_bogus 签名获取
 * 基于 MediaCrawler 的实现
 *
 * 安全说明: 此文件不再使用 vm.runInContext() 加载外部 JS，
 * 仅使用 page.evaluate() 从已加载的页面获取签名，避免 RCE 风险
 */

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

  const webId = [...e(null)].map((x) => ('018'.includes(x) ? e(parseInt(x)) : x)).join('');
  return webId.replace(/-/g, '').slice(0, 19);
}

/**
 * 通过 Playwright page 获取 a_bogus
 * 对应 Python 实现: help.py::get_a_bogus_from_playwright()
 *
 * 注意: 此方法依赖于页面中已加载抖音的 bdms SDK
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
 * 获取 a_bogus 签名
 * 使用 page.evaluate 从页面获取签名
 *
 * @param url 请求 URL (不含 query string)
 * @param params query string 参数
 * @param userAgent User-Agent 字符串
 * @param page Playwright page 实例（必需）
 */
export async function getABogus(
  url: string,
  params: string,
  userAgent: string,
  page?: Page
): Promise<string> {
  if (!page) {
    throw new Error('getABogus requires a Playwright page instance');
  }

  log.debug('[DouYinSigner] Using page.evaluate approach...');
  return await getABogusFromPage(page, params, userAgent);
}

/**
 * 清除签名上下文缓存（保留此函数以保持 API 兼容性）
 */
export function clearSignContext(): void {
  // 不再需要清理，因为不再使用 vm 上下文
  log.debug('[DouYinSigner] clearSignContext called (no-op, VM context no longer used)');
}
