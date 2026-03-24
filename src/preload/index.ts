import { contextBridge, ipcRenderer } from 'electron';
import type {
  Platform, TaskType, Task, TaskFilter,
  Account, AIRequest, AIResponse,
} from '../shared/types.js';

export interface ElectronAPI {
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
  updateAccount: (accountId: string, updates: Partial<Pick<Account, 'displayName' | 'avatar' | 'status' | 'groupId' | 'tags'>>) => Promise<Account | null>;
  removeAccount: (accountId: string) => Promise<{ success: boolean }>;
  validateAccount: (accountId: string) => Promise<boolean>;

  // 分组管理
  createGroup: (name: string, color?: string) => Promise<{ id: string; name: string; color: string; sortOrder: number; createdAt: number; updatedAt: number }>;
  updateGroup: (id: string, updates: { name?: string; color?: string; sortOrder?: number }) => Promise<{ id: string; name: string; color: string; sortOrder: number; createdAt: number; updatedAt: number } | null>;
  deleteGroup: (groupId: string) => Promise<{ success: boolean }>;
  listGroups: () => Promise<Array<{ id: string; name: string; color: string; sortOrder: number; createdAt: number; updatedAt: number }>>;
  getGroup: (groupId: string) => Promise<{ id: string; name: string; color: string; sortOrder: number; createdAt: number; updatedAt: number } | null>;
  reorderGroups: (groups: { id: string; sortOrder: number }[]) => Promise<{ success: boolean }>;

  // 限流
  getRateStatus: (platform: Platform) => Promise<{
    minute: { count: number; limit: number; resetAt: number };
    hour: { count: number; limit: number; resetAt: number };
    day: { count: number; limit: number; resetAt: number };
  }>;
  checkRate: (platform: Platform) => Promise<boolean>;

  // AI
  generateAI: (request: AIRequest) => Promise<AIResponse>;
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

  // 移除监听
  removeAllListeners: (channel: string) => void;
}

const api: ElectronAPI = {
  // ============ 任务 ============
  createTask: (params) => ipcRenderer.invoke('task:create', params),
  getTask: (taskId) => ipcRenderer.invoke('task:get', { taskId }),
  listTasks: (filter) => ipcRenderer.invoke('task:list', filter ?? {}),
  cancelTask: (taskId) => ipcRenderer.invoke('task:cancel', { taskId }),
  retryTask: (taskId) => ipcRenderer.invoke('task:retry', { taskId }),
  getTaskStats: () => ipcRenderer.invoke('task:stats'),

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

  // ============ 限流 ============
  getRateStatus: (platform) => ipcRenderer.invoke('rate:status', { platform }),
  checkRate: (platform) => ipcRenderer.invoke('rate:check', { platform }),

  // ============ AI ============
  generateAI: (request) => ipcRenderer.invoke('ai:generate', request),
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

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
