import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

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

  log.info('数据库 Schema 初始化完成');
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    log.info('数据库连接已关闭');
  }
}
