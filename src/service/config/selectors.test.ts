import { describe, it, expect } from 'vitest';
import {
  getPublishSelectors,
  getAutoSelectors,
  getBaseUrl,
  getPublishUrl,
  PLATFORM_BASE_URLS,
  PUBLISH_URLS,
} from './selectors.js';

describe('selectors', () => {
  describe('getPublishSelectors()', () => {
    it('should return title_input selectors for douyin', () => {
      const items = getPublishSelectors('douyin', 'title_input');
      expect(items).toBeDefined();
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].value).toContain('title');
    });

    it('should return content_input selectors for kuaishou', () => {
      const items = getPublishSelectors('kuaishou', 'content_input');
      expect(items).toBeDefined();
      expect(items.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown key', () => {
      const items = getPublishSelectors('douyin', 'nonexistent');
      expect(items).toEqual([]);
    });

    it('should return xiaohongshu selectors normally (xiaohongshu is valid)', () => {
      const items = getPublishSelectors('xiaohongshu', 'title_input');
      expect(items).toBeDefined();
      expect(items.length).toBeGreaterThan(0);
    });

    it('should return SelectorItem objects with value field', () => {
      const items = getPublishSelectors('douyin', 'video_input');
      items.forEach(item => {
        expect(item.value).toBeDefined();
        expect(typeof item.value).toBe('string');
      });
    });
  });

  describe('getAutoSelectors()', () => {
    it('should return comment selectors for douyin', () => {
      const items = getAutoSelectors('douyin', 'comment_input');
      expect(items).toBeDefined();
      expect(items.length).toBeGreaterThan(0);
    });

    it('should return like selectors for kuaishou', () => {
      const items = getAutoSelectors('kuaishou', 'like_button');
      expect(items).toBeDefined();
      expect(items.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown key', () => {
      const items = getAutoSelectors('douyin', 'nonexistent');
      expect(items).toEqual([]);
    });
  });

  describe('getBaseUrl()', () => {
    it('should return douyin URL', () => {
      expect(getBaseUrl('douyin')).toBe('https://www.douyin.com');
    });

    it('should return kuaishou URL', () => {
      expect(getBaseUrl('kuaishou')).toBe('https://www.kuaishou.com');
    });

    it('should return xiaohongshu URL', () => {
      expect(getBaseUrl('xiaohongshu')).toBe('https://www.xiaohongshu.com');
    });
  });

  describe('getPublishUrl()', () => {
    it('should return douyin creator URL', () => {
      expect(getPublishUrl('douyin')).toBe('https://creator.douyin.com/content/upload');
    });

    it('should return kuaishou URL', () => {
      expect(getPublishUrl('kuaishou')).toBe('https://cp.kuaishou.com/interaction/long-video/upload');
    });

    it('should return xiaohongshu creator URL', () => {
      expect(getPublishUrl('xiaohongshu')).toBe('https://creator.xiaohongshu.com/publish');
    });
  });

  describe('PLATFORM_BASE_URLS constant', () => {
    it('should have all three platforms', () => {
      expect(PLATFORM_BASE_URLS.douyin).toBe('https://www.douyin.com');
      expect(PLATFORM_BASE_URLS.kuaishou).toBe('https://www.kuaishou.com');
      expect(PLATFORM_BASE_URLS.xiaohongshu).toBe('https://www.xiaohongshu.com');
    });
  });

  describe('PUBLISH_URLS constant', () => {
    it('should have all three platforms', () => {
      expect(PUBLISH_URLS.douyin).toBe('https://creator.douyin.com/content/upload');
      expect(PUBLISH_URLS.kuaishou).toBe('https://cp.kuaishou.com/interaction/long-video/upload');
      expect(PUBLISH_URLS.xiaohongshu).toBe('https://creator.xiaohongshu.com/publish');
    });
  });
});
