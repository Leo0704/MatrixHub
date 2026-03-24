# fetch_data 热点话题功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现热点话题获取功能，支持抖音、小红书、快手三大平台

**Architecture:** 参考 MediaCrawler 方案，使用 Playwright 浏览器自动化获取登录态和签名参数，调用平台 API 获取热点数据

**Tech Stack:** TypeScript, Playwright, Electron, Node.js

---

## 文件结构

```
src/
├── service/
│   └── data-fetcher/                    # 新增模块
│       ├── index.ts                     # 导出 factory
│       ├── types.ts                     # 热点话题类型
│       ├── base-fetcher.ts              # 抽象基类
│       ├── factory.ts                   # 工厂函数
│       ├── douyin/                      # 抖音实现
│       │   ├── client.ts               # API 客户端
│       │   ├── signer.ts                # a_bogus 签名
│       │   └── hot-topics.ts            # 热点话题获取
│       ├── xiaohongshu/                # 小红书实现
│       │   ├── client.ts               # API 客户端
│       │   ├── signer.ts               # x-s 签名
│       │   └── hot-topics.ts           # 热点话题获取
│       └── kuaishou/                   # 快手实现
│           ├── client.ts               # API 客户端 (GraphQL)
│           └── hot-topics.ts           # 热点话题获取
├── libs/                                # 外部 JS 文件
│   └── douyin.js                        # 抖音签名算法 (从 MediaCrawler 复制)
└── service/
    └── service-process.ts              # 修改：集成 data-fetcher
```

---

## Task 1: 创建 data-fetcher 基础设施

**Files:**
- Create: `src/service/data-fetcher/types.ts`
- Create: `src/service/data-fetcher/base-fetcher.ts`
- Create: `src/service/data-fetcher/index.ts`
- Create: `src/service/data-fetcher/factory.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/service/data-fetcher/types.ts

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
```

- [ ] **Step 2: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/types.ts`
Expected: No errors

- [ ] **Step 3: Create base-fetcher.ts**

```typescript
// src/service/data-fetcher/base-fetcher.ts

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
```

- [ ] **Step 4: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/base-fetcher.ts`
Expected: No errors

- [ ] **Step 5: Create index.ts**

```typescript
// src/service/data-fetcher/index.ts

export * from './types.js';
export * from './base-fetcher.js';
export * from './factory.js';
```

- [ ] **Step 6: Create factory.ts**

```typescript
// src/service/data-fetcher/factory.ts

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
```

- [ ] **Step 7: Commit**

```bash
git add src/service/data-fetcher/types.ts src/service/data-fetcher/base-fetcher.ts src/service/data-fetcher/index.ts src/service/data-fetcher/factory.ts
git commit -m "feat: create data-fetcher infrastructure (types, base class, factory)"
```

---

## Task 2: 实现抖音热点获取

**Files:**
- Create: `src/service/data-fetcher/douyin/signer.ts`
- Create: `src/service/data-fetcher/douyin/client.ts`
- Create: `src/service/data-fetcher/douyin/hot-topics.ts`
- Copy: `libs/douyin.js` from MediaCrawler
- Modify: `src/service/service-process.ts` (integrate fetcher)

- [ ] **Step 1: Copy douyin.js to libs directory**

```bash
cp /Users/lylyyds/Desktop/MediaCrawler/libs/douyin.js src/libs/douyin.js
```

- [ ] **Step 2: Create douyin/signer.ts**

