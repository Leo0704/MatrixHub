import { scrapeProductInfo } from './scraper/product-scraper.js';
import { generateContentStrategy, decideIteration, generateIterationStrategy, type AccountContentPlan } from './ai-director.js';
import { moderateAndFix } from './moderation/content-moderator.js';
import { buildPublishSchedule } from './strategy/publish-scheduler.js';
import { scrapeAccountMetrics } from './scraper/douyin-metrics.js';
import { createCampaign, getCampaign, updateCampaignStatus, updateCampaignIteration, saveCampaignReport, setCampaignFeedback } from './campaign-store.js';
import { taskQueue } from './queue.js';
import { broadcastToRenderers } from './ipc-handlers.js';
import type { Campaign, CampaignReport, AccountMetrics, ContentType, MarketingGoal, ProductInfo } from '../shared/types.js';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

// 监控定时器存储
const campaignMonitors = new Map<string, {
  timers: Array<{ time: number; callback: () => void }>;
  abortController: AbortController;
}>();

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

  // Step 3: 生成内容策略（每个账号独立内容）
  const contentPlans = await generateContentStrategy(campaign.id, productInfo!, params.targetAccountIds.length);

  // Step 4: 调度发布时间（分散 10-30 分钟）
  const schedules = buildPublishSchedule(campaign, []);

  // Step 5: 为每个账号创建发布任务
  for (let i = 0; i < params.targetAccountIds.length; i++) {
    const accountId = params.targetAccountIds[i];
    const schedule = schedules[i];
    const plan = contentPlans[i];

    // 构建任务 payload
    const taskPayload = {
      title: productInfo?.name || params.name,
      content: plan.contentAngle, // 文案先用角度描述，实际文案在执行时生成
      accountId,
      contentType: params.contentType,
      addVoiceover: params.addVoiceover,
      contentPlan: plan,
      hashtags: plan.hashtagHints,
      productInfo,
      marketingGoal: params.marketingGoal,
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

  // Step 6: 广播启动事件
  broadcastToRenderers('campaign:started', { campaignId: campaign.id });

  // Step 7: 启动监控定时器
  startMonitoring(campaign.id);

  log.info('[CampaignManager] 推广活动启动成功:', campaign.id);
  return campaign;
}

/**
 * 处理用户反馈
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
    // 效果好：继续当前策略，生成新一轮内容发布
    broadcastToRenderers('campaign:continued', { campaignId });
    await launchNextIteration(campaign, 'continue');
  } else {
    // 效果不好：换策略迭代
    updateCampaignIteration(campaignId, campaign.currentIteration + 1, 0);
    updateCampaignStatus(campaignId, 'iterating');
    broadcastToRenderers('campaign:iterating', { campaignId });

    // 检查是否连续失败超过2次
    if (campaign.currentIteration + 1 >= 2) {
      // 连续失败，停止并通知
      updateCampaignStatus(campaignId, 'failed');
      broadcastToRenderers('campaign:failed', {
        campaignId,
        reason: '连续2次迭代效果不佳，建议人工介入调整策略',
      });
      return;
    }

    await launchNextIteration(campaign, 'iterate');
  }
}

/**
 * 启动新一轮迭代
 */
async function launchNextIteration(campaign: Campaign, mode: 'continue' | 'iterate'): Promise<void> {
  const productInfo = campaign.productInfo!;

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

  // 重新调度发布时间
  const schedules = buildPublishSchedule(campaign, []);

  // 为每个账号创建新任务
  for (let i = 0; i < campaign.targetAccountIds.length; i++) {
    const accountId = campaign.targetAccountIds[i];
    const schedule = schedules[i];
    const plan = contentPlans[i];

    await taskQueue.create({
      type: 'publish',
      platform: 'douyin',
      title: campaign.name,
      payload: {
        title: productInfo.name,
        content: plan.contentAngle,
        accountId,
        contentType: campaign.contentType,
        addVoiceover: campaign.addVoiceover,
        contentPlan: plan,
        hashtags: plan.hashtagHints,
        productInfo,
        marketingGoal: campaign.marketingGoal,
        isIteration: true,
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

  const monitorPoints = [
    { offset: 6 * 60 * 60 * 1000, key: '6h' },
    { offset: 24 * 60 * 60 * 1000, key: '24h' },
    { offset: 48 * 60 * 60 * 1000, key: '48h' },
  ];

  const timers: Array<{ time: number; callback: () => void }> = [];

  for (const point of monitorPoints) {
    const scheduledTime = now + point.offset;
    timers.push({
      time: scheduledTime,
      callback: async () => {
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

  // TODO: 使用 platform-launcher 获取已登录的 Page
  // 目前简化：生成模拟数据
  const mockMetrics: AccountMetrics[] = campaign.targetAccountIds.map(id => ({
    accountId: id,
    accountName: id,
    views: Math.floor(Math.random() * 10000),
    likes: Math.floor(Math.random() * 1000),
    comments: Math.floor(Math.random() * 100),
    favorites: Math.floor(Math.random() * 500),
    shares: Math.floor(Math.random() * 50),
    followerDelta: Math.floor(Math.random() * 100) - 50,
    healthStatus: 'normal',
  }));

  // 生成报告
  const avgViews = mockMetrics.reduce((sum, m) => sum + m.views, 0) / mockMetrics.length;
  const sortedByViews = [...mockMetrics].sort((a, b) => b.views - a.views);

  const report: CampaignReport = {
    campaignId,
    generatedAt: Date.now(),
    metrics: mockMetrics,
    bestAccounts: sortedByViews.slice(0, 3).map(m => m.accountId),
    worstAccounts: sortedByViews.slice(-1).map(m => m.accountId),
    recommendation: avgViews > 5000 ? 'continue' : 'iterate',
    summary: `本次推广平均播放量${Math.round(avgViews)}，${avgViews > 5000 ? '表现良好，建议继续' : '建议优化内容策略'}`,
  };

  // 保存报告
  saveCampaignReport(campaignId, report);

  // 判断是否到达48小时（生成最终报告）
  const age = Date.now() - campaign.updatedAt;
  if (age >= 48 * 60 * 60 * 1000) {
    // 48小时到，设置为等待反馈状态
    updateCampaignStatus(campaignId, 'waiting_feedback');
    stopMonitoring(campaignId);
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
