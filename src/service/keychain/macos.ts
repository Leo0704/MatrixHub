/**
 * macOS Keychain 后端
 * 使用 security CLI 访问 macOS Keychain
 * 使用 execFileSync 防止命令注入
 */
import { execFileSync } from 'child_process';
import log from 'electron-log';
import type { KeychainBackend } from './base.js';

export class MacOSKeychainBackend implements KeychainBackend {
  readonly name = 'macos-keychain';

  async isAvailable(): Promise<boolean> {
    return process.platform === 'darwin';
  }

  async store(service: string, account: string, data: string): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('macOS Keychain only available on macOS');
    }

    const encoded = Buffer.from(data).toString('base64');

    try {
      // 先尝试更新已存在的条目（-U 参数）
      execFileSync(
        'security',
        [
          'add-generic-password',
          '-s', service,
          '-a', account,
          '-w', encoded,
          '-D', 'MatrixHub Credential',
          '-U'
        ],
        { encoding: 'utf8' }
      );
      log.debug(`[Keychain:macOS] 凭证已存储: ${account}`);
    } catch {
      // 如果 -U 失败，尝试不带 -U 的新建
      try {
        execFileSync(
          'security',
          [
            'add-generic-password',
            '-s', service,
            '-a', account,
            '-w', encoded,
            '-D', 'MatrixHub Credential'
          ],
          { encoding: 'utf8' }
        );
      } catch (createError) {
        log.error('[Keychain:macOS] 存储失败:', createError);
        throw new Error(`Failed to store credential: ${createError}`);
      }
    }
  }

  async retrieve(service: string, account: string): Promise<string | null> {
    if (process.platform !== 'darwin') {
      return null;
    }

    try {
      const result = execFileSync(
        'security',
        [
          'find-generic-password',
          '-s', service,
          '-a', account,
          '-w'
        ],
        { encoding: 'utf8' }
      );
      const encoded = result.trim();
      return Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  async delete(service: string, account: string): Promise<void> {
    if (process.platform !== 'darwin') {
      return;
    }

    try {
      execFileSync(
        'security',
        [
          'delete-generic-password',
          '-s', service,
          '-a', account
        ],
        { encoding: 'utf8' }
      );
      log.debug(`[Keychain:macOS] 凭证已删除: ${account}`);
    } catch {
      // 忽略删除失败（可能不存在）
    }
  }

  async exists(service: string, account: string): Promise<boolean> {
    const data = await this.retrieve(service, account);
    return data !== null;
  }
}

export const macosKeychainBackend = new MacOSKeychainBackend();
