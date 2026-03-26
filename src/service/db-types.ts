/**
 * Database Row Types for better-sqlite3 queries
 * Replaces `as any` casts with properly typed rows
 */

export interface TaskRow {
  id: string;
  type: 'publish' | 'ai_generate' | 'fetch_data' | 'automation';
  platform: 'douyin' | 'kuaishou' | 'xiaohongshu';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'deferred';
  title: string;
  payload: string;
  result: string | null;
  error: string | null;
  progress: number;
  retry_count: number;
  max_retries: number;
  scheduled_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
  version: number;
  ai_analysis_count: number;
  pipeline_id: string | null;
  pipeline_status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | null;
}

export interface TaskCheckpointRow {
  task_id: string;
  step: string;
  payload: string;
  browser_state: string | null;
  created_at: number;
}

export interface AccountRow {
  id: string;
  platform: 'douyin' | 'kuaishou' | 'xiaohongshu';
  username: string;
  display_name: string;
  avatar: string | null;
  status: 'active' | 'inactive' | 'error';
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
  group_id: string | null;
  tags: string;
  creation_status: 'pending' | 'complete' | 'failed';
}

export interface AccountGroupRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface CredentialRow {
  account_id: string;
  keychain_key: string;
  created_at: number;
  updated_at: number;
}

export interface RateLimitRow {
  key: string;
  count: number;
  reset_at: number;
}

export interface AiProviderRow {
  id: string;
  name: string;
  provider_type: string;
  api_key_keychain_key: string;
  base_url: string | null;
  models: string;
  is_default: number;
  status: 'active' | 'inactive' | 'error';
  created_at: number;
  updated_at: number;
}

export interface SelectorVersionRow {
  id: string;
  platform: string;
  selector_key: string;
  selector_value: string;
  version: number;
  is_active: number;
  success_rate: number;
  failure_count: number;
  created_at: number;
  updated_at: number;
}

export interface AlertRow {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string | null;
  timestamp: number;
  acknowledged: number;
  metric_name: string | null;
  metric_value: number | null;
}

export interface MetricRow {
  id: string;
  metric_name: string;
  value: number;
  tags: string | null;
  timestamp: number;
}

export interface PipelineTaskRow {
  id: string;
  input_type: 'url' | 'product_detail' | 'hot_topic';
  input_data: string;
  platform: 'douyin' | 'kuaishou' | 'xiaohongshu';
  config: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: string;
  current_step: string | null;
  result: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

/** Helper type for getting a single row */
export type Row<T> = T extends Array<infer U> ? U : T;

/** Helper to cast database query results */
export function asRow<T>(row: unknown): T {
  return row as T;
}

export function asRows<T>(rows: unknown): T[] {
  return rows as T[];
}
