import { getDb } from './db.js';
import type { Platform } from '../shared/types.js';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { SelectorVersionRow } from './db-types.js';
import { asRow, asRows } from './db-types.js';

export interface Selector {
  key: string;        // 唯一标识，如 'publish_button', 'login_username_input'
  value: string;       // CSS selector 或 XPath
  type: 'css' | 'xpath' | 'text' | 'aria';
  version: number;
  isActive: boolean;
  successRate: number;
  failureCount: number;
}

/**
 * 选择器版本管理器
 * - 存储多个版本的选择器
 * - 跟踪成功率
 * - 自动降级到备用选择器
 */
export class SelectorManager {
  /**
   * 注册或更新选择器
   */
  register(params: {
    platform: Platform;
    selectorKey: string;
    value: string;
    type?: 'css' | 'xpath' | 'text' | 'aria';
  }): Selector {
    const db = getDb();
    const now = Date.now();

    // 检查是否已存在
    const existing = asRow<SelectorVersionRow>(db.prepare(`
      SELECT * FROM selector_versions
      WHERE platform = ? AND selector_key = ? AND is_active = 1
      ORDER BY version DESC
      LIMIT 1
    `).get(params.platform, params.selectorKey));

    const newVersion = existing ? existing.version + 1 : 1;

    const selector: Selector = {
      key: params.selectorKey,
      value: params.value,
      type: params.type ?? 'css',
      version: newVersion,
      isActive: true,
      successRate: 1.0,
      failureCount: 0,
    };

    // 禁用旧版本
    if (existing) {
      db.prepare(`
        UPDATE selector_versions SET is_active = 0 WHERE id = ?
      `).run(existing.id);
    }

    // 插入新版本
    db.prepare(`
      INSERT INTO selector_versions (id, platform, selector_key, selector_value, version, is_active, success_rate, failure_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      params.platform,
      selector.key,
      selector.value,
      selector.version,
      selector.isActive ? 1 : 0,
      selector.successRate,
      selector.failureCount,
      now,
      now
    );

    log.info(`选择器注册: ${params.platform}:${params.selectorKey} @ v${selector.version}`);
    return selector;
  }

  /**
   * 获取当前活跃的选择器
   */
  get(platform: Platform, selectorKey: string): Selector | null {
    const db = getDb();
    const row = asRow<SelectorVersionRow>(db.prepare(`
      SELECT * FROM selector_versions
      WHERE platform = ? AND selector_key = ? AND is_active = 1
      ORDER BY version DESC
      LIMIT 1
    `).get(platform, selectorKey));

    if (!row) return null;

    return {
      key: row.selector_key,
      value: row.selector_value,
      type: row.selector_value.startsWith('//') ? 'xpath' :
            row.selector_value.startsWith('text=') || row.selector_value.startsWith('"') ? 'text' :
            row.selector_value.startsWith('aria/') ? 'aria' : 'css',
      version: row.version,
      isActive: row.is_active === 1,
      successRate: row.success_rate,
      failureCount: row.failure_count,
    };
  }

  /**
   * 获取所有备用选择器（按成功率排序）
   */
  getAllVersions(platform: Platform, selectorKey: string): Selector[] {
    const db = getDb();
    const rows = asRows<SelectorVersionRow>(db.prepare(`
      SELECT * FROM selector_versions
      WHERE platform = ? AND selector_key = ?
      ORDER BY success_rate DESC, version DESC
    `).all(platform, selectorKey));

    return rows.map(row => ({
      key: row.selector_key,
      value: row.selector_value,
      type: row.selector_value.startsWith('//') ? 'xpath' : 'css',
      version: row.version,
      isActive: row.is_active === 1,
      successRate: row.success_rate,
      failureCount: row.failure_count,
    }));
  }

  /**
   * 报告选择器使用成功
   */
  reportSuccess(platform: Platform, selectorKey: string): void {
    this.adjustSuccessRate(platform, selectorKey, 1);
  }

  /**
   * 报告选择器使用失败
   */
  reportFailure(platform: Platform, selectorKey: string): void {
    this.adjustSuccessRate(platform, selectorKey, -1);
  }

  /**
   * 调整成功率并自动降级
   */
  private adjustSuccessRate(platform: Platform, selectorKey: string, delta: number): void {
    const db = getDb();
    const now = Date.now();

    const selector = this.get(platform, selectorKey);
    if (!selector) return;

    const newFailureCount = selector.failureCount + (delta < 0 ? 1 : 0);
    // 简单移动平均
    const newSuccessRate = Math.max(0,
      selector.successRate * 0.9 + (delta > 0 ? 0.1 : -0.1)
    );

    // 如果成功率低于阈值，尝试降级
    if (newSuccessRate < 0.5) {
      log.warn(`选择器成功率过低: ${platform}:${selectorKey} (${(newSuccessRate * 100).toFixed(1)}%)`);
      this.degradeToFallback(platform, selectorKey);
      return;
    }

    db.prepare(`
      UPDATE selector_versions
      SET success_rate = ?, failure_count = ?, updated_at = ?
      WHERE platform = ? AND selector_key = ? AND is_active = 1
    `).run(newSuccessRate, newFailureCount, now, platform, selectorKey);
  }

  /**
   * 降级到备用选择器
   */
  private degradeToFallback(platform: Platform, selectorKey: string): void {
    const db = getDb();
    const now = Date.now();

    // 禁用当前选择器
    db.prepare(`
      UPDATE selector_versions
      SET is_active = 0, updated_at = ?
      WHERE platform = ? AND selector_key = ? AND is_active = 1
    `).run(now, platform, selectorKey);

    // 激活下一个最佳选择器
    const fallback = asRow<{ id: string }>(db.prepare(`
      SELECT id FROM selector_versions
      WHERE platform = ? AND selector_key = ?
      ORDER BY success_rate DESC, version DESC
      LIMIT 1
    `).get(platform, selectorKey));

    if (fallback) {
      db.prepare(`
        UPDATE selector_versions
        SET is_active = 1, updated_at = ?
        WHERE id = ?
      `).run(now, fallback.id);

      log.info(`选择器已降级: ${platform}:${selectorKey} -> v${fallback.version}`);
    } else {
      log.error(`没有可用的备用选择器: ${platform}:${selectorKey}`);
    }
  }
}

export const selectorManager = new SelectorManager();

/**
 * 预定义的选择器模板（初始种子）
 */
export const DEFAULT_SELECTORS: Record<Platform, Record<string, { css: string; xpath?: string }>> = {
  douyin: {
    'login_username': { css: '#login-name-input' },
    'login_password': { css: '#login-password-input' },
    'login_button': { css: '#login-button' },
    'publish_button': { css: '[data-e2e="upload-btn"], .upload-btn, button:has-text("发布")' },
    'title_input': { css: '[data-e2e="title-input"], .title-input, #title' },
    'content_input': { css: '[data-e2e="content-input"], .content-editor, #content' },
    'publish_confirm': { css: 'button:has-text("确认发布"), .confirm-publish-btn' },
    'login_state': { css: '[data-e2e="user-info"], .user-info, [class*="avatar"]' },
  },
  kuaishou: {
    'login_username': { css: '[name="account"], .account-input' },
    'login_password': { css: '[name="password"], .password-input' },
    'login_button': { css: 'button[type="submit"], .login-btn' },
    'publish_button': { css: '.upload-btn, button:has-text("上传作品")' },
    'title_input': { css: '[data-vv-scope="title"], .title-input' },
    'content_input': { css: '.content-editor, textarea' },
    'publish_confirm': { css: 'button:has-text("发布"), .confirm-btn' },
    'login_state': { css: '[class*="user-info"], [class*="avatar"]' },
  },
  xiaohongshu: {
    'login_username': { css: '[placeholder*="手机"]' },
    'login_password': { css: '[placeholder*="密码"]' },
    'login_button': { css: 'button:has-text("登录")' },
    'publish_button': { css: '[class*="publish"], button:has-text("发布笔记")' },
    'title_input': { css: '[class*="title"] input, [data-placeholder*="标题"]' },
    'content_input': { css: '[class*="editor"], [class*="content"] textarea' },
    'publish_confirm': { css: 'button:has-text("发布"), [class*="confirm"]' },
    'login_state': { css: '[class*="avatar"], [class*="user-info"]' },
  },
};
