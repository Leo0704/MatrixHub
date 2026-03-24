import log from 'electron-log'
import type { Platform } from '../shared/types.js'
import { createFetcher } from './data-fetcher/index.js'

export interface HotTopic {
  keyword: string
  heatScore: number
}

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
