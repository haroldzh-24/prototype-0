import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import StageBuilder from '@/editor/StageBuilder';
import { useRepository } from '@/storage/StorageProvider';
import type { Match, SavedStage } from '@/storage/repository';
import { Screen, Copy, Action } from '@/ui/kit';

export default function BuilderRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!id) return <Redirect href="/planner" />;
  return <LoadedBuilder key={id} id={id} />;
}
function LoadedBuilder({ id }: { id: string }) {
  const repo = useRepository(), [data, setData] = useState<{ saved: SavedStage; match: Match }>(), [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    repo.loadStage(id).then(async saved => ({ saved, match: await repo.loadMatch(saved.matchId) }))
      .then(next => { if (active) { setData(next); setError(''); } }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [id, repo]));
  if (error || !data) return <Screen title="STAGE DESIGNER"><Copy>{error || 'Loading stage...'}</Copy><Action title="Back to Matches" onPress={() => router.dismissTo('/planner')} /></Screen>;
  return <StageBuilder initial={data.saved} targetFamily={data.match.targetFamily} />;
}
