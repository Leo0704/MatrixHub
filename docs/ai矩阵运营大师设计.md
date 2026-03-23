# AI矩阵运营大师 - 设计文档

## 1. 项目概述

### 1.1 项目定位
桌面客户端应用，帮助自媒体从业者实现**多平台、多账号**的**内容创作到发布**全流程**智能化**运营。

### 1.2 核心价值
- **AI全程包办**：输入主题，AI生成完整脚本+配图/视频+配音
- **矩阵批量运营**：多平台多账号统一管理
- **真正智能化**：AI学习进化、热点响应、数据闭环
- **本地优先**：数据存储本地，隐私安全

### 1.3 目标用户
- 自媒体从业者（个人或团队）
- MCN机构
- 品牌方运营人员

---

## 2. 技术架构

### 2.1 技术栈
| 层级 | 技术选型 |
|------|----------|
| 桌面框架 | Electron 28+ |
| 前端框架 | React 18 + TypeScript |
| UI组件 | TailwindCSS + shadcn/ui |
| 自动化控制 | Playwright（主流稳定） |
| 本地数据库 | better-sqlite3（同步API，Electron最优） |
| 日志系统 | electron-log |
| AI网关 | 自研统一网关（见2.6） |
| 定时任务 | node-schedule |
| 进程通信 | IPC via contextBridge |

### 2.2 进程架构

```
┌─────────────────────────────────────────────────────────┐
│                      主进程 (Main)                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 窗口管理 │ 系统托盘 │ 自动更新 │ 全局异常捕获      │  │
│  └──────────────────────────────────────────────────┘  │
│                          ↕ IPC                         │
├────────────────────────┬────────────────────────────────┤
│     渲染进程 (UI)      │       服务进程 (Service)        │
│  ┌──────────────────┐  │  ┌──────────────────────────┐  │
│  │ React 组件        │  │  │ 浏览器池管理器           │  │
│  │ 状态管理 (Zustand)│  │  │ AI网关                   │  │
│  │ 路由 (React Router)│  │  │ 任务队列处理器           │  │
│  └──────────────────┘  │  │ 数据库操作 (better-sqlite)│  │
│                       │  │ 文件系统操作              │  │
│                       │  └──────────────────────────┘  │
└───────────────────────┴────────────────────────────────┘
```

**进程职责：**
| 进程 | 职责 | 运行环境 |
|------|------|----------|
| 主进程 | 窗口管理、系统级操作、应用生命周期 | Node.js |
| 渲染进程 | UI展示、用户交互 | Chromium |
| 服务进程 | 浏览器控制、AI调用、数据库、文件IO | Node.js |

**服务进程创建：**
使用 `child_process.fork()` 创建独立服务进程，与主进程通过 IPC 通信：

```typescript
// 主进程
const serviceProcess = fork('./src/service/index.ts', [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  env: { NODE_ENV: 'production' }
});

// 服务进程崩溃后自动重启
serviceProcess.on('exit', (code) => {
  if (code !== 0) {
    log.error(`Service process exited with code ${code}, restarting...`);
    setTimeout(() => forkService(), 1000);
  }
});
```

### 2.3 Electron 安全配置

```javascript
// BrowserWindow 创建时的安全配置
{
  webPreferences: {
    contextIsolation: true,    // 必开：隔离渲染进程和Node环境
    nodeIntegration: false,    // 必关：渲染进程不直接访问Node
    sandbox: true,            // 必开：沙箱隔离
    preload: './preload.js'   // 通过contextBridge暴露安全API
  }
}
```

**IPC API 设计（preload.js 暴露）：**
```typescript
// 渲染进程只能调用这些安全API
window.electronAPI = {
  // 账号
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    add: (data) => ipcRenderer.invoke('accounts:add', data),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
    login: (id) => ipcRenderer.invoke('accounts:login', id),
  },
  // 内容
  contents: {
    create: (data) => ipcRenderer.invoke('contents:create', data),
    list: (filters) => ipcRenderer.invoke('contents:list', filters),
    generate: (contentId, type) => ipcRenderer.invoke('contents:generate', contentId, type),
  },
  // 发布
  publish: {
    enqueue: (task) => ipcRenderer.invoke('publish:enqueue', task),
    status: (taskId) => ipcRenderer.invoke('publish:status', taskId),
    cancel: (taskId) => ipcRenderer.invoke('publish:cancel', taskId),
  },
  // 设置
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  // 事件订阅
  on: (channel, callback) => ipcRenderer.on(channel, callback),
  off: (channel) => ipcRenderer.removeAllListeners(channel),
}
```

### 2.4 数据库设计

**SQLite 表结构（better-sqlite3）：**
```sql
-- 账号表
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,          -- 抖音/快手/小红书
  nickname TEXT,
  avatar TEXT,
  type TEXT NOT NULL,              -- 主账号/子账号/矩阵号
  group_id TEXT,
  status TEXT DEFAULT '活跃',
  health_score INTEGER DEFAULT 100,
  browser_profile_id TEXT,
  proxy_id TEXT,
  cookie_encrypted TEXT,           -- AES-256-GCM 加密存储
  session_expires_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

-- 账号分组表
CREATE TABLE account_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT,
  created_at INTEGER
);

-- 代理IP表
CREATE TABLE proxies (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  protocol TEXT DEFAULT 'http',     -- http/https/socks5
  username TEXT,
  password_encrypted TEXT,         -- AES-256-GCM 加密
  ip_type TEXT DEFAULT '数据中心', -- 数据中心/住宅
  health_status TEXT DEFAULT '正常',
  last_checked_at INTEGER,
  created_at INTEGER
);

-- 内容草稿表
CREATE TABLE contents (
  id TEXT PRIMARY KEY,
  title TEXT,
  script TEXT,
  platform TEXT,
  status TEXT DEFAULT '草稿',      -- 草稿/生成中/待审核/已确认/发布中/已发布
  target_accounts TEXT,            -- JSON数组
  media_files TEXT,                 -- JSON: {images: [], videos: [], audio: []}
  created_at INTEGER,
  updated_at INTEGER,
  expires_at INTEGER
);

-- 发布任务表
CREATE TABLE publish_tasks (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT DEFAULT '待执行',     -- 待执行/执行中/成功/失败/暂停
  scheduled_at INTEGER,
  executed_at INTEGER,
  retry_count INTEGER DEFAULT 0,
  error_msg TEXT,
  result TEXT,
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 发布记录表
CREATE TABLE publish_records (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  published_at INTEGER,
  platform_url TEXT,              -- 发布后获得的平台内容URL
  platform_content_id TEXT,        -- 平台侧的内容ID
  status TEXT,                     -- 成功/失败/被平台删除
  error_msg TEXT,
  FOREIGN KEY (task_id) REFERENCES publish_tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE SET NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- API配置表
CREATE TABLE api_configs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,               -- chat/image/video/audio
  provider TEXT NOT NULL,           -- openai/claude/ali...
  api_key_encrypted TEXT NOT NULL,  -- AES-256-GCM加密
  endpoint TEXT,
  model TEXT,
  settings TEXT,                    -- JSON: 额外配置
  is_active INTEGER DEFAULT 1
);

-- 用户设置表
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 索引定义
CREATE INDEX idx_accounts_platform_status ON accounts(platform, status);
CREATE INDEX idx_accounts_group_id ON accounts(group_id);
CREATE INDEX idx_contents_status ON contents(status);
CREATE INDEX idx_publish_tasks_status_scheduled ON publish_tasks(status, scheduled_at);
CREATE INDEX idx_publish_tasks_content ON publish_tasks(content_id);
CREATE INDEX idx_publish_tasks_account ON publish_tasks(account_id);
CREATE INDEX idx_publish_records_account ON publish_records(account_id);
CREATE INDEX idx_publish_records_published_at ON publish_records(published_at);
CREATE INDEX idx_proxies_health ON proxies(health_status);
```

**加密方案：**
- Cookie/API Key 等敏感字段：AES-256-GCM 加密
- 密钥派生：PBKDF2（至少 100,000 次迭代，SHA-256）从机器指纹 + 随机盐派生
- IV 管理：每次加密使用 crypto.randomBytes(12) 生成唯一12字节IV，存储格式为 `base64(iv || ciphertext || tag)`
- 密钥轮换：建议90天定期重新加密历史数据

### 2.5 浏览器池管理

**BrowserPool 设计：**
```typescript
class BrowserPool {
  private browsers: Map<string, Browser> = new Map();
  private lastActive: Map<string, number> = new Map(); // 最后活跃时间戳
  private profileDir: string;  // 每个账号独立目录
  private readonly MAX_BROWSERS = 5;
  private readonly BROWSER_MEMORY_THRESHOLD = 1024 * 1024 * 500; // 500MB

  // 获取或创建浏览器实例
  async getBrowser(profileId: string): Promise<Browser> {
    if (!this.browsers.has(profileId)) {
      // 内存超限时，释放最旧的空闲浏览器
      if (this.browsers.size >= this.MAX_BROWSERS) {
        await this.releaseOldestIdleBrowser();
      }
      const browser = await playwright.chromium.launch({
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-web-security',  // 允许跨域操作
          // 指纹随机化参数
          '--disable-blink-features=IsolateOrigins,site-per-process',
        ],
        userDataDir: `${this.profileDir}/${profileId}`,
      });
      // 监听断开事件，自动移除记录
      browser.on('disconnected', () => {
        this.browsers.delete(profileId);
        this.lastActive.delete(profileId);
      });
      this.browsers.set(profileId, browser);
    }
    this.lastActive.set(profileId, Date.now());
    return this.browsers.get(profileId)!;
  }

  // 更新活跃时间
  touch(profileId: string): void {
    this.lastActive.set(profileId, Date.now());
  }

  // 异常重启（带超时强制 kill）
  async restartBrowser(profileId: string): Promise<void> {
    const browser = this.browsers.get(profileId);
    if (browser) {
      // 5秒超时，超时强制 kill
      await Promise.race([
        browser.close(),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]).catch(() => {
        // 强制杀进程
        browser.process()?.kill('SIGKILL');
      });
      this.browsers.delete(profileId);
      this.lastActive.delete(profileId);
    }
    await this.getBrowser(profileId);
  }

  // 资源释放（定时清理超过 maxIdleTime 的空闲浏览器）
  async releaseIdleBrowsers(maxIdleTime: number = 30 * 60 * 1000): Promise<void> {
    const now = Date.now();
    for (const [profileId, lastTime] of this.lastActive.entries()) {
      if (now - lastTime > maxIdleTime) {
        const browser = this.browsers.get(profileId);
        if (browser) {
          await browser.close().catch(() => {});
          this.browsers.delete(profileId);
          this.lastActive.delete(profileId);
        }
      }
    }
  }

  // 内存超限，释放最旧的空闲浏览器
  async releaseOldestIdleBrowser(): Promise<void> {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [profileId, lastTime] of this.lastActive.entries()) {
      if (lastTime < oldestTime) {
        oldestTime = lastTime;
        oldest = profileId;
      }
    }
    if (oldest) {
      const browser = this.browsers.get(oldest);
      if (browser) {
        await browser.close().catch(() => {});
      }
      this.browsers.delete(oldest);
      this.lastActive.delete(oldest);
    }
  }

  // 内存检查定时任务
  startMemoryMonitor(intervalMs: number = 60000): void {
    setInterval(() => {
      const usage = process.memoryUsage();
      if (usage.heapUsed > this.BROWSER_MEMORY_THRESHOLD) {
        this.releaseIdleBrowsers();
      }
    }, intervalMs);
  }
}
```

**Profile 隔离：**
```
/userData
  /browser-profiles
    /profile_001  # 账号1独立
    │  /cookies
    │  /cache
    │  /local-storage
    ├── profile_002  # 账号2独立
    │  /cookies
    │  /cache
    │  /local-storage
```

### 2.6 AI 网关设计

