/**
 * 字段加密工具
 * 使用 Electron safeStorage 派生密钥进行应用层加密
 * 用于保护数据库中的敏感字段（API keys、凭证引用等）
 */
import { safeStorage } from 'electron';
import * as crypto from 'crypto';
import log from 'electron-log';

const ENCRYPTION_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * 字段加密器
 * 使用 safeStorage 派生的密钥进行 AES-256-GCM 加密
 */
export class FieldEncryptor {
  private encryptionKey: Buffer | null = null;
  private serviceName: string;

  constructor(serviceName = 'com.aimatrix.ops.field') {
    this.serviceName = serviceName;
  }

  /**
   * 初始化加密器
   * 从 safeStorage 派生加密密钥
   */
  initialize(): boolean {
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[FieldEncryptor] safeStorage 不可用，字段加密禁用');
      return false;
    }

    try {
      // 使用 safeStorage 加密一个固定字符串来派生密钥
      // 这样密钥会随机器变化，但应用内一致
      const keySeed = `${this.serviceName}:key-derivation-seed`;
      const encryptedSeed = safeStorage.encryptString(keySeed);

      // 使用 PBKDF2 从加密的种子派生固定长度的密钥
      const salt = crypto.createHash('sha256')
        .update(this.serviceName)
        .digest();

      this.encryptionKey = crypto.pbkdf2Sync(
        encryptedSeed,
        salt,
        ITERATIONS,
        32, // AES-256 需要 32 字节密钥
        'sha256'
      );

      log.info('[FieldEncryptor] 加密器初始化成功');
      return true;
    } catch (error) {
      log.error('[FieldEncryptor] 初始化失败:', error);
      return false;
    }
  }

  /**
   * 检查加密器是否可用
   */
  isAvailable(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * 加密字符串
   * @returns 加密后的字符串，带 enc:v1: 前缀
   */
  encrypt(plaintext: string): string {
    if (!this.encryptionKey) {
      throw new Error('FieldEncryptor not initialized');
    }

    if (!plaintext || plaintext.length === 0) {
      return plaintext;
    }

    // 如果已经是加密的，直接返回
    if (plaintext.startsWith(ENCRYPTION_PREFIX)) {
      return plaintext;
    }

    try {
      // 生成随机 IV
      const iv = crypto.randomBytes(IV_LENGTH);

      // 生成随机盐（增加熵）
      const salt = crypto.randomBytes(SALT_LENGTH);

      // 从主密钥和盐派生本次加密的密钥
      const derivedKey = crypto.pbkdf2Sync(
        this.encryptionKey,
        salt,
        1000,
        32,
        'sha256'
      );

      // 创建加密器
      const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv, {
        authTagLength: AUTH_TAG_LENGTH
      });

      // 加密
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);

      // 获取认证标签
      const authTag = cipher.getAuthTag();

      // 组合: salt(32) + iv(12) + authTag(16) + encrypted
      const combined = Buffer.concat([salt, iv, authTag, encrypted]);

      // Base64 编码并添加前缀
      return ENCRYPTION_PREFIX + combined.toString('base64');
    } catch (error) {
      log.error('[FieldEncryptor] 加密失败:', error);
      throw new Error(`Encryption failed: ${error}`);
    }
  }

  /**
   * 解密字符串
   * @param ciphertext 加密的字符串（带 enc:v1: 前缀）
   * @returns 解密后的明文
   */
  decrypt(ciphertext: string): string {
    if (!this.encryptionKey) {
      throw new Error('FieldEncryptor not initialized');
    }

    if (!ciphertext || !ciphertext.startsWith(ENCRYPTION_PREFIX)) {
      return ciphertext;
    }

    try {
      // 移除前缀并解码
      const encoded = ciphertext.slice(ENCRYPTION_PREFIX.length);
      const combined = Buffer.from(encoded, 'base64');

      // 解析组件
      let offset = 0;
      const salt = combined.subarray(offset, offset + SALT_LENGTH);
      offset += SALT_LENGTH;

      const iv = combined.subarray(offset, offset + IV_LENGTH);
      offset += IV_LENGTH;

      const authTag = combined.subarray(offset, offset + AUTH_TAG_LENGTH);
      offset += AUTH_TAG_LENGTH;

      const encrypted = combined.subarray(offset);

      // 派生解密密钥
      const derivedKey = crypto.pbkdf2Sync(
        this.encryptionKey,
        salt,
        1000,
        32,
        'sha256'
      );

      // 创建解密器
      const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv, {
        authTagLength: AUTH_TAG_LENGTH
      });

      // 设置认证标签
      decipher.setAuthTag(authTag);

      // 解密
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      log.error('[FieldEncryptor] 解密失败:', error);
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  /**
   * 检查值是否已加密
   */
  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
  }

  /**
   * 安全解密（失败返回原值）
   */
  tryDecrypt(value: string | null | undefined): string | null {
    if (!value) return null;

    if (!this.isEncrypted(value)) {
      return value;
    }

    try {
      return this.decrypt(value);
    } catch {
      log.warn('[FieldEncryptor] 解密失败，返回原值');
      return value;
    }
  }
}

// 全局单例
let fieldEncryptor: FieldEncryptor | null = null;

/**
 * 获取全局字段加密器
 */
export function getFieldEncryptor(): FieldEncryptor | null {
  return fieldEncryptor;
}

/**
 * 初始化全局字段加密器
 */
export function initializeFieldEncryptor(): boolean {
  fieldEncryptor = new FieldEncryptor();
  return fieldEncryptor.initialize();
}

/**
 * 便捷方法：加密字段
 */
export function encryptField(value: string | null | undefined): string | null {
  if (!value || !fieldEncryptor) return value ?? null;
  return fieldEncryptor.encrypt(value);
}

/**
 * 便捷方法：解密字段
 */
export function decryptField(value: string | null | undefined): string | null {
  if (!value || !fieldEncryptor) return value ?? null;
  return fieldEncryptor.tryDecrypt(value);
}

/**
 * 便捷方法：检查是否已加密
 */
export function isFieldEncrypted(value: string | null | undefined): boolean {
  if (!value || !fieldEncryptor) return false;
  return fieldEncryptor.isEncrypted(value);
}
