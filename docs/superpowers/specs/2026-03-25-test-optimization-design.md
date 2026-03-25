# Test Optimization Design

## 1. Overview

**Project:** AI运营大师 (MatrixHub)
**Optimization Area:** Testing Coverage Enhancement
**Date:** 2026-03-25
**Approach:** Deep Optimization - Top-Down

## 2. Current State

| Module | Coverage | Issue |
|--------|----------|-------|
| handlers/* | 0% | No tests at all |
| platform-launcher.ts | 0% | No tests |
| monitoring.ts | 0% | No tests |
| Overall | 22.72% | Critical business logic untested |

## 3. Strategy

**Approach: Top-Down (自顶向下)**

Start from business logic layer (handlers) and work down to infrastructure. This maximizes business value per test and uses simple mocks.

**Why Top-Down:**
- Highest ROI: each test directly verifies user-visible behavior
- Simpler mocks: business logic dependencies are well-isolated
- Establishes test habits before tackling complex infrastructure mocks

## 4. Target Coverage

| Module | Current | Target | Key Verification Points |
|--------|---------|--------|-------------------------|
| handlers/publish-handler.ts | 0% | 80%+ | publish flow, checkpoints, error categorization |
| handlers/fetch-handler.ts | 0% | 85%+ | data fetching, login detection, cleanup |
| handlers/page-agent-handler.ts | 0% | 75%+ | step execution, AbortError, fallback |
| handlers/automation-handler.ts | 0% | 70%+ | action dispatch, cancellation |
| handlers/ai-generate-handler.ts | 0% | 80%+ | AI invocation, error handling |
| handlers/group-handlers.ts | 0% | 90%+ | CRUD operations |

## 5. Test Organization

```
src/service/handlers/
├── __tests__/
│   ├── publish-handler.test.ts
│   ├── fetch-handler.test.ts
│   ├── page-agent-handler.test.ts
│   ├── automation-handler.test.ts
│   ├── ai-generate-handler.test.ts
│   └── group-handlers.test.ts
```

## 6. Mock Architecture

### 6.1 External Dependencies

| Dependency | Mock Strategy | Rationale |
|------------|---------------|-----------|
| platform-launcher | vi.mock('../platform-launcher') | Browser pool isolation |
| db | Global mock in src/test/setup.ts | Already exists |
| ai-gateway | vi.mock('../ai-gateway') | Precise AI response control |
| rate-limiter | vi.mock('../rate-limiter') | Predictable rate limiting |
| log | Global mock in src/test/setup.ts | Already exists |

### 6.2 Mock Infrastructure (New)

```typescript
// src/test/mocks/handlers.ts
export const createMockPlatformLauncher = () => ({
  acquirePage: vi.fn(),
  releasePage: vi.fn(),
  getPoolStatus: vi.fn(),
});

export const createMockAiGateway = () => ({
  generate: vi.fn(),
  generateStream: vi.fn(),
});
```

## 7. Test Plans

### 7.1 publish-handler.test.ts

| Test Case | Verification Point |
|-----------|-------------------|
| should complete publish flow with checkpoints | Normal publish flow |
| should save checkpoint after each step | Checkpoint recovery |
| should handle selector failure with retry | Selector failure retry |
| should categorize network errors correctly | Error classification (selector/rate_limit/network) |
| should throw on max retries exceeded | Max retry limit |
| should resume from checkpoint | Checkpoint resume |

### 7.2 fetch-handler.test.ts

| Test Case | Verification Point |
|-----------|-------------------|
| should fetch hot topics successfully | Hot topic fetching |
| should throw LoginRequiredError when session expired | Login expiry detection |
| should handle fetcher errors gracefully | Fetcher error collection |
| should clean up fetcher in finally block | Resource cleanup |
| should throw on unknown data type | Parameter validation |

### 7.3 page-agent-handler.test.ts

| Test Case | Verification Point |
|-----------|-------------------|
| should execute multi-step plan | Step execution |
| should handle AbortError correctly | Abort handling |
| should fallback to alternative selector | Selector fallback |
| should throw on element not found after retries | Element not found |
| should throw on unknown action type | Action type validation |

### 7.4 automation-handler.test.ts

| Test Case | Verification Point |
|-----------|-------------------|
| should dispatch correct action | Action dispatch |
| should throw on user cancellation | Cancellation detection |
| should throw on session expired | Session expiry |

### 7.5 ai-generate-handler.test.ts

| Test Case | Verification Point |
|-----------|-------------------|
| should call AI gateway correctly | AI invocation |
| should handle AI errors gracefully | AI error handling |

### 7.6 group-handlers.test.ts

| Test Case | Verification Point |
|-----------|-------------------|
| should create group | Create operation |
| should update group | Update operation |
| should delete group | Delete operation |
| should list groups | List operation |

## 8. Execution

### 8.1 Commands

```bash
# Run all tests
npm test

# Run handlers tests only
npm test -- src/service/handlers

# With coverage
npm run test:coverage
```

### 8.2 CI Integration

- PR must pass all handlers tests
- Coverage drop > 5% blocks merge

## 9. Subsequent Optimizations

After test foundation is established:
1. **Error Handling** - React Error Boundary, unified error types
2. **UI/UX** - Fix CSS variables, establish component standards
