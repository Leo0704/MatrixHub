import type { Platform, InputSource } from '../../shared/types.js';
import type { ParseResult, ParsedProduct } from './types.js';
import log from 'electron-log';

/**
 * SSRF protection: check if URL points to internal network
 */
function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Block loopback addresses
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private IP addresses
    const privateIpPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
    ];
    if (privateIpPatterns.some(pattern => pattern.test(hostname))) {
      return false;
    }

    // Block IPv6 link-local addresses
    if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * URL patterns for detecting product platform from URL
 */
export const PRODUCT_URL_PATTERNS = {
  taobao: /taobao\.com/i,
  tmall: /tmall\.com/i,
  jd: /jd\.com/i,
  pdd: /pinduoduo\.com|pdd/i,
  douyin: /douyin\.com|bytedance\.com/i,
};

/**
 * Detect platform from URL hostname
 */
function detectPlatform(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('taobao.com')) return 'taobao';
    if (hostname.includes('tmall.com')) return 'tmall';
    if (hostname.includes('jd.com')) return 'jd';
    if (hostname.includes('pinduoduo.com') || hostname.includes('pdd')) return 'pdd';
    if (hostname.includes('douyin.com') || hostname.includes('bytedance.com')) return 'douyin';
    return 'generic';
  } catch {
    return 'generic';
  }
}

/**
 * Parse URL and route to appropriate parser based on platform
 */
export async function parseUrl(url: string): Promise<ParseResult> {
  const platform = detectPlatform(url);
  log.info(`[InputParser] Parsing URL: ${url}, detected platform: ${platform}`);

  switch (platform) {
    case 'taobao':
    case 'tmall':
      return parseTaobaoTmall(url);
    case 'jd':
      return parseJD(url);
    case 'douyin':
      return parseDouyinShop(url);
    default:
      return parseGenericUrl(url);
  }
}

/**
 * Placeholder parser for Taobao/Tmall - not yet implemented
 */
async function parseTaobaoTmall(url: string): Promise<ParseResult> {
  log.info(`[InputParser] Taobao/Tmall parser called for: ${url}`);
  return {
    success: false,
    error: 'Taobao/Tmall 商品解析功能待实现，请使用「产品详情」模式手动输入产品信息',
  };
}

/**
 * Placeholder parser for JD.com - not yet implemented
 */
async function parseJD(url: string): Promise<ParseResult> {
  log.info(`[InputParser] JD parser called for: ${url}`);
  return {
    success: false,
    error: 'JD.com 商品解析功能待实现，请使用「产品详情」模式手动输入产品信息',
  };
}

/**
 * Placeholder parser for Douyin Shop - not yet implemented
 */
async function parseDouyinShop(url: string): Promise<ParseResult> {
  log.info(`[InputParser] Douyin Shop parser called for: ${url}`);
  return {
    success: false,
    error: '抖音小店商品解析功能待实现，请使用「产品详情」模式手动输入产品信息',
  };
}

/**
 * Parse generic URL by fetching page title and meta description
 */
async function parseGenericUrl(url: string): Promise<ParseResult> {
  log.info(`[InputParser] Generic URL parser called for: ${url}`);

  // SSRF protection
  if (!isUrlSafe(url)) {
    return {
      success: false,
      error: 'URL points to internal network, not allowed to parse',
    };
  }

  try {
    const response = await fetch(url, {
      redirect: 'error',
      headers: {
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    const description = descMatch ? descMatch[1].trim() : '';

    if (!title && !description) {
      return {
        success: false,
        error: 'Could not extract title or description from page',
      };
    }

    return {
      success: true,
      product: {
        name: title || 'Untitled',
        description: description || 'No description available',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`[InputParser] Generic URL parsing failed: ${errorMessage}`);
    return {
      success: false,
      error: `Failed to parse URL: ${errorMessage}`,
    };
  }
}

/**
 * Parse product detail from text input
 * First line is product name, rest is description
 */
export function parseProductDetail(detail: string): ParseResult {
  log.info(`[InputParser] Parsing product detail, length: ${detail.length}`);

  const lines = detail.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length === 0) {
    return {
      success: false,
      error: 'Product detail is empty',
    };
  }

  const name = lines[0];
  const description = lines.slice(1).join('\n');

  return {
    success: true,
    product: {
      name,
      description: description || name, // Use name as description if no additional lines
    },
  };
}

/**
 * Parse hot topic input
 * Returns the keyword as product name
 */
export function parseHotTopic(hotTopic: { keyword: string; platform: Platform }): ParseResult {
  log.info(`[InputParser] Parsing hot topic: ${hotTopic.keyword} from ${hotTopic.platform}`);

  return {
    success: true,
    product: {
      name: hotTopic.keyword,
      description: `Hot topic from ${hotTopic.platform}: ${hotTopic.keyword}`,
    },
  };
}

/**
 * Main entry point for parsing any input source
 */
export async function parseInput(source: InputSource): Promise<ParseResult> {
  log.info(`[InputParser] Parsing input source type: ${source.type}`);

  switch (source.type) {
    case 'url':
      if (!source.url) {
        return {
          success: false,
          error: 'URL is required for url type input',
        };
      }
      return parseUrl(source.url);

    case 'product_detail':
      if (!source.productDetail) {
        return {
          success: false,
          error: 'Product detail is required for product_detail type input',
        };
      }
      return parseProductDetail(source.productDetail);

    case 'hot_topic':
      if (!source.hotTopic) {
        return {
          success: false,
          error: 'Hot topic is required for hot_topic type input',
        };
      }
      return parseHotTopic(source.hotTopic);

    default:
      return {
        success: false,
        error: `Unknown input source type: ${(source as InputSource).type}`,
      };
  }
}
