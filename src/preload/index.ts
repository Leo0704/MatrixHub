import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // 任务
  createTask: (params: {
    type: string;
    platform: string;
    title: string;
    payload: Record<string, unknown>;
    scheduledAt?: number;
  }) => Promise<any>;

  getTask: (taskId: string) => Promise<any>;
  listTasks: (filter?: any) => Promise<any[]>;
  cancelTask: (taskId: string) => Promise<any>;
  retryTask: (taskId: string) => Promise<any>;
  getTaskStats: () => Promise<any>;

  // 账号
  listAccounts: (platform?: string) => Promise<any[]>;
  addAccount: (params: any) => Promise<any>;
  updateAccount: (accountId: string, updates: any) => Promise<any>;
  removeAccount: (accountId: string) => Promise<any>;
  validateAccount: (accountId: string) => Promise<boolean>;

  // 限流
  getRateStatus: (platform: string) => Promise<any>;
  checkRate: (platform: string) => Promise<any>;

  // AI
  generateAI: (request: any) => Promise<any>;
  getAIProviders: () => Promise<any[]>;
  addAIProvider: (params: {
    name: string;
    type: string;
    apiKey: string;
    baseUrl: string;
    models: string[];
    isDefault?: boolean;
  }) => Promise<any>;
  getCircuitStatus: (providerType: string) => Promise<any>;

  // 选择器
  getSelector: (platform: string, selectorKey: string) => Promise<any>;
  listSelectors: (platform: string) => Promise<any[]>;
  getSelectorVersions: (platform: string, selectorKey: string) => Promise<any[]>;
  registerSelector: (params: any) => Promise<any>;
  reportSelectorSuccess: (platform: string, selectorKey: string) => Promise<any>;
  reportSelectorFailure: (platform: string, selectorKey: string) => Promise<any>;

  // 系统
  getSystemStats: () => Promise<any>;
  openDevTools: () => Promise<any>;
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string>;

  // 监控
  getHealthStatus: () => Promise<any>;
  getAlerts: (options?: { limit?: number; unacknowledgedOnly?: boolean }) => Promise<any[]>;
  acknowledgeAlert: (alertId: string) => Promise<any>;
  getDashboardData: () => Promise<any>;
  getMetrics: (name: string, from?: number, to?: number, limit?: number) => Promise<any[]>;

  // 事件监听
  onMenuAction: (channel: string, callback: () => void) => void;
  onTaskCreated: (callback: (task: any) => void) => void;
  onTaskUpdated: (callback: (task: any) => void) => void;
  onAccountAdded: (callback: (account: any) => void) => void;
  onAccountUpdated: (callback: (account: any) => void) => void;
  onAccountRemoved: (callback: (data: { accountId: string }) => void) => void;

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

  // ============ 限流 ============
  getRateStatus: (platform) => ipcRenderer.invoke('rate:status', { platform }),
  checkRate: (platform) => ipcRenderer.invoke('rate:check', { platform }),

  // ============ AI ============
  generateAI: (request) => ipcRenderer.invoke('ai:generate', request),
  getAIProviders: () => ipcRenderer.invoke('ai:providers'),
  addAIProvider: (params) => ipcRenderer.invoke('ai:add-provider', params),
  getCircuitStatus: (providerType) => ipcRenderer.invoke('ai:circuit-status', { providerType }),

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

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
