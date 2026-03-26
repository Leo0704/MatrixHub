import { getDb } from './db.js';
import type { Campaign, CampaignStatus, CampaignReport, ContentType, MarketingGoal } from '../shared/types.js';
import { randomUUID } from 'crypto';

interface CampaignRow {
  id: string;
  name: string;
  product_url: string | null;
  product_description: string | null;
  product_info: string;
  content_type: string;
  add_voiceover: number;
  marketing_goal: string;
  target_account_ids: string;
  status: string;
  current_iteration: number;
  consecutive_failures: number;
  last_feedback: string | null;
  latest_report: string | null;
  monitor_started_at: number;
  monitor_points_completed: number;
  created_at: number;
  updated_at: number;
}

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    productUrl: row.product_url ?? undefined,
    productDescription: row.product_description ?? undefined,
    productInfo: row.product_info ? JSON.parse(row.product_info) : undefined,
    contentType: row.content_type as ContentType,
    addVoiceover: Boolean(row.add_voiceover),
    marketingGoal: row.marketing_goal as MarketingGoal,
    targetAccountIds: JSON.parse(row.target_account_ids),
    status: row.status as CampaignStatus,
    currentIteration: row.current_iteration,
    consecutiveFailures: row.consecutive_failures,
    lastFeedback: row.last_feedback as 'good' | 'bad' | undefined,
    latestReport: row.latest_report ? JSON.parse(row.latest_report) : undefined,
    monitorStartedAt: row.monitor_started_at || undefined,
    monitorPointsCompleted: row.monitor_points_completed || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCampaign(data: {
  name: string;
  productUrl?: string;
  productDescription?: string;
  productInfo?: Campaign['productInfo'];
  contentType: ContentType;
  addVoiceover: boolean;
  marketingGoal: MarketingGoal;
  targetAccountIds: string[];
}): Campaign {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO campaigns (id, name, product_url, product_description, product_info, content_type, add_voiceover, marketing_goal, target_account_ids, status, current_iteration, consecutive_failures, monitor_started_at, monitor_points_completed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, 0, 0, 0, ?, ?)
  `).run(
    id,
    data.name,
    data.productUrl ?? null,
    data.productDescription ?? null,
    JSON.stringify(data.productInfo ?? {}),
    data.contentType,
    data.addVoiceover ? 1 : 0,
    data.marketingGoal,
    JSON.stringify(data.targetAccountIds),
    now,
    now
  );

  return getCampaign(id)!;
}

export function getCampaign(id: string): Campaign | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as CampaignRow | undefined;
  return row ? rowToCampaign(row) : null;
}

export function listCampaigns(status?: CampaignStatus): Campaign[] {
  const db = getDb();
  const query = status
    ? 'SELECT * FROM campaigns WHERE status = ? ORDER BY created_at DESC'
    : 'SELECT * FROM campaigns ORDER BY created_at DESC';
  const rows = (status ? db.prepare(query).all(status) : db.prepare(query).all()) as CampaignRow[];
  return rows.map(rowToCampaign);
}

export function updateCampaignStatus(id: string, status: CampaignStatus): void {
  const db = getDb();
  db.prepare('UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
}

export function updateCampaignIteration(id: string, iteration: number, consecutiveFailures: number): void {
  const db = getDb();
  db.prepare('UPDATE campaigns SET current_iteration = ?, consecutive_failures = ?, updated_at = ? WHERE id = ?')
    .run(iteration, consecutiveFailures, Date.now(), id);
}

export function saveCampaignReport(id: string, report: CampaignReport): void {
  const db = getDb();
  db.prepare('UPDATE campaigns SET latest_report = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(report), Date.now(), id);
}

export function setCampaignFeedback(id: string, feedback: 'good' | 'bad'): void {
  const db = getDb();
  db.prepare('UPDATE campaigns SET last_feedback = ?, updated_at = ? WHERE id = ?')
    .run(feedback, Date.now(), id);
}

export function updateCampaignMonitoring(id: string, monitorStartedAt: number, monitorPointsCompleted: number): void {
  const db = getDb();
  db.prepare('UPDATE campaigns SET monitor_started_at = ?, monitor_points_completed = ?, updated_at = ? WHERE id = ?')
    .run(monitorStartedAt, monitorPointsCompleted, Date.now(), id);
}