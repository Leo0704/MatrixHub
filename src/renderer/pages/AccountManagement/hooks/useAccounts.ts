import { useState, useEffect, useCallback } from 'react';
import type { Account } from '~shared/types';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await window.electronAPI?.listAccounts();
      setAccounts(result ?? []);
    } catch { /* error handled via toast */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAccounts();
    window.electronAPI?.onAccountAdded((account) => setAccounts(prev => [account, ...prev]));
    window.electronAPI?.onAccountUpdated((account) => setAccounts(prev => prev.map(a => a.id === account.id ? account : a)));
    window.electronAPI?.onAccountRemoved(({ accountId }) => setAccounts(prev => prev.filter(a => a.id !== accountId)));

    return () => {
      window.electronAPI?.removeAllListeners('account:added');
      window.electronAPI?.removeAllListeners('account:updated');
      window.electronAPI?.removeAllListeners('account:removed');
    };
  }, [loadAccounts]);

  return { accounts, loading, reload: loadAccounts };
}
