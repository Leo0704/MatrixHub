import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockMacosBackend, mockWindowsBackend, mockLinuxBackend } = vi.hoisted(() => ({
  mockMacosBackend: { name: 'macos', isAvailable: vi.fn(), getPassword: vi.fn(), setPassword: vi.fn(), deletePassword: vi.fn() },
  mockWindowsBackend: { name: 'windows', isAvailable: vi.fn(), getPassword: vi.fn(), setPassword: vi.fn(), deletePassword: vi.fn() },
  mockLinuxBackend: { name: 'linux', isAvailable: vi.fn(), getPassword: vi.fn(), setPassword: vi.fn(), deletePassword: vi.fn() },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./macos.js', () => ({ macosKeychainBackend: mockMacosBackend }));
vi.mock('./windows.js', () => ({ windowsCredentialBackend: mockWindowsBackend }));
vi.mock('./linux.js', () => ({ linuxSecretBackend: mockLinuxBackend }));

// We'll re-import per-test to get fresh module state
let selectKeychainBackend: () => Promise<any>;
let getKeychainBackend: () => any;

describe('keychain module', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-setup default mock return values after reset
    mockMacosBackend.isAvailable.mockResolvedValue(false);
    mockWindowsBackend.isAvailable.mockResolvedValue(false);
    mockLinuxBackend.isAvailable.mockResolvedValue(false);

    // Re-import to get fresh module state
    const mod = await import('./index.js');
    selectKeychainBackend = mod.selectKeychainBackend;
    getKeychainBackend = mod.getKeychainBackend;
  });

  it('should return null when no backend is available', async () => {
    const backend = await selectKeychainBackend();
    expect(backend).toBeNull();
  });

  it('should return macos backend when available', async () => {
    mockMacosBackend.isAvailable.mockResolvedValue(true);
    const backend = await selectKeychainBackend();
    expect(backend).toBe(mockMacosBackend);
  });

  it('should return windows when macos unavailable but windows available', async () => {
    mockWindowsBackend.isAvailable.mockResolvedValue(true);
    const backend = await selectKeychainBackend();
    expect(backend).toBe(mockWindowsBackend);
  });

  it('should return linux when macos and windows unavailable', async () => {
    mockLinuxBackend.isAvailable.mockResolvedValue(true);
    const backend = await selectKeychainBackend();
    expect(backend).toBe(mockLinuxBackend);
  });

  it('should skip backends when earlier one is available', async () => {
    mockMacosBackend.isAvailable.mockResolvedValue(true);
    await selectKeychainBackend();
    expect(mockWindowsBackend.isAvailable).not.toHaveBeenCalled();
    expect(mockLinuxBackend.isAvailable).not.toHaveBeenCalled();
  });

  it('should fall through when backend throws error', async () => {
    mockMacosBackend.isAvailable.mockRejectedValue(new Error('not supported'));
    mockWindowsBackend.isAvailable.mockResolvedValue(true);
    const backend = await selectKeychainBackend();
    expect(backend).toBe(mockWindowsBackend);
  });

  it('should cache after first call', async () => {
    mockMacosBackend.isAvailable.mockResolvedValue(true);
    await selectKeychainBackend();
    await selectKeychainBackend();
    expect(mockMacosBackend.isAvailable).toHaveBeenCalledTimes(1);
  });

  it('should set getKeychainBackend after selection', async () => {
    mockLinuxBackend.isAvailable.mockResolvedValue(true);
    await selectKeychainBackend();
    expect(getKeychainBackend()).toBe(mockLinuxBackend);
  });

  it('should log when backend selected', async () => {
    const { default: log } = await import('electron-log');
    mockMacosBackend.isAvailable.mockResolvedValue(true);
    await selectKeychainBackend();
    expect(log.info).toHaveBeenCalled();
  });
});
