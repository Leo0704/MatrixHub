import type { Platform } from '../../shared/types.js';

export interface HotTopic {
  id: string;
  title: string;
  rank: number;
  heat: number;           // 热度值
  link: string;           // 话题链接
  coverUrl?: string;      // 封面图
  platform: Platform;
  fetchedAt: number;
}

export interface FetchOptions {
  limit?: number;         // 最多获取条数
  category?: string;       // 分类筛选
}

export interface FetchResult {
  topics: HotTopic[];
  source: Platform | 'all';
  fetchedAt: number;
  error?: string;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public platform: Platform,
    public code?: string
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export class LoginRequiredError extends Error {
  constructor(platform: Platform) {
    super(`需要登录 ${platform} 账号`);
    this.name = 'LoginRequiredError';
  }
}
