# AI Native 内容矩阵 — 推广活动实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Goal:** 将 MatrixHub 从"人工配置+AI生成"的半自动模式，重构为"人说方向→AI完成一切"的 AI Native 模式。
>
> **Architecture:** 新的 `CampaignManager` 接管原 `Pipeline` 的职责，核心驱动 AI 负责全局决策，内容生成模型按账号独立调用，监控周期结束后等待用户反馈。
>
> **Tech Stack:** TypeScript / Electron / Playwright / better-sqlite3 / AI Gateway (多 Provider)
>
> **Scope Note:** MVP 仅支持抖音，内容类型仅视频和图文+语音两种。

---

## 文件变更总览

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/service/campaign-manager.ts` | 推广活动核心管理器 |
| `src/service/campaign-store.ts` | 推广活动数据持久化 |
| `src/service/strategy/content-strategy.ts` | AI 内容策略制定 |
| `src/service/strategy/hashtag-generator.ts` | AI Hashtag 生成 |
| `src/service/strategy/publish-scheduler.ts` | 发布时间调度（分散+冷却） |
| `src/service/strategy/iteration-decider.ts` | AI 迭代决策（效果好/不好） |
| `src/service/scraper/douyin-metrics.ts` | 抖音数据爬取 |
| `src/service/scraper/product-scraper.ts` | 产品信息抓取 |
| `src/service/moderation/content-moderator.ts` | 内容安全审核 |
| `src/shared/types-campaign.ts` | Campaign 相关类型定义 |
| `src/renderer/pages/CampaignLaunch/` | 推广启动页面 |
| `src/renderer/pages/CampaignReport/` | 推广报告页面 |
| `src/renderer/pages/CampaignDashboard/` | 推广仪表盘页面 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/shared/types.ts` | 新增 CampaignTask, CampaignStatus, ContentType 等类型 |
| `src/service/db.ts` | 新增 campaigns 表 |
| `src/service/ai-director.ts` | 升级为 CampaignDirector，新增决策函数 |
| `src/service/queue.ts` | 新增账号冷却时间记录 |
| `src/service/ipc-handlers.ts` | 新增 campaign:* IPC handlers |
| `src/renderer/App.tsx` | 新增 CampaignLaunch/CampaignReport/CampaignDashboard 路由 |
| `src/renderer/stores/appStore.ts` | 新增 campaign 相关状态 |
| `src/service/handlers/automation-handler.ts` | 删除 automation:confirm 调用 |
| `src/service/handlers/ipc-automation-handlers.ts` | 删除或保留（账号通知用） |
| `src/shared/ipc-channels.ts` | 新增 campaign:* channels |

### 删除文件

| 文件 | 原因 |
|------|------|
| `src/service/pipeline/orchestrator.ts` | 被 CampaignManager 替代 |
| `src/service/pipeline/store.ts` | 被 campaign-store.ts 替代 |
| `src/service/pipeline/input-parser.ts` | 逻辑并入 product-scraper.ts |
| `src/service/pipeline/content-generator.ts` | 逻辑并入 campaign-manager.ts |
| `src/renderer/pages/AutoCreation/` | 被 CampaignLaunch 替代 |

---

## 类型定义（src/shared/types.ts + src/shared/types-campaign.ts）

### 新增类型

