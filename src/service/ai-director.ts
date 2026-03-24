import { taskQueue } from './queue.js'
import { getDb } from './db.js'
import { broadcastToRenderers } from './ipc-handlers.js'
import { callAI } from './strategy-engine.js'
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
  // 循环保护：检查分析次数（直接从数据库读取）
  const db = getDb()
  const row = db.prepare('SELECT ai_analysis_count FROM tasks WHERE id = ?').get(task.id) as any
  const analysisCount = row?.ai_analysis_count ?? 0

  if (analysisCount >= MAX_ANALYSIS_PER_TASK) {
    broadcastToRenderers('ai:feedback', {
      taskId: task.id,
      skipped: true,
      reason: 'AI分析次数已达上限'
    })
    return
  }

  try {
    // 从 strategy-engine 构造上下文
    const { buildFailureContext } = await import('./strategy-engine.js')
    const context = buildFailureContext(task)
    const result = await callAI('failure', context) as unknown as AIFailureResult
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
    const { buildDailyContext } = await import('./strategy-engine.js')
    const context = buildDailyContext(platform)
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
    const { buildHotTopicContext } = await import('./strategy-engine.js')
    const context = buildHotTopicContext(platform, top)
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

  broadcastToRenderers('ai:daily-briefing-all', { results })
  log.info('[AIDirector] 每日简报完成:', results.length, '个平台')
}
