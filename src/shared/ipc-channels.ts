// IPC Channel 枚举 — 所有 channel 名称统一在此定义，消除魔数字符串
export const IpcChannel = {
  // Task
  TASK_CREATE: 'task:create',
  TASK_GET: 'task:get',
  TASK_LIST: 'task:list',
  TASK_CANCEL: 'task:cancel',
  TASK_RETRY: 'task:retry',
  TASK_STATS: 'task:stats',
  TASK_DRAFT_GET: 'task-draft:get',
  TASK_DRAFT_SET: 'task-draft:set',

  // Account
  ACCOUNT_LIST: 'account:list',
  ACCOUNT_ADD: 'account:add',
  ACCOUNT_UPDATE: 'account:update',
  ACCOUNT_REMOVE: 'account:remove',
  ACCOUNT_VALIDATE: 'account:validate',

  // Group
  GROUP_CREATE: 'group:create',
  GROUP_UPDATE: 'group:update',
  GROUP_DELETE: 'group:delete',
  GROUP_LIST: 'group:list',
  GROUP_GET: 'group:get',
  GROUP_REORDER: 'group:reorder',
  GROUP_GET_ACCOUNT_COUNT: 'group:get-account-count',

  // Rate
  RATE_STATUS: 'rate:status',
  RATE_CHECK: 'rate:check',
  RATE_STATUS_ALL: 'rate:status-all',

  // AI
  AI_GENERATE: 'ai:generate',
  AI_ITERATE: 'ai:iterate',
  AI_PROVIDERS: 'ai:providers',
  AI_ADD_PROVIDER: 'ai:add-provider',
  AI_TEST_CONNECTION: 'ai:test-connection',
  AI_CIRCUIT_STATUS: 'ai:circuit-status',
  AI_BIND_TASK_TYPE: 'ai:bind-task-type',
  AI_GET_TASK_TYPE_BINDINGS: 'ai:get-task-type-bindings',
  AI_GET_TASK_AI_CONFIGS: 'ai:get-task-ai-configs',
  AI_SAVE_TASK_AI_CONFIG: 'ai:save-task-ai-config',
  AI_ANALYZE_FAILURE: 'ai:analyze-failure',
  AI_DAILY_BRIEFING: 'ai:daily-briefing',
  AI_HOT_TOPICS: 'ai:hot-topics',
  AI_ANALYZE_NOW: 'ai:analyze-now',

  // Consent
  GET_CONSENT_REQUIRED: 'get-consent-required',
  GRANT_CONSENT: 'grant-consent',

  // System
  SYSTEM_STATS: 'system:stats',
  SYSTEM_OPEN_DEVTOOLS: 'system:open-devtools',

  // Monitoring
  MONITORING_HEALTH: 'monitoring:health',
  MONITORING_ALERTS: 'monitoring:alerts',
  MONITORING_ACKNOWLEDGE_ALERT: 'monitoring:acknowledge-alert',
  MONITORING_DASHBOARD: 'monitoring:dashboard',
  MONITORING_METRICS: 'monitoring:metrics',
  MONITORING_COLLECT: 'monitoring:collect',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  CONFIG_RESET: 'config:reset',
  CONFIG_RELOAD: 'config:reload',

  // Settings
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',

  // Export/Import
  EXPORT_DATA: 'export-data',
  IMPORT_DATA: 'import-data',
  CLEAR_ALL_DATA: 'clear-all-data',

  // Fetch
  FETCH_HOT_TOPICS: 'fetch:hot-topics',

  // Pipeline
  PIPELINE_CREATE: 'pipeline:create',
  PIPELINE_GET: 'pipeline:get',
  PIPELINE_CANCEL: 'pipeline:cancel',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

// IPC 超时配置 (ms)
export const IPC_TIMEOUT_MS = 30000;

// IPC channel 版本 — 每次接口不兼容变更时递增
// 主进程和渲染进程可对比版本，不匹配时输出警告
export const IPC_CHANNEL_VERSION = 1;