**统一网关架构：**
```typescript
// AI 配置类型
interface AIConfig {
  provider: string;           // provider 名称
  model?: string;            // 模型名称
  temperature?: number;       // 0-2，默认 0.7
  maxTokens?: number;        // 最大 token 数
  timeout?: number;          // 超时毫秒，默认 30000
  stream?: boolean;          // 是否流式输出
}

// AI 错误类型
enum AIErrorCode {
  RATE_LIMIT      = 'RATE_LIMIT',      // 限流
  TIMEOUT         = 'TIMEOUT',          // 请求超时
  AUTH_ERROR      = 'AUTH_ERROR',       // 认证失败
  QUOTA_EXCEEDED  = 'QUOTA_EXCEEDED',  // 配额超限
  CONTENT_FILTERED = 'CONTENT_FILTERED', // 内容被过滤
  NETWORK_ERROR   = 'NETWORK_ERROR',    // 网络错误
  PROVIDER_DOWN   = 'PROVIDER_DOWN',    // Provider 不可用
  UNKNOWN         = 'UNKNOWN',           // 未知错误
}

class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
    public provider: string,
    public retryable: boolean,
    public details?: any
  ) {
    super(message);
    this.name = 'AIError';
  }
}

// 熔断器状态机
enum CircuitState { CLOSED = 'CLOSED', OPEN = 'OPEN', HALF_OPEN = 'HALF_OPEN' }

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly config: { failThreshold: number; recoveryTimeout: number; halfOpenAttempts: number };

  constructor(config: Partial<typeof CircuitBreaker.prototype.config> = {}) {
    this.config = {
      failThreshold: config.failThreshold ?? 5,
      recoveryTimeout: config.recoveryTimeout ?? 30000,
      halfOpenAttempts: config.halfOpenAttempts ?? 3,
    };
  }

  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) return true;
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.failureCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.failThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState { return this.state; }
}

// AI Provider 接口
interface AIProvider {
  name: string;
  chat(prompt: string, config: AIConfig): Promise<string>;
  image(prompt: string, config: AIConfig): Promise<Buffer>;
  audio(text: string, config: AIConfig): Promise<Buffer>;
  video(prompt: string, config: AIConfig): Promise<string>;
  healthCheck?(): Promise<boolean>;  // 健康检查
}

// AI Gateway
class AIGateway {
  private providers: Map<string, AIProvider> = new Map();
  private breakers: Map<string, CircuitBreaker> = new Map();
  private fallback: string[];  // 降级顺序

  // 注册 Provider
  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
    this.breakers.set(provider.name, new CircuitBreaker());
  }

  // 调用入口
  async chat(prompt: string, config: AIConfig): Promise<string> {
    return this.execute('chat', prompt, config);
  }

  private async execute<T>(
    method: 'chat' | 'image' | 'audio' | 'video',
    payload: any,
    config: AIConfig
  ): Promise<T> {
    const providers = this.getProviderChain(config.provider);

    for (const providerName of providers) {
      const breaker = this.breakers.get(providerName);
      if (breaker && !breaker.canExecute()) continue;

      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        const result = await this.callWithRetry(provider, method, payload, config);
        breaker?.recordSuccess();
        return result;
      } catch (error) {
        breaker?.recordFailure();
        if (error instanceof AIError && !error.retryable) throw error;
        // 继续降级到下一个 Provider
      }
    }
    throw new AIError(AIErrorCode.PROVIDER_DOWN, '所有 Provider 均不可用', 'unknown', false);
  }

  // 带重试的调用
  private async callWithRetry<T>(
    provider: AIProvider,
    method: 'chat' | 'image' | 'audio' | 'video',
    payload: any,
    config: AIConfig,
    retries = 2
  ): Promise<T> {
    const fn = (provider as any)[method].bind(provider);
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn(payload, config);
      } catch (error) {
        if (i === retries) throw this.normalizeError(error, provider.name);
        const aiErr = this.normalizeError(error, provider.name);
        if (!aiErr.retryable) throw aiErr;
        // 指数退避
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      }
    }
    throw new AIError(AIErrorCode.UNKNOWN, '重试耗尽', provider.name, false);
  }

  // 错误归一化
  private normalizeError(error: any, provider: string): AIError {
    if (error instanceof AIError) return error;
    const msg = error?.message || String(error);
    if (msg.includes('401') || msg.includes('auth')) {
      return new AIError(AIErrorCode.AUTH_ERROR, msg, provider, false);
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      return new AIError(AIErrorCode.RATE_LIMIT, msg, provider, true);
    }
    if (msg.includes('timeout')) {
      return new AIError(AIErrorCode.TIMEOUT, msg, provider, true);
    }
    if (msg.includes('quota')) {
      return new AIError(AIErrorCode.QUOTA_EXCEEDED, msg, provider, false);
    }
    return new AIError(AIErrorCode.UNKNOWN, msg, provider, true);
  }

  // 获取 Provider 链路
  private getProviderChain(primary: string): string[] {
    const chain = [primary];
    const idx = this.fallback.indexOf(primary);
    if (idx >= 0) chain.push(...this.fallback.slice(idx + 1));
    else chain.push(...this.fallback);
    return chain;
  }
}
```

**Provider 实现：**
- OpenAIProvider
- ClaudeProvider
- AliProvider（通义）
- BaiduProvider（文心）
- TencentProvider（混元）
- 通义万相Provider
- 智谱Provider
- ElevenLabsProvider
- 阿里语音Provider
- 百度语音Provider
- ……（用户可扩展接入任意 Provider）

**熔断降级配置：**
- 连续失败 5 次触发熔断（可配置 `failThreshold`）
- 熔断恢复超时 30s（可配置 `recoveryTimeout`）
- 重试策略：指数退避，间隔 1s/2s/4s，最多 2 次重试
- 429 限流 → 等指定时间后重试（尊重 `Retry-After` header）
- 401 认证错误 → 不重试，直接标记 Provider 不可用

### 2.7 日志系统

**electron-log 配置：**
```typescript
import log from 'electron-log';

log.transports.file.resolvePathFn = () => `${userData}/logs/main.log`;
log.transports.file.maxSize = 10 * 1024 * 1024;  // 10MB轮转
log.transports.console.level = 'debug';
log.transports.file.level = 'info';

// 分类日志
log.channel('browser').info('Browser launched');
log.channel('ai').info('AI request:', { provider: 'openai', model: 'gpt-4' });
log.channel('publish').info('Publish task:', taskId);
```

**日志级别：**
| 级别 | 用途 |
|------|------|
| error | 异常错误，需要调查 |
| warn | 警告，可能有问题 |
| info | 正常操作记录 |
| debug | 开发调试 |

### 2.8 任务队列

**自研 SQLite 持久化队列设计：**
```typescript
interface Task {
  id: string;
  type: 'publish' | 'generate' | 'harvest';
  payload: any;
  priority: number;          // 数值越大优先级越高
  status: 'pending' | 'active' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  retryDelay: number;
  createdAt: number;
  scheduledAt: number;
  nextRetryAt: number;       // 下次可重试时间戳
}

// 限流控制
class RateLimiter {
  // 账号维度：记录每个账号的最后发布时间
  private lastPublishTime: Map<string, number> = new Map();

  // 平台维度：记录每个平台的最后发布时间
  private lastPlatformTime: Map<string, number> = new Map();

  // 平台冷却时间（毫秒）
  private platformCooldown: Record<string, number> = {
    '抖音': 30 * 60 * 1000,      // 30分钟
    '小红书': 15 * 60 * 1000,    // 15分钟
    '快手': 20 * 60 * 1000,      // 20分钟
  };

  // 账号发布配额（基于权重）
  private accountQuota: Record<string, { daily: number; perMinute: number }> = {
    'high':   { daily: 2,  perMinute: 1 },
    'medium': { daily: 5,  perMinute: 2 },
    'low':    { daily: 10, perMinute: 3 },
  };

  // 检查账号是否可以发布
  canPublish(accountId: string, accountWeight: string, platform: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const lastTime = this.lastPublishTime.get(accountId) || 0;
    const quota = this.accountQuota[accountWeight] || this.accountQuota['medium'];

    // 分钟级限流
    if (now - lastTime < (60 * 1000 / quota.perMinute)) {
      return { allowed: false, reason: '账号发布频率超限，请稍后重试' };
    }

    // 平台级冷却
    const platformLastTime = this.lastPlatformTime.get(platform) || 0;
    const cooldown = this.platformCooldown[platform] || 30 * 60 * 1000;
    if (now - platformLastTime < cooldown) {
      return { allowed: false, reason: `${platform}当前处于冷却期，请间隔${cooldown / 60000}分钟后重试` };
    }

    return { allowed: true };
  }

  // 记录发布
  recordPublish(accountId: string, platform: string): void {
    const now = Date.now();
    this.lastPublishTime.set(accountId, now);
    this.lastPlatformTime.set(platform, now);
  }

  // 重试延迟（指数退避）
  getRetryDelay(attempt: number): number {
    const base = 60 * 1000; // 1分钟
    const delay = Math.min(base * Math.pow(2, attempt), 60 * 60 * 1000); // 最多1小时
    return delay;
  }
}
```

### 2.9 账号登录流程

**Session持久化机制（Playwright storageState）：**

```typescript
// 登录流程
async function loginAccount(accountId: string): Promise<LoginResult> {
  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. 打开登录页
  await page.goto('https://creator.douyin.com/login');

  // 2. 等待人工扫码（用户30秒内完成）
  // 页面显示二维码，用户用抖音App扫码
  await page.waitForQRCode({ timeout: 30000 });

  // 3. 等待登录完成
  await page.waitForSelector('.user-info', { timeout: 60000 });

  // 4. 保存Session（Playwright storageState）
  const storageState = await context.storageState();

  // 5. 加密存储到本地
  const encrypted = encryptAES(JSON.stringify(storageState));
  await db.update('accounts', {
    id: accountId,
    cookie_encrypted: encrypted,
    session_expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30天
  });

  await browser.close();
  return { success: true };
}

// 使用已有Session创建浏览器上下文
async function createAuthenticatedContext(accountId: string) {
  const account = await db.getAccount(accountId);

  // 检查Session是否过期
  if (Date.now() > account.session_expires_at) {
    return {
      needsReLogin: true,
      reason: 'Session已过期，请重新扫码登录'
    };
  }

  // 解密Session
  const storageState = JSON.parse(decryptAES(account.cookie_encrypted));

  // 创建已认证的上下文
  const context = await playwright.chromium.newContext({
    storageState: storageState
  });

  return { context, needsReLogin: false };
}
```

**Session管理：**
| 状态 | 处理 |
|------|------|
| session 有效 | 正常自动化操作 |
| session 过期 | 提示人工重新扫码登录 |
| 异地登录风控 | 通知用户确认安全 |
| 封号/限流 | 标记账号状态，暂停使用 |

### 2.10 代理IP管理（可选高级功能）
- 支持HTTP/HTTPS/SOCKS5代理
- 账号与IP绑定关系管理
- IP健康检查（失效自动切换）
- 仅高阶防关联需求使用

### 2.11 自动更新
- electron-updater 实现
- 支持增量更新（节省流量）
- 更新前自动备份数据
- 用户可选立即更新/稍后更新

### 2.12 网络不稳定处理

**断网重连：**
```typescript
// 网络状态监听
window.addEventListener('online', () => {
  log.info('Network restored');
  // 恢复离线队列任务
  taskQueue.resume();
});

window.addEventListener('offline', () => {
  log.warn('Network lost');
  // 暂停任务，存入离线队列
  taskQueue.pause();
});
```

**请求超时：**
```typescript
// AI API 请求超时配置
const AI_TIMEOUT = 30000; // 30秒

// 超时处理：自动重试1次，提示用户网络不佳
async function fetchWithRetry(prompt: string, retries = 1) {
  try {
    return await fetch(prompt, { timeout: AI_TIMEOUT });
  } catch (error) {
    if (retries > 0 && isNetworkError(error)) {
      await sleep(2000);
      return fetchWithRetry(prompt, retries - 1);
    }
    throw new UserFriendlyError('网络请求超时，请检查网络后重试');
  }
}
```

**离线队列：**
```typescript
// 离线时创建的任务存入本地队列
interface OfflineQueue {
  tasks: Task[];
  syncWhenOnline: boolean;
}

// 网络恢复后自动同步执行
```

### 2.13 数据库迁移

**Schema 版本管理：**
```typescript
// 数据库版本表
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER
);

// 迁移脚本命名：v1->v2, v2->v3...
interface Migration {
  from: number;
  to: number;
  up: () => void;   // 执行升级
  down: () => void; // 回滚
}

// 启动时检测版本，自动执行未应用的迁移
async function runMigrations() {
  const current = await db.get('schema_version');
  const pending = migrations.filter(m => m.from >= current);
  for (const m of pending) {
    await m.up();
    await db.set('schema_version', m.to);
  }
}
```

**迁移场景：**
- 新增表/字段
- 数据格式变更
- 索引优化
- 历史数据清理

### 2.14 运营精细化

#### 2.14.1 账号权重体系

| 权重 | 账号类型 | 发布配额 |
|------|----------|----------|
| 高 | 主账号/IP账号 | 每天1-2条，精益求精 |
| 中 | 子账号 | 每天3-5条 |
| 低 | 矩阵号 | 每天10+条，批量铺量 |

**账号属性扩展：**
```typescript
账号 {
  ...
  weight: 'high' | 'medium' | 'low',        // 账号权重
  tags: ['美妆', '职场'],                    // 内容领域标签
  targetAudience: ['18-25岁', '女性'],        // 目标受众
  publishWindows: ['12:00', '18:00', '21:00'], // 最佳发布时间段
  riskScore: 0,                             // 风险评分（见2.14.5）
}
```

#### 2.14.2 内容标签体系

```typescript
内容 {
  ...
  category: '教程' | '测评' | '种草' | '故事',  // 内容分类
  tags: ['平价', '学生党', '干货'],              // 内容标签
  style: '专业' | '搞笑' | '温情' | '真实',     // 内容风格
  duration: 30 | 60 | 120,                      // 时长（秒）
  usedCount: 0,                                 // 被复用次数
  lastUsedAt: null,                             // 上次使用时间
}
```

#### 2.14.3 发布节奏控制

| 场景 | 策略 |
|------|------|
| 同平台多账号 | 同一平台账号间隔30分钟发布 |
| 同内容多平台 | 抖音先发，小红书2小时后，快手4小时后 |
| 高峰时段 | 主账号在18:00-21:00，矩阵号分散在其他时段 |

**发布优先级：**
```
1. 主账号 > 子账号 > 矩阵号
2. 有时效热点 > 常规内容
3. 互动率高的账号优先发布
```

#### 2.14.4 数据精细化

**分时段数据追踪：**
```
发布时间 → 1小时后数据 → 24小时数据 → 7天数据
```

**ROI追踪：**
```
单条内容ROI = (带货GMV + 涨粉价值) / 制作成本

制作成本 = AI API消耗 + 人工审核时间 + 发布运营成本
```

#### 2.14.5 账号风险评分

```
风险维度：
- 发布频率异常 → +30分风险
- 内容重复率过高 → +20分
- 异地登录 → +15分
- 被举报 → +40分

总分 > 70 → 高危，建议暂停发布
```

#### 2.14.6 敏感词检测

