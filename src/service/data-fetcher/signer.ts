/**
 * 签名器接口抽象
 *
 * 统一不同平台的签名机制，使 BaseFetcher 可以使用统一的 Signer 接口。
 * MVP 仅支持抖音。
 */
import type { Page } from 'playwright';
import { getABogus, generateWebId } from './douyin/signer.js';

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

/**
 * 获取指定平台的签名器实例（MVP 仅支持抖音）
 */
export function getPlatformSigner(platform: string): Signer | null {
  if (platform === 'douyin') {
    return new DouYinSigner();
  }
  return null;
}

/**
 * 抖音签名器实现
 */
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
