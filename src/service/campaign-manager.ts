import { scrapeProductInfo } from './scraper/product-scraper.js';
import { generateContentStrategy, decideIteration, generateIterationStrategy, type AccountContentPlan } from './ai-director.js';
import { buildPublishSchedule } from './strategy/publish-scheduler.js';
import { getCampaignDailyLimit } from './config/runtime-config.js';
import { scrapeAccountMetrics } from './scraper/douyin-metrics.js';
import { createCampaign, getCampaign, updateCampaignStatus, updateCampaignIteration, saveCampaignReport, setCampaignFeedback, updateCampaignMonitoring } from './campaign-store.js';
import { taskQueue } from './queue.js';
import { broadcastToRenderers } from './ipc-handlers.js';
import { createPage, releasePage } from './platform-launcher.js';
import { accountManager, credentialManager } from './credential-manager.js';
import { generateContent, type GeneratedContent } from './strategy/content-executor.js';
import type { Campaign, CampaignReport, AccountMetrics, ContentType, MarketingGoal, ProductInfo, AccountPublishRecord } from '../shared/types.js';
import type { Page } from 'playwright';
import log from 'electron-log';

// 监控定时器存储
const campaignMonitors = new Map<string, {
  timers: Array<{ time: number; callback: () => void }>;
  abortController: AbortController;
}>();

// 账号发布记录存储（内存中）
const accountPublishRecords = new Map<string, AccountPublishRecord>();

// 设计文档第8节：跟踪账号内容发布状态（用于检测内容违规）
// 内容违规推断：账号健康正常 + 内容发布成功 + 播放量为0 → 疑似被平台拦截
const campaignPublishedAccounts = new Map<string, Set<string>>();  // campaignId → set of accountIds with successful publish
const campaignFailedAccounts = new Map<string, Set<string>>();      // campaignId → set of accountIds whose task failed

// 设计文档第10节：跟踪每日发布上限变更（用于检测发布频率增加）
const campaignDailyLimits = new Map<string, number>();   // campaignId → current dailyLimit
const campaignPreviousDailyLimits = new Map<string, number>(); // campaignId → previous dailyLimit (for comparison)

// 注册任务失败回调（解循环依赖：queue 不直接 import campaign-manager）
let failureCallbackRegistered = false;
function registerTaskFailureCallback(): void {
  if (failureCallbackRegistered) return;
  failureCallbackRegistered = true;
  taskQueue.onFailure((task) => {
    if (!task.pipelineId) return;  // 只处理 campaign 发起的任务
    const campaignId = task.pipelineId;
    const payload = task.payload as { accountId?: string };
    const accountId = payload?.accountId;
    if (!accountId) return;
    let failed = campaignFailedAccounts.get(campaignId);
    if (!failed) {
      failed = new Set();
      campaignFailedAccounts.set(campaignId, failed);
    }
    failed.add(accountId);
    log.info(`[CampaignManager] 账号 ${accountId} 发布任务失败，已标记为内容异常: ${campaignId}`);
  });
}

export interface LaunchParams {
  name: string;
  productUrl?: string;
  productDescription?: string;
  contentType: ContentType;
  addVoiceover: boolean;
  marketingGoal: MarketingGoal;
  targetAccountIds: string[];
}

/**
 * 启动一个推广活动
 */
