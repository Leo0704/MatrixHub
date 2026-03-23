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
      // 回退: 使用 Keychain CLI
      this.storeKeychain(keychainKey, data);
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

    try {
      // 使用 pwd 加密存储
      const encoded = Buffer.from(value).toString('base64');
      execSync(
        `security add-generic-password -s "${this.serviceName}" -a "${key}" -w "${encoded}" -D "AI矩阵运营大师"`,
        { encoding: 'utf8' }
      );
    } catch (error) {
      // 可能已存在，尝试更新
      try {
        execSync(
          `security add-generic-password -s "${this.serviceName}" -a "${key}" -w "${encoded}" -D "AI矩阵运营大师" -U`,
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

// ============ 账号管理器 ============

export class AccountManager {
  /**
   * 添加账号
   */
  add(params: {
    platform: Platform;
    username: string;
    displayName: string;
    avatar?: string;
    password: string;
    cookies?: string;
    tokens?: Record<string, string>;
  }): Account {
    const db = getDb();
    const now = Date.now();

    const account: Account = {
      id: uuidv4(),
      platform: params.platform,
      username: params.username,
      displayName: params.displayName,
      avatar: params.avatar,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO accounts (id, platform, username, display_name, avatar, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.id,
      account.platform,
      account.username,
      account.displayName,
      account.avatar ?? null,
      account.status,
      account.createdAt,
      account.updatedAt
    );

    // 存储凭证
    credentialManager.storeCredential(account.id, {
      username: params.username,
      password: params.password,
      cookies: params.cookies,
      tokens: params.tokens,
    });

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
  list(platform?: Platform): Account[] {
    const db = getDb();
    const rows = platform
      ? db.prepare('SELECT * FROM accounts WHERE platform = ? ORDER BY created_at DESC').all(platform)
      : db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all();

    return (rows as any[]).map(r => this.rowToAccount(r));
  }

  /**
   * 更新账号
   */
  update(accountId: string, updates: Partial<Pick<Account, 'displayName' | 'avatar' | 'status'>>): Account | null {
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
      lastUsedAt: row.last_used_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const accountManager = new AccountManager();
