import type { Platform } from '../../shared/types.js';
import type { BaseFetcher } from './base-fetcher.js';
import { DouYinFetcher } from './douyin/hot-topics.js';
import { XiaoHongShuFetcher } from './xiaohongshu/hot-topics.js';
import { KuaishouFetcher } from './kuaishou/hot-topics.js';

export function createFetcher(platform: Platform): BaseFetcher {
  switch (platform) {
    case 'douyin':
      return new DouYinFetcher();
    case 'xiaohongshu':
      return new XiaoHongShuFetcher();
    case 'kuaishou':
      return new KuaishouFetcher();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export function createAllFetchers(): BaseFetcher[] {
  return [
    new DouYinFetcher(),
    new XiaoHongShuFetcher(),
    new KuaishouFetcher(),
  ];
}
