import log from 'electron-log'
import type { Platform } from '../shared/types.js'

export interface HotTopic {
  keyword: string
  heatScore: number
}

/**
 * 获取热点话题列表
 * 框架先搭，爬虫逻辑后续填充；空数据时用默认热点兜底
 */
export async function getHotTopics(platform: Platform): Promise<HotTopic[]> {
  try {
    // TODO: 后续填充各平台爬虫逻辑
    // 目前返回默认热点列表作为兜底
    const defaults = getDefaultHotTopics(platform)
    log.info(`[HotTopicDetector] ${platform} 热点话题（默认列表）:`, defaults.length)
    return defaults
  } catch (err) {
    log.error('[HotTopicDetector] 获取热点失败:', err)
    return []
  }
}

/**
 * 默认热点列表（节假日、重要节点等兜底）
 */
function getDefaultHotTopics(platform: Platform): HotTopic[] {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  // 季节性热点
  const seasonal: Record<number, HotTopic[]> = {
    1: [{ keyword: '新年目标', heatScore: 8500 }, { keyword: '春节准备', heatScore: 9200 }],
    2: [{ keyword: '情人节', heatScore: 9800 }, { keyword: '元宵节', heatScore: 7800 }],
    3: [{ keyword: '妇女节', heatScore: 7500 }, { keyword: '植树节', heatScore: 6000 }],
    4: [{ keyword: '愚人节', heatScore: 7000 }, { keyword: '清明节', heatScore: 8500 }],
    5: [{ keyword: '劳动节', heatScore: 9500 }, { keyword: '母亲节', heatScore: 8800 }],
    6: [{ keyword: '儿童节', heatScore: 9000 }, { keyword: '父亲节', heatScore: 8200 }],
    7: [{ keyword: '暑假', heatScore: 8700 }, { keyword: '建党节', heatScore: 6500 }],
    8: [{ keyword: '建军节', heatScore: 6200 }, { keyword: '七夕节', heatScore: 9100 }],
    9: [{ keyword: '开学季', heatScore: 9400 }, { keyword: '中秋节', heatScore: 8900 }],
    10: [{ keyword: '国庆节', heatScore: 9800 }, { keyword: '重阳节', heatScore: 6800 }],
    11: [{ keyword: '双十一', heatScore: 9900 }, { keyword: '感恩节', heatScore: 7500 }],
    12: [{ keyword: '双十二', heatScore: 9600 }, { keyword: '圣诞节', heatScore: 8800 }, { keyword: '年终总结', heatScore: 8500 }],
  }

  const topics = seasonal[month] || [{ keyword: '今日话题', heatScore: 7000 }]

  // 平台适配
  return topics.map(t => ({
    ...t,
    keyword: `[${platform}] ${t.keyword}`
  }))
}
