import { getDb } from './db.js';
import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { Platform, Account } from '../shared/types.js';
import {
  selectKeychainBackend,
  getKeychainBackend,
  type KeychainBackend
} from './keychain/index.js';
import type { AccountRow } from './db-types.js';
import { asRow, asRows } from './db-types.js';

const VALID_PLATFORMS: Platform[] = ['douyin', 'kuaishou', 'xiaohongshu'];

// Path traversal protection: validate inputs before use in file paths
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_TYPE_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates that accountId is a valid UUID format to prevent path traversal.
 * Rejects any input containing path separators or other dangerous characters.
 */
function validateAccountId(accountId: string): void {
  if (!UUID_REGEX.test(accountId)) {
    throw new Error(`Invalid accountId format: must be a valid UUID. Got: ${accountId}`);
  }
}

/**
 * Validates that providerType contains only safe characters to prevent path traversal.
 * Allows only alphanumeric characters, underscores, and hyphens.
 */
function validateProviderType(providerType: string): void {
  if (!PROVIDER_TYPE_REGEX.test(providerType)) {
    throw new Error(`Invalid providerType: must contain only alphanumeric characters, underscores, and hyphens. Got: ${providerType}`);
  }
}

/**
 * 凭证管理器
 * - 使用 Electron safeStorage 加密敏感数据
 * - 跨平台 Keychain 后端：macOS Keychain / Windows Credential Manager / Linux Secret Service
 */
export class CredentialManager {
  private serviceName = 'com.aimatrix.ops';
  private keychainBackend: KeychainBackend | null = null;
  private initialized = false;

  /**
   * 初始化 Keychain 后端（应用启动时调用）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.keychainBackend = await selectKeychainBackend();
    this.initialized = true;

    if (this.keychainBackend) {
      log.info(`[CredentialManager] 已选择 Keychain 后端: ${this.keychainBackend.name}`);
    } else {
      log.warn('[CredentialManager] 未找到可用的 Keychain 后端，仅使用 safeStorage');
    }
  }

  /**
   * 确保已初始化（自动初始化）
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 存储凭证到 Keychain
   */
  async storeCredential(accountId: string, credential: {
    username: string;
    password: string;
    cookies?: string;
    tokens?: Record<string, string>;
  }): Promise<void> {
    validateAccountId(accountId);
    const keychainKey = `credential:${accountId}`;

    // 序列化凭证
    const data = JSON.stringify(credential);

    // 使用 safeStorage 加密
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(data);
      const storePath = this.getCredentialPath(accountId);
      fs.writeFileSync(storePath, encrypted);
      log.info(`凭证已加密存储: ${accountId}`);
    } else {
      // 安全要求: 拒绝存储 - safeStorage 不可用意味着无法安全加密
      const error = 'safeStorage encryption is not available. Please ensure your OS has screen lock enabled.';
      log.error(`凭证存储失败: ${error}`);
      throw new Error(`Credential storage failed: ${error}`);
    }

    // 更新数据库引用
    const db = getDb();
    const now = Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO credentials (account_id, keychain_key, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(accountId, keychainKey, now, now);
  }

  /**
   * 获取凭证
   */
  async getCredential(accountId: string): Promise<{
    username: string;
    password: string;
    cookies?: string;
    tokens?: Record<string, string>;
  } | null> {
    validateAccountId(accountId);
    const keychainKey = `credential:${accountId}`;

    // 尝试从加密文件加载
    const storePath = this.getCredentialPath(accountId);
    if (fs.existsSync(storePath)) {
      try {
        const encrypted = fs.readFileSync(storePath);
        if (safeStorage.isEncryptionAvailable()) {
          const decrypted = safeStorage.decryptString(encrypted);
          return JSON.parse(decrypted);
        }
      } catch (error) {
        log.error(`解密凭证失败: ${accountId}`, error);
      }
    }

    // 回退: 从 Keychain 获取
    const data = await this.getKeychain(keychainKey);
    if (data) {
      return JSON.parse(data);
    }

    return null;
  }

