import type { Platform } from '../../shared/types.js';
import type { BaseFetcher } from './base-fetcher.js';
import { DouYinFetcher } from './douyin/hot-topics.js';

export function createFetcher(_platform: Platform): BaseFetcher {
  // MVP 只支持抖音
  return new DouYinFetcher();
}
