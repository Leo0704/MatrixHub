import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { getFieldEncryptor, isFieldEncrypted } from './crypto-utils.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'aimatrix.db');

  log.info(`数据库路径: ${dbPath}`);

  // 确保目录存在
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);
  migrateSensitiveFields(db);

  return db;
}

function initializeSchema(db: Database.Database): void {
  // 任务表
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('publish', 'ai_generate', 'fetch_data', 'automation')),
      platform TEXT NOT NULL CHECK(platform IN ('douyin', 'kuaishou', 'xiaohongshu')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'deferred')),
      title TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      result TEXT,
      error TEXT,
      progress INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      scheduled_at INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER DEFAULT 1,
      ai_analysis_count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_platform ON tasks(platform);
    CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
    CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
  `);

  // 向后兼容：已存在的数据库添加新列（只有列不存在时才添加）
  const tableInfo = db.pragma('table_info(tasks)') as { name: string }[];
  const hasAiAnalysisCount = tableInfo.some((col) => col.name === 'ai_analysis_count');
  if (!hasAiAnalysisCount) {
    db.exec(`ALTER TABLE tasks ADD COLUMN ai_analysis_count INTEGER DEFAULT 0`);
  }

  // 向后兼容：已存在的数据库添加新列（只有列不存在时才添加）
  const accountTableInfo = db.pragma('table_info(accounts)') as { name: string }[];
  const hasGroupId = accountTableInfo.some((col) => col.name === 'group_id');
  const hasTags = accountTableInfo.some((col) => col.name === 'tags');
  const hasCreationStatus = accountTableInfo.some((col) => col.name === 'creation_status');
  if (!hasGroupId) {
    db.exec(`ALTER TABLE accounts ADD COLUMN group_id TEXT`);
  }
  if (!hasTags) {
    db.exec(`ALTER TABLE accounts ADD COLUMN tags TEXT DEFAULT '[]'`);
  }
  if (!hasCreationStatus) {
    // 账号创建状态：pending（创建中）、complete（完成）、failed（失败）
    // 默认 'complete' 以兼容已有账号
    db.exec(`ALTER TABLE accounts ADD COLUMN creation_status TEXT DEFAULT 'complete' CHECK(creation_status IN ('pending', 'complete', 'failed'))`);
  }

  // 向后兼容：已存在的数据库添加 pipeline 相关列
  const hasPipelineId = tableInfo.some((col) => col.name === 'pipeline_id');
  const hasPipelineStatus = tableInfo.some((col) => col.name === 'pipeline_status');
  if (!hasPipelineId) {
    db.exec(`ALTER TABLE tasks ADD COLUMN pipeline_id TEXT`);
  }
  if (!hasPipelineStatus) {
    db.exec(`ALTER TABLE tasks ADD COLUMN pipeline_status TEXT CHECK(pipeline_status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))`);
  }

  // 账号分组表
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 任务检查点表（用于崩溃恢复）
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_checkpoints (
      task_id TEXT PRIMARY KEY,
      step TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      browser_state TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  // 平台账号表
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK(platform IN ('douyin', 'kuaishou', 'xiaohongshu')),
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
    CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
  `);

  // 凭证表（加密存储在 Keychain，DB 只存引用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      account_id TEXT PRIMARY KEY,
      keychain_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);

  // 限流计数表
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      reset_at INTEGER NOT NULL,
      PRIMARY KEY (key, reset_at)
    );

    CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
  `);

  // AI Provider 配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      api_key_keychain_key TEXT NOT NULL,
      base_url TEXT,
      models TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 任务类型 AI 绑定表（每个任务类型独立选择 AI Provider）
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_type_bindings (
      task_type TEXT PRIMARY KEY CHECK(task_type IN ('text', 'image', 'video', 'voice')),
      provider_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
    );
  `);

  // 任务类型 AI 配置表（存储每个任务类型的 AI 配置：Base URL + API Key + 模型）
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_ai_configs (
      task_type TEXT PRIMARY KEY CHECK(task_type IN ('text', 'image', 'video', 'voice')),
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Selector 版本表（平台 UI 元素定位器）
  db.exec(`
    CREATE TABLE IF NOT EXISTS selector_versions (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      selector_key TEXT NOT NULL,
      selector_value TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      success_rate REAL DEFAULT 1.0,
      failure_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_selectors_platform ON selector_versions(platform, selector_key);
  `);

  // 告警表
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('error', 'warning', 'info')),
      title TEXT NOT NULL,
      message TEXT,
      timestamp INTEGER NOT NULL,
      acknowledged INTEGER DEFAULT 0,
      metric_name TEXT,
      metric_value REAL
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
  `);

  // 指标表（用于时序分析）
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      tags TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON metrics(metric_name, timestamp DESC);
  `);

  // 运行时配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 用户同意表（TOS 警告确认）
  db.exec(`
    CREATE TABLE IF NOT EXISTS consent (
      version TEXT PRIMARY KEY,
      granted INTEGER NOT NULL DEFAULT 0,
      grantedAt TEXT
    );
  `);

  // 设置表（主题等配置）
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Pipeline 任务表
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_tasks (
      id TEXT PRIMARY KEY,
      input_type TEXT NOT NULL CHECK(input_type IN ('url', 'product_detail', 'hot_topic')),
      input_data TEXT NOT NULL DEFAULT '{}',
      platform TEXT NOT NULL CHECK(platform IN ('douyin', 'kuaishou', 'xiaohongshu')),
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
      steps TEXT NOT NULL DEFAULT '[]',
      current_step TEXT,
      result TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  log.info('数据库 Schema 初始化完成');
}

