# Test Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive unit tests for all handler modules, achieving 70-90% coverage on each handler file.

**Architecture:** Create mock infrastructure first, then write tests for each handler following Top-Down approach (handlers with fewer dependencies first).

**Tech Stack:** Vitest, jsdom, vi.mock()

---

## File Structure

```
src/
├── test/
│   └── mocks/
│       └── handlers.ts          # NEW: Mock factory functions for handlers
├── service/
│   └── handlers/
│       ├── __tests__/          # NEW: Test directory
│       │   ├── group-handlers.test.ts      # NEW
│       │   ├── ai-generate-handler.test.ts # NEW
│       │   ├── automation-handler.test.ts  # NEW
│       │   ├── fetch-handler.test.ts       # NEW
│       │   ├── publish-handler.test.ts     # NEW
│       │   └── page-agent-handler.test.ts  # NEW
```

---

## Task 1: Create Mock Infrastructure

**Files:**
- Create: `src/test/mocks/handlers.ts`

- [ ] **Step 1: Write mock factory functions**

```typescript
// src/test/mocks/handlers.ts
import type { Page } from 'playwright';
import type { Task } from '../../shared/types.js';

// Platform launcher mock
export const createMockPlatformLauncher = () => ({
  acquirePage: vi.fn().mockResolvedValue(createMockPage()),
  releasePage: vi.fn(),
  markPageLoggedIn: vi.fn(),
  getPoolStatus: vi.fn().mockReturnValue({
    total: 5,
    available: 3,
    inUse: 2,
  }),
});

// AI Gateway mock
export const createMockAiGateway = () => ({
  generate: vi.fn().mockResolvedValue({
    success: true,
    content: 'AI generated content',
  }),
  generateStream: vi.fn(),
  getDefaultProvider: vi.fn().mockReturnValue({
    type: 'openai',
    models: ['gpt-4'],
  }),
});

// Task Queue mock
export const createMockTaskQueue = () => ({
  updateStatus: vi.fn(),
  getCheckpoint: vi.fn().mockReturnValue(null),
  saveCheckpoint: vi.fn(),
  clearCheckpoint: vi.fn(),
  markFailed: vi.fn(),
});

// Rate Limiter mock
export const createMockRateLimiter = () => ({
  check: vi.fn().mockReturnValue({ allowed: true }),
  acquire: vi.fn().mockResolvedValue(true),
  release: vi.fn(),
});

// Content Moderator mock
export const createMockContentModerator = () => ({
  moderateContent: vi.fn().mockReturnValue({ passed: true, reasons: [] }),
});

// Page mock
export const createMockPage = () => ({
  goto: vi.fn().mockResolvedValue({ ok: true }),
  fill: vi.fn(),
  click: vi.fn(),
  keyboard: { press: vi.fn() },
  waitForTimeout: vi.fn(),
  evaluate: vi.fn().mockReturnValue({}),
  close: vi.fn(),
  viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/test/mocks/handlers.ts
git commit -m "test: add mock factory functions for handler tests"
```

---

## Task 2: group-handlers.test.ts

**Files:**
- Create: `src/service/handlers/__tests__/group-handlers.test.ts`

**Rationale:** Simplest handler - pure IPC wrapper around account-group module.

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerGroupHandlers } from '../group-handlers.js';

// Mock account-group module
vi.mock('../../account-group.js', () => ({
  createGroup: vi.fn().mockResolvedValue({ id: '1', name: 'Test', color: '#fff' }),
  updateGroup: vi.fn().mockResolvedValue({ id: '1', name: 'Updated', color: '#000' }),
  deleteGroup: vi.fn().mockResolvedValue(true),
  listGroups: vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
  getGroup: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
  reorderGroups: vi.fn(),
  getGroupAccountCount: vi.fn().mockResolvedValue(5),
}));

