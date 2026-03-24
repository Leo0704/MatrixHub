/**
 * 快手热点话题获取
 * 使用 GraphQL API
 */

import { Page } from 'playwright';
import log from 'electron-log';
import { BaseFetcher } from '../base-fetcher.js';
import type { HotTopic, FetchOptions, FetchResult } from '../types.js';
import { createPage } from '../../platform-launcher.js';

// 快手 GraphQL API 端点
const GRAPHQL_ENDPOINT = 'https://www.kuaishou.com/graphql';

// 默认请求头
const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.kuaishou.com/',
  'Origin': 'https://www.kuaishou.com',
  'Content-Type': 'application/json;charset=UTF-8',
};

// HotSearch GraphQL 查询
const HOT_SEARCH_QUERY = `
query HotSearch {
  hotSearch {
    id
    title
    hotValue
    imageUrl
    link
  }
}
`;

/**
 * 快手热点话题获取器
 */
export class KuaishouFetcher extends BaseFetcher {
  private loginUrl = 'https://www.kuaishou.com/';
  private qrCodeSelector = '.login-button';

  constructor() {
    super('kuaishou');
  }

  /**
   * 确保页面已创建
   */
  protected async ensurePage(): Promise<Page> {
    if (!this.page) {
      log.info('[KuaishouFetcher] 创建新页面...');
      this.page = await createPage('kuaishou');
    }
    return this.page;
  }

  /**
   * 获取当前 cookies
   */
  private async getCookies(): Promise<Record<string, string>> {
    const page = await this.ensurePage();
    const cookies = await page.context().cookies();
    const cookieDict: Record<string, string> = {};
    for (const cookie of cookies) {
      cookieDict[cookie.name] = cookie.value;
    }
    return cookieDict;
  }

  /**
   * 检查登录状态
   */
  async checkLoginStatus(): Promise<boolean> {
    try {
      const cookies = await this.getCookies();
      // 快手通过 passToken cookie 判断登录状态
      const isLoggedIn = !!cookies['passToken'];
      log.info(`[KuaishouFetcher] 登录状态: ${isLoggedIn}`);
      return isLoggedIn;
    } catch (err) {
      log.warn('[KuaishouFetcher] 登录状态检查失败:', err);
      return false;
    }
  }

  /**
   * 登录流程 - 等待扫码
   */
  async login(): Promise<void> {
    log.info('[KuaishouFetcher] 开始登录流程...');

    const page = await this.ensurePage();

    // 访问快手首页
    await page.goto(this.loginUrl, { waitUntil: 'networkidle' });

    // 等待登录按钮出现并点击
    try {
      await page.waitForSelector(this.qrCodeSelector, { timeout: 10000 });
      log.info('[KuaishouFetcher] 点击登录按钮...');
      await page.click(this.qrCodeSelector);

      // 等待二维码出现
      const qrCodeModalSelector = '.qrcode-img';
      await page.waitForSelector(qrCodeModalSelector, { timeout: 10000 });
      log.info('[KuaishouFetcher] 请扫描二维码登录...');

      // 等待登录成功（passToken cookie 出现）
      await page.waitForFunction(
        () => {
          const cookies = document.cookie;
          return cookies.includes('passToken');
        },
        { timeout: 300000 } // 5分钟超时
      );

      log.info('[KuaishouFetcher] 登录成功！');
    } catch (err) {
      log.error('[KuaishouFetcher] 登录失败:', err);
      throw new Error('登录超时或失败');
    }
  }

  /**
   * 执行 GraphQL 请求
   */
  private async graphqlRequest(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const page = await this.ensurePage();
    const cookies = await this.getCookies();

    const response = await page.evaluate(
      async ({ url, graphqlQuery, vars, headers, cookieStr }) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Cookie': cookieStr,
          },
          body: JSON.stringify({
            query: graphqlQuery,
            variables: vars || {},
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      },
      {
        url: GRAPHQL_ENDPOINT,
        graphqlQuery: query,
        vars: variables,
        headers: DEFAULT_HEADERS,
        cookieStr: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; '),
      }
    );

    return response;
  }

  /**
   * 获取热点话题
   */
  async fetchHotTopics(options?: FetchOptions): Promise<FetchResult> {
    const limit = options?.limit ?? 50;

    try {
      // 确保已登录
      await this.ensureLogin();

      // 执行 GraphQL 请求
      log.info('[KuaishouFetcher] 获取热点话题...');
      const response = await this.graphqlRequest(HOT_SEARCH_QUERY);

      // 解析响应
      const topics = this.parseHotTopics(response, limit);

      log.info(`[KuaishouFetcher] 获取到 ${topics.length} 条热点话题`);

      return this.buildResult(topics);
    } catch (err) {
      const error = err as Error;
      log.error('[KuaishouFetcher] 获取热点话题失败:', error);

      return {
        topics: [],
        source: 'kuaishou',
        fetchedAt: Date.now(),
        error: error.message,
      };
    }
  }

  /**
   * 解析热点话题响应
   */
  private parseHotTopics(response: Record<string, unknown>, limit: number): HotTopic[] {
    const topics: HotTopic[] = [];

    try {
      // 快手 API 返回结构: { data: { hotSearch: [...] } }
      const data = response['data'] as Record<string, unknown> | undefined;
      if (!data) {
        log.warn('[KuaishouFetcher] 响应中无 data 字段:', response);
        return topics;
      }

      const hotSearch = data['hotSearch'] as Array<Record<string, unknown>> | undefined;
      if (!hotSearch || !Array.isArray(hotSearch)) {
        log.warn('[KuaishouFetcher] 响应中无 hotSearch 字段');
        return topics;
      }

      // 映射到 HotTopic 格式
      for (let i = 0; i < Math.min(hotSearch.length, limit); i++) {
        const item = hotSearch[i];
        const hotValue = item['hotValue'] as number | undefined;
        const id = item['id'] as string | number | undefined;
        const title = item['title'] as string | undefined;
        const imageUrl = item['imageUrl'] as string | undefined;
        const link = item['link'] as string | undefined;

        const topic: Partial<HotTopic> = {
          id: String(id ?? i + 1),
          title: String(title ?? '未知话题'),
          rank: i + 1,
          heat: typeof hotValue === 'number' ? hotValue : 0,
          link: String(link ?? ''),
          coverUrl: imageUrl,
        };

        topics.push(this.normalizeTopic(topic, i + 1));
      }
    } catch (err) {
      log.error('[KuaishouFetcher] 解析热点话题失败:', err);
    }

    return topics;
  }
}