# fetch_data 热点话题功能实现设计

## 1. 背景与目标

当前 `fetch_data` 任务的 `fetchHotTopics`、`fetchContentStats`、`fetchAccountStats` 都是 stub 实现。
目标：基于 MediaCrawler 方案，实现真正的热点话题获取功能。

**MediaCrawler 方案核心**：
- Playwright 浏览器自动化保留登录态
- 通过 JS 表达式获取签名参数（避免逆向加密算法）
- 调用平台真实 API 获取数据

**MediaCrawler 许可证说明**：采用 NON-COMMERCIAL LEARNING LICENSE，本实现仅参考其架构和思路，不直接复制代码。

---

## 2. 架构设计

### 2.1 目录结构

```
src/
├── service/
│   ├── data-fetcher/                 # 新增：数据获取模块
│   │   ├── index.ts                  # 导出入口
│   │   ├── base/                     # 基类和接口
│   │   │   ├── base-fetcher.ts       # 抽象数据获取器
│   │   │   └── types.ts              # 公共类型定义
│   │   ├── platforms/                # 各平台实现
│   │   │   ├── douyin/               # 抖音
│   │   │   │   ├── client.ts         # API 客户端
│   │   │   │   ├── signer.ts         # 签名获取（JS 注入）
│   │   │   │   ├── hot-topics.ts     # 热点话题获取
│   │   │   │   └── login.ts          # 登录相关
│   │   │   ├── xiaohongshu/          # 小红书
│   │   │   │   ├── client.ts
│   │   │   │   ├── signer.ts         # x-s 签名
│   │   │   │   ├── hot-topics.ts
│   │   │   │   └── login.ts
│   │   │   └── kuaishou/             # 快手
│   │   │       ├── client.ts
│   │   │       ├── signer.ts
│   │   │       ├── hot-topics.ts
│   │   │       └── login.ts
│   │   └── utils/                    # 公共工具
│   │       ├── browser-context.ts    # 浏览器上下文管理
│   │       └── cookie-store.ts       # Cookie 存储
│   └── service-process.ts            # 修改：集成 data-fetcher
```

### 2.2 核心组件

#### BaseFetcher (抽象基类)

```typescript
interface HotTopic {
  id: string;
  title: string;
  rank: number;
  heat: number;          // 热度值
  link: string;          // 话题链接
  coverUrl?: string;     // 封面图
  platform: Platform;
  fetchedAt: number;
}

abstract class BaseFetcher {
  protected page: Page;
  protected platform: Platform;

  abstract fetchHotTopics(options?: FetchOptions): Promise<HotTopic[]>;
  abstract checkLoginStatus(): Promise<boolean>;
  abstract login(): Promise<void>;

  protected async ensureLogin(): Promise<void>;
  protected async executeSign(uri: string, params: object): Promise<object>;
}
```

#### 平台签名策略

| 平台 | 签名方式 | 获取位置 |
|------|----------|----------|
| 抖音 | `a_bogus` 参数 | 执行 `douyin.js` 中的 JS 函数 |
| 小红书 | `x-s`, `x-t`, `x-s-common` 头 | 调用 `window.mnsv2` |
| 快手 | GraphQL 请求 | 通过 Playwright 执行 |

---

## 3. 实现方案

### 3.1 复用现有基础设施

项目已有：
- `platform-launcher.ts` - Playwright 浏览器管理
- `credential-manager.ts` - 凭证管理
- `rate-limiter.ts` - 限流控制

**复用策略**：
- 使用 `platform-launcher.createPage()` 创建带登录态的页面
- Cookie/登录态存储复用 `credential-manager`
- 限流使用 `rate-limiter`

### 3.2 登录态保持

MediaCrawler 的关键设计：
1. 使用 `playwright.launch_persistent_context` 保存浏览器上下文到本地
2. 下次运行时加载已保存的上下文，避免重复登录

**本项目适配**：
- 复用 `credential-manager` 存储登录态
- 每个平台保存独立的 cookie/上下文

### 3.3 各平台热点获取

#### 抖音热点
- **API**: `https://www.douyin.com/aweme/v1/web/hot/search/list/`
- **签名**: `a_bogus` 参数（通过 `douyin.js` 获取）
- **数据**: 热点话题列表、热度值、话题链接

#### 小红书热点
- **API**: `https://edith.xiaohongshu.com/api/sns/web/v1/hot_list`
- **签名**: `x-s`, `x-t`, `x-s-common` 头
- **数据**: 热榜话题、热度、关联笔记数

