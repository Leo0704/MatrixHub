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

function isInternalIP(host: string): boolean {
  // Check explicit hosts
  if (INTERNAL_HOSTS.includes(host) || host.startsWith('localhost:')) {
    return true;
  }
  // Check IPv4 private ranges
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isInRange(host, '10.0.0.0', '10.255.255.255')) return true;
    if (isInRange(host, '172.16.0.0', '172.31.255.255')) return true;
    if (isInRange(host, '192.168.0.0', '192.168.255.255')) return true;
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

          resolve({
            success: true,
            data: {
              name,
              description,
              images,
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