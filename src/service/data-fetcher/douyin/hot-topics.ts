/**
 * 抖音热点话题获取
 * 实现 BaseFetcher 接口
 */

import { Page } from 'playwright';
import log from 'electron-log';
import { BaseFetcher } from '../base-fetcher.js';
import { DouYinClient, DouYinClientConfig } from './client.js';
import type { HotTopic, FetchOptions, FetchResult } from '../types.js';
import type { Platform } from '../../../shared/types.js';
import { createPage } from '../../platform-launcher.js';

// 默认请求头
const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.douyin.com/',
  'Origin': 'https://www.douyin.com',
};

/**
 * 抖音热点话题获取器
 */
export class DouYinFetcher extends BaseFetcher {
  private client: DouYinClient | null = null;
  private loginUrl = 'https://www.douyin.com/';
  private qrCodeSelector = '.login-qrcode';

  constructor() {
    super('douyin');
  }

  /**
   * 确保页面已创建
   */
  protected async ensurePage(): Promise<Page> {
    if (!this.page) {
      log.info('[DouYinFetcher] 创建新页面...');
      this.page = await createPage('douyin');
    }
    return this.page;
  }

  /**
   * 获取 DouYinClient 实例
   */
  private async getClient(): Promise<DouYinClient> {
    if (!this.client) {
      const page = await this.ensurePage();
      this.client = new DouYinClient({
        page,
        headers: { ...DEFAULT_HEADERS },
      });
    }
    return this.client;
  }

  /**
   * 检查登录状态
   */
  async checkLoginStatus(): Promise<boolean> {
    try {
      const client = await this.getClient();
      return await client.pong();
    } catch (err) {
      log.warn('[DouYinFetcher] 登录状态检查失败:', err);
      return false;
    }
  }

  /**
   * 登录流程 - 等待扫码
   */
  async login(): Promise<void> {
    log.info('[DouYinFetcher] 开始登录流程...');

    const page = await this.ensurePage();

    // 访问登录页
    await page.goto(this.loginUrl, { waitUntil: 'networkidle' });

    // 等待二维码出现
    try {
      await page.waitForSelector(this.qrCodeSelector, { timeout: 10000 });
      log.info('[DouYinFetcher] 请扫描二维码登录...');

      // 等待登录成功（localStorage 中 HasUserLogin = 1）
      await page.waitForFunction(
        () => window.localStorage.getItem('HasUserLogin') === '1',
        { timeout: 300000 } // 5分钟超时
      );

      log.info('[DouYinFetcher] 登录成功！');

      // 更新客户端 cookie
      if (this.client) {
        await this.client.updateCookies();
      }
    } catch (err) {
      log.error('[DouYinFetcher] 登录失败:', err);
      throw new Error('登录超时或失败');
    }
  }

  /**
   * 获取热点话题
   */
  async fetchHotTopics(options?: FetchOptions): Promise<FetchResult> {
    const limit = options?.limit ?? 50;

    try {
      // 确保已登录
      await this.ensureLogin();

      // 获取客户端
      const client = await this.getClient();

      // 获取热搜列表
      log.info('[DouYinFetcher] 获取热点话题...');
      const response = await client.getHotSearchList();

      // 解析响应
      const topics = this.parseHotTopics(response, limit);

      log.info(`[DouYinFetcher] 获取到 ${topics.length} 条热点话题`);

      return this.buildResult(topics);
    } catch (err) {
      const error = err as Error;
      log.error('[DouYinFetcher] 获取热点话题失败:', error);

      return {
        topics: [],
        source: 'douyin',
        fetchedAt: Date.now(),
        error: error.message,
      };
    }
  }

  /**
   * 解析热搜响应
   */
  private parseHotTopics(response: Record<string, unknown>, limit: number): HotTopic[] {
    const topics: HotTopic[] = [];

    try {
      // 抖音 API 返回结构: { data: { word_list: [...] } }
      const data = response['data'] as Record<string, unknown> | undefined;
      if (!data) {
        log.warn('[DouYinFetcher] 响应中无 data 字段:', response);
        return topics;
      }

      const wordList = data['word_list'] as Array<Record<string, unknown>> | undefined;
      if (!wordList || !Array.isArray(wordList)) {
        log.warn('[DouYinFetcher] 响应中无 word_list 字段');
        return topics;
      }

      // 映射到 HotTopic 格式
      for (let i = 0; i < Math.min(wordList.length, limit); i++) {
        const item = wordList[i];
        const hotValue = item['hot_value'] as number | undefined;

        const topic: Partial<HotTopic> = {
          id: String(item['word_id'] ?? item['id'] ?? i + 1),
          title: String(item['word'] ?? item['title'] ?? '未知话题'),
          rank: i + 1,
          heat: typeof hotValue === 'number' ? hotValue : 0,
          link: `https://www.douyin.com/search/${encodeURIComponent(String(item['word'] ?? ''))}`,
        };

        topics.push(this.normalizeTopic(topic, i + 1));
      }
    } catch (err) {
      log.error('[DouYinFetcher] 解析热点话题失败:', err);
    }

    return topics;
  }

  /**
   * 关闭 fetcher，释放资源
   */
  async close(): Promise<void> {
    if (this.client) {
      // client 依赖 page，不需要单独关闭
      this.client = null;
    }
    await super.close();
  }
}
