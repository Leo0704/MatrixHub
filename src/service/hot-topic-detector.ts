import log from 'electron-log'
import { createFetcher } from './data-fetcher/index.js'

export interface HotTopic {
  keyword: string
  heatScore: number
}

export interface HotTopicWithTrend extends HotTopic {
  trend: 'up' | 'down' | 'stable'
  previousRank?: number
  rankChange?: number
  duration?: number // 持续时间（分钟）
  firstSeenAt?: number
  lastSeenAt?: number
}

// 内存中的历史数据存储（只支持抖音）
interface TopicHistoryEntry { rank: number; heat: number; timestamp: number }
const historicalTopics: Map<string, TopicHistoryEntry> = new Map()

/**
 * 获取热点话题列表（仅支持抖音）
 * @throws 如果无法获取数据则抛出错误
 */
export async function getHotTopics(): Promise<HotTopic[]> {
  const fetcher = createFetcher('douyin')

  try {
    log.info('[HotTopicDetector] 开始获取抖音热点话题...')

    const result = await fetcher.fetchHotTopics({ limit: 50 })

    if (result.error) {
      log.error('[HotTopicDetector] 抖音获取热点话题失败:', result.error)
      throw new Error(`获取抖音热点话题失败: ${result.error}`)
    }

    if (result.topics.length === 0) {
      log.error('[HotTopicDetector] 抖音未获取到任何热点话题')
      throw new Error('获取抖音热点话题返回空数据')
    }

    // 转换格式并按热度排序
    const topics = result.topics
      .map(t => ({
        keyword: t.title,
        heatScore: t.heat,
      }))
      .sort((a, b) => b.heatScore - a.heatScore)

    log.info(`[HotTopicDetector] 抖音获取到 ${topics.length} 条热点话题`)
    return topics

  } catch (err) {
    const error = err as Error
    log.error('[HotTopicDetector] 获取抖音热点失败:', error.message)
    throw error
  } finally {
    await fetcher.close()
  }
}

/**
 * 获取带趋势的热点话题列表（仅支持抖音）
 */
export async function getHotTopicsWithTrend(): Promise<HotTopicWithTrend[]> {
  const fetcher = createFetcher('douyin')

  try {
    log.info('[HotTopicDetector] 开始获取抖音热点话题(带趋势)...')

    const result = await fetcher.fetchHotTopics({ limit: 50 })

    if (result.error) {
      log.error('[HotTopicDetector] 抖音获取热点话题失败')
      throw new Error(`获取抖音热点话题失败: ${result.error}`)
    }

    if (result.topics.length === 0) {
      log.error('[HotTopicDetector] 抖音未获取到任何热点话题')
      throw new Error('获取抖音热点话题返回空数据')
    }

    const now = Date.now()
    const topicsWithTrend: HotTopicWithTrend[] = result.topics
      .sort((a, b) => b.heat - a.heat) // 按热度降序
      .map((t, index) => {
        const currentRank = index + 1
        const historyKey = t.title
        const previousData = historicalTopics.get(historyKey)

        let trend: 'up' | 'down' | 'stable' = 'stable'
        let previousRank: number | undefined
        let rankChange: number | undefined
        let duration: number | undefined
        let firstSeenAt: number | undefined

        if (previousData) {
          previousRank = previousData.rank
          rankChange = previousRank - currentRank // 正数表示上升

          if (rankChange > 0) trend = 'up'
          else if (rankChange < 0) trend = 'down'

          duration = Math.floor((now - previousData.timestamp) / 60000)

          const existing = historicalTopics.get(`_firstSeen_${historyKey}`)
          firstSeenAt = existing?.timestamp ?? previousData.timestamp
        }

        // 更新历史数据
        historicalTopics.set(historyKey, {
          rank: currentRank,
          heat: t.heat,
          timestamp: now,
        })

        // 存储首次出现时间
        if (!historicalTopics.has(`_firstSeen_${historyKey}`)) {
          historicalTopics.set(`_firstSeen_${historyKey}`, { rank: currentRank, heat: t.heat, timestamp: now })
        }

        return {
          keyword: t.title,
          heatScore: t.heat,
          trend,
          previousRank,
          rankChange,
          duration,
          firstSeenAt,
          lastSeenAt: now,
        }
      })

    log.info(`[HotTopicDetector] 抖音获取到 ${topicsWithTrend.length} 条热点话题(带趋势)`)
    return topicsWithTrend

  } catch (err) {
    const error = err as Error
    log.error('[HotTopicDetector] 获取抖音热点(带趋势)失败:', error.message)
    throw error
  } finally {
    await fetcher.close()
  }
}

/**
 * 清除历史数据
 */
export function clearHistory(): void {
  historicalTopics.clear()
  log.info('[HotTopicDetector] 已清除历史数据')
}

/**
 * 获取历史数据统计
 */
export function getHistoryStats(): Record<string, unknown> {
  return {
    topicCount: historicalTopics.size,
  }
}
