import { Page } from 'playwright';
import type { Platform } from '../../shared/types.js';
import type { HotTopic, FetchOptions, FetchResult } from './types.js';
import log from 'electron-log';

export abstract class BaseFetcher {
  protected page: Page | null = null;
  protected platform: Platform;
  protected cookies: Record<string, string> = {};

  constructor(platform: Platform) {
    this.platform = platform;
  }

  abstract fetchHotTopics(options?: FetchOptions): Promise<FetchResult>;

  abstract checkLoginStatus(): Promise<boolean>;

  abstract login(): Promise<void>;

  protected async ensureLogin(): Promise<void> {
    if (!(await this.checkLoginStatus())) {
      log.info(`[${this.platform}] 未登录，开始登录流程`);
      await this.login();
    }
  }

  protected async getPage(): Promise<Page> {
    if (!this.page) {
      throw new Error('Page not initialized. Call ensureLogin first.');
    }
    return this.page;
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }

  protected buildResult(topics: HotTopic[]): FetchResult {
    return {
      topics,
      source: this.platform,
      fetchedAt: Date.now(),
    };
  }

  protected normalizeTopic(topic: Partial<HotTopic>, rank: number): HotTopic {
    return {
      id: topic.id || String(rank),
      title: topic.title || '未知话题',
      rank,
      heat: topic.heat || 0,
      link: topic.link || '',
      coverUrl: topic.coverUrl,
      platform: this.platform,
      fetchedAt: Date.now(),
    };
  }
}
