import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerGroupHandlers } from '../group-handlers.js';
import { createGroup, updateGroup, deleteGroup, reorderGroups } from '../../account-group.js';

// Mock account-group module
vi.mock('../../account-group.js', () => ({
  createGroup: vi.fn().mockResolvedValue({ id: '1', name: 'Test', color: '#fff' }),
  updateGroup: vi.fn().mockResolvedValue({ id: '1', name: 'Updated', color: '#000' }),
  deleteGroup: vi.fn().mockResolvedValue(true),
  listGroups: vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
  getGroup: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
  reorderGroups: vi.fn(),
  getGroupAccountCount: vi.fn().mockResolvedValue(5),
}));

describe('Group Handlers', () => {
  let mockIpcMain: any;

  beforeEach(() => {
    mockIpcMain = {
      handle: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should register all group handlers', () => {
    registerGroupHandlers(mockIpcMain);

    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:create', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:update', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:delete', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:list', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:get', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:reorder', expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith('group:get-account-count', expect.any(Function));
  });

  it('should create group with name and color', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:create')[1];

    const result = await handler(null, { name: 'Test Group', color: '#ff0000' });

    expect(createGroup).toHaveBeenCalledWith('Test Group', '#ff0000');
    expect(result).toEqual({ id: '1', name: 'Test', color: '#fff' });
  });

  it('should update group with id and fields', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:update')[1];

    const result = await handler(null, { id: '1', name: 'Updated', color: '#000', sortOrder: 2 });

    expect(updateGroup).toHaveBeenCalledWith('1', { name: 'Updated', color: '#000', sortOrder: 2 });
    expect(result).toEqual({ id: '1', name: 'Updated', color: '#000' });
  });

  it('should delete group by id', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:delete')[1];

    const result = await handler(null, { groupId: '1' });

    expect(deleteGroup).toHaveBeenCalledWith('1');
    expect(result).toBe(true);
  });

  it('should list all groups', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:list')[1];

    const result = await handler(null);

    expect(result).toEqual([{ id: '1', name: 'Test' }]);
  });

  it('should get single group by id', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:get')[1];

    const result = await handler(null, { groupId: '1' });

    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  it('should reorder groups', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:reorder')[1];

    const result = await handler(null, { groups: ['1', '2', '3'] });

    expect(reorderGroups).toHaveBeenCalledWith(['1', '2', '3']);
    expect(result).toBe(true);
  });

  it('should get account count for group', async () => {
    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:get-account-count')[1];

    const result = await handler(null, { groupId: '1' });

    expect(result).toBe(5);
  });

  it('should propagate error when createGroup fails', async () => {
    const { createGroup: mockCreateGroup } = await import('../../account-group.js');
    mockCreateGroup.mockRejectedValueOnce(new Error('Database error'));

    registerGroupHandlers(mockIpcMain);
    const handler = mockIpcMain.handle.mock.calls.find((call: any) => call[0] === 'group:create')[1];

    await expect(handler(null, { name: 'Test', color: '#fff' })).rejects.toThrow('Database error');
  });
});
