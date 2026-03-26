/**
 * 签名器接口抽象
 *
 * 统一不同平台的签名机制，使 BaseFetcher 可以使用统一的 Signer 接口。
 * 各平台实现自己的签名逻辑：
 * - DouYin: a_bogus 签名
 * - XiaoHongShu: X-S/X-T 签名
 * - Kuaishou: GraphQL 端点无需签名
 */
import type { Page } from 'playwright';

export interface SignerResult {
  headers?: Record<string, string>;
  params?: Record<string, string | number>;
}

export interface Signer {
  /**
   * 获取签名
   * @param page Playwright page 实例
   * @param params 签名参数（URL、query string 或 body）
   * @param userAgent User-Agent 字符串（部分签名需要）
   */
  sign(page: Page, params: Record<string, unknown>, userAgent?: string): Promise<SignerResult>;
}

// Re-export platform-specific signers for convenience
export { getABogus, generateWebId } from './douyin/signer.js';
export { sign_with_playwright } from './xiaohongshu/signer.js';

/**
 * 获取指定平台的签名器实例
 */
export function getPlatformSigner(platform: string): Signer | null {
  switch (platform) {
    case 'douyin':
      return new DouYinSigner();
    case 'xiaohongshu':
      return new XiaoHongShuSigner();
    case 'kuaishou':
      // 快手 GraphQL 不需要签名
      return null;
    default:
      return null;
  }
}

/**
 * 抖音签名器实现
 */
import { getABogus, generateWebId } from './douyin/signer.js';

class DouYinSigner implements Signer {
  async sign(page: Page, params: Record<string, unknown>, userAgent?: string): Promise<SignerResult> {
    const url = params['url'] as string | undefined;
    const queryString = params['queryString'] as string | undefined;
    if (!url || !queryString) {
      throw new Error('DouYinSigner requires url and queryString params');
    }
    const aBogus = await getABogus(url, queryString, userAgent ?? '', page);
    return {
      params: { a_bogus: aBogus, webid: generateWebId() },
    };
  }
}

/**
 * 小红书签名器实现
 */
import { sign_with_playwright } from './xiaohongshu/signer.js';

class XiaoHongShuSigner implements Signer {
  async sign(page: Page, params: Record<string, unknown>, _userAgent?: string): Promise<SignerResult> {
    const uri = params['uri'] as string | undefined;
    const data = params['data'] as Record<string, unknown> | undefined;
    const a1 = params['a1'] as string | undefined;
    const method = (params['method'] as string | undefined) ?? 'POST';

    if (!uri || !data) {
      throw new Error('XiaoHongShuSigner requires uri and data params');
    }

    const signs = await sign_with_playwright(page, uri, data, a1 ?? '', method);
    return {
      headers: {
        'x-s': signs['x-s'],
        'x-t': signs['x-t'],
        'x-s-common': signs['x-s-common'],
        'x-b3-traceid': signs['x-b3-traceid'],
      },
    };
  }
}
