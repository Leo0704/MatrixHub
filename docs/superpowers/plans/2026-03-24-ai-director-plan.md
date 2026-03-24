# AI 驱动层实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MatrixHub 中实现 AI 驱动调度层，支持任务失败分析、每日策略、热点检测三大功能

**Architecture:** AI 是调度者而非工具，读取数据库实时上下文做决策，决策结果自动执行或通知用户。无记忆堆积，每天重新开始。

**Tech Stack:** TypeScript, Electron IPC, SQLite (better-sqlite3), 现有 AI Gateway

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/service/db.ts` | 修改 | tasks 表增加 `ai_analysis_count` 列 |
| `src/shared/types.ts` | 修改 | 新增 `AIFailureResult`, `DailyPlan`, `HotTopicDecision`, `RetryAdvice`, `AIDecision`, `AITriggerType` |
| `src/service/strategy-engine.ts` | 新建 | Prompt 模板 + 上下文查询 + 输出解析 |
| `src/service/ai-director.ts` | 新建 | 调度总入口，4 种触发点，循环保护，并发控制 |
| `src/service/hot-topic-detector.ts` | 新建 | 热点检测框架（爬虫逻辑后续填充）|
| `src/service/queue.ts` | 修改 | `markFailed` 达上限时调用 `aiDirector.analyzeFailure()` |
| `src/service/ipc-handlers.ts` | 修改 | 新增 4 个 IPC 通道 |
| `src/service/service-process.ts` | 修改 | 注册每日 08:00 定时任务 |

---

## 实现顺序

### Task 1: 修改 db.ts — tasks 表增加 ai_analysis_count 字段

**文件:** `src/service/db.ts:36`

- [ ] **Step 1: 找到 tasks 表的 CREATE TABLE 语句，在 `version INTEGER DEFAULT 1` 后添加 `ai_analysis_count INTEGER DEFAULT 0`**

查看现有 tasks 表建表语句末尾：
```sql
CREATE TABLE IF NOT EXISTS tasks (
  ...
  version INTEGER DEFAULT 1
)
```

在 `version` 后面添加新列：
```sql
version INTEGER DEFAULT 1,
ai_analysis_count INTEGER DEFAULT 0
```

- [ ] **Step 2: 用 ALTER TABLE 添加列（向后兼容已存在的数据库）**

在 initializeSchema 函数的 `db.exec(` CREATE TABLE...`)` 后，添加：
```typescript
// 向后兼容：已存在的数据库添加新列
db.exec(`ALTER TABLE tasks ADD COLUMN ai_analysis_count INTEGER DEFAULT 0`);
```

- [ ] **Step 3: 验证构建**

Run: `npm run build:main`
Expected: 编译成功，无错误

- [ ] **Step 4: 提交**

```bash
git add src/service/db.ts
git commit -m "feat(db): tasks 表增加 ai_analysis_count 字段"
```

---

### Task 2: 修改 src/shared/types.ts — 新增所有类型

**文件:** `src/shared/types.ts`

- [ ] **Step 1: 在文件末尾添加新类型**

在 `export interface AIResponse {` 附近添加：

```typescript
// RetryAdvice 白名单 action
export type RetryAction = 'update_selector' | 'increase_timeout' | 'use_backup_account' | 'skip'

// AI 建议的重试参数（结构化，防注入）
export interface RetryAdvice {
  action: RetryAction
  params: {
    selectorKey?: string      // 选择器 key，如 'publish_confirm'
    fallbackIndex?: number    // 使用第几个备用选择器
    timeoutMs?: number        // 超时毫秒数，如 30000
    accountId?: string        // 备用账号 ID
  }
}

// AI 失败分析结果
export interface AIFailureResult {
  taskId: string
  diagnosis: string           // 最多 50 字
  suggestions: string[]       // 每条最多 30 字
  confidence: number          // 0.0-1.0
  shouldRetry: boolean
  retryAdvice?: RetryAdvice
}

// AI 每日策略结果
export interface DailyPlan {
  date: string
  platform: Platform
  recommendedTopics: string[]
  bestTimes: number[]         // 北京时间小时，如 [9, 12, 20]
  warnings: string[]
  confidence: number
}

// AI 热点检测结果
export interface HotTopicDecision {
  topic: string
  shouldChase: boolean
  reason: string
  contentAngle: string
  confidence: number
}

// AI 决策（执行层使用）
export interface AIDecision {
  action: 'retry_with_fix' | 'create_task' | 'notify' | 'skip'
  reason: string
  confidence: number
  params: Record<string, unknown>
}

// AI 手动触发类型
export type AITriggerType = 'failure' | 'daily' | 'hot_topic'
```

- [ ] **Step 2: 验证构建**

Run: `npm run build:preload && npm run build:renderer`
Expected: 编译成功

- [ ] **Step 3: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat(types): 新增 AI 驱动层相关类型"
```

---

### Task 3: 新建 src/service/strategy-engine.ts — Prompt 模板 + 上下文查询 + 输出解析

**文件:** `src/service/strategy-engine.ts` (新建)

- [ ] **Step 1: 创建文件骨架**

```typescript
import { getDb } from './db.js'
import { aiGateway } from './ai-gateway.js'
import type { Task, Platform, AIFailureResult, DailyPlan, HotTopicDecision, RetryAdvice } from '../shared/types.js'
import log from 'electron-log'

export type PromptType = 'failure' | 'daily' | 'hot_topic'

/**
 * 构造 failure 类型的上下文（从数据库实时查询）
 */
function buildFailureContext(task: Task): object {
  const db = getDb()

  // 该平台历史失败记录（最近 5 条）
  const recentFailures = db.prepare(`
    SELECT error, created_at
    FROM tasks
    WHERE platform = ? AND status = 'failed' AND id != ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(task.platform, task.id)

  // 该平台发布统计
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM tasks
    WHERE platform = ? AND type = 'publish'
  `).get(task.platform) as any

  const successRate = stats.total > 0 ? (stats.completed / stats.total) : 0

  return {
    platform: task.platform,
    taskType: task.type,
    title: task.title,
    error: task.error ?? '未知错误',
    retryCount: task.retryCount,
    recentFailures,
    accountStats: { totalPublished: stats.total, successRate }
  }
}

/**
 * 构造 daily 类型的上下文（从数据库实时查询）
 */
function buildDailyContext(platform: Platform): object {
  const db = getDb()
  const now = Date.now()
  const today = new Date().setHours(0, 0, 0, 0)
  const yesterday = today - 86400000
  const sevenDaysAgo = today - 86400000 * 7

  // 昨日任务结果
  const yesterdayResults = db.prepare(`
    SELECT title, status, error
    FROM tasks
    WHERE platform = ? AND created_at >= ? AND created_at < ?
  `).all(platform, yesterday, today)

  // 近 7 天汇总
  const weekStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM tasks
    WHERE platform = ? AND created_at >= ?
  `).get(platform, sevenDaysAgo) as any

  // 账号健康状态
  const account = db.prepare(`
    SELECT status, last_used_at FROM accounts
    WHERE platform = ? AND status = 'active'
    LIMIT 1
  `).get(platform) as any

  return {
    platform,
    date: new Date().toISOString().split('T')[0],
    yesterdayResults,
    last7Days: {
      totalPublished: weekStats?.total ?? 0,
      completed: weekStats?.completed ?? 0,
      failed: weekStats?.failed ?? 0
    },
    accountHealth: {
      status: account?.status ?? 'inactive',
      lastUsedAt: account?.last_used_at
    }
  }
}

