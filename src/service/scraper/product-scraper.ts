import http from 'http';
import https from 'https';
import type { ProductInfo } from '../../shared/types.js';

const INTERNAL_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
];

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

function isInRange(ip: string, start: string, end: string): boolean {
  const ipNum = ipToNumber(ip);
  const startNum = ipToNumber(start);
  const endNum = ipToNumber(end);
  return ipNum >= startNum && ipNum <= endNum;
}

/**
 * Parse an IPv6 address string into an array of 8 big-endian 16-bit numbers.
 * Returns null on parse error.
 */
function parseIPv6Parts(addr: string): number[] | null {
  // Handle IPv4-mapped IPv6 like ::ffff:127.0.0.1
  const ipv4Match = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4Match) {
    const ipv4Parts = ipv4Match[1].split('.').map(Number);
    if (ipv4Parts.length !== 4 || ipv4Parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
    return [0, 0, 0, 0, 0, 0xffff, (ipv4Parts[0] << 8) | ipv4Parts[1], (ipv4Parts[2] << 8) | ipv4Parts[3]];
  }

  // Handle bare IPv6 like ::1, fe80::, fc00::, 2001:db8::
  // Also handle bracket-wrapped: [::1] -> ::1
  const clean = addr.replace(/^\[|\]$/g, '');
  const parts: string[] = clean.split(':');

  // Expand :: to full 8 groups
  const emptyIndex = parts.indexOf('');
  if (emptyIndex === -1) {
    if (parts.length !== 8) return null;
  } else {
    const nonEmpty = parts.filter(p => p !== '');
    const emptyCount = 8 - nonEmpty.length;
    if (emptyCount < 1) return null;
    // Rebuild with correct number of empty groups
    const expanded: string[] = [];
    for (let i = 0; i < emptyIndex; i++) expanded.push(parts[i]);
    for (let i = 0; i < emptyCount; i++) expanded.push('0');
    for (let i = emptyIndex + 1; i < parts.length; i++) expanded.push(parts[i]);
    while (expanded.length < 8) expanded.push('0');
    parts.length = 0;
    for (let i = 0; i < 8; i++) parts[i] = expanded[i] || '0';
  }

  if (parts.length !== 8) return null;
  return parts.map(p => {
    if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return NaN;
    return parseInt(p, 16);
  });
}

/**
 * Check if a bare IPv6 address string is an internal address.
 * Does NOT handle bracket notation — caller must strip [].
 */
function isIPv6Internal(addr: string): boolean {
  // Loopback ::1
  if (addr === '::1') return true;

  const parts = parseIPv6Parts(addr);
  if (!parts || parts.length !== 8) return false;
  if (parts.some(isNaN)) return false;

  const group0 = parts[0];
  const group1 = parts[1];

  // ::ffff:0:0/96 — IPv4-mapped IPv6 (first 6 groups zero, group5 = 0xffff)
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 && parts[4] === 0 && parts[5] === 0xffff) {
    return true;
  }

  // fc00::/7 — Unique Local Addresses (first 7 bits = 1111110)
  // First byte must be 0xfc or 0xfd
  const firstByte = (group0 >> 8) & 0xff;
  if (firstByte >= 0xfc && firstByte <= 0xfd) return true;

  // fe80::/10 — Link-Local (first 10 bits = 1111111010, i.e. first byte 0xfe80-0xfeff)
  if (firstByte >= 0xfe80 && firstByte <= 0xfeff) return true;

  // 2001:db8::/32 — Documentation (first 32 bits = 2001:0db8)
  if (group0 === 0x2001 && group1 === 0x0db8) return true;

  return false;
}

function isInternalIP(host: string): boolean {
  // Strip bracket notation for IPv6 URLs: [::1] -> ::1
  const cleanHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  // Check explicit hosts (without port)
  const hostWithoutPort = cleanHost.split(':')[0];
  if (INTERNAL_HOSTS.includes(hostWithoutPort)) return true;

  // Check ::1 loopback (covers [::1] and [::1]:port)
  if (cleanHost === '::1' || cleanHost.startsWith('::1]')) return true;

  // Check IPv6 addresses (bare or bracket-wrapped)
  if (cleanHost.includes(':')) {
    return isIPv6Internal(cleanHost);
  }

  // Check IPv4 private ranges
  const ipv4Host = hostWithoutPort;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv4Host)) {
    if (isInRange(ipv4Host, '10.0.0.0', '10.255.255.255')) return true;
    if (isInRange(ipv4Host, '172.16.0.0', '172.31.255.255')) return true;
    if (isInRange(ipv4Host, '192.168.0.0', '192.168.255.255')) return true;
  }
  return false;
}

