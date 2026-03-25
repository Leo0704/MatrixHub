/**
 * Windows Credential Manager 后端
 * 使用 keytar 库访问 Windows Credential Manager
 */
import log from 'electron-log';
import type { KeychainBackend } from './base.js';

// 延迟加载 keytar（可能不可用）
let _keytar: typeof import('keytar') | null = null;

async function getKeytar(): Promise<typeof import('keytar') | null> {
  if (_keytar !== null) return _keytar;

  try {
    _keytar = await import('keytar');
    return _keytar;
  } catch {
    log.warn('[Keychain:Windows] keytar 不可用，Windows Credential Manager 功能受限');
    _keytar = null;
    return null;
  }
}

export class WindowsCredentialBackend implements KeychainBackend {
  readonly name = 'windows-credential-manager';

  async isAvailable(): Promise<boolean> {
    return process.platform === 'win32' && (await getKeytar()) !== null;
  }

  async store(service: string, account: string, data: string): Promise<void> {
    const keytar = await getKeytar();
    if (!keytar) {
      throw new Error('keytar not available');
    }

    try {
      await keytar.setPassword(service, account, data);
      log.debug(`[Keychain:Windows] 凭证已存储: ${account}`);
    } catch (error) {
      log.error('[Keychain:Windows] 存储失败:', error);
      throw new Error(`Failed to store credential: ${error}`);
    }
  }

  async retrieve(service: string, account: string): Promise<string | null> {
    const keytar = await getKeytar();
    if (!keytar) return null;

    try {
      return await keytar.getPassword(service, account);
    } catch {
      return null;
    }
  }

  async delete(service: string, account: string): Promise<void> {
    const keytar = await getKeytar();
    if (!keytar) return;

    try {
      await keytar.deletePassword(service, account);
      log.debug(`[Keychain:Windows] 凭证已删除: ${account}`);
    } catch {
      // 忽略删除失败
    }
  }

  async exists(service: string, account: string): Promise<boolean> {
    const data = await this.retrieve(service, account);
    return data !== null;
  }
}

export const windowsCredentialBackend = new WindowsCredentialBackend();