/**
 * 构造 hot_topic 类型的上下文
 */
function buildHotTopicContext(platform: Platform, hotTopic: { keyword: string; heatScore: number }): object {
  const db = getDb()

  // 该平台近 7 天发布的主题
  const recentTasks = db.prepare(`
    SELECT title, result
    FROM tasks
    WHERE platform = ? AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 10
  `).all(platform) as any[]

  // 估算平均互动（从 result JSON 中取 engagement）
  const engagements = recentTasks
    .map(t => {
      try { return JSON.parse(t.result as string)?.engagement ?? 0 } catch { return 0 }
    })
  const avgEngagement = engagements.length > 0
    ? engagements.reduce((a, b) => a + b, 0) / engagements.length : 0

  return {
    platform,
    hotTopic: { ...hotTopic, normalizedScore: hotTopic.heatScore / 10000 },
    accountFit: {
      recentTopics: recentTasks.map(t => t.title).slice(0, 5),
      avgEngagement: Math.round(avgEngagement)
    }
  }
}

/**
 * 构造 Prompt
 */
export function buildPrompt(type: PromptType, context: object): string {
  const roleMap: Record<PromptType, string> = {
    failure: '社交媒体发布失败分析专家',
    daily: '社交媒体内容策略专家',
    hot_topic: '热点蹭点策略专家'
  }

  const taskMap: Record<PromptType, string> = {
    failure: '分析以下任务失败原因，给出修复建议',
    daily: '根据近期数据，制定今日内容计划',
    hot_topic: '判断是否要蹭某个热点'
  }

  return JSON.stringify({
    role: roleMap[type],
    task: taskMap[type],
    context,
    outputFormat: type === 'failure'
      ? { diagnosis: '限50字以内', suggestions: ['每条30字以内'], confidence: '0.0到1.0之间的数字', shouldRetry: true, retryAdvice: { action: 'update_selector', params: { selectorKey: 'publish_confirm', fallbackIndex: 1 } } }
      : type === 'daily'
      ? { recommendedTopics: ['选题方向'], bestTimes: [9, 12, 20], warnings: ['注意事项'], confidence: '0.0到1.0之间的数字' }
      : { shouldChase: true, reason: '限50字以内', contentAngle: '蹭热点角度', confidence: '0.0到1.0之间的数字' }
  }, null, 2)
}