```typescript
// 发布前自动检测
interface SensitiveWordCheck {
  categories: ['政治', '医疗', '金融', '违禁品'];
  userDict: ['自定义敏感词'];
  checkBeforePublish: boolean;
  result: {
    passed: boolean;
    violations: string[];
  };
}
```

### 2.15 发布失败告警

**失败告警机制：**
```typescript
// 发布任务失败后
async function handlePublishFailure(task: PublishTask, error: Error) {
  // 重试3次后仍失败，发送告警
  if (task.retryCount >= 3) {
    // 系统通知
    new Notification({
      title: '发布失败',
      body: `内容"${task.contentTitle}"发布失败: ${error.message}`,
    });

    // 记录失败原因，供用户排查
    await db.update('publish_tasks', {
      id: task.id,
      status: 'failed',
      errorMsg: error.message,
    });
  }
}
```

**用户可排查的失败原因：**
- Session过期 → 需重新登录
- 网络不稳定 → 重试
- 账号被限流 → 等待恢复
- 内容违规 → 修改内容

---

### 2.16 前端状态管理
```typescript
// Zustand 状态管理（轻量、TypeScript友好）
import { create } from 'zustand';

interface AppState {
  // 账号
  accounts: Account[];
  currentAccount: Account | null;
  setAccounts: (accounts: Account[]) => void;

  // 内容
  contents: Content[];
  currentContent: Content | null;

  // 发布队列
  publishQueue: PublishTask[];
  isPublishing: boolean;

  // 全局状态
  isLoading: boolean;
  error: string | null;
}
```

### 2.17 异常处理

**渲染进程（React）：**
```typescript
// Error Boundary 组件
class ErrorBoundary extends Component {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('React Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2>页面出现错误</h2>
          <p>{this.state.message}</p>
          <button onClick={() => window.location.reload()}>刷新页面</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**主进程/服务进程：**
```typescript
// 全局未捕获异常
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  // 保存现场后退出，由系统/PM2/electron 自带的重启机制恢复
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
  // 未处理的 Promise 拒绝也需要调查，不应静默吞掉
  if (reason instanceof Error) {
    process.exit(1);
  }
});
```

**AI调用异常：**
```typescript
try {
  await aiGateway.chat(prompt, config);
} catch (error) {
  if (error.code === 'RATE_LIMIT') {
    // 限流等待重试
  } else if (error.code === 'PROVIDER_DOWN') {
    // 切换Provider
  } else {
    // 用户通知
  }
}
```

### 2.18 数据备份

**自动备份策略：**
```typescript
// 每日凌晨3点自动备份
// 保留最近7天备份
// 备份到用户指定目录

interface Backup {
  id: string;
  path: string;
  size: number;
  createdAt: number;
  status: 'success' | 'failed';
}

// 支持导出/导入功能
// 加密压缩包（用户自定义密码）
```

### 2.19 性能优化

**内存管理：**
```typescript
// 浏览器池内存限制
const MAX_BROWSERS = 5;  // 同时运行的浏览器实例上限
const BROWSER_MEMORY_THRESHOLD = 1024 * 1024 * 500; // 500MB

// 定时检查内存，超限关闭空闲浏览器
setInterval(() => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > BROWSER_MEMORY_THRESHOLD) {
    browserPool.releaseIdleBrowsers();
  }
}, 60000);
```

**懒加载：**
```typescript
// React.lazy 懒加载路由
const DataDashboard = lazy(() => import('./pages/DataDashboard'));
const Settings = lazy(() => import('./pages/Settings'));

// 浏览器实例按需创建，不启动窗口预加载
```

**启动优化：**
```typescript
// 窗口创建优化
{
  show: false,           // 先隐藏窗口
  width: 1200,
  height: 800,
  // 等ready-to-show再显示
}

win.once('ready-to-show', () => {
  win.show();
});
```

### 2.20 系统集成

**系统通知：**
```typescript
// 后台任务完成通知
new Notification({
  title: '发布完成',
  body: '内容已成功发布到抖音账号',
});
```

**全局快捷键：**
```typescript
// 注册全局快捷键
import { globalShortcut } from 'electron';

globalShortcut.register('CommandOrControl+Shift+N', () => {
  // 快速新建内容
});

globalShortcut.register('CommandOrControl+Shift+P', () => {
  // 快速打开发布中心
});
```

**剪贴板/拖拽：**
```typescript
// 素材快速导入
import { clipboard } from 'electron';

// 监听拖拽文件
ondrop: (files) => {
  files.forEach(file => {
    if (isImage(file)) store.dispatch(addImage(file.path));
    if (isVideo(file)) store.dispatch(addVideo(file.path));
  });
};
```

### 2.21 测试策略

**Vitest（单元测试）：**
```typescript
// src/__tests__/ai-gateway.test.ts
test('AI Gateway fallback', async () => {
  const gateway = new AIGateway({ primary: mockProviderFail, fallback: mockProvider });
  const result = await gateway.chat('test', config);
  expect(result).toBe('fallback-response');
});
```

**Playwright（E2E测试）：**
```typescript
// e2e/publish.spec.ts
test('内容发布流程', async ({ page }) => {
  await page.goto('/contents/new');
  await page.fill('[data-testid=title]', '测试标题');
  await page.click('[data-testid=generate]');
  await page.click('[data-testid=publish]');
  await expect(page.locator('.toast')).toContainText('发布成功');
});
```

**测试覆盖率目标：**
- 核心业务逻辑：80%+
- AI网关：90%+
- 任务队列：85%+

### 2.22 构建与发布

**electron-builder 配置：**
```json
{
  "appId": "com.aibot.matrix",
  "productName": "AI矩阵运营大师",
  "mac": {
    "category": "public.app-category.productivity",
    "target": ["dmg", "zip"]
  },
  "win": {
    "target": ["nsis"]
  },
  "linux": {
    "target": ["AppImage"]
  },
  "asar": true,
  "compression": "maximum"
}
```

**CI/CD（GitHub Actions）：**
```yaml
# .github/workflows/build.yml
- name: Build
  run: npm run build
- name: Test
  run: npm run test
- name: Release
  if: github.ref == 'refs/heads/main'
  run: npm run release
```

---

## 3. 功能模块

### 3.1 账号矩阵管理

#### 3.1.1 账号层级
| 层级 | 说明 | 数量建议 |
|------|------|----------|
| 主账号 | IP人设账号，质量优先 | 1-3个 |
| 子账号 | 细分领域账号 | 3-10个 |
| 矩阵号 | 批量分发账号 | 10-50个 |

#### 3.1.2 账号属性
```
账号 {
  id, platform(抖音/快手/小红书), nickname, avatar,
  type(主账号/子账号/矩阵号), group(分组),
  status(活跃/休眠/封禁), healthScore(健康度),
  bindPhone, bindIP, cookie/session
}
```

**账号人设档案（影响 AI 创作风格）：**
```
人设档案 {
  personaDesc: string,      // 账号人设描述，如"职场成长导师，25-30岁女性"
  targetAudience: string[], // 目标受众，如['18-25岁','女性','职场新人']
  contentStyle: string[],  // 内容风格，如['专业','接地气','幽默']
  tabooTopics: string[],   // 禁忌话题，如['政治','医疗建议']
  avoidWords: string[],    // 该账号需规避的敏感词
  publishWindows: string[], // 最佳发布时间段，如['12:00','18:00','21:00']
}
```

AI 生成脚本时，读取目标账号的人设档案，自动调整：
- 文案语气（专业 vs 接地气）
- 内容角度（目标受众视角）
- 标签选择（匹配账号历史高绩效标签）
- 规避词（避免触达人设禁区）

#### 3.1.3 账号分组
- 按平台分组（多对多：一个账号可同时属于"抖音组"和"美妆组"）
- 按内容领域分组
- 按运营阶段分组（冷启动/成长期/稳定期）
- 账号选择器支持按组快速筛选

#### 3.1.4 账号健康监测
- 限流预警
- 封号风险检测
- 发布频率异常提醒
- IP/设备关联风险提示

---

### 3.2 AI创作引擎

#### 3.2.1 创作流程

**状态流转模型：**
```
草稿 → 生成中 → 待审核 → 已确认 → 发布中 → 已发布
                  ↓
             继续修改（回到生成中）
```

**流程说明：**
1. **草稿**：用户输入主题、选择目标账号
2. **生成中**：AI 生成脚本/配图/视频/配音
3. **待审核**：AI 生成完成，**强制进入人工审核节点**，用户可修改脚本、替换素材、调整标签，确认后方可进入发布
4. **已确认**：内容审核通过，等待进入发布队列
5. **发布中**：任务正在执行
6. **已发布**：发布成功

**版本管理：**
- 每次 AI 重新生成自动保存一个历史版本（v1/v2/v3...）
- 用户可随时回退到任意历史版本
- 草稿中断自动保存创作快照，网络恢复后可继续

#### 3.2.2 AI文案引擎（核心功能）

**文案能力矩阵：**

| 功能 | 说明 |
|------|------|
| 爆款标题生成 | 输入主题，输出10+个不同风格标题备选（痛点型/数字型/反差型/悬念型/疑问型） |
| 完整脚本生成 | 分镜式脚本，含时间轴、台词、画面描述 |
| 脚本深度优化 | 优化已有初稿，提升吸引力、情绪触发、共鸣感 |
| 平台适配改写 | 同一内容改写成抖音版/小红书版/快手版（不同风格长度） |
| 标签智能推荐 | 生成流量标签+精准标签组合方案 |
| SEO优化 | 关键词布局、搜索排名优化 |
| 封面文案 | 封面文字设计建议 |
| 视频简介 | 简介文案，含行动号召 |
| 互动引导 | 评论区引导、关注引导、行动引导 |

**爆款文案特征库（AI学习用）：**
```
爆款特征 {
  类型: 痛点型/数字型/反差型/悬念型/疑问型/共鸣型,
  情绪触发: 好奇/焦虑/兴奋/愤怒/共鸣/恐惧,
  开头模式: 前3秒钩子,
  结尾模式: 互动引导/关注引导/行动引导,
  行业标签: 对应内容领域,
  效果指标: 播放量/互动率/涨粉率
}
```

**AI文案生成流程：**
```
用户输入 → 选题分析 → 爆款特征匹配 → 标题生成(10+) → 脚本生成 →
平台适配改写 → SEO优化 → 标签推荐 → 输出成品
```

**脚本字段：**
| 字段 | 说明 |
|------|------|
| 标题 | 吸引点击，SEO友好，多版本备选 |
| 脚本正文 | 分镜式脚本，含时间轴、台词、画面描述 |
| 标签 | #话题标签（流量标签+精准标签） |
| 封面文案 | 封面文字建议 |
| 简介文案 | 视频简介 |
| 行动号召 | 关注/点赞/评论引导 |
| SEO关键词 | 搜索关键词布局 |

#### 3.2.3 内容改写（平台适配）
- 同一素材改写成不同平台版本
- 抖音版：节奏快、信息密度高
- 小红书版：种草风格、配图精致
- 快手版：接地气、生活化

#### 3.2.4 AI生图
- 支持：Midjourney / Stable Diffusion / DALL-E / 通义万相
- 功能：文生图、图生图、风格迁移、批量生成
- 输出：封面图、配图、背景素材

#### 3.2.5 AI视频
- 支持：Runway / Pika / Kling / 智谱
- 功能：文生视频、图生视频、视频剪辑
- 输出：短视频成品

#### 3.2.6 AI配音
- 支持：ElevenLabs / 微软TTS / 阿里语音
- 功能：文字转语音、多音色、语速调节
- 输出：配音音频文件

---

### 3.3 智能发布引擎

#### 3.3.1 发布方式
**模拟自动化操作**（无官方API限制）
- 模拟浏览器操作流程
- 自动登录账号 → 编辑内容 → 发布
- 支持多账号轮换发布

#### 3.3.2 发布模式
| 模式 | 说明 |
|------|------|
| 即时发布 | 生成后立即发布 |
| 定时发布 | 设置具体时间发布 |
| 智能定时 | AI分析最佳时间发布 |
| 批量发布 | 一次性发布到多账号 |

#### 3.3.3 发布队列
```
发布任务 {
  id, contentId, accounts[],
  scheduledTime, actualTime,
  status(待发布/发布中/成功/失败),
  retryCount, errorMsg
}
```

---

### 3.4 热点监测

#### 3.4.1 热点来源

**数据源实现：**
| 来源 | 实现方式 | 说明 |
|------|----------|------|
| 蝉妈妈 | 第三方API | 抖音/快手/小红书数据，需付费订阅 |
| 新抖 | 第三方API | 抖音数据为主，需付费订阅 |
| 微博热搜 | 公开API | 无需认证，数据有限 |
| 百度指数 | 第三方爬虫 | 搜索热度，需爬虫实现 |

**说明：**
- 推荐使用**蝉妈妈**或**新抖**作为主要数据源，提供完整热搜API
- 热点轮询频率：每5分钟一次（尊重API限流）
- 后台服务：Electron后台进程运行，用户关闭窗口不影响热点监控

#### 3.4.2 热点响应流程
```
热点监测 → 筛选关联热点 → AI评估价值 → 快速创作 → 紧急发布
```

**说明：** 热点响应速度取决于内容复杂度和人工审核时间，系统仅提供快速创作工具链，不承诺固定完成时间。

#### 3.4.3 热点任务
```
热点任务 {
  id, topic, source,热度指数,
  relatedAccounts[], deadline,
  status(分析中/已接单/创作中/已发布),
  generatedContentId
}
```

**热点 → 创作 → 发布 快捷路径：**
热点卡片上提供"立即创作"按钮，点击后：
1. 自动跳转至 AI 创作页面
2. 热点关键词自动填充到创作主题
3. 用户选择目标账号（系统按热点关联度推荐）
4. 进入创作流程

```typescript
// 热点卡片操作
interface HotTopicCard {
  topic: string;         // 热点词
 热度指数: number;
  source: string;        // 来源平台
  relatedAccounts: string[]; // 推荐账号