```typescript
// Campaign 状态机
type CampaignStatus =
  | 'draft'           // 草稿（用户输入了但还没开始）
  | 'running'         // 执行中
  | 'waiting_feedback' // 等待用户反馈（48h报告已出）
  | 'iterating'       // AI 正在迭代
  | 'completed'       // 用户确认结束
  | 'failed';         // 连续失败，已停止

// 内容类型
type ContentType = 'video' | 'image_text'; // image_text = 图文

// 营销目标
type MarketingGoal = 'exposure' | 'engagement' | 'conversion';

// Campaign（推广活动）
interface Campaign {
  id: string;
  name: string;                    // 推广名称（用户输入）
  productUrl?: string;              // 产品链接
  productDescription?: string;      // 产品描述（补充/手动填）
  productInfo?: ProductInfo;        // AI 抓取的产品信息
  contentType: ContentType;
  addVoiceover: boolean;            // 是否加语音（仅图文）
  marketingGoal: MarketingGoal;
  targetAccountIds: string[];        // 目标账号 ID 列表
  status: CampaignStatus;
  createdAt: number;
  updatedAt: number;
  // 执行状态
  currentIteration: number;         // 当前迭代轮次
  consecutiveFailures: number;       // 连续失败次数
  lastFeedback?: 'good' | 'bad';     // 上次用户反馈
  // 报告
  latestReport?: CampaignReport;
}

// ProductInfo（产品信息）
interface ProductInfo {
  name: string;
  description: string;
  price?: string;
  specs?: string;
  brand?: string;
  targetAudience?: string;
  images: string[];                 // 产品图片 URL
}

// AccountPublishRecord（账号发布记录，用于冷却）
interface AccountPublishRecord {
  accountId: string;
  lastPublishedAt: number;          // 时间戳
  publishedToday: number;            // 今日已发布数量
}

// CampaignReport（效果报告）
interface CampaignReport {
  campaignId: string;
  generatedAt: number;
  metrics: AccountMetrics[];         // 每个账号的数据
  bestAccounts: string[];            // Top3 账号 ID
  worstAccounts: string[];           // 最差账号 ID
  recommendation: 'continue' | 'iterate' | 'stop';
  summary: string;                   // AI 生成的总结文字
}

// AccountMetrics
interface AccountMetrics {
  accountId: string;
  accountName: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  followerDelta: number;
  healthStatus: 'normal' | 'limited' | 'banned';
}
```

---

## Phase 1：基础建设（必须首先完成）

### Task 1: 类型定义 + 数据库

**Files:**
- Modify: `src/shared/types.ts` — 新增 CampaignTask, CampaignStatus, ContentType, MarketingGoal, Campaign, ProductInfo, CampaignReport, AccountMetrics, AccountPublishRecord
- Modify: `src/service/db.ts` — 新增 campaigns 表

```sql
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_url TEXT,
  product_description TEXT,
  product_info TEXT DEFAULT '{}',   -- JSON
  content_type TEXT NOT NULL,
  add_voiceover INTEGER DEFAULT 0,
  marketing_goal TEXT NOT NULL,
  target_account_ids TEXT DEFAULT '[]', -- JSON array
  status TEXT NOT NULL DEFAULT 'draft',
  current_iteration INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  last_feedback TEXT,
  latest_report TEXT,               -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
```

- [ ] **Step 1: 在 types.ts 新增所有 Campaign 相关类型**

```typescript
// src/shared/types.ts 新增
export type CampaignStatus = 'draft' | 'running' | 'waiting_feedback' | 'iterating' | 'completed' | 'failed';
export type ContentType = 'video' | 'image_text';
export type MarketingGoal = 'exposure' | 'engagement' | 'conversion';

export interface Campaign { ... }
export interface ProductInfo { ... }
export interface AccountMetrics { ... }
export interface CampaignReport { ... }
export interface AccountPublishRecord { ... }
```

- [ ] **Step 2: 在 db.ts 的 initializeSchema() 中新增 campaigns 表**

- [ ] **Step 3: 运行测试验证**

```bash
cd /Users/lylyyds/Desktop/MatrixHub
npx tsc --noEmit
```
Expected: 无编译错误

- [ ] **Step 4: Commit**

---

### Task 2: 修复 automation:confirm 架构问题

**Files:**
- Modify: `src/service/handlers/automation-handler.ts` — 删除 `ipcRenderer.invoke('automation:confirm', ...)` 调用，改为直接执行或抛出错误让上层处理
- Modify: `src/service/handlers/ipc-automation-handlers.ts` — 删除此文件（或保留账号异常通知功能，删除 confirm 功能）
- Modify: `src/shared/ipc-channels.ts` — 删除 AUTOMATION_CONFIRM channel

- [ ] **Step 1: 读取 automation-handler.ts 找到 ipcRenderer.invoke 调用位置**

- [ ] **Step 2: 删除 ipcRenderer 调用，automation 操作默认直接执行（不再等用户确认）**

automation-handler.ts 中的 `executeAutomationTask` 函数需要确认当前账号是否可以执行该操作（不应该再调用 ipcRenderer）。如果账号状态不允许，直接 throw Error 跳过。

- [ ] **Step 3: 删除 AUTOMATION_CONFIRM IPC channel**

- [ ] **Step 4: 运行测试**

```bash
cd /Users/lylyyds/Desktop/MatrixHub && npm run test 2>&1 | head -50
```
Expected: 测试通过，automation 相关测试需更新 mock

- [ ] **Step 5: Commit**

---

### Task 3: 修复 TaskType 不一致

