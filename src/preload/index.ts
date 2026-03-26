import { contextBridge, ipcRenderer } from 'electron';
import type {
  Platform, TaskType, Task, TaskFilter,
  Account, AIRequest, AIResponse, AIIterationRequest,
} from '../shared/types.js';
import type { HotTopic as FetcherHotTopic } from '../service/data-fetcher/types.js';

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
  getTaskDraft: () => Promise<any>;
  setTaskDraft: (draft: any) => Promise<{ success: boolean }>;

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
  createGroup: (name: string, color?: string) => Promise<{ id: string; name: string; color: string; sortOrder: number; createdAt: number; updatedAt: number }>;
  updateGroup: (id: string, updates: { name?: string; color?: string; sortOrder?: number }) => Promise<{ id: string; name: string; color: string; sortOrder: number; createdAt: number; updatedAt: number } | null>;
  deleteGroup: (groupId: string) => Promise<{ success: boolean }>;
  listGroups: () => Promise<Array<{ id: string; name: string; color: string; sortOrder: number; createdAt: number; updatedAt: number }>>;
  getGroup: (groupId: string) => Promise<{ id: string; name: string; color: string; sortOrder: number; createdAt: number; updatedAt: number } | null>;
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

  // 自动化确认
  requestAutomationConfirm: (params: {
    action: string;
    platform: Platform;
    accountId?: string;
    config?: Record<string, unknown>;
  }) => Promise<{ confirmed: boolean; dontAskAgain: boolean }>;

  // 事件监听
  onAutomationConfirmRequest: (callback: (params: {
    action: string;
    actionLabel: string;
    platform: Platform;
    platformLabel: string;
    accountId?: string;
    riskMessage: string;
  }) => void) => void;
  sendAutomationConfirmResponse: (result: { confirmed: boolean; dontAskAgain: boolean }) => void;

  // AI
  generateAI: (request: AIRequest) => Promise<AIResponse>;
  iterateAI: (request: AIIterationRequest) => Promise<AIResponse>;
  getAIProviders: () => Promise<Array<{
    id: string;
    name: string;
    type: string;
    baseUrl: string;
    models: string[];
    isDefault: boolean;
    status: string;
  }>>;
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

  // 选择器
  getSelector: (platform: Platform, selectorKey: string) => Promise<{
    selectorKey: string;
    value: string;
    type: string;
    version: number;
    successRate: number;
  } | null>;
  listSelectors: (platform: Platform) => Promise<Array<{
    selectorKey: string;
    value: string;
    type: string;
    version: number;
    successRate: number;
    failureCount: number;
    updatedAt: number;
  }>>;
  getSelectorVersions: (platform: Platform, selectorKey: string) => Promise<Array<{
    version: number;
    value: string;
    successRate: number;
    failureCount: number;
    updatedAt: number;
  }>>;
  registerSelector: (params: {
    platform: Platform;
    selectorKey: string;
    value: string;
    type?: 'css' | 'xpath' | 'text' | 'aria';
  }) => Promise<{ success: boolean; error?: string }>;
  reportSelectorSuccess: (platform: Platform, selectorKey: string) => Promise<{ success: boolean }>;
  reportSelectorFailure: (platform: Platform, selectorKey: string) => Promise<{ success: boolean }>;

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
  onPipelineCreated: (callback: (task: unknown) => void) => void;
  onPipelineUpdated: (callback: (task: unknown) => void) => void;

  // 系统
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
  exportData: () => Promise<{
    accounts: any[];
    tasks: any[];
    groups: any[];
    selectors: any[];
  }>;
  importData: (data: { accounts: any[]; tasks: any[]; groups: any[]; selectors: any[] }) => Promise<{ success: boolean; error?: string }>;
  clearAllData: () => Promise<void>;

  // 事件监听
  onMenuAction: (channel: string, callback: () => void) => void;
  onTaskCreated: (callback: (task: Task) => void) => void;
  onTaskUpdated: (callback: (task: Task) => void) => void;
  onAccountAdded: (callback: (account: Account) => void) => void;
  onAccountUpdated: (callback: (account: Account) => void) => void;
  onAccountRemoved: (callback: (data: { accountId: string }) => void) => void;
  onGroupCreated: (callback: (group: any) => void) => void;
  onGroupUpdated: (callback: (group: any) => void) => void;
  onGroupDeleted: (callback: (data: { groupId: string }) => void) => void;

  // AI 推荐监听
  onAIRecommendation: (callback: (data: {
    action: string;
    reason: string;
    confidence: number;
    params: {
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
    };
  }) => void) => void;
  onAIFeedback: (callback: (data: {
    taskId: string;
    result?: unknown;
    error?: string;
    skipped?: boolean;
    reason?: string;
  }) => void) => void;
  onAIDailyPlan: (callback: (data: { platform: Platform; result: unknown }) => void) => void;
  onAIHotTopic: (callback: (data: { platform: Platform; result: unknown }) => void) => void;

  // 移除监听
  removeAllListeners: (channel: string) => void;
}

