/**
 * 小红书热点话题获取
 * 实现 BaseFetcher 接口
 */

import { Page } from 'playwright';
import log from 'electron-log';
import { BaseFetcher } from '../base-fetcher.js';
import { XiaoHongShuClient } from './client.js';
import type { HotTopic, FetchOptions, FetchResult } from '../types.js';
import { LoginRequiredError } from '../types.js';
import type { Platform } from '../../../shared/types.js';
import { createPage } from '../../platform-launcher.js';

// 默认请求头
const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.xiaohongshu.com/',
  'Origin': 'https://www.xiaohongshu.com',
};

/**
 * 小红书热点话题获取器
 */
export class XiaoHongShuFetcher extends BaseFetcher {
  private client: XiaoHongShuClient | null = null;
  private loginUrl = 'https://www.xiaohongshu.com/';
  private qrCodeSelector = '.login-wrapper'; // 小红书登录容器选择器

  constructor() {
    super('xiaohongshu');
  }

  /**
   * 确保页面已创建
   */
  protected async ensurePage(): Promise<Page> {
    if (!this.page) {
      log.info('[XiaoHongShuFetcher] 创建新页面...');
      this.page = await createPage('xiaohongshu');
    }
    return this.page;
  }

  /**
   * 获取 XiaoHongShuClient 实例
   */
  private async getClient(): Promise<XiaoHongShuClient> {
    if (!this.client) {
      const page = await this.ensurePage();

      // 获取初始 cookies
      const cookies = await page.context().cookies();
      const cookieDict: Record<string, string> = {};
      for (const cookie of cookies) {
        cookieDict[cookie.name] = cookie.value;
      }

      this.client = new XiaoHongShuClient({
        page,
        headers: { ...DEFAULT_HEADERS },
        cookieDict,
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
      log.warn('[XiaoHongShuFetcher] 登录状态检查失败:', err);
      return false;
    }
  }

  /**
   * 登录流程 - 等待扫码
   */
  async login(): Promise<void> {
    log.info('[XiaoHongShuFetcher] 开始登录流程...');

    const page = await this.ensurePage();

    // 访问登录页
    await page.goto(this.loginUrl, { waitUntil: 'networkidle' });

    // 等待二维码出现
    try {
      await page.waitForSelector(this.qrCodeSelector, { timeout: 10000 });
      log.info('[XiaoHongShuFetcher] 请扫描二维码登录...');

      // 等待登录成功（通过查询用户信息确认）
      await page.waitForFunction(
        async () => {
          try {
            // 尝试从 localStorage 获取登录状态
            const localStorage = window.localStorage;
            const a1 = localStorage.getItem('a1');
            return !!a1;
          } catch {
            return false;
          }
        },
        { timeout: 300000 } // 5分钟超时
      );

      log.info('[XiaoHongShuFetcher] 登录成功！');

      // 更新客户端 cookie
      if (this.client) {
        await this.client.updateCookies();
      }
    } catch (err) {
      log.error('[XiaoHongShuFetcher] 登录失败:', err);
      throw new LoginRequiredError('xiaohongshu');
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
      log.info('[XiaoHongShuFetcher] 获取热点话题...');
      const response = await client.getHotSearchList();

      // 解析响应
      const topics = this.parseHotTopics(response, limit);

      log.info(`[XiaoHongShuFetcher] 获取到 ${topics.length} 条热点话题`);

      return this.buildResult(topics);
    } catch (err) {
      const error = err as Error;
      log.error('[XiaoHongShuFetcher] 获取热点话题失败:', error);

      return {
        topics: [],
        source: 'xiaohongshu',
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
      // 小红书 API 返回结构: { items: [...] } 或直接是数组
      let items: Array<Record<string, unknown>> = [];

      if (Array.isArray(response)) {
        items = response as Array<Record<string, unknown>>;
      } else if (response['items'] && Array.isArray(response['items'])) {
        items = response['items'] as Array<Record<string, unknown>>;
      } else if (response['data'] && Array.isArray((response['data'] as Record<string, unknown>)['items'])) {
        items = (response['data'] as Record<string, unknown>)['items'] as Array<Record<string, unknown>>;
      }

      // 映射到 HotTopic 格式
      for (let i = 0; i < Math.min(items.length, limit); i++) {
        const item = items[i];
        const note = (item['note'] || item) as Record<string, unknown>;
        const hotValue = (item['hot_value'] || item['heat'] || 0) as number;

        // 小红书的热门话题可能在 different 字段中
        const title = (note['title'] || note['word'] || note['display_title'] || '未知话题') as string;
        const id = (note['id'] || note['note_id'] || String(i + 1)) as string;

        // 构建话题链接
        let link = '';
        if (id && id !== String(i + 1)) {
          link = `https://www.xiaohongshu.com/explore/${id}`;
        }

        const topic: Partial<HotTopic> = {
          id: String(id),
          title: String(title),
          rank: i + 1,
          heat: typeof hotValue === 'number' ? hotValue : 0,
          link,
        };

        topics.push(this.normalizeTopic(topic, i + 1));
      }
    } catch (err) {
      log.error('[XiaoHongShuFetcher] 解析热点话题失败:', err);
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