export async function launchCampaign(params: LaunchParams): Promise<Campaign> {
  log.info('[CampaignManager] 启动推广活动:', params.name);

  // 注册任务失败回调（用于检测内容违规）
  registerTaskFailureCallback();

  // Step 1: 抓取产品信息
  let productInfo: ProductInfo | undefined;
  if (params.productUrl) {
    const scrapeResult = await scrapeProductInfo(params.productUrl);
    if (scrapeResult.success && scrapeResult.data) {
      productInfo = scrapeResult.data;
    } else if (!params.productDescription) {
      throw new Error(`产品信息抓取失败: ${scrapeResult.error}。请手动填写产品描述。`);
    }
  }

  // 如果抓取失败但有手动描述，从描述构建 ProductInfo
  if (!productInfo && params.productDescription) {
    const lines = params.productDescription.trim().split('\n');
    productInfo = {
      name: lines[0] || '未命名产品',
      description: lines.slice(1).join('\n') || params.productDescription,
      images: [],
    };
  }

  // Step 2: 创建 Campaign
  const campaign = createCampaign({
    name: params.name,
    productUrl: params.productUrl,
    productDescription: params.productDescription,
    productInfo,
    contentType: params.contentType,
    addVoiceover: params.addVoiceover,
    marketingGoal: params.marketingGoal,
    targetAccountIds: params.targetAccountIds,
  });

  // 更新状态为 running
  updateCampaignStatus(campaign.id, 'running');

  // 设计文档第10节：初始化每日发布上限跟踪（默认2条）
  campaignDailyLimits.set(campaign.id, getCampaignDailyLimit());

  // Step 3: 生成内容策略（每个账号独立内容）
  const contentPlans = await generateContentStrategy(campaign.id, productInfo!, params.targetAccountIds.length);

  // Step 4: 生成每个账号的实际内容（文案、图片等）
  // 设计文档第22节：传递 campaignId 和 iteration=1 用于内容新鲜度追踪
  // 设计文档第20节：传递 accountTags 用于 Hashtag 个性化
  const generatedContents: GeneratedContent[] = [];
  for (let i = 0; i < params.targetAccountIds.length; i++) {
    const plan = contentPlans[i];
    const accountId = params.targetAccountIds[i];
    const accountTags = accountManager.get(accountId)?.tags ?? [];
    log.info('[CampaignManager] 生成内容:', accountId, plan.contentAngle, { accountTags });
    const content = await generateContent({
      plan,
      productInfo: productInfo!,
      contentType: params.contentType,
      addVoiceover: params.addVoiceover,
      marketingGoal: params.marketingGoal,
      campaignId: campaign.id,
      iteration: 1,
      accountTags,
    });
    generatedContents.push(content);
  }

  // Step 5: 调度发布时间（分散 10-30 分钟，考虑账号冷却）
  const records = Array.from(accountPublishRecords.values());
  const schedules = buildPublishSchedule(campaign, records);

  // Step 6: 为每个账号创建发布任务
  for (let i = 0; i < params.targetAccountIds.length; i++) {
    const accountId = params.targetAccountIds[i];
    const schedule = schedules[i];
    const content = generatedContents[i];

    // 更新账号发布记录（预占名额）
    const existing = accountPublishRecords.get(accountId);
    accountPublishRecords.set(accountId, {
      accountId,
      lastPublishedAt: Date.now(),
      publishedToday: (existing?.publishedToday || 0) + 1,
    });

    // 构建任务 payload（与 publish-handler 兼容）
    const taskPayload = {
      title: productInfo?.name || params.name,
      content: content.text,           // 最终文案
      images: content.images,         // 图片列表
      video: content.video,           // 视频（如果有）
      voiceBase64: content.voiceBase64, // 配音（如果有）
      accountId,
      hashtags: content.hashtags,     // 最终 Hashtag
      contentType: params.contentType,
    };

    await taskQueue.create({
      type: 'publish',
      platform: 'douyin',
      title: params.name,
      payload: taskPayload,
      scheduledAt: schedule.scheduledTime,
      pipelineId: campaign.id,
    });
  }

  // Step 7: 广播启动事件
  broadcastToRenderers('campaign:started', { campaignId: campaign.id });

  // Step 7: 启动监控定时器
  startMonitoring(campaign.id);

  log.info('[CampaignManager] 推广活动启动成功:', campaign.id);
  return campaign;
}

/**
 * 处理用户反馈
 * 设计文档第10节：
 * - 效果好：AI 自动继续（使用 autoAdjustments 决定哪些自动执行）
 * - 效果不好：AI 换策略迭代，核心营销卖点变更需通知用户
 */
