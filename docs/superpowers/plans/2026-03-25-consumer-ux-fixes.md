# Consumer UX Issues Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all consumer-facing UX issues identified in the review: onboarding, consent/TOS warnings, AI safety, broken UI features, error handling, and missing consumer functionality.

**Architecture:** Changes are organized into 5 subsystems (ConsentSystem, OnboardingFlow, BrokenFeaturesFix, ErrorHandling, ConsumerFeatures), each with focused files. No architectural changes—pure UX improvements layered on existing structure.

**Tech Stack:** React + TypeScript (frontend), Electron IPC, SQLite (settings storage)

---

## CRITICAL: Path & Architecture Corrections

The following were corrected from initial draft based on codebase review:

1. **Settings.tsx** and **AccountManagement.tsx** are FLAT FILES, not directories
2. **IPC handlers** must be added to `src/service/ipc-handlers.ts`, NOT `src/main/index.ts`
3. **Tests** use co-located pattern inside `src/service/` and `src/renderer/`
4. **ElectronAPI** methods must be added to `src/preload/index.ts` before use
5. **Rate limiter API** returns `{ minute, hour, day }` structure, not platform-keyed
6. **Settings table** doesn't exist in db.ts — use `misc` table or create it

---

## File Structure

```
src/renderer/
├── components/
│   ├── ConsentDialog.tsx          # NEW
│   ├── ConsentDialog.css         # NEW
│   ├── OnboardingGuide.tsx       # NEW
│   ├── OnboardingGuide.css       # NEW
│   ├── Toast.tsx                  # MODIFY: enhance with icons
│   ├── Toast.css                  # NEW
│   ├── ConfirmModal.tsx          # NEW
│   ├── ConfirmModal.css          # NEW
│   ├── AIStatusIndicator.tsx     # NEW
│   ├── AIStatusIndicator.css     # NEW
│   └── RateLimitStatus.tsx       # NEW
│   └── RateLimitStatus.css       # NEW
├── pages/
│   ├── Settings.tsx              # MODIFY: wire up new components, fix broken buttons
│   ├── AccountManagement.tsx      # MODIFY: add password strength, credential help
│   ├── AICreation/
│   │   └── index.tsx             # MODIFY: add AI status indicator
│   └── ContentManagement/
│       ├── index.tsx              # MODIFY: add search, rate limit display
│       └── components/
│           └── CreateTaskModal.tsx # MODIFY: add draft saving
├── styles.css                    # MODIFY: theme variables, new component styles
└── stores/
    └── appStore.ts               # MODIFY: add consent state, draft storage

src/service/
├── consent-manager.ts             # NEW
├── content-moderator.ts          # NEW
├── ipc-handlers.ts               # MODIFY: add new IPC handlers
└── db.ts                          # MODIFY: add consent table, settings table, export/import

src/preload/
└── index.ts                       # MODIFY: add ElectronAPI methods

tests/
├── service/
│   ├── consent-manager.test.ts   # NEW
│   └── content-moderator.test.ts # NEW
└── renderer/
    └── components/
        ├── ConsentDialog.test.tsx # NEW
        └── OnboardingGuide.test.tsx # NEW
```

---

## Subsystem 1: Consent & Legal Compliance

### Task 1: ConsentDialog Component

**Files:**
- Create: `src/renderer/components/ConsentDialog.tsx`
- Create: `src/renderer/components/ConsentDialog.css`
- Create: `tests/renderer/components/ConsentDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/renderer/components/ConsentDialog.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsentDialog } from '../../components/ConsentDialog';

describe('ConsentDialog', () => {
  it('renders TOS content and requires acknowledgment', () => {
    const onAccept = vi.fn();
    render(<ConsentDialog onAccept={onAccept} />);

    expect(screen.getByText(/自动化操作可能违反平台服务条款/)).toBeInTheDocument();
    expect(screen.getByText(/账号可能被封禁/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我已阅读并同意' })).toBeDisabled();
  });

  it('enables accept button only when checkbox is checked', () => {
    const onAccept = vi.fn();
    render(<ConsentDialog onAccept={onAccept} />);

    const checkbox = screen.getByRole('checkbox');
    const button = screen.getByRole('button', { name: '我已阅读并同意' });

    expect(button).toBeDisabled();
    fireEvent.click(checkbox);
    expect(button).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ConsentDialog.test.tsx`
Expected: FAIL — component does not exist

- [ ] **Step 3: Write the implementation**

```tsx
// src/renderer/components/ConsentDialog.tsx
import { useState } from 'react';
import './ConsentDialog.css';

interface ConsentDialogProps {
  onAccept: () => void;
}

export function ConsentDialog({ onAccept }: ConsentDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="consent-overlay">
      <div className="consent-modal">
        <h2>⚠️ 使用前须知</h2>

        <div className="consent-content">
          <section>
            <h3>📋 平台服务条款风险</h3>
            <p>本应用通过浏览器自动化技术操作你的账号，这可能违反以下平台的服务条款：</p>
            <ul>
              <li><strong>抖音</strong> — 禁止自动化批量操作</li>
              <li><strong>快手</strong> — 禁止机器人行为</li>
              <li><strong>小红书</strong> — 严格限制自动化活动</li>
            </ul>
            <p className="warning">⚠️ <strong>账号可能被封禁</strong>，开发者不承担责任</p>
          </section>

          <section>
            <h3>🔒 数据存储</h3>
            <p>所有凭证和数据仅存储在本地设备。我们不会收集或上传你的任何个人信息。</p>
          </section>

          <section>
            <h3>🤖 AI内容生成</h3>
            <p>AI生成的内容可能受到平台审核。请勿生成违规内容。</p>
          </section>
        </div>

        <label className="consent-checkbox">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={e => setAcknowledged(e.target.checked)}
          />
          <span>我已阅读并理解上述风险，愿意自行承担使用后果</span>
        </label>

        <button
          className="btn btn-primary"
          disabled={!acknowledged}
          onClick={onAccept}
        >
          我已阅读并同意
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add CSS**

```css
/* src/renderer/components/ConsentDialog.css */
.consent-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.consent-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  max-width: 520px;
  max-height: 80vh;
  overflow-y: auto;
}