**Files:**
- Modify: `src/shared/types.ts` — TaskType 定义
- Modify: `src/service/db.ts` — tasks 表 CHECK 约束
- Modify: `src/service/handlers/ipc-task-handlers.ts` — Zod schema

三处必须统一。选择 `fetch_data` 作为标准名称（因为这是数据库 schema 已有约束）。

- [ ] **Step 1: 统一 TaskType 定义**

- [ ] **Step 2: 统一 DB schema CHECK 约束**

- [ ] **Step 3: 统一 Zod schema**

- [ ] **Step 4: Commit**

---

## Phase 2：AI Director 升级 + Campaign 数据层

### Task 4: CampaignStore 数据访问层

**Files:**
- Create: `src/service/campaign-store.ts`

```typescript
import { getDb } from './db.js';
import type { Campaign, CampaignReport } from '../shared/types.js';

export function createCampaign(data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>): Campaign;
export function getCampaign(id: string): Campaign | null;
export function listCampaigns(status?: CampaignStatus): Campaign[];
export function updateCampaignStatus(id: string, status: CampaignStatus): void;
export function updateCampaignIteration(id: string, iteration: number, consecutiveFailures: number): void;
export function saveCampaignReport(id: string, report: CampaignReport): void;
export function setCampaignFeedback(id: string, feedback: 'good' | 'bad'): void;
```

- [ ] **Step 1: 实现所有函数**

- [ ] **Step 2: 写测试文件 `src/service/campaign-store.test.ts`**

```typescript
import { createCampaign, getCampaign, listCampaigns } from './campaign-store';

describe('campaign-store', () => {
  it('should create and retrieve a campaign', () => {
    const campaign = createCampaign({
      name: '测试推广',
      contentType: 'video',
      marketingGoal: 'exposure',
      targetAccountIds: ['acc-1', 'acc-2'],
      status: 'draft',
      currentIteration: 0,
      consecutiveFailures: 0,
    });
    const found = getCampaign(campaign.id);
    expect(found?.name).toBe('测试推广');
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
cd /Users/lylyyds/Desktop/MatrixHub && npx vitest run src/service/campaign-store.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

---

### Task 5: 升级 AI Director → CampaignDirector

**Files:**
- Modify: `src/service/ai-director.ts` — 新增 Campaign 相关函数

新增以下函数：

```typescript
// 制定内容策略（给每个账号分配不同内容角度）
export async function generateContentStrategy(
  campaign: Campaign,
  productInfo: ProductInfo,
  accountCount: number
): Promise<AccountContentPlan[]>;

interface AccountContentPlan {
  accountId: string;
  contentAngle: string;      // 内容角度描述
  targetAudience: string;    // 目标人群
  hashtagHints: string[];   // Hashtag 提示
}

// 决定是否需要迭代
export async function decideIteration(
  report: CampaignReport,
  currentIteration: number
): Promise<IterationDecision>;

interface IterationDecision {
  action: 'continue' | 'iterate' | 'stop';
  reason: string;
  newStrategyHints?: string;  // 换策略时的方向提示
}

// 生成迭代内容策略
export async function generateIterationStrategy(
  campaign: Campaign,
  previousReport: CampaignReport,
  badAccounts: string[]
): Promise<AccountContentPlan[]>;
```

- [ ] **Step 1: 实现 generateContentStrategy**

prompts：给核心驱动 AI 输入产品信息和账号数量，输出每个账号的内容角度/人群/hashtag 提示

- [ ] **Step 2: 实现 decideIteration**

基于效果数据决定：效果好→continue，效果差且迭代<2→iterate，效果差且迭代≥2→stop

- [ ] **Step 3: 实现 generateIterationStrategy**

接收上次报告和差账号列表，生成新的内容策略

- [ ] **Step 4: 写测试**

- [ ] **Step 5: Commit**

---

## Phase 3：产品抓取 + 内容审核

### Task 6: 产品信息抓取

**Files:**
- Create: `src/service/scraper/product-scraper.ts`

```typescript
export async function scrapeProductInfo(url: string): Promise<{
  success: boolean;
  data?: ProductInfo;
  error?: string;
}>;
```

实现要点：
- SSRF 防护：拒绝内网 IP（127.0.0.1, 10.x.x.x, 192.168.x.x 等）
- 支持简单 HTML 解析（title, meta description, og:image）
- 抓不到必要字段时返回 `success: false` + error

- [ ] **Step 1: 实现 scrapeProductInfo**

- [ ] **Step 2: 写测试（mock http response）**

```typescript
it('should reject internal IPs', async () => {
  const result = await scrapeProductInfo('http://127.0.0.1:8080/product');
  expect(result.success).toBe(false);
  expect(result.error).toContain('SSRF');
});
```

- [ ] **Step 3: Commit**

---

### Task 7: 内容安全审核

**Files:**
- Create: `src/service/moderation/content-moderator.ts`

```typescript
export interface ModerationResult {
  passed: boolean;
  violations: Violation[];
  revisedContent?: string;   // AI 修改后的内容
}

