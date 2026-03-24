# AI 驱动层设计方案

## 核心理念

**每天重新开始，无记忆堆积。** AI 每次调用都从数据库实时读取上下文，不背历史包袱。AI 是调度者而非工具——读数据、做决策，任务系统执行。

---

## 架构

```
AIDirector（调度总入口，位于 src/service/ai-director.ts）
    │
    ├── analyzeFailure()     — 任务最终失败时调用
    ├── dailyBriefing()      — 每天早上8点定时调用（北京时间）
    ├── checkHotTopics()     — 热点检测（可开关）
    ├── dailyBriefingAll()   — 全局视角，所有平台一起分析
    └── analyzeNow()         — 前端手动触发
    │
    ↓
StrategyEngine（共用，位于 src/service/strategy-engine.ts）
    │
    ↓
AI Gateway（已有，复用）
    │
    ↓
Database（tasks / metrics，实时读取上下文）
```

**executeDecision() 放在 AIDirector 中**，不属于 StrategyEngine（StrategyEngine 职责是构造 Prompt 和解析输出，不含业务决策逻辑）。

---

## 四大触发点

### 触发点1：任务失败分析（自动）

```
任务达到最大重试次数（maxRetries） → 状态变为 failed
    ↓
检查：同一任务 AI 分析次数已达上限（最多2次）？
    ├── 是 → 跳过分析，记录"AI分析已达上限"，通知前端
    └── 否 → 继续
    ↓
AIDirector.analyzeFailure(task)
    ↓
StrategyEngine.buildPrompt('failure', context)  ← 实时查数据库填充
    ↓
AI → 返回结构化结果
    ↓
parseOutput() + validateOutput()
    ├── 格式错误 → 重试1次，还失败 → 发通知，流程继续
    └── 格式正确
    ↓
confidence 校验：不在 0.0-1.0 范围内 → 当作 0.5 处理
    ↓
executeDecision():
  shouldRetry=true + 有 retryAdvice → 用 RetryAdvice 修复参数，创建新任务
  shouldRetry=true + 无 retryAdvice → 改为 notify（无法自动修复）
  shouldRetry=false → 记录分析结果，通知前端
```

### 触发点2：每日策略（定时）

```
每天 08:00 北京时间 自动触发（仅对 active 账号）
    ↓
检查：是否有 active 账号？
    ├── 无 → 跳过本次，记录日志
    └── 有 → 继续
    ↓
AIDirector.dailyBriefingAll()  ← 全局视角，所有平台汇总
    ↓
StrategyEngine.buildPrompt('daily', context)  ← 实时查数据库
    ↓
AI → 返回各平台今日策略
    ↓
confidence >= 0.7 → 自动创建定时任务
confidence < 0.7  → 仅通知前端，由人确认
```

### 触发点3：热点检测（可开关）

```
每4小时检测一次（配置存在数据库，可关闭）
    ↓
AIDirector.checkHotTopics(platform)
    ↓
hot-topic-detector.ts 查询热点数据
    ├── 热点数据拉不到 → 使用默认热点列表（节假日、重要节点）兜底
    └── 有数据 → 继续
    ↓
StrategyEngine.buildPrompt('hot_topic', context)
    ↓
AI → 返回蹭热点建议
    ↓
confidence >= 0.8 + shouldChase=true → 创建内容生成任务（自动）
confidence >= 0.6 + shouldChase=true → 仅通知前端（半自动）
confidence < 0.6 或 shouldChase=false → 跳过
```

### 触发点4：手动触发（前端按钮）

```
用户点"让AI分析"
    ↓
IPC: ai:analyze-now { type: AITriggerType, platform?: Platform }
    ↓
platform 必填，根据 type 走对应分支
type 枚举：'failure' | 'daily' | 'hot_topic'
```

---

## StrategyEngine

### 上下文查询逻辑

**failure 类型 — 上下文从数据库实时查询：**

