import { taskQueue } from './queue.js'
import { getDb } from './db.js'
import { broadcastToRenderers } from './ipc-handlers.js'
import { callAI } from './strategy-engine.js'
import { getHotTopics } from './hot-topic-detector.js'
import type { Task, AIFailureResult, DailyPlan, HotTopicDecision, AIDecision, AITriggerType, RetryAdvice, ProductInfo, CampaignReport, IterationDecision, Platform, ContentType } from '../shared/types.js'
import log from 'electron-log'
import { getAiMaxAnalysisPerTask, getIterationThresholds } from './config/runtime-config.js'

// ============ 并发控制 ============
let pendingAnalysis = false

// 向 TaskQueue 注册失败回调（解循环依赖）
taskQueue.onFailure((task) => {
  analyzeFailure(task).catch((err) => {
    log.error('[AIDirector] analyzeFailure 注册回调执行失败:', err);
  });
});
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
// MAX_ANALYSIS_PER_TASK 从 runtime-config 动态读取（支持运行时配置）

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
// 设计文档第10节：文案/配图/时间/角度可自动执行，只有核心变更才需确认
async function executeDecision(decision: AIDecision): Promise<void> {
  switch (decision.action) {
    case 'auto_iterate':
      // 自动执行风格迭代：AI 决定文案/配图/Hashtag 微调，无需用户确认
      log.info('[AIDirector] AI 自动迭代:', decision.reason, `置信度: ${(decision.confidence * 100).toFixed(0)}%`);
      broadcastToRenderers('ai:auto-executed', {
        action: 'auto_iterate',
        reason: decision.reason,
        confidence: decision.confidence,
        params: decision.params,
      });
      // TODO: 自动创建优化任务（待 campaign-manager 集成）
      break;

    case 'auto_adjust_schedule':
      // 自动调整发布时间：AI 决定发布时间微调，无需用户确认
      log.info('[AIDirector] AI 自动调整发布时间:', decision.reason);
      broadcastToRenderers('ai:auto-executed', {
        action: 'auto_adjust_schedule',
        reason: decision.reason,
        confidence: decision.confidence,
        params: decision.params,
      });
      break;

    case 'retry_with_fix':
      // 需用户确认：selector/超时等失败重试
      broadcastToRenderers('ai:recommendation', {
        action: 'retry_with_fix',
        reason: decision.reason,
        confidence: decision.confidence,
        params: { task: decision.params }
      });
      break;

    case 'create_task':
      // 需用户确认：创建新任务
      broadcastToRenderers('ai:recommendation', {
        action: 'create_task',
        reason: decision.reason,
        confidence: decision.confidence,
        params: { task: decision.params }
      });
      break;

    case 'notify':
      broadcastToRenderers('ai:recommendation', decision);
      break;

    case 'skip':
      log.info('[AIDirector] AI决策跳过:', decision.reason);
      break;
  }
}

// ============ 核心实现 ============

async function analyzeFailureImpl(task: Task): Promise<void> {
  // 循环保护：检查分析次数（直接从数据库读取）
  const db = getDb()
  const row = db.prepare('SELECT ai_analysis_count FROM tasks WHERE id = ?').get(task.id) as { ai_analysis_count: number } | undefined
  const analysisCount = row?.ai_analysis_count ?? 0

  if (analysisCount >= getAiMaxAnalysisPerTask()) {
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
    const errorMsg = (err as Error).message;
    // AI 服务不可用时降级到本地日志记录，不抛异常
    log.warn(`[AIDirector] AI 分析不可用，降级到本地日志: ${task.id} - ${errorMsg}`);
    // 写入本地日志作为降级
    log.info(`[AIDirector][Fallback] task=${task.id} platform=${task.platform} error=${errorMsg} retryCount=${task.retryCount}`);
    broadcastToRenderers('ai:feedback', {
      taskId: task.id,
      error: errorMsg,
      degraded: true  // 标记为降级状态
    });
  }
}

export async function analyzeFailure(task: Task): Promise<void> {
  await analyzeWithQueue(task)
}

