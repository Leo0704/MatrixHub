import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CredentialManager, AccountManager } from './credential-manager.js';

// Use vi.hoisted to create mocks that properly hoist with vi.mock
const { mockFs, mockDb } = vi.hoisted(() => {
  const mockFs = {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
  };

  const mockDb = {
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    })),
    transaction: vi.fn((fn: Function) => fn),
  };

  return { mockFs, mockDb };
});

// Mock fs module
vi.mock('fs', () => mockFs);

// Mock db module
vi.mock('./db.js', () => ({
  getDb: vi.fn(() => mockDb),
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
        credentialManager.storeCredential('account-1', {
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
        credentialManager.storeCredential('account-1', {
          username: 'testuser',
          password: 'testpass',
        })
      ).rejects.toThrow('safeStorage encryption is not available');
    });
  });

  describe('getCredential', () => {
    it('should return null for non-existent credential', async () => {
      mockFs.existsSync.mockReturnValueOnce(false);

      const result = await credentialManager.getCredential('non-existent');
      expect(result).toBeNull();
    });

    it('should return decrypted credential when file exists', async () => {
      const credential = { username: 'testuser', password: 'testpass' };
      const encryptedBuffer = Buffer.from(JSON.stringify(credential));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(encryptedBuffer);

      const result = await credentialManager.getCredential('account-1');
      expect(result).toEqual(credential);
    });
  });

  describe('deleteCredential', () => {
    it('should delete credential successfully', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await expect(
        credentialManager.deleteCredential('account-1')
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

      const result = await credentialManager.validateCredential('account-1');
      expect(result).toBe(true);
    });

    it('should return false for non-existent credential', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await credentialManager.validateCredential('non-existent');
      expect(result).toBe(false);
    });

    it('should return false for credential without password', async () => {
      const credential = { username: 'testuser' };
      const encryptedBuffer = Buffer.from(JSON.stringify(credential));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(encryptedBuffer);

      const result = await credentialManager.validateCredential('account-1');
      expect(result).toBe(false);
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

    // Mock db.prepare for the rollback DELETE
    const deleteRun = vi.fn(() => ({ changes: 1 }));
    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM accounts')) {
        return { run: deleteRun };
      }
      return { run: vi.fn(() => ({ changes: 1 })) };
    });

    const accountManager = new AccountManager();

    await expect(
      accountManager.add({
        platform: 'twitter',
        username: 'testuser',
        displayName: 'Test User',
        password: 'testpass',
      })
    ).rejects.toThrow();

    // Verify rollback was attempted (delete from accounts)
    expect(deleteRun).toHaveBeenCalled();
  });

  it('should handle rollback failure gracefully', async () => {
    const { safeStorage } = await import('electron');
    (safeStorage.isEncryptionAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    // Make the rollback DELETE also fail
    const deleteRun = vi.fn(() => { throw new Error('Database delete failed'); });
    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM accounts')) {
        return { run: deleteRun };
      }
      return { run: vi.fn(() => ({ changes: 1 })) };
    });

    const accountManager = new AccountManager();

    // Original error should still be thrown even if rollback fails
    await expect(
      accountManager.add({
        platform: 'twitter',
        username: 'testuser',
        displayName: 'Test User',
        password: 'testpass',
      })
    ).rejects.toThrow();

    // Verify rollback was attempted
    expect(deleteRun).toHaveBeenCalled();
  });
});
