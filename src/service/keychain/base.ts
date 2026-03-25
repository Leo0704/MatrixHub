/**
 * Keychain 后端抽象接口
 * 支持多平台：macOS Keychain, Windows Credential Manager, Linux Secret Service
 */

/**
 * Keychain 后端接口
 */
export interface KeychainBackend {
  /** 后端名称 */
  readonly name: string;

  /** 当前平台是否可用 */
  isAvailable(): Promise<boolean>;

  /** 存储凭证 */
  store(service: string, account: string, data: string): Promise<void>;

  /** 获取凭证 */
  retrieve(service: string, account: string): Promise<string | null>;

  /** 删除凭证 */
  delete(service: string, account: string): Promise<void>;

  /** 检查凭证是否存在 */
  exists(service: string, account: string): Promise<boolean>;
}

/**
 * Keychain 错误类型
 */
export class KeychainError extends Error {
  constructor(
    public readonly code: 'NOT_AVAILABLE' | 'STORE_FAILED' | 'RETRIEVE_FAILED' | 'DELETE_FAILED' | 'UNKNOWN',
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'KeychainError';
  }
}