```typescript
// src/service/data-fetcher/douyin/signer.ts

import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import * as vm from 'vm';

// 单例 - 缓存编译后的 JS context
let signContext: vm.Context | null = null;
let signFunctions: any = null;

function getDouyinJsPath(): string {
  // 开发环境和生产环境路径
  const paths = [
    path.join(process.cwd(), 'libs', 'douyin.js'),
    path.join(app.getAppPath(), 'libs', 'douyin.js'),
    path.join(app.getPath('userData'), 'libs', 'douyin.js'),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  throw new Error('douyin.js not found');
}

function initSignContext(): void {
  if (signContext) return;

  const jsPath = getDouyinJsPath();
  const jsCode = fs.readFileSync(jsPath, 'utf-8');

  // 创建 sandbox
  const sandbox = {
    console: {
      log: () => {},
      warn: log.warn,
      error: log.error,
    },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    Buffer: Buffer,
  };

  signContext = vm.createContext(sandbox);
  vm.runInContext(jsCode, signContext);

  log.info('[DouYinSigner] 签名上下文初始化完成');
}

export async function getABogus(
  url: string,
  params: string,
  userAgent: string,
  page: Page
): Promise<string> {
  // 尝试使用页面上已有的签名函数
  try {
    const hasFunction = await page.evaluate(() => {
      return typeof (window as any).bdms !== 'undefined' ||
             typeof (window as any)._bdms !== 'undefined';
    });

    if (hasFunction) {
      // 通过 Playwright 在页面上下文执行
      const aBogus = await page.evaluate(
        (u: string, p: string, ua: string) => {
          const win = window as any;
          // 尝试调用不同版本的签名函数
          if (win.bdms && win.bdms.init && win.bdms.init._v) {
            const v = win.bdms.init._v;
            if (v && v[2] && v[2].p && v[2].p[42]) {
              return v[2].p[42].apply(null, [0, 1, 8, p, '', ua]);
            }
          }
          return null;
        },
        url,
        params,
        userAgent
      );

      if (aBogus) {
        return aBogus;
      }
    }
  } catch (e) {
    log.warn('[DouYinSigner] 页面签名获取失败，尝试本地 JS:', e);
  }

  // 回退：使用本地编译的 JS
  return getABogusFromJs(params, userAgent);
}

function getABogusFromJs(params: string, userAgent: string): string {
  initSignContext();

  if (!signContext) {
    throw new Error('Failed to initialize sign context');
  }

  try {
    const result = vm.runInContext('sign_datail', signContext);
    // 注意：实际的 sign 函数需要参数，这里需要根据 MediaCrawler 的具体实现调整
    log.warn('[DouYinSigner] 本地签名暂未实现，请确保 douyin.js 可用');
    return '';
  } catch (e) {
    log.error('[DouYinSigner] 本地签名失败:', e);
    return '';
  }
}

export function generateWebId(): string {
  const e = (t: number | null) => {
    if (t !== null) {
      return String(t ^ (int(16 * Math.random()) >> (t as number / 4)));
    }
    const parts = [
      String(int(1e7)),
      String(int(1e3)),
      String(int(4e3)),
      String(int(8e3)),
      String(int(1e11)),
    ];
    return parts.join('-');
  };

  const int = (n: number) => Math.floor(n);
  const webId = Array.from(e(null)).map((c, i) => {
    const code = c.charCodeAt(0);
    if ('018'.includes(c)) {
      return String(int(code) ^ int(16 * Math.random()));
    }
    return c;
  }).join('');

  return webId.replace(/-/g, '').slice(0, 19);
}

function int(n: number): number {
  return Math.floor(n);
}
```

- [ ] **Step 3: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/douyin/signer.ts`
Expected: No errors

- [ ] **Step 4: Create douyin/client.ts**

```typescript
// src/service/data-fetcher/douyin/client.ts

import { Page } from 'playwright';
import log from 'electron-log';
import { getABogus, generateWebId } from './signer.js';

export interface DouYinSearchResult {
  status_code: number;
  data?: any[];
  has_more: number;
  cursor: number;
}

export class DouYinClient {
  private page: Page;
  private headers: Record<string, string>;

  constructor(page: Page) {
    this.page = page;
    this.headers = {
      'User-Agent': '',
      'Cookie': '',
      'Host': 'www.douyin.com',
      'Origin': 'https://www.douyin.com/',
      'Referer': 'https://www.douyin.com/',
      'Content-Type': 'application/json;charset=UTF-8',
    };
  }

  async updateHeaders(): Promise<void> {
    const cookies = await this.page.context().cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    this.headers['Cookie'] = cookieStr;
    this.headers['User-Agent'] = await this.page.evaluate(() => navigator.userAgent);
  }