export async function handleFeedback(campaignId: string, feedback: 'good' | 'bad'): Promise<void> {
  const campaign = getCampaign(campaignId);
  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  log.info('[CampaignManager] 收到反馈:', campaignId, feedback);

  // 记录反馈
  setCampaignFeedback(campaignId, feedback);

  if (feedback === 'good') {
    // 效果好：AI 自动继续，使用 latestReport 中的 autoAdjustments
    broadcastToRenderers('campaign:continued', { campaignId });
    const autoAdjustments = campaign.latestReport?.autoAdjustments;
    await launchNextIteration(campaign, 'continue', autoAdjustments);
  } else {
    // 效果不好：先由 AI 决策是否继续迭代
    // 设计文档第10节：传递 productUrl/contentType 用于变更检测
    const decision = await decideIteration(
      campaign.latestReport!,
      campaign.currentIteration,
      campaign.productUrl,
      campaign.contentType,
      campaign.productUrl,
      campaign.contentType,
    );

    // 设计文档第10节：更换核心营销卖点必须通知用户
    if (decision.corePitchChanged) {
      broadcastToRenderers('notification:must', {
        type: 'core_pitch_changed',
        title: 'AI 更换核心营销卖点',
        message: `AI 决策更换产品核心卖点：${decision.newStrategyHints || decision.reason}。${decision.reason}`,
      });
    }

    // 设计文档第10节：更换产品链接必须通知用户
    if (decision.productUrlChanged) {
      broadcastToRenderers('notification:must', {
        type: 'product_url_changed',
        title: 'AI 更换产品链接',
        message: `AI 决策更换推广产品链接，请确认新链接：${campaign.productUrl}`,
      });
    }

    // 设计文档第10节：切换内容类型必须通知用户
    if (decision.contentTypeChanged) {
      broadcastToRenderers('notification:must', {
        type: 'content_type_changed',
        title: 'AI 切换内容类型',
        message: `AI 决策切换内容类型：${decision.changeReasons?.find(r => r.includes('内容类型')) || ''}，请确认是否继续`,
      });
    }

    if (decision.action === 'stop') {
      updateCampaignStatus(campaignId, 'failed');
      broadcastToRenderers('campaign:failed', {
        campaignId,
        reason: decision.reason,
      });
      return;
    }

    // 迭代模式：AI 决定继续迭代
    updateCampaignIteration(campaignId, campaign.currentIteration + 1, 0);
    updateCampaignStatus(campaignId, 'iterating');
    broadcastToRenderers('campaign:iterating', { campaignId });
    await launchNextIteration(campaign, 'iterate');
  }
}

/**
 * 启动新一轮迭代
 * @param campaign 推广活动
 * @param mode 'continue' | 'iterate'
 * @param autoAdjustments 设计文档第10节：自动调整标志，控制哪些可以AI自主执行
 * @param dailyLimit 设计文档第10节：每日发布上限，用于检测发布频率变更
 */
async function launchNextIteration(
  campaign: Campaign,
  mode: 'continue' | 'iterate',
  autoAdjustments?: { style?: boolean; timing?: boolean; hashtag?: boolean },
  dailyLimit = getCampaignDailyLimit()
): Promise<void> {
  const productInfo = campaign.productInfo!;

  // 设计文档第10节：检测发布频率是否增加
  const previousLimit = campaignDailyLimits.get(campaign.id);
  if (previousLimit !== undefined && dailyLimit > previousLimit) {
    // 发布频率增加，必须通知用户
    broadcastToRenderers('notification:must', {
      type: 'frequency_increased',
      title: 'AI 增加发布频率',
      message: `AI 建议将每日每账号发布上限从 ${previousLimit} 条增加到 ${dailyLimit} 条，${mode === 'iterate' ? '换策略后' : '继续'}执行`,
    });
    // 更新前一次上限记录（通知后用户可选择确认）
    campaignPreviousDailyLimits.set(campaign.id, previousLimit);
  }
  // 记录本次上限
  campaignDailyLimits.set(campaign.id, dailyLimit);

  // 获取上次报告中的差账号
  let badAccountIndices: number[] = [];
  if (mode === 'iterate' && campaign.latestReport) {
    const avgViews = campaign.latestReport.metrics.reduce((sum, m) => sum + m.views, 0) / campaign.latestReport.metrics.length;
    badAccountIndices = campaign.latestReport.metrics
      .map((m, i) => ({ i, views: m.views }))
      .filter(a => a.views < avgViews * 0.5)
      .map(a => a.i);
  }

  // 生成新策略（继续模式用原策略，迭代模式用新策略）
  let contentPlans: AccountContentPlan[];
  if (mode === 'continue') {
    contentPlans = await generateContentStrategy(campaign.id, productInfo, campaign.targetAccountIds.length);
  } else {
    contentPlans = await generateIterationStrategy(productInfo, campaign.latestReport!, badAccountIndices);
  }

  // 生成每个账号的实际内容
  // 设计文档第20节：传递 accountTags 用于 Hashtag 个性化
  const generatedContents: GeneratedContent[] = [];
  for (let i = 0; i < campaign.targetAccountIds.length; i++) {
    const plan = contentPlans[i];
    const accountId = campaign.targetAccountIds[i];
    const accountTags = accountManager.get(accountId)?.tags ?? [];
    // 设计文档第22节：传递 campaignId 和 iteration 用于内容新鲜度追踪
    const content = await generateContent({
      plan,
      productInfo,
      contentType: campaign.contentType,
      addVoiceover: campaign.addVoiceover,
      marketingGoal: campaign.marketingGoal,
      campaignId: campaign.id,
      iteration: campaign.currentIteration + 1,
      accountTags,
    });
    generatedContents.push(content);
  }

  // 重新调度发布时间
  const records = Array.from(accountPublishRecords.values());
  const schedules = buildPublishSchedule(campaign, records);

  // 为每个账号创建新任务
  for (let i = 0; i < campaign.targetAccountIds.length; i++) {
    const accountId = campaign.targetAccountIds[i];
    const schedule = schedules[i];
    const content = generatedContents[i];

    // 更新账号发布记录（预占名额）
    const existing = accountPublishRecords.get(accountId);
    accountPublishRecords.set(accountId, {
      accountId,
      lastPublishedAt: Date.now(),
      publishedToday: (existing?.publishedToday || 0) + 1,
    });

    await taskQueue.create({
      type: 'publish',
      platform: 'douyin',
      title: campaign.name,
      payload: {
        title: productInfo.name,
        content: content.text,
        images: content.images,
        video: content.video,
        voiceBase64: content.voiceBase64,
        accountId,
        hashtags: content.hashtags,
        contentType: campaign.contentType,
      },
      scheduledAt: schedule.scheduledTime,
      pipelineId: campaign.id,
    });
  }

  // 更新迭代次数
  updateCampaignIteration(campaign.id, campaign.currentIteration + 1, 0);
  updateCampaignStatus(campaign.id, 'running');

  // 重启监控
  startMonitoring(campaign.id);
}