function extractHost(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

interface ScrapeResult {
  success: boolean;
  data?: ProductInfo;
  error?: string;
}

export async function scrapeProductInfo(url: string): Promise<ScrapeResult> {
  // SSRF 防护
  const host = extractHost(url);
  if (!host) {
    return { success: false, error: '无效的 URL' };
  }
  if (isInternalIP(host)) {
    return { success: false, error: 'SSRF: 拒绝访问内网地址' };
  }

  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }

      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        try {
          const name = extractMeta(html, 'og:title')
            || extractTitle(html)
            || extractTitleFromUrl(url);
          const description = extractMeta(html, 'og:description')
            || extractMeta(html, 'description')
            || extractMeta(html, 'product:description')
            || '';
          const images = extractImages(html);

          if (!name) {
            resolve({ success: false, error: '无法提取产品名称' });
            return;
          }

          // 设计文档第15节：抓取 Optional 字段（价格/规格/品牌/适用人群）
          const price = extractMeta(html, 'product:price:amount')
            || extractJsonLdPrice(html)
            || extractMicrodataPrice(html)
            || undefined;
          const brand = extractMeta(html, 'product:brand')
            || extractJsonLdBrand(html)
            || undefined;
          const specs = extractJsonLdSpecs(html) || extractMicrodataSpecs(html) || undefined;
          const targetAudience = extractMeta(html, 'product:age_group')
            || extractMeta(html, 'product:target_gender')
            || undefined;

          resolve({
            success: true,
            data: {
              name,
              description,
              images,
              ...(price && { price }),
              ...(brand && { brand }),
              ...(specs && { specs }),
              ...(targetAudience && { targetAudience }),
            },
          });
        } catch (e) {
          resolve({ success: false, error: '解析页面失败' });
        }
      });
    });

    req.on('error', () => resolve({ success: false, error: '网络请求失败' }));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, error: '请求超时' });
    });
  });
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHTMLEntities(match[1]);
  }
  return null;
}

function extractImages(html: string): string[] {
  const images: string[] = [];
  const ogImage = extractMeta(html, 'og:image');
  if (ogImage) images.push(ogImage);

  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of imgMatches) {
    const src = match[1];
    if (src.startsWith('http') && !images.includes(src)) {
      images.push(src);
    }
  }
  return images.slice(0, 10); // 最多10张
}

/**
 * 从 JSON-LD 中提取价格
 */
function extractJsonLdPrice(html: string): string | undefined {
  try {
    const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of matches) {
      const json = JSON.parse(match[1]);
      const price = extractPriceFromJsonLd(json);
      if (price) return price;
    }
  } catch { /* ignore */ }
  return undefined;
}

function extractPriceFromJsonLd(obj: unknown): string | undefined {
  if (typeof obj === 'string') return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const p = extractPriceFromJsonLd(item);
      if (p) return p;
    }
    return undefined;
  }
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    // 常见价格字段路径
    const price = o.offers ? extractPriceFromJsonLd((o.offers as Record<string, unknown>)) : undefined;
    if (price) return price;
    const priceStr = (o.price || o.priceCurrency) as string | undefined;
    if (priceStr && typeof priceStr === 'string' && /^\d/.test(priceStr)) return priceStr;
    // 递归搜索 offers 数组
    if (Array.isArray(o.offers)) {
      for (const offer of o.offers) {
        const p = extractPriceFromJsonLd(offer);
        if (p) return p;
      }
    }
  }
  return undefined;
}

/**
 * 从 Microdata 中提取价格
 */
function extractMicrodataPrice(html: string): string | undefined {
  const match = html.match(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<[^>]+itemprop=["']price["'][^>]*>([^<]+)<\/[^>]+>/i);
  return match ? match[1].trim() : undefined;
}

/**
 * 从 JSON-LD 中提取品牌
 */
function extractJsonLdBrand(html: string): string | undefined {
  try {
    const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of matches) {
      const json = JSON.parse(match[1]);
      const brand = extractBrandFromJsonLd(json);
      if (brand) return brand;
    }
  } catch { /* ignore */ }
  return undefined;
}

function extractBrandFromJsonLd(obj: unknown): string | undefined {
  if (typeof obj === 'string') return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const b = extractBrandFromJsonLd(item);
      if (b) return b;
    }
    return undefined;
  }
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const brand = o.brand;
    if (typeof brand === 'string') return brand;
    if (brand && typeof brand === 'object') {
      const brandObj = brand as Record<string, unknown>;
      if (typeof brandObj.name === 'string') return brandObj.name;
    }
  }
  return undefined;
}

/**
 * 从 JSON-LD 中提取规格（以"; "分隔的字符串）
 */
function extractJsonLdSpecs(html: string): string | undefined {
  try {
    const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of matches) {
      const json = JSON.parse(match[1]);
      const specs = extractSpecsFromJsonLd(json);
      if (specs) return specs;
    }
  } catch { /* ignore */ }
  return undefined;
}

function extractSpecsFromJsonLd(obj: unknown): string | undefined {
  if (typeof obj === 'string') return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const s = extractSpecsFromJsonLd(item);
      if (s) return s;
    }
    return undefined;
  }
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    // productSpecification 通常在 offers 或 additionalProperty 中
    const offers = o.offers;
    if (Array.isArray(offers)) {
      const parts: string[] = [];
      for (const offer of offers) {
        const specs = extractSpecsFromJsonLd(offer);
        if (specs) parts.push(specs);
      }
      if (parts.length > 0) return parts.join('; ');
    }
    if (o.additionalProperty) {
      const specs = extractSpecsFromJsonLd(o.additionalProperty);
      if (specs) return specs;
    }
  }
  return undefined;
}

/**
 * 从 Microdata 中提取规格
 */
function extractMicrodataSpecs(html: string): string | undefined {
  // 匹配 Microdata itemprop="productID" 或 "sku" 等
  const matches = html.matchAll(/<[^>]+itemprop=["'](?:productID|sku|model)["'][^>]*>([^<]+)<\/[^>]+>/gi);
  const specs: string[] = [];
  for (const match of matches) {
    specs.push(match[1].trim());
  }
  return specs.length > 0 ? specs.join('; ') : undefined;
}

function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.split('/').pop()?.replace(/-/g, ' ').replace(/_/g, ' ') || '';
  } catch {
    return '';
  }
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}