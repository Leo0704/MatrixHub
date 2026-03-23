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
  | 'automation';  // 浏览器自动化

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

export interface Account {
  id: string;
  platform: Platform;
  username: string;
  displayName: string;
  avatar?: string;
  status: 'active' | 'inactive' | 'error';
  lastUsedAt?: number;
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
  providerType?: 'openai' | 'anthropic' | 'ollama' | 'zhipu';
  model?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

// AI 生成响应
export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  tokensUsed?: number;
}
