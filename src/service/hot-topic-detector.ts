import log from 'electron-log'
import type { Platform } from '../shared/types.js'
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

// 内存中的历史数据存储
const historicalTopics: Map<Platform, Map<string, { rank: number; heat: number; timestamp: number }>> = new Map()

/**
 * 获取热点话题列表
 * 使用各平台数据抓取器获取真实热点数据
 * @throws 如果无法获取数据则抛出错误
 */
export async function getHotTopics(platform: Platform): Promise<HotTopic[]> {
  const fetcher = createFetcher(platform)

  try {
    log.info(`[HotTopicDetector] 开始获取 ${platform} 热点话题...`)

    const result = await fetcher.fetchHotTopics({ limit: 50 })

    if (result.error) {
      log.error(`[HotTopicDetector] ${platform} 获取热点话题失败:`, result.error)
      throw new Error(`获取 ${platform} 热点话题失败: ${result.error}`)
    }

    if (result.topics.length === 0) {
      log.error(`[HotTopicDetector] ${platform} 未获取到任何热点话题`)
      throw new Error(`获取 ${platform} 热点话题返回空数据`)
    }

    // 转换格式并按热度排序
    const topics = result.topics
      .map(t => ({
        keyword: t.title,
        heatScore: t.heat,
      }))
      .sort((a, b) => b.heatScore - a.heatScore)

    log.info(`[HotTopicDetector] ${platform} 获取到 ${topics.length} 条热点话题`)
    return topics

  } catch (err) {
    const error = err as Error
    log.error(`[HotTopicDetector] 获取 ${platform} 热点失败:`, error.message)
    throw error
  } finally {
    await fetcher.close()
  }
}

/**
 * 获取带趋势的热点话题列表
 * 对比历史数据计算排名变化
 */
export async function getHotTopicsWithTrend(platform: Platform): Promise<HotTopicWithTrend[]> {
  const fetcher = createFetcher(platform)

  try {
    log.info(`[HotTopicDetector] 开始获取 ${platform} 热点话题(带趋势)...`)

    const result = await fetcher.fetchHotTopics({ limit: 50 })

    if (result.error) {
      log.error(`[HotTopicDetector] ${platform} 获取热点话题失败:`, result.error)
      throw new Error(`获取 ${platform} 热点话题失败: ${result.error}`)
    }

    if (result.topics.length === 0) {
      log.error(`[HotTopicDetector] ${platform} 未获取到任何热点话题`)
      throw new Error(`获取 ${platform} 热点话题返回空数据`)
    }

    // 获取或初始化平台历史数据
    if (!historicalTopics.has(platform)) {
      historicalTopics.set(platform, new Map())
    }
    const platformHistory = historicalTopics.get(platform)!

    // 处理每个话题，计算趋势
    const now = Date.now()
    const topicsWithTrend: HotTopicWithTrend[] = result.topics
      .sort((a, b) => b.heat - a.heat) // 按热度降序
      .map((t, index) => {
        const currentRank = index + 1
        const historyKey = t.title
        const previousData = platformHistory.get(historyKey)

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

          // 计算持续时间
          duration = Math.floor((now - previousData.timestamp) / 60000)

          // 获取首次出现时间
          const existing = platformHistory.get(`_firstSeen_${historyKey}`)
          firstSeenAt = existing ? (existing as any).timestamp : previousData.timestamp
        }

        // 更新历史数据
        platformHistory.set(historyKey, {
          rank: currentRank,
          heat: t.heat,
          timestamp: now,
        })

        // 存储首次出现时间
        if (!platformHistory.has(`_firstSeen_${historyKey}`)) {
          platformHistory.set(`_firstSeen_${historyKey}`, { rank: currentRank, heat: t.heat, timestamp: now } as any)
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

    log.info(`[HotTopicDetector] ${platform} 获取到 ${topicsWithTrend.length} 条热点话题(带趋势)`)
    return topicsWithTrend

  } catch (err) {
    const error = err as Error
    log.error(`[HotTopicDetector] 获取 ${platform} 热点(带趋势)失败:`, error.message)
    throw error
  } finally {
    await fetcher.close()
  }
}

/**
 * 清除指定平台的历史数据
 */
export function clearHistory(platform?: Platform): void {
  if (platform) {
    historicalTopics.delete(platform)
    log.info(`[HotTopicDetector] 已清除 ${platform} 的历史数据`)
  } else {
    historicalTopics.clear()
    log.info('[HotTopicDetector] 已清除所有历史数据')
  }
}

/**
 * 获取历史数据统计
 */
export function getHistoryStats(platform?: Platform): Record<string, unknown> {
  if (platform) {
    const platformHistory = historicalTopics.get(platform)
    return {
      platform,
      topicCount: platformHistory?.size ?? 0,
    }
  }

  const stats: Record<string, number> = {}
  historicalTopics.forEach((value, key) => {
    stats[key] = value.size
  })
  return stats
}