describe('Group Handlers', () => {
  let mockIpcMain: any;

  beforeEach(() => {
    mockIpcMain = {
      handle: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should register all group handlers', () => {
    registerGroupHandlers(mockIpcMain);

    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:create', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:update', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:delete', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:list', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:get', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:reorder', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:get-account-count', expect.any(Function));
  });

  it('should create group with name and color', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:create')[1];

    const result = await handler(null, { name: 'Test Group', color: '#ff0000' });

    expect(result).toEqual({ id: '1', name: 'Test', color: '#fff' });
  });

  it('should update group with id and fields', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:update')[1];

    const result = await handler(null, { id: '1', name: 'Updated', color: '#000' });

    expect(result).toEqual({ id: '1', name: 'Updated', color: '#000' });
  });

  it('should delete group by id', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:delete')[1];

    const result = await handler(null, { groupId: '1' });

    expect(result).toBe(true);
  });

  it('should list all groups', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:list')[1];

    const result = await handler(null);

    expect(result).toEqual([{ id: '1', name: 'Test' }]);
  });

  it('should get single group by id', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:get')[1];

    const result = await handler(null, { groupId: '1' });

    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  it('should reorder groups', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:reorder')[1];

    const result = await handler(null, { groups: ['1', '2', '3'] });

    expect(result).toBe(true);
  });

  it('should get account count for group', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:get-account-count')[1];

    const result = await handler(null, { groupId: '1' });

    expect(result).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/service/handlers/__tests__/group-handlers.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/service/handlers/__tests__/group-handlers.test.ts
git commit -m "test: add group-handlers tests"
```

---

## Task 3: ai-generate-handler.test.ts

**Files:**
- Create: `src/service/handlers/__tests__/ai-generate-handler.test.ts`

**Dependencies:** ai-gateway, taskQueue, content-moderator

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAIGenerateTask } from '../ai-generate-handler.js';
import type { Task } from '../../../shared/types.js';

vi.mock('../../ai-gateway.js', () => ({
  aiGateway: {
    getDefaultProvider: vi.fn().mockReturnValue({ type: 'openai', models: ['gpt-4'] }),
    generate: vi.fn().mockResolvedValue({ success: true, content: 'Generated content' }),
  },
}));

vi.mock('../../queue.js', () => ({
  taskQueue: {
    updateStatus: vi.fn(),
    updateProgress: vi.fn(),
  },
}));

vi.mock('../../content-moderator.js', () => ({
  moderateContent: vi.fn().mockReturnValue({ passed: true, reasons: [] }),
}));

describe('AI Generate Handler', () => {
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'ai_generate',
      status: 'pending',
      payload: { topic: 'test topic', platform: 'douyin' },
      createdAt: Date.now(),
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should generate content successfully', async () => {
    await executeAIGenerateTask(mockTask, mockSignal);

    expect(mockSignal.throwIfAborted).toHaveBeenCalled();
  });

  it('should fail content moderation and update task status', async () => {
    const { moderateContent } = await import('../../content-moderator.js');
    moderateContent.mockReturnValueOnce({ passed: false, reasons: ['inappropriate'] });

    await executeAIGenerateTask(mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.updateStatus).toHaveBeenCalledWith('task-1', 'failed', {
      error: expect.stringContaining('内容审核未通过'),
    });
  });

  it('should throw error when AI generation fails', async () => {
    const { aiGateway } = await import('../../ai-gateway.js');
    // Use undefined error to trigger the fallback message
    aiGateway.generate.mockResolvedValueOnce({ success: false, error: undefined });

    await expect(executeAIGenerateTask(mockTask, mockSignal)).rejects.toThrow('AI 生成失败');
  });

  it('should throw API error message when AI generation fails with error detail', async () => {
    const { aiGateway } = await import('../../ai-gateway.js');
    aiGateway.generate.mockResolvedValueOnce({ success: false, error: 'Rate limit exceeded' });

    await expect(executeAIGenerateTask(mockTask, mockSignal)).rejects.toThrow('Rate limit exceeded');
  });

  it('should fail moderation of AI output and update task status', async () => {
    const { moderateContent } = await import('../../content-moderator.js');
    moderateContent.mockReturnValueOnce({ passed: true, reasons: [] }); // input passes
    moderateContent.mockReturnValueOnce({ passed: false, reasons: ['unsafe'] }); // output fails

    await executeAIGenerateTask(mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.updateStatus).toHaveBeenCalledWith('task-1', 'failed', {
      error: expect.stringContaining('AI生成内容审核未通过'),
    });
  });

  it('should update task with generated content on success', async () => {
    await executeAIGenerateTask(mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.updateStatus).toHaveBeenCalledWith('task-1', 'running', {
      result: { content: 'Generated content' },
      progress: 100,
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/service/handlers/__tests__/ai-generate-handler.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/service/handlers/__tests__/ai-generate-handler.test.ts
git commit -m "test: add ai-generate-handler tests"
```

---

## Task 4: automation-handler.test.ts

**Files:**
- Create: `src/service/handlers/__tests__/automation-handler.test.ts`

**Dependencies:** platform-launcher, ipcRenderer, page-helpers

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAutomationTask } from '../automation-handler.js';
import type { Task } from '../../../shared/types.js';

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

