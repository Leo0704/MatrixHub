/**
 * Consent IPC Handlers — 用户同意相关的 IPC handler
 */
import { ipcMain } from 'electron';
import { IpcChannel } from '../../shared/ipc-channels.js';

export function registerConsentHandlers(): void {
  ipcMain.handle(IpcChannel.GET_CONSENT_REQUIRED, async () => {
    const { ConsentManager } = await import('../consent-manager.js');
    const manager = new ConsentManager();
    return manager.isConsentRequired();
  });

  ipcMain.handle(IpcChannel.GRANT_CONSENT, async () => {
    const { ConsentManager } = await import('../consent-manager.js');
    const manager = new ConsentManager();
    await manager.grantConsent();
  });
}
