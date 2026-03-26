import { Page } from 'playwright';
import type { Platform } from '../../shared/types.js';
import type { HotTopic, FetchOptions, FetchResult } from './types.js';
import { LoginRequiredError } from './types.js';
import log from 'electron-log';

const LOGIN_TIMEOUT_MS = 300000; // 5 minutes

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
    let isLoggedIn = false;
    try {
      isLoggedIn = await this.checkLoginStatus();
    } catch (err) {
      // Network/timeout errors from checkLoginStatus indicate the page
      // is unreachable, not that the user is logged out — rethrow
      const error = err as Error;
      if (error.name === 'TimeoutError' || error.name === 'TargetClosedError') {
        log.warn(`[${this.platform}] checkLoginStatus failed (${error.name}), rethrowing`);
        throw err;
      }
      // For other errors (e.g., eval errors), treat as not logged in
      log.warn(`[${this.platform}] checkLoginStatus error, treating as not logged in:`, error.message);
      isLoggedIn = false;
    }

    if (!isLoggedIn) {
      log.info(`[${this.platform}] 未登录，开始登录流程`);
      try {
        await this.login();
      } catch (loginErr) {
        throw new LoginRequiredError(this.platform);
      }
    }
  }

  protected async getPage(): Promise<Page> {
    if (!this.page) {
      throw new Error('Page not initialized. Call ensureLogin first.');
    }
    return this.page;
  }

  /**
   * Wait for a condition with timeout during login.
   * Subclasses use this in their login() implementations.
   */
  protected async waitForLoginCondition(
    condition: () => Promise<boolean> | boolean,
    timeoutMs = LOGIN_TIMEOUT_MS
  ): Promise<void> {
    await this.page!.waitForFunction(
      async () => {
        try {
          return await condition();
        } catch {
          return false;
        }
      },
      { timeout: timeoutMs }
    );
  }

  async close(): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      await this.page.close();
    }
    this.page = null;
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
