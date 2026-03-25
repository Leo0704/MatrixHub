/**
 * keytar 类型声明
 * keytar 是可选的原生依赖，仅在 Windows/Linux 上需要
 * macOS 使用 security CLI 作为回退
 */
declare module 'keytar' {
  /**
   * 获取密码
   */
  export function getPassword(service: string, account: string): Promise<string | null>;

  /**
   * 设置密码
   */
  export function setPassword(service: string, account: string, password: string): Promise<void>;

  /**
   * 删除密码
   */
  export function deletePassword(service: string, account: string): Promise<boolean>;

  /**
   * 查找凭证
   */
  export function findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;

  /**
   * 查找密码
   */
  export function findPassword(service: string): Promise<string | null>;
}