  onQuickCreate: () => {
    // 1. 跳转 /ai-create?topic=xxx&source=xxx
    // 2. 预填热点关键词
    // 3. 预选推荐账号
    navigateTo('/ai-create', { topic, source, relatedAccounts });
  };
}
```

---

### 3.5 数据闭环

#### 3.5.1 发布记录追踪
| 指标 | 说明 |
|------|------|
| 播放量 | 视频观看次数 |
| 完播率 | 看完视频的比例 |
| 互动率 | 点赞+评论+收藏+分享 |
| 涨粉数 | 发布后新增粉丝 |
| 转化率 | 点击链接/下单等 |

#### 3.5.2 爆款分析
- 自动识别播放量异常高的内容
- 分析爆款共同特征：选题、标题、发布时间、标签
- 生成爆款因子报告

#### 3.5.3 规则驱动的智能优化（非ML）

**说明：** 不使用复杂的机器学习模型，而是基于数据统计的规则引擎，直接指导创作优化。

```typescript
// 规则引擎配置
interface OptimizationRules {
  // 时段规则
  timeSlotRules: {
    basedOn: '历史数据统计',  // 非AI预测，是数据统计
    minSampleSize: 10,         // 至少10条样本才输出建议
    thresholds: {
      high: 1.5,   // 播放 > 均值×1.5 → 推荐时段
      low: 0.5    // 播放 < 均值×0.5 → 规避时段
    }
  };

  // 标签规则
  tagRules: {
    basedOn: '标签效果统计',
    minUsageCount: 5,          // 标签至少使用5次才有统计意义
    performanceThreshold: 0.7, // 性能 > 均值×0.7 → 保留
  };

  // 标题规则
  titleRules: {
    basedOn: '爆款标题特征统计',
    patterns: ['数字型', '痛点型', '疑问型', '反差型'],
    // 统计每种类型的平均表现，推荐表现最好的类型
  };
}

// 优化建议生成
interface OptimizationSuggestion {
  type: 'time_slot' | 'tag' | 'title_style' | 'duration';
  current: string;
  recommended: string;
  reason: string;  // "基于10条内容统计，平均播放高出23%"
  confidence: 'high' | 'medium' | 'low';  // 基于样本量
}

// 规则引擎执行
function generateOptimizationSuggestions(accountId: string): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // 1. 时段分析
  const timeStats = calculateTimeSlotStats(accountId);
  if (timeStats.samples >= 10) {
    const bestSlot = timeStats.slots.find(s => s.performance > 1.5);
    if (bestSlot) {
      suggestions.push({
        type: 'time_slot',
        current: timeStats.recentSlot,
        recommended: bestSlot.slot,
        reason: `基于${timeStats.samples}条内容统计，${bestSlot.slot}时段平均播放最高`,
        confidence: timeStats.samples > 20 ? 'high' : 'medium'
      });
    }
  }

  // 2. 标签分析
  const tagStats = calculateTagStats(accountId);
  const goodTags = tagStats.filter(t => t.performance > 0.8 && t.usageCount >= 5);
  const badTags = tagStats.filter(t => t.performance < 0.5 && t.usageCount >= 3);
  // ... 生成标签建议

  // 3. 标题风格分析
  const titleStats = calculateTitleStyleStats(accountId);
  // ... 生成标题风格建议

  return suggestions;
}
```

**规则引擎说明：**
- 完全基于本地SQLite数据统计，无需云端ML服务
- 样本量门槛：建议至少10条内容才有统计意义
- 人工可控：用户可查看统计数据，自行判断是否采纳建议
- 不做"自动调整"，只做"建议生成"，保留人工决策权

#### 3.5.4 账号健康看板
```
账号健康度 = f(发布频率, 互动率, 涨粉率, 违规次数, 限流情况)
```

---

### 3.6 草稿库

#### 3.6.1 草稿属性
```
草稿 {
  id, title, script, images[], videos[],
  sourcePlatform, targetAccounts[],
  createdAt, updatedAt, expiresAt,
  retentionDays(用户自定义),
  tags: string[],          // 内容标签，用于检索和复用
  usedCount: number,       // 被复用/改写到其他平台的次数
  lastUsedAt: number,      // 上次使用时间
  version: number,         // 当前版本号（v1/v2/v3...）
  parentId: string,       // 衍生来源（如改写自某草稿）
  platformVersions: {       // 各平台适配版本记录
    platform: string,
    title: string,
    contentId: string
  }[]
}
```

#### 3.6.2 草稿组织与检索
- **多维度筛选**：按创建时间/平台/状态/标签/使用次数筛选
- **批量操作**：批量删除、批量修改标签、批量分发到多账号
- **内容复用追踪**：记录草稿被改写到哪些平台/账号使用过，避免重复分发

#### 3.6.3 内容版本管理
- 每次 AI 重新生成或用户修改，自动保存一个历史版本（v1/v2/v3...）
- 用户可预览任意历史版本，并回退到该版本
- 版本对比：支持两个版本并排显示差异

#### 3.6.4 保留策略
- 用户自定义保留时间：7天/30天/90天/永久
- 过期自动清理
- 重要草稿可永久保留

---

### 3.7 互动管理模块

#### 3.7.1 功能范围
| 功能 | 说明 | 实现方式 |
|------|------|----------|
| 评论抓取 | 获取自己内容的评论列表 | 模拟操作回采 |
| AI自动回复 | AI根据上下文生成回复，自动发布 | AI生成 + 模拟操作 |
| 热门评论置顶 | 自动或手动置顶高价值评论 | 模拟操作 |
| 私信处理 | 自动回复私信 | AI生成 + 模拟操作 |
| 互动统计 | 评论数/回复率/私信响应率 | 数据统计 |

#### 3.7.2 回复流程
```
新评论/私信 → AI生成回复 → 自动发布
```

#### 3.7.3 回复策略
| 模式 | 说明 |
|------|------|
| AI生成 | AI根据上下文生成回复，直接发布 |
| 人工审核 | AI生成后用户确认再发 |
| 关键词触发 | 特定关键词触发预设回复（可与AI混合） |

---

### 3.8 内容创作流程详细设计

#### 3.8.1 创作状态机

```
用户输入 → AI生成 → 用户确认 → 素材制作 → 内容组装 → 发布

状态说明：
┌──────────┐    生成     ┌──────────┐    审核     ┌──────────┐
│   草稿   │ ────────→ │  生成中   │ ────────→ │  待审核   │
└──────────┘            └──────────┘            └──────────┘
     ↑                                              │
     └─────────────── 用户修改 ←────────────────────┘
                                                      ↓ 审核通过
┌──────────┐    排队      ┌──────────┐    发布     ┌──────────┐
│   已发布  │ ←───────── │  发布中   │ ←───────── │  已确认   │
└──────────┘            └──────────┘            └──────────┘
```

#### 3.8.2 创作步骤详细设计

**Step 1: 主题输入**
```
用户输入：
- 主题关键词："夏季养生汤"
- 内容类型：[短视频 ▼] [图文笔记 ▼] [直播脚本 ▼]
- 目标平台：[抖音 ▼] [小红书 ▼] [快手 ▼] [全选]
- 目标账号：[多选 ▼]

系统自动填充：
- 关联的账号人设档案
- 历史高绩效标签参考
- 近期热点关联度
```

**Step 2: AI 生成脚本**
```
AI 生成内容（一次调用）：
{
  "titles": [  // 10个标题备选
    "夏天必喝的3款养生汤，顺序很重要！",
    "难怪你湿气重！原来是这个做错了",
    "养生汤别乱喝！中医教的顺序才有效",
    ...
  ],
  "script": {
    "content": "完整分镜脚本...",
    "duration": 90,  // 秒
    "scenes": [
      { "time": "00:00-00:05", "desc": "开场：抛出痛点" },
      { "time": "00:05-00:30", "desc": "第一款：红豆薏米汤" },
      ...
    ]
  },
  "tags": {
    "流量标签": ["#养生汤", "#去湿气", "#夏天"],
    "精准标签": ["#中医养生", "#食谱", "#健康"]
  },
  "coverSuggestion": "封面文字建议：'90%的人都喝错了'"
}
```

**Step 3: 用户确认/修改**
```
用户操作：
- [选用标题1] [选用标题2] [选用标题3]  ← 一键切换
- 直接编辑脚本内容
- 调整时长/场景
- 修改标签
- [重新生成]  ← 基于修改后的内容重新生成
- [确认并继续]  ← 进入素材制作
```

**Step 4: 素材制作**
```
并行生成（节省时间）：
┌─────────┐  ┌─────────┐  ┌─────────┐
│ 配图生成 │  │ 视频生成 │  │  配音   │
│  (AI)   │  │  (AI)   │  │  (AI)   │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┼────────────┘
                  ↓
            内容组装器
            - 自动匹配字幕
            - 自动匹配封面
            - 时长校验
```

**Step 5: 内容组装**
```
自动组装：
- 视频 + 配音 + 字幕 → 合成最终视频
- 图片 + 文字 → 图文笔记
- 自动生成描述文案（简介+行动号召）

用户可调整：
- 封面选择
- 描述文案微调
- 发布时间（立即/定时）
```

#### 3.8.3 创作中断处理

```
场景：网络断开 / 应用崩溃 / 切换页面

处理：
1. 自动保存当前进度到草稿（每30秒自动保存）
2. 草稿标记为"中断"
3. 恢复时提示："上次创作中断，是否继续？"
4. 继续时恢复到最近一次保存的状态
5. AI生成结果保留，重新生成时复用已有素材

草稿快照内容：
- 用户原始输入
- AI生成的所有版本
- 已选择的标题/脚本
- 已生成的素材（图片/视频/音频）
- 编辑历史
```

#### 3.8.4 版本管理

```
每次重新生成保存一个版本：
┌─────────────────────────────────────────┐
│ v1 (2024-03-15 14:30)                  │
│ 标题：夏季必喝的3款养生汤                │
│ 状态：已放弃                             │
├─────────────────────────────────────────┤
│ v2 (2024-03-15 14:35)  ← 当前版本      │
│ 标题：难怪你湿气重！原来是这个做错了      │
│ 状态：待审核                             │
├─────────────────────────────────────────┤
│ v3 (2024-03-15 14:40)                  │
│ 标题：养生汤别乱喝！中医教的顺序才有效    │
│ 状态：生成中                             │
└─────────────────────────────────────────┘

用户操作：
- [对比版本] ← 侧边栏并排展示
- [选用此版本] ← 回退到历史版本
- [删除版本] ← 清理不需要的版本
```

---

### 3.9 热点响应机制详细设计

#### 3.9.1 热点分级

```
紧急程度分级：

P0 紧急（红色）
- 定义：热搜前10 + 匹配度 > 80%
- 响应时限：2小时内必须产出内容
- 资源倾斜：优先调用AI资源
- 通知方式：系统通知 + 首页强提醒

P1 重要（橙色）
- 定义：热搜前50 + 匹配度 > 60%
- 响应时限：6小时内产出内容
- 通知方式：首页待办提醒

P2 一般（黄色）
- 定义：热搜前100 或 匹配度 > 40%
- 响应时限：24小时内
- 通知方式：热点列表标记

P3 参考（灰色）
- 定义：其他热点
- 响应时限：无限制
- 通知方式：仅在热点中心展示
```

#### 3.9.2 热点响应工作流

```
热点识别 → 价值评估 → 任务创建 → 快速创作 → 紧急发布

详细流程：

1. 热点识别
   ┌─────────────────────────────────────┐
   │ 数据源：第三方热点API轮询             │
   │ 轮询频率：每5分钟一次                │
   │ 新增热点：立即进入评估队列            │
   └─────────────────────────────────────┘
                    ↓
2. 价值评估（AI自动评估）
   ┌─────────────────────────────────────┐
   │ 评估维度：                           │
   │ - 与账号人设的匹配度                 │
   │ - 当前热度趋势（上升/下降）           │
   │ - 内容生产难度（能否快速出）          │
   │ - 同行蹭热点成功率                   │
   │                                      │
   │ 输出：                               │
   │ - 匹配账号推荐（按匹配度排序）        │
   │ - 建议响应时间窗口                   │
   │ - 预估流量价值（高/中/低）           │
   └─────────────────────────────────────┘
                    ↓
3. 任务创建
   ┌─────────────────────────────────────┐
   │ 热点任务：                           │
   │ - topic: "#春天的花"                │
   │ - urgency: "紧急"                   │
   │ - matchAccounts: ["账号A(90%)"]     │
   │ - deadline: 2小时后                 │
   │ - status: "待接单"                  │
   └─────────────────────────────────────┘
                    ↓
4. 快速创作（绿色通道）
   ┌─────────────────────────────────────┐
   │ 区别于普通创作流程：                  │
   │ - 跳过普通草稿步骤，直接AI生成        │
   │ - 使用热点专用Prompt模板              │
   │ - 自动带上热点标签                   │
   │ - 优先排队发布                       │
   └─────────────────────────────────────┘
                    ↓
5. 紧急发布
   ┌─────────────────────────────────────┐
   │ - 绕过普通队列，直接进入发布通道      │
   │ - 占用账号当前配额                   │
   │ - 完成后记录热点响应效果             │
   └─────────────────────────────────────┘