.consent-content section {
  margin-bottom: 20px;
}

.consent-content h3 {
  font-size: 14px;
  margin-bottom: 8px;
}

.consent-content .warning {
  color: var(--color-red);
  background: rgba(239, 68, 68, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
}

.consent-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  margin: 16px 0;
}

.consent-checkbox input {
  margin-top: 3px;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- ConsentDialog.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ConsentDialog.tsx src/renderer/components/ConsentDialog.css tests/renderer/components/ConsentDialog.test.tsx
git commit -m "feat: add consent dialog for TOS risk disclosure"
```

---

### Task 2: ConsentManager Service + IPC

**Files:**
- Create: `src/service/consent-manager.ts`
- Create: `tests/service/consent-manager.test.ts`
- Modify: `src/service/db.ts` (add consent table)
- Modify: `src/service/ipc-handlers.ts` (add IPC handlers)
- Modify: `src/preload/index.ts` (add ElectronAPI methods)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/service/consent-manager.test.ts
import { ConsentManager } from '../../service/consent-manager';
import { initDb } from '../../service/db';

describe('ConsentManager', () => {
  beforeEach(() => initDb(':memory:'));

  it('stores consent timestamp on accept', async () => {
    const manager = new ConsentManager();
    await manager.grantConsent();

    const record = await manager.getConsentRecord();
    expect(record).toBeDefined();
    expect(record?.granted).toBe(true);
    expect(record?.grantedAt).toBeDefined();
  });

  it('checks if consent is required', async () => {
    const manager = new ConsentManager();
    const needsConsent = await manager.isConsentRequired();
    expect(needsConsent).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- consent-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write ConsentManager implementation**

```typescript
// src/service/consent-manager.ts
import { db } from './db';

interface ConsentRecord {
  granted: boolean;
  grantedAt?: string;
  version: string;
}

const CONSENT_VERSION = '1.0.0';

export class ConsentManager {
  async isConsentRequired(): Promise<boolean> {
    const row = db.prepare('SELECT * FROM consent WHERE version = ?').get(CONSENT_VERSION) as { granted: number } | undefined;
    return !row || row.granted !== 1;
  }

  async grantConsent(): Promise<void> {
    db.prepare(`
      INSERT OR REPLACE INTO consent (version, granted, grantedAt)
      VALUES (?, 1, datetime('now'))
    `).run(CONSENT_VERSION);
  }

  async getConsentRecord(): Promise<ConsentRecord | null> {
    const row = db.prepare('SELECT * FROM consent WHERE version = ?').get(CONSENT_VERSION) as { granted: number; grantedAt: string } | undefined;
    if (!row) return null;
    return {
      granted: row.granted === 1,
      grantedAt: row.grantedAt,
      version: CONSENT_VERSION,
    };
  }
}
```

- [ ] **Step 4: Add consent table to db.ts**

In `src/service/db.ts`, find `createTables()` and add:
```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS consent (
    version TEXT PRIMARY KEY,
    granted INTEGER NOT NULL DEFAULT 0,
    grantedAt TEXT
  );
`);
```

- [ ] **Step 5: Add IPC handlers to ipc-handlers.ts**

In `src/service/ipc-handlers.ts`, add handlers:
```typescript
// Consent handlers
ipc.handle('get-consent-required', async () => {
  const { ConsentManager } = await import('./consent-manager');
  const manager = new ConsentManager();
  return manager.isConsentRequired();
});

ipc.handle('grant-consent', async () => {
  const { ConsentManager } = await import('./consent-manager');
  const manager = new ConsentManager();
  await manager.grantConsent();
});
```

- [ ] **Step 6: Add ElectronAPI methods to preload**

In `src/preload/index.ts`, add to `ElectronAPI` interface:
```typescript
getConsentRequired: () => Promise<boolean>;
grantConsent: () => Promise<void>;
```

And implement:
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods
  getConsentRequired: () => ipcRenderer.invoke('get-consent-required'),
  grantConsent: () => ipcRenderer.invoke('grant-consent'),
});
```

- [ ] **Step 7: Run tests and verify pass**

Run: `npm test -- consent-manager.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/service/consent-manager.ts src/service/db.ts src/service/ipc-handlers.ts src/preload/index.ts tests/service/consent-manager.test.ts
git commit -m "feat: add consent manager service with IPC handlers"
```

---

## Subsystem 2: Onboarding Flow

### Task 3: OnboardingGuide Component

**Files:**
- Create: `src/renderer/components/OnboardingGuide.tsx`
- Create: `src/renderer/components/OnboardingGuide.css`
- Create: `tests/renderer/components/OnboardingGuide.test.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/stores/appStore.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/renderer/components/OnboardingGuide.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingGuide } from '../../components/OnboardingGuide';

