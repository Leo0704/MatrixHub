# AI 驱动层设计方案

## 核心理念

**每天重新开始，无记忆堆积。** AI 每次调用都从数据库实时读取上下文，不背历史包袱。AI 是调度者而非工具——读数据、做决策，任务系统执行。

## 架构

```
AIDirector（调度总入口）
    │
    ├── analyzeFailure()     — 任务最终失败时调用
    ├── dailyBriefing()      — 每天早上8点定时调用
    ├── checkHotTopics()     — 热点检测（可开关）
    └── analyzeNow()         — 前端手动触发
    │
    ↓
StrategyEngine（共用：Prompt构造 + 输出解析）
    │
    ↓
AI Gateway（已有，复用）
    │
    ↓
Database（tasks / metrics，实时读取上下文）
```

## 四大触发点

### 1. 任务失败分析（自动）

```
任务失败3次 → markFailed达上限
    ↓
AIDirector.analyzeFailure(task)
    ↓
StrategyEngine.buildPrompt('failure', task)
    ↓
AI → 返回 { diagnosis, suggestions, confidence, shouldRetry, retryAdvice }
    ↓
executeDecision():
  shouldRetry=true  → 用retryAdvice修复参数，重试任务
  shouldRetry=false → 记录分析结果 → 通知前端
```

### 2. 每日策略（定时）

```
每天 08:00 自动触发
    ↓
AIDirector.dailyBriefing(platform)
    ↓
StrategyEngine.buildPrompt('daily', platform)
    ↓
AI → 返回 { recommendedTopics, bestTimes, warnings, confidence }
    ↓
executeDecision():
  confidence>=阈值 → 自动创建定时任务
  confidence<阈值 → 仅通知前端，由人确认
```

### 3. 热点检测（可开关）

```
每4小时检测一次（可配置关闭）
    ↓
AIDirector.checkHotTopics(platform)
    ↓
StrategyEngine.buildPrompt('hot_topic', platform)
    ↓
AI → 返回 { shouldChase, reason, contentAngle, confidence }
    ↓
executeDecision():
  shouldChase=true → 创建内容生成任务 or 通知前端
  shouldChase=false → 跳过
```

### 4. 手动触发（前端按钮）

```
用户点"让AI分析"
    ↓
IPC: ai:analyze-now { type, platform }
    ↓
同上，根据type走对应分支
```

## StrategyEngine

### Prompt 模板（三固定）

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
    "recentFailures": [],
    "accountStats": { "totalPublished": 12, "successRate": 0.75 }
  },
  "outputFormat": {
    "diagnosis": "<50字",
    "suggestions": ["建议1", "建议2"],
    "confidence": 0.0-1.0,
    "shouldRetry": true/false,
    "retryAdvice": "如何修复"
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
    "yesterdayResults": [],
    "last7Days": { "totalPublished": 8, "avgEngagement": 8500, "bestTopic": "美妆" },
    "accountHealth": { "status": "active", "followers": 1200 }
  },
  "outputFormat": {
    "recommendedTopics": ["选题1", "选题2"],
    "bestTimes": [9, 12, 20],
    "warnings": ["注意..."],
    "confidence": 0.0-1.0
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
    "hotTopic": { "keyword": "XXX", "heatScore": 9500 },
    "accountFit": { "recentTopics": ["美妆"], "avgEngagement": 11000 }
  },
  "outputFormat": {
    "shouldChase": true/false,
    "reason": "<50字",
    "contentAngle": "蹭热点角度",
    "confidence": 0.0-1.0
  }
}
```

### 输出解析

- `parseOutput(raw)` — JSON.parse + schema校验
- 校验失败 → 重试一次（最多1次）
- 还失败 → 记录错误，返回 `{ success: false }`，流程不卡死

## 决策执行

```typescript
type AIDecision = {
  action: 'retry_with_fix' | 'create_task' | 'notify' | 'skip'
  reason: string
  confidence: number
  params: Record<string, unknown>
}

executeDecision(decision):
  retry_with_fix → taskQueue.create(fixedParams)
  create_task    → taskQueue.create(decision.params)
  notify         → broadcastToRenderers('ai:recommendation', decision)
  skip           → 记录后跳过
```

## 新增类型

```typescript
// src/shared/types.ts

interface AIFailureResult {
  taskId: string
  diagnosis: string
  suggestions: string[]
  confidence: number
  shouldRetry: boolean
  retryAdvice?: string
}

interface DailyPlan {
  date: string
  platform: Platform
  recommendedTopics: string[]
  bestTimes: number[]
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
```

## 新增文件

| 文件 | 作用 |
|------|------|
| `src/service/strategy-engine.ts` | Prompt模板 + 输出解析 + 校验 |
| `src/service/ai-director.ts` | 调度总入口，4种触发点 |
| `src/service/hot-topic-detector.ts` | 热点检测（框架，爬虫逻辑后续填充）|

## 修改文件

| 文件 | 改动 |
|------|------|
| `src/shared/types.ts` | 新增 `AIFailureResult`, `DailyPlan`, `HotTopicDecision` |
| `src/service/queue.ts` | `markFailed` 达上限时调用 `aiDirector.analyzeFailure()` |
| `src/service/ipc-handlers.ts` | 新增 `ai:analyze-failure`, `ai:daily-briefing`, `ai:hot-topics`, `ai:analyze-now` |
| `src/service/service-process.ts` | 启动时注册每日08:00定时任务 |

## 错误处理

- AI返回格式不对 → 重试1次，还失败 → 发通知，流程继续
- AI熔断器触发 → AI Gateway自带保护，该平台跳过
- 热点数据拉不到 → 跳过本次检测，不影响其他

## 实现顺序

1. `strategy-engine.ts` — 先写完，三个触发点共用
2. `ai-director.ts` — 框架 + 失败分析逻辑
3. `queue.ts` — 接入失败分析
4. `ipc-handlers.ts` — 新增4个IPC通道
5. 每日定时任务 — `service-process.ts` 接入
6. `hot-topic-detector.ts` — 框架先搭，爬虫逻辑后续填充