/**
 * 解析 AI 输出，带 confidence 范围校验
 */
export function parseAIOutput(raw: string): Record<string, unknown> {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error('AI返回不是有效JSON')
  }

  // confidence 范围校验
  if (typeof json.confidence !== 'number' || json.confidence < 0 || json.confidence > 1) {
    json.confidence = 0.5
  }

  return json
}

/**
 * 调用 AI 并解析输出，失败重试一次
 */
export async function callAI(type: PromptType, context: object): Promise<Record<string, unknown>> {
  const prompt = buildPrompt(type, context)

  const resp = await aiGateway.generate({
    providerType: 'openai',
    model: undefined,
    prompt,
    system: '你是一个严谨的社交媒体运营 AI。请严格按照指定的 JSON 格式输出，不要输出任何其他内容。'
  })

  if (!resp.success || !resp.content) {
    throw new Error(resp.error ?? 'AI 调用失败')
  }

  try {
    return parseAIOutput(resp.content)
  } catch (parseErr) {
    // 重试一次
    log.warn('[StrategyEngine] 首次解析失败，重试一次')
    const resp2 = await aiGateway.generate({
      providerType: 'openai',
      model: undefined,
      prompt: prompt + '\n\n请严格按 JSON 格式输出，不要输出其他内容。',
      system: '你是一个严谨的社交媒体运营 AI。'
    })
    if (!resp2.success || !resp2.content) {
      throw new Error(resp2.error ?? 'AI 重试失败')
    }
    return parseAIOutput(resp2.content)
  }
}
```

- [ ] **Step 2: 验证构建**

Run: `npm run build:main`
Expected: 编译成功

- [ ] **Step 3: 提交**

```bash
git add src/service/strategy-engine.ts
git commit -m "feat: 新建 StrategyEngine — Prompt 构造和输出解析"
```

---

### Task 4: 新建 src/service/ai-director.ts — 调度总入口

**文件:** `src/service/ai-director.ts` (新建)

- [ ] **Step 1: 创建文件**

```typescript
import { taskQueue } from './queue.js'
import { broadcastToRenderers } from './ipc-handlers.js'
import { callAI, buildPrompt } from './strategy-engine.js'
import { getHotTopics } from './hot-topic-detector.js'
import type { Task, AIFailureResult, DailyPlan, HotTopicDecision, AIDecision, AITriggerType, Platform, RetryAdvice } from '../shared/types.js'
import log from 'electron-log'

