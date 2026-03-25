import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock database
const mockDbInstance = {
  prepare: vi.fn(),
};

vi.mock('./db.js', () => ({
  getDb: () => mockDbInstance,
}));

// Import after mocking
import { ConsentManager } from './consent-manager.js';

describe('ConsentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInstance.prepare.mockReturnValue({
      run: vi.fn().mockReturnValue({}),
      get: vi.fn().mockReturnValue(undefined),
    });
  });

  it('stores consent timestamp on accept', async () => {
    const manager = new ConsentManager();
    await manager.grantConsent();

    // After grantConsent, getConsentRecord should return the record
    mockDbInstance.prepare.mockReturnValue({
      run: vi.fn().mockReturnValue({}),
      get: vi.fn().mockReturnValue({
        granted: 1,
        grantedAt: '2026-03-25T10:00:00.000Z',
      }),
    });

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

  it('returns false for isConsentRequired when consent already granted', async () => {
    mockDbInstance.prepare.mockReturnValue({
      run: vi.fn().mockReturnValue({}),
      get: vi.fn().mockReturnValue({
        granted: 1,
        grantedAt: '2026-03-25T10:00:00.000Z',
      }),
    });

    const manager = new ConsentManager();
    const needsConsent = await manager.isConsentRequired();
    expect(needsConsent).toBe(false);
  });

  it('returns null for getConsentRecord when no consent record exists', async () => {
    const manager = new ConsentManager();
    const record = await manager.getConsentRecord();
    expect(record).toBeNull();
  });
});
