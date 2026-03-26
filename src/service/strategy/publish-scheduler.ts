import type { Campaign, AccountPublishRecord } from '../../shared/types.js';

export interface PublishSchedule {
  accountId: string;
  scheduledTime: number;      // Unix timestamp (毫秒)
  delayMinutes: number;      // 距离现在的分钟数
}

// 默认配置
const DEFAULT_DAILY_LIMIT = 2;      // 每账号每日最多发布条数
const MIN_INTERVAL_MINUTES = 10;   // 账号间最小时间间隔
const MAX_INTERVAL_MINUTES = 30;   // 账号间最大时间间隔
const COOLDOWN_HOURS = 4;          // 发布后冷却时间（小时）

export interface SchedulerConfig {
  dailyLimit?: number;        // 每账号每日上限，默认 2
  minInterval?: number;        // 账号间最小间隔（分钟），默认 10
  maxInterval?: number;        // 账号间最大间隔（分钟），默认 30
  cooldownHours?: number;      // 冷却时间（小时），默认 4
}

export function buildPublishSchedule(
  campaign: Campaign,
  accountPublishRecords: AccountPublishRecord[],
  config: SchedulerConfig = {}
): PublishSchedule[] {
  const {
    dailyLimit = DEFAULT_DAILY_LIMIT,
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

    // 添加一些随机性（只增加，不减少）
    const jitter = baseDelayMinutes + baseDelayMinutes * Math.random() * 0.2;
    const finalDelayMinutes = Math.max(minInterval, Math.round(jitter));

    schedules.push({
      accountId,
      scheduledTime: now + finalDelayMinutes * 60 * 1000,
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
    dailyLimit = DEFAULT_DAILY_LIMIT,
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
