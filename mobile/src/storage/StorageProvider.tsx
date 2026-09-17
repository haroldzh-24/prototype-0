import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { openDatabaseAsync } from 'expo-sqlite';
import { uuid } from 'expo-modules-core';
import { Repository } from './repository';
import { Screen, Copy, Action } from '../ui/kit';

const Context = createContext<Repository | null>(null);
let opening: Promise<Repository> | undefined;
function open() {
  return opening ??= (async () => {
    const db = await openDatabaseAsync('practical-shooting.db');
    const repo = new Repository(db, uuid.v4);
    try { await repo.initialize(); }
    catch (error) { await db.closeAsync(); throw error; }
    return repo;
  })().catch(error => { opening = undefined; throw error; });
}
export function StorageProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null), [error, setError] = useState(''), [attempt, retry] = useState(0);
  useEffect(() => { let active = true; open().then(value => { if (active) setRepo(value); }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, [attempt]);
  if (!repo) return <Screen title="LOCAL STORAGE"><Copy>{error || 'Opening your saved data…'}</Copy>{!!error && <Action title="Retry" onPress={() => { setError(''); retry(n => n + 1); }} />}</Screen>;
  return <Context.Provider value={repo}>{children}</Context.Provider>;
}
export function useRepository() { const repo = useContext(Context); if (!repo) throw new Error('Storage is not ready.'); return repo; }
