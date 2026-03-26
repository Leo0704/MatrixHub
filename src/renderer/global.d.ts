import type { ElectronAPI } from '../shared/ipc-api.js';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