describe('OnboardingGuide', () => {
  it('shows step 1 with add account CTA', () => {
    render(<OnboardingGuide currentStep={0} onComplete={() => {}} />);
    expect(screen.getByText(/添加你的第一个平台账号/)).toBeInTheDocument();
  });

  it('calls onComplete when skip is clicked', () => {
    const onComplete = vi.fn();
    render(<OnboardingGuide currentStep={0} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /跳过引导/ }));
    expect(onComplete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- OnboardingGuide.test.tsx`
Expected: FAIL — component not found

- [ ] **Step 3: Write the implementation**

```tsx
// src/renderer/components/OnboardingGuide.tsx
import { useState } from 'react';
import './OnboardingGuide.css';

interface OnboardingGuideProps {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: '👤',
    title: '添加平台账号',
    description: '首先添加你要管理的平台账号。点击左侧菜单的"账号管理"，然后点击"添加账号"按钮。',
    cta: '去添加账号',
  },
  {
    icon: '🔑',
    title: '配置AI服务（可选）',
    description: '如需AI内容生成功能，需要配置AI API。前往"设置"页面，填写AI服务商信息。',
    cta: '去设置',
  },
  {
    icon: '📝',
    title: '创建第一个任务',
    description: '在"内容管理"页面创建发布任务，选择账号、填写内容、设置发布时间。',
    cta: '去创建任务',
  },
  {
    icon: '✅',
    title: '开始使用',
    description: '你已经完成设置！如有疑问，点击右上角帮助按钮查看常见问题。',
    cta: '开始使用',
  },
];

export function OnboardingGuide({ onComplete }: OnboardingGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const step = STEPS[currentStep];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`progress-dot ${i <= currentStep ? 'active' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-icon">{step.icon}</div>
        <h2>{step.title}</h2>
        <p>{step.description}</p>

        <div className="onboarding-actions">
          <button className="btn btn-secondary" onClick={onComplete}>
            跳过引导
          </button>
          <button className="btn btn-primary" onClick={handleNext}>
            {currentStep < STEPS.length - 1 ? '下一步' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add CSS**

```css
/* src/renderer/components/OnboardingGuide.css */
.onboarding-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
}

.onboarding-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px;
  max-width: 400px;
  text-align: center;
}

.onboarding-progress {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 24px;
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.progress-dot.active {
  background: var(--color-primary);
}

.onboarding-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.onboarding-card h2 {
  margin-bottom: 12px;
}

.onboarding-card p {
  color: var(--text-secondary);
  margin-bottom: 24px;
  line-height: 1.5;
}

.onboarding-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
```

- [ ] **Step 5: Add to App.tsx**

In `src/renderer/App.tsx`:
```tsx
// Add imports
import { OnboardingGuide } from './components/OnboardingGuide';

// Add state
const [showOnboarding, setShowOnboarding] = useState(false);
const { hasCompletedOnboarding, setHasCompletedOnboarding } = useAppStore();

// Check on mount
useEffect(() => {
  if (!hasCompletedOnboarding) {
    window.electronAPI.getConsentRequired().then(needs => {
      if (needs) setShowOnboarding(true);
    });
  }
}, [hasCompletedOnboarding]);

// Add before main content:
{showOnboarding && (
  <OnboardingGuide onComplete={() => {
    window.electronAPI.grantConsent();
    setShowOnboarding(false);
    setHasCompletedOnboarding(true);
  }} />
)}
```

- [ ] **Step 6: Add state to appStore**

In `src/renderer/stores/appStore.ts`:
```typescript
interface AppState {
  // ... existing
  hasCompletedOnboarding: boolean;
}

// Add to initial state
hasCompletedOnboarding: localStorage.getItem('onboardingCompleted') === 'true',

// Add action
setHasCompletedOnboarding: (value: boolean) => {
  set({ hasCompletedOnboarding: value });
  if (value) localStorage.setItem('onboardingCompleted', 'true');
},
```

- [ ] **Step 7: Run tests and verify pass**

Run: `npm test -- OnboardingGuide.test.tsx`

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/OnboardingGuide.tsx src/renderer/components/OnboardingGuide.css src/renderer/App.tsx src/renderer/stores/appStore.ts tests/renderer/components/OnboardingGuide.test.tsx
git commit -m "feat: add onboarding guide for first-time users"
```

---

## Subsystem 3: Broken Features Fixes

### Task 4: Working Theme Toggle

**Files:**
- Create: `src/renderer/components/ThemeToggle.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/preload/index.ts` (add settings methods)
- Modify: `src/service/ipc-handlers.ts` (add settings handlers)
- Modify: `src/service/db.ts` (add settings table)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/renderer/components/ThemeToggle.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '../../components/ThemeToggle';

describe('ThemeToggle', () => {
  it('toggles theme when clicked', async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');

    // Theme should start as dark
    expect(document.documentElement.dataset.theme).toBe('dark');

    fireEvent.click(button);

    // After click should be light
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ThemeToggle.test.tsx`
Expected: FAIL

- [ ] **Step 3: Add settings table to db.ts**

In `src/service/db.ts`:
```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);
```

- [ ] **Step 4: Add IPC handlers for settings**

In `src/service/ipc-handlers.ts`:
```typescript
ipc.handle('get-settings', async () => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return rows.reduce((acc, row) => {
    acc[row.key] = JSON.parse(row.value);
    return acc;
  }, {} as Record<string, unknown>);
});

ipc.handle('save-settings', async (_, settings: Record<string, unknown>) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, JSON.stringify(value));
    }
  });
  tx();
});
```

- [ ] **Step 5: Add ElectronAPI methods**

In `src/preload/index.ts`:
```typescript
interface ElectronAPI {
  // ... existing
  getSettings: () => Promise<Record<string, unknown>>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
}

