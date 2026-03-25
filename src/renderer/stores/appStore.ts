import { create } from 'zustand';
import type { Account, Task } from '~shared/types';

export type Page = 'overview' | 'content' | 'ai' | 'schedule' | 'insights' | 'accounts' | 'selectors' | 'settings';

interface TaskDraft {
  title: string;
  content: string;
  platform: string;
  accountIds: string[];
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
}

const savedOnboarding = localStorage.getItem('onboardingCompleted');
const hasCompletedOnboarding = savedOnboarding === 'true';

const savedDraft = localStorage.getItem('taskDraft');
const taskDraft = savedDraft ? JSON.parse(savedDraft) : null;

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

  taskDraft,
  setTaskDraft: (draft) => {
    set({ taskDraft: draft });
    if (draft) {
      localStorage.setItem('taskDraft', JSON.stringify(draft));
    } else {
      localStorage.removeItem('taskDraft');
    }
  },

  clearTaskDraft: () => {
    set({ taskDraft: null });
    localStorage.removeItem('taskDraft');
  },
}));