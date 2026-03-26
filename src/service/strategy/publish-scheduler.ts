import type { Campaign, AccountPublishRecord } from '../../shared/types.js';
import { getAccountActiveHours } from '../campaign-store.js';
import { getCampaignDailyLimit } from '../config/runtime-config.js';

export interface PublishSchedule {
  accountId: string;
  scheduledTime: number;      // Unix timestamp (毫秒)
  delayMinutes: number;      // 距离现在的分钟数
}

// 默认配置（可被 runtime-config 覆盖）
const MIN_INTERVAL_MINUTES = 10;   // 账号间最小时间间隔
const MAX_INTERVAL_MINUTES = 30;   // 账号间最大时间间隔
const COOLDOWN_HOURS = 4;          // 发布后冷却时间（小时）

// 抖音平台流量峰值时间段（北京时间）
// 来源：抖音官方数据和行业经验
const PLATFORM_PEAK_HOURS = [12, 13, 18, 19, 20, 21, 22, 23];

export interface SchedulerConfig {
  dailyLimit?: number;        // 每账号每日上限，默认 2
  minInterval?: number;        // 账号间最小间隔（分钟），默认 10
  maxInterval?: number;        // 账号间最大间隔（分钟），默认 30
  cooldownHours?: number;      // 冷却时间（小时），默认 4
}

/**
 * 根据账号历史活跃时间 + 平台流量峰值计算最佳发布时间
 * 
 * 优先级：
 * 1. 账号历史活跃时间（如果该账号有明显的历史发布时间偏好）
 * 2. 平台流量峰值时间段
 * 3. 保持 10-30 分钟账号间分散
 */
function calculateOptimalPublishTime(
  accountId: string,
  accountActiveHours: number[] | undefined,
  baseDelayMinutes: number,
  minInterval: number,
  maxInterval: number
): number {
  const now = Date.now();
  
  // 将基础延迟转换为目标时间
  const baseTime = new Date(now + baseDelayMinutes * 60 * 1000);
  
  // 获取该账号历史偏好的小时
  const preferredHours = accountActiveHours && accountActiveHours.length > 0 
    ? accountActiveHours 
    : PLATFORM_PEAK_HOURS;
  
  // 在基础时间附近寻找最佳时间点
  // 如果基础时间不在偏好小时内，尝试调整到最近的偏好小时
  const baseHour = baseTime.getHours();
  
  // 计算账号间隔（用于在峰值时段内分散）
  const accountInterval = minInterval + Math.floor(Math.random() * (maxInterval - minInterval));
  
  // 优先使用账号历史活跃时间
  if (accountActiveHours && accountActiveHours.length > 0) {
    // 找到基础时间所在日期的最后一个偏好小时
    const todayPeaks = preferredHours.filter(h => h >= baseHour);
    if (todayPeaks.length > 0) {
      // 在今天的峰值小时内选择
      const targetHour = todayPeaks[0];
      const targetMinutes = baseTime.getMinutes();
      const result = new Date(baseTime);
      result.setHours(targetHour, targetMinutes, 0, 0);
      // 确保时间在现在之后
      if (result.getTime() > now) {
        return result.getTime();
      }
    }
    // 如果已经过了今天的峰值，选择明天的第一个峰值
    const tomorrowPeaks = preferredHours;
    if (tomorrowPeaks.length > 0) {
      const targetHour = tomorrowPeaks[0];
      const result = new Date(baseTime);
      result.setDate(result.getDate() + 1);
      result.setHours(targetHour, 0, 0, 0);
      return result.getTime();
    }
  }
  
  // 使用平台流量峰值
  const peakHour = PLATFORM_PEAK_HOURS[Math.floor(Math.random() * PLATFORM_PEAK_HOURS.length)];
  const result = new Date(baseTime);
  result.setHours(peakHour, Math.floor(Math.random() * 60), 0, 0);
  
  // 如果目标时间在现在之前，改到明天
  if (result.getTime() <= now) {
    result.setDate(result.getDate() + 1);
  }
  
  return result.getTime();
}

export function buildPublishSchedule(
  campaign: Campaign,
  accountPublishRecords: AccountPublishRecord[],
  config: SchedulerConfig = {}
): PublishSchedule[] {
  const {
    dailyLimit = getCampaignDailyLimit(),
    minInterval = MIN_INTERVAL_MINUTES,
    maxInterval = MAX_INTERVAL_MINUTES,
    cooldownHours = COOLDOWN_HOURS,
  } = config;

  const targetAccountIds = campaign.targetAccountIds;
  if (targetAccountIds.length === 0) return [];

  const now = Date.now();
  const schedules: PublishSchedule[] = [];

  // 按账号分配发布时间
  for (let i = 0; i < targetAccountIds.length; i++) {
    const accountId = targetAccountIds[i];
    const record = accountPublishRecords.find(r => r.accountId === accountId);

    // 计算该账号的起始偏移时间
    // 保证相邻账号间至少有 minInterval 分钟间隔
    const interval = minInterval + Math.floor(Math.random() * (maxInterval - minInterval));
    let baseDelayMinutes = (i + 1) * minInterval + i * interval;

    // 如果账号今天已发布过，加上额外延迟
    if (record) {
      const hoursSinceLastPublish = (now - record.lastPublishedAt) / (1000 * 60 * 60);
      if (hoursSinceLastPublish < cooldownHours) {
        // 需要等待冷却
        const waitMinutes = Math.ceil((cooldownHours - hoursSinceLastPublish) * 60);
        baseDelayMinutes = Math.max(baseDelayMinutes, waitMinutes);
      }

      // 如果已达每日上限，跳过
      if (record.publishedToday >= dailyLimit) {
        // 推迟到明天
        const delayToTomorrow = 24 * 60 - ((now - record.lastPublishedAt) / (1000 * 60));
        baseDelayMinutes = Math.max(baseDelayMinutes, Math.ceil(delayToTomorrow));
      }
    }

    // 获取账号历史活跃时间（优先使用 record 中的，否则从数据库查询）
    const activeHours = record?.activeHours ?? getAccountActiveHours(accountId);

    // 使用 AI 智能调度计算最佳发布时间
    const scheduledTime = calculateOptimalPublishTime(
      accountId,
      activeHours,
      baseDelayMinutes,
      minInterval,
      maxInterval
    );

    // 计算最终的延迟分钟数
    const finalDelayMinutes = Math.max(1, Math.round((scheduledTime - now) / (60 * 1000)));

    schedules.push({
      accountId,
      scheduledTime,
      delayMinutes: finalDelayMinutes,
    });
  }

  // 按时间排序
  schedules.sort((a, b) => a.scheduledTime - b.scheduledTime);

  return schedules;
}

export function getNextAvailableTime(
  accountId: string,
  accountPublishRecords: AccountPublishRecord[],
  config: SchedulerConfig = {}
): number {
  const {
    dailyLimit = getCampaignDailyLimit(),
    cooldownHours = COOLDOWN_HOURS,
  } = config;

  const now = Date.now();
  const record = accountPublishRecords.find(r => r.accountId === accountId);

  if (!record) {
    return now;
  }

  // 检查冷却时间
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const cooldownEnd = record.lastPublishedAt + cooldownMs;

  // 检查每日上限
  const lastPublishDay = new Date(record.lastPublishedAt).toDateString();
  const today = new Date(now).toDateString();

  if (lastPublishDay !== today || record.publishedToday < dailyLimit) {
    return Math.max(now, cooldownEnd);
  }

  // 明天凌晨
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return Math.max(tomorrow.getTime(), cooldownEnd);
}
