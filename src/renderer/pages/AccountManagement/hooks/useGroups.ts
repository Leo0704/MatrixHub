import { useState, useEffect, useCallback } from 'react';
import type { AccountGroup } from '~shared/types';

export function useGroups() {
  const [groups, setGroups] = useState<AccountGroup[]>([]);

  const loadGroups = useCallback(async () => {
    try {
      const groupsResult = await window.electronAPI?.listGroups();
      setGroups(groupsResult ?? []);
    } catch { /* error handled via toast */ }
  }, []);

  useEffect(() => {
    loadGroups();
    window.electronAPI?.onGroupCreated((group) => setGroups(prev => [...prev, group]));
    window.electronAPI?.onGroupUpdated((group) => setGroups(prev => prev.map(g => g.id === group.id ? group : g)));
    window.electronAPI?.onGroupDeleted(({ groupId }) => setGroups(prev => prev.filter(g => g.id !== groupId)));

    return () => {
      window.electronAPI?.removeAllListeners('group:created');
      window.electronAPI?.removeAllListeners('group:updated');
      window.electronAPI?.removeAllListeners('group:deleted');
    };
  }, [loadGroups]);

  return { groups, reload: loadGroups };
}
