/**
 * Linux Secret Service 后端
 * 支持 GNOME Keyring / KDE Wallet
 * 使用 keytar 库（基于 Secret Service API）
 */
import log from 'electron-log';
import type { KeychainBackend } from './base.js';

// 延迟加载 keytar
let _keytar: typeof import('keytar') | null = null;

async function getKeytar(): Promise<typeof import('keytar') | null> {
  if (_keytar !== null) return _keytar;

  try {
    _keytar = await import('keytar');
    return _keytar;
  } catch {
    log.warn('[Keychain:Linux] keytar 不可用，请确保已安装 libsecret-dev');
    _keytar = null;
    return null;
  }
}

export class LinuxSecretBackend implements KeychainBackend {
  readonly name = 'linux-secret-service';

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'linux') return false;

    const keytar = await getKeytar();
    if (!keytar) return false;

    // 尝试测试调用来验证 Secret Service 是否可用
    try {
      // 尝试获取一个不存在的凭证来测试服务
      await keytar.getPassword('matrixhub-test-connection', 'test');
      return true;
    } catch {
      log.warn('[Keychain:Linux] Secret Service 不可用（可能是 GNOME Keyring 未运行）');
      return false;
    }
  }

  async store(service: string, account: string, data: string): Promise<void> {
    const keytar = await getKeytar();
    if (!keytar) {
      throw new Error('keytar not available');
    }

    try {
      await keytar.setPassword(service, account, data);
      log.debug(`[Keychain:Linux] 凭证已存储: ${account}`);
    } catch (error) {
      log.error('[Keychain:Linux] 存储失败:', error);
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
      log.debug(`[Keychain:Linux] 凭证已删除: ${account}`);
    } catch {
      // 忽略删除失败
    }
  }

  async exists(service: string, account: string): Promise<boolean> {
    const data = await this.retrieve(service, account);
    return data !== null;
  }
}

export const linuxSecretBackend = new LinuxSecretBackend();
