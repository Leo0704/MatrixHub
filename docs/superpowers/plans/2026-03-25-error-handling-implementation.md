# Error Handling Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add React Error Boundary, unified error types, error reporter interface, and fix empty catch blocks.

**Architecture:** Layered approach - error types first, then React ErrorBoundary, ErrorContext, ErrorBar, UnifiedErrorHandler, ErrorReporter interface.

**Tech Stack:** React ErrorBoundary, electron-log, TypeScript

---

## File Structure

```
src/
├── shared/
│   └── errors.ts              # NEW: Error types and AppError class
├── renderer/
│   ├── components/
│   │   ├── ErrorBoundary.tsx  # NEW: React Error Boundary
│   │   ├── ErrorBoundary.css   # NEW: Error Boundary styles
│   │   └── ErrorBar.tsx        # NEW: Error notification bar
│   ├── contexts/
│   │   └── ErrorContext.tsx   # NEW: Global error context
│   ├── App.tsx                 # MODIFY: Wrap with ErrorBoundary
│   └── stores/
│       └── appStore.ts         # MODIFY: Fix empty catch block
├── service/
│   ├── unified-error-handler.ts  # NEW: Centralized error handler
│   └── error-reporter.ts        # NEW: Error reporter interface
└── handlers/
    └── automation-handler.ts     # MODIFY: Fix empty catch block
```

---

## Task 1: Error Types (src/shared/errors.ts)

**Files:**
- Create: `src/shared/errors.ts`

- [ ] **Step 1: Write AppError class and ErrorCode enum**

```typescript
// src/shared/errors.ts
export enum ErrorCode {
  // Network
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',

  // Auth
  SESSION_EXPIRED = 'session_expired',
  LOGIN_REQUIRED = 'login_required',

  // Validation
  INVALID_INPUT = 'invalid_input',

  // Business
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  CONTENT_MODERATION_FAILED = 'content_moderation_failed',

  // Automation
  SELECTOR_ERROR = 'selector_error',
  AUTOMATION_ERROR = 'automation_error',
  ELEMENT_NOT_FOUND = 'element_not_found',
  PAGE_ACTION_FAILED = 'page_action_failed',

  // System
  UNKNOWN_ERROR = 'unknown_error',
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/shared/errors.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/errors.ts
git commit -m "feat: add AppError class and ErrorCode enum"
```

---

## Task 2: Error Reporter Interface (src/service/error-reporter.ts)

**Files:**
- Create: `src/service/error-reporter.ts`

- [ ] **Step 1: Write error reporter interface**

```typescript
// src/service/error-reporter.ts
import { AppError } from '../../shared/errors.js';

export interface ErrorReporter {
  capture(error: AppError, context?: Record<string, unknown>): void;
  captureMessage(message: string, level: 'info' | 'warn' | 'error'): void;
}

// Global error reporter instance
let _reporter: ErrorReporter = new ConsoleReporter();

export function setErrorReporter(reporter: ErrorReporter): void {
  _reporter = reporter;
}

export const errorReporter: ErrorReporter = {
  capture(error: AppError, context?: Record<string, unknown>) {
    _reporter.capture(error, context);
  },
  captureMessage(message: string, level: 'info' | 'warn' | 'error') {
    _reporter.captureMessage(message, level);
  },
};

export class ConsoleReporter implements ErrorReporter {
  capture(error: AppError, context?: Record<string, unknown>) {
    console.error('[ErrorReporter]', error.message, { code: error.code, context });
  }
  captureMessage(message: string, level: 'info' | 'warn' | 'error') {
    console[level]('[ErrorReporter]', message);
  }
}

export class SentryReporter implements ErrorReporter {
  capture(error: AppError, context?: Record<string, unknown>) {
    Sentry.captureException(error, { extra: context });
  }
  captureMessage(message: string, level: 'info' | 'warn' | 'error') {
    Sentry.captureMessage(message, level);
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/service/error-reporter.ts`