const api: ElectronAPI = {
  // ============ 热点话题 ============
  fetchHotTopics: (platform) => ipcRenderer.invoke('fetch:hot-topics', { platform }),

  // ============ 任务 ============
  createTask: (params) => ipcRenderer.invoke('task:create', params),
  getTask: (taskId) => ipcRenderer.invoke('task:get', { taskId }),
  listTasks: (filter) => ipcRenderer.invoke('task:list', filter ?? {}),
  cancelTask: (taskId) => ipcRenderer.invoke('task:cancel', { taskId }),
  retryTask: (taskId) => ipcRenderer.invoke('task:retry', { taskId }),
  getTaskStats: () => ipcRenderer.invoke('task:stats'),

  // ============ Task Draft (Encrypted Storage) ============
  getTaskDraft: () => ipcRenderer.invoke('task-draft:get'),
  setTaskDraft: (draft) => ipcRenderer.invoke('task-draft:set', draft),

  // ============ 账号 ============
  listAccounts: (platform) => ipcRenderer.invoke('account:list', { platform }),
  addAccount: (params) => ipcRenderer.invoke('account:add', params),
  updateAccount: (accountId, updates) => ipcRenderer.invoke('account:update', { accountId, updates }),
  removeAccount: (accountId) => ipcRenderer.invoke('account:remove', { accountId }),
  validateAccount: (accountId) => ipcRenderer.invoke('account:validate', { accountId }),

  // ============ 分组管理 ============
  createGroup: (name, color) => ipcRenderer.invoke('group:create', { name, color }),
  updateGroup: (id, updates) => ipcRenderer.invoke('group:update', { id, ...updates }),
  deleteGroup: (groupId) => ipcRenderer.invoke('group:delete', { groupId }),
  listGroups: () => ipcRenderer.invoke('group:list'),
  getGroup: (groupId) => ipcRenderer.invoke('group:get', { groupId }),
  reorderGroups: (groups) => ipcRenderer.invoke('group:reorder', { groups }),
  getGroupAccountCount: (groupId) => ipcRenderer.invoke('group:get-account-count', { groupId }),

  // ============ 限流 ============
  getRateStatus: (platform) => ipcRenderer.invoke('rate:status', { platform }),
  checkRate: (platform) => ipcRenderer.invoke('rate:check', { platform }),
  getRateLimitStatusAll: () => ipcRenderer.invoke('rate:status-all'),

  // ============ 自动化确认 ============
  requestAutomationConfirm: (params) => ipcRenderer.invoke('automation:confirm', params),

  // ============ AI ============
  generateAI: (request) => ipcRenderer.invoke('ai:generate', request),
  iterateAI: (request) => ipcRenderer.invoke('ai:iterate', request),
  getAIProviders: () => ipcRenderer.invoke('ai:providers'),
  addAIProvider: (params) => ipcRenderer.invoke('ai:add-provider', params),
  testAIConnection: (params) => ipcRenderer.invoke('ai:test-connection', params),
  getCircuitStatus: (providerType) => ipcRenderer.invoke('ai:circuit-status', { providerType }),
  bindTaskType: (taskType, providerId) => ipcRenderer.invoke('ai:bind-task-type', { taskType, providerId }),
  getTaskTypeBindings: () => ipcRenderer.invoke('ai:get-task-type-bindings'),
  getTaskAIConfigs: () => ipcRenderer.invoke('ai:get-task-ai-configs'),
  saveTaskAIConfig: (taskType, config) => ipcRenderer.invoke('ai:save-task-ai-config', { taskType, config }),

  // ============ 选择器 ============
  getSelector: (platform, selectorKey) =>
    ipcRenderer.invoke('selector:get', { platform, selectorKey }),
  listSelectors: (platform) =>
    ipcRenderer.invoke('selector:list', { platform }),
  getSelectorVersions: (platform, selectorKey) =>
    ipcRenderer.invoke('selector:get-versions', { platform, selectorKey }),
  registerSelector: (params) => ipcRenderer.invoke('selector:register', params),
  reportSelectorSuccess: (platform, selectorKey) =>
    ipcRenderer.invoke('selector:report-success', { platform, selectorKey }),
  reportSelectorFailure: (platform, selectorKey) =>
    ipcRenderer.invoke('selector:report-failure', { platform, selectorKey }),

  // ============ Pipeline ============
  createPipeline: (params) => ipcRenderer.invoke('pipeline:create', params),
  getPipeline: (pipelineId) => ipcRenderer.invoke('pipeline:get', { pipelineId }),
  cancelPipeline: (pipelineId) => ipcRenderer.invoke('pipeline:cancel', { pipelineId }),
  onPipelineCreated: (callback) => {
    ipcRenderer.on('pipeline:created', (_, task) => callback(task));
  },
  onPipelineUpdated: (callback) => {
    ipcRenderer.on('pipeline:updated', (_, task) => callback(task));
  },

  // ============ 系统 ============
  getSystemStats: () => ipcRenderer.invoke('system:stats'),
  openDevTools: () => ipcRenderer.invoke('system:open-devtools'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (name) => ipcRenderer.invoke('app:get-path', name),

  // ============ 监控 ============
  getHealthStatus: () => ipcRenderer.invoke('monitoring:health'),
  getAlerts: (options) => ipcRenderer.invoke('monitoring:alerts', options ?? {}),
  acknowledgeAlert: (alertId) => ipcRenderer.invoke('monitoring:acknowledge-alert', { alertId }),
  getDashboardData: () => ipcRenderer.invoke('monitoring:dashboard'),
  getMetrics: (name, from, to, limit) =>
    ipcRenderer.invoke('monitoring:metrics', { name, from, to, limit }),

  // ============ 用户同意 ============
  getConsentRequired: () => ipcRenderer.invoke('get-consent-required'),
  grantConsent: () => ipcRenderer.invoke('grant-consent'),

  // ============ 设置 ============
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // ============ 数据导出/导入 ============
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: (data) => ipcRenderer.invoke('import-data', data),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),

  // ============ 事件监听 ============
  onMenuAction: (channel, callback) => {
    ipcRenderer.on(channel, callback);
  },

  onTaskCreated: (callback) => {
    ipcRenderer.on('task:created', (_event, task) => callback(task));
  },

  onTaskUpdated: (callback) => {
    ipcRenderer.on('task:updated', (_event, task) => callback(task));
  },

  onAccountAdded: (callback) => {
    ipcRenderer.on('account:added', (_event, account) => callback(account));
  },

  onAccountUpdated: (callback) => {
    ipcRenderer.on('account:updated', (_event, account) => callback(account));
  },

  onAccountRemoved: (callback) => {
    ipcRenderer.on('account:removed', (_event, data) => callback(data));
  },

  onGroupCreated: (callback) => {
    ipcRenderer.on('group:created', (_, g) => callback(g));
  },

  onGroupUpdated: (callback) => {
    ipcRenderer.on('group:updated', (_, g) => callback(g));
  },

  onGroupDeleted: (callback) => {
    ipcRenderer.on('group:deleted', (_, d) => callback(d));
  },

  onAutomationConfirmRequest: (callback) => {
    ipcRenderer.on('automation:confirm-request', (_, params) => callback(params));
  },

  sendAutomationConfirmResponse: (result) => {
    ipcRenderer.send('automation:confirm-response', result);
  },

  onAIRecommendation: (callback) => {
    ipcRenderer.on('ai:recommendation', (_, data) => callback(data));
  },

  onAIFeedback: (callback) => {
    ipcRenderer.on('ai:feedback', (_, data) => callback(data));
  },

  onAIDailyPlan: (callback) => {
    ipcRenderer.on('ai:daily-plan', (_, data) => callback(data));
  },

  onAIHotTopic: (callback) => {
    ipcRenderer.on('ai:hot-topic', (_, data) => callback(data));
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