export interface Violation {
  type: 'extreme_words' | 'false_claims' | 'sensitive_industry' | 'banned_goods' | 'copyright';
  matched: string;
  severity: 'high' | 'medium' | 'low';
}

export async function moderateText(text: string): Promise<ModerationResult>;
export async function moderateAndFix(text: string): Promise<ModerationResult>;
```

违规词库使用硬编码的敏感词列表 + AI 辅助判断。AI 修改时调用文案模型重写。

- [ ] **Step 1: 实现 moderateText**

- [ ] **Step 2: 实现 moderateAndFix**（调用文案模型重写）

- [ ] **Step 3: 写测试**

- [ ] **Step 4: Commit**

---

## Phase 4：抖音数据爬取

### Task 8: 抖音数据爬虫

**Files:**
- Create: `src/service/scraper/douyin-metrics.ts`

```typescript
export async function scrapeAccountMetrics(
  page: Page,          // Playwright page（已登录）
  accountId: string
): Promise<AccountMetrics>;
```

实现要点：
- 使用 Playwright 打开创作者中心页面
- 爬取：播放量、点赞、评论、收藏、转发、粉丝变化
- 账号状态判断（是否被限流/封禁）
- 异常处理：页面打不开、超时、无数据

依赖 `PlatformLauncher` 维护的登录会话。

- [ ] **Step 1: 实现 scrapeAccountMetrics**

- [ ] **Step 2: 实现 scrapeCampaignMetrics（批量爬取所有账号）**

```typescript
export async function scrapeCampaignMetrics(
  accountIds: string[]
): Promise<AccountMetrics[]>;
```

并发爬取，失败账号单独记录 error，不阻塞其他账号。

- [ ] **Step 3: 写测试（需要 mock Playwright page）**

- [ ] **Step 4: Commit**

---

## Phase 5：发布调度引擎

### Task 9: 发布时间调度

**Files:**
- Create: `src/service/strategy/publish-scheduler.ts`

```typescript
export interface PublishSchedule {
  accountId: string;
  scheduledTime: number;     // Unix timestamp
  delayMinutes: number;      // 距离现在的分钟数
}

export function buildPublishSchedule(
  campaign: Campaign,
  accountPublishRecords: AccountPublishRecord[]
): PublishSchedule[];
```

调度规则：
- 同一产品内，账号间发布时间分散 10-30 分钟
- 每账号每日上限 2 条（DEFAULT_DAILY_LIMIT = 2）
- 同一账号发布后需冷却（COOLDOWN_HOURS = 4）
- AI 根据账号历史活跃时间决定具体发布时间

- [ ] **Step 1: 实现 buildPublishSchedule**

- [ ] **Step 2: 写测试**

```typescript
it('should disperse posts by 10-30 minutes between accounts', () => {
  const campaign = makeCampaign({ targetAccountIds: ['a', 'b', 'c'] });
  const schedule = buildPublishSchedule(campaign, []);
  const delays = schedule.map(s => s.delayMinutes).sort((a, b) => a - b);
  expect(delays[1] - delays[0]).toBeGreaterThanOrEqual(10);
  expect(delays[2] - delays[1]).toBeGreaterThanOrEqual(10);
});
```

- [ ] **Step 3: Commit**

---

## Phase 6：CampaignManager 核心编排

### Task 10: CampaignManager

**Files:**
- Create: `src/service/campaign-manager.ts`

这是整个系统的核心编排引擎。

```typescript
import { scrapeProductInfo } from './scraper/product-scraper.js';
import { generateContentStrategy, decideIteration, generateIterationStrategy } from './ai-director.js';
import { moderateAndFix } from './moderation/content-moderator.js';
import { buildPublishSchedule } from './strategy/publish-scheduler.js';
import { scrapeCampaignMetrics } from './scraper/douyin-metrics.js';
import { createCampaign, getCampaign, updateCampaignStatus, saveCampaignReport, setCampaignFeedback } from './campaign-store.js';
import { taskQueue } from './queue.js';
import { broadcastToRenderers } from './ipc-handlers.js';
import log from 'electron-log.js';

