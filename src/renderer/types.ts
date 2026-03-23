export type Platform = 'douyin' | 'kuaishou' | 'xiaohongshu';

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'deferred';

export type TaskType =
  | 'publish'
  | 'ai_generate'
  | 'fetch_data'
  | 'automation';

export interface Task {
  id: string;
  type: TaskType;
  platform: Platform;
  status: TaskStatus;
  title: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  progress?: number;
  retryCount: number;
  maxRetries: number;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
}

export interface Account {
  id: string;
  platform: Platform;
  username: string;
  displayName: string;
  avatar?: string;
  status: 'active' | 'inactive' | 'error';
  lastUsedAt?: number;
}

export interface PlatformStats {
  platform: Platform;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  successRate: number;
}
