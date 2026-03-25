/**
 * Keychain 后端工厂
 * 根据平台自动选择最佳后端
 */
import log from 'electron-log';
import type { KeychainBackend } from './base.js';
import { macosKeychainBackend } from './macos.js';
import { windowsCredentialBackend } from './windows.js';
import { linuxSecretBackend } from './linux.js';

// 所有可用后端（按优先级排序）
const backends: KeychainBackend[] = [
  macosKeychainBackend,
  windowsCredentialBackend,
  linuxSecretBackend,
];

let _selectedBackend: KeychainBackend | null = null;
let _initialized = false;

/**
 * 选择最佳可用的 Keychain 后端
 */
export async function selectKeychainBackend(): Promise<KeychainBackend | null> {
  if (_initialized) return _selectedBackend;

  log.info('[Keychain] 正在检测可用的后端...');

  for (const backend of backends) {
    try {
      if (await backend.isAvailable()) {
        _selectedBackend = backend;
        _initialized = true;
        log.info(`[Keychain] 已选择后端: ${backend.name}`);
        return backend;
      }
    } catch (error) {
      log.debug(`[Keychain] 后端不可用 ${backend.name}:`, error);
    }
  }

  log.warn('[Keychain] 未找到可用的系统密钥库，将仅使用 safeStorage');
  _initialized = true;
  return null;
}

/**
 * 获取当前选择的后端
 */
export function getKeychainBackend(): KeychainBackend | null {
  return _selectedBackend;
}

/**
 * 重新检测后端
 */
export async function reinitializeBackend(): Promise<KeychainBackend | null> {
  _initialized = false;
  _selectedBackend = null;
  return selectKeychainBackend();
}

// 导出类型和后端
export * from './base.js';
export { macosKeychainBackend } from './macos.js';
export { windowsCredentialBackend } from './windows.js';
export { linuxSecretBackend } from './linux.js';