// In implementation:
getSettings: () => ipcRenderer.invoke('get-settings'),
saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
```

- [ ] **Step 6: Write ThemeToggle component**

```tsx
// src/renderer/components/ThemeToggle.tsx
import { useState, useEffect } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    window.electronAPI.getSettings().then(settings => {
      if (settings.theme) {
        setTheme(settings.theme as 'dark' | 'light');
        document.documentElement.dataset.theme = settings.theme as string;
      }
    });
  }, []);

  const toggle = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.dataset.theme = newTheme;
    await window.electronAPI.saveSettings({ theme: newTheme });
  };

  return (
    <button
      className="btn btn-secondary theme-toggle"
      onClick={toggle}
      title={`当前: ${theme === 'dark' ? '深色' : '浅色'}模式，点击切换`}
    >
      {theme === 'dark' ? '🌙' : '☀️'} {theme === 'dark' ? '深色' : '浅色'}
    </button>
  );
}
```

- [ ] **Step 7: Add CSS for light theme**

In `src/renderer/styles.css`, add:
```css
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e5e5e5;
  --text-primary: #171717;
  --text-secondary: #525252;
  --border: #d4d4d4;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 8: Wire into Settings.tsx**

In `src/renderer/pages/Settings.tsx`, add ThemeToggle to the settings list:
```tsx
import { ThemeToggle } from '../components/ThemeToggle';

// In render:
<div className="settings-item">
  <ThemeToggle />
</div>
```

- [ ] **Step 9: Run tests and commit**

Run: `npm test -- ThemeToggle.test.tsx`

- [ ] **Step 10: Commit**

```bash
git add src/renderer/components/ThemeToggle.tsx src/renderer/styles.css src/service/db.ts src/service/ipc-handlers.ts src/preload/index.ts src/renderer/pages/Settings.tsx
git commit -m "fix: implement working theme toggle with persistence"
```

---

### Task 5: Export/Import Data

**Files:**
- Modify: `src/service/db.ts` (add export/import methods)
- Create: `tests/service/db-export.test.ts`
- Modify: `src/renderer/pages/Settings.tsx` (implement buttons)

- [ ] **Step 1: Add export/import methods to db.ts**

```typescript
// src/service/db.ts - add these functions

export function exportData(): {
  accounts: Account[];
  tasks: Task[];
  groups: Group[];
  selectors: Selector[];
} {
  return {
    accounts: db.prepare('SELECT * FROM accounts').all() as Account[],
    tasks: db.prepare('SELECT * FROM tasks').all() as Task[],
    groups: db.prepare('SELECT * FROM groups').all() as Group[],
    selectors: db.prepare('SELECT * FROM selectors').all() as Selector[],
  };
}

export function importData(data: ReturnType<typeof exportData>): void {
  const tx = db.transaction(() => {
    // Clear existing data (except credentials for security)
    db.exec('DELETE FROM accounts; DELETE FROM tasks; DELETE FROM groups;');

    // Re-import accounts
    const accountStmt = db.prepare(`
      INSERT INTO accounts (id, platform, username, displayName, status, lastUsedAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const account of data.accounts) {
      accountStmt.run(
        account.id, account.platform, account.username,
        account.displayName, account.status, account.lastUsedAt, account.createdAt
      );
    }

    // Re-import tasks
    const taskStmt = db.prepare(`
      INSERT INTO tasks (id, type, platform, accountIds, payload, status, scheduledAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const task of data.tasks) {
      taskStmt.run(
        task.id, task.type, task.platform,
        JSON.stringify(task.accountIds),
        JSON.stringify(task.payload),
        task.status, task.scheduledAt, task.createdAt
      );
    }

    // Re-import groups
    const groupStmt = db.prepare(`
      INSERT INTO groups (id, name, platform, accountIds, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const group of data.groups) {
      groupStmt.run(
        group.id, group.name, group.platform,
        JSON.stringify(group.accountIds), group.createdAt
      );
    }
  });

  tx();
}
```

- [ ] **Step 2: Add IPC handlers**

In `src/service/ipc-handlers.ts`:
```typescript
ipc.handle('export-data', async () => {
  const { exportData } = await import('./db');
  return exportData();
});

ipc.handle('import-data', async (_, data) => {
  const { importData } = await import('./db');
  importData(data);
});

ipc.handle('clear-all-data', async () => {
  db.exec('DELETE FROM accounts; DELETE FROM tasks; DELETE FROM groups;');
});
```

- [ ] **Step 3: Add ElectronAPI methods**

In `src/preload/index.ts`:
```typescript
exportData: () => Promise<ReturnType<typeof exportData>>;
importData: (data: ReturnType<typeof exportData>) => Promise<void>;
clearAllData: () => Promise<void>;

