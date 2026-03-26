export type Platform = 'douyin' | 'kuaishou' | 'xiaohongshu';

export type TaskStatus =
  | 'pending'      // 等待执行
  | 'running'      // 执行中
  | 'completed'    // 已完成
  | 'failed'       // 失败
  | 'cancelled'    // 取消
  | 'deferred';    // 延迟（rate limit）

export type TaskType =
  | 'publish'      // 发布内容
  | 'ai_generate'  // AI 生成
  | 'fetch_data'   // 获取数据
  | 'automation'   // 浏览器自动化
  | 'page_agent';  // Page Agent 自动化

export interface Task {
  id: string;
  type: TaskType;
  platform: Platform;
  status: TaskStatus;
  title: string;
  payload: Record<string, unknown>;  // 任务参数 JSON
  result?: Record<string, unknown>;  // 执行结果
  error?: string;                    // 错误信息
  progress?: number;                  // 进度 0-100
  retryCount: number;
  maxRetries: number;
  scheduledAt?: number;               // 计划执行时间
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
  // 字段锁用于乐观并发控制
  version: number;
  // 关联的 Campaign ID（可选，用于 campaign 发起的任务）
  pipelineId?: string;
}

export interface TaskFilter {
  status?: TaskStatus[];
  type?: TaskType;
  platform?: Platform;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export interface AccountGroup {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Account {
  id: string;
  platform: Platform;
  username: string;
  displayName: string;
  avatar?: string;
  status: 'active' | 'inactive' | 'error' | 'pending_validation';
  lastUsedAt?: number;
  lastValidatedAt?: number;
  groupId?: string;
  tags: string[];
  version: number;  // CAS 乐观锁版本号
  createdAt: number;
  updatedAt: number;
}

export interface RateLimitConfig {
  platform: Platform;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  // 平台特定限流
  platformLimits?: {
    [key: string]: {
      requestsPerMinute?: number;
      requestsPerHour?: number;
    };
  };
}

export interface RateLimitEntry {
  key: string;
  count: number;
  resetAt: number;  // 毫秒时间戳
}

// 任务检查点，用于崩溃恢复
export interface TaskCheckpoint {
  taskId: string;
  step: string;           // 当前步骤标识
  payload: Record<string, unknown>;
  browserState?: string;  // 序列化的浏览器状态
  createdAt: number;
}

// 执行上下文
export interface ExecutionContext {
  taskId: string;
  accountId: string;
  platform: Platform;
  checkpoint?: TaskCheckpoint;
}

// IPC 事件类型
export interface IpcChannels {
  // 任务相关
  'task:create': Task;
  'task:cancel': { taskId: string };
  'task:retry': { taskId: string };
  'task:list': TaskFilter;
  'task:get': { taskId: string };

  // 账号相关
  'account:add': Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;
  'account:remove': { accountId: string };
  'account:list': { platform?: Platform };

  // 限流相关
  'rate:check': { platform: Platform };
  'rate:acquire': { platform: Platform };
}

// AI 生成请求
export interface AIRequest {
  taskType?: 'text' | 'image' | 'video' | 'voice';
  providerType?: 'openai' | 'anthropic' | 'ollama' | 'zhipu'
    | 'minimax' | 'kimi' | 'qwen' | 'doubao'
    | 'deepseek' | 'spark' | 'yi' | 'siliconflow';
  model?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';  // 新增：要求返回格式
}

// AI 生成响应
export interface AIResponse {
  success: boolean;
  content?: string;
  structuredContent?: Record<string, unknown>;  // 新增：结构化解析结果
  contentType?: 'text' | 'image' | 'audio';  // 新增：内容类型
  error?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  tokensUsed?: number;
}

// AI 迭代请求
export interface AIIterationRequest {
  originalPrompt: string;
  originalResponse: string;
  feedback: string;
  iterationCount: number;
}

// RetryAdvice 白名单 action
export type RetryAction = 'update_selector' | 'increase_timeout' | 'use_backup_account' | 'skip'

// AI 建议的重试参数（结构化，防注入）
export interface RetryAdvice {
  action: RetryAction
  params: {
    selectorKey?: string      // 选择器 key，如 'publish_confirm'
    fallbackIndex?: number    // 使用第几个备用选择器
    timeoutMs?: number        // 超时毫秒数，如 30000
    accountId?: string        // 备用账号 ID
  }
}

// AI 失败分析结果
export interface AIFailureResult {
  taskId: string
  diagnosis: string           // 最多 50 字
  suggestions: string[]       // 每条最多 30 字
  confidence: number        // 0.0-1.0
  shouldRetry: boolean
  retryAdvice?: RetryAdvice
}

// AI 每日策略结果
export interface DailyPlan {
  date: string
  platform: Platform
  recommendedTopics: string[]
  bestTimes: number[]         // 北京时间小时，如 [9, 12, 20]
  warnings: string[]
  confidence: number
}

// AI 热点检测结果
export interface HotTopicDecision {
  topic: string
  shouldChase: boolean
  reason: string
  contentAngle: string
  confidence: number
}

// AI 决策（执行层使用）
export interface AIDecision {
  action: 'retry_with_fix' | 'create_task' | 'notify' | 'skip'
  reason: string
  confidence: number
  params: Record<string, unknown>
}

// AI 手动触发类型
export type AITriggerType = 'failure' | 'daily' | 'hot_topic'

// Page Agent Payload
export interface PageAgentPayload {
  goal: string;           // 自然语言目标
  platform: Platform;
  accountId: string;
  url?: string;           // 目标 URL，默认导航到发布页
  maxSteps?: number;      // 最大步数，默认 20
  taskType?: 'text' | 'image' | 'video' | 'voice';
}

// ============ Pipeline 类型 ============

export type InputSourceType = 'url' | 'product_detail' | 'hot_topic';

export interface InputSource {
  type: InputSourceType;
  url?: string;                    // 当 type === 'url' 时
  productDetail?: string;         // 当 type === 'product_detail' 时
  hotTopic?: { keyword: string; platform: Platform }; // 当 type === 'hot_topic' 时
}

export interface PipelineConfig {
  contentType: 'image' | 'video';  // 图片集 或 视频（二选一，互斥）
  imageCount?: 3 | 6 | 9;          // 仅图片集模式使用，默认 9
  generateVoice?: boolean;          // 仅图片集模式使用，配音作为语音版本附件
  autoPublish: boolean;
  targetAccounts: string[];        // 账号 ID 列表
}

export interface PipelineStep {
  step: 'parse' | 'text' | 'voice' | 'publish';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineTask {
  id: string;
  traceId: string;  // 贯穿整个 pipeline 的追踪 ID
  input: InputSource;
  config: PipelineConfig;
  platform: Platform;
  steps: PipelineStep[];
  currentStep: 'parse' | 'text' | 'voice' | 'publish';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'compensating' | 'compensated';
  result?: {
    text?: string;
    imageUrls?: string[];
    voiceBase64?: string;
    videoUrl?: string;
    publishedTaskIds?: string[];
  };
  compensation?: {
    parse?: { cleanupFiles?: string[] };
    text?: { deletedMedia?: string[] };
    publish?: { deletedTaskIds?: string[] };
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// Campaign 状态机
export type CampaignStatus = 'draft' | 'running' | 'waiting_feedback' | 'iterating' | 'completed' | 'failed';

// 内容类型
export type ContentType = 'video' | 'image_text';

// 营销目标
export type MarketingGoal = 'exposure' | 'engagement' | 'conversion';

// 产品信息
export interface ProductInfo {
  name: string;
  description: string;
  price?: string;
  specs?: string;
  brand?: string;
  targetAudience?: string;
  images: string[];
}

// 账号发布记录（用于冷却机制）
export interface AccountPublishRecord {
  accountId: string;
  lastPublishedAt: number;
  publishedToday: number;
}

// 单账号效果数据
export interface AccountMetrics {
  accountId: string;
  accountName: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  followerDelta: number;
  healthStatus: 'normal' | 'limited' | 'banned';
}

// 效果报告
export interface CampaignReport {
  campaignId: string;
  generatedAt: number;
  metrics: AccountMetrics[];
  bestAccounts: string[];
  worstAccounts: string[];
  recommendation: 'continue' | 'iterate' | 'stop';
  summary: string;
}

// Campaign（推广活动）
export interface Campaign {
  id: string;
  name: string;
  productUrl?: string;
  productDescription?: string;
  productInfo?: ProductInfo;
  contentType: ContentType;
  addVoiceover: boolean;
  marketingGoal: MarketingGoal;
  targetAccountIds: string[];
  status: CampaignStatus;
  createdAt: number;
  updatedAt: number;
  currentIteration: number;
  consecutiveFailures: number;
  lastFeedback?: 'good' | 'bad';
  latestReport?: CampaignReport;
}
