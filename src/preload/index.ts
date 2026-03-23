import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string>;
  onMenuAction: (channel: string, callback: () => void) => void;
}

const api: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),
  onMenuAction: (channel: string, callback: () => void) => {
    ipcRenderer.on(channel, callback);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
