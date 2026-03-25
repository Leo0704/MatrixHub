import { createGroup, updateGroup, deleteGroup, listGroups, getGroup, reorderGroups, getGroupAccountCount } from '../account-group.js';

export function registerGroupHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('group:create', async (_, { name, color }) => {
    return createGroup(name, color);
  });

  ipcMain.handle('group:update', async (_, { id, name, color, sortOrder }) => {
    return updateGroup(id, { name, color, sortOrder });
  });

  ipcMain.handle('group:delete', async (_, { groupId }) => {
    return deleteGroup(groupId);
  });

  ipcMain.handle('group:list', async () => {
    return listGroups();
  });

  ipcMain.handle('group:get', async (_, { groupId }) => {
    return getGroup(groupId);
  });

  ipcMain.handle('group:reorder', async (_, { groups }) => {
    reorderGroups(groups);
    return true;
  });

  ipcMain.handle('group:get-account-count', async (_, { groupId }) => {
    return getGroupAccountCount(groupId);
  });
}