```typescript
function buildFailureContext(task: Task): FailureContext {
  // 该任务所在账号的历史失败记录（最近5条）
  const recentFailures = db.prepare(`
    SELECT id, error, platform, created_at
    FROM tasks
    WHERE platform = ? AND status = 'failed'
      AND id != ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(task.platform, task.id)

  // 该平台账号统计
  const accountStats = db.prepare(`
    SELECT
      COUNT(*) as totalPublished,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as successRate
    FROM tasks
    WHERE platform = ? AND type = 'publish'
  `).get(task.platform)

  return {
    platform: task.platform,
    taskType: task.type,
    title: task.title,
    error: task.error,
    retryCount: task.retryCount,
    recentFailures,
    accountStats,
  }
}
```

**daily 类型 — 上下文从数据库实时查询：**

```typescript
function buildDailyContext(platform: Platform): DailyContext {
  const today = new Date().setHours(0, 0, 0, 0)
  const yesterday = today - 86400000
  const sevenDaysAgo = today - 86400000 * 7

  // 昨日任务结果
  const yesterdayResults = db.prepare(`
    SELECT id, title, status, result, error, platform
    FROM tasks
    WHERE platform = ? AND created_at >= ? AND created_at < ?
  `).all(platform, yesterday, today)

  // 近7天汇总
  const last7Days = db.prepare(`
    SELECT
      COUNT(*) as totalPublished,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM tasks
    WHERE platform = ? AND created_at >= ?
  `).get(platform, sevenDaysAgo)

  // 账号健康状态
  const accountHealth = db.prepare(`
    SELECT status, last_used_at FROM accounts WHERE platform = ? AND status = 'active'
  `).get(platform)

  return { yesterdayResults, last7Days, accountHealth }
}
```

### Prompt 模板

**failure 类型：**
```json
{
  "role": "社交媒体发布失败分析专家",
  "task": "分析以下任务失败原因，给出修复建议",
  "context": {
    "platform": "douyin",
    "taskType": "publish",
    "title": "视频标题",
    "error": "选择器定位失败: [data-e2e='publish-btn']",
    "retryCount": 3,
    "recentFailures": [
      { "error": "登录态失效", "created_at": 1742000000 },
      { "error": "选择器定位失败", "created_at": 1741900000 }
    ],
    "accountStats": { "totalPublished": 12, "successRate": 0.75 }
  },
  "outputFormat": {
    "diagnosis": "最可能根因，限50字以内",
    "suggestions": ["建议1", "建议2"],
    "confidence": "0.0到1.0之间的数字",
    "shouldRetry": true,
    "retryAdvice": {
      "action": "update_selector",
      "params": { "selectorKey": "publish_confirm", "fallbackIndex": 1 }
    }
  }
}
```

**daily 类型：**
```json
{
  "role": "社交媒体内容策略专家",
  "task": "根据近期数据，制定今日内容计划",
  "context": {
    "platform": "douyin",
    "date": "2026-03-24",
    "yesterdayResults": [
      { "title": "美妆教程", "status": "completed", "engagement": 11000 }
    ],
    "last7Days": { "totalPublished": 8, "completed": 6, "failed": 2 },
    "accountHealth": { "status": "active", "followers": 1200 }
  },
  "outputFormat": {
    "recommendedTopics": ["选题1", "选题2"],
    "bestTimes": [9, 12, 20],
    "warnings": ["注意..."],
    "confidence": "0.0到1.0之间的数字"
  }
}
```

**hot_topic 类型：**
```json
{
  "role": "热点蹭点策略专家",
  "task": "判断是否要蹭某个热点",
  "context": {
    "platform": "douyin",
    "hotTopic": { "keyword": "XXX", "heatScore": 9500, "normalizedScore": 0.95 },
    "accountFit": { "recentTopics": ["美妆"], "avgEngagement": 11000 }
  },
  "outputFormat": {
    "shouldChase": true,
    "reason": "蹭热点的理由，限50字以内",
    "contentAngle": "蹭热点的内容角度建议",
    "confidence": "0.0到1.0之间的数字"
  }
}
```

### 输出解析

```typescript
function parseOutput(raw: string): object {
  let json: any
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error('AI返回不是有效JSON')
  }

  // confidence 范围校验，不在0-1之间当作0.5处理
  if (typeof json.confidence !== 'number' || json.confidence < 0 || json.confidence > 1) {
    json.confidence = 0.5
  }

  return json
}