/**
 * 启动监控定时器（6h / 24h / 48h）
 */
function startMonitoring(campaignId: string): void {
  // 取消已有的监控
  stopMonitoring(campaignId);

  const abortController = new AbortController();
  const now = Date.now();

  // 保存监控开始时间到数据库（用于服务重启后恢复）
  updateCampaignMonitoring(campaignId, now, 0);

  const monitorPoints = [
    { offset: 6 * 60 * 60 * 1000, key: '6h', bit: 1 },
    { offset: 24 * 60 * 60 * 1000, key: '24h', bit: 2 },
    { offset: 48 * 60 * 60 * 1000, key: '48h', bit: 4 },
  ];

  const timers: Array<{ time: number; callback: () => void }> = [];

  for (const point of monitorPoints) {
    const scheduledTime = now + point.offset;
    timers.push({
      time: scheduledTime,
      callback: async () => {
        // 标记该监控点已完成
        const campaign = getCampaign(campaignId);
        if (campaign) {
          const completed = (campaign.monitorPointsCompleted || 0) | point.bit;
          updateCampaignMonitoring(campaignId, campaign.monitorStartedAt!, completed);
        }
        await checkCampaignProgress(campaignId);
      },
    });
  }

  campaignMonitors.set(campaignId, { timers, abortController });

  // 设置定时器
  for (const timer of timers) {
    const delay = timer.time - Date.now();
    if (delay > 0) {
      setTimeout(() => {
        if (!abortController.signal.aborted) {
          timer.callback();
        }
      }, delay);
    }
  }

  log.info(`[CampaignManager] 监控已启动: ${campaignId}`);
}

/**
 * 停止监控
 */
function stopMonitoring(campaignId: string): void {
  const monitor = campaignMonitors.get(campaignId);
  if (monitor) {
    monitor.abortController.abort();
    campaignMonitors.delete(campaignId);
  }
}

/**
 * 检查推广进度（爬取数据）
 */