  async fetchHotTopics(): Promise<DouYinSearchResult> {
    await this.updateHeaders();

    const url = '/aweme/v1/web/hot/search/list/';
    const params = {
      'device_platform': 'webapp',
      'aid': '6383',
      'channel': 'channel_pc_web',
      'version_code': '190600',
      'version_name': '19.6.0',
      'webid': generateWebId(),
      'msToken': await this.getMsToken(),
    };

    // 获取签名
    const queryString = new URLSearchParams(params).toString();
    const aBogus = await getABogus(url, queryString, this.headers['User-Agent'], this.page);

    if (aBogus) {
      params['a_bogus'] = aBogus;
    }

    const finalUrl = `https://www.douyin.com${url}?${new URLSearchParams(params).toString()}`;

    try {
      const response = await this.page.evaluate(async (fetchUrl: string, headers: Record<string, string>) => {
        const resp = await fetch(fetchUrl, {
          headers,
          credentials: 'include',
        });
        return await resp.json();
      }, finalUrl, this.headers);

      return response as DouYinSearchResult;
    } catch (e) {
      log.error('[DouYinClient] 获取热点失败:', e);
      return { status_code: -1, has_more: 0, cursor: 0 };
    }
  }

  private async getMsToken(): Promise<string> {
    try {
      const localStorage = await this.page.evaluate(() => window.localStorage);
      return localStorage.get('xmst') || '';
    } catch {
      return '';
    }
  }
}
```

- [ ] **Step 5: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/douyin/client.ts`
Expected: No errors

- [ ] **Step 6: Create douyin/hot-topics.ts**

```typescript
// src/service/data-fetcher/douyin/hot-topics.ts

import type { Page } from 'playwright';
import { BaseFetcher } from '../base-fetcher.js';
import type { HotTopic, FetchOptions, FetchResult } from '../types.js';
import { DouYinClient } from './client.js';
import { checkLoginState, createFetcherPage } from '../../platform-automation.js';
import log from 'electron-log';
import { LoginRequiredError } from '../types.js';

export class DouYinFetcher extends BaseFetcher {
  private client: DouYinClient | null = null;

  constructor() {
    super('douyin');
  }

  async ensurePage(): Promise<Page> {
    if (!this.page) {
      this.page = await createFetcherPage('douyin');
    }
    return this.page;
  }

  async checkLoginStatus(): Promise<boolean> {
    try {
      const page = await this.ensurePage();
      await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded' });
      return await checkLoginState(page, 'douyin');
    } catch (e) {
      log.error('[DouYinFetcher] 检查登录状态失败:', e);
      return false;
    }
  }

  async login(): Promise<void> {
    const page = await this.ensurePage();
    await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded' });

    // 等待用户扫码登录
    log.info('[DouYinFetcher] 请在浏览器中扫码登录');
    await page.waitForSelector('[data-e2e="login-icon"]', { timeout: 0 });

    // 等待登录完成
    await page.waitForFunction(
      () => {
        const local = window.localStorage;
        return local.getItem('HasUserLogin') === '1';
      },
      { timeout: 300000 } // 5 分钟超时
    );

    log.info('[DouYinFetcher] 登录成功');
  }

  async fetchHotTopics(options?: FetchOptions): Promise<FetchResult> {
    try {
      await this.ensureLogin();

      const page = await this.ensurePage();
      this.client = new DouYinClient(page);

      const result = await this.client.fetchHotTopics();

      if (result.status_code !== 0 || !result.data) {
        log.warn('[DouYinFetcher] API 返回异常:', result);
        return {
          topics: [],
          source: 'douyin',
          fetchedAt: Date.now(),
          error: `API 返回错误: ${result.status_code}`,
        };
      }

      const limit = options?.limit || 50;
      const topics: HotTopic[] = [];

      for (let i = 0; i < Math.min(result.data.length, limit); i++) {
        const item = result.data[i];
        topics.push(this.normalizeTopic({
          id: String(item.aweme_id || item.id || i),
          title: item.word || item.title || item.query || '未知话题',
          rank: i + 1,
          heat: item.hot_value || item.heat || 0,
          link: `https://www.douyin.com/hot/${item.aweme_id || ''}`,
          coverUrl: item.surface_image_url,
        }, i + 1));
      }

      log.info(`[DouYinFetcher] 获取到 ${topics.length} 条热点`);
      return this.buildResult(topics);

    } catch (e) {
      const err = e as Error;
      if (err.name === 'LoginRequiredError') {
        throw err;
      }
      log.error('[DouYinFetcher] 获取热点失败:', e);
      return {
        topics: [],
        source: 'douyin',
        fetchedAt: Date.now(),
        error: err.message,
      };
    }
  }

  async close(): Promise<void> {
    await super.close();
  }
}
```

- [ ] **Step 7: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/douyin/hot-topics.ts`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/service/data-fetcher/douyin/ src/libs/douyin.js
git commit -m "feat: implement DouYin hot topics fetcher"
```

---

## Task 3: 实现小红书热点获取

**Files:**
- Create: `src/service/data-fetcher/xiaohongshu/signer.ts`
- Create: `src/service/data-fetcher/xiaohongshu/client.ts`
- Create: `src/service/data-fetcher/xiaohongshu/hot-topics.ts`

- [ ] **Step 1: Create xiaohongshu/signer.ts**

```typescript
// src/service/data-fetcher/xiaohongshu/signer.ts

