import { describe, it, expect } from 'vitest';
import { scrapeProductInfo } from './product-scraper';

describe('product-scraper', () => {
  it('should reject internal IP URLs', async () => {
    const result = await scrapeProductInfo('http://127.0.0.1:8080/product');
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
  });

  it('should reject localhost URLs', async () => {
    const result = await scrapeProductInfo('http://localhost:3000/product');
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
  });

  it('should reject private IP ranges', async () => {
    const result = await scrapeProductInfo('http://10.0.0.1:8080/product');
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
  });

  it('should reject invalid URLs', async () => {
    const result = await scrapeProductInfo('not-a-url');
    expect(result.success).toBe(false);
    expect(result.error).toBe('无效的 URL');
  });
});