export async function checkCampaignProgress(campaignId: string): Promise<void> {
  const campaign = getCampaign(campaignId);
  if (!campaign) return;

  log.info('[CampaignManager] 检查推广进度:', campaignId);

  // 计算哪些监控点已到期
  const monitorPoints = [
    { offset: 6 * 60 * 60 * 1000, key: '6h', bit: 1 },
    { offset: 24 * 60 * 60 * 1000, key: '24h', bit: 2 },
    { offset: 48 * 60 * 60 * 1000, key: '48h', bit: 4 },
  ];

  const now = Date.now();
  const startedAt = campaign.monitorStartedAt || campaign.createdAt;
  const currentCompleted = campaign.monitorPointsCompleted || 0;

  // 检查是否有新的监控点到期
  for (const point of monitorPoints) {
    const elapsed = now - startedAt;
    if (elapsed >= point.offset && !(currentCompleted & point.bit)) {
      // 该监控点已到期但未执行，执行它
      log.info(`[CampaignManager] 触发监控点: ${point.key} (elapsed=${Math.round(elapsed / 1000 / 60)}min)`);
    }
  }

  // 使用 platform-launcher 获取已登录的 Page，爬取真实数据
  const metrics: AccountMetrics[] = [];

  // 设计文档第8节：必须通知 - 跟踪账号健康状态
  const bannedAccounts: string[] = [];
  const limitedAccounts: string[] = [];

  // 设计文档第8节：必须通知 - 内容违规被平台拦截推断
  // 内容违规推断：账号任务失败 OR (账号健康正常 AND 播放量为0 AND 过了6h+)
  const violatedAccounts: string[] = [];
  const failedAccountSet = campaignFailedAccounts.get(campaignId) || new Set();

  for (const accountId of campaign.targetAccountIds) {
    let page: Page | null = null;
    try {
      // 获取账号凭证
      const credentials = await credentialManager.getCredential(accountId);
      if (!credentials) {
        log.warn(`[CampaignManager] 账号 ${accountId} 无凭证`);
        metrics.push({
          accountId,
          accountName: accountId,
          views: 0, likes: 0, comments: 0, favorites: 0, shares: 0,
          followerDelta: 0, healthStatus: 'banned',
          contentStatus: 'unknown',
        });
        bannedAccounts.push(accountId);
        continue;
      }

      // 从页面池获取已登录的 Page
      page = await createPage('douyin', accountId);
      if (!page) {
        log.warn(`[CampaignManager] 无法获取账号 ${accountId} 的页面`);
        metrics.push({
          accountId,
          accountName: accountId,
          views: 0, likes: 0, comments: 0, favorites: 0, shares: 0,
          followerDelta: 0, healthStatus: 'limited',
          contentStatus: 'unknown',
        });
        limitedAccounts.push(accountId);
        continue;
      }

      // 爬取该账号的数据
      const accountMetrics = await scrapeAccountMetrics(page, accountId, accountId);

      // 设计文档第8节：推断内容是否被平台拦截/隐藏
      // 条件：账号任务明确失败 OR (账号健康正常 AND 播放量=0 AND 过了6h+)
      const isViolation =
        failedAccountSet.has(accountId) ||
        (accountMetrics.healthStatus === 'normal' &&
         accountMetrics.views === 0 &&
         now - startedAt >= 6 * 60 * 60 * 1000);

      if (isViolation) {
        accountMetrics.contentStatus = 'violated';
        violatedAccounts.push(accountId);
      } else if (accountMetrics.views > 0) {
        accountMetrics.contentStatus = 'published';
      }

      metrics.push(accountMetrics);

      // 检测账号健康状态
      if (accountMetrics.healthStatus === 'banned') {
        bannedAccounts.push(accountId);
      } else if (accountMetrics.healthStatus === 'limited') {
        limitedAccounts.push(accountId);
      }
    } catch (error) {
      log.error(`[CampaignManager] 爬取账号 ${accountId} 数据失败:`, error);
      metrics.push({
        accountId,
        accountName: accountId,
        views: 0, likes: 0, comments: 0, favorites: 0, shares: 0,
        followerDelta: 0, healthStatus: 'limited',
        contentStatus: 'unknown',
      });
      limitedAccounts.push(accountId);
    } finally {
      if (page) {
        await releasePage(page);
      }
    }
  }

  // 设计文档第8节：必须通知 - 账号被封禁/风控
  if (bannedAccounts.length > 0) {
    broadcastToRenderers('notification:must', {
      type: 'account_banned',
      title: '账号被封禁',
      message: `以下账号已被平台封禁：${bannedAccounts.join(', ')}，请人工介入处理`,
      accounts: bannedAccounts,
    });
  } else if (limitedAccounts.length > 0) {
    broadcastToRenderers('notification:must', {
      type: 'account_limited',
      title: '账号被限流',
      message: `以下账号可能被平台限流：${limitedAccounts.join(', ')}，建议检查账号状态`,
      accounts: limitedAccounts,
    });
  }

  // 设计文档第8节：必须通知 - 内容违规被平台拦截
  if (violatedAccounts.length > 0) {
    broadcastToRenderers('notification:must', {
      type: 'content_violated',
      title: '内容疑似违规被拦截',
      message: `以下账号发布的内容可能被平台判定为违规并拦截：${violatedAccounts.join(', ')}，建议检查内容是否符合平台规范`,
      accounts: violatedAccounts,
    });
  }

  // 生成报告
  const avgViews = metrics.reduce((sum, m) => sum + m.views, 0) / metrics.length;
  const sortedByViews = [...metrics].sort((a, b) => b.views - a.views);

  // 设计文档第17节：最差账号原因分析
  const worstAccounts = sortedByViews.slice(-1);
  const worstAccountReasons = worstAccounts.map(m => {
    if (m.healthStatus === 'banned') return '账号已被封禁';
    if (m.healthStatus === 'limited') return '账号被限流';
    if (m.contentStatus === 'violated') return '内容疑似违规被平台拦截';
    if (m.views === 0) return '播放量为0，可能是内容未通过审核';
    const ratio = m.views / avgViews;
    if (ratio < 0.2) return `播放量过低（${Math.round(ratio * 100)}%平均）`;
    return `播放量偏低（${Math.round(ratio * 100)}%平均）`;
  });

  // 先创建基础报告对象（包含原始推荐）
  const report: CampaignReport = {
    campaignId,
    generatedAt: Date.now(),
    metrics,
    bestAccounts: sortedByViews.slice(0, Math.min(3, metrics.length)).map(m => m.accountId),
    worstAccounts: worstAccounts.map(m => m.accountId),
    worstAccountReasons,
    recommendation: avgViews > 5000 ? 'continue' : avgViews > 1000 ? 'iterate' : 'stop',
    summary: `本次推广平均播放量${Math.round(avgViews)}，${avgViews > 5000 ? '表现良好，建议继续' : avgViews > 1000 ? '建议优化内容策略' : '效果较差，建议停止或大幅调整策略'}`,
  };

  // 调用 AI Director 获取迭代决策（设计文档：AI 自主决策 + autoAdjustments）
  const iterationDecision = await decideIteration(report, campaign.currentIteration);

  // 用 AI 决策覆盖基础报告的建议和自动调整标志
  report.recommendation = iterationDecision.action;
  report.summary = iterationDecision.reason;
  report.autoAdjustments = iterationDecision.autoAdjustments;

  // 保存报告
  saveCampaignReport(campaignId, report);

  // 设计文档第8节：重要通知 - 内容爆量检测（播放量远超预期）
  const topViews = sortedByViews[0]?.views || 0;
  if (topViews > 50000 || avgViews > 20000) {
    broadcastToRenderers('notification:important', {
      type: 'content_exploded',
      title: '内容爆量',
      message: `推广效果超预期！最高播放量 ${topViews.toLocaleString()}，平均 ${Math.round(avgViews).toLocaleString()}，建议乘胜追击继续发布`,
    });
  }

  // 设计文档第8节：重要通知 - AI 换策略
  if (iterationDecision.action === 'iterate') {
    broadcastToRenderers('notification:important', {
      type: 'ai_strategy_changed',
      title: 'AI 自主换策略',
      message: iterationDecision.reason,
    });
  }

  // 判断是否到达48小时（使用监控开始时间计算）
  const elapsed = now - startedAt;
  if (elapsed >= 48 * 60 * 60 * 1000) {
    // 48小时到，设置为等待反馈状态
    updateCampaignStatus(campaignId, 'waiting_feedback');
    stopMonitoring(campaignId);
    // 设计文档第8节：重要通知 - 48小时效果报告已生成
    broadcastToRenderers('notification:important', {
      type: 'report_ready',
      title: '48小时效果报告已生成',
      message: `推广"${campaign.name}"的48小时效果报告已准备好，请查看并反馈效果`,
      campaignId,
    });
    broadcastToRenderers('campaign:report-ready', { campaignId, report });
    log.info('[CampaignManager] 48小时报告已生成，等待用户反馈:', campaignId);
  } else {
    // 中间报告，只更新数据
    broadcastToRenderers('campaign:updated', { campaignId, report });
  }
}

/**
 * 获取活动状态
 */
export function getCampaignProgress(campaignId: string): Campaign | null {
  return getCampaign(campaignId);
}
