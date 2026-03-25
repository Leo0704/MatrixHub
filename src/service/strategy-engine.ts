import { getDb } from './db.js'
import { aiGateway } from './ai-gateway.js'
import type { Task, Platform } from '../shared/types.js'
import log from 'electron-log'

export type PromptType = 'failure' | 'daily' | 'hot_topic'

/**
 * 构造 failure 类型的上下文（从数据库实时查询）
 */
export function buildFailureContext(task: Task): object {
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
export function buildDailyContext(platform: Platform): object {
  const db = getDb()
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
export function buildHotTopicContext(platform: Platform, hotTopic: { keyword: string; heatScore: number }): object {
  const db = getDb()

  // 该平台近 7 天发布的主题
  const recentTasks = db.prepare(`
    SELECT title, result
    FROM tasks
    WHERE platform = ? AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 10
  `).all(platform) as any[]

  // 估算平均互动
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
    // 不指定 providerType，让 AI Gateway 使用用户配置的默认 provider
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
      prompt: prompt + '\n\n请严格按 JSON 格式输出，不要输出其他内容。',
      system: '你是一个严谨的社交媒体运营 AI。'
    })
    if (!resp2.success || !resp2.content) {
      throw new Error(resp2.error ?? 'AI 重试失败')
    }
    return parseAIOutput(resp2.content)
  }
}