#### 快手热点
- **API**: `https://www.kuaishou.com/graphql` (GraphQL)
- **签名**: 无需签名，但需要登录 Cookie
- **数据**: 热门话题、观看量、点赞数

---

## 4. 集成到 service-process.ts

### 4.1 修改 `executeFetchDataTask`

```typescript
// 当前 stub
async function executeFetchDataTask(task: Task, signal: AbortSignal): Promise<void> {
  const payload = task.payload as { dataType: 'hot_topics'; platform?: Platform; };
  // 目前返回空
}

// 修改为
async function executeFetchDataTask(task: Task, signal: AbortSignal): Promise<void> {
  const payload = task.payload as { dataType: 'hot_topics'; platform?: Platform; };
  const fetcher = DataFetcherFactory.create(payload.platform);
  const topics = await fetcher.fetchHotTopics();
  // 更新任务状态
  taskQueue.updateStatus(task.id, 'running', { result: { topics }, progress: 100 });
}
```

### 4.2 DataFetcherFactory

```typescript
class DataFetcherFactory {
  static create(platform?: Platform): BaseFetcher {
    switch (platform) {
      case 'douyin': return new DouYinFetcher();
      case 'xiaohongshu': return new XiaoHongShuFetcher();
      case 'kuaishou': return new KuaishouFetcher();
      default: throw new Error('Unsupported platform');
    }
  }
}
```

---

## 5. 关键实现细节

### 5.1 抖音签名获取（参考 MediaCrawler）

MediaCrawler 使用 `execjs` 执行 `douyin.js` 获取签名：
```python
douyin_sign_obj = execjs.compile(open('libs/douyin.js', encoding='utf-8-sig').read())
a_bogus = douyin_sign_obj.call(sign_js_name, params, user_agent)
```

**本项目方案**：
- 将 `douyin.js` 转换为 TypeScript
- 使用 `page.evaluate()` 在浏览器上下文执行 JS
- 直接调用页面上已有的 `bdms` 对象获取签名

### 5.2 小红书签名获取（参考 MediaCrawler）

MediaCrawler 通过 Playwright 调用 `window.mnsv2`：
```python
result = await page.evaluate(f"window.mnsv2('{sign_str}', '{md5_str}')")
```

**本项目方案**：
- 相同方式，在已登录的小红书页面执行
- 构建签名字符串 → MD5 → 调用 mnsv2 → 构建最终签名

### 5.3 浏览器上下文复用

```typescript
async function ensureBrowserContext(platform: Platform): Promise<Page> {
  // 1. 检查 credential-manager 是否有有效 cookie
  // 2. 如果有，创建带 cookie 的 context
  // 3. 如果没有，返回登录页面让用户扫码
  // 4. 登录成功后保存 cookie
}
```

---

## 6. 错误处理

| 错误类型 | 处理策略 |
|----------|----------|
| 未登录 | 抛出 `LoginRequiredError`，前端引导用户登录 |
| 签名失败 | 重试 3 次，仍失败返回空数据 + 警告日志 |
| 请求被拦截 | 启用代理池，或等待后重试 |
| 账号被风控 | 通知用户，暂停该账号任务 |

---

## 7. 实现顺序

1. **Phase 1: 基础设施**
   - 创建 `data-fetcher` 目录结构
   - 实现 `BaseFetcher` 抽象类
   - 实现 `DataFetcherFactory`

2. **Phase 2: 抖音**
   - 移植签名逻辑（参考 douyin.js）
   - 实现热点话题 API
   - 测试登录态获取

3. **Phase 3: 小红书**
   - 移植签名逻辑（playwright_sign.py）
   - 实现热榜 API
   - 测试登录态获取

4. **Phase 4: 快手**
   - 实现 GraphQL 请求
   - 实现热点话题获取

5. **Phase 5: 集成**
   - 集成到 `service-process.ts`
   - 对接 UI 显示
   - E2E 测试

---

## 8. 依赖变更

**新增依赖**：
- `node-fetch` 或直接使用 Electron 内置 fetch（已有）

**JS 文件引入**：
- `libs/douyin.js` - 抖音签名算法
- 小红书签名在页面 JS 中已存在，直接调用

**文件复制**（来自 MediaCrawler，仅作参考）：
- `libs/douyin.js` → 复制到项目 `libs/`
- 暂不复制其他 JS（通过 Playwright 注入调用页面已有方法）
