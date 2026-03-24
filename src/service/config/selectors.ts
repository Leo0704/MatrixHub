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
  kuaishou: {
    title_input: ['[data-vv-scope="title"]', 'input[name="title"]', '.title-input'],
    content_input: ['textarea[name="content"]', '.content-editor', 'textarea'],
    video_input: ['input[type="file"]', '.upload-btn input', '[class*="upload"] input'],
    publish_confirm: ['button:has-text("发布")', '.confirm-btn', '[class*="publish"]'],
    login_state: ['[class*="user-info"]', '[class*="avatar"]', '.profile'],
  },
  xiaohongshu: {
    title_input: ['[class*="title"] input', 'input[placeholder*="标题"]', '#title'],
    content_input: ['[class*="editor"] textarea', '[class*="content"] textarea', 'textarea'],
    image_input: ['input[type="file"]', '[class*="upload"] input', '.image-upload input'],
    publish_confirm: ['button:has-text("发布")', '[class*="confirm"]', '.publish-btn'],
    login_state: ['[class*="avatar"]', '[class*="user-info"]', '.user-header'],
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
  kuaishou: {
    comment_item: ['[class*="comment-item"]', '.comment-item'],
    comment_input: ['textarea[placeholder*="说点什么"]', 'input[class*="comment"]'],
    like_button: ['[class*="like-btn"]', '.heart-icon', 'button:has-text("赞")'],
    follow_button: ['button:has-text("关注")', '[class*="follow"]'],
    video_item: ['[class*="video-item"]', '.feeds-item'],
    video_like: ['[class*="like-icon"]', 'button:has-text("赞")'],
  },
  xiaohongshu: {
    comment_item: ['[class*="comment-item"]', '.comment-item'],
    comment_input: ['textarea[placeholder*="说点什么"]', '[class*="input"] textarea'],
    like_button: ['[class*="like"]', '.heart-icon', 'button:has-text("收藏")]'],
    follow_button: ['button:has-text("关注")', '[class*="follow"]'],
    note_item: ['[class*="note-item"]', '[class*="card"]'],
    note_like: ['[class*="like-icon"]', 'button:has-text("赞")'],
  },
};

// ============ 平台 URL 配置 ============

export const PLATFORM_BASE_URLS: Record<Platform, string> = {
  douyin: 'https://www.douyin.com',
  kuaishou: 'https://www.kuaishou.com',
  xiaohongshu: 'https://www.xiaohongshu.com',
};

export const PUBLISH_URLS: Record<Platform, string> = {
  douyin: 'https://creator.douyin.com/content/upload',
  kuaishou: 'https://cp.kuaishou.com/interaction/long-video/upload',
  xiaohongshu: 'https://creator.xiaohongshu.com/publish',
};

// ============ 自动化页面路径 ============

export const AUTOMATION_PATHS: Record<Platform, Record<string, string>> = {
  douyin: {
    self_posts: '/user/self/posts',
    recommend: '/recommend',
    comments: '/user/self/comments',
  },
  kuaishou: {
    profile: '/profile',
    discovery: '/discovery',
    comments: '/profile/comments',
  },
  xiaohongshu: {
    profile: '/user/profile',
    discovery: '/discovery/recommend',
    comments: '/user/comments',
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