export async function launchCampaign(params: LaunchParams): Promise<Campaign>;
export async function handleFeedback(campaignId: string, feedback: 'good' | 'bad'): Promise<void>;
export async function checkCampaignProgress(campaignId: string): Promise<void>;

interface LaunchParams {
  name: string;              // 推广名称
  productUrl?: string;
  productDescription?: string;
  contentType: ContentType;
  addVoiceover: boolean;
  marketingGoal: MarketingGoal;
  targetAccountIds: string[];
}
```

**launchCampaign 流程：**
```
1. 产品信息 → scrapeProductInfo（失败→返回错误让用户手动填）
2. 创建 Campaign（status: 'running'）
3. 内容策略 → generateContentStrategy（为每个账号生成内容角度）
4. 发布调度 → buildPublishSchedule（计算每个账号的发发布时间）
5. 循环：对每个账号：
   a. 创建 publish task → taskQueue.create()
   b. 设置定时执行（scheduledAt = 分配的时间）
6. 广播 campaign:started 事件
7. 启动定时监控（6h / 24h / 48h 各爬一次数据）
```

**handleFeedback 流程：**
```
if good:
  → setCampaignFeedback(campaignId, 'good')
  → 继续当前策略，schedule 下一轮发布（如果有新内容要发）
  → broadcast campaign:continued

if bad:
  → setCampaignFeedback(campaignId, 'bad')
  → consecutiveFailures++
  → if consecutiveFailures >= 2:
      → updateStatus('failed')
      → broadcast campaign:failed（通知用户）
    else:
      → updateStatus('iterating')
      → generateIterationStrategy()
      → 生成新内容 → 发布 → 继续监控
      → broadcast campaign:iterating
```

**监控定时器**：Campaign 对象在内存中维护一个 Map（campaignId → { monitorTimers }），在 `checkCampaignProgress` 中爬取数据，48h 后生成报告并设置为 `waiting_feedback`。

- [ ] **Step 1: 实现 launchCampaign**

- [ ] **Step 2: 实现 handleFeedback**

- [ ] **Step 3: 实现 checkCampaignProgress**

- [ ] **Step 4: 写集成测试（mock 所有依赖）**

- [ ] **Step 5: Commit**

---

### Task 11: Campaign IPC Handlers

**Files:**
- Create: `src/service/handlers/ipc-campaign-handlers.ts`

```typescript
import { IpcChannel } from '../../shared/ipc-channels.js';