// ============ 并发控制 ============
let pendingAnalysis = false
const analysisQueue: Task[] = []

async function analyzeWithQueue(task: Task): Promise<void> {
  if (pendingAnalysis) {
    analysisQueue.push(task)
    return
  }
  pendingAnalysis = true
  try {
    await analyzeFailureImpl(task)
  } finally {
    pendingAnalysis = false
    const next = analysisQueue.shift()
    if (next) analyzeWithQueue(next)
  }
}

// ============ 循环保护 ============
const MAX_ANALYSIS_PER_TASK = 2

// ============ AIFailureResult → AIDecision 转换 ============
function buildFailureDecision(result: AIFailureResult, task: Task): AIDecision {
  const confidence = (typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1)
    ? result.confidence : 0.5

  if (result.shouldRetry && result.retryAdvice) {
    return {
      action: 'retry_with_fix',
      reason: result.diagnosis,
      confidence,
      params: {
        type: task.type,
        platform: task.platform,
        title: task.title,
        payload: { ...task.payload, ...result.retryAdvice.params },
        _retryAdvice: result.retryAdvice
      }
    }
  }

  if (result.shouldRetry && !result.retryAdvice) {
    return {
      action: 'notify',
      reason: `${result.diagnosis}（AI建议重试但无具体方案）`,
      confidence,
      params: { taskId: task.id, result }
    }
  }

  return {
    action: 'notify',
    reason: result.diagnosis,
    confidence,
    params: { taskId: task.id, result }
  }
}

// ============ 执行决策 ============
async function executeDecision(decision: AIDecision): Promise<void> {
  switch (decision.action) {
    case 'retry_with_fix':
      await taskQueue.create(decision.params as any)
      broadcastToRenderers('ai:recommendation', decision)
      break
    case 'create_task':
      await taskQueue.create(decision.params as any)
      broadcastToRenderers('ai:recommendation', decision)
      break
    case 'notify':
      broadcastToRenderers('ai:recommendation', decision)
      break
    case 'skip':
      log.info('[AIDirector] AI决策跳过:', decision.reason)
      break
  }
}

// ============ 核心实现 ============

async function analyzeFailureImpl(task: Task): Promise<void> {
  // 循环保护：检查分析次数
  const current = taskQueue.get(task.id)
  if (!current) return
  const analysisCount = (current as any).aiAnalysisCount ?? 0

  if (analysisCount >= MAX_ANALYSIS_PER_TASK) {
    broadcastToRenderers('ai:feedback', {
      taskId: task.id,
      skipped: true,
      reason: 'AI分析次数已达上限'
    })
    return
  }

  try {
    const result = await callAI('failure', { task, context: {} }) as unknown as AIFailureResult
    result.taskId = task.id

    // 更新分析次数
    taskQueue.updateField(task.id, 'ai_analysis_count', analysisCount + 1)

    // 转换并执行
    const decision = buildFailureDecision(result, task)
    await executeDecision(decision)

    // 通知分析结果
    broadcastToRenderers('ai:feedback', { taskId: task.id, result })

  } catch (err) {
    log.error('[AIDirector] analyzeFailure 失败:', err)
    broadcastToRenderers('ai:feedback', {
      taskId: task.id,
      error: (err as Error).message
    })
  }
}

export async function analyzeFailure(task: Task): Promise<void> {
  await analyzeWithQueue(task)
}