// 重试一次，还失败就抛错，不卡死主流程
function parseOutputWithRetry(raw: string): object {
  try {
    return parseOutput(raw)
  } catch {
    // 第二次机会
    const retry = callAIAgain(raw)
    return parseOutput(retry)
  }
}
```

---

## RetryAdvice 结构（防注入）

`retryAdvice` 不能是自由文本，而是结构化指令，白名单限制可修改字段：

```typescript
type RetryAction =
  | 'update_selector'      // 换备用选择器
  | 'increase_timeout'     // 增加超时时间
  | 'use_backup_account'  // 换备用账号
  | 'skip'                 // 跳过执行

interface RetryAdvice {
  action: RetryAction
  params: {
    selectorKey?: string      // 选择器 key，如 'publish_confirm'
    fallbackIndex?: number    // 使用第几个备用选择器
    timeoutMs?: number        // 超时毫秒数，如 30000
    accountId?: string        // 备用账号 ID
  }
}
```

**白名单校验：** `executeDecision` 在执行 `retryAdvice` 前，只允许上述 4 种 action，不允许修改 URL、payload、platform 等核心字段。

---

## AIFailureResult → AIDecision 转换

AI 返回的是 `AIFailureResult`，执行前需先转换为 `AIDecision`：

```typescript
// 位于 AIDirector 内
function buildDecision(result: AIFailureResult, task: Task): AIDecision {
  // 无效 confidence → 当作 0.5
  const confidence = (result.confidence >= 0 && result.confidence <= 1)
    ? result.confidence : 0.5

  if (result.shouldRetry && result.retryAdvice) {
    // 有修复建议 → 用修复参数重试
    return {
      action: 'retry_with_fix',
      reason: result.diagnosis,
      confidence,
      params: {
        type: task.type,
        platform: task.platform,
        title: task.title,
        payload: {
          ...task.payload,
          ...result.retryAdvice.params,  // AI 建议的参数覆盖
        },
        _retryAdvice: result.retryAdvice, // 记录本次重试用了什么建议
      }
    }
  }

  if (result.shouldRetry && !result.retryAdvice) {
    // 要重试但没有具体建议 → 只通知人，不自动执行
    return {
      action: 'notify',
      reason: `${result.diagnosis}（AI建议重试但无具体方案）`,
      confidence,
      params: { taskId: task.id, result }
    }
  }

  // 不重试 → 记录诊断结果，通知人
  return {
    action: 'notify',
    reason: result.diagnosis,
    confidence,
    params: { taskId: task.id, result }
  }
}
```

---

## 决策执行（位于 AIDirector）

```typescript
interface AIDecision {
  action: 'retry_with_fix' | 'create_task' | 'notify' | 'skip'
  reason: string
  confidence: number
  params: Record<string, unknown>
}

async executeDecision(decision: AIDecision): Promise<void> {
  switch (decision.action) {
    case 'retry_with_fix':
      await taskQueue.create(decision.params)  // 用AI建议的参数创建新任务
      break
    case 'create_task':
      await taskQueue.create(decision.params)
      break
    case 'notify':
      broadcastToRenderers('ai:recommendation', decision)
      break
    case 'skip':
      log.info('[AIDirector] AI决策跳过:', decision.reason)
      break
  }
}
```

---

## 新增类型

```typescript
// src/shared/types.ts

type RetryAction = 'update_selector' | 'increase_timeout' | 'use_backup_account' | 'skip'

interface RetryAdvice {
  action: RetryAction
  params: {
    selectorKey?: string
    fallbackIndex?: number
    timeoutMs?: number
    accountId?: string
  }
}

interface AIFailureResult {
  taskId: string
  diagnosis: string       // 最多50字
  suggestions: string[]   // 每条最多30字
  confidence: number      // 0.0-1.0
  shouldRetry: boolean
  retryAdvice?: RetryAdvice
}

interface DailyPlan {
  date: string
  platform: Platform
  recommendedTopics: string[]
  bestTimes: number[]     // 北京时间小时，如 [9, 12, 20]
  warnings: string[]
  confidence: number
}

interface HotTopicDecision {
  topic: string
  shouldChase: boolean
  reason: string
  contentAngle: string
  confidence: number
}

