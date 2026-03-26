import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 取消全局 mock，恢复真实数据库
vi.unmock('better-sqlite3');
vi.unmock('electron-log');
vi.unmock('electron');

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// 数据库 holder - 允许动态设置
const dbHolder: { db: Database.Database | null } = { db: null };

vi.mock('./db.js', () => ({
  getDb: () => {
    if (!dbHolder.db) {
      throw new Error('Database not initialized - did you forget to call setupDatabase?');
    }
    return dbHolder.db;
  },
}));

// 临时测试数据库路径
const TEST_DB_DIR = '/tmp/matrixhub-test';
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-campaign.db');

function setupDatabase(): void {
  // 确保测试目录存在
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }

  // 删除旧测试数据库
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  // 清理 WAL 文件
  const walPath = TEST_DB_PATH + '-wal';
  const shmPath = TEST_DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  // 创建真实数据库连接
  dbHolder.db = new Database(TEST_DB_PATH);
  dbHolder.db.pragma('journal_mode = WAL');

  // 初始化 campaigns schema
  dbHolder.db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      product_url TEXT,
      product_description TEXT,
      product_info TEXT DEFAULT '{}',
      content_type TEXT NOT NULL CHECK(content_type IN ('video', 'image_text')),
      add_voiceover INTEGER DEFAULT 0,
      marketing_goal TEXT NOT NULL CHECK(marketing_goal IN ('exposure', 'engagement', 'conversion')),
      target_account_ids TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'running', 'waiting_feedback', 'iterating', 'completed', 'failed')),
      current_iteration INTEGER DEFAULT 0,
      consecutive_failures INTEGER DEFAULT 0,
      last_feedback TEXT,
      latest_report TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
  `);
}

function cleanupDatabase(): void {
  if (dbHolder.db) {
    dbHolder.db.close();
    dbHolder.db = null;
  }
  // 清理测试数据库
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  const walPath = TEST_DB_PATH + '-wal';
  const shmPath = TEST_DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
}

// Import after mocking
import { createCampaign, getCampaign, listCampaigns, updateCampaignStatus, setCampaignFeedback } from './campaign-store';

describe('campaign-store', () => {
  beforeEach(() => {
    setupDatabase();
  });

  afterEach(() => {
    cleanupDatabase();
  });

  it('should create and retrieve a campaign', () => {
    const campaign = createCampaign({
      name: '测试推广',
      contentType: 'video',
      marketingGoal: 'exposure',
      targetAccountIds: ['acc-1', 'acc-2'],
      addVoiceover: false,
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.name).toBe('测试推广');
    expect(campaign.status).toBe('draft');

    const found = getCampaign(campaign.id);
    expect(found?.name).toBe('测试推广');
  });

  it('should list campaigns filtered by status', () => {
    const c1 = createCampaign({ name: '推广1', contentType: 'video', marketingGoal: 'exposure', targetAccountIds: ['a'], addVoiceover: false });
    createCampaign({ name: '推广2', contentType: 'video', marketingGoal: 'exposure', targetAccountIds: ['a'], addVoiceover: false });
    updateCampaignStatus(c1.id, 'running');

    const running = listCampaigns('running');
    expect(running).toHaveLength(1);
    expect(running[0].name).toBe('推广1');
  });

  it('should set feedback', () => {
    const campaign = createCampaign({ name: '测试', contentType: 'video', marketingGoal: 'exposure', targetAccountIds: [], addVoiceover: false });
    setCampaignFeedback(campaign.id, 'good');

    const found = getCampaign(campaign.id);
    expect(found?.lastFeedback).toBe('good');
  });
});