  /**
   * 删除凭证
   */
  async deleteCredential(accountId: string): Promise<void> {
    validateAccountId(accountId);
    const keychainKey = `credential:${accountId}`;

    // 删除加密文件
    const storePath = this.getCredentialPath(accountId);
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }

    // 删除 Keychain 条目
    await this.deleteKeychain(keychainKey);

    // 删除数据库引用
    const db = getDb();
    db.prepare('DELETE FROM credentials WHERE account_id = ?').run(accountId);

    log.info(`凭证已删除: ${accountId}`);
  }

  /**
   * 检查凭证是否有效
   */
  async validateCredential(accountId: string): Promise<{ valid: boolean; error?: string }> {
    const cred = await this.getCredential(accountId);
    if (!cred) {
      return { valid: false, error: '凭证不存在' };
    }
    if (!cred.password && !cred.cookies && !cred.tokens) {
      return { valid: false, error: '账号无有效凭证' };
    }
    return { valid: true };
  }

  private getCredentialPath(accountId: string): string {
    const dir = path.join(app.getPath('userData'), 'credentials');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${accountId}.enc`);
  }

  // ============ 跨平台 Keychain 后端 ============

  private async storeKeychain(key: string, value: string): Promise<void> {
    await this.ensureInitialized();
    const backend = this.keychainBackend || getKeychainBackend();
    if (!backend) {
      log.debug('[CredentialManager] Keychain 后端不可用，跳过存储');
      return;
    }

    try {
      await backend.store(this.serviceName, key, value);
      log.debug(`[CredentialManager] Keychain 存储成功: ${key}`);
    } catch (error) {
      log.error('[CredentialManager] Keychain 存储失败:', error);
    }
  }

  private async getKeychain(key: string): Promise<string | null> {
    await this.ensureInitialized();
    const backend = this.keychainBackend || getKeychainBackend();
    if (!backend) {
      return null;
    }

    try {
      return await backend.retrieve(this.serviceName, key);
    } catch {
      return null;
    }
  }

  private async deleteKeychain(key: string): Promise<void> {
    await this.ensureInitialized();
    const backend = this.keychainBackend || getKeychainBackend();
    if (!backend) {
      return;
    }

    try {
      await backend.delete(this.serviceName, key);
      log.debug(`[CredentialManager] Keychain 删除成功: ${key}`);
    } catch {
      // 忽略删除失败
    }
  }
}

export const credentialManager = new CredentialManager();

// ============ AI API Key 管理 ============

export class AIKeyManager {
  private serviceName = 'com.aimatrix.ops.ai';

  /**
   * 存储 AI API Key
   */
  async storeAPIKey(providerType: string, apiKey: string): Promise<void> {
    validateProviderType(providerType);
    // 使用 safeStorage 加密存储
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(apiKey);
      const storePath = this.getKeyPath(providerType);
      fs.writeFileSync(storePath, encrypted);
      log.info(`AI API Key 已加密存储: ${providerType}`);
    } else {
      // 安全要求: 拒绝存储 - safeStorage 不可用意味着无法安全加密
      const error = 'safeStorage encryption is not available. Please ensure your OS has screen lock enabled.';
      log.error(`AI API Key 存储失败: ${error}`);
      throw new Error(`API Key storage failed: ${error}`);
    }
  }

  /**
   * 获取 AI API Key
   */
  async getAPIKey(providerType: string): Promise<string | null> {
    validateProviderType(providerType);
    const key = `ai:${providerType}`;

    // 尝试从加密文件加载
    const storePath = this.getKeyPath(providerType);
    if (fs.existsSync(storePath)) {
      try {
        const encrypted = fs.readFileSync(storePath);
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.decryptString(encrypted);
        }
      } catch (error) {
        log.error(`解密 AI API Key 失败: ${providerType}`, error);
      }
    }

    // 回退: 从 Keychain 获取
    return this.getKeychain(key);
  }

  /**
   * 删除 AI API Key
   */
  async deleteAPIKey(providerType: string): Promise<void> {
    validateProviderType(providerType);
    const key = `ai:${providerType}`;

    const storePath = this.getKeyPath(providerType);
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }

    await this.deleteKeychain(key);
    log.info(`AI API Key 已删除: ${providerType}`);
  }

  /**
   * 检查 API Key 是否存在
   */
  async hasAPIKey(providerType: string): Promise<boolean> {
    validateProviderType(providerType);
    const key = await this.getAPIKey(providerType);
    return key !== null && key.length > 0;
  }

  private getKeyPath(providerType: string): string {
    const dir = path.join(app.getPath('userData'), 'credentials');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `ai_${providerType}.enc`);
  }

  // ============ 跨平台 Keychain 后端 ============

  private async storeKeychain(key: string, value: string): Promise<void> {
    const backend = getKeychainBackend();
    if (!backend) {
      log.debug('[AIKeyManager] Keychain 后端不可用，跳过存储');
      return;
    }

    try {
      await backend.store(this.serviceName, key, value);
      log.debug(`[AIKeyManager] Keychain 存储成功: ${key}`);
    } catch (error) {
      log.error('[AIKeyManager] Keychain 存储失败:', error);
    }
  }

  private async getKeychain(key: string): Promise<string | null> {
    const backend = getKeychainBackend();
    if (!backend) {
      return null;
    }

    try {
      return await backend.retrieve(this.serviceName, key);
    } catch {
      return null;
    }
  }

  private async deleteKeychain(key: string): Promise<void> {
    const backend = getKeychainBackend();
    if (!backend) {
      return;
    }

    try {
      await backend.delete(this.serviceName, key);
      log.debug(`[AIKeyManager] Keychain 删除成功: ${key}`);
    } catch {
      // 忽略删除失败
    }
  }
}

export const aiKeyManager = new AIKeyManager();

// ============ 账号管理器 ============

export class AccountManager {
  /**
   * 添加账号（Pending State 模式确保原子性）
   * 流程：
   * 1. 创建账号，状态为 pending
   * 2. 存储凭证（失败则标记为 failed）
   * 3. 更新账号状态为 complete
   * 4. list()/get() 默认过滤非 complete 账号
   */
  async add(params: {
    platform: Platform;
    username: string;
    displayName: string;
    avatar?: string;
    password: string;
    groupId?: string;
    tags?: string[];
    cookies?: string;
    tokens?: Record<string, string>;
  }): Promise<Account> {
    if (!VALID_PLATFORMS.includes(params.platform)) {
      throw new Error(`Invalid platform: ${params.platform}. Must be one of: ${VALID_PLATFORMS.join(', ')}`);
    }

    const db = getDb();
    const now = Date.now();

    const accountId = uuidv4();
    const account: Account = {
      id: accountId,
      platform: params.platform,
      username: params.username,
      displayName: params.displayName,
      avatar: params.avatar,
      status: 'active',
      groupId: params.groupId,
      tags: params.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    // Step 1: 创建账号，状态为 pending
    db.prepare(`
      INSERT INTO accounts (id, platform, username, display_name, avatar, status, group_id, tags, creation_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      account.id,
      account.platform,
      account.username,
      account.displayName,
      account.avatar ?? null,
      account.status,
      account.groupId ?? null,
      JSON.stringify(account.tags),
      account.createdAt,
      account.updatedAt
    );

    // Step 2: 存储凭证
    try {
      await credentialManager.storeCredential(account.id, {
        username: params.username,
        password: params.password,
        cookies: params.cookies,
        tokens: params.tokens,
      });
    } catch (err) {
      // 凭证存储失败，标记账号为 failed
      log.error(`[AccountManager] 凭证存储失败: ${accountId}`, err);
      db.prepare(`UPDATE accounts SET creation_status = 'failed', updated_at = ? WHERE id = ?`).run(now, accountId);
      throw err;
    }

    // Step 3: 更新账号状态为 complete
    db.prepare(`UPDATE accounts SET creation_status = 'complete', updated_at = ? WHERE id = ?`).run(now, accountId);

    log.info(`账号添加完成: ${account.id} [${account.platform}] ${account.username}`);
    return account;
  }

  /**
   * 获取账号（默认只返回 creation_status = 'complete' 的账号）
   */
  get(accountId: string, includePending = false): Account | null {
    const db = getDb();
    const query = includePending
      ? 'SELECT * FROM accounts WHERE id = ?'
      : "SELECT * FROM accounts WHERE id = ? AND (creation_status = 'complete' OR creation_status IS NULL)";
    const row = db.prepare(query).get(accountId);
    return row ? this.rowToAccount(asRow<AccountRow>(row)) : null;
  }

  /**
   * 列出账号（默认只返回 creation_status = 'complete' 的账号）
   */
  list(options?: { platform?: Platform; groupId?: string; includePending?: boolean }): Account[] {
    const db = getDb();
    const includePending = options?.includePending ?? false;

    let query = "SELECT * FROM accounts WHERE (creation_status = 'complete' OR creation_status IS NULL)";
    const params: any[] = [];

    if (!includePending) {
      // 已过滤非 complete 账号
    }

    if (options?.platform) {
      query += ' AND platform = ?';
      params.push(options.platform);
    }
    if (options?.groupId) {
      query += ' AND group_id = ?';
      params.push(options.groupId);
    }
    query += ' ORDER BY created_at DESC';
    const rows = db.prepare(query).all(...params);
    return asRows<AccountRow>(rows).map(r => this.rowToAccount(r));
  }

  /**
   * 获取失败的账号（用于清理或重试）
   */
  listFailed(): Account[] {
    const db = getDb();
    const rows = asRows<AccountRow>(db.prepare("SELECT * FROM accounts WHERE creation_status = 'failed'").all());
    return rows.map(r => this.rowToAccount(r));
  }

  /**
   * 清理失败的账号
   */
  cleanupFailed(): number {
    const db = getDb();
    const result = db.prepare("DELETE FROM accounts WHERE creation_status = 'failed'").run();
    log.info(`[AccountManager] 清理了 ${result.changes} 个失败的账号`);
    return result.changes;
  }

  /**
   * 更新账号
   */
  update(accountId: string, updates: Partial<Pick<Account, 'displayName' | 'avatar' | 'status' | 'groupId' | 'tags'>>): Account | null {
    const db = getDb();
    const now = Date.now();

    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.displayName !== undefined) {
      sets.push('display_name = ?');
      values.push(updates.displayName);
    }
    if (updates.avatar !== undefined) {
      sets.push('avatar = ?');
      values.push(updates.avatar);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);
    }
    if (updates.groupId !== undefined) {
      sets.push('group_id = ?');
      values.push(updates.groupId);
    }
    if (updates.tags !== undefined) {
      sets.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }

    values.push(accountId);
    db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    log.info(`账号更新: ${accountId}`);
    return this.get(accountId);
  }

  /**
   * 删除账号
   */
  remove(accountId: string): void {
    const db = getDb();

    // 删除凭证
    credentialManager.deleteCredential(accountId);

    // 删除账号
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);

    log.info(`账号删除: ${accountId}`);
  }

  /**
   * 标记账号使用时间
   */
  markUsed(accountId: string): void {
    const db = getDb();
    db.prepare('UPDATE accounts SET last_used_at = ? WHERE id = ?').run(Date.now(), accountId);
  }

  private rowToAccount(row: AccountRow): Account {
    return {
      id: row.id,
      platform: row.platform as Platform,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar ?? undefined,
      status: row.status as Account['status'],
      groupId: row.group_id ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      lastUsedAt: row.last_used_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const accountManager = new AccountManager();