export async function dailyBriefing(platform: Platform): Promise<DailyPlan | null> {
  try {
    const context = { /* 从 strategy-engine 查 */ }
    const result = await callAI('daily', context) as unknown as DailyPlan

    const confidence = (typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1)
      ? result.confidence : 0.5

    if (confidence >= 0.7) {
      // 自动创建定时任务
      for (const topic of (result.recommendedTopics ?? []).slice(0, 2)) {
        for (const hour of (result.bestTimes ?? [9]).slice(0, 1)) {
          const scheduledAt = new Date()
          scheduledAt.setHours(hour, 0, 0, 0)
          if (scheduledAt.getTime() < Date.now()) {
            scheduledAt.setDate(scheduledAt.getDate() + 1)
          }
          await taskQueue.create({
            type: 'ai_generate',
            platform,
            title: `AI生成-${topic}`,
            payload: { promptType: 'default', topic },
            scheduledAt: scheduledAt.getTime()
          })
        }
      }
      broadcastToRenderers('ai:daily-plan', { platform, result })
    } else {
      broadcastToRenderers('ai:recommendation', {
        action: 'notify',
        reason: '置信度低于阈值，请人工确认',
        confidence,
        params: { platform, result }
      })
    }

    return result
  } catch (err) {
    log.error('[AIDirector] dailyBriefing 失败:', err)
    return null
  }
}

export async function checkHotTopics(platform: Platform): Promise<HotTopicDecision | null> {
  try {
    const hotTopics = await getHotTopics(platform)
    if (!hotTopics.length) return null

    const top = hotTopics[0]
    const context = { platform, hotTopic: top }
    const result = await callAI('hot_topic', context) as unknown as HotTopicDecision

    const confidence = (typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1)
      ? result.confidence : 0.5

    if (result.shouldChase && confidence >= 0.8) {
      await taskQueue.create({
        type: 'ai_generate',
        platform,
        title: `蹭热点-${result.topic}`,
        payload: { promptType: 'default', topic: result.contentAngle }
      })
      broadcastToRenderers('ai:hot-topic', { platform, result })
    } else if (result.shouldChase && confidence >= 0.6) {
      broadcastToRenderers('ai:recommendation', {
        action: 'notify',
        reason: result.reason,
        confidence,
        params: { platform, result }
      })
    }

    return result
  } catch (err) {
    log.error('[AIDirector] checkHotTopics 失败:', err)
    return null
  }
}

export async function analyzeNow(type: AITriggerType, platform: Platform, taskId?: string): Promise<void> {
  switch (type) {
    case 'failure': {
      if (!taskId) { log.warn('[AIDirector] failure类型需要taskId'); return }
      // 动态导入避免循环依赖
      const { taskQueue } = await import('./queue.js')
      const task = taskQueue.get(taskId)
      if (!task) { log.warn('[AIDirector] 任务不存在:', taskId); return }
      await analyzeWithQueue(task)
      break
    }
    case 'daily':
      await dailyBriefing(platform)
      break
    case 'hot_topic':
      await checkHotTopics(platform)
      break
    default:
      log.warn('[AIDirector] unknown analyzeNow type:', type)
  }
}

// ============ 全局每日简报（跨平台汇总分析）============

export async function dailyBriefingAll(): Promise<void> {
  const platforms: Platform[] = ['douyin', 'kuaishou', 'xiaohongshu']
  const results: DailyPlan[] = []

  for (const platform of platforms) {
    const r = await dailyBriefing(platform)
    if (r) results.push(r)
  }

  // 汇总后发一个全局通知
  broadcastToRenderers('ai:daily-briefing-all', { results })
  log.info('[AIDirector] 每日简报完成:', results.length, '个平台')
}
```

- [ ] **Step 2: 验证构建**

Run: `npm run build:main`
Expected: 编译成功

- [ ] **Step 3: 提交**

```bash
git add src/service/ai-director.ts
git commit -m "feat: 新建 AIDirector — 调度总入口"
```

- [ ] **Step 3: 提交**

```bash
git add src/service/ai-director.ts
git commit -m "feat: 新建 AIDirector — 调度总入口"
```

---

### Task 5: 修改 src/service/queue.ts — 增加 updateField 方法并接入 analyzeFailure

**文件:** `src/service/queue.ts`

- [ ] **Step 1: 添加 updateField 方法（在 updateStatus 方法附近）**

```typescript
/**
 * 更新单个字段
 */
