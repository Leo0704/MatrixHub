import { getDb } from './db.js';
import { execSync, exec } from 'child_process';
import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { Platform, Account } from '../shared/types.js';

/**
 * 凭证管理器
 * - 使用 Electron safeStorage 加密敏感数据
 * - macOS Keychain / Windows Credential Manager 存储加密密钥
 */
export class CredentialManager {
  private serviceName = 'com.aimatrix.ops';

  /**
   * 存储凭证到 Keychain
   */
  async storeCredential(accountId: string, credential: {
    username: string;
    password: string;
    cookies?: string;
    tokens?: Record<string, string>;
  }): Promise<void> {
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

    // 回退: 从 Keychain CLI 获取
    const data = this.getKeychain(keychainKey);
    if (data) {
      return JSON.parse(data);
    }

    return null;
  }

  /**
   * 删除凭证
   */
  async deleteCredential(accountId: string): Promise<void> {
    const keychainKey = `credential:${accountId}`;

    // 删除加密文件
    const storePath = this.getCredentialPath(accountId);
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }

    // 删除 Keychain 条目
    this.deleteKeychain(keychainKey);

    // 删除数据库引用
    const db = getDb();
    db.prepare('DELETE FROM credentials WHERE account_id = ?').run(accountId);

    log.info(`凭证已删除: ${accountId}`);
  }

  /**
   * 检查凭证是否有效
   */
  async validateCredential(accountId: string): Promise<boolean> {
    const cred = await this.getCredential(accountId);
    return cred !== null && !!cred.password;
  }

  private getCredentialPath(accountId: string): string {
    const dir = path.join(app.getPath('userData'), 'credentials');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${accountId}.enc`);
  }

  // ============ macOS Keychain CLI ============

  private storeKeychain(key: string, value: string): void {
    if (process.platform !== 'darwin') {
      log.warn('Keychain CLI only supported on macOS');
      return;
    }

    const encoded = Buffer.from(value).toString('base64');

    try {
      execSync(
        `security add-generic-password -s "${this.serviceName}" -a "${key}" -w "${encoded}" -D "MatrixHub"`,
        { encoding: 'utf8' }
      );
    } catch (error) {
      // 可能已存在，尝试更新
      try {
        execSync(
          `security add-generic-password -s "${this.serviceName}" -a "${key}" -w "${encoded}" -D "MatrixHub" -U`,
          { encoding: 'utf8' }
        );
      } catch (updateError) {
        log.error('Keychain store failed:', updateError);
      }
    }
  }

  private getKeychain(key: string): string | null {
    if (process.platform !== 'darwin') {
      return null;
    }

    try {
      const result = execSync(
        `security find-generic-password -s "${this.serviceName}" -a "${key}" -w`,
        { encoding: 'utf8' }
      );
      const encoded = result.trim();
      return Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  private deleteKeychain(key: string): void {
    if (process.platform !== 'darwin') {
      return;
    }

    try {
      execSync(`security delete-generic-password -s "${this.serviceName}" -a "${key}"`);
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
    const key = `ai:${providerType}`;

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

    // 回退: 从 Keychain CLI 获取
    return this.getKeychain(key);
  }

  /**
   * 删除 AI API Key
   */
  async deleteAPIKey(providerType: string): Promise<void> {
    const key = `ai:${providerType}`;

    const storePath = this.getKeyPath(providerType);
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }

    this.deleteKeychain(key);
    log.info(`AI API Key 已删除: ${providerType}`);
  }

  /**
   * 检查 API Key 是否存在
   */
  async hasAPIKey(providerType: string): Promise<boolean> {
    const key = await this.getAPIKey(providerType);
    return key !== null && key.length > 0;
  }

  private getKeyPath(providerType: string): string {
    const dir = path.join(app.getPath('userData'), 'credentials');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `ai_${providerType}.enc`);
  }

  private storeKeychain(key: string, value: string): void {
    if (process.platform !== 'darwin') {
      log.warn('Keychain CLI only supported on macOS');
      return;
    }

    const encoded = Buffer.from(value).toString('base64');

    try {
      execSync(
        `security add-generic-password -s "${this.serviceName}" -a "${key}" -w "${encoded}" -D "AI API Key"`,
        { encoding: 'utf8' }
      );
    } catch {
      try {
        execSync(
          `security add-generic-password -s "${this.serviceName}" -a "${key}" -w "${encoded}" -D "AI API Key" -U`,
          { encoding: 'utf8' }
        );
      } catch (updateError) {
        log.error('Keychain store failed:', updateError);
      }
    }
  }

  private getKeychain(key: string): string | null {
    if (process.platform !== 'darwin') {
      return null;
    }

    try {
      const result = execSync(
        `security find-generic-password -s "${this.serviceName}" -a "${key}" -w`,
        { encoding: 'utf8' }
      );
      return result.trim();
    } catch {
      return null;
    }
  }

  private deleteKeychain(key: string): void {
    if (process.platform !== 'darwin') {
      return;
    }

    try {
      execSync(`security delete-generic-password -s "${this.serviceName}" -a "${key}"`);
    } catch {
      // 忽略删除失败
    }
  }
}

export const aiKeyManager = new AIKeyManager();

// ============ 账号管理器 ============

export class AccountManager {
  /**
   * 添加账号（事务保证：account 和 credential 同时创建或都不创建）
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

    // 使用事务包装，确保 account 创建和 credential 存储的原子性
    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO accounts (id, platform, username, display_name, avatar, status, group_id, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    });

    // 执行 account 插入
    transaction();

    // 存储凭证（如果失败，事务不会回滚，需要手动清理）
    try {
      await credentialManager.storeCredential(account.id, {
        username: params.username,
        password: params.password,
        cookies: params.cookies,
        tokens: params.tokens,
      });
    } catch (err) {
      // 凭证存储失败，回滚 account
      try {
        db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
      } catch (rollbackError) {
        log.error(`[CredentialManager] 回滚账号失败: ${accountId}`, rollbackError);
        // 回滚失败也需要抛出原始错误，以便上层知晓操作未完成
      }
      log.error(`账号添加失败（凭证存储错误）: ${accountId}`, err);
      throw err;
    }

    log.info(`账号添加: ${account.id} [${account.platform}] ${account.username}`);
    return account;
  }

  /**
   * 获取账号
   */
  get(accountId: string): Account | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as any;
    return row ? this.rowToAccount(row) : null;
  }

  /**
   * 列出账号
   */
  list(options?: { platform?: Platform; groupId?: string }): Account[] {
    const db = getDb();
    let query = 'SELECT * FROM accounts WHERE 1=1';
    const params: any[] = [];
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
    return (rows as any[]).map(r => this.rowToAccount(r));
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

  private rowToAccount(row: any): Account {
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