/**
 * 迁移敏感字段到加密存储
 * 自动加密数据库中尚未加密的敏感数据
 */
function migrateSensitiveFields(db: Database.Database): void {
  const encryptor = getFieldEncryptor();
  if (!encryptor || !encryptor.isAvailable()) {
    log.info('[DB] 字段加密器不可用，跳过敏感字段迁移');
    return;
  }

  log.info('[DB] 检查敏感字段加密状态...');

  // 1. 加密 credentials.keychain_key（如果尚未加密）
  try {
    const credentials = db.prepare('SELECT account_id, keychain_key FROM credentials').all() as { account_id: string; keychain_key: string }[];
    let encryptedCount = 0;

    for (const cred of credentials) {
      if (cred.keychain_key && !isFieldEncrypted(cred.keychain_key)) {
        const encrypted = encryptor.encrypt(cred.keychain_key);
        db.prepare('UPDATE credentials SET keychain_key = ? WHERE account_id = ?').run(encrypted, cred.account_id);
        encryptedCount++;
      }
    }

    if (encryptedCount > 0) {
      log.info(`[DB] 已加密 ${encryptedCount} 个 credentials.keychain_key 字段`);
    }
  } catch (error) {
    log.error('[DB] 加密 credentials.keychain_key 失败:', error);
  }

  // 2. 加密 ai_providers.api_key_keychain_key（如果尚未加密）
  try {
    const providers = db.prepare('SELECT id, api_key_keychain_key FROM ai_providers').all() as { id: string; api_key_keychain_key: string }[];
    let encryptedCount = 0;

    for (const provider of providers) {
      if (provider.api_key_keychain_key && !isFieldEncrypted(provider.api_key_keychain_key)) {
        const encrypted = encryptor.encrypt(provider.api_key_keychain_key);
        db.prepare('UPDATE ai_providers SET api_key_keychain_key = ? WHERE id = ?').run(encrypted, provider.id);
        encryptedCount++;
      }
    }

    if (encryptedCount > 0) {
      log.info(`[DB] 已加密 ${encryptedCount} 个 ai_providers.api_key_keychain_key 字段`);
    }
  } catch (error) {
    log.error('[DB] 加密 ai_providers.api_key_keychain_key 失败:', error);
  }

  log.info('[DB] 敏感字段加密迁移完成');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    log.info('数据库连接已关闭');
  }
}

