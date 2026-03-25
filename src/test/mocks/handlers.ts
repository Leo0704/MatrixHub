import { vi } from 'vitest';

/**
 * Mock factory functions for handler tests.
 * These provide consistent mock objects for testing various services.
 */

// Platform Launcher mocks
export const createPlatformLauncherMock = () => ({
  acquirePage: vi.fn().mockResolvedValue({}),
  releasePage: vi.fn().mockResolvedValue(undefined),
  markPageLoggedIn: vi.fn().mockResolvedValue(undefined),
  getPoolStatus: vi.fn().mockResolvedValue({ available: 5, total: 10 }),
});

// AI Gateway mocks
export const createAIGatewayMock = () => ({
  generate: vi.fn().mockResolvedValue({ content: 'Generated content' }),
  generateStream: vi.fn().mockResolvedValue({
    content: 'Streamed content',
    [Symbol.asyncIterator]: () => ({
      next: vi.fn().mockResolvedValue({ done: true, value: 'Streamed content' }),
    }),
  }),
  getDefaultProvider: vi.fn().mockReturnValue('openai'),
});

// Task Queue mocks
export const createTaskQueueMock = () => ({
  updateStatus: vi.fn().mockResolvedValue(undefined),
  getCheckpoint: vi.fn().mockResolvedValue(null),
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
  clearCheckpoint: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
});

// Rate Limiter mocks
export const createRateLimiterMock = () => ({
  check: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  acquire: vi.fn().mockResolvedValue({ allowed: true }),
  release: vi.fn().mockResolvedValue(undefined),
});

// Content Moderator mocks
export const createContentModeratorMock = () => ({
  moderateContent: vi.fn().mockResolvedValue({
    isApproved: true,
    flags: [],
    score: 1.0,
  }),
});

// Page mocks
export const createPageMock = () => ({
  goto: vi.fn().mockResolvedValue({}),
  fill: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  keyboard: {
    press: vi.fn().mockResolvedValue(undefined),
  },
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  evaluate: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
});

// Convenience function to create all mocks at once
export const createAllMocks = () => ({
  platformLauncher: createPlatformLauncherMock(),
  aiGateway: createAIGatewayMock(),
  taskQueue: createTaskQueueMock(),
  rateLimiter: createRateLimiterMock(),
  contentModerator: createContentModeratorMock(),
  page: createPageMock(),
});
