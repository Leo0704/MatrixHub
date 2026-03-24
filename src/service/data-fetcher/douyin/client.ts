/**
 * 抖音 API 客户端
 * 对应 MediaCrawler: media_platform/douyin/client.py::DouYinClient
 */

import * as urllib.parse from 'url';
import { Page } from 'playwright';
import log from 'electron-log';
import { getABogus, generateWebId } from './signer.js';

const GENERAL_SEARCH_URI = '/v1/web/general/search';

/**
 * 通用请求参数（对应 client.py 中的 common_params）
 */
interface CommonParams {
  device_platform: string;
  aid: string;
  channel: string;
  version_code: string;
  version_name: string;
  update_version_code: string;
  pc_client_type: string;
  cookie_enabled: string;
  browser_language: string;
  browser_platform: string;
  browser_name: string;
  browser_version: string;
  browser_online: string;
  engine_name: string;
  os_name: string;
  os_version: string;
  cpu_core_num: string;
  device_memory: string;
  engine_version: string;
  platform: string;
  screen_width: string;
  screen_height: string;
  effective_type: string;
  round_trip_time: string;
  webid: string;
  msToken?: string;
}

export interface DouYinClientConfig {
  page: Page;
  headers: Record<string, string>;
  timeout?: number;
}

/**
 * 抖音 API 客户端
 * 负责构建请求、获取签名、调用 API
 */
export class DouYinClient {
  private page: Page;
  private headers: Record<string, string>;
  private timeout: number;
  private host = 'https://www.douyin.com';

  constructor(config: DouYinClientConfig) {
    this.page = config.page;
    this.headers = config.headers;
    this.timeout = config.timeout ?? 60000;
  }

  /**
   * 更新请求头中的 Cookie
   */
  async updateCookies(): Promise<void> {
    const cookies = await this.page.context().cookies();
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    this.headers['Cookie'] = cookieStr;
  }

  /**
   * 获取本地存储中的 msToken
   */
  private async getMsToken(): Promise<string> {
    try {
      const localStorage = await this.page.evaluate(() => window.localStorage);
      return localStorage.get('xmst') || '';
    } catch {
      return '';
    }
  }

  /**
   * 构建通用参数
   */
  private async buildCommonParams(): Promise<CommonParams> {
    const msToken = await this.getMsToken();

    return {
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      version_code: '190600',
      version_name: '19.6.0',
      update_version_code: '170400',
      pc_client_type: '1',
      cookie_enabled: 'true',
      browser_language: 'zh-CN',
      browser_platform: 'MacIntel',
      browser_name: 'Chrome',
      browser_version: '125.0.0.0',
      browser_online: 'true',
      engine_name: 'Blink',
      os_name: 'Mac OS',
      os_version: '10.15.7',
      cpu_core_num: '8',
      device_memory: '8',
      engine_version: '109.0',
      platform: 'PC',
      screen_width: '2560',
      screen_height: '1440',
      effective_type: '4g',
      round_trip_time: '50',
      webid: generateWebId(),
      msToken,
    };
  }

  /**
   * 处理请求参数，添加通用参数和 a_bogus 签名
   */
  private async processRequestParams(
    uri: string,
    params: Record<string, string | number>,
    requestMethod: 'GET' | 'POST' = 'GET'
  ): Promise<void> {
    const commonParams = await this.buildCommonParams();

    // 合并参数
    Object.assign(params, commonParams);

    // 构建 query string
    const queryString = urllib.parse.stringify(params);

    // 获取 a_bogus 签名（排除搜索接口）
    if (!uri.includes(GENERAL_SEARCH_URI)) {
      const aBogus = await getABogus(
        uri,
        queryString,
        this.headers['User-Agent'],
        this.page
      );
      params['a_bogus'] = aBogus;
    }
  }

  /**
   * 发送 GET 请求
   */
  async get(
    uri: string,
    params: Record<string, string | number> = {},
    customHeaders?: Record<string, string>
  ): Promise<Record<string, unknown>> {
    await this.processRequestParams(uri, params, 'GET');

    const headers = { ...this.headers, ...customHeaders };
    const url = `${this.host}${uri}?${urllib.parse.stringify(params)}`;

    log.debug(`[DouYinClient] GET ${uri}`);

    try {
      const response = await this.page.request.get(url, {
        headers,
        timeout: this.timeout,
      });

      if (!response.ok) {
        log.error(`[DouYinClient] HTTP error: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();

      if (!text || text === 'blocked') {
        log.error('[DouYinClient] Request blocked');
        throw new Error('Request blocked');
      }

      return JSON.parse(text);
    } catch (err) {
      log.error(`[DouYinClient] GET request failed:`, err);
      throw err;
    }
  }

  /**
   * 获取热搜列表
   * 对应 API: /aweme/v1/web/hot/search/list/
   */
  async getHotSearchList(): Promise<Record<string, unknown>> {
    const uri = '/aweme/v1/web/hot/search/list/';
    const params: Record<string, string | number> = {};

    return await this.get(uri, params);
  }

  /**
   * 检查登录状态
   * 通过检查 localStorage 中的 HasUserLogin 或 Cookie 中的 LOGIN_STATUS
   */
  async pong(): Promise<boolean> {
    try {
      const localStorage = await this.page.evaluate(() => window.localStorage);
      if (localStorage.get('HasUserLogin') === '1') {
        return true;
      }

      const cookies = await this.page.context().cookies();
      const loginCookie = cookies.find((c) => c.name === 'LOGIN_STATUS');
      return loginCookie?.value === '1';
    } catch (err) {
      log.warn('[DouYinClient] pong check failed:', err);
      return false;
    }
  }
}