updateField(taskId: string, field: string, value: unknown): Task | null {
  const db = getDb()
  const now = Date.now()
  db.prepare(`UPDATE tasks SET ${field} = ?, updated_at = ?, version = version + 1 WHERE id = ?`)
    .run(value, now, taskId)
  return this.get(taskId)
}
```

- [ ] **Step 2: 修改 markFailed，在达到上限时调用 aiDirector.analyzeFailure()**

找到 markFailed 中 `return this.updateStatus(taskId, 'failed', { error: ... })` 这行，在这之前添加：

```typescript
// 触发 AI 分析（异步，不阻塞返回）
// 注意：使用动态 import 避免循环依赖
// import { analyzeFailure } from './ai-director.js'  // 不能放顶层！
import('./ai-director.js').then(({ analyzeFailure }) => {
  analyzeFailure(task).catch(err => {
    log.error('[Queue] AI分析调用失败:', err)
  })
}).catch(err => {
  log.error('[Queue] 加载ai-director失败:', err)
})
```

**重要：`import` 语句不能放在文件顶层**，否则会造成循环依赖。必须用动态 `import()` 在函数内部调用。

- [ ] **Step 3: 验证构建**

Run: `npm run build:main`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add src/service/queue.ts
git commit -m "feat(queue): markFailed 达上限时触发 AI 分析"
```

---

### Task 6: 修改 src/service/ipc-handlers.ts — 新增 4 个 IPC 通道

**文件:** `src/service/ipc-handlers.ts`

- [ ] **Step 1: 在文件顶部 import 部分添加**

```typescript
// 注意：analyzeFailure 用动态 import 避免循环依赖
import { dailyBriefing, checkHotTopics, analyzeNow } from './ai-director.js'
```

- [ ] **Step 2: 在 registerIpcHandlers 函数末尾添加新的 handler 注册**

```typescript
// ============ AI 驱动 ============

// 注意：这里不用 top-level import analyzeFailure，
// 因为 taskQueue 已在文件顶部导入，会造成循环依赖
ipcMain.handle('ai:analyze-failure', async (_event, { taskId }: { taskId: string }) => {
  // 动态 import 避免循环依赖
  const { taskQueue } = await import('./queue.js')
  const task = taskQueue.get(taskId)
  if (!task) return { success: false, error: '任务不存在' }
  const { analyzeFailure } = await import('./ai-director.js')
  await analyzeFailure(task)
  return { success: true }
})

ipcMain.handle('ai:daily-briefing', async (_event, { platform }: { platform: Platform }) => {
  const result = await dailyBriefing(platform)
  return { success: true, result }
})

ipcMain.handle('ai:hot-topics', async (_event, { platform }: { platform: Platform }) => {
  const result = await checkHotTopics(platform)
  return { success: true, result }
})

ipcMain.handle('ai:analyze-now', async (_event, { type, platform, taskId }: { type: AITriggerType; platform: Platform; taskId?: string }) => {
  await analyzeNow(type, platform, taskId)
  return { success: true }
})
```

- [ ] **Step 3: 验证构建**

Run: `npm run build:main && npm run build:preload`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add src/service/ipc-handlers.ts
git commit -m "feat(ipc): 新增 4 个 AI 驱动 IPC 通道"
```

---

### Task 7: 修改 src/service/service-process.ts — 注册每日定时任务

**文件:** `src/service/service-process.ts`

- [ ] **Step 1: 在 startServiceLoop 函数中添加每日定时任务注册**

在 `aiGateway.loadProviders()` 后添加：

```typescript
// 注册每日 08:00 AI 简报（北京时间）
// 以及热点检测（每4小时）
import { dailyBriefingAll, checkHotTopics } from './ai-director.js'