import { Page } from 'playwright';
import * as crypto from 'crypto';

export interface SignResult {
  'x-s': string;
  'x-t': string;
  'x-s-common': string;
  'x-b3-traceid': string;
}

function b64Encode(buffer: Buffer): string {
  return buffer.toString('base64');
}

function encodeUtf8(str: string): Buffer {
  return Buffer.from(str, 'utf-8');
}

function getTraceId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}-0`;
}

function mrc(str: string): string {
  // mrc 是小红书的一个哈希函数简化版本
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return hash.substring(0, 8);
}

function buildSignString(uri: string, data: any, method: string = 'POST'): string {
  if (method.toUpperCase() === 'POST') {
    let c = uri;
    if (data != null) {
      if (typeof data === 'object') {
        c += JSON.stringify(data).replace(/\s/g, '');
      } else {
        c += data;
      }
    }
    return c;
  } else {
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return uri;
    }
    if (typeof data === 'object') {
      const params: string[] = [];
      for (const key of Object.keys(data)) {
        let value = data[key];
        if (Array.isArray(value)) {
          value = value.join(',');
        } else if (value != null) {
          value = String(value);
        } else {
          value = '';
        }
        params.push(`${key}=${encodeURIComponent(value)}`);
      }
      return `${uri}?${params.join('&')}`;
    }
    return `${uri}?${data}`;
  }
}

function md5Hex(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex');
}

function buildXsPayload(x3Value: string, dataType: string = 'object'): string {
  const s = {
    'x0': '4.2.1',
    'x1': 'xhs-pc-web',
    'x2': 'Mac OS',
    'x3': x3Value,
    'x4': dataType,
  };
  return 'XYS_' + b64Encode(encodeUtf8(JSON.stringify(s).replace(/\s/g, '')));
}

function buildXsCommon(a1: string, b1: string, x_s: string, x_t: string): string {
  const payload = {
    's0': 3,
    's1': '',
    'x0': '1',
    'x1': '4.2.2',
    'x2': 'Mac OS',
    'x3': 'xhs-pc-web',
    'x4': '4.74.0',
    'x5': a1,
    'x6': x_t,
    'x7': x_s,
    'x8': b1,
    'x9': mrc(x_t + x_s + b1),
    'x10': 154,
    'x11': 'normal',
  };
  return b64Encode(encodeUtf8(JSON.stringify(payload).replace(/\s/g, '')));
}

export async function signWithPlaywright(
  page: Page,
  uri: string,
  data: any,
  a1: string = '',
  method: string = 'POST'
): Promise<SignResult> {
  const signStr = buildSignString(uri, data, method);
  const md5Str = md5Hex(signStr);

  // 获取 b1 从 localStorage
  let b1 = '';
  try {
    const localStorage = await page.evaluate(() => window.localStorage);
    b1 = localStorage.get('b1') || '';
  } catch {
    // ignore
  }

  // 调用页面上的 mnsv2 函数
  let x3Value = '';
  try {
    const signStrEscaped = signStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    const md5StrEscaped = md5Str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    x3Value = await page.evaluate(
      (s: string, m: string) => {
        const win = window as any;
        if (win.mnsv2) {
          return win.mnsv2(s, m) || '';
        }
        return '';
      },
      signStrEscaped,
      md5StrEscaped
    );
  } catch (e) {
    console.warn('[XHSSigner] mnsv2 调用失败:', e);
  }

  const dataType = typeof data === 'object' ? 'object' : 'string';
  const x_s = buildXsPayload(x3Value, dataType);
  const x_t = String(Date.now());

  return {
    'x-s': x_s,
    'x-t': x_t,
    'x-s-common': buildXsCommon(a1, b1, x_s, x_t),
    'x-b3-traceid': getTraceId(),
  };
}
```