// In implementation:
exportData: () => ipcRenderer.invoke('export-data'),
importData: (data) => ipcRenderer.invoke('import-data', data),
clearAllData: () => ipcRenderer.invoke('clear-all-data'),
```

- [ ] **Step 4: Implement ExportImport in Settings.tsx**

Create a section in Settings.tsx:
```tsx
const [exportStatus, setExportStatus] = useState('');

const handleExport = async () => {
  try {
    const data = await window.electronAPI.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matrixhub-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus('导出成功！');
  } catch (err) {
    setExportStatus('导出失败');
  }
};

const handleImport = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await window.electronAPI.importData(data);
      setExportStatus('导入成功！请刷新页面。');
    } catch {
      setExportStatus('导入失败');
    }
  };
  input.click();
};
```

- [ ] **Step 5: Add buttons to Settings.tsx render**

```tsx
<div className="settings-section">
  <h3>📦 数据备份</h3>
  <div className="settings-row">
    <button className="btn btn-secondary" onClick={handleExport}>
      📥 导出数据
    </button>
    <button className="btn btn-secondary" onClick={handleImport}>
      📤 导入数据
    </button>
  </div>
  {exportStatus && <p className="status-text">{exportStatus}</p>}
</div>
```

- [ ] **Step 6: Commit**

```bash
git add src/service/db.ts src/service/ipc-handlers.ts src/preload/index.ts src/renderer/pages/Settings.tsx
git commit -m "fix: implement working export/import data functionality"
```

---

### Task 6: Password Strength + Credential Help

**Files:**
- Modify: `src/renderer/pages/AccountManagement.tsx`

- [ ] **Step 1: Add password strength indicator**

In `AccountManagement.tsx` AddAccountModal section, add state:
```tsx
const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | null>(null);

const checkPasswordStrength = (pwd: string) => {
  if (!pwd) { setPasswordStrength(null); return; }
  if (pwd.length < 6) { setPasswordStrength('weak'); return; }
  if (pwd.length >= 12 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) {
    setPasswordStrength('strong');
  } else {
    setPasswordStrength('medium');
  }
};
```

After password input field, add:
```tsx
{passwordStrength && (
  <div className="password-strength">
    <div className={`strength-bar ${passwordStrength}`} />
    <span className="strength-label">
      {passwordStrength === 'weak' && '弱'}
      {passwordStrength === 'medium' && '中等'}
      {passwordStrength === 'strong' && '强'}
    </span>
  </div>
)}
```

Add CSS class to styles.css:
```css
.password-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.strength-bar {
  height: 4px;
  flex: 1;
  max-width: 120px;
  border-radius: 2px;
  background: var(--border);
}