/**
 * 解密数据库字段（便捷方法）
 */
export function decryptDbField(value: string | null): string | null {
  if (!value) return null;

  const encryptor = getFieldEncryptor();
  if (!encryptor || !isFieldEncrypted(value)) {
    return value;
  }

  return encryptor.tryDecrypt(value);
}

/**
 * 加密数据库字段（便捷方法）
 */
export function encryptDbField(value: string | null): string | null {
  if (!value) return null;

  const encryptor = getFieldEncryptor();
  if (!encryptor) return value;

  return encryptor.encrypt(value);
}

// 数据导出类型
export interface ExportData {
  accounts: Array<{
    id: string;
    platform: string;
    username: string;
    display_name: string;
    avatar: string | null;
    status: string;
    last_used_at: number | null;
    created_at: number;
    updated_at: number;
  }>;
  tasks: Array<{
    id: string;
    type: string;
    platform: string;
    status: string;
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
    version?: number;
    ai_analysis_count?: number;
  }>;
  groups: Array<{
    id: string;
    name: string;
    color: string;
    sort_order: number;
    created_at: number;
    updated_at: number;
  }>;
  selectors: Array<{
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
  }>;
}

export function exportData(): ExportData {
  const database = getDb();
  return {
    accounts: database.prepare('SELECT * FROM accounts').all() as ExportData['accounts'],
    tasks: database.prepare('SELECT * FROM tasks').all() as ExportData['tasks'],
    groups: database.prepare('SELECT * FROM account_groups').all() as ExportData['groups'],
    selectors: database.prepare('SELECT * FROM selector_versions').all() as ExportData['selectors'],
  };
}

export function importData(data: ExportData): void {
  const database = getDb();
  const tx = database.transaction(() => {
    // Clear existing data (except credentials for security)
    database.exec('DELETE FROM accounts; DELETE FROM tasks; DELETE FROM account_groups; DELETE FROM selector_versions;');

    // Re-import accounts
    const accountStmt = database.prepare(`
      INSERT INTO accounts (id, platform, username, display_name, avatar, status, last_used_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const account of data.accounts) {
      accountStmt.run(
        account.id, account.platform, account.username,
        account.display_name, account.avatar, account.status,
        account.last_used_at, account.created_at, account.updated_at
      );
    }

    // Re-import tasks
    const taskStmt = database.prepare(`
      INSERT INTO tasks (id, type, platform, status, title, payload, result, error, progress, retry_count, max_retries, scheduled_at, started_at, completed_at, created_at, updated_at, version, ai_analysis_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const task of data.tasks) {
      taskStmt.run(
        task.id, task.type, task.platform, task.status, task.title,
        task.payload, task.result, task.error, task.progress,
        task.retry_count, task.max_retries, task.scheduled_at,
        task.started_at, task.completed_at, task.created_at, task.updated_at,
        task.version ?? 1, task.ai_analysis_count ?? 0
      );
    }

    // Re-import groups
    const groupStmt = database.prepare(`
      INSERT INTO account_groups (id, name, color, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const group of data.groups) {
      groupStmt.run(
        group.id, group.name, group.color,
        group.sort_order, group.created_at, group.updated_at
      );
    }

    // Re-import selectors
    const selectorStmt = database.prepare(`
      INSERT INTO selector_versions (id, platform, selector_key, selector_value, version, is_active, success_rate, failure_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const selector of data.selectors) {
      selectorStmt.run(
        selector.id, selector.platform, selector.selector_key,
        selector.selector_value, selector.version, selector.is_active,
        selector.success_rate, selector.failure_count,
        selector.created_at, selector.updated_at
      );
    }
  });

  tx();
}