- [ ] **Step 2: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/xiaohongshu/signer.ts`
Expected: No errors

- [ ] **Step 3: Create xiaohongshu/client.ts**

```typescript
// src/service/data-fetcher/xiaohongshu/client.ts

import { Page } from 'playwright';
import log from 'electron-log';
import { signWithPlaywright } from './signer.js';

export interface XiaoHongShuHotListResponse {
  success: boolean;
  data?: {
    items: any[];
    has_more: boolean;
  };
  code?: number;
  msg?: string;
}

export class XiaoHongShuClient {
  private page: Page;
  private cookies: Record<string, string>;

  constructor(page: Page, cookies: Record<string, string>) {
    this.page = page;
    this.cookies = cookies;
  }

  async fetchHotTopics(): Promise<XiaoHongShuHotListResponse> {
    const uri = '/api/sns/web/v1/hot_list';
    const data = {
      'category': 'homefeed_recommend',
      'page': 1,
      'page_size': 50,
    };

    const a1 = this.cookies.get('a1') || '';

    try {
      const signs = await signWithPlaywright(this.page, uri, data, a1, 'POST');

      const headers: Record<string, string> = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        'Origin': 'https://www.xiaohongshu.com',
        'Referer': 'https://www.xiaohongshu.com/',
        'User-Agent': await this.page.evaluate(() => navigator.userAgent),
        'X-S': signs['x-s'],
        'X-T': signs['x-t'],
        'x-S-Common': signs['x-s-common'],
        'X-B3-Traceid': signs['x-b3-traceid'],
      };

      const response = await this.page.evaluate(
        async (url: string, postData: any, h: Record<string, string>) => {
          const resp = await fetch(url, {
            method: 'POST',
            headers: h,
            body: JSON.stringify(postData),
            credentials: 'include',
          });
          return await resp.json();
        },
        `https://edith.xiaohongshu.com${uri}`,
        data,
        headers
      );

      return response as XiaoHongShuHotListResponse;
    } catch (e) {
      log.error('[XiaoHongShuClient] 获取热点失败:', e);
      return { success: false };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/xiaohongshu/client.ts`
Expected: No errors

- [ ] **Step 5: Create xiaohongshu/hot-topics.ts**

```typescript
// src/service/data-fetcher/xiaohongshu/hot-topics.ts

import type { Page } from 'playwright';
import { BaseFetcher } from '../base-fetcher.js';
import type { HotTopic, FetchOptions, FetchResult } from '../types.js';
import { XiaoHongShuClient } from './client.js';
import { checkLoginState, createFetcherPage } from '../../platform-automation.js';
import log from 'electron-log';

export class XiaoHongShuFetcher extends BaseFetcher {
  private client: XiaoHongShuClient | null = null;

  constructor() {
    super('xiaohongshu');
  }

  async ensurePage(): Promise<Page> {
    if (!this.page) {
      this.page = await createFetcherPage('xiaohongshu');
    }
    return this.page;
  }

  async checkLoginStatus(): Promise<boolean> {
    try {
      const page = await this.ensurePage();
      await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' });
      return await checkLoginState(page, 'xiaohongshu');
    } catch (e) {
      log.error('[XiaoHongShuFetcher] 检查登录状态失败:', e);
      return false;
    }
  }

  async login(): Promise<void> {
    const page = await this.ensurePage();
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' });

    log.info('[XiaoHongShuFetcher] 请在浏览器中扫码登录');
    await page.waitForSelector('[class*="login"]', { timeout: 0 });

    await page.waitForFunction(
      () => {
        const cookies = document.cookie;
        return cookies.includes('a1=');
      },
      { timeout: 300000 }
    );

    log.info('[XiaoHongShuFetcher] 登录成功');
  }

  async fetchHotTopics(options?: FetchOptions): Promise<FetchResult> {
    try {
      await this.ensureLogin();

      const page = await this.ensurePage();
      const pageCookies = await page.context().cookies();
      const cookieDict = new Map(pageCookies.map(c => [c.name, c.value]));

      this.client = new XiaoHongShuClient(page, cookieDict as any);

      const result = await this.client.fetchHotTopics();

      if (!result.success || !result.data) {
        log.warn('[XiaoHongShuFetcher] API 返回异常:', result);
        return {
          topics: [],
          source: 'xiaohongshu',
          fetchedAt: Date.now(),
          error: result.msg || 'API 返回失败',
        };
      }

      const limit = options?.limit || 50;
      const topics: HotTopic[] = [];

      for (let i = 0; i < Math.min(result.data.items?.length || 0, limit); i++) {
        const item = result.data.items[i];
        topics.push(this.normalizeTopic({
          id: String(item.note_id || item.id || i),
          title: item.title || item.word || '未知话题',
          rank: i + 1,
          heat: item.hot_value || item.score || 0,
          link: `https://www.xiaohongshu.com/explore/${item.note_id || ''}`,
          coverUrl: item.cover?.url_default || item.image_list?.[0]?.url_default,
        }, i + 1));
      }

      log.info(`[XiaoHongShuFetcher] 获取到 ${topics.length} 条热点`);
      return this.buildResult(topics);

    } catch (e) {
      log.error('[XiaoHongShuFetcher] 获取热点失败:', e);
      return {
        topics: [],
        source: 'xiaohongshu',
        fetchedAt: Date.now(),
        error: (e as Error).message,
      };
    }
  }

  async close(): Promise<void> {
    await super.close();
  }
}
```

- [ ] **Step 6: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/xiaohongshu/hot-topics.ts`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/service/data-fetcher/xiaohongshu/
git commit -m "feat: implement XiaoHongShu hot topics fetcher"
```

---

## Task 4: 实现快手热点获取

**Files:**
- Create: `src/service/data-fetcher/kuaishou/hot-topics.ts`

- [ ] **Step 1: Create kuaishou/hot-topics.ts**

```typescript
// src/service/data-fetcher/kuaishou/hot-topics.ts

import type { Page } from 'playwright';
import { BaseFetcher } from '../base-fetcher.js';
import type { HotTopic, FetchOptions, FetchResult } from '../types.js';
import { checkLoginState, createFetcherPage } from '../../platform-automation.js';
import log from 'electron-log';

export class KuaishouFetcher extends BaseFetcher {
  constructor() {
    super('kuaishou');
  }

  async ensurePage(): Promise<Page> {
    if (!this.page) {
      this.page = await createFetcherPage('kuaishou');
    }
    return this.page;
  }

  async checkLoginStatus(): Promise<boolean> {
    try {
      const page = await this.ensurePage();
      await page.goto('https://www.kuaishou.com', { waitUntil: 'domcontentloaded' });
      return await checkLoginState(page, 'kuaishou');
    } catch (e) {
      log.error('[KuaishouFetcher] 检查登录状态失败:', e);
      return false;
    }
  }

  async login(): Promise<void> {
    const page = await this.ensurePage();
    await page.goto('https://www.kuaishou.com', { waitUntil: 'domcontentloaded' });

    log.info('[KuaishouFetcher] 请在浏览器中扫码登录');
    await page.waitForSelector('[class*="login"]', { timeout: 0 });

    await page.waitForFunction(
      () => {
        const cookies = document.cookie;
        return cookies.includes('kuaishou=');
      },
      { timeout: 300000 }
    );

    log.info('[KuaishouFetcher] 登录成功');
  }

  async fetchHotTopics(options?: FetchOptions): Promise<FetchResult> {
    try {
      await this.ensureLogin();

      const page = await this.ensurePage();

      // 快手使用 GraphQL API
      const graphqlQuery = {
        operationName: 'HotSearch',
        variables: {},
        query: `
          query HotSearch {
            hotSearch {
              id
              title
              hotValue
              imageUrl
              link
            }
          }
        `,
      };

      const response = await page.evaluate(async (query: any) => {
        const resp = await fetch('https://www.kuaishou.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': 'https://www.kuaishou.com/',
            'User-Agent': navigator.userAgent,
          },
          body: JSON.stringify(query),
          credentials: 'include',
        });
        return await resp.json();
      }, graphqlQuery);

      const hotData = response?.data?.hotSearch;
      if (!hotData) {
        log.warn('[KuaishouFetcher] API 返回异常:', response);
        return {
          topics: [],
          source: 'kuaishou',
          fetchedAt: Date.now(),
          error: 'API 返回失败',
        };
      }

      const limit = options?.limit || 50;
      const topics: HotTopic[] = [];

      for (let i = 0; i < Math.min(hotData.length, limit); i++) {
        const item = hotData[i];
        topics.push(this.normalizeTopic({
          id: String(item.id || i),
          title: item.title || '未知话题',
          rank: i + 1,
          heat: item.hotValue || 0,
          link: item.link || `https://www.kuaishou.com/hot/${item.id}`,
          coverUrl: item.imageUrl,
        }, i + 1));
      }

      log.info(`[KuaishouFetcher] 获取到 ${topics.length} 条热点`);
      return this.buildResult(topics);

    } catch (e) {
      log.error('[KuaishouFetcher] 获取热点失败:', e);
      return {
        topics: [],
        source: 'kuaishou',
        fetchedAt: Date.now(),
        error: (e as Error).message,
      };
    }
  }