type AITriggerType = 'failure' | 'daily' | 'hot_topic'
```

---

## 循环保护

**同一任务 AI 分析次数上限：2次**

```typescript
// 在 tasks 表增加 ai_analysis_count 字段（INT DEFAULT 0）
// 每次触发 analyzeFailure 前：
const task = taskQueue.get(taskId)
if ((task.aiAnalysisCount ?? 0) >= 2) {
  broadcastToRenderers('ai:feedback', {
    taskId,
    skipped: true,
    reason: 'AI分析次数已达上限'
  })
  return
}
// 分析完后：
taskQueue.updateField(taskId, 'ai_analysis_count', task.aiAnalysisCount + 1)
```

---

## 并发控制

**多个账号同时达到失败上限时，AI 分析串行执行，不并发调用 AI**

```typescript
// AIDirector 内部维护一个队列
let pendingAnalysis = false
const analysisQueue: Task[] = []

async function analyzeWithQueue(task: Task) {
  if (pendingAnalysis) {
    analysisQueue.push(task)
    return  // 等前面的分析完
  }
  pendingAnalysis = true
  try {
    await doAnalyze(task)
  } finally {
    pendingAnalysis = false
    const next = analysisQueue.shift()
    if (next) doAnalyze(next)
  }
}
```

---

## 新增文件

| 文件 | 作用 |
|------|------|
| `src/service/strategy-engine.ts` | Prompt模板 + 上下文查询 + 输出解析 + 校验 |
| `src/service/ai-director.ts` | 调度总入口，4种触发点，循环保护，并发控制 |
| `src/service/hot-topic-detector.ts` | 热点检测（框架，爬虫逻辑后续填充；空数据时用默认热点兜底）|

## 修改文件

| 文件 | 改动 |
|------|------|
| `src/shared/types.ts` | 新增类型 + tasks 表加 `ai_analysis_count` 字段 |
| `src/service/queue.ts` | `markFailed` 达上限时调用 `aiDirector.analyzeFailure()` |
| `src/service/db.ts` | tasks 表增加 `ai_analysis_count INT DEFAULT 0` 列 |
| `src/service/ipc-handlers.ts` | 新增4个 IPC 通道 |
| `src/service/service-process.ts` | 启动时注册每日08:00定时任务 |

---

## 错误处理汇总

| 错误场景 | 处理方式 |
|----------|---------|
| AI返回格式不对 | 重试1次，还失败 → 发通知，流程继续 |
| AI熔断器触发 | AI Gateway自带保护，该平台跳过 |
| 热点数据拉不到 | 用默认热点列表（节假日等）兜底 |
| `confidence` 超范围 | 当作0.5处理 |
| `shouldRetry=true` 但无`retryAdvice` | 改为notify，不自动执行 |
| 同一任务AI分析已达2次 | 跳过分析，发通知 |
| 无active账号执行每日策略 | 跳过本次，记录日志 |
| `hot_topic` confidence<0.6 | 跳过，不通知 |

---

## 实现顺序

1. **`db.ts`** — tasks 表增加 `ai_analysis_count` 字段
2. **`src/shared/types.ts`** — 新增所有类型
3. **`strategy-engine.ts`** — Prompt模板 + 上下文查询 + 输出解析
4. **`ai-director.ts`** — 框架 + 循环保护 + 并发控制 + analyzeFailure 逻辑
5. **`queue.ts`** — 接入 `analyzeFailure`（调用前先检查次数限制）
6. **`ipc-handlers.ts`** — 新增4个 IPC 通道
7. **`service-process.ts`** — 注册每日08:00定时任务（北京时间，用 setInterval 校准）
8. **`hot-topic-detector.ts`** — 框架先搭，爬虫逻辑后续填充

---

## 配置项（存数据库）

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `ai.daily.enabled` | true | 是否开启每日策略 |
| `ai.daily.time` | "08:00" | 每日策略触发时间（北京时间） |
| `ai.hotTopic.enabled` | false | 是否开启热点检测 |
| `ai.hotTopic.intervalHours` | 4 | 热点检测间隔 |
| `ai.confidence.threshold` | 0.7 | 每日策略自动执行阈值 |
| `ai.analysis.maxPerTask` | 2 | 同一任务最大AI分析次数 |
