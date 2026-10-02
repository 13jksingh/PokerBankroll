import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Bootstrap } from '../domain/types';
import { api } from './api';
import { getConfig, isConfigured } from './config';

const CACHE_KEY = 'pokerbankroll.bootstrap.v1';
const TABLE_KEY = 'pokerbankroll.table.v1';

interface DataState {
  data: Bootstrap | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  online: boolean;
  configured: boolean;
  tableId: string | null;
  walletLoadedTables: ReadonlySet<string>;
  setTableId: (id: string) => void;
  refresh: () => Promise<void>;
  refreshWallets: (tableId: string) => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

function normalize(data: Bootstrap): Bootstrap {
  return {
    ...data,
    buyIns: data.buyIns ?? [],
    wallets: data.wallets ?? [],
    walletTransactions: data.walletTransactions ?? [],
  };
}

function loadCache(): Bootstrap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw
      ? {
          ...normalize(JSON.parse(raw) as Bootstrap),
          wallets: [],
          walletTransactions: [],
        }
      : null;
  } catch {
    return null;
  }
}

function saveCache(data: Bootstrap) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...data, wallets: [], walletTransactions: [] }),
    );
  } catch {
    /* ignore quota errors */
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => getConfig(), []);
  const configured = isConfigured(config);

  const [data, setData] = useState<Bootstrap | null>(() => loadCache());
  const [loading, setLoading] = useState<boolean>(configured);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState<boolean>(false);
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [walletLoadedTables, setWalletLoadedTables] = useState<Set<string>>(
    () => new Set(),
  );

  const [tableId, setTableIdState] = useState<string | null>(() => {
    return (
      config.initialTableId ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem(TABLE_KEY)
        : null)
    );
  });

  const setTableId = useCallback((id: string) => {
    setTableIdState(id);
    try {
      localStorage.setItem(TABLE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = normalize(await api.bootstrap());
      setData((current) => ({
        ...fresh,
        wallets: current?.wallets ?? [],
        walletTransactions: current?.walletTransactions ?? [],
      }));
      setFromCache(false);
      saveCache(fresh);
    } catch (e) {
      const cached = loadCache();
      if (cached) {
        setData(cached);
        setFromCache(true);
      }
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [configured]);

  const refreshWallets = useCallback(
    async (targetTableId: string) => {
      if (!configured) return;
      const walletData = await api.walletBootstrap(targetTableId);
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          wallets: [
            ...(current.wallets ?? []).filter(
              (wallet) => wallet.tableId !== targetTableId,
            ),
            ...walletData.wallets,
          ],
          walletTransactions: [
            ...(current.walletTransactions ?? []).filter(
              (transaction) => transaction.tableId !== targetTableId,
            ),
            ...walletData.walletTransactions,
          ],
        };
      });
      setWalletLoadedTables((current) => {
        const next = new Set(current);
        next.add(targetTableId);
        return next;
      });
    },
    [configured],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Auto-select a table when none chosen and data is available.
  useEffect(() => {
    if (!tableId && data && data.tables.length > 0) {
      setTableId(data.tables[0].tableId);
    }
  }, [tableId, data, setTableId]);

  const value: DataState = {
    data,
    loading,
    error,
    fromCache,
    online,
    configured,
    tableId,
    walletLoadedTables,
    setTableId,
    refresh,
    refreshWallets,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