  async close(): Promise<void> {
    await super.close();
  }
}
```

- [ ] **Step 2: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/data-fetcher/kuaishou/hot-topics.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/service/data-fetcher/kuaishou/
git commit -m "feat: implement Kuaishou hot topics fetcher"
```

---

## Task 5: 添加 createFetcherPage 辅助函数

**Files:**
- Modify: `src/service/platform-automation.ts`

- [ ] **Step 1: Add createFetcherPage function**

在 `platform-automation.ts` 末尾添加：

```typescript
// ============ Data Fetcher 辅助函数 ============

import { createPage } from './platform-launcher.js';
import type { Platform } from '../shared/types.js';

/**
 * 为 data-fetcher 创建页面
 * 与普通 automation 不同的页面设置
 */
export async function createFetcherPage(platform: Platform): Promise<Page> {
  const page = await createPage(platform);

  // 设置更长的超时
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);

  return page;
}
```

- [ ] **Step 2: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/platform-automation.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/service/platform-automation.ts
git commit -m "feat: add createFetcherPage helper for data fetcher"
```

---

## Task 6: 集成到 service-process.ts

**Files:**
- Modify: `src/service/service-process.ts:255-295` (executeFetchDataTask 函数)

- [ ] **Step 1: Modify executeFetchDataTask function**

将现有的 `executeFetchDataTask` 函数修改为：

```typescript
/**
 * 执行数据获取任务
 * 支持：热点数据、内容数据、账号数据等
 */
