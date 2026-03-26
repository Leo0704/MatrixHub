import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CredentialManager, AccountManager } from './credential-manager.js';

// Use vi.hoisted to create mocks that properly hoist with vi.mock
const { mockFs, mockDb, mockSafeStorage, mockApp } = vi.hoisted(() => {
  const mockFs = {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
  };

  const mockDb = {
    prepare: vi.fn((_sql: string) => ({
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    })),
    transaction: vi.fn((fn: Function) => fn),
  };

  const mockSafeStorage = {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`encrypted:${s}`)),
    decryptString: vi.fn((b: Buffer) => Buffer.from(Buffer.from(b).toString().replace('encrypted:', ''))),
  };

  const mockApp = {
    getPath: vi.fn(() => '/tmp/test-user-data'),
  };

  return { mockFs, mockDb, mockSafeStorage, mockApp };
});

// Mock fs module
vi.mock('fs', () => mockFs);

// Mock db module
vi.mock('./db.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

// Mock electron module
vi.mock('electron', () => ({
  safeStorage: mockSafeStorage,
  app: mockApp,
}));

describe('CredentialManager', () => {
  let credentialManager: CredentialManager;

  beforeEach(() => {
    vi.clearAllMocks();
    credentialManager = new CredentialManager();
  });

  describe('storeCredential', () => {
    it('should store credential successfully when safeStorage is available', async () => {
      await expect(
        credentialManager.storeCredential('550e8400-e29b-41d4-a716-446655440000', {
          username: 'testuser',
          password: 'testpass',
        })
      ).resolves.not.toThrow();

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw if safeStorage is unavailable', async () => {
      const { safeStorage } = await import('electron');
      (safeStorage.isEncryptionAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      await expect(
        credentialManager.storeCredential('550e8400-e29b-41d4-a716-446655440000', {
          username: 'testuser',
          password: 'testpass',
        })
      ).rejects.toThrow('safeStorage encryption is not available');
    });
  });

  describe('getCredential', () => {
    it('should return null for non-existent credential', async () => {
      mockFs.existsSync.mockReturnValueOnce(false);

      const result = await credentialManager.getCredential('660e8400-e29b-41d4-a716-446655440001');
      expect(result).toBeNull();
    });

    it('should return decrypted credential when file exists', async () => {
      const credential = { username: 'testuser', password: 'testpass' };
      const encryptedBuffer = Buffer.from(JSON.stringify(credential));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(encryptedBuffer);

      const result = await credentialManager.getCredential('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toEqual(credential);
    });
  });

  describe('deleteCredential', () => {
    it('should delete credential successfully', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await expect(
        credentialManager.deleteCredential('550e8400-e29b-41d4-a716-446655440000')
      ).resolves.not.toThrow();

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('validateCredential', () => {
    it('should return true for valid credential', async () => {
      const credential = { username: 'testuser', password: 'testpass' };
      const encryptedBuffer = Buffer.from(JSON.stringify(credential));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(encryptedBuffer);

      const result = await credentialManager.validateCredential('550e8400-e29b-41d4-a716-446655440000');
      expect(result.valid).toBe(true);
    });

    it('should return false for non-existent credential', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await credentialManager.validateCredential('660e8400-e29b-41d4-a716-446655440001');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('凭证不存在');
    });

    it('should return false for credential without password', async () => {
      const credential = { username: 'testuser' };
      const encryptedBuffer = Buffer.from(JSON.stringify(credential));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(encryptedBuffer);

      const result = await credentialManager.validateCredential('550e8400-e29b-41d4-a716-446655440000');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('账号无有效凭证');
    });
  });
});

describe('AccountManager rollback behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should attempt to delete account when credential storage fails', async () => {
    const { safeStorage } = await import('electron');
    (safeStorage.isEncryptionAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    // Mock db.prepare for the rollback UPDATE
    const updateRun = vi.fn(() => ({ changes: 1 }));
    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE accounts SET creation_status')) {
        return { run: updateRun, get: vi.fn(() => null), all: vi.fn(() => []) };
      }
      return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(() => null), all: vi.fn(() => []) };
    });

    const accountManager = new AccountManager();

    await expect(
      accountManager.add({
        platform: 'douyin',
        username: 'testuser',
        displayName: 'Test User',
        password: 'testpass',
      })
    ).rejects.toThrow();

    // Verify rollback was attempted (update status to failed)
    expect(updateRun).toHaveBeenCalled();
  });

  it('should handle rollback failure gracefully', async () => {
    const { safeStorage } = await import('electron');
    (safeStorage.isEncryptionAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    // Make the rollback UPDATE also fail
    const updateRun = vi.fn(() => { throw new Error('Database update failed'); });
    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE accounts SET creation_status')) {
        return { run: updateRun, get: vi.fn(() => null), all: vi.fn(() => []) };
      }
      return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(() => null), all: vi.fn(() => []) };
    });

    const accountManager = new AccountManager();

    // Original error should still be thrown even if rollback fails
    await expect(
      accountManager.add({
        platform: 'douyin',
        username: 'testuser',
        displayName: 'Test User',
        password: 'testpass',
      })
    ).rejects.toThrow();

    // Verify rollback was attempted
    expect(updateRun).toHaveBeenCalled();
  });
});

describe('AccountManager platform validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockDb.prepare to return proper mocks (previous tests may have modified it)
    mockDb.prepare.mockImplementation((_sql: string) => ({
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    }));
  });

  it('should reject invalid platform', async () => {
    const accountManager = new AccountManager();

    await expect(accountManager.add({
      platform: 'invalid_platform',
      username: 'test',
      displayName: 'Test',
      password: 'test',
    })).rejects.toThrow('Invalid platform');
  });

  it('should accept valid platforms', async () => {
    const accountManager = new AccountManager();

    for (const platform of ['douyin', 'kuaishou', 'xiaohongshu']) {
      await expect(accountManager.add({
        platform,
        username: `test_${platform}`,
        displayName: `Test ${platform}`,
        password: 'test',
      })).resolves.toBeDefined();
    }
  });
});
