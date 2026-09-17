import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useRepository } from './StorageProvider';
import type { StageSummary } from './repository';
import { Action, Copy } from '../ui/kit';
export default function RecentStages() {
  const repo = useRepository(), [stages, setStages] = useState<StageSummary[]>([]), [error, setError] = useState('');
  useFocusEffect(useCallback(() => { let active = true; repo.listStages().then(rows => { if (active) { setStages(rows.slice(0, 3)); setError(''); } }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, [repo]));
  return <><Copy>RECENTLY EDITED</Copy>{!!error && <Copy>{error}</Copy>}{!error && !stages.length && <Copy>No saved stages yet.</Copy>}{stages.map(stage => <Action key={stage.id} title={stage.name} onPress={() => router.push({ pathname: '/builder', params: { id: stage.id } })} />)}</>;
}
