import { create } from 'zustand';
import type { Account, Task } from '~shared/types';

export type Page = 'overview' | 'content' | 'ai' | 'schedule' | 'insights' | 'accounts' | 'selectors' | 'settings' | 'auto-creation';

interface TaskDraft {
  title: string;
  content: string;
  platform: string;
  accountIds: string[];
  contentMode: 'text' | 'image' | 'voice';
}

interface HotTopicDraft {
  title: string;
  platform: string;
  link: string;
}

interface AppState {
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  removeAccount: (accountId: string) => void;

  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;

  currentPage: Page;
  setCurrentPage: (page: Page) => void;

  version: string;
  setVersion: (version: string) => void;

  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (value: boolean) => void;

  taskDraft: TaskDraft | null;
  setTaskDraft: (draft: TaskDraft | null) => void;
  clearTaskDraft: () => void;
  initTaskDraft: () => Promise<void>;

  hotTopicDraft: HotTopicDraft | null;
  setHotTopicDraft: (draft: HotTopicDraft | null) => void;
  clearHotTopicDraft: () => void;
}

const savedOnboarding = localStorage.getItem('onboardingCompleted');
const hasCompletedOnboarding = savedOnboarding === 'true';

export const useAppStore = create<AppState>((set) => ({
  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
  addAccount: (account) => set((state) => ({ accounts: [account, ...state.accounts] })),
  removeAccount: (accountId) => set((state) => ({
    accounts: state.accounts.filter((a) => a.id !== accountId),
  })),

  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  updateTask: (task) => set((state) => ({
    tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
  })),

  currentPage: 'overview',
  setCurrentPage: (currentPage) => set({ currentPage }),

  version: '',
  setVersion: (version) => set({ version }),

  hasCompletedOnboarding,
  setHasCompletedOnboarding: (value: boolean) => {
    set({ hasCompletedOnboarding: value });
    if (value) localStorage.setItem('onboardingCompleted', 'true');
  },

  // Task draft - initialized as null, use initTaskDraft() to load from encrypted storage
  taskDraft: null,

  setTaskDraft: async (draft) => {
    set({ taskDraft: draft });
    try {
      await window.electronAPI?.setTaskDraft(draft as TaskDraft | null);
    } catch (error) {
      console.error('[appStore] Failed to save task draft:', error);
    }
  },

  clearTaskDraft: async () => {
    set({ taskDraft: null });
    try {
      await window.electronAPI?.setTaskDraft(null);
    } catch (error) {
      console.error('[appStore] Failed to clear task draft:', error);
    }
  },

  initTaskDraft: async () => {
    try {
      const draft = await window.electronAPI?.getTaskDraft();
      if (draft) {
        // Validate that the draft has the required TaskDraft properties
        if ('title' in draft && 'content' in draft && 'platform' in draft &&
            'accountIds' in draft && 'contentMode' in draft) {
          set({ taskDraft: draft as TaskDraft });
        } else {
          console.warn('[appStore] Loaded task draft has invalid structure, ignoring');
        }
      }
    } catch (error) {
      console.error('[appStore] Failed to load task draft:', error);
    }
  },

  hotTopicDraft: null,
  setHotTopicDraft: (draft) => set({ hotTopicDraft: draft }),
  clearHotTopicDraft: () => set({ hotTopicDraft: null }),
}));