```

#### 3.9.3 热点Prompt模板

```
// 热点创作专用模板
const hotTopicPrompt = `
# 角色
你是一个资深自媒体运营专家，擅长蹭热点创作内容。

# 热点信息
热点话题：${topic}
热度趋势：${trend}
热度指数：${heat}

# 账号信息
账号人设：${personaDesc}
目标受众：${targetAudience}
内容风格：${contentStyle}

# 任务
请基于上述热点，创作一条短视频脚本。

# 要求
1. 开头必须在3秒内抓住观众注意力（使用热点关联钩子）
2. 内容必须与账号人设风格一致
3. 自然融入热点话题标签
4. 时长控制在${duration}秒内
5. 包含明确的行动号召（关注/点赞/评论）

# 输出格式
标题：[10个备选标题]
脚本：[分镜脚本]
标签：[3-5个标签，含热点标签]
`;
```

#### 3.9.4 热点效果追踪

```
热点响应记录：
{
  topic: "#春天的花",
  respondedAt: "2024-03-15 14:30",
  contentTitle: "春天的花这样做，清热又润肺！",
  account: "美食主号-抖音",
  publishResult: {
    playCount: 85000,
    likeCount: 3200,
    commentCount: 156,
    fansAdded: 230
  },
  performance: "高于账号平均 156%",
  roi: "高"
}
```

---

### 3.10 平台差异化策略详细设计

#### 3.10.1 平台内容特征对比

| 维度 | 抖音 | 小红书 | 快手 |
|------|------|--------|------|
| **时长** | 15秒-3分钟 | 9图/视频 | 10秒-10分钟 |
| **开场** | 3秒黄金时间 | 封面即内容 | 前3秒抓眼球 |
| **语言** | 口语化、节奏快 | 种草感、真实 | 接地气、老铁风 |
| **标签** | #热点话题 | ## 话题 | #标签 |
| **封面** | 文字+画面冲击 | 精美图片+滤镜 | 真实场景 |
| **互动** | 引导评论 | 引导收藏 | 引导关注 |

#### 3.10.2 平台适配引擎

```typescript
// 内容平台适配
interface PlatformAdapter {
  platform: string;
  transform(content: RawContent): TransformedContent;
}

// 示例：同一素材适配不同平台
const rawContent = {
  title: "夏季养生汤做法",
  script: "完整脚本...",
  coverImage: "生成的封面图"
};

// 抖音适配
const douyinVersion = douyinAdapter.transform(rawContent);
// 输出：标题15字内、节奏紧凑、标签带#

// 小红书适配
const xiaohongshuAdapter.transform(rawContent);
// 输出：标题可较长、种草风格、标签用##

// 快手适配
const kuaishouVersion = kuaishouAdapter.transform(rawContent);
// 输出：更接地气、时长更长、关注引导更强
```

#### 3.10.3 平台专属Prompt模板

```typescript
// 抖音Prompt
const douyinPrompt = `
# 平台特点
- 时长：15秒-3分钟
- 节奏：前3秒必须抓住注意力
- 语言：口语化、有节奏感
- 标签：带#号，蹭热点

# 要求
- 标题15字以内，制造悬念或好奇心
- 开头用痛点/数字/反差/疑问钩子
- 语速快、信息密度高
- 结尾引导互动（评论区见/点关注）
`;

// 小红书Prompt
const xiaohongshuPrompt = `
# 平台特点
- 形式：图文笔记或视频
- 风格：真实分享、有温度
- 语言：生活化、有代入感
- 标签：用## 号

# 要求
- 标题可较长，含关键词利搜索
- 内容有获得感（学到什么/得到什么）
- 图片精美、有调性
- 结尾引导收藏+关注
`;

// 快手Prompt
const kuaishuPrompt = `
# 平台特点
- 风格：接地气、真诚
- 老铁文化：像朋友分享
- 时长：可较长，真实感优先

# 要求
- 语言不要太书面，要像朋友聊天
- 真实场景、真诚表达
- 强关注引导
`;
```

#### 3.10.4 跨平台内容分发策略

```
内容生产优先级：
1. 抖音优先（流量最大）
2. 小红书适配（种草转化高）
3. 快手分发（长尾流量）

分发顺序示例：
┌─────────────────────────────────────────┐
│ 14:00 首发：抖音                        │
│         - 使用抖音专属Prompt            │
│         - 带热点标签                    │
│         - 18:00前发布                   │
├─────────────────────────────────────────┤
│ 16:00 二发：小红书                      │
│         - 适配小红书风格                │
│         - 侧重种草和实用价值            │
│         - 带上抖音首发链接（合规前提）   │
├─────────────────────────────────────────┤
│ 18:00 三发：快手                        │
│         - 适配快手风格                  │
│         - 更接地气版本                  │
│         - 可添加抖音话题引导关注        │
└─────────────────────────────────────────┘
```

---

### 3.11 账号安全策略详细设计

#### 3.11.1 风险检测维度

```
账号风险评分模型：

基础风险分（0-40分）
├── 发布频率异常：+15分
│   └── 单日发布 > 账号配额 × 1.5
├── 内容重复率高：+10分
│   └── 与历史内容相似度 > 70%
├── 标签重复率高：+10分
│   └── 连续5条使用相同标签
└── 敏感词命中：+5分
    └── 触发敏感词检测

动态风险分（0-60分）
├── 异地登录：+20分
│   └── IP地址与常用地不符
├── 设备切换：+15分
│   └── 检测到新设备登录
├── 被举报：+30分
│   └── 单条内容被举报
└── 限流历史：+10分
    └── 过去7天有被限流记录

风险等级：
- 0-30分：🟢 安全
- 31-60分：🟡 注意（减少发布频率）
- 61-80分：🟠 警告（暂停发布24小时）
- 81+分：🔴 高危（需人工介入）
```

#### 3.11.2 模拟真人操作策略

```
防检测机制：

1. 操作轨迹模拟
   ┌─────────────────────────────────────┐
   │ 不规则延迟：                        │
   │ - 点击间隔：随机 500ms - 2000ms    │
   │ - 页面滚动：模拟真人滑动            │
   │ - 鼠标移动：随机路径               │
   └─────────────────────────────────────┘

2. 行为模式随机化
   ┌─────────────────────────────────────┐
   │ - 发布前随机浏览其他内容（2-5分钟） │
   │ - 随机点赞/收藏其他内容             │
   │ - 随机查看评论区                   │
   │ - 随机搜索相关话题                 │
   └─────────────────────────────────────┘

3. 设备指纹规避
   ┌─────────────────────────────────────┐
   │ - 每个账号独立BrowserProfile        │
   │ - 随机UserAgent（维护UA池）         │
   │ - 禁用自动化特征标识（--disable-blink-features）│
   │ - 使用puppeteer-extra-plugin-stealth插件│
   │   （自动处理Canvas/WebGL/音频指纹） │
   └─────────────────────────────────────┘

**反检测实现：**
```typescript
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// 配置Stealth插件
puppeteerExtra.use(stealthPlugin({
  // 随机化这些指纹
  randomizeEngine: 'canvas',
  webglVendor: 'random',      // 随机WebGL厂商
  audioVendor: 'random',       // 随机音频指纹
}));

// 创建浏览器实例（每个账号独立）
async function createBrowserForAccount(profileId: string) {
  const browser = await puppeteerExtra.launch({
    userDataDir: `./profiles/${profileId}`,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
    headless: true,
  });
  return browser;
}

// UserAgent池轮换
const userAgentPool = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  // ... 更多UA
];

function getRandomUserAgent(): string {
  return userAgentPool[Math.floor(Math.random() * userAgentPool.length)];
}
```

4. IP质量控制
   ┌─────────────────────────────────────┐
   │ - 账号绑定常用IP段                  │
   │ - 新IP登录需人工确认               │
   │ - 避免多账号同IP并发操作            │
   └─────────────────────────────────────┘
```

#### 3.11.3 发布频率控制

```
权重级别配额（每日）：

高权重（主账号）：
┌─────────────────────────────────────┐
│ 每日上限：2条                       │
│ 两次发布间隔：最短6小时             │
│ 高峰时段加成：可发布1条额外内容     │
│ （18:00-21:00视为黄金时段）         │
└─────────────────────────────────────┘

中权重（子账号）：
┌─────────────────────────────────────┐
│ 每日上限：5条                       │
│ 两次发布间隔：最短2小时             │
│ 黄金时段：可发布1条额外内容         │
└─────────────────────────────────────┘

低权重（矩阵号）：
┌─────────────────────────────────────┐
│ 每日上限：10条                      │
│ 两次发布间隔：最短30分钟            │
│ 无黄金时段加成                      │
└─────────────────────────────────────┘

超时降权规则：
- 连续3天达到上限 → 次日配额-1
- 单次违规超配额 → 触发风控警告
- 月度违规3次 → 降权处理
```

#### 3.11.4 异常处理流程

```
账号异常处理：

1. 限流检测
   症状：发布后播放量为0或远低于均值
   处理：
   - 自动降低该账号发布频率50%
   - 通知用户
   - 24小时后自动恢复或人工确认

2. 封号预警
   症状：收到平台警告/提示
   处理：
   - 立即暂停该账号所有发布任务
   - 通知用户确认
   - 等待7天后自动解封或人工申诉

3. Session失效
   症状：发布时返回登录态失效
   处理：
   - 标记账号状态为"待登录"
   - 通知用户重新扫码登录
   - 暂存待发布内容到草稿

4. 发布失败（可恢复）
   症状：网络错误/超时/平台错误
   处理：
   - 自动重试3次（间隔1分钟/2分钟/5分钟）
   - 重试仍失败 → 进入失败队列
   - 通知用户手动处理
```

---

### 3.12 数据采集链路详细设计

#### 3.12.1 数据采集时机

```
发布后数据回采计划：

发布时间 → 1小时 → 6小时 → 24小时 → 7天

┌──────────────────────────────────────────────────────┐
│ T+1小时                                             │
│ - 基础播放量                                        │
│ - 点赞/评论/收藏数量                                │
│ - 是否在推荐中                                      │
└──────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────┐
│ T+6小时                                             │
│ - 播放量增长曲线                                    │
│ - 完播率（如果平台提供）                            │
│ - 互动率趋势                                        │
└──────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────┐
│ T+24小时                                            │
│ - 完整数据快照                                      │
│ - 粉丝增长数                                        │
│ - 是否上热搜                                        │
└──────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────┐
│ T+7天                                               │
│ - 最终数据定稿                                      │
│ - 进入爆款分析样本                                  │
│ - ROI计算                                           │
└──────────────────────────────────────────────────────┘
```

#### 3.12.2 数据回采流程

**已知限制说明：**
- 平台页面结构可能变更，CSS选择器需要定期维护更新
- 部分数据（完播率、转化等）可能无法直接获取
- 建议：数据采集作为辅助功能，核心决策仍需人工判断

```typescript
// 数据回采流程
// 模拟登录 → 进入账号主页/作品页 → 解析数据 → 存储

async function harvestContentData(publishRecord: PublishRecord) {
  const account = await db.getAccount(publishRecord.accountId);
  const browser = await browserPool.getBrowser(account.browserProfileId);

  // 1. 打开作品页
  await browser.goto(`https://creator.douyin.com/content/?content_id=${publishRecord.contentId}`);

  // 2. 等待数据加载（带超时）
  try {
    await browser.waitForSelector('.data-panel', { timeout: 10000 });
  } catch (e) {
    // 选择器失效，尝试备用选择器
    await browser.waitForSelector('[class*="data"]', { timeout: 5000 }).catch(() => {});
  }

  // 3. 解析数据（多选择器备选）
  const data = await browser.evaluate(() => {
    // 主选择器 + 备用选择器
    const getText = (selectors: string[]) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el.textContent?.replace(/[^0-9]/g, '') || '0';
      }
      return '0';
    };

    return {
      playCount: parseInt(getText([
        '[data-e2e="play-count"]',
        '[class*="play-count"]',
        '[class*="playCount"]'
      ])) || 0,
      likeCount: parseInt(getText([
        '[data-e2e="like-count"]',
        '[class*="like-count"]'
      ])) || 0,
      commentCount: parseInt(getText([
        '[data-e2e="comment-count"]',
        '[class*="comment-count"]'
      ])) || 0,
      collectCount: parseInt(getText([
        '[data-e2e="collect-count"]',
        '[class*="collect-count"]'
      ])) || 0,
      shareCount: parseInt(getText([
        '[data-e2e="share-count"]',
        '[class*="share-count"]'
      ])) || 0,
      fansChange: parseInt(getText([
        '[data-e2e="fans-change"]',
        '[class*="fans-change"]'
      ])) || 0,
    };
  });

  // 4. 选择器失效回退：标记为"数据获取失败"，提示用户手动录入
  if (Object.values(data).every(v => v === 0)) {
    await db.insert('content_data_points', {
      publishRecordId: publishRecord.id,
      harvestedAt: Date.now(),
      status: 'selector_failed',
      manualEntryRequired: true
    });
    return null;
  }

  // 5. 存储数据
  await db.insert('content_data_points', {
    publishRecordId: publishRecord.id,
    harvestedAt: Date.now(),
    ...data,
    status: 'success'
  });

  return data;
}
```

**选择器维护机制：**
```typescript
// 选择器版本管理
interface SelectorVersion {
  version: number;
  platform: string;
  selectors: Record<string, string[]>;
  updatedAt: number;
  updatedBy: string;  // 'system' | 'user'
}

// 选择器失效上报
async function reportSelectorFailure(platform: string, field: string) {
  // 上报到选择器版本库
  // 用户可手动更新或等待系统更新
}
```

#### 3.12.3 数据分析模型

```typescript
// 1. 时段效果分析
interface TimeSlotAnalysis {
  slot: '06-09' | '09-12' | '12-14' | '14-18' | '18-21' | '21-24';
  avgPlay: number;
  avgLikeRate: number;      // 点赞/播放
  avgCommentRate: number;    // 评论/播放
  avgCompleteRate: number;   // 完播/播放
  sampleCount: number;       // 样本数量
  recommendation: '⭐' to '⭐⭐⭐⭐⭐';
}

