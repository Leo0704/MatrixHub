import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFetcher, createAllFetchers } from './factory';
import type { Platform } from '../../shared/types';

describe('DataFetcher Factory', () => {
  let fetchers: ReturnType<typeof createFetcher>[] = [];

  afterEach(async () => {
    for (const fetcher of fetchers) {
      await fetcher.close();
    }
    fetchers = [];
  });

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
    fetchers = createAllFetchers();
    expect(fetchers).toHaveLength(3);
    expect(fetchers[0].platform).toBe('douyin');
    expect(fetchers[1].platform).toBe('xiaohongshu');
    expect(fetchers[2].platform).toBe('kuaishou');
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