vi.mock('../../platform-launcher.js', () => ({
  markPageLoggedIn: vi.fn(),
}));

vi.mock('../../utils/page-helpers.js', () => ({
  navigateTo: vi.fn(),
  randomDelay: vi.fn(),
  checkLoginState: vi.fn().mockResolvedValue(true),
  humanClick: vi.fn(),
  humanScroll: vi.fn(),
}));

vi.mock('../../config/selectors.js', () => ({
  getAutoSelectors: vi.fn().mockReturnValue([{ value: '.selector' }]),
  AUTOMATION_PATHS: {
    douyin: { self_posts: '/posts', discovery: '/discovery', comments: '/comments' },
    kuaishou: { self_posts: '/posts', discovery: '/discovery', comments: '/comments' },
    xiaohongshu: { self_posts: '/posts', discovery: '/discovery', comments: '/comments' },
  },
}));

describe('Automation Handler', () => {
  let mockPage: any;
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = {
      $$: vi.fn().mockResolvedValue([]),
      $: vi.fn().mockResolvedValue({ textContent: vi.fn().mockResolvedValue('已关注') }),
      fill: vi.fn(),
      keyboard: { press: vi.fn() },
    };
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'automation',
      payload: { action: 'auto_reply', platform: 'douyin', accountId: 'acc-1' },
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should throw when user cancels automation', async () => {
    const { ipcRenderer } = await import('electron');
    ipcRenderer.invoke.mockResolvedValueOnce(false); // User denied

    await expect(executeAutomationTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('用户取消自动化任务');
  });

  it('should throw when account is not logged in', async () => {
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    checkLoginState.mockResolvedValueOnce(false);

    await expect(executeAutomationTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('账号未登录或 Session 已过期');
  });

  it('should throw on unknown action type', async () => {
    const unknownTask = {
      ...mockTask,
      payload: { action: 'unknown_action', platform: 'douyin' },
    } as any;

    await expect(executeAutomationTask(mockPage, unknownTask, mockSignal))
      .rejects.toThrow('未知自动化操作');
  });

  it('should mark page as logged in after successful login check', async () => {
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    checkLoginState.mockResolvedValueOnce(true);

    const { markPageLoggedIn } = await import('../../platform-launcher.js');

    await executeAutomationTask(mockPage, mockTask, mockSignal);

    expect(markPageLoggedIn).toHaveBeenCalledWith(mockPage, 'acc-1');
  });

  it('should execute auto_reply action successfully', async () => {
    const { ipcRenderer } = await import('electron');
    ipcRenderer.invoke.mockResolvedValueOnce(true); // User confirmed

    const result = await executeAutomationTask(mockPage, mockTask, mockSignal);

    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('replied');
    expect(result.platform).toBe('douyin');
  });

  it('should execute auto_like action successfully', async () => {
    const likeTask = {
      ...mockTask,
      payload: { action: 'auto_like', platform: 'douyin', accountId: 'acc-1' },
    } as any;
    const { ipcRenderer } = await import('electron');
    ipcRenderer.invoke.mockResolvedValueOnce(true);

    const result = await executeAutomationTask(mockPage, likeTask, mockSignal);

    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('liked');
  });

  it('should execute comment_management action successfully', async () => {
    const commentTask = {
      ...mockTask,
      payload: { action: 'comment_management', platform: 'douyin', accountId: 'acc-1' },
    } as any;
    const { ipcRenderer } = await import('electron');
    ipcRenderer.invoke.mockResolvedValueOnce(true);

    const result = await executeAutomationTask(mockPage, commentTask, mockSignal);

    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('comments');
    expect(result).toHaveProperty('count');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/service/handlers/__tests__/automation-handler.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/service/handlers/__tests__/automation-handler.test.ts
git commit -m "test: add automation-handler tests"
```

---

## Task 5: fetch-handler.test.ts

**Files:**
- Create: `src/service/handlers/__tests__/fetch-handler.test.ts`

**Dependencies:** data-fetcher, platform-launcher, page-helpers

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFetchDataTask } from '../fetch-handler.js';
import type { Task } from '../../../shared/types.js';

vi.mock('../../data-fetcher/index.js', () => ({
  createFetcher: vi.fn().mockReturnValue({
    fetchHotTopics: vi.fn().mockResolvedValue({
      topics: [{ id: '1', title: 'Hot Topic', heat: 1000 }],
      source: 'douyin',
      fetchedAt: Date.now(),
    }),
    close: vi.fn(),
  }),
  createAllFetchers: vi.fn().mockReturnValue([]),
}));

vi.mock('../../platform-launcher.js', () => ({
  createPage: vi.fn().mockResolvedValue({
    goto: vi.fn(),
    close: vi.fn(),
    evaluate: vi.fn(),
  }),
}));

vi.mock('../../utils/page-helpers.js', () => ({
  checkLoginState: vi.fn().mockResolvedValue(true),
  navigateTo: vi.fn(),
  randomDelay: vi.fn(),
}));

describe('Fetch Handler', () => {
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'fetch_data',
      payload: { dataType: 'hot_topics', platform: 'douyin' },
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should fetch hot topics for a specific platform', async () => {
    const result = await executeFetchDataTask(mockTask, mockSignal);

    expect(result).toHaveProperty('topics');
    expect(Array.isArray(result.topics)).toBe(true);
  });

  it('should throw on unknown data type', async () => {
    const unknownTask = {
      ...mockTask,
      payload: { dataType: 'unknown_type' },
    } as any;

    await expect(executeFetchDataTask(unknownTask, mockSignal))
      .rejects.toThrow('未知数据类型');
  });

  it('should throw if account is not logged in for content_stats', async () => {
    const contentTask = {
      ...mockTask,
      payload: { dataType: 'content_stats', accountId: 'acc-1' },
    } as any;
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    checkLoginState.mockResolvedValueOnce(false);

    await expect(executeFetchDataTask(contentTask, mockSignal))
      .rejects.toThrow('抖音账号未登录');
  });

  it('should fetch content stats successfully', async () => {
    const contentTask = {
      ...mockTask,
      payload: { dataType: 'content_stats', accountId: 'acc-1' },
    } as any;
    const { createPage } = await import('../../platform-launcher.js');
    const mockPage = createPage();
    mockPage.evaluate.mockResolvedValueOnce({
      totalViews: 1000,
      totalLikes: 100,
      totalComments: 50,
      totalShares: 20,
    });

    const result = await executeFetchDataTask(contentTask, mockSignal);

    expect(result).toHaveProperty('totalViews', 1000);
    expect(result).toHaveProperty('totalLikes', 100);
  });

  it('should fetch account stats successfully', async () => {
    const accountTask = {
      ...mockTask,
      payload: { dataType: 'account_stats', accountId: 'acc-1' },
    } as any;
    const { createPage } = await import('../../platform-launcher.js');
    const mockPage = createPage();
    mockPage.evaluate.mockResolvedValueOnce({
      followers: 5000,
      following: 200,
      totalPosts: 50,
      engagementRate: 5.5,
    });

    const result = await executeFetchDataTask(accountTask, mockSignal);

    expect(result).toHaveProperty('followers', 5000);
    expect(result).toHaveProperty('engagementRate', 5.5);
  });

  it('should throw when content stats extraction fails', async () => {
    const contentTask = {
      ...mockTask,
      payload: { dataType: 'content_stats', accountId: 'acc-1' },
    } as any;
    const { createPage } = await import('../../platform-launcher.js');
    const mockPage = createPage();
    mockPage.evaluate.mockResolvedValueOnce({
      totalViews: null,
      totalLikes: null,
    });

    await expect(executeFetchDataTask(contentTask, mockSignal))
      .rejects.toThrow('无法从页面提取内容统计数据');
  });

  it('should throw when account stats extraction fails', async () => {
    const accountTask = {
      ...mockTask,
      payload: { dataType: 'account_stats', accountId: 'acc-1' },
    } as any;
    const { createPage } = await import('../../platform-launcher.js');
    const mockPage = createPage();
    mockPage.evaluate.mockResolvedValueOnce({
      followers: null,
    });

    await expect(executeFetchDataTask(accountTask, mockSignal))
      .rejects.toThrow('无法从页面提取账号统计数据');
  });

  it('should clean up fetcher in finally block', async () => {
    const fetcherMock = {
      fetchHotTopics: vi.fn().mockResolvedValue({ topics: [], source: 'douyin' }),
      close: vi.fn(),
    };
    const { createFetcher } = await import('../../data-fetcher/index.js');
    createFetcher.mockReturnValueOnce(fetcherMock);

    await executeFetchDataTask(mockTask, mockSignal);

    expect(fetcherMock.close).toHaveBeenCalled();
  });

  it('should handle fetcher errors gracefully in multi-platform fetch', async () => {
    // Test that errors are collected when some fetchers fail
    const failingFetcher = {
      fetchHotTopics: vi.fn().mockRejectedValue(new Error('Network error')),
      close: vi.fn(),
      platform: 'douyin',
    };
    const { createAllFetchers } = await import('../../data-fetcher/index.js');
    createAllFetchers.mockReturnValueOnce([failingFetcher]);

    const multiPlatformTask = {
      ...mockTask,
      payload: { dataType: 'hot_topics' }, // No platform = all platforms
    } as any;

    const result = await executeFetchDataTask(multiPlatformTask, mockSignal);

    // Should still return results, with error message
    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('error');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/service/handlers/__tests__/fetch-handler.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/service/handlers/__tests__/fetch-handler.test.ts
git commit -m "test: add fetch-handler tests"
```

---

## Task 6: publish-handler.test.ts

**Files:**
- Create: `src/service/handlers/__tests__/publish-handler.test.ts`

**Dependencies:** taskQueue, rateLimiter, platform-launcher, page-helpers

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePublishTask } from '../publish-handler.js';
import type { Task, Page } from '../../../shared/types.js';

vi.mock('../../queue.js', () => ({
  taskQueue: {
    getCheckpoint: vi.fn().mockReturnValue(null),
    saveCheckpoint: vi.fn(),
    clearCheckpoint: vi.fn(),
  },
}));

vi.mock('../../rate-limiter.js', () => ({
  rateLimiter: {
    check: vi.fn().mockReturnValue({ allowed: true }),
    acquire: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../platform-launcher.js', () => ({
  createPage: vi.fn(),
  markPageLoggedIn: vi.fn(),
}));

vi.mock('../../utils/page-helpers.js', () => ({
  navigateToPublish: vi.fn(),
  checkLoginState: vi.fn().mockResolvedValue(true),
  fillPublishForm: vi.fn(),
  confirmPublish: vi.fn(),
  randomDelay: vi.fn(),
}));

vi.mock('../../utils/sleep.js', () => ({
  sleep: vi.fn(),
}));

describe('Publish Handler', () => {
  let mockPage: any;
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = {
      goto: vi.fn(),
      fill: vi.fn(),
      click: vi.fn(),
    };
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'publish',
      payload: { accountId: 'acc-1', title: 'Test', content: 'Content' },
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should complete publish flow successfully', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { navigateToPublish } = await import('../../utils/page-helpers.js');
    expect(navigateToPublish).toHaveBeenCalledWith(mockPage, 'douyin');
    expect(mockSignal.throwIfAborted).toHaveBeenCalled();
  });

  it('should save checkpoint after navigation', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.saveCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', step: 'login_check' })
    );
  });

  it('should throw when rate limiter is full', async () => {
    const { rateLimiter } = await import('../../rate-limiter.js');
    rateLimiter.acquire.mockResolvedValueOnce(false);

    await expect(executePublishTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('rate_limit_exceeded');
  });

  it('should throw when account is not logged in', async () => {
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    checkLoginState.mockResolvedValueOnce(false);

    await expect(executePublishTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('账号未登录');
  });

  it('should save checkpoint after login check', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    const checkpoints = taskQueue.saveCheckpoint.mock.calls;
    const fillFormCheckpoint = checkpoints.find((call: any) => call[0].step === 'fill_form');
    expect(fillFormCheckpoint).toBeDefined();
  });

  it('should save checkpoint after form fill', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    const checkpoints = taskQueue.saveCheckpoint.mock.calls;
    const confirmCheckpoint = checkpoints.find((call: any) => call[0].step === 'confirm_publish');
    expect(confirmCheckpoint).toBeDefined();
  });

  it('should clear checkpoint after successful publish', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.clearCheckpoint).toHaveBeenCalledWith('task-1');
  });

  it('should mark page as logged in', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { markPageLoggedIn } = await import('../../platform-launcher.js');
    expect(markPageLoggedIn).toHaveBeenCalled();
  });

  it('should resume from checkpoint if exists', async () => {
    const { taskQueue } = await import('../../queue.js');
    taskQueue.getCheckpoint.mockReturnValueOnce({ step: 'fill_form', payload: {} });

    await executePublishTask(mockPage, mockTask, mockSignal);

    // Should skip navigate and login check, go directly to fill_form
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    expect(checkLoginState).not.toHaveBeenCalled();
  });

  it('should wait when rate limited', async () => {
    const { rateLimiter } = await import('../../rate-limiter.js');
    rateLimiter.check.mockReturnValueOnce({ allowed: false, waitMs: 5000 });

    await executePublishTask(mockPage, mockTask, mockSignal);

    const { sleep } = await import('../../utils/sleep.js');
    expect(sleep).toHaveBeenCalledWith(5000);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/service/handlers/__tests__/publish-handler.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/service/handlers/__tests__/publish-handler.test.ts
git commit -m "test: add publish-handler tests"
```

---

## Task 7: page-agent-handler.test.ts

**Files:**
- Create: `src/service/handlers/__tests__/page-agent-handler.test.ts`

**Dependencies:** aiGateway, dom-extractor, page-agent-prompts

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePageAgentTask } from '../page-agent-handler.js';
import type { Task } from '../../../shared/types.js';

vi.mock('../../ai-gateway.js', () => ({
  aiGateway: {
    generate: vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        evaluation: 'The page shows login form',
        memory: 'User needs to login',
        nextGoal: 'Click login button',
        action: { click_element: { index: 1 } },
      }),
    }),
  },
}));

vi.mock('../../utils/dom-extractor.js', () => ({
  extractPageSnapshot: vi.fn().mockResolvedValue({
    info: { url: 'https://example.com', title: 'Test' },
    elements: [
      { index: 0, tag: 'button', text: 'Cancel', ariaLabel: null, placeholder: null },
      { index: 1, tag: 'button', text: 'Login', ariaLabel: null, placeholder: null },
    ],
  }),
  formatSnapshotForLLM: vi.fn().mockReturnValue('Page snapshot'),
}));

vi.mock('../../config/page-agent-prompts.js', () => ({
  PAGE_AGENT_SYSTEM_PROMPT: 'You are a page agent',
  buildUserPrompt: vi.fn().mockReturnValue('User prompt'),
  parseLLMAction: vi.fn().mockReturnValue({
    evaluation: 'The page shows login form',
    memory: 'User needs to login',
    nextGoal: 'Click login button',
    action: { click_element: { index: 1 } },
  }),
}));

vi.mock('../../utils/page-helpers.js', () => ({
  randomDelay: vi.fn(),
}));

describe('Page Agent Handler', () => {
  let mockPage: any;
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = {
      evaluate: vi.fn().mockResolvedValue(true),
      waitForTimeout: vi.fn(),
      viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    };
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'page_agent',
      payload: { goal: 'Login to the site', platform: 'douyin', accountId: 'acc-1' },
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should execute page agent task successfully', async () => {
    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('actions');
    expect(result).toHaveProperty('observations');
  });

  it('should return success when done action is returned', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce({
      evaluation: 'Task complete',
      memory: 'Done',
      nextGoal: 'None',
      action: { done: { text: 'Logged in successfully' } },
    });

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(true);
    expect(result.finalText).toBe('Logged in successfully');
  });

  it('should throw AbortError when signal is aborted', async () => {
    const { extractPageSnapshot } = await import('../../utils/dom-extractor.js');
    extractPageSnapshot.mockRejectedValueOnce(new Error('AbortError'));

    await expect(executePageAgentTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('AbortError');
  });

  it('should return error when LLM call fails', async () => {
    const { aiGateway } = await import('../../ai-gateway.js');
    aiGateway.generate.mockResolvedValueOnce({ success: false, error: 'API Error' });

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM 调用失败');
  });

  it('should return error when LLM response cannot be parsed', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce(null);

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('无法解析 LLM 响应');
  });

  it('should throw when max steps exceeded', async () => {
    const maxStepsTask = {
      ...mockTask,
      payload: { goal: 'Test', platform: 'douyin', accountId: 'acc-1', maxSteps: 1 },
    } as any;
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    // Return non-done action every time
    parseLLMAction.mockReturnValue({
      evaluation: 'Continue',
      memory: 'Continue',
      nextGoal: 'Continue',
      action: { wait: { seconds: 1 } },
    });

    const result = await executePageAgentTask(mockPage, maxStepsTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toBe('达到最大步数限制');
  });

  it('should throw when element cannot be clicked', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce({
      evaluation: 'Need to click',
      memory: 'Click element',
      nextGoal: 'Click',
      action: { click_element: { index: 99 } }, // Invalid index
    });

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('无法点击元素');
  });

  it('should throw when text cannot be input', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce({
      evaluation: 'Need to input',
      memory: 'Input text',
      nextGoal: 'Input',
      action: { input_text: { index: 99, text: 'hello' } }, // Invalid index
    });

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('无法输入文本');
  });

  it('should throw on unknown action type', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce({
      evaluation: 'Unknown',
      memory: 'Unknown',
      nextGoal: 'Unknown',
      action: { unknown_action: {} },
    });

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('未知操作类型');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/service/handlers/__tests__/page-agent-handler.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/service/handlers/__tests__/page-agent-handler.test.ts
git commit -m "test: add page-agent-handler tests"
```

---

## Task 8: Run Full Coverage

- [ ] **Step 1: Run coverage report**

Run: `npm run test:coverage -- --reporter=html`

- [ ] **Step 2: Verify handlers coverage**

Check that handlers/ directory has >70% coverage

- [ ] **Step 3: Commit coverage baseline**

```bash
git add coverage/
git commit -m "test: add handler tests, handlers coverage now 70%+"
```

---

## Summary

| Task | File | Lines | Coverage Target |
|------|------|-------|-----------------|
| 1 | mock infrastructure | ~80 | N/A |
| 2 | group-handlers.test.ts | ~100 | 90% |
| 3 | ai-generate-handler.test.ts | ~100 | 80% |
| 4 | automation-handler.test.ts | ~150 | 70% |
| 5 | fetch-handler.test.ts | ~150 | 85% |
| 6 | publish-handler.test.ts | ~150 | 80% |
| 7 | page-agent-handler.test.ts | ~200 | 75% |
