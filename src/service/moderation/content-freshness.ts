/**
 * 内容新鲜度管理（设计文档第22节）
 *
 * 每次迭代生成的内容必须不同于历史版本，避免平台内容去重拦截。
 * AI 记录已使用过的文案/图片特征，新内容需有明显差异。
 */
import { getDb } from '../db.js';
import { aiGateway } from '../ai-gateway.js';
import log from 'electron-log';

// 内容历史记录（DB 行格式）
interface ContentHistoryRow {
  id: number;
  campaign_id: string;
  account_id: string;
  iteration: number;
  content_hash: string;
  image_hashes: string;
  text_preview: string;
  created_at: number;
}

// 相似度检测结果
export interface FreshnessResult {
  isFresh: boolean;         // 是否是全新内容
  similarityScore: number;  // 相似度 0-1
  reasons: string[];        // 相似原因
  suggestions: string[];    // 改进建议
}

/**
 * 计算文本 hash（用于快速比对）
 */
function computeTextHash(text: string): string {
  // 简单 hash：去除标点、空格、emoji后取前100字的编码和
  const normalized = text.replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 100);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 计算图片 hash（简化版：取 URL 的 hash）
 */
function computeImageHashes(imageUrls: string[]): string[] {
  return imageUrls.map(url => {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash) + url.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  });
}

/**
 * 检查内容新鲜度
 * 设计文档第22节：避免与历史版本重复
 */
export async function checkContentFreshness(
  campaignId: string,
  text: string,
  imageUrls: string[]
): Promise<FreshnessResult> {
  const textHash = computeTextHash(text);
  const imageHashes = computeImageHashes(imageUrls);

  // 查询历史记录
  const db = getDb();
  const history = db.prepare(`
    SELECT * FROM campaign_content_history
    WHERE campaign_id = ? AND iteration < (
      SELECT MAX(iteration) FROM campaign_content_history WHERE campaign_id = ?
    )
    ORDER BY iteration DESC
    LIMIT 5
  `).all(campaignId, campaignId) as ContentHistoryRow[];

  if (history.length === 0) {
    return { isFresh: true, similarityScore: 0, reasons: [], suggestions: [] };
  }

  const reasons: string[] = [];
  const suggestions: string[] = [];

  // 检查文案相似度
  for (const entry of history) {
    if (entry.content_hash === textHash) {
      reasons.push(`文案与第 ${entry.iteration} 轮高度相似`);
      suggestions.push('换个角度重新表达同一卖点');
    }

    // 检查文案前20字是否相同（开场白重复）
    const currentOpening = text.slice(0, 20);
    if (entry.text_preview && entry.text_preview.slice(0, 20) === currentOpening) {
      reasons.push('开场白与历史版本相似');
      suggestions.push('更换开场白方式，如用提问、数据、场景切入');
    }
  }

  // 检查图片相似度
  for (const entry of history) {
    try {
      const previousImages: string[] = JSON.parse(entry.image_hashes || '[]');
      const overlap = previousImages.filter(img => imageHashes.includes(img));
      if (overlap.length > 0) {
        reasons.push(`使用了 ${overlap.length} 张历史图片`);
        suggestions.push('使用不同的产品图片或角度');
      }
    } catch {
      // 解析失败，忽略
    }
  }

  const similarityScore = reasons.length > 0 ? Math.min(0.9, 0.3 + reasons.length * 0.2) : 0;
  const isFresh = reasons.length === 0 || similarityScore < 0.5;

  return { isFresh, similarityScore, reasons, suggestions };
}

/**
 * AI 重新生成差异化内容
 * 当内容与历史版本相似时调用
 */
export async function regenerateWithFreshness(
  originalText: string,
  imageUrls: string[],
  suggestions: string[]
): Promise<{ text?: string; images?: string[]; error?: string }> {
  const prompt = `请重新生成一条抖音文案，要求：
1. 核心信息不变，但表达方式完全不同
2. 避免与以下历史内容重复：
${suggestions.map(s => `   - ${s}`).join('\n')}
3. 保持抖音风格，有吸引力
4. 不要出现违规词汇

原文参考：
${originalText.slice(0, 200)}...

直接输出新文案，不要加前缀说明。`;

  try {
    const result = await aiGateway.generate({
      taskType: 'text',
      prompt,
    });

    if (result.content) {
      return { text: result.content };
    }
    return { error: 'AI 生成失败' };
  } catch (e) {
    log.warn('[ContentFreshness] AI 重新生成失败:', e);
    return { error: String(e) };
  }
}

/**
 * 记录生成的内容到历史
 */
export function recordContent(
  campaignId: string,
  accountId: string,
  iteration: number,
  text: string,
  imageUrls: string[]
): void {
  const db = getDb();
  const textHash = computeTextHash(text);
  const imageHashes = computeImageHashes(imageUrls);

  db.prepare(`
    INSERT INTO campaign_content_history (campaign_id, account_id, iteration, content_hash, image_hashes, text_preview, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    campaignId,
    accountId,
    iteration,
    textHash,
    JSON.stringify(imageHashes),
    text.slice(0, 50),
    Date.now()
  );
}

/**
 * 初始化内容历史表
 */
export function initializeContentHistoryTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_content_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      iteration INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      image_hashes TEXT NOT NULL DEFAULT '[]',
      text_preview TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(campaign_id, account_id, iteration)
    );
    CREATE INDEX IF NOT EXISTS idx_content_history_campaign ON campaign_content_history(campaign_id);
  `);
}
