import { createGroup, updateGroup, deleteGroup, listGroups, getGroup, reorderGroups, getGroupAccountCount } from '../account-group.js';
import { IpcChannel } from '../../shared/ipc-channels.js';

export function registerGroupHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle(IpcChannel.GROUP_CREATE, async (_, { name, color }) => {
    return createGroup(name, color);
  });

  ipcMain.handle(IpcChannel.GROUP_UPDATE, async (_, { id, name, color, sortOrder }) => {
    return updateGroup(id, { name, color, sortOrder });
  });

  ipcMain.handle(IpcChannel.GROUP_DELETE, async (_, { groupId }) => {
    return deleteGroup(groupId);
  });

  ipcMain.handle(IpcChannel.GROUP_LIST, async () => {
    return listGroups();
  });

  ipcMain.handle(IpcChannel.GROUP_GET, async (_, { groupId }) => {
    return getGroup(groupId);
  });

  ipcMain.handle(IpcChannel.GROUP_REORDER, async (_, { groups }) => {
    reorderGroups(groups);
    return true;
  });

  ipcMain.handle(IpcChannel.GROUP_GET_ACCOUNT_COUNT, async (_, { groupId }) => {
    return getGroupAccountCount(groupId);
  });
}