.strength-bar.weak { background: #ef4444; width: 33%; }
.strength-bar.medium { background: #f59e0b; width: 66%; }
.strength-bar.strong { background: #22c55e; width: 100%; }
```

- [ ] **Step 2: Add credential help text**

After username input:
```tsx
<div className="field-help">
  💡 支持平台账号密码或Cookie（格式：key=value; key=value）
</div>
```

Add CSS:
```css
.field-help {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
```

- [ ] **Step 3: Add password change listener**

```tsx
<input
  type="password"
  placeholder="输入密码"
  value={password}
  onChange={e => {
    setPassword(e.target.value);
    checkPasswordStrength(e.target.value);
  }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/AccountManagement.tsx src/renderer/styles.css
git commit -m "fix: add password strength indicator and credential help"
```

---

## Subsystem 4: Error Handling Improvements

### Task 7: Toast Component Enhancement

**Files:**
- Modify: `src/renderer/components/Toast.tsx`
- Create: `src/renderer/components/Toast.css`

- [ ] **Step 1: Review current Toast implementation**

Read `src/renderer/components/Toast.tsx` to understand current structure.

- [ ] **Step 2: Write enhanced Toast**

```tsx
// src/renderer/components/Toast.tsx
import { useEffect, useState } from 'react';
import './Toast.css';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

export function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div className={`toast toast-${toast.type} ${exiting ? 'exiting' : ''}`}>
      <span className="toast-icon">{ICONS[toast.type]}</span>
      <div className="toast-content">
        <strong className="toast-title">{toast.title}</strong>
        {toast.message && <p className="toast-message">{toast.message}</p>}
      </div>
      <button className="toast-close" onClick={() => onDismiss(toast.id)}>×</button>
    </div>
  );
}
```

- [ ] **Step 3: Add Toast CSS**

```css
/* src/renderer/components/Toast.css */
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10000;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  min-width: 280px;
  max-width: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.2s ease-out;
}

.toast.exiting {
  animation: slideOut 0.2s ease-in forwards;
}

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}

.toast-success { background: #166534; border: 1px solid #22c55e; }
.toast-error { background: #991b1b; border: 1px solid #ef4444; }
.toast-warning { background: #854d0e; border: 1px solid #f59e0b; }
.toast-info { background: #1e40af; border: 1px solid #3b82f6; }

.toast-icon { font-size: 18px; }
.toast-content { flex: 1; }
.toast-title { display: block; font-size: 14px; }
.toast-message { font-size: 12px; opacity: 0.8; margin-top: 4px; }
.toast-close { background: none; border: none; color: inherit; font-size: 18px; cursor: pointer; }
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Toast.tsx src/renderer/components/Toast.css
git commit -m "fix: enhance toast with icons, details, and animations"
```

---

### Task 8: Confirmation Modal for Dangerous Actions

**Files:**
- Create: `src/renderer/components/ConfirmModal.tsx`
- Create: `src/renderer/components/ConfirmModal.css`
- Modify: `src/renderer/pages/Settings.tsx` (use for clear data)

- [ ] **Step 1: Create ConfirmModal component**

```tsx
// src/renderer/components/ConfirmModal.tsx
import './ConfirmModal.css';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn btn-${variant}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

CSS:
```css
/* src/renderer/components/ConfirmModal.css */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.confirm-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
}

.confirm-modal h3 {
  margin-bottom: 12px;
}

.confirm-modal p {
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn-danger {
  background: #dc2626;
  color: white;
}
```

- [ ] **Step 2: Wire up in Settings page for "Clear All Data"**

In `src/renderer/pages/Settings.tsx`:
```tsx
const [showClearConfirm, setShowClearConfirm] = useState(false);

// Find the clear data button and change to:
<button
  className="btn btn-danger"
  onClick={() => setShowClearConfirm(true)}
>
  🗑️ 清除所有数据
</button>

// Add modal at end of component:
{showClearConfirm && (
  <ConfirmModal
    title="确认清除所有数据？"
    message="此操作不可恢复。所有账号、任务和设置都将被永久删除。"
    confirmLabel="确认清除"
    onConfirm={async () => {
      await window.electronAPI.clearAllData();
      setShowClearConfirm(false);
    }}
    onCancel={() => setShowClearConfirm(false)}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ConfirmModal.tsx src/renderer/components/ConfirmModal.css src/renderer/pages/Settings.tsx
git commit -m "fix: add confirmation modal for dangerous actions"
```

---

## Subsystem 5: Consumer Features

### Task 9: Content Moderation for AI Generation

**Files:**
- Create: `src/service/content-moderator.ts`
- Create: `tests/service/content-moderator.test.ts`
- Modify: `src/service/handlers/ai-generate-handler.ts`

- [ ] **Step 1: Write content moderator**

```typescript
// src/service/content-moderator.ts

// Basic blocked patterns - minimal set for demonstration
const BLOCKED_PATTERNS = [
  '赌博', '博彩', '彩票', '裸聊', '援交', '色情', '黄色',
  '毒品', '大麻', '冰毒', '自杀', '自残',
];

const SENSITIVE_TOPICS = [
  '政治', '领导人', '示威', '游行', '抗议',
];

interface ModerationResult {
  passed: boolean;
  reasons: string[];
}

export function moderateContent(content: string): ModerationResult {
  const reasons: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const pattern of BLOCKED_PATTERNS) {
    if (lowerContent.includes(pattern)) {
      reasons.push(`包含敏感词: ${pattern}`);
    }
  }

  for (const topic of SENSITIVE_TOPICS) {
    if (lowerContent.includes(topic)) {
      reasons.push(`可能涉及敏感话题: ${topic}`);
    }
  }

  // Check for excessive repetition
  const words = content.split(/\s+/);
  if (words.length > 20) {
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    if (uniqueWords.size / words.length < 0.3) {
      reasons.push('内容重复度过高');
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}
```

- [ ] **Step 2: Write tests**

```typescript
// tests/service/content-moderator.test.ts
import { moderateContent } from '../../service/content-moderator';

describe('ContentModerator', () => {
  it('passes normal content', () => {
    const result = moderateContent('今天天气真好，适合出门散步');
    expect(result.passed).toBe(true);
  });

  it('blocks content with blocked patterns', () => {
    const result = moderateContent('这是一个正常内容包含赌博的信息');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('敏感词');
  });

  it('detects excessive repetition', () => {
    const repeated = Array(10).fill('测试').join(' ');
    const result = moderateContent(repeated);
    expect(result.passed).toBe(false);
  });
});
```

- [ ] **Step 3: Wire into AI generate handler**

In `src/service/handlers/ai-generate-handler.ts`:
```typescript
import { moderateContent } from '../content-moderator';

// In the generate function, before calling AI:
const content = payload.content || payload.topic || '';
const moderation = moderateContent(content);
if (!moderation.passed) {
  return {
    success: false,
    error: `内容审核未通过: ${moderation.reasons.join(', ')}`,
  };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- content-moderator.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/service/content-moderator.ts src/service/handlers/ai-generate-handler.ts tests/service/content-moderator.test.ts
git commit -m "feat: add content moderation for AI generation"
```

---

### Task 10: AI Connection Status Indicator

**Files:**
- Create: `src/renderer/components/AIStatusIndicator.tsx`
- Create: `src/renderer/components/AIStatusIndicator.css`
- Modify: `src/renderer/pages/AICreation/index.tsx`

- [ ] **Step 1: Create AI status indicator**

```tsx
// src/renderer/components/AIStatusIndicator.tsx
import { useState, useEffect } from 'react';
import './AIStatusIndicator.css';

interface AIStatus {
  connected: boolean;
  provider?: string;
  error?: string;
}

export function AIStatusIndicator() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.testAIConnection()
      .then(result => setStatus(result))
      .catch(err => setStatus({ connected: false, error: err.message }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <span className="ai-status loading">⏳ 检测中...</span>;

  if (!status?.connected) {
    return (
      <span className="ai-status error" title={status?.error}>
        ❌ AI未连接
      </span>
    );
  }

  return (
    <span className="ai-status success">
      ✅ AI已连接
    </span>
  );
}
```

CSS:
```css
/* src/renderer/components/AIStatusIndicator.css */
.ai-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.ai-status.loading { color: var(--text-secondary); }
.ai-status.success { color: #22c55e; background: rgba(34, 197, 94, 0.1); }
.ai-status.error { color: #ef4444; background: rgba(239, 68, 68, 0.1); cursor: pointer; }
```

- [ ] **Step 2: Wire into AICreation page**

In `src/renderer/pages/AICreation/index.tsx`, add after page title:
```tsx
import { AIStatusIndicator } from '../../components/AIStatusIndicator';

// In header area:
<header>
  <h1>AI 创作</h1>
  <AIStatusIndicator />
</header>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/AIStatusIndicator.tsx src/renderer/components/AIStatusIndicator.css src/renderer/pages/AICreation/index.tsx
git commit -m "feat: add AI connection status indicator"
```

---

### Task 11: Rate Limit Status Display

**Files:**
- Modify: `src/service/rate-limiter.ts` (ensure getStatus method exists)
- Create: `src/renderer/components/RateLimitStatus.tsx`
- Create: `src/renderer/components/RateLimitStatus.css`
- Modify: `src/renderer/pages/ContentManagement/index.tsx`

- [ ] **Step 1: Review rate limiter API**

Read `src/service/rate-limiter.ts`:
- `getStatus(platform: Platform)` returns `{ minute, hour, day }` for a single platform
- IPC handler `rate:status` in `ipc-handlers.ts` takes `{ platform }` parameter
- The new IPC handler needs to return status for ALL platforms at once

- [ ] **Step 2: Add IPC handler for all-platform status**

In `src/service/ipc-handlers.ts`, add:
```typescript
ipc.handle('rate:status-all', async () => {
  const platforms: Platform[] = ['douyin', 'kuaishou', 'xiaohongshu'];
  const result: Record<string, ReturnType<typeof rateLimiter.getStatus>> = {};
  for (const platform of platforms) {
    result[platform] = rateLimiter.getStatus(platform);
  }
  return result;
});
```

- [ ] **Step 3: Add ElectronAPI method**

In `src/preload/index.ts`:
```typescript
getRateLimitStatusAll: () => Promise<Record<string, {
  minute: { remaining: number; resetAt: number };
  hour: { remaining: number; resetAt: number };
  day: { remaining: number; resetAt: number };
}>>;
```

And in implementation:
```typescript
getRateLimitStatusAll: () => ipcRenderer.invoke('rate:status-all'),
```

- [ ] **Step 4: Create RateLimitStatus component**

```tsx
// src/renderer/components/RateLimitStatus.tsx
import { useState, useEffect } from 'react';
import './RateLimitStatus.css';

interface RateLimitData {
  minute: { remaining: number };
  hour: { remaining: number };
  day: { remaining: number };
}

export function RateLimitStatus() {
  const [status, setStatus] = useState<Record<string, RateLimitData>>({});

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await window.electronAPI.getRateLimitStatusAll();
        setStatus(result);
      } catch {
        // Silently fail - rate limit status is non-critical
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const platforms = Object.keys(status);
  if (platforms.length === 0) return null;

  return (
    <div className="rate-limit-status">
      {platforms.map(platform => {
        const data = status[platform];
        const minutePercent = (data.minute.remaining / 10) * 100;

        return (
          <div key={platform} className="rate-platform">
            <span className="platform-name">{platform}</span>
            <div className="rate-bar-container">
              <div className="rate-bar">
                <div className="rate-fill minute" style={{ width: `${minutePercent}%` }} />
              </div>
              <span className="rate-text">{data.minute.remaining}/10</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

CSS:
```css
/* src/renderer/components/RateLimitStatus.css */
.rate-limit-status {
  display: flex;
  gap: 16px;
  font-size: 12px;
}

.rate-platform {
  display: flex;
  align-items: center;
  gap: 8px;
}

.platform-name {
  font-weight: 500;
}

.rate-bar-container {
  display: flex;
  align-items: center;
  gap: 4px;
}

.rate-bar {
  width: 60px;
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.rate-fill {
  height: 100%;
  background: var(--color-primary);
}

.rate-text {
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Add to ContentManagement page**

In `src/renderer/pages/ContentManagement/index.tsx`:
```tsx
import { RateLimitStatus } from '../../components/RateLimitStatus';

// Add in header area:
<div className="page-header">
  <h1>内容管理</h1>
  <RateLimitStatus />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/RateLimitStatus.tsx src/renderer/components/RateLimitStatus.css src/renderer/pages/ContentManagement/index.tsx
git commit -m "feat: add rate limit status display"
```

---

### Task 12: Draft Saving for Task Creation

**Files:**
- Modify: `src/renderer/stores/appStore.ts`
- Modify: `src/renderer/pages/ContentManagement/components/CreateTaskModal.tsx`

- [ ] **Step 1: Add draft storage to appStore**

In `src/renderer/stores/appStore.ts`:
```typescript
interface TaskDraft {
  title: string;
  content: string;
  platform: string;
  accountIds: string[];
}

interface AppState {
  // ... existing
  taskDraft: TaskDraft | null;
}

// Add to initial state:
const savedDraft = localStorage.getItem('taskDraft');
const taskDraft = savedDraft ? JSON.parse(savedDraft) : null;

// Add to state:
taskDraft,

// Add actions:
setTaskDraft: (draft: TaskDraft | null) => {
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
```

- [ ] **Step 2: Use draft in CreateTaskModal**

In `src/renderer/pages/ContentManagement/components/CreateTaskModal.tsx`:
```tsx
const { taskDraft, setTaskDraft, clearTaskDraft } = useAppStore();
const [initializedFromDraft, setInitializedFromDraft] = useState(false);

// Pre-fill from draft
useEffect(() => {
  if (taskDraft && !initializedFromDraft && !title && !content) {
    setTitle(taskDraft.title);
    setContent(taskDraft.content);
    if (taskDraft.platform) setSelectedPlatform(taskDraft.platform);
    if (taskDraft.accountIds.length) setSelectedAccounts(taskDraft.accountIds);
    setInitializedFromDraft(true);
  }
}, [taskDraft, initializedFromDraft]);

// Auto-save on changes
useEffect(() => {
  if (title || content) {
    setTaskDraft({ title, content, platform: selectedPlatform, accountIds: selectedAccounts });
  }
}, [title, content, selectedPlatform, selectedAccounts]);

// Clear draft on successful submit
const handleSubmit = async () => {
  // ... existing logic
  await handleCreateTask();
  clearTaskDraft();
};
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/appStore.ts src/renderer/pages/ContentManagement/components/CreateTaskModal.tsx
git commit -m "feat: add draft saving for task creation"
```

---

### Task 13: Search and Duplicate for Tasks

**Files:**
- Modify: `src/renderer/pages/ContentManagement/index.tsx`
- Modify: `src/renderer/pages/ContentManagement/components/TaskRow.tsx`

- [ ] **Step 1: Add search bar to ContentManagement**

In `src/renderer/pages/ContentManagement/index.tsx`:
```tsx
const [searchQuery, setSearchQuery] = useState('');

// Filter tasks:
const filteredTasks = tasks.filter(task => {
  if (!searchQuery) return true;
  const query = searchQuery.toLowerCase();
  const title = task.payload?.title?.toLowerCase() || '';
  const content = task.payload?.content?.toLowerCase() || '';
  return title.includes(query) || content.includes(query);
});

// Add search input in render:
<div className="content-header">
  <div className="search-bar">
    <input
      type="text"
      placeholder="🔍 搜索任务..."
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
    />
  </div>
</div>
```

Add CSS:
```css
.search-bar input {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
}
```

- [ ] **Step 2: Add duplicate action to TaskRow**

In `src/renderer/pages/ContentManagement/components/TaskRow.tsx`:
```tsx
interface TaskRowProps {
  // ... existing
  onDuplicate?: (task: Task) => void;
}

// Add button:
<button
  className="btn btn-icon"
  title="复制任务"
  onClick={() => onDuplicate?.(task)}
>
  📋
</button>
```

- [ ] **Step 3: Wire duplicate in parent**

In `src/renderer/pages/ContentManagement/index.tsx`:
```tsx
const handleDuplicate = (task: Task) => {
  setTitle(task.payload?.title || '');
  setContent(task.payload?.content || '');
  setSelectedPlatform(task.platform);
  openCreateModal();
};

// Pass to TaskRow:
<TaskRow
  // ... existing props
  onDuplicate={handleDuplicate}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/ContentManagement/index.tsx src/renderer/pages/ContentManagement/components/TaskRow.tsx
git commit -m "feat: add task search and duplicate functionality"
```

---

## Summary

| Task | Subsystem | Files | Priority |
|------|-----------|-------|----------|
| 1 | ConsentSystem | ConsentDialog.tsx/css, ConsentDialog.test.tsx | CRITICAL |
| 2 | ConsentSystem | consent-manager.ts, db.ts, ipc-handlers.ts, preload | CRITICAL |
| 3 | OnboardingFlow | OnboardingGuide.tsx/css, App.tsx, appStore.ts | HIGH |
| 4 | BrokenFeatures | ThemeToggle.tsx, styles.css, db.ts, ipc-handlers.ts | HIGH |
| 5 | BrokenFeatures | db.ts, ipc-handlers.ts, Settings.tsx | HIGH |
| 6 | BrokenFeatures | AccountManagement.tsx | MEDIUM |
| 7 | ErrorHandling | Toast.tsx, Toast.css | MEDIUM |
| 8 | ErrorHandling | ConfirmModal.tsx/css, Settings.tsx | MEDIUM |
| 9 | ConsumerFeatures | content-moderator.ts, ai-generate-handler.ts | HIGH |
| 10 | ConsumerFeatures | AIStatusIndicator.tsx/css, AICreation/index.tsx | MEDIUM |
| 11 | ConsumerFeatures | RateLimitStatus.tsx/css, ContentManagement/index.tsx | MEDIUM |
| 12 | ConsumerFeatures | appStore.ts, CreateTaskModal.tsx | MEDIUM |
| 13 | ConsumerFeatures | ContentManagement/index.tsx, TaskRow.tsx | LOW |

**Total: 13 tasks across 5 subsystems**
