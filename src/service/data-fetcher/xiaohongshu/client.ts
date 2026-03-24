/**
 * 小红书 API 客户端
 * 对应 MediaCrawler: media_platform/xhs/client.py::XiaoHongShuClient
 */

import { Page } from 'playwright';
import log from 'electron-log';
import { sign_with_playwright } from './signer.js';

const HOST = 'https://edith.xiaohongshu.com';
const DOMAIN = 'https://www.xiaohongshu.com';

export interface XiaoHongShuClientConfig {
  page: Page;
  headers: Record<string, string>;
  cookieDict: Record<string, string>;
  timeout?: number;
}

export class XiaoHongShuClient {
  private page: Page;
  private headers: Record<string, string>;
  private cookieDict: Record<string, string>;
  private timeout: number;

  constructor(config: XiaoHongShuClientConfig) {
    this.page = config.page;
    this.headers = config.headers;
    this.cookieDict = config.cookieDict;
    this.timeout = config.timeout ?? 60000;
  }

  /**
   * Generate signed request headers
   */
  private async _pre_headers(
    url: string,
    params?: Record<string, unknown>,
    payload?: Record<string, unknown>
  ): Promise<Record<string, string>> {
    const a1_value = this.cookieDict.get('a1') || '';

    // Parse URL to get path
    let uri: string;
    let data: Record<string, unknown> | string | null = null;
    let method = 'POST';

    try {
      const urlObj = new URL(url);
      uri = urlObj.pathname;
    } catch {
      uri = url;
    }

    // Determine request data and method
    if (params !== undefined) {
      data = params;
      method = 'GET';
    } else if (payload !== undefined) {
      data = payload;
      method = 'POST';
    } else {
      throw new Error('params or payload is required');
    }

    // Generate signature using playwright injection method
    const signs = await sign_with_playwright(
      this.page,
      uri,
      data,
      a1_value,
      method
    );

    return {
      'X-S': signs['x-s'],
      'X-T': signs['x-t'],
      'x-S-Common': signs['x-s-common'],
      'X-B3-Traceid': signs['x-b3-traceid'],
    };
  }

  /**
   * Update cookies from page context
   */
  async updateCookies(): Promise<void> {
    const cookies = await this.page.context().cookies();
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    this.headers['Cookie'] = cookieStr;

    // Update cookie dict
    for (const cookie of cookies) {
      this.cookieDict[cookie.name] = cookie.value;
    }
  }

  /**
   * Send GET request with signed headers
   */
  async get(uri: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const headers = await this._pre_headers(`${HOST}${uri}`, params);
    const mergedHeaders = { ...this.headers, ...headers };

    log.debug(`[XiaoHongShuClient] GET ${uri}`);

    try {
      const response = await this.page.request.get(`${HOST}${uri}`, {
        headers: mergedHeaders,
        params: params as Record<string, string>,
        timeout: this.timeout,
      });

      if (!response.ok) {
        log.error(`[XiaoHongShuClient] HTTP error: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data['success']) {
        const code = data['code'];
        if (code === 300012) {
          throw new Error('IP blocked');
        } else if (code === -510000 || code === -510001) {
          throw new Error(`Note not found or abnormal, code: ${code}`);
        } else {
          throw new Error(data['msg'] || `API error: ${code}`);
        }
      }

      return data['data'] || data['success'] || {};
    } catch (err) {
      log.error(`[XiaoHongShuClient] GET request failed:`, err);
      throw err;
    }
  }

  /**
   * Send POST request with signed headers
   */
  async post(uri: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const headers = await this._pre_headers(`${HOST}${uri}`, undefined, data);
    const mergedHeaders = { ...this.headers, ...headers };
    const jsonStr = JSON.stringify(data);

    log.debug(`[XiaoHongShuClient] POST ${uri}`);

    try {
      const response = await this.page.request.post(`${HOST}${uri}`, {
        headers: mergedHeaders,
        data: jsonStr,
        timeout: this.timeout,
      });

      if (!response.ok) {
        log.error(`[XiaoHongShuClient] HTTP error: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result['success']) {
        const code = result['code'];
        if (code === 300012) {
          throw new Error('IP blocked');
        } else if (code === -510000 || code === -510001) {
          throw new Error(`Note not found or abnormal, code: ${code}`);
        } else {
          throw new Error(result['msg'] || `API error: ${code}`);
        }
      }

      return result['data'] || result['success'] || {};
    } catch (err) {
      log.error(`[XiaoHongShuClient] POST request failed:`, err);
      throw err;
    }
  }

  /**
   * Query self user info to check login state
   */
  async querySelf(): Promise<Record<string, unknown> | null> {
    const uri = '/api/sns/web/v1/user/selfinfo';
    const headers = await this._pre_headers(`${HOST}${uri}`, {});
    const mergedHeaders = { ...this.headers, ...headers };

    try {
      const response = await this.page.request.get(`${HOST}${uri}`, {
        headers: mergedHeaders,
        timeout: this.timeout,
      });

      if (response.status() === 200) {
        return await response.json();
      }
    } catch (err) {
      log.warn('[XiaoHongShuClient] querySelf failed:', err);
    }
    return null;
  }

  /**
   * Check if login state is still valid
   */
  async pong(): Promise<boolean> {
    log.info('[XiaoHongShuClient.pong] Checking login state...');
    let pingFlag = false;

    try {
      const selfInfo = await this.querySelf();
      if (selfInfo && (selfInfo['data'] as Record<string, unknown>)?.['result'] === true) {
        pingFlag = true;
      }
    } catch (err) {
      log.error('[XiaoHongShuClient.pong] Check login state failed:', err);
      pingFlag = false;
    }

    log.info(`[XiaoHongShuClient.pong] Login state result: ${pingFlag}`);
    return pingFlag;
  }

  /**
   * Get hot search list
   * API: /api/sns/web/v1/hot_list
   */
  async getHotSearchList(): Promise<Record<string, unknown>> {
    const uri = '/api/sns/web/v1/hot_list';
    return await this.get(uri);
  }

  /**
   * Get note by keyword search
   */
  async getNoteByKeyword(
    keyword: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<Record<string, unknown>> {
    const uri = '/api/sns/web/v1/search/notes';
    const data = {
      keyword,
      page,
      page_size: pageSize,
      search_id: this.generateSearchId(),
      sort: 0,
      note_type: 0,
    };
    return await this.post(uri, data);
  }

  /**
   * Generate a search ID
   */
  private generateSearchId(): string {
    return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  }
}
