/**
 * IPC API 类型定义 — 前端 Renderer 和主进程共享
 * 所有 ElectronAPI 接口统一在此定义，确保类型一致性
 */
import type {
  Platform, TaskType, Task, TaskFilter,
  Account, AIRequest, AIResponse, AIIterationRequest,
} from './types.js';

// ============ 任务草稿类型 ============
export interface TaskDraft {
  title: string;
  content: string;
  platform: string;
  accountIds: string[];
  contentMode: 'text' | 'image' | 'voice';
}

// ============ 分组事件类型 ============
export interface GroupEvent {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// ============ Pipeline 任务类型 ============
export interface PipelineTask {
  id: string;
  type: string;
  platform: Platform;
  status: string;
  title: string;
  payload: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// ============ AI 推荐参数类型 ============
export interface AIRecommendationParams {
  platform?: Platform;
  result?: unknown;
  tasks?: Array<{
    type: string;
    platform: Platform;
    title: string;
    payload: Record<string, unknown>;
    scheduledAt?: number;
  }>;
  task?: {
    type: string;
    platform: Platform;
    title: string;
    payload: Record<string, unknown>;
  };
}

// ============ AI 反馈类型 ============
export interface AIFeedbackData {
  taskId: string;
  result?: unknown;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

// ============ 导出/导入数据类型 ============
export interface ExportData {
  accounts: Account[];
  tasks: Task[];
  groups: GroupEvent[];
}

export interface ImportData {
  accounts: Account[];
  tasks: Task[];
  groups: GroupEvent[];
}

// ============ AI Provider 类型 ============
export interface AIProvider {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  models: string[];
  isDefault: boolean;
  status: string;
}

// ============ ElectronAPI 接口 ============
export interface ElectronAPI {
  // 热点话题
  fetchHotTopics: (platform?: Platform) => Promise<{
    topics: Array<{
      id: string;
      title: string;
      rank: number;
      heat: number;
      link: string;
      coverUrl?: string;
      platform: Platform;
      fetchedAt: number;
    }>;
    source: Platform | 'all';
    fetchedAt: number;
    error?: string;
  }>;

  // 任务
  createTask: (params: {
    type: TaskType;
    platform: Platform;
    title: string;
    payload: Record<string, unknown>;
    scheduledAt?: number;
  }) => Promise<Task>;

  getTask: (taskId: string) => Promise<Task | null>;
  listTasks: (filter?: TaskFilter) => Promise<Task[]>;
  cancelTask: (taskId: string) => Promise<Task | null>;
  retryTask: (taskId: string) => Promise<Task | null>;
  getTaskStats: () => Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  }>;

  // Task Draft (Encrypted Storage)
  getTaskDraft: () => Promise<TaskDraft | null>;
  setTaskDraft: (draft: TaskDraft | null) => Promise<{ success: boolean }>;

  // 账号
  listAccounts: (platform?: Platform) => Promise<Account[]>;
  addAccount: (params: {
    platform: Platform;
    username: string;
    displayName: string;
    avatar?: string;
    password: string;
    cookies?: string;
    tokens?: Record<string, string>;
    groupId?: string;
    tags?: string[];
  }) => Promise<Account | { success: false; error: string }>;
  updateAccount: (accountId: string, updates: Partial<Pick<Account, 'displayName' | 'avatar' | 'status' | 'groupId' | 'tags'> & { username?: string; password?: string }>) => Promise<Account | null>;
  removeAccount: (accountId: string) => Promise<{ success: boolean }>;
  validateAccount: (accountId: string) => Promise<{ valid: boolean; error?: string }>;

  // 分组管理
  createGroup: (name: string, color?: string) => Promise<GroupEvent>;
  updateGroup: (id: string, updates: { name?: string; color?: string; sortOrder?: number }) => Promise<GroupEvent | null>;
  deleteGroup: (groupId: string) => Promise<{ success: boolean }>;
  listGroups: () => Promise<GroupEvent[]>;
  getGroup: (groupId: string) => Promise<GroupEvent | null>;
  reorderGroups: (groups: { id: string; sortOrder: number }[]) => Promise<{ success: boolean }>;
  getGroupAccountCount: (groupId: string) => Promise<number>;

  // 限流
  getRateStatus: (platform: Platform) => Promise<{
    minute: { count: number; limit: number; resetAt: number };
    hour: { count: number; limit: number; resetAt: number };
    day: { count: number; limit: number; resetAt: number };
  }>;
  checkRate: (platform: Platform) => Promise<boolean>;
  getRateLimitStatusAll: () => Promise<Record<string, {
    minute: { remaining: number; resetAt: number };
    hour: { remaining: number; resetAt: number };
    day: { remaining: number; resetAt: number };
  }>>;