// channel: 'campaign:launch'
// channel: 'campaign:get'
// channel: 'campaign:list'
// channel: 'campaign:feedback'
// channel: 'campaign:cancel'
// channel: 'campaign:progress'  // push: campaign:updated
```

- [ ] **Step 1: 注册 IPC handlers**

- [ ] **Step 2: 在 ipc-handlers.ts 的 registerIpcHandlers 中调用 registerCampaignHandlers**

- [ ] **Step 3: Commit**

---

## Phase 7：UI 页面

### Task 12: CampaignLaunch 页面（推广启动）

**Files:**
- Create: `src/renderer/pages/CampaignLaunch/index.tsx`

页面元素：
- 推广名称输入框
- 产品链接输入框（+ 抓取状态提示）
- 产品描述补充 textarea（可选）
- 内容类型选择：视频 / 图文（单选）
- 语音开关（仅图文显示）
- 营销目标选择：曝光 / 互动 / 成交（单选）
- 目标账号选择（多选，展示已登录的抖音账号列表）
- 启动按钮

提交后：调用 `campaign:launch` IPC → 显示进度状态

- [ ] **Step 1: 实现 CampaignLaunch 页面**

- [ ] **Step 2: 实现产品链接抓取预览**（输入链接后点击"抓取"按钮，调用 scraper，展示抓取到的产品信息）

- [ ] **Step 3: Commit**

---

### Task 13: CampaignDashboard 页面（推广仪表盘）

**Files:**
- Create: `src/renderer/pages/CampaignDashboard/index.tsx`

页面元素：
- 进行中的推广列表（卡片形式）
- 每个卡片：推广名称、状态（running/waiting_feedback/iterating/failed）、创建时间
- 点击卡片 → 进入详情/报告

- [ ] **Step 1: 实现 CampaignDashboard**

- [ ] **Step 2: 监听 campaign:updated 事件刷新列表**

- [ ] **Step 3: Commit**

---

### Task 14: CampaignReport 页面（推广报告）

**Files:**
- Create: `src/renderer/pages/CampaignReport/index.tsx`

页面元素（48h 报告出来后显示）：
- 各账号数据表格（播放/点赞/评论/收藏/转发/粉丝变化）
- Top3 最好账号 vs 最差账号
- AI 总结文字
- 底部两个按钮：「效果好 👍」 / 「效果不好 👎」
- 历史报告列表（该推广的历次报告）

- [ ] **Step 1: 实现 CampaignReport**

- [ ] **Step 2: 反馈按钮调用 campaign:feedback IPC**

- [ ] **Step 3: Commit**

---

### Task 15: 路由整合

**Files:**
- Modify: `src/renderer/App.tsx` — 更新路由
- Modify: `src/renderer/stores/appStore.ts` — 新增 campaign 状态

```typescript
// App.tsx 路由
const PAGES = {
  overview: Overview,
  campaignLaunch: CampaignLaunch,    // 新增
  campaignDashboard: CampaignDashboard, // 新增
  campaignReport: CampaignReport,    // 新增（动态路由 /campaign/:id）
  contentManagement: ContentManagement,
  accountManagement: AccountManagement,
  scheduledPublish: ScheduledPublish,
  dataInsights: DataInsights,
  settings: Settings,
};
```

- [ ] **Step 1: 更新 App.tsx**

- [ ] **Step 2: Commit**

---

## Phase 8：旧代码清理

### Task 16: 删除 Pipeline 相关代码

**Files to delete:**
- `src/service/pipeline/orchestrator.ts`
- `src/service/pipeline/store.ts`
- `src/service/pipeline/input-parser.ts`
- `src/service/pipeline/content-generator.ts`
- `src/renderer/pages/AutoCreation/` （整个目录）

**Files to modify:**
- `src/renderer/App.tsx` — 删除 AutoCreation 路由和引用

- [ ] **Step 1: 删除 pipeline 目录**

- [ ] **Step 2: 删除 AutoCreation 页面**

- [ ] **Step 3: 删除 App.tsx 中的 AutoCreation 路由**

- [ ] **Step 4: 确保编译通过**

```bash
npx tsc --noEmit
```
Expected: 无错误

- [ ] **Step 5: Commit**

---

## 实施顺序建议

```
Phase 1（基础）→ Phase 2（数据+AI Director）
                         ↓
Phase 3（抓取+审核）→ Phase 4（爬虫）
          ↓                      ↓
Phase 5（调度）→ Phase 6（核心编排）
                              ↓
                    Phase 7（UI 页面）
                              ↓
                    Phase 8（清理旧代码）
```

Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8（顺序依赖必须严格遵守）

Phase 3 和 Phase 4 可以并行（互相不依赖）。

---

## Spec 覆盖检查

| Spec 章节 | 实现位置 |
|-----------|---------|
| 5 模型配置 | 设置页面已有 |
| 账号管理（登录+状态监控） | 已有，修改通知逻辑 |
| launchCampaign 流程 | Task 10 |
| 48h 监控周期 | Task 10（checkCampaignProgress） |
| 用户反馈 | Task 10（handleFeedback） |
| 迭代逻辑 | Task 5（decideIteration）+ Task 10 |
| 内容差异化 | Task 5（generateContentStrategy） |
| 时间分散 | Task 9 |
| 每账号每日上限 | Task 9 |
| 内容新鲜度 | Task 5（generateIterationStrategy 换策略） |
| 推广批次命名 | Task 12（Launch 页面有 name 输入） |
| 账号冷却 | Task 9 |
| 简报内容 | Task 13（Report 页面） |
| 反馈 UI | Task 13 |
| 产品信息抓取 | Task 6 |
| 违规检测 | Task 7 |
| 通知机制 | CampaignManager broadcast 事件 |
| 旧 pipeline 删除 | Task 16 |
| automation:confirm 删除 | Task 2 |

---

## Plan Self-Review

- [ ] 所有 Task 都有具体的文件路径和代码
- [ ] 没有 "TBD" / "TODO" 占位符
- [ ] 类型、函数名在 Task 间保持一致
- [ ] 实施顺序依赖清晰
- [ ] 测试文件与实现文件对应