export async function dailyBriefing(platform: Platform = 'douyin'): Promise<DailyPlan | null> {
  try {
    const { buildDailyContext } = await import('./strategy-engine.js')
    const context = buildDailyContext(platform)
    const result = await callAI('daily', context, 'core_director') as unknown as DailyPlan

    const confidence = (typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1)
      ? result.confidence : 0.5

    // 发送每日简报结果给前端（不自动创建任务）
    broadcastToRenderers('ai:daily-plan', { platform, result })

    // 置信度 >= 0.7 时，发送推荐消息让用户确认
    if (confidence >= 0.7) {
      // 构造推荐任务数据，等待用户确认
      const recommendedTasks = []
      for (const topic of (result.recommendedTopics ?? []).slice(0, 2)) {
        for (const hour of (result.bestTimes ?? [9]).slice(0, 1)) {
          const scheduledAt = new Date()
          scheduledAt.setHours(hour, 0, 0, 0)
          if (scheduledAt.getTime() < Date.now()) {
            scheduledAt.setDate(scheduledAt.getDate() + 1)
          }
          recommendedTasks.push({
            type: 'ai_generate',
            platform,
            title: `AI生成-${topic}`,
            payload: { promptType: 'default', topic },
            scheduledAt: scheduledAt.getTime()
          })
        }
      }

      broadcastToRenderers('ai:recommendation', {
        action: 'daily_briefing',
        reason: `AI 每日简报推荐 ${result.recommendedTopics?.length ?? 0} 个话题（置信度: ${(confidence * 100).toFixed(0)}%）`,
        confidence,
        params: { platform, result, tasks: recommendedTasks }
      })
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

export async function checkHotTopics(platform: Platform = 'douyin'): Promise<HotTopicDecision | null> {
  try {
    const hotTopics = await getHotTopics()
    if (!hotTopics.length) return null

    const top = hotTopics[0]
    const { buildHotTopicContext } = await import('./strategy-engine.js')
    const context = buildHotTopicContext(platform, top)
    const result = await callAI('hot_topic', context, 'core_director') as unknown as HotTopicDecision

    const confidence = (typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1)
      ? result.confidence : 0.5

    // 发送热点追踪结果给前端
    broadcastToRenderers('ai:hot-topic', { platform, result })

    // 置信度 >= 0.8 时，发送推荐消息让用户确认（不自动创建任务）
    if (result.shouldChase && confidence >= 0.8) {
      broadcastToRenderers('ai:recommendation', {
        action: 'hot_topic',
        reason: `AI 推荐蹭热点：${result.topic}（置信度: ${(confidence * 100).toFixed(0)}%）`,
        confidence,
        params: {
          platform,
          result,
          task: {
            type: 'ai_generate',
            platform,
            title: `蹭热点-${result.topic}`,
            payload: { promptType: 'default', topic: result.contentAngle }
          }
        }
      })
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

export async function analyzeNow(type: AITriggerType, _platform: string, taskId?: string): Promise<void> {
  switch (type) {
    case 'failure': {
      if (!taskId) { log.warn('[AIDirector] failure类型需要taskId'); return }
      const task = taskQueue.get(taskId)
      if (!task) { log.warn('[AIDirector] 任务不存在:', taskId); return }
      await analyzeWithQueue(task)
      break
    }
    case 'daily':
      await dailyBriefing()
      break
    case 'hot_topic':
      await checkHotTopics()
      break
    default:
      log.warn('[AIDirector] unknown analyzeNow type:', type)
  }
}

// ============ 全局每日简报（跨平台汇总分析）============

export async function dailyBriefingAll(): Promise<void> {
  const result = await dailyBriefing()
  broadcastToRenderers('ai:daily-briefing-all', { results: result ? [result] : [] })
  log.info('[AIDirector] 每日简报完成')
}

// ============ Campaign 内容策略 ============

export interface AccountContentPlan {
  accountId: string;
  contentAngle: string;        // 内容角度描述
  targetAudience: string;      // 目标人群
  hashtagHints: string[];      // Hashtag 提示
}

/**
 * 为推广活动制定内容策略
 * 核心驱动 AI 分析产品信息，为每个账号分配不同的内容角度
 */
export async function generateContentStrategy(
  campaignId: string,
  productInfo: ProductInfo,
  accountCount: number
): Promise<AccountContentPlan[]> {
  const prompt = `你是一个社交媒体内容策略专家。
为一款产品制定在抖音平台的内容矩阵策略。

产品信息：
- 名称：${productInfo.name}
- 描述：${productInfo.description}
${productInfo.targetAudience ? `- 目标人群：${productInfo.targetAudience}` : ''}
${productInfo.brand ? `- 品牌：${productInfo.brand}` : ''}

需要为 ${accountCount} 个账号制定不同的内容角度，每个账号需要有明显差异但主题一致。

请为每个账号输出：
1. 内容角度（如：产品测评/用户体验/故事分享/对比分析/知识科普等）
2. 目标人群（如：年轻白领/学生群体/新手妈妈等）
3. 3-5个 Hashtag 提示

以 JSON 数组格式输出，每个元素包含：accountIndex, contentAngle, targetAudience, hashtagHints`;

  // 设计文档第3节：核心驱动 AI（决策/调度/分析）使用 core_director taskType
  const result = await callAI('content_strategy', {
    prompt,
    expectedFormat: 'json_array',
  }, 'core_director');

  const plans = JSON.parse(result.content as string);
  return plans.map((p: any, i: number) => ({
    accountId: `strategy-${i}`,
    contentAngle: p.contentAngle,
    targetAudience: p.targetAudience,
    hashtagHints: p.hashtagHints || [],
  }));
}

/**
 * 决定是否需要迭代
 * 设计文档第10节：迭代阈值可配置
 * 设计文档第10节：产品链接/内容类型变更必须通知用户
 */
export async function decideIteration(
  report: CampaignReport,
  currentIteration: number,
  previousProductUrl?: string,
  previousContentType?: ContentType,
  newProductUrl?: string,
  newContentType?: ContentType,
): Promise<IterationDecision> {
  const thresholds = getIterationThresholds();
  const changeReasons: string[] = [];

  // 设计文档第10节：检测产品链接是否变更
  if (previousProductUrl && newProductUrl && previousProductUrl !== newProductUrl) {
    changeReasons.push('更换了产品链接');
  }

  // 设计文档第10节：检测内容类型是否切换
  if (previousContentType && newContentType && previousContentType !== newContentType) {
    changeReasons.push(`内容类型从${previousContentType === 'video' ? '视频' : '图文'}切换为${newContentType === 'video' ? '视频' : '图文'}`);
  }

  // 计算平均播放量
  const avgViews = report.metrics.reduce((sum, m) => sum + m.views, 0) / report.metrics.length;

  // 判断账号健康状态
  const bannedAccounts = report.metrics.filter(m => m.healthStatus === 'banned').length;
  const limitedAccounts = report.metrics.filter(m => m.healthStatus === 'limited').length;

  if (bannedAccounts > 0) {
    return {
      action: 'stop',
      reason: `${bannedAccounts}个账号已被封禁，建议人工介入处理账号问题后再继续`,
      changeReasons,
    };
  }

  if (avgViews < thresholds.stopViews && currentIteration > 0) {
    // 连续迭代后效果仍然很差，停止
    if (currentIteration >= 2) {
      return {
        action: 'stop',
        reason: `连续${currentIteration}次迭代后平均播放量仅${Math.round(avgViews)}，效果未达预期，建议人工调整策略`,
        changeReasons,
      };
    }
    return {
      action: 'iterate',
      reason: `平均播放量${Math.round(avgViews)}偏低，尝试换一种内容策略`,
      newStrategyHints: '建议更换核心营销卖点，如从价格优势改为品质/功效优势',
      // 设计文档第10节：核心营销卖点变更需通知用户
      corePitchChanged: true,
      changeReasons,
      autoAdjustments: { style: true, hashtag: true },
    };
  }

  if (avgViews < thresholds.iterateViews) {
    return {
      action: 'iterate',
      reason: `平均播放量${Math.round(avgViews)}有提升空间，尝试优化内容策略`,
      newStrategyHints: '建议调整 Hashtag 或发布时间策略',
      // 设计文档第10节：Hashtag/发布时间可自动执行
      autoAdjustments: { style: true, hashtag: true, timing: true },
      changeReasons,
    };
  }

  // avgViews >= thresholds.iterateViews，表现良好
  // 设计文档第10节：发布时间微调可自动执行
  return {
    action: 'continue',
    reason: `平均播放量${Math.round(avgViews)}表现良好，继续当前策略`,
    autoAdjustments: { timing: true },
    changeReasons,
  };
}

/**
 * 生成迭代内容策略
 */
export async function generateIterationStrategy(
  productInfo: ProductInfo,
  previousReport: CampaignReport,
  badAccountIndices: number[]
): Promise<AccountContentPlan[]> {
  const avgViews = previousReport.metrics.reduce((sum, m) => sum + m.views, 0) / previousReport.metrics.length;
  const worstMetrics = badAccountIndices.map(i => previousReport.metrics[i]);

  const prompt = `产品：${productInfo.name}
描述：${productInfo.description}

上一轮内容效果：
- 平均播放量：${Math.round(avgViews)}
- 效果最差的账号表现：${worstMetrics.map(m => `播放${m.views}/点赞${m.likes}`).join(', ')}

需要为账号重新制定内容策略，避开上一轮效果差的方向。

请为每个账号输出新的内容角度，要求与之前有明显差异。

以 JSON 数组格式输出，每个元素包含：accountIndex, contentAngle, targetAudience, hashtagHints`;

  // 设计文档第3节：核心驱动 AI（决策/调度/分析）使用 core_director taskType
  const result = await callAI('content_strategy', {
    prompt,
    expectedFormat: 'json_array',
  }, 'core_director');

  const plans = JSON.parse(result.content as string);
  return plans.map((p: any, i: number) => ({
    accountId: `strategy-${i}`,
    contentAngle: p.contentAngle,
    targetAudience: p.targetAudience,
    hashtagHints: p.hashtagHints || [],
  }));
}
