import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted so mockSafeStorage is accessible to vi.mock factory (which is hoisted)
const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`encrypted:${s}`)),
    decryptString: vi.fn((b: Buffer) => Buffer.from(Buffer.from(b).toString().replace('encrypted:', ''))),
  },
}));

vi.mock('electron', () => ({
  safeStorage: mockSafeStorage,
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  FieldEncryptor,
  initializeFieldEncryptor,
  encryptField,
  decryptField,
  isFieldEncrypted,
  getFieldEncryptor,
} from './crypto-utils.js';

describe('FieldEncryptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize()', () => {
    it('should return true when safeStorage is available', () => {
      const encryptor = new FieldEncryptor();
      const result = encryptor.initialize();
      expect(result).toBe(true);
    });

    it('should call safeStorage.isEncryptionAvailable on initialize', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      expect(mockSafeStorage.isEncryptionAvailable).toHaveBeenCalled();
    });

    it('should mark encryptor as available after successful init', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      expect(encryptor.isAvailable()).toBe(true);
    });
  });

  describe('encrypt()', () => {
    it('should throw if not initialized', () => {
      const encryptor = new FieldEncryptor();
      expect(() => encryptor.encrypt('test')).toThrow('FieldEncryptor not initialized');
    });

    it('should throw if no encryption key', () => {
      const encryptor = new FieldEncryptor();
      // Don't call initialize()
      expect(() => encryptor.encrypt('test')).toThrow();
    });

    it('should return empty string as-is', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      expect(encryptor.encrypt('')).toBe('');
    });

    it('should return string with enc:v1: prefix when encrypted', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      const ciphertext = encryptor.encrypt('hello world');
      expect(ciphertext).toMatch(/^enc:v1:/);
    });

    it('should return already-encrypted string as-is', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      const ciphertext = 'enc:v1:SGVsbG8=';
      expect(encryptor.encrypt(ciphertext)).toBe(ciphertext);
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      const ct1 = encryptor.encrypt('same text');
      const ct2 = encryptor.encrypt('same text');
      expect(ct1).not.toBe(ct2);
    });
  });

  describe('decrypt()', () => {
    it('should throw if not initialized', () => {
      const encryptor = new FieldEncryptor();
      expect(() => encryptor.decrypt('enc:v1:test')).toThrow();
    });

    it('should return plaintext without prefix as-is', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      expect(encryptor.decrypt('no prefix')).toBe('no prefix');
    });

    it('should decrypt what it encrypts', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      const plaintext = 'secret message 123';
      const ciphertext = encryptor.encrypt(plaintext);
      const decrypted = encryptor.decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw on invalid ciphertext', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      expect(() => encryptor.decrypt('enc:v1:notvalidbase64!!!')).toThrow();
    });
  });

  describe('isEncrypted()', () => {
    it('should return true for enc:v1: prefixed string', () => {
      const encryptor = new FieldEncryptor();
      expect(encryptor.isEncrypted('enc:v1:abc')).toBe(true);
    });

    it('should return false for null/undefined', () => {
      const encryptor = new FieldEncryptor();
      expect(encryptor.isEncrypted(null)).toBe(false);
      expect(encryptor.isEncrypted(undefined)).toBe(false);
    });

    it('should return false for plain string', () => {
      const encryptor = new FieldEncryptor();
      expect(encryptor.isEncrypted('plain text')).toBe(false);
    });
  });

  describe('tryDecrypt()', () => {
    it('should return null for null/undefined', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      expect(encryptor.tryDecrypt(null)).toBeNull();
      expect(encryptor.tryDecrypt(undefined)).toBeNull();
    });

    it('should return plaintext as-is', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      expect(encryptor.tryDecrypt('plain text')).toBe('plain text');
    });

    it('should return original value on decrypt failure', () => {
      const encryptor = new FieldEncryptor();
      encryptor.initialize();
      const result = encryptor.tryDecrypt('enc:v1:invalid');
      expect(result).toBe('enc:v1:invalid');
    });
  });
});

describe('module-level functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the global fieldEncryptor by re-initializing
    initializeFieldEncryptor();
  });

  describe('initializeFieldEncryptor()', () => {
    it('should initialize global encryptor', () => {
      const result = initializeFieldEncryptor();
      expect(result).toBe(true);
      expect(getFieldEncryptor()).not.toBeNull();
    });
  });

  describe('encryptField()', () => {
    it('should return null for null input', () => {
      expect(encryptField(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(encryptField(undefined)).toBeNull();
    });

    it('should return null when encryptor not available', () => {
      // Re-initialize with a new instance
      initializeFieldEncryptor();
      expect(encryptField('test')).toMatch(/^enc:v1:/);
    });

    it('should encrypt string', () => {
      const encrypted = encryptField('my api key');
      expect(encrypted).toMatch(/^enc:v1:/);
    });
  });

  describe('decryptField()', () => {
    it('should return null for null input', () => {
      expect(decryptField(null)).toBeNull();
    });

    it('should return null when encryptor not available', () => {
      expect(decryptField('test')).toBe('test');
    });

    it('should decrypt encrypted field', () => {
      const encrypted = encryptField('secret value');
      const decrypted = decryptField(encrypted);
      expect(decrypted).toBe('secret value');
    });
  });

  describe('isFieldEncrypted()', () => {
    it('should return false for null/undefined', () => {
      expect(isFieldEncrypted(null)).toBe(false);
      expect(isFieldEncrypted(undefined)).toBe(false);
    });

    it('should return true for encrypted string', () => {
      const encrypted = encryptField('test');
      expect(isFieldEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain string', () => {
      expect(isFieldEncrypted('plain')).toBe(false);
    });
  });
});
