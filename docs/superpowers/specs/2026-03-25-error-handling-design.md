# Error Handling Optimization Design

## Overview

**Project:** AI运营大师 (MatrixHub)
**Optimization Area:** Error Handling Enhancement
**Date:** 2026-03-25
**Approach:** Layered Optimization - Stability → Observability → DX

## Problem Statement

Current error handling issues:
1. **No React Error Boundary** — Uncaught React errors crash the app
2. **Empty catch blocks** — Silent error swallowing in handlers
3. **Inconsistent error patterns** — Some throw, some return `{ success: false }`
4. **No error reporting** — No Sentry or similar integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Renderer Process                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ React Error │    │  Error      │    │  Error      │     │
│  │ Boundary    │───▶│  Context    │───▶│  Display    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                                    ▲               │
│         ▼                                    │               │
│  ┌─────────────────────────────────────────────────┐        │
│  │            Unified Error Handler                  │        │
│  │  - categorize errors                              │        │
│  │  - log to electron-log                            │        │
│  │  - call error reporter (Sentry interface)        │        │
│  └─────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ IPC
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Global      │    │  Error     │    │  Alert      │     │
│  │ Exception   │───▶│  Aggregator│───▶│  Manager    │     │
│  │ Handler     │    │            │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Error Types (`src/shared/errors.ts`)

```typescript
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
```

### 2. React Error Boundary (`src/renderer/components/ErrorBoundary.tsx`)

- Wraps the entire app
- Catches uncaught React errors
- Displays fallback UI instead of white screen
- Logs errors to ErrorContext
- Provides "Retry" and "Report" actions

### 3. Error Context (`src/renderer/contexts/ErrorContext.tsx`)

- Provides global error state via React Context
- Methods: `addError`, `dismissError`, `clearErrors`
- Stores recent errors (max 50)
- Props for ErrorBar display component

### 4. Error Display (`src/renderer/components/ErrorBar.tsx`)

```typescript
export interface ErrorBarProps {
  error: AppError;
  onDismiss: () => void;
}

export function ErrorBar({ error, onDismiss }: ErrorBarProps) {
  // Toast-style error notification
  // Auto-dismiss after 5 seconds
  // Manual dismiss button
  // "Copy error details" for support
}
```

### 5. Unified Error Handler (`src/service/unified-error-handler.ts`)

```typescript
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

    if (msg.includes('timeout') || msg.includes('fetch')) {
      return { message: error.message, code: ErrorCode.TIMEOUT };
    }
    if (msg.includes('login') || msg.includes('session')) {
      return { message: error.message, code: ErrorCode.SESSION_EXPIRED };
    }
    if (msg.includes('rate limit')) {
      return { message: error.message, code: ErrorCode.RATE_LIMIT_EXCEEDED };
    }
    if (msg.includes('selector') || msg.includes('element')) {
      return { message: error.message, code: ErrorCode.SELECTOR_ERROR };
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

  // Report to error reporter (Sentry interface)
  errorReporter.capture(appError, { context });

  return appError;
}
```

### 6. Error Reporter Interface (`src/service/error-reporter.ts`)

```typescript
import { AppError, ErrorCode } from '../../shared/errors.js';

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

## Fix Empty Catch Blocks

### automation-handler.ts (line 158-159)

**Before:**
```typescript
} catch {
  continue;
}
```

**After:**
```typescript
} catch (err) {
  log.warn('[Automation] Selector failed, trying next', { error: err });
  continue;
}
```

### appStore.ts (line 53-58)

**Before:**
```typescript
} catch {
  setTaskDraft(null);
}
```

**After:**
```typescript
} catch (err) {
  log.error('Failed to load task draft', { error: err });
  setTaskDraft(null);
}
```

## Error Categories

| Category | Examples | Handling |
|----------|----------|----------|
| network | timeout, fetch failed | retry with backoff |
| auth | session expired, login required | redirect to login |
| validation | invalid input | show field errors |
| business | rate limit, moderation failed | show user message |
| system | element not found, unknown | log and report |

## Testing Strategy

1. **ErrorBoundary** — Test with ErrorBoundary wrapping broken component
2. **AppError** — Unit tests for error creation and chaining
3. **UnifiedErrorHandler** — Test error categorization
4. **ErrorReporter** — Test ConsoleReporter output

## Implementation Order

1. Error types and AppError class
2. React ErrorBoundary component
3. ErrorContext
4. ErrorBar component
5. UnifiedErrorHandler
6. ErrorReporter interface
7. Fix empty catch blocks
8. Tests

## Files to Create/Modify

### Create
- `src/shared/errors.ts`
- `src/renderer/components/ErrorBoundary.tsx`
- `src/renderer/contexts/ErrorContext.tsx`
- `src/renderer/components/ErrorBar.tsx`
- `src/service/unified-error-handler.ts`
- `src/service/error-reporter.ts`

### Modify
- `src/renderer/App.tsx` — Add ErrorBoundary wrapper
- `src/renderer/stores/appStore.ts` — Fix empty catch
- `src/service/handlers/automation-handler.ts` — Fix empty catch

## Success Criteria

- [ ] React errors don't crash the app (ErrorBoundary catches them)
- [ ] All empty catch blocks are removed or have logging
- [ ] All errors go through UnifiedErrorHandler
- [ ] Error reporter interface is ready for Sentry integration
- [ ] Tests cover new error handling components