// 2. 标签效果分析
interface TagAnalysis {
  tag: string;
  avgPlay: number;
  avgLikeRate: number;
  usageCount: number;
  performance: 'high' | 'medium' | 'low';
}

// 3. 爆款特征提取
interface ViralFeature {
  contentId: string;
  triggerFactors: {
    titleType: '数字' | '疑问' | '痛点' | '反差' | '悬念';
    openingHook: string;
    duration: number;         // 秒
    publishSlot: string;
    tagCombination: string[];
  };
  performance: {
    playCount: number;
    likeRate: number;
    viralScore: number;      // (播放/均值) × (互动/均值)
  };
}

// 4. 账号健康度
interface AccountHealth {
  accountId: string;
  overallScore: number;       // 0-100
  dimensions: {
    publishFrequency: number; // 发布规律性
    contentQuality: number;   // 内容质量稳定性
    interactionRate: number;  // 互动率健康度
    fansGrowth: number;       // 粉丝增长健康度
    violationCount: number;    // 违规历史
  };
  alerts: string[];           // 当前风险提示
}
```

#### 3.12.4 数据驱动优化闭环

```
┌─────────────────────────────────────────────────────┐
│                    数据采集                         │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                    数据分析                         │
│  - 时段分析（最佳发布时间）                        │
│  - 标签分析（高效标签组合）                        │
│  - 爆款分析（成功因子提取）                        │
│  - 对比分析（本周vs上周）                          │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                    策略优化                         │
│  - 调整发布时段                                     │
│  - 复用爆款公式                                    │
│  - 淘汰低效标签                                    │
│  - AI学习进化Prompt                                │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                    应用到创作                       │
│  - 生成时推荐最佳时段                              │
│  - 标题参考爆款类型                                │
│  - 自动带上高效标签                                │
│  - 脚本风格向成功案例学习                          │
└─────────────────────────────────────────────────────┘
```

---

### 3.13 互动自动化详细设计

#### 3.13.1 互动数据类型

```
评论类型分类：
┌─────────────────────────────────────┐
│ 高价值评论                          │
│ - 提问型（想了解更多）              │
│ - 购买意向型（在哪里买/多少钱）     │
│ - 正面反馈型（写得真好/太有用了）   │
│ - 转发分享型（已转发/已分享）        │
├─────────────────────────────────────┤
│ 普通评论                          │
│ - 简单互动（哈哈/赞）              │
│ - 表情评论                        │
├─────────────────────────────────────┤
│ 低价值/负面评论                    │
│ - 无意义刷屏                      │
│ - 负面情绪/攻击性言论             │
│ - 广告/导流                        │
└─────────────────────────────────────┘
```

#### 3.13.2 AI回复生成策略

**上下文窗口设计：**
```typescript
// 评论上下文范围配置
const COMMENT_CONTEXT_CONFIG = {
  // 提供当前评论的前后各N条评论作为上下文
  maxContextComments: 2,

  // 多长时间范围内的上下文有效（毫秒）
  contextWindowMs: 24 * 60 * 60 * 1000, // 24小时内

  // 单次Prompt最大Token限制
  maxPromptTokens: 2000,

  // 对话历史：只取同一用户在同一视频下的最新N条
  maxConversationHistory: 5,
};

