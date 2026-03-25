import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Create mock implementations that can be reconfigured per test
const mockPrepareRun = vi.fn(() => ({ changes: 1 }));
const mockPrepareGet = vi.fn(() => null);
const mockPrepareAll = vi.fn(() => []);

const mockDbObj = {
  prepare: vi.fn(() => ({
    run: mockPrepareRun,
    get: mockPrepareGet,
    all: mockPrepareAll,
  })),
  transaction: vi.fn(),
  close: vi.fn(),
};

vi.mock('./db.js', () => ({ getDb: () => mockDbObj }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-group-uuid') }));

import {
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupAccountCount,
  listGroups,
  getGroup,
  reorderGroups,
} from './account-group.js';

describe('account-group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default implementations
    mockPrepareRun.mockReturnValue({ changes: 1 });
    mockPrepareGet.mockReturnValue(null);
    mockPrepareAll.mockReturnValue([]);
    mockDbObj.prepare.mockImplementation(() => ({
      run: mockPrepareRun,
      get: mockPrepareGet,
      all: mockPrepareAll,
    }));
    // Default transaction: return a callable that executes the callback
    mockDbObj.transaction.mockImplementation((fn: Function) => {
      return () => {
        fn();
        const lastCall = mockPrepareRun.mock.results[mockPrepareRun.mock.results.length - 1];
        return (lastCall?.value?.changes ?? 1) > 0;
      };
    });
  });

  const groupRow = (overrides: Record<string, any> = {}) => ({
    id: 'group-1',
    name: 'Test Group',
    color: '#6366f1',
    sort_order: 0,
    created_at: 1700000000000,
    updated_at: 1700000000000,
    ...overrides,
  });

  describe('createGroup()', () => {
    it('should create a group with default color', () => {
      mockPrepareGet.mockReturnValue({ next: 1 });

      const group = createGroup('My Group');

      expect(group.id).toBe('test-group-uuid');
      expect(group.name).toBe('My Group');
      expect(group.color).toBe('#6366f1');
      expect(group.sortOrder).toBe(1);
    });

    it('should create a group with custom color', () => {
      mockPrepareGet.mockReturnValue({ next: 2 });

      const group = createGroup('Red Group', '#ef4444');

      expect(group.color).toBe('#ef4444');
    });

    it('should call INSERT', () => {
      mockPrepareGet.mockReturnValue({ next: 1 });

      createGroup('Insert Test');

      const insertCall = mockDbObj.prepare.mock.calls.find(([s]) => s.includes('INSERT INTO account_groups'));
      expect(insertCall).toBeDefined();
    });
  });

  describe('updateGroup()', () => {
    it('should return null when group not found', () => {
      mockPrepareGet.mockReturnValue(undefined);

      const result = updateGroup('nonexistent', { name: 'New Name' });
      expect(result).toBeNull();
    });

    it('should update group name', () => {
      mockPrepareGet.mockReturnValue(groupRow());

      const result = updateGroup('group-1', { name: 'Updated Name' });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Name');
    });

    it('should update group color', () => {
      mockPrepareGet.mockReturnValue(groupRow());

      const result = updateGroup('group-1', { color: '#22c55e' });
      expect(result!.color).toBe('#22c55e');
    });

    it('should update sortOrder', () => {
      mockPrepareGet.mockReturnValue(groupRow());

      const result = updateGroup('group-1', { sortOrder: 5 });
      expect(result!.sortOrder).toBe(5);
    });

    it('should preserve existing fields when updating one', () => {
      const existing = groupRow({ name: 'Original', color: '#original' });
      mockPrepareGet.mockReturnValue(existing);

      const result = updateGroup('group-1', { name: 'New Name' });
      expect(result!.name).toBe('New Name');
      expect(result!.color).toBe('#original');
    });
  });

  describe('deleteGroup()', () => {
    it('should return false when group not found', () => {
      mockPrepareRun.mockReturnValue({ changes: 0 });

      const result = deleteGroup('nonexistent');
      expect(result).toBe(false);
    });

    it('should return true when group deleted', () => {
      mockPrepareRun.mockReturnValue({ changes: 1 });

      const result = deleteGroup('group-1');
      expect(result).toBe(true);
    });

    it('should clear group_id on accounts before deleting', () => {
      mockPrepareRun.mockReturnValue({ changes: 1 });

      deleteGroup('group-1');

      const updateCall = mockDbObj.prepare.mock.calls.find(([s]) => s.includes('UPDATE accounts SET group_id'));
      expect(updateCall).toBeDefined();
    });
  });

  describe('getGroupAccountCount()', () => {
    it('should return account count', () => {
      mockPrepareGet.mockReturnValue({ count: 5 });

      const count = getGroupAccountCount('group-1');
      expect(count).toBe(5);
    });
  });

  describe('listGroups()', () => {
    it('should return empty array when no groups', () => {
      mockPrepareAll.mockReturnValue([]);

      const groups = listGroups();
      expect(groups).toEqual([]);
    });

    it('should return mapped groups ordered by sort_order', () => {
      const rows = [
        groupRow({ id: 'g1', name: 'Group 1', sort_order: 1 }),
        groupRow({ id: 'g2', name: 'Group 2', sort_order: 2 }),
      ];
      mockPrepareAll.mockReturnValue(rows);

      const groups = listGroups();
      expect(groups).toHaveLength(2);
      expect(groups[0].sortOrder).toBe(1);
      expect(groups[1].sortOrder).toBe(2);
    });
  });

  describe('getGroup()', () => {
    it('should return null when group not found', () => {
      mockPrepareGet.mockReturnValue(undefined);

      expect(getGroup('nonexistent')).toBeNull();
    });

    it('should return mapped group', () => {
      mockPrepareGet.mockReturnValue(groupRow({ name: 'Found Group' }));

      const result = getGroup('group-1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Found Group');
    });
  });

  describe('reorderGroups()', () => {
    it('should update sort_order for each group via prepared statement', () => {
      const runFn = vi.fn(() => ({ changes: 1 }));
      mockDbObj.prepare.mockReturnValue({ run: runFn });

      reorderGroups([
        { id: 'g1', sortOrder: 2 },
        { id: 'g2', sortOrder: 1 },
      ]);

      expect(runFn).toHaveBeenCalledTimes(2);
      expect(runFn).toHaveBeenCalledWith(2, expect.any(Number), 'g1');
      expect(runFn).toHaveBeenCalledWith(1, expect.any(Number), 'g2');
    });

    it('should call db.transaction', () => {
      mockDbObj.prepare.mockReturnValue({ run: mockPrepareRun });

      reorderGroups([{ id: 'g1', sortOrder: 1 }]);

      expect(mockDbObj.transaction).toHaveBeenCalled();
    });
  });
});