function scheduleAI(): void {
  const platforms: Platform[] = ['douyin', 'kuaishou', 'xiaohongshu']

  // 每日简报检查（每分钟）
  const checkDaily = () => {
    const now = new Date()
    const beijingHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })).getHours()
    const beijingMinute = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })).getMinutes()
    if (beijingHour === 8 && beijingMinute < 5) {
      // 全局视角，所有平台一起分析
      dailyBriefingAll().catch(err => log.error('[Service] 每日简报失败:', err))
    }
  }

  // 热点检测（每4小时）
  let lastHotTopicCheck = 0
  const HOT_TOPIC_INTERVAL = 4 * 60 * 60 * 1000  // 4小时
  const runHotTopicCheck = () => {
    const now = Date.now()
    if (now - lastHotTopicCheck >= HOT_TOPIC_INTERVAL) {
      lastHotTopicCheck = now
      for (const platform of platforms) {
        checkHotTopics(platform).catch(err => log.error('[Service] 热点检测失败:', err))
      }
    }
  }

  setInterval(() => { checkDaily(); runHotTopicCheck() }, 60000)
  checkDaily()
  runHotTopicCheck()
}

// 在 startServiceLoop 末尾调用（在 aiGateway.loadProviders() 后）
scheduleAI()
```

注意：`scheduleAI` 同时处理每日简报和热点检测，两者都使用动态 import 的方式引用 `dailyBriefing` 和 `checkHotTopics`。

- [ ] **Step 2: 验证构建**

Run: `npm run build:main`
Expected: 编译成功

- [ ] **Step 3: 提交**

```bash
git add src/service/service-process.ts
git commit -m "feat(service): 注册每日简报和热点检测定时任务"
```

---

### Task 8: 新建 src/service/hot-topic-detector.ts — 热点检测框架

**文件:** `src/service/hot-topic-detector.ts` (新建)

- [ ] **Step 1: 创建文件骨架（爬虫逻辑空着，后续填充）**

```typescript
import type { Platform } from '../shared/types.js'
import log from 'electron-log'

interface HotTopic {
  keyword: string
  heatScore: number
}

/**
 * 获取热点列表（框架）
 *
 * 当前实现：返回默认节假日热点
 * 后续填充：参考 MediaCrawler 思路，用 Playwright 爬取平台热榜
 */
export async function getHotTopics(platform: Platform): Promise<HotTopic[]> {
  // TODO: 实现真正的热榜爬取
  // 参考 MediaCrawler:
  // 1. 打开浏览器，导航到平台热榜页
  // 2. 检查登录态
  // 3. 读取热榜数据
  // 4. 关闭浏览器

  // 默认节假日热点（兜底）
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  const defaultHotTopics: HotTopic[] = []

  // 节假日热点
  if (month === 3 && day >= 20 && day <= 25) {
    defaultHotTopics.push({ keyword: '春分踏青', heatScore: 8500 })
    defaultHotTopics.push({ keyword: '春季穿搭', heatScore: 7800 })
  }

  if (month === 4 && day >= 1 && day <= 5) {
    defaultHotTopics.push({ keyword: '清明出游', heatScore: 9000 })
  }

  if (month === 5 && day >= 1) {
    defaultHotTopics.push({ keyword: '五一假期', heatScore: 9500 })
  }

  if (defaultHotTopics.length === 0) {
    defaultHotTopics.push({ keyword: '今日推荐', heatScore: 5000 })
  }

  log.info(`[HotTopicDetector] 返回 ${defaultHotTopics.length} 个热点`)
  return defaultHotTopics
}
```

- [ ] **Step 2: 验证构建**

Run: `npm run build:main`
Expected: 编译成功

- [ ] **Step 3: 提交**

```bash
git add src/service/hot-topic-detector.ts
git commit -m "feat: 新建 HotTopicDetector 热点检测框架"
```

---

## 全量验证

- [ ] **Step 1: 全量构建**

Run: `npm run build`
Expected: 全部编译通过

- [ ] **Step 2: 运行测试**

Run: `npm test`
Expected: 测试通过

- [ ] **Step 3: 查看变更**

Run: `git diff --stat`
Expected: 8 个文件变更

---

## 验证方式

1. **任务失败 3 次** → 查看日志是否出现 `[AIDirector] analyzeFailure`，前端是否收到 `ai:feedback` 事件
2. **手动调 IPC** → 在 DevTools Console 执行 `window.electronAPI.analyzeNow('daily', 'douyin')` → 查看是否创建了定时任务
3. **每日定时** → 修改系统时间为 07:58，重启 App，观察 08:00 是否触发简报