// 获取评论上下文
async function getCommentContext(commentId: string): Promise<CommentContext> {
  const comment = await db.getComment(commentId);

  // 1. 获取相邻评论（上下各2条）
  const adjacentComments = await db.query(`
    SELECT * FROM comments
    WHERE content_id = ?
    AND created_at BETWEEN ? AND ?
    AND id != ?
    ORDER BY created_at ASC
    LIMIT 5
  `, [comment.contentId,
      comment.createdAt - COMMENT_CONTEXT_CONFIG.contextWindowMs,
      comment.createdAt + COMMENT_CONTEXT_CONFIG.contextWindowMs,
      commentId]);

  // 2. 获取同一用户的对话历史（如果有）
  const conversationHistory = await db.query(`
    SELECT * FROM comments
    WHERE author_id = ?
    AND content_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [comment.authorId, comment.contentId, COMMENT_CONTEXT_CONFIG.maxConversationHistory]);

  return {
    current: comment,
    adjacent: adjacentComments,
    conversation: conversationHistory,
  };
}
```

```typescript
// 评论回复Prompt模板
const commentReplyPrompt = `
# 角色
你是一个受欢迎的自媒体博主，正在与粉丝友好互动。

# 账号人设
账号风格：${personaStyle}
语言特点：${languageFeatures}

# 当前评论
"${commentText}"

# 评论上下文（当前视频下的其他评论，用于理解话题背景）
${contextComments.map(c => `"${c.text}"`).join('\n')}

# 评论类型
${commentType}

# 要求
1. 回复简洁有趣，不超过30字
2. 符合账号人设风格
3. 引导进一步互动（提问/讨论）
4. 不直接复制评论内容
5. 不暴露AI身份
6. 如果上下文中有类似问题的回复，可以引用

# 输出
回复内容：
`;

// 特殊场景处理
const specialReplyStrategies = {
  '购买意向': '引导到橱窗/私信',
  '负面情绪': '温和化解，不对抗',
  '广告导流': '礼貌拒绝',
  '重复问题': '引用之前回复，提示看评论区',
};
```

#### 3.13.3 回复审核机制

```
回复质量控制：

┌─────────────────────────────────────┐
│ 高置信度回复（AI直接发布）           │
│ - 评论类型明确（如提问型）           │
│ - 回复模板匹配度高                   │
│ - 无敏感词风险                       │
│ - 历史同类型回复效果好               │
└─────────────────────────────────────┘
                        ↓ 自动发布
                        ↓
┌─────────────────────────────────────┐
│ 中置信度回复（人工确认后发布）       │
│ - 评论类型模糊                       │
│ - 涉及产品/价格等商业信息           │
│ - 潜在负面情绪                       │
│ - 首次出现的评论类型                 │
└─────────────────────────────────────┘
                        ↓ 通知用户确认
                        ↓
┌─────────────────────────────────────┐
│ 低置信度回复（禁止自动回复）         │
│ - 涉及政治/宗教/医疗等敏感领域       │
│ - 负面情绪明显                       │
│ - 人身攻击性言论                     │
│ - 疑似竞争对手                       │
└─────────────────────────────────────┘
                        ↓ 通知用户手动处理
```

#### 3.13.4 互动数据统计

```
评论管理看板：

┌─────────────────────────────────────────────────────┐
│ 今日互动概览                                       │
│ 评论总数：156  │  已回复：89  │  待处理：67        │
├─────────────────────────────────────────────────────┤
│ 高价值评论（优先处理）：                            │
│ ┌─────────────────────────────────────────────────┐│
│ │ 💬 "这款产品在哪里买啊？" - 23分钟前 - 账号A   ││
│ │ 💬 "谢谢博主分享！" - 45分钟前 - 账号B        ││
│ │ 💬 "已入手，期待效果" - 1小时前 - 账号C       ││
│ └─────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────┤
│ 回复统计                                           │
│ 回复率：57%  │  平均回复时长：12分钟  │  互动率：8.3% │
├─────────────────────────────────────────────────────┤
│ 粉丝反馈热词                                       │
│ "便宜"出现12次  "好用"出现8次  "回购"出现5次       │
└─────────────────────────────────────────────────────┘
```

#### 3.13.5 私信自动处理

```
私信分类与处理：

┌─────────────────────────────────────┐
│ 自动回复类                          │
│ - 常见问题FAQ                       │
│ - 商品咨询（发送橱窗链接）          │
│ - 合作洽谈（转发给运营者）          │
├─────────────────────────────────────┤
│ 关键词触发类                        │
│ "多少钱" → 发送价格信息            │
│ "怎么买" → 发送购买链接            │
│ "合作" → 转发人工客服              │
│ "代理" → 发送代理政策              │
├─────────────────────────────────────┤
│ 禁止自动回复类                      │
│ - 辱骂/人身攻击                    │
│ - 涉政/涉黄内容                    │
│ - 竞争对手咨询                     │
└─────────────────────────────────────┘
```

---

## 4. 第三方API集成

### 4.1 AI对话模型
| 提供商 | 模型 | 适用场景 |
|--------|------|----------|
| OpenAI | GPT-4o / GPT-4 | 通用创作 |
| Anthropic | Claude 3.5/3.7 | 营销文案 |
| 阿里 | 通义千问 | 中文创作 |
| 百度 | 文心一言 | 中文创作 |
| 腾讯 | 混元 | 中文创作 |

### 4.2 图像生成
| 提供商 | 特点 |
|--------|------|
| Midjourney | 质量高，风格多样 |
| Stable Diffusion | 开源，可本地部署 |
| DALL-E | OpenAI官方 |
| 通义万相 | 中文理解好 |

### 4.3 视频生成
| 提供商 | 特点 |
|--------|------|
| Runway | 电影级效果 |
| Pika | 快速生成 |
| Kling | 快手出品 |
| 智谱 | 中文优化 |

### 4.4 配音
| 提供商 | 特点 |
|--------|------|
| ElevenLabs | 超真实情感 |
| 微软TTS | 多语言 |
| 阿里语音 | 中文自然 |

---

## 5. 数据存储

### 5.1 本地SQLite表结构
| 表名 | 说明 |
|------|------|
| accounts | 账号信息 |
| contents | 内容草稿/成品 |
| publish_records | 发布记录 |
| hot_topics | 热点记录 |
| api_configs | API配置 |
| settings | 用户设置 |

### 5.2 文件系统存储
```
/data
  /images      # AI生成的图片
  /videos      # AI生成的视频
  /audio       # 配音文件
  /downloads   # 从平台下载的内容
```

### 5.3 数据保留
- 用户自定义：7天/30天/90天/永久
- 重要数据永久保留
- 自动过期清理

---

## 6. 运营合规

### 6.1 账号安全
- 避免同IP多账号关联
- 合理发布频率控制
- 模拟真人操作轨迹

### 6.2 内容合规
- 敏感词检测
- 违禁内容过滤
- 版权风险提示

### 6.3 发布策略
- 账号分级发布频率限制
- 错峰发布避免拥堵
- 账号轮换机制

---

## 7. 用户界面

### 7.1 设计原则

**前端的本质：不是展示数据，是引导行动。**

用户用这个工具是为了**省时间、赚钱**，不是看报表。核心交互逻辑：

```
用户打开App → 看到"下一步该做什么" → 执行 → 完事
```

### 7.2 前端呈现规范

#### 7.2.1 数据展示原则

| 原则 | 错误做法 | 正确做法 |
|------|----------|----------|
| 主动推送 | 用户自己查数据 | 异常情况主动提醒 |
| 行动导向 | 显示"播放量2.3万" | 显示"播放量高于均值67%，标题贡献最大" |
| 对比分析 | 单一数据罗列 | 告诉你好在哪、差在哪 |
| 一键复制 | 用户自己总结规律 | 爆款公式一键应用到新内容 |

#### 7.2.2 首页设计（待办中心）

```typescript
// 首页数据结构
interface HomeData {
  alerts: Alert[];           // 主动提醒
  todayTodos: Todo[];        // 今日待办
  yesterdaySummary: Summary; // 昨日概览
}

// 告警示例
{
  type: '限流',
  account: '美食号-抖音',
  message: '账号限流中，建议24小时后发布',
  action: '查看详情'
}

// 待办示例
{
  type: '定时发布',
  time: '18:00',
  content: '凉拌菜教程',
  target: '美食号-抖音',
  action: '确认发布'
}

{
  type: '热点',
  topic: '#春天的花#',
  message: '冲上热搜，建议2小时内蹭热点',
  matchScore: '90%',
  action: '立即创作'
}
```

#### 7.2.3 时段分析呈现

```typescript
// 后端返回
interface TimeAnalysis {
  periods: {
    name: '早间' | '午间' | '晚间' | '深夜';
    timeRange: '06:00-09:00';
    avgPlay: number;
    avgLikeRate: number;
    stars: 1 | 2 | 3 | 4 | 5;  // 推荐指数
  }[];
  bestPeriod: string;
  suggestion: string;  // "您的美食类账号适合在 18:00-21:00 发布"
}

// 前端呈现
{
  "时段        平均播放    互动率    推荐指数",
  "06:00-09:00   3.2万     4.5%      ⭐⭐⭐",
  "12:00-14:00   5.1万     6.2%      ⭐⭐⭐⭐⭐",
  "18:00-21:00   8.7万     8.1%      ⭐⭐⭐⭐⭐",
  "21:00-24:00   6.3万     5.8%      ⭐⭐⭐⭐",

  "💡 建议：您的美食类账号适合在 18:00-21:00 发布"
}
```

#### 7.2.4 ROI看板呈现

```typescript
// 后端返回
interface ROIReport {
  month: string;
  aiCost: number;
  laborCost: number;
  totalCost: number;
  fansValue: number;
  gmv: number;
  totalRevenue: number;
  roi: string;  // "1:21"
  topContent: { title: string; roi: string }[];
  highROIFeatures: string[];  // ["标签#平价", "风格真实"]
}

// 前端呈现
{
  "本月总计：",
  "AI消耗 ¥386  |  涨粉价值 ¥8,200  |  预估ROI 1:21",

  "📈 单条内容ROI排名 TOP5：",
  "1. 平价护肤攻略  → 1:58  🏆",
  "2. 宿舍好物清单  → 1:45",
  "3. 新手化妆教程  → 1:32",

  "💡 高ROI内容特征：标签#平价 #学生党 风格真实"
}
```

#### 7.2.6 账号管理页面呈现

```typescript
// 后端返回
interface AccountList {
  accounts: {
    id: string;
    platform: '抖音' | '快手' | '小红书';
    nickname: string;
    avatar: string;
    type: '主账号' | '子账号' | '矩阵号';
    weight: '高' | '中' | '低';
    status: '活跃' | '限流' | '封禁' | '待登录';
    healthScore: number;  // 0-100
    todayPublishCount: number;
    todayLimit: number;   // 当日发布配额
    tags: string[];       // 内容领域标签
  }[];
  groups: { id: string; name: string; count: number }[];
}

// 前端呈现
{
  "账号矩阵",
  "分组：[全部] [抖音] [快手] [小红书] [按权重] [按领域]",

  "┌─ 主账号 ─────────────────────────┐",
  "│ 🎯 美食主号-抖音           健康度 95 │",
  "│    今日已发 1/2              🟢正常 │",
  "├─ 子账号 ─────────────────────────┤",
  "│ 📱 甜品号-抖音             健康度 88 │",
  "│    今日已发 3/5              🟡轻微限流 │",
  "├─ 矩阵号 ─────────────────────────┤",
  "│ 📦 矩阵1号-抖音           健康度 72 │",
  "│    今日已发 8/15             🔴限流中 │",
  "└─────────────────────────────────────┘",

  "[+ 添加账号]  [批量导入]  [分组管理]"
}
```

#### 7.2.7 AI创作页面呈现

```typescript
// 后端返回
interface AIGenerateResponse {
  titles: string[];           // 10个标题备选
  script: {
    content: string;          // 分镜脚本
    duration: number;         // 预估时长
    scenes: { time: string; desc: string }[];
  };
  tags: string[];
  platformAdaptations: {
    platform: string;
    title: string;
    script: string;
    tags: string[];
  }[];
}

// 前端呈现
{
  "🎬 AI内容创作",

  "主题：[                              ]",

  "内容类型：[短视频 ▼]  目标平台：[抖音 ▼]",

  "[🚀 开始生成]",

  "生成结果：",

  "📌 标题备选（点击选用）：",
  "1. 夏天必喝的3款养生汤，顺序很重要！",
  "2. 难怪你湿气重！原来是这个做错了",
  "3. 养生汤别乱喝！中医教的顺序才有效",

  "📝 脚本预览：",
  "00:00-00:05 开场：夏天喝汤的误区",
  "00:05-00:30 第一款：红豆薏米汤（去湿）",
  "00:30-00:55 第二款：冬瓜排骨汤（清热）",
  "00:55-01:20 第三款：莲子银耳汤（滋阴）",
  "01:20-01:30 结尾：总结+关注引导",

  "[选用标题1] [选用标题2] [选用标题3]",

  "🏷️ 推荐标签：#养生汤 #去湿气 #食谱 #健康",
  "[去水印版] [保留原标签]",

  "📱 平台适配：",
  "[抖音版] [小红书版] [快手版]",

  "📊 生成配图/视频/配音：",
  "[生成封面图] [生成视频] [生成配音]",

  "[💾 保存草稿]  [🚀 立即发布]"
}
```

#### 7.2.8 草稿库页面呈现

```typescript
// 后端返回
interface DraftList {
  drafts: {
    id: string;
    title: string;
    platform: string;
    status: '待完善' | '待发布' | '已发布' | '已过期';
    createdAt: string;
    expiresIn: number;  // 剩余天数
    thumbnail: string;
  }[];
  stats: {
    total: number;
    pending: number;
    published: number;
    expired: number;
  };
}

// 前端呈现
{
  "📚 草稿库",

  "统计：全部 12  |  待完善 3  |  待发布 6  |  已过期 3",
  "排序：[最新优先 ▼]  [平台 ▼]  [状态 ▼]",

  "┌─────────────────────────────────────────┐",
  "│ 🖼️ │ 凉拌菜教程          │ 抖音  │ 3天 │",
  "│    │ ✅待发布            │                 │",
  "├─────────────────────────────────────────┤",
  "│ 🖼️ │ 祛痘好物分享        │ 小红书│ 7天 │",
  "│    │ ⏳生成中            │                 │",
  "├─────────────────────────────────────────┤",
  "│ 🖼️ │ 夏日防晒攻略        │ 抖音  │ 已过期│",
  "│    │ ❌已失效            │                 │",
  "└─────────────────────────────────────────┘",

  "[新建草稿]  [批量导入]  [清理过期]",

  "⚠️ 有6条草稿即将过期，建议本周发布"
}
```

#### 7.2.9 热点中心页面呈现

```typescript
// 后端返回
interface HotTopicList {
  topics: {
    id: string;
    topic: string;
    heat: number;           // 热度指数
    trend: '↑上升' | '→平稳' | '↓下降';
    category: string;
    matchAccounts: { name: string; score: number }[];
    urgency: '紧急' | '一般';
  }[];
}

// 前端呈现
{
  "🔥 热点中心",

  "热搜榜单：",
  "┌──────────────────────────────────────────────────┐",
  "│ 🔥 #春天的花#          热度 98.5万  ↑上升 紧急 │",
  "│    匹配：美食号(95%) │ 建议立即蹭热点          │",
  "│    [立即创作]                                 │",
  "├──────────────────────────────────────────────────┤",
  "│ 📈 #考研出分#          热度 82.3万  →平稳     │",
  "│    匹配：教育号(80%)                         │",
  "│    [查看详情]                                 │",
  "├──────────────────────────────────────────────────┤",
  "│ 📉 #315曝光#          热度 76.1万  ↓下降     │",
  "│    匹配：无                                     │",
  "│    [跳过]                                      │",
  "└──────────────────────────────────────────────────┘",

  "⏰ 紧急热点响应（2小时内）：",
  "┌──────────────────────────────────────────────────┐",
  "│ ⚡ #春天的花#  匹配度95%  剩余1小时32分        │",
  "│    建议账号：美食主号(抖音)                     │",
  "│    [🚀 紧急创作]                               │",
  "└──────────────────────────────────────────────────┘",

  "[刷新]  [行业筛选：全部 ▼]"
}
```

#### 7.2.10 发布中心页面呈现

```typescript
// 后端返回
interface PublishQueue {
  pending: {
    id: string;
    content: string;
    account: string;
    scheduledAt: string;
    status: '待发布' | '发布中' | '重试中';
  }[];
  completed: {
    id: string;
    content: string;
    account: string;
    publishedAt: string;
    status: '成功' | '失败';
    error?: string;
  }[];
}

// 前端呈现
{
  "📤 发布中心",

  "发布队列（3条待发布）：",
  "┌──────────────────────────────────────────────────┐",
  "│ ⏰ 18:00  凉拌菜教程  → 美食主号-抖音  🟡排队中│",
  "│ ⏰ 18:30  祛痘好物    → 护肤号-小红书 🟡排队中│",
  "│ ⏰ 19:00  夏日防晒    → 矩阵1号-抖音  🟡排队中│",
  "└──────────────────────────────────────────────────┘",

  "今日已发布：5条成功 / 1条失败",

  "最近发布记录：",
  "┌──────────────────────────────────────────────────┐",
  "│ ✅ 14:23  养生汤教程  → 美食主号-抖音          │",
  "│ ✅ 12:45  祛痘攻略    → 护肤号-小红书           │",
  "│ ❌ 10:30  敏gan好物   → 矩阵2号-抖音  [重试]   │",
  "│    失败原因：账号限流中                         │",
  "└──────────────────────────────────────────────────┘",

  "[清空队列]  [导出记录]  [定时发布设置]"
}
```

#### 7.2.11 设置/API配置页面呈现

```typescript
// 后端返回
interface APIConfigs {
  chatAI: {
    provider: string;
    apiKey: string;        // 脱敏显示
    model: string;
    status: '正常' | '额度不足' | '连接失败';
  };
  imageAI: { ... };
  videoAI: { ... };
  audioAI: { ... };
}

// 前端呈现
{
  "⚙️ 设置",

  "📡 AI服务配置",
  "┌──────────────────────────────────────────────────┐",
  "│ 🤖 对话AI                                       │",
  "│    [OpenAI ▼]  [GPT-4o ▼]   状态：🟢正常     │",
  "│    Key: sk-xxxx...xxxx    [测试连接] [修改]    │",
  "├──────────────────────────────────────────────────┤",
  "│ 🎨 图像AI                                       │",
  "│    [Midjourney ▼]  [V6 ▼]    状态：🟢正常     │",
  "│    Key: sk-xxxx...xxxx    [测试连接] [修改]    │",
  "├──────────────────────────────────────────────────┤",
  "│ 🎬 视频AI                                       │",
  "│    [Runway ▼]  [Gen-3 ▼]    状态：🟡额度不足  │",
  "│    Key: sk-xxxx...xxxx    [充值] [修改]        │",
  "├──────────────────────────────────────────────────┤",
  "│ 🔊 配音AI                                       │",
  "│    [ElevenLabs ▼]  [v2 ▼]    状态：🟢正常     │",
  "│    Key: sk-xxxx...xxxx    [测试连接] [修改]    │",
  "└──────────────────────────────────────────────────┘",

  "📦 数据管理",
  "[导出数据]  [导入数据]  [清理缓存]  [自动备份：每日 ▼]",

  "🔔 通知设置",
  "[发布失败通知 ☑]  [热点提醒 ☑]  [限额预警 ☑]",

  "📱 快捷键",
  "[Ctrl+Shift+N] 新建内容",
  "[Ctrl+Shift+P] 打开发布中心",
  "[Ctrl+Shift+H] 快速首页]",

  "[检查更新]  当前版本 v1.0.0"
}
```

### 7.3 页面结构

```typescript
// 后端返回
interface ViralAnalysis {
  latestViral: {
    title: string;
    playCount: number;
    whyViral: string[];  // ["痛点选题", "数字标题", "黄金时段", "精准标签"]
    formula: string;
    canApplyToNew: true;
  };
  suggestions: string[];  // ["基于爆款分析，建议下一个选题方向：祛痘"]
}

// 前端呈现
{
  "🔥 爆款分析",
  ""3招解决毛孔粗大" 播放12.3万 👉 爆款！",

  "📊 为什么爆了？",
  "├─ 选题：痛点型（颜值焦虑）✓",
  "├─ 标题：数字型（3招）✓",
  "├─ 发布时间：20:30（黄金时段）✓",
  "└─ 标签：#护肤 #毛孔 #教程 ✓",

  "💡 复制这条成功的公式：",
  "痛点选题 + 数字标题 + 黄金时段 + 精准标签",

  "[一键应用此公式]"
}
```

### 7.3 页面结构

```
├── 首页（待办中心 + 告警 + 昨日概览）
├── 账号管理（矩阵管理）
├── AI创作（内容创作）
├── 草稿库（内容管理）
├── 热点中心（热点监测）
├── 发布中心（发布队列）
├── 数据分析（时段分析/ROI/爆款分析）
└── 设置（API配置）
```

### 7.4 设计风格

- 深色主题（运营者长时间使用）
- 简洁高效，减少点击次数
- 主动推送而非被动查询
- 每个数据都要有"下一步行动"


---

## 8. 实现优先级

### P0（核心MVP）
1. 账号管理（基础CRUD）
2. AI脚本生成
3. 模拟发布（单一平台）
4. 基础发布队列

### P1（完善功能）
1. 多平台发布
2. AI配图/配音
3. 热点监测（第三方API接入）
4. 数据追踪（回采机制 + 选择器维护）

### P2（智能化）
1. AI视频生成
2. 智能定时（基于时段统计）
3. 爆款分析（规则引擎）
4. 规则驱动优化（非ML，基于数据统计）

### P3（高级功能）
1. **互动自动化**（评论/私信自动回复）— ⚠️ 高复杂度，每个平台需独立开发自动化流程
2. **AI学习进化**（如需ML能力，需单独架构设计）

**复杂度说明：**
- P0-P1：可实现，技术风险可控
- P2：基于规则引擎，实现难度中等
- P3：需要大量平台逆向工程，建议分平台迭代

---

## 9. 风险与挑战

| 风险 | 影响 | 应对 |
|------|------|------|
| 平台封号 | 高 | 模拟真人操作，控制频率，使用Stealth插件 |
| 平台反爬虫 | 高 | 选择器维护机制，失败回退到手动录入 |
| API成本 | 中 | 按需调用，优化prompt |
| 第三方不稳定 | 中 | 多API备份，异常处理 |
| 内容同质化 | 低 | 个性化prompt，差异化策略 |
| 数据采集失败 | 中 | 多选择器备选，手动录入兜底 |

---

## 10. 成功标准

1. **效率提升**：单条内容制作时间从2小时缩短到20分钟
2. **矩阵规模**：支持50+账号同时管理
3. **内容质量**：AI生成内容可直接发布
4. **数据闭环**：真正实现数据驱动的内容优化

---

# CEO Review Report — 2026-03-23

## 审查模式：SELECTIVE EXPANSION

## 核心约束确认

- **发布内容API拿不到** → 浏览器自动化是唯一选择，不是备选
- **激进路线** → 多平台 + 完整AI能力同时上（已警告风险）
- **目标用户**：个人创作者，账号资产对用户极其重要

## 架构决策

| 问题 | 决策 | 理由 |
|------|------|------|
| 进程架构 | 保持 `fork()` | 浏览器自动化隔离更重要，IPC开销可接受 |
| 密钥存储 | 系统密钥链 | macOS Keychain / Windows Credential Store |
| 发布队列并发 | 自动延后执行 | 用户最少摩擦 |

## 高风险项

| 风险 | 等级 | 说明 |
|------|------|------|
| 浏览器自动化 | 🔴 极高 | 持续与平台反爬对抗，多平台=9倍维护负担 |
| 视频生成AI | 🟠 高 | 当前AI视频不稳定，可能拖慢项目 |
| 选择器硬编码 | 🟡 中 | 平台改版=全面维修，需Plugin架构 |

## 发现的问题

### 必须修复（P0范围）

1. **数据同步机制缺失**：服务进程更新SQLite后，渲染进程Zustand如何知道状态变化？需要IPC通知机制。

2. **选择器失效兜底策略**：备用选择器失效后，需要支持"手动介入后继续"，不是简单告警了事。

3. **AI生成中断恢复**：
   - 已生成文件是否丢失？
   - 恢复后是否从断点继续？
   - 超时请求是否有取消机制？

4. **Prompt注入风险**：用户输入进入prompt前必须做内容安全检测。

5. **N+1查询**：发布记录查询有N+1问题，改用JOIN。

6. **浏览器池内存计算**：`BROWSER_MEMORY_THRESHOLD` 应改为每个实例独立监控。

### 建议优化（P1范围）

7. **重试逻辑重复**：`RateLimiter`和`AIGateway`都有指数退避，建议抽取共享函数 `utils/retry.ts`。

8. **AI Provider Plugin架构**：新增Provider无需改核心代码。

9. **选择器版本管理系统**：选择器失效时自动告警、快速回滚。

10. **结构化日志 + Prometheus指标**：线上问题可排查。

11. **迁移幂等性**：迁移脚本失败后能安全重试。

## 未纳入范围

以下功能建议延后：

- **视频生成AI** — 技术不成熟，等稳定再接入
- **互动自动化（评论/私信）** — P3，被标记为高复杂度
- **MCN多成员协作** — 多用户权限系统
- **数据导出加密压缩** — 本地备份可先简单实现

## 扩展机会

| 机会 | 收益 | 成本 | 推荐 |
|------|------|------|------|
| Plugin架构（Provider/平台） | 新增无需改核心 | 中等 | ✅ P1做 |
| 选择器版本管理 | 失效自动告警 | 中等 | ✅ P1做 |
| 任务中断恢复机制 | 无缝继续创作 | 低 | ✅ P0做 |
| 结构化日志+Metrics | 线上可排查 | 低 | ✅ P0做 |

---

## 工程审查补充 — 2026-03-23

### 关键工程决策

| # | 问题 | 决策 |
|---|------|------|
| 1 | 服务进程崩溃恢复 | Checkpoint 机制（记录每步执行状态，崩溃后从最后成功步骤继续）|
| 2 | AI 并发数 | 限制 3 个并发请求 |
| 3 | IPC 来源验证 | 暂不需要（contextIsolation 已提供隔离）|
| 4 | 内容状态转换 | 用户手动确认 + 可选自动确认 + 24h 超时过期 |
| 5 | 浏览器内存监控 | 简化为实例数量限制（MAX_TOTAL_BROWSERS=5, MAX_IDLE=3）|

### 架构补充

#### 服务进程崩溃恢复

```
任务执行中崩溃 → 重启服务进程 → 读取任务 Checkpoint → 从最后成功步骤继续或标记失败
```

Checkpoints 保存位置：`publish_tasks.checkpoint` 字段（JSON）
```json
{
  "lastStep": "submit_form",
  "completedSteps": ["load_session", "navigate", "fill_title", "fill_content"],
  "formData": {"title": "xxx", "content": "xxx"},
  "timestamp": 1742700000
}
```

#### 内容状态机补充

```
草稿 → 生成中 → 待审核 ←→ 继续修改
                  ↓
            用户确认/超时 → 已确认 → 发布中 → 已发布
```

- 默认：用户手动点击"确认发布"
- 可选：用户设置"AI生成后自动确认"（跳过人工审核）
- 超时：24小时未确认 → 自动标记为过期草稿

### 测试计划

| 测试文件 | 覆盖场景 |
|----------|----------|
| `ai-gateway.test.ts` | 熔断降级、所有Provider失败、超时重试、指数退避 |
| `rate-limiter.test.ts` | 账号频率限制、平台冷却、幂等记录 |
| `task-queue.test.ts` | 入队、出队、取消、并发调度、Checkpoint恢复 |
| `browser-pool.test.ts` | 实例复用、数量限制、崩溃重启 |
| `publish.e2e.ts` | 完整发布流程、Session过期、选择器失效 |

### 性能补充

#### AI 并发控制

```typescript
// src/services/AIGateway.ts
class AIGateway {
  private concurrencyLimit = 3;
  private activeRequests = 0;
  private requestQueue: Array<() => void> = [];

  async chat(prompt: string, config: AIConfig): Promise<string> {
    if (this.activeRequests >= this.concurrencyLimit) {
      // 排队等待
      await new Promise(resolve => this.requestQueue.push(resolve));
    }
    this.activeRequests++;
    try {
      return await this.execute('chat', prompt, config);
    } finally {
      this.activeRequests--;
      const next = this.requestQueue.shift();
      if (next) next();
    }
  }
}
```

#### 浏览器池简化内存管理

```typescript
// src/services/BrowserPool.ts
const MAX_TOTAL_BROWSERS = 5;
const MAX_IDLE_BROWSERS = 3;
const MAX_IDLE_TIME_MS = 30 * 60 * 1000; // 30分钟
```

### 代码组织建议

```
src/
├── main/                    # 主进程
│   ├── index.ts
│   ├── window.ts
│   └── tray.ts
├── service/                 # 服务进程
│   ├── index.ts
│   ├── browser/
│   │   ├── BrowserPool.ts
│   │   └── selectors/       # 平台选择器（按平台分目录）
│   ├── ai/
│   │   ├── AIGateway.ts
│   │   └── providers/      # Plugin 模式
│   ├── queue/
│   │   ├── TaskQueue.ts
│   │   └── RateLimiter.ts
│   └── db/
│       ├── index.ts
│       └── migrations/
├── renderer/                # React UI
│   └── ...
├── shared/                  # 共享类型和常量
│   ├── types.ts
│   └── constants.ts
└── utils/
    └── retry.ts            # 共享重试逻辑
```

### 未纳入范围（工程）

- **IPC 来源验证** — 暂不需要，contextIsolation 已提供足够安全
- **AI Provider 热插拔** — P1 做，当前硬编码可接受

---

## 设计审查补充 — 2026-03-23

### 设计范围评估

| 页面 | 复杂程度 | 状态覆盖 |
|------|----------|----------|
| 首页（待办中心） | 中 | ❌ 无规范 → 已补充 |
| 账号管理 | 低 | ❌ 无规范 |
| AI创作 | 高 | ⚠️ 部分规范 |
| 草稿库 | 中 | ❌ 无规范 |
| 热点中心 | 中 | ❌ 无规范 |
| 发布中心 | 高 | ⚠️ 部分规范 |
| 数据分析 | 中 | ❌ 无规范 |
| 设置 | 低 | ❌ 无规范 |

### 初始设计评分：5/10

缺失：颜色系统、字体规范、间距规范、组件库规范、空状态设计、加载状态设计、错误状态设计、移动端适配、可访问性规范。

---

### Pass 1: 信息架构补充

**首页核心模式：待办驱动**

```
┌─────────────────────────────────────────────────────────┐
│  🔴 紧急告警（如果存在限流/封号风险）                        │
├─────────────────────────────────────────────────────────┤
│  📋 今日待办                                              │
│  ├─ ⚡ 热点响应：#春天的花，建议2小时内蹭热点 [立即创作] │
│  ├─ ⏰ 定时发布：18:00 凉拌菜 → 美食主号   [确认]       │
│  └─ 📝 草稿待续：祛痘好物分享              [继续编辑]     │
├─────────────────────────────────────────────────────────┤
│  📊 昨日概览                                              │
│     发布 5条 | 总播放 12.3万 | 互动率 6.2% | 涨粉 +23   │
└─────────────────────────────────────────────────────────┘
```

**设计原则：**
- 首页以"下一步该做什么"为核心
- 紧急事项（限流/封号）置顶显示
- 每个待办都有明确行动按钮
- 数据概览只用一句话总结

---

### Pass 2: 交互状态规范

#### 账号列表 - 空状态
```
┌─────────────────────────────────────────────────────────┐
│     📱                                                │
│     还没有添加任何账号                                   │
│                                                         │
│     连接你的第一个平台账号，开始批量运营                   │
│                                                         │
│     [+ 添加第一个账号]                                   │
└─────────────────────────────────────────────────────────┘
```

#### 发布队列 - 空状态
```
┌─────────────────────────────────────────────────────────┐
│     📤                                                │
│     发布队列空闲                                         │
│                                                         │
│     去创作内容或从草稿库选择发布                          │
│                                                         │
│     [去创作]  [草稿库]                                  │
└─────────────────────────────────────────────────────────┘
```

#### AI生成 - 加载状态
```
┌─────────────────────────────────────────────────────────┐
│     🎬 AI 正在生成...                                   │
│                                                         │
│     [████████████░░░░░░░]  60%                        │
│                                                         │
│     正在生成：脚本                                       │
│     预计剩余：约 30 秒                                   │
│                                                         │
│     [取消]                                              │
└─────────────────────────────────────────────────────────┘
```

#### 发布失败 - 错误状态
```
┌─────────────────────────────────────────────────────────┐
│     ❌ 发布失败                                          │
│                                                         │
│     账号"美食主号-抖音"发布失败                          │
│     原因：账号被限流，建议24小时后重试                   │
│                                                         │
│     [重新发布]  [跳过]  [查看详情]                       │
└─────────────────────────────────────────────────────────┘
```

---

### Pass 3: 用户旅程情感弧线

```
场景：用户早上下班通勤，打开App

STEP 1 | 用户打开App
  用户行为：启动App
  用户情感：期待看到今天有什么要做的
  设计支持：首页直接展示待办，不需额外点击

STEP 2 | 看到热点提醒
  用户行为：看到"热点#春天的花建议2小时内蹭"
  用户情感：有点紧迫感，但也有机会感
  设计支持：红色紧急标记 + 倒计时 + [立即创作]按钮

STEP 3 | 点击立即创作
  用户行为：一键进入AI创作，热点已填充
  用户情感：工具很懂我
  设计支持：热点自动填充到主题，不用手动输入

STEP 4 | AI生成中
  用户行为：等待，看到进度条
  用户情感：期待又有点焦虑（AI能生成好吗？）
  设计支持：显示当前步骤，预计剩余时间

STEP 5 | 审核内容
  用户行为：查看AI生成的脚本，可修改
  用户情感：AI写得还行，但我想改一下标题
  设计支持：标题一键切换 + 脚本可直接编辑

STEP 6 | 确认发布
  用户行为：点发布，选账号
  用户情感：确定能发出去吗？
  设计支持：显示发布到哪些账号，预计时间

STEP 7 | 发布成功
  用户行为：看到成功提示
  用户情感：爽，今天任务完成了
  设计支持：成功的视觉反馈 + 跳转到下一个待办
```

---

### Pass 4: AI模式风险提示

**需要避免的通用AI生成界面模式：**
- ❌ 标题列表用编号数字前缀（"1. xxx 2. xxx"）
- ❌ 进度条用纯色填充，不用渐变
- ❌ 生成结果用卡片网格展示
- ❌ "正在生成..." 用纯文字，不用图标

**建议的差异化做法：**
- ✅ 标题用标签选择器（点击标签切换选中态）
- ✅ 进度用分步指示器（步骤圆点 + 文字说明）
- ✅ 生成结果用内联展示，不是独立卡片
- ✅ 加载状态用应用内动画，不是系统loading

---

### Pass 5: 设计系统（待建立）

**建议后续通过 /design-consultation 建立：**
- 颜色系统（深色主题具体色值）
- 字体系统（推荐：Söhne / Inter / Noto Sans SC）
- 间距系统（4px基准网格）
- 阴影/圆角规范
- shadcn/ui 组件定制规范

---

### Pass 6: 可访问性最小要求

```css
/* 颜色对比度：至少 4.5:1 */
--text-primary: #e5e5e5;      /* 在深色背景上 > 12:1 ✅ */
--text-secondary: #a3a3a3;    /* 在深色背景上 > 5:1 ✅ */

/* 触摸目标：至少 44x44px */
button, a, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}

/* 焦点可见性 */
:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}
```

**键盘导航：**
```
Tab         → 下一个可聚焦元素
Shift+Tab   → 上一个可聚焦元素
Enter/Space → 激活按钮/链接
Escape      → 关闭模态/取消操作
Arrow keys  → 菜单/列表内导航
```

---

### Pass 7: 待明确的设计决策

| 决策项 | 当前状态 | 建议 |
|--------|----------|------|
| 颜色系统 | 只有"深色主题"四字 | 通过 /design-consultation 明确定义 |
| 字体系统 | 未定义 | 推荐使用 Söhne 或 Noto Sans SC |
| 移动端布局 | 未考虑 | 需要定义最小支持分辨率 |
| shadcn/ui 定制程度 | 未定义 | 需要定义品牌化定制范围 |
| 空状态文案风格 | 未定义 | 需要定义品牌语气 |

---

### 设计评分总结

| 维度 | 评分 |
|------|------|
| 信息架构 | 8/10 |
| 交互状态 | 7/10 |
| 用户旅程 | 7/10 |
| AI模式 | 6/10 |
| 设计系统 | 4/10（有缺失但可接受）|
| 可访问性 | 5/10 |
| **总体** | **6/10** |
