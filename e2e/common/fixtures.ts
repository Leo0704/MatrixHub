import { test as base, Page } from '@playwright/test';

/**
 * 测试账号数据
 */
export const testAccounts = {
  douyin: {
    username: 'e2e_douyin_test',
    password: 'Test123456',
    displayName: '抖音测试账号',
    platform: 'douyin' as const,
  },
  kuaishou: {
    username: 'e2e_kuaishou_test',
    password: 'Test123456',
    displayName: '快手测试账号',
    platform: 'kuaishou' as const,
  },
  xiaohongshu: {
    username: 'e2e_xhs_test',
    password: 'Test123456',
    displayName: '小红书测试账号',
    platform: 'xiaohongshu' as const,
  },
};

/**
 * 测试分组数据
 */
export const testGroups = [
  { name: 'E2E测试分组A', color: '#6366f1' },
  { name: 'E2E测试分组B', color: '#ec4899' },
];

/**
 * AI 测试数据
 */
export const aiTestData = {
  shortTopic: '如何制作美味的咖啡',
  longTopic: '这是一个非常长的话题，用于测试输入框是否能够正确处理长文本内容的输入和显示，特别关注文本截断和换行处理机制',
};

/**
 * 扩展 Playwright test 类型
 */
export { base as test };

/**
 * 创建随机后缀用于测试数据唯一性
 */
export function uniqueId(prefix: string = 'e2e'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * 随机选择一个数组元素
 */
export function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
