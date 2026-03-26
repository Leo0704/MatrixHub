import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import type { Account, Task } from '~shared/types';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAppStore.setState({
      accounts: [],
      tasks: [],
      currentPage: 'overview',
      taskDraft: null,
      hotTopicDraft: null,
      hasCompletedOnboarding: false,
    });
  });

  describe('accounts', () => {
    it('initializes with empty accounts array', () => {
      const { accounts } = useAppStore.getState();
      expect(accounts).toEqual([]);
    });

    it('sets accounts correctly', () => {
      const mockAccounts: Account[] = [
        {
          id: '1',
          platform: 'douyin',
          username: 'testuser',
          displayName: 'Test User',
          status: 'active',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      useAppStore.getState().setAccounts(mockAccounts);
      expect(useAppStore.getState().accounts).toEqual(mockAccounts);
    });

    it('adds account to beginning of list', () => {
      const account1: Account = {
        id: '1',
        platform: 'douyin',
        username: 'user1',
        displayName: 'User 1',
        status: 'active',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const account2: Account = {
        id: '2',
        platform: 'kuaishou',
        username: 'user2',
        displayName: 'User 2',
        status: 'active',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      useAppStore.getState().addAccount(account1);
      useAppStore.getState().addAccount(account2);

      const { accounts } = useAppStore.getState();
      expect(accounts[0].id).toBe('2');
      expect(accounts[1].id).toBe('1');
    });

    it('removes account by id', () => {
      const account: Account = {
        id: 'to-remove',
        platform: 'douyin',
        username: 'user',
        displayName: 'User',
        status: 'active',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      useAppStore.getState().setAccounts([account]);
      useAppStore.getState().removeAccount('to-remove');
      expect(useAppStore.getState().accounts).toEqual([]);
    });
  });

  describe('tasks', () => {
    it('initializes with empty tasks array', () => {
      const { tasks } = useAppStore.getState();
      expect(tasks).toEqual([]);
    });

    it('sets tasks correctly', () => {
      const mockTasks: Task[] = [
        {
          id: '1',
          type: 'publish',
          platform: 'douyin',
          status: 'pending',
          title: 'Test Task',
          payload: {},
          retryCount: 0,
          maxRetries: 3,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        },
      ];
      useAppStore.getState().setTasks(mockTasks);
      expect(useAppStore.getState().tasks).toEqual(mockTasks);
    });

    it('adds task to beginning of list', () => {
      const task1: Task = {
        id: '1',
        type: 'publish',
        platform: 'douyin',
        status: 'pending',
        title: 'Task 1',
        payload: {},
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };
      const task2: Task = {
        id: '2',
        type: 'publish',
        platform: 'kuaishou',
        status: 'running',
        title: 'Task 2',
        payload: {},
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };

      useAppStore.getState().addTask(task1);
      useAppStore.getState().addTask(task2);

      const { tasks } = useAppStore.getState();
      expect(tasks[0].id).toBe('2');
      expect(tasks[1].id).toBe('1');
    });

    it('updates existing task', () => {
      const task: Task = {
        id: '1',
        type: 'publish',
        platform: 'douyin',
        status: 'pending',
        title: 'Original Title',
        payload: {},
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };

      useAppStore.getState().setTasks([task]);

      const updatedTask = { ...task, status: 'completed' as const, title: 'Updated Title' };
      useAppStore.getState().updateTask(updatedTask);

      const { tasks } = useAppStore.getState();
      expect(tasks[0].status).toBe('completed');
      expect(tasks[0].title).toBe('Updated Title');
    });
  });

  describe('currentPage', () => {
    it('initializes with overview page', () => {
      const { currentPage } = useAppStore.getState();
      expect(currentPage).toBe('overview');
    });

    it('sets current page correctly', () => {
      useAppStore.getState().setCurrentPage('content');
      expect(useAppStore.getState().currentPage).toBe('content');

      useAppStore.getState().setCurrentPage('ai');
      expect(useAppStore.getState().currentPage).toBe('ai');
    });
  });

  describe('onboarding', () => {
    it('hasCompletedOnboarding defaults to false', () => {
      const { hasCompletedOnboarding } = useAppStore.getState();
      expect(hasCompletedOnboarding).toBe(false);
    });

    it('setHasCompletedOnboarding updates state', () => {
      useAppStore.getState().setHasCompletedOnboarding(true);
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });
  });

  describe('taskDraft', () => {
    it('initializes with null', () => {
      const { taskDraft } = useAppStore.getState();
      expect(taskDraft).toBeNull();
    });

    it('setTaskDraft updates draft', () => {
      const draft = {
        title: 'Draft Title',
        content: 'Draft Content',
        platform: 'douyin',
        accountIds: ['1'],
        contentMode: 'text' as const,
      };
      useAppStore.getState().setTaskDraft(draft);
      expect(useAppStore.getState().taskDraft).toEqual(draft);
    });

    it('clearTaskDraft sets to null', () => {
      const draft = {
        title: 'Draft Title',
        content: 'Draft Content',
        platform: 'douyin',
        accountIds: ['1'],
        contentMode: 'text' as const,
      };
      useAppStore.getState().setTaskDraft(draft);
      useAppStore.getState().clearTaskDraft();
      expect(useAppStore.getState().taskDraft).toBeNull();
    });
  });

  describe('hotTopicDraft', () => {
    it('initializes with null', () => {
      const { hotTopicDraft } = useAppStore.getState();
      expect(hotTopicDraft).toBeNull();
    });

    it('setHotTopicDraft updates draft', () => {
      const draft = {
        title: 'Hot Topic',
        platform: 'douyin',
        link: 'https://example.com',
      };
      useAppStore.getState().setHotTopicDraft(draft);
      expect(useAppStore.getState().hotTopicDraft).toEqual(draft);
    });

    it('clearHotTopicDraft sets to null', () => {
      const draft = {
        title: 'Hot Topic',
        platform: 'douyin',
        link: 'https://example.com',
      };
      useAppStore.getState().setHotTopicDraft(draft);
      useAppStore.getState().clearHotTopicDraft();
      expect(useAppStore.getState().hotTopicDraft).toBeNull();
    });
  });
});
