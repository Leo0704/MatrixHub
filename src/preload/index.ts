import { contextBridge, ipcRenderer } from 'electron';
import type { Platform, Task, TaskFilter, AITriggerType } from '../shared/types.js';
import { IpcChannel, IPC_CHANNEL_VERSION } from '../shared/ipc-channels.js';
import type { ElectronAPI, TaskDraft, GroupEvent, ExportData, ImportData } from '../shared/ipc-api.js';

const api: ElectronAPI = {
  // ============ 热点话题 ============
  fetchHotTopics: (platform) => ipcRenderer.invoke(IpcChannel.FETCH_HOT_TOPICS, { platform }),

  // ============ 任务 ============
  createTask: (params) => ipcRenderer.invoke(IpcChannel.TASK_CREATE, params),
  getTask: (taskId) => ipcRenderer.invoke(IpcChannel.TASK_GET, { taskId }),
  listTasks: (filter) => ipcRenderer.invoke(IpcChannel.TASK_LIST, filter ?? {}),
  cancelTask: (taskId) => ipcRenderer.invoke(IpcChannel.TASK_CANCEL, { taskId }),
  retryTask: (taskId) => ipcRenderer.invoke(IpcChannel.TASK_RETRY, { taskId }),
  getTaskStats: () => ipcRenderer.invoke(IpcChannel.TASK_STATS),

  // ============ Task Draft (Encrypted Storage) ============
  getTaskDraft: () => ipcRenderer.invoke(IpcChannel.TASK_DRAFT_GET),
  setTaskDraft: (draft) => ipcRenderer.invoke(IpcChannel.TASK_DRAFT_SET, draft),

  // ============ 账号 ============
  listAccounts: (platform) => ipcRenderer.invoke(IpcChannel.ACCOUNT_LIST, { platform }),
  addAccount: (params) => ipcRenderer.invoke(IpcChannel.ACCOUNT_ADD, params),
  updateAccount: (accountId, updates) => ipcRenderer.invoke(IpcChannel.ACCOUNT_UPDATE, { accountId, updates }),
  removeAccount: (accountId) => ipcRenderer.invoke(IpcChannel.ACCOUNT_REMOVE, { accountId }),
  validateAccount: (accountId) => ipcRenderer.invoke(IpcChannel.ACCOUNT_VALIDATE, { accountId }),

  // ============ 分组管理 ============
  createGroup: (name, color) => ipcRenderer.invoke(IpcChannel.GROUP_CREATE, { name, color }),
  updateGroup: (id, updates) => ipcRenderer.invoke(IpcChannel.GROUP_UPDATE, { id, ...updates }),
  deleteGroup: (groupId) => ipcRenderer.invoke(IpcChannel.GROUP_DELETE, { groupId }),
  listGroups: () => ipcRenderer.invoke(IpcChannel.GROUP_LIST),
  getGroup: (groupId) => ipcRenderer.invoke(IpcChannel.GROUP_GET, { groupId }),
  reorderGroups: (groups) => ipcRenderer.invoke(IpcChannel.GROUP_REORDER, { groups }),
  getGroupAccountCount: (groupId) => ipcRenderer.invoke(IpcChannel.GROUP_GET_ACCOUNT_COUNT, { groupId }),

  // ============ 限流 ============
  getRateStatus: (platform) => ipcRenderer.invoke(IpcChannel.RATE_STATUS, { platform }),
  checkRate: (platform) => ipcRenderer.invoke(IpcChannel.RATE_CHECK, { platform }),
  getRateLimitStatusAll: () => ipcRenderer.invoke(IpcChannel.RATE_STATUS_ALL),

  // ============ AI ============
  generateAI: (request) => ipcRenderer.invoke(IpcChannel.AI_GENERATE, request),
  iterateAI: (request) => ipcRenderer.invoke(IpcChannel.AI_ITERATE, request),
  getAIProviders: () => ipcRenderer.invoke(IpcChannel.AI_PROVIDERS),
  addAIProvider: (params) => ipcRenderer.invoke(IpcChannel.AI_ADD_PROVIDER, params),
  testAIConnection: (params) => ipcRenderer.invoke(IpcChannel.AI_TEST_CONNECTION, params),
  getCircuitStatus: (providerType) => ipcRenderer.invoke(IpcChannel.AI_CIRCUIT_STATUS, { providerType }),
  bindTaskType: (taskType, providerId) => ipcRenderer.invoke(IpcChannel.AI_BIND_TASK_TYPE, { taskType, providerId }),
  getTaskTypeBindings: () => ipcRenderer.invoke(IpcChannel.AI_GET_TASK_TYPE_BINDINGS),
  getTaskAIConfigs: () => ipcRenderer.invoke(IpcChannel.AI_GET_TASK_AI_CONFIGS),
  saveTaskAIConfig: (taskType, config) => ipcRenderer.invoke(IpcChannel.AI_SAVE_TASK_AI_CONFIG, { taskType, config }),
  dailyBriefing: (platform: Platform) => ipcRenderer.invoke(IpcChannel.AI_DAILY_BRIEFING, { platform }),
  hotTopics: (platform: Platform) => ipcRenderer.invoke(IpcChannel.AI_HOT_TOPICS, { platform }),
  analyzeNow: (type: AITriggerType, platform: Platform, taskId?: string) =>
    ipcRenderer.invoke(IpcChannel.AI_ANALYZE_NOW, { type, platform, taskId }),
  analyzeFailure: (taskId: string) => ipcRenderer.invoke(IpcChannel.AI_ANALYZE_FAILURE, { taskId }),

  // ============ Pipeline ============
  createPipeline: (params) => ipcRenderer.invoke(IpcChannel.PIPELINE_CREATE, params),
  getPipeline: (pipelineId) => ipcRenderer.invoke(IpcChannel.PIPELINE_GET, { pipelineId }),
  cancelPipeline: (pipelineId) => ipcRenderer.invoke(IpcChannel.PIPELINE_CANCEL, { pipelineId }),
  onPipelineCreated: (callback) => {
    ipcRenderer.on('pipeline:created', (_, task) => callback(task));
  },
  onPipelineUpdated: (callback) => {
    ipcRenderer.on('pipeline:updated', (_, task) => callback(task));
  },

  // ============ 系统 ============
  getIpcChannelVersion: () => IPC_CHANNEL_VERSION,
  getSystemStats: () => ipcRenderer.invoke(IpcChannel.SYSTEM_STATS),
  openDevTools: () => ipcRenderer.invoke(IpcChannel.SYSTEM_OPEN_DEVTOOLS),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (name) => ipcRenderer.invoke('app:get-path', name),

  // ============ 监控 ============
  getHealthStatus: () => ipcRenderer.invoke(IpcChannel.MONITORING_HEALTH),
  getAlerts: (options) => ipcRenderer.invoke(IpcChannel.MONITORING_ALERTS, options ?? {}),
  acknowledgeAlert: (alertId) => ipcRenderer.invoke(IpcChannel.MONITORING_ACKNOWLEDGE_ALERT, { alertId }),
  getDashboardData: () => ipcRenderer.invoke(IpcChannel.MONITORING_DASHBOARD),
  getMetrics: (name, from, to, limit) =>
    ipcRenderer.invoke(IpcChannel.MONITORING_METRICS, { name, from, to, limit }),

  // ============ 用户同意 ============
  getConsentRequired: () => ipcRenderer.invoke(IpcChannel.GET_CONSENT_REQUIRED),
  grantConsent: () => ipcRenderer.invoke(IpcChannel.GRANT_CONSENT),

  // ============ 设置 ============
  getSettings: () => ipcRenderer.invoke(IpcChannel.GET_SETTINGS),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannel.SAVE_SETTINGS, settings),

  // ============ 数据导出/导入 ============
  exportData: () => ipcRenderer.invoke(IpcChannel.EXPORT_DATA),
  importData: (data) => ipcRenderer.invoke(IpcChannel.IMPORT_DATA, data),
  clearAllData: () => ipcRenderer.invoke(IpcChannel.CLEAR_ALL_DATA),

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

  // Campaign 事件监听
  onCampaignStarted: (callback) => {
    ipcRenderer.on('campaign:started', (_, data) => callback(data));
  },

  onCampaignUpdated: (callback) => {
    ipcRenderer.on('campaign:updated', (_, data) => callback(data));
  },

  onCampaignReportReady: (callback) => {
    ipcRenderer.on('campaign:report-ready', (_, data) => callback(data));
  },

  onCampaignContinued: (callback) => {
    ipcRenderer.on('campaign:continued', (_, data) => callback(data));
  },

  onCampaignIterating: (callback) => {
    ipcRenderer.on('campaign:iterating', (_, data) => callback(data));
  },

  onCampaignFailed: (callback) => {
    ipcRenderer.on('campaign:failed', (_, data) => callback(data));
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

  // ============ Campaign ============
  campaign_launch: (params: {
    name: string;
    productUrl?: string;
    productDescription?: string;
    contentType: 'video' | 'image_text';
    addVoiceover: boolean;
    marketingGoal: 'exposure' | 'engagement' | 'conversion';
    targetAccountIds: string[];
  }) => ipcRenderer.invoke('campaign:launch', params),

  campaign_get: (campaignId: string) =>
    ipcRenderer.invoke('campaign:get', campaignId),

  campaign_list: (status?: string) =>
    ipcRenderer.invoke('campaign:list', status),

  campaign_feedback: (campaignId: string, feedback: 'good' | 'bad') =>
    ipcRenderer.invoke('campaign:feedback', campaignId, feedback),

  campaign_cancel: (campaignId: string) =>
    ipcRenderer.invoke('campaign:cancel', campaignId),

  scrape_product: (url: string) =>
    ipcRenderer.invoke('campaign:scrape', url),

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
