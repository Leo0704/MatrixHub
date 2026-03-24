import { describe, it, expect, beforeEach } from 'vitest';
import { createFetcher, createAllFetchers } from './factory';
import type { Platform } from '../../shared/types';

describe('DataFetcher Factory', () => {
  it('should create DouYin fetcher', () => {
    const fetcher = createFetcher('douyin');
    expect(fetcher).toBeDefined();
    expect(fetcher.platform).toBe('douyin');
  });

  it('should create XiaoHongShu fetcher', () => {
    const fetcher = createFetcher('xiaohongshu');
    expect(fetcher).toBeDefined();
    expect(fetcher.platform).toBe('xiaohongshu');
  });

  it('should create Kuaishou fetcher', () => {
    const fetcher = createFetcher('kuaishou');
    expect(fetcher).toBeDefined();
    expect(fetcher.platform).toBe('kuaishou');
  });

  it('should throw for unknown platform', () => {
    expect(() => createFetcher('unknown' as Platform)).toThrow('Unsupported platform');
  });

  it('should create all fetchers', () => {
    const fetchers = createAllFetchers();
    expect(fetchers).toHaveLength(3);
  });
});

describe('HotTopic normalization', () => {
  it('should normalize partial topic data', () => {
    const fetcher = createFetcher('douyin');
    const partial = {
      title: '测试话题',
      heat: 1000,
    };
    const normalized = fetcher.normalizeTopic(partial, 1);
    expect(normalized.title).toBe('测试话题');
    expect(normalized.heat).toBe(1000);
    expect(normalized.rank).toBe(1);
    expect(normalized.platform).toBe('douyin');
  });
});