async function executeFetchDataTask(task: Task, signal: AbortSignal): Promise<void> {
  const payload = task.payload as {
    dataType: 'hot_topics' | 'content_stats' | 'account_stats';
    platform?: Platform;
    accountId?: string;
    dateRange?: { start: number; end: number };
  };

  signal.throwIfAborted();

  log.info(`[Service] 开始获取数据: ${payload.dataType}`);

  let result: any = {};

  switch (payload.dataType) {
    case 'hot_topics':
      result = await fetchHotTopics(payload.platform);
      break;

    case 'content_stats':
      // 内容数据获取（暂未实现）
      result = await fetchContentStats(payload.accountId, payload.dateRange);
      break;

    case 'account_stats':
      // 账号数据获取（暂未实现）
      result = await fetchAccountStats(payload.accountId, payload.dateRange);
      break;

    default:
      throw new Error(`未知数据类型: ${payload.dataType}`);
  }

  taskQueue.updateStatus(task.id, 'running', {
    result,
    progress: 100,
  });

  log.info(`[Service] 数据获取完成: ${payload.dataType}`);
}
```

- [ ] **Step 2: Modify fetchHotTopics function**

将现有的 `fetchHotTopics` 函数替换为：

```typescript
async function fetchHotTopics(platform?: Platform): Promise<FetchResult> {
  if (platform) {
    // 指定平台
    log.info(`[Service] 获取 ${platform} 热点话题`);
    const fetcher = createFetcher(platform);
    try {
      const result = await fetcher.fetchHotTopics();
      return result;
    } finally {
      await fetcher.close();
    }
  } else {
    // 所有平台
    log.info('[Service] 获取全平台热点话题');
    const fetchers = createAllFetchers();
    const allTopics: HotTopic[] = [];
    const errors: string[] = [];

    for (const fetcher of fetchers) {
      try {
        const result = await fetcher.fetchHotTopics();
        allTopics.push(...result.topics);
        if (result.error) {
          errors.push(`${fetcher.platform}: ${result.error}`);
        }
      } catch (e) {
        errors.push(`${fetcher.platform}: ${(e as Error).message}`);
      } finally {
        await fetcher.close();
      }
    }

    // 按热度排序
    allTopics.sort((a, b) => b.heat - a.heat);

    return {
      topics: allTopics,
      source: 'all',
      fetchedAt: Date.now(),
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }
}
```

- [ ] **Step 3: Add imports at top of file**

在现有的 import 后添加：

```typescript
import { createFetcher, createAllFetchers } from './data-fetcher/index.js';
import type { FetchResult, HotTopic } from './data-fetcher/types.js';
```

- [ ] **Step 4: Run test to verify it compiles**

Run: `npx tsc --noEmit src/service/service-process.ts`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/service/service-process.ts
git commit -m "feat: integrate data-fetcher into service-process"
```

---

## Task 7: 测试验证

**Files:**
- Create: `src/service/data-fetcher/data-fetcher.test.ts`

- [ ] **Step 1: Create basic unit test**

```typescript
// src/service/data-fetcher/data-fetcher.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createFetcher } from './factory';
import type { Platform } from '../../shared/types';

describe('DataFetcher Factory', () => {
  it('should create DouYin fetcher', () => {
    const fetcher = createFetcher('douyin');
    expect(fetcher).toBeDefined();
    expect(fetcher.platform).toBe('douyin');
  });

  it('should create XiaoHongShu fetcher', () => {
    const fetcher = createFetcher('xiaohongshu');
    expect(fetcher).toBeDefined();
    expect(fetcher.platform).toBe('xiaohongshu');
  });

  it('should create Kuaishou fetcher', () => {
    const fetcher = createFetcher('kuaishou');
    expect(fetcher).toBeDefined();
    expect(fetcher.platform).toBe('kuaishou');
  });

  it('should throw for unknown platform', () => {
    expect(() => createFetcher('unknown' as Platform)).toThrow('Unsupported platform');
  });

  it('should create all fetchers', () => {
    const fetchers = createAllFetchers();
    expect(fetchers).toHaveLength(3);
  });
});

describe('HotTopic normalization', () => {
  it('should normalize partial topic data', () => {
    const fetcher = createFetcher('douyin');
    const partial = {
      title: '测试话题',
      heat: 1000,
    };
    const normalized = fetcher.normalizeTopic(partial, 1);
    expect(normalized.title).toBe('测试话题');
    expect(normalized.heat).toBe(1000);
    expect(normalized.rank).toBe(1);
    expect(normalized.platform).toBe('douyin');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/service/data-fetcher/data-fetcher.test.ts`
Expected: Tests pass

- [ ] **Step 3: Commit**

```bash
git add src/service/data-fetcher/data-fetcher.test.ts
git commit -m "test: add data-fetcher unit tests"
```

---

## 执行选项

**计划完成。两种执行方式：**

**1. Subagent-Driven (推荐)** - 每个 Task 由独立 subagent 执行，执行后审核，最后合并

**2. Inline Execution** - 在当前 session 批量执行，带检查点审核

选择哪种方式？