  // AI
  generateAI: (request: AIRequest) => Promise<AIResponse>;
  iterateAI: (request: AIIterationRequest) => Promise<AIResponse>;
  getAIProviders: () => Promise<AIProvider[]>;
  addAIProvider: (params: {
    name: string;
    type: string;
    apiKey: string;
    baseUrl: string;
    models: string[];
    isDefault?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  testAIConnection: (params: { baseUrl: string; apiKey: string; model: string }) => Promise<{ success: boolean; error?: string }>;
  getCircuitStatus: (providerType: string) => Promise<{
    state: 'closed' | 'open' | 'half_open';
    failures: number;
    lastFailure?: string;
  }>;
  bindTaskType: (taskType: 'text' | 'image' | 'video' | 'voice', providerId: string) => Promise<{ success: boolean; error?: string }>;
  getTaskTypeBindings: () => Promise<Record<string, { id: string; name: string; type: string; models: string[] }>>;
  getTaskAIConfigs: () => Promise<Record<string, { baseUrl: string; hasApiKey: boolean; model: string }>>;
  saveTaskAIConfig: (taskType: string, config: { baseUrl: string; apiKey: string; model: string }) => Promise<{ success: boolean; error?: string }>;
  dailyBriefing: (platform: Platform) => Promise<{ success: boolean; result?: unknown }>;
  hotTopics: (platform: Platform) => Promise<{ success: boolean; result?: unknown }>;
  analyzeNow: (type: 'failure' | 'daily' | 'hot_topic', platform: Platform, taskId?: string) => Promise<{ success: boolean }>;
  analyzeFailure: (taskId: string) => Promise<{ success: boolean; error?: string }>;

  // Campaign
  campaign_launch: (params: {
    name: string;
    productUrl?: string;
    productDescription?: string;
    contentType: 'video' | 'image_text';
    addVoiceover: boolean;
    marketingGoal: 'exposure' | 'engagement' | 'conversion';
    targetAccountIds: string[];
  }) => Promise<{ success: boolean; task?: unknown; error?: string }>;
  campaign_get: (campaignId: string) => Promise<{ success: boolean; campaign?: unknown; error?: string }>;
  campaign_list: (status?: string) => Promise<{ success: boolean; campaigns?: unknown[]; error?: string }>;
  campaign_feedback: (campaignId: string, feedback: 'good' | 'bad') => Promise<{ success: boolean; error?: string }>;
  campaign_cancel: (campaignId: string) => Promise<{ success: boolean; error?: string }>;
  scrape_product: (url: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;

  // Pipeline
  createPipeline: (params: {
    input: { type: 'url' | 'product_detail' | 'hot_topic'; url?: string; productDetail?: string; hotTopic?: { keyword: string; platform: Platform } };
    config: {
      contentType: 'image' | 'video';
      imageCount?: 3 | 6 | 9;
      generateVoice?: boolean;
      autoPublish: boolean;
      targetAccounts: string[];
    };
    platform: Platform;
  }) => Promise<{ success: boolean; task?: unknown; error?: string }>;
  getPipeline: (pipelineId: string) => Promise<unknown>;
  cancelPipeline: (pipelineId: string) => Promise<{ success: boolean; error?: string }>;
  onPipelineCreated: (callback: (task: PipelineTask) => void) => void;
  onPipelineUpdated: (callback: (task: PipelineTask) => void) => void;

  // Campaign 事件监听
  onCampaignStarted: (callback: (data: unknown) => void) => void;
  onCampaignUpdated: (callback: (data: unknown) => void) => void;
  onCampaignReportReady: (callback: (data: unknown) => void) => void;
  onCampaignContinued: (callback: (data: unknown) => void) => void;
  onCampaignIterating: (callback: (data: unknown) => void) => void;
  onCampaignFailed: (callback: (data: unknown) => void) => void;

  // 系统
  getIpcChannelVersion: () => number;
  getSystemStats: () => Promise<{
    tasks: { total: number; pending: number; running: number; completed: number; failed: number };
    dbPath: string;
  }>;
  openDevTools: () => Promise<{ success: boolean }>;
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string>;

  // 监控
  getHealthStatus: () => Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    timestamp: number;
  }>;

  // 用户同意
  getConsentRequired: () => Promise<boolean>;
  grantConsent: () => Promise<void>;
  getAlerts: (options?: { limit?: number; unacknowledgedOnly?: boolean }) => Promise<Array<{
    id: string;
    type: string;
    message: string;
    severity: string;
    acknowledged: boolean;
    createdAt: number;
  }>>;
  acknowledgeAlert: (alertId: string) => Promise<{ success: boolean }>;
  getDashboardData: () => Promise<{
    todayPublishCount: number;
    successRate: number;
    pendingTasks: number;
    failedTasks24h: number;
    recentAlerts: { id: string; level: string; message: string; createdAt: number }[];
    accountHealth: { platform: Platform; status: string }[];
  }>;
  getMetrics: (name: string, from?: number, to?: number, limit?: number) => Promise<Array<{
    name: string;
    value: number;
    timestamp: number;
  }>>;

  // 设置
  getSettings: () => Promise<Record<string, unknown>>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;

  // 数据导出/导入
  exportData: () => Promise<ExportData>;
  importData: (data: ImportData) => Promise<{ success: boolean; error?: string }>;
  clearAllData: () => Promise<void>;

  // 事件监听
  onMenuAction: (channel: string, callback: () => void) => void;
  onTaskCreated: (callback: (task: Task) => void) => void;
  onTaskUpdated: (callback: (task: Task) => void) => void;
  onAccountAdded: (callback: (account: Account) => void) => void;
  onAccountUpdated: (callback: (account: Account) => void) => void;
  onAccountRemoved: (callback: (data: { accountId: string }) => void) => void;
  onGroupCreated: (callback: (group: GroupEvent) => void) => void;
  onGroupUpdated: (callback: (group: GroupEvent) => void) => void;
  onGroupDeleted: (callback: (data: { groupId: string }) => void) => void;

  // AI 推荐监听
  onAIRecommendation: (callback: (data: {
    action: string;
    reason: string;
    confidence: number;
    params: AIRecommendationParams;
  }) => void) => void;
  onAIFeedback: (callback: (data: AIFeedbackData) => void) => void;
  onAIDailyPlan: (callback: (data: { platform: Platform; result: unknown }) => void) => void;
  onAIHotTopic: (callback: (data: { platform: Platform; result: unknown }) => void) => void;

  // 移除监听
  removeAllListeners: (channel: string) => void;
}