Expected: No errors (will show warning about Sentry not being installed, that's OK)

- [ ] **Step 3: Commit**

```bash
git add src/service/error-reporter.ts
git commit -m "feat: add error reporter interface with ConsoleReporter and SentryReporter"
```

---

## Task 3: Unified Error Handler (src/service/unified-error-handler.ts)

**Files:**
- Create: `src/service/unified-error-handler.ts`

- [ ] **Step 1: Write unified error handler**

```typescript
// src/service/unified-error-handler.ts
import log from 'electron-log';
import { AppError, ErrorCode } from '../../shared/errors.js';
import { errorReporter } from './error-reporter.js';

interface CategorizedError {
  message: string;
  code: ErrorCode;
}

export function categorizeError(error: Error | unknown): CategorizedError {
  if (error instanceof AppError) {
    return { message: error.message, code: error.code };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('timeout')) {
      return { message: error.message, code: ErrorCode.TIMEOUT };
    }
    if (msg.includes('fetch') || msg.includes('network')) {
      return { message: error.message, code: ErrorCode.NETWORK_ERROR };
    }
    if (msg.includes('login') || msg.includes('session') || msg.includes('登录')) {
      return { message: error.message, code: ErrorCode.SESSION_EXPIRED };
    }
    if (msg.includes('rate limit') || msg.includes('限流')) {
      return { message: error.message, code: ErrorCode.RATE_LIMIT_EXCEEDED };
    }
    if (msg.includes('selector') || msg.includes('element') || msg.includes('元素')) {
      return { message: error.message, code: ErrorCode.SELECTOR_ERROR };
    }
    if (msg.includes('not found') || msg.includes('找不到')) {
      return { message: error.message, code: ErrorCode.ELEMENT_NOT_FOUND };
    }
  }

  return { message: 'Unknown error', code: ErrorCode.UNKNOWN_ERROR };
}

export function handleError(error: Error | unknown, context: string): AppError {
  const categorized = categorizeError(error);
  const appError = new AppError(
    categorized.message,
    categorized.code,
    error instanceof Error ? error : undefined
  );

  // Log to electron-log
  log.error(`[${context}]`, { code: appError.code, message: appError.message });

  // Report to error reporter
  errorReporter.capture(appError, { context });

  return appError;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/service/unified-error-handler.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/service/unified-error-handler.ts
git commit -m "feat: add unified error handler with categorizeError"
```

---

## Task 4: ErrorBoundary Component (src/renderer/components/ErrorBoundary.tsx)

**Files:**
- Create: `src/renderer/components/ErrorBoundary.tsx`
- Create: `src/renderer/components/ErrorBoundary.css`

- [ ] **Step 1: Write ErrorBoundary component**

```typescript
// src/renderer/components/ErrorBoundary.tsx
import { Component, type ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>出错了</h2>
            <p>应用遇到了一些问题，请尝试刷新页面。</p>
            <button onClick={() => window.location.reload()}>刷新页面</button>
            {this.state.error && (
              <details className="error-details">
                <summary>错误详情</summary>
                <pre>{this.state.error.message}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Write ErrorBoundary CSS**

```css
/* src/renderer/components/ErrorBoundary.css */
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-base, #0a0a0b);
  color: var(--text-primary, #fafafa);
}

.error-boundary-content {
  text-align: center;
  padding: 2rem;
  max-width: 400px;
}

.error-boundary h2 {
  margin: 0 0 1rem;
  color: var(--error, #ef4444);
}

.error-boundary button {
  padding: 0.5rem 1rem;
  background: var(--primary, #3b82f6);
  color: white;
  border: none;
  border-radius: var(--radius-md, 6px);
  cursor: pointer;
  margin-top: 1rem;
}

.error-details {
  margin-top: 1rem;
  text-align: left;
}

.error-details pre {
  background: var(--bg-elevated, #18181b);
  padding: 1rem;
  border-radius: var(--radius-sm, 4px);
  overflow: auto;
  font-size: 0.75rem;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/renderer/components/ErrorBoundary.tsx`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ErrorBoundary.tsx src/renderer/components/ErrorBoundary.css
git commit -m "feat: add React ErrorBoundary component"
```

---

## Task 5: ErrorContext (src/renderer/contexts/ErrorContext.tsx)

**Files:**
- Create: `src/renderer/contexts/ErrorContext.tsx`

- [ ] **Step 1: Write ErrorContext**

```typescript
// src/renderer/contexts/ErrorContext.tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AppError } from '../../shared/errors';

export interface ErrorContextValue {
  errors: AppError[];
  addError: (error: AppError) => void;
  dismissError: (index: number) => void;
  clearErrors: () => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function useError() {
  const context = useContext(ErrorContext);
  if (!context) {
    return {
      errors: [],
      addError: () => {},
      dismissError: () => {},
      clearErrors: () => {},
    };
  }
  return context;
}

interface ErrorProviderProps {
  children: ReactNode;
}

export function ErrorProvider({ children }: ErrorProviderProps) {
  const [errors, setErrors] = useState<AppError[]>([]);

  const addError = useCallback((error: AppError) => {
    setErrors(prev => [...prev.slice(-49), error]); // Keep max 50 errors
  }, []);

  const dismissError = useCallback((index: number) => {
    setErrors(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return (
    <ErrorContext.Provider value={{ errors, addError, dismissError, clearErrors }}>
      {children}
    </ErrorContext.Provider>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/renderer/contexts/ErrorContext.tsx`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/contexts/ErrorContext.tsx
git commit -m "feat: add ErrorContext for global error state"
```

---

## Task 6: ErrorBar Component (src/renderer/components/ErrorBar.tsx)

**Files:**
- Create: `src/renderer/components/ErrorBar.tsx`

- [ ] **Step 1: Write ErrorBar component**

```typescript
// src/renderer/components/ErrorBar.tsx
import { useEffect, useState } from 'react';
import { AppError } from '../../shared/errors';

export interface ErrorBarProps {
  error: AppError;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function ErrorBar({ error, onDismiss, autoDismissMs = 5000 }: ErrorBarProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 200);
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 200);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`${error.code}: ${error.message}`);
  };

  return (
    <div className={`error-bar ${exiting ? 'exiting' : ''}`} role="alert">
      <span className="error-bar-icon">⚠️</span>
      <div className="error-bar-content">
        <strong>错误</strong>
        <span className="error-bar-message">{error.message}</span>
      </div>
      <button className="error-bar-copy" onClick={handleCopy} title="复制错误">📋</button>
      <button className="error-bar-close" onClick={handleDismiss} title="关闭">×</button>
    </div>
  );
}
```

- [ ] **Step 2: Add ErrorBar styles to existing styles.css**

Add to `src/renderer/styles.css`:

```css
/* Error Bar */
.error-bar {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--error, #ef4444);
  color: white;
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  animation: slideIn 0.2s ease-out;
}

.error-bar.exiting {
  animation: slideOut 0.2s ease-in forwards;
}

.error-bar-icon {
  font-size: 1.25rem;
}

.error-bar-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-bar-message {
  font-size: 0.875rem;
  opacity: 0.9;
}

.error-bar-copy,
.error-bar-close {
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px 8px;
  opacity: 0.7;
}

.error-bar-copy:hover,
.error-bar-close:hover {
  opacity: 1;
}

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/renderer/components/ErrorBar.tsx`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ErrorBar.tsx src/renderer/styles.css
git commit -m "feat: add ErrorBar component for error notifications"
```

---

## Task 7: Integrate ErrorBoundary in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Read App.tsx to understand current structure**

Run: `head -20 src/renderer/App.tsx`

- [ ] **Step 2: Add ErrorBoundary wrapper**

Add to imports:
```typescript
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorProvider } from './contexts/ErrorContext';
```

Wrap the app content (around line 15 after function App()):

```tsx
return (
  <ErrorProvider>
    <ErrorBoundary>
      {/* existing app content */}
    </ErrorBoundary>
  </ErrorProvider>
);
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/renderer/App.tsx`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: integrate ErrorBoundary and ErrorProvider in App"
```

---

## Task 8: Fix Empty Catch Blocks

**Files:**
- Modify: `src/renderer/stores/appStore.ts` (around line 53-58)
- Modify: `src/service/handlers/automation-handler.ts` (around line 158-159)

- [ ] **Step 1: Fix appStore.ts empty catch**

Find:
```typescript
} catch {
  setTaskDraft(null);
}
```

Replace with:
```typescript
} catch (err) {
  console.error('Failed to load task draft:', err);
  setTaskDraft(null);
}
```

- [ ] **Step 2: Fix automation-handler.ts empty catch**

Find the empty catch around line 158:
```typescript
} catch {
  continue;
}
```

Replace with:
```typescript
} catch (err) {
  log.warn('[Automation] Selector failed, trying next', { error: err });
  continue;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit src/renderer/stores/appStore.ts src/service/handlers/automation-handler.ts`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stores/appStore.ts src/service/handlers/automation-handler.ts
git commit -m "fix: remove empty catch blocks, add error logging"
```

---

## Task 9: Run Tests and Verify

- [ ] **Step 1: Run all tests**

Run: `npm test 2>&1 | head -50`

Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npm run build 2>&1 | head -30`

Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git commit -m "test: error handling optimization complete"
```

---

## Summary

| Task | File | Type |
|------|------|------|
| 1 | src/shared/errors.ts | Create |
| 2 | src/service/error-reporter.ts | Create |
| 3 | src/service/unified-error-handler.ts | Create |
| 4 | src/renderer/components/ErrorBoundary.tsx | Create |
| 5 | src/renderer/contexts/ErrorContext.tsx | Create |
| 6 | src/renderer/components/ErrorBar.tsx | Create |
| 7 | src/renderer/App.tsx | Modify |
| 8 | appStore.ts, automation-handler.ts | Modify |
