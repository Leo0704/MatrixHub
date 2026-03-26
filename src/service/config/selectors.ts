/**
 * 平台选择器配置
 * 包含发布表单选择器和自动化操作选择器
 */
import type { Platform } from '../../shared/types.js';

// ============ 发布表单选择器 ============

export interface SelectorItem {
  value: string;
  type?: string;
}

const PUBLISH_SELECTORS: Record<Platform, Record<string, string[]>> = {
  douyin: {
    title_input: ['[data-e2e="title-input"]', '#title', 'input[placeholder*="标题"]', 'textarea'],
    content_input: ['[data-e2e="content-input"]', '.content-editor', 'textarea[placeholder*="正文"]'],
    video_input: ['[data-e2e="upload-input"]', 'input[type="file"]', '.upload-btn input'],
    publish_confirm: ['[data-e2e="publish-btn"]', 'button:has-text("发布")', '.confirm-btn'],
    login_state: ['[data-e2e="user-info"]', '.user-info', '[class*="avatar"]'],
  },
};

// ============ 自动化操作选择器 ============

const AUTO_SELECTORS: Record<string, Record<string, string[]>> = {
  douyin: {
    comment_item: ['[data-e2e="comment-item"]', '.comment-item', '[class*="comment"]'],
    comment_input: ['[data-e2e="comment-input"]', 'input[placeholder*="说点什么"]', 'textarea'],
    like_button: ['[data-e2e="like-icon"]', '[class*="like"]', '.heart-icon'],
    follow_button: ['[data-e2e="follow"]', 'button:has-text("关注")', '[class*="follow"]'],
    video_item: ['[data-e2e="video-item"]', '.video-item', '[class*="feed"] > div'],
    video_like: ['[data-e2e="like"]', '[class*="like-btn"]', 'button:has-text("赞")'],
  },
};

// ============ 平台 URL 配置 ============

export const PLATFORM_BASE_URLS: Record<Platform, string> = {
  douyin: 'https://www.douyin.com',
};

export const PUBLISH_URLS: Record<Platform, string> = {
  douyin: 'https://creator.douyin.com/content/upload',
};

// ============ 自动化页面路径 ============

export const AUTOMATION_PATHS: Record<Platform, Record<string, string>> = {
  douyin: {
    self_posts: '/user/self/posts',
    recommend: '/recommend',
    comments: '/user/self/comments',
  },
};

// ============ 导出函数 ============

/**
 * 获取发布表单选择器
 */
export function getPublishSelectors(platform: Platform, key: string): SelectorItem[] {
  const selectors = PUBLISH_SELECTORS[platform]?.[key] || [];
  return selectors.map(s => ({ value: s }));
}

/**
 * 获取自动化操作选择器
 */
export function getAutoSelectors(platform: Platform, key: string): SelectorItem[] {
  const selectors = AUTO_SELECTORS[platform]?.[key] || [];
  return selectors.map(s => ({ value: s }));
}

/**
 * 获取平台基础 URL
 */
export function getBaseUrl(platform: Platform): string {
  return PLATFORM_BASE_URLS[platform];
}

/**
 * 获取发布页 URL
 */
export function getPublishUrl(platform: Platform): string {
  return PUBLISH_URLS[platform];
}
