import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import StageBuilder from '@/editor/StageBuilder';
import { useRepository } from '@/storage/StorageProvider';
import type { SavedStage } from '@/storage/repository';
import { Screen, Copy } from '@/ui/kit';
export default function BuilderRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <LoadedBuilder key={id ?? 'new'} id={id} />;
}
function LoadedBuilder({ id }: { id?: string }) {
  const repo = useRepository(), [saved, setSaved] = useState<SavedStage>(), [error, setError] = useState('');
  useEffect(() => { let active = true; if (id) repo.loadStage(id).then(row => { if (active) setSaved(row); }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, [id, repo]);
  if (id && !saved) return <Screen title="STAGE BUILDER"><Copy>{error || 'Loading stage...'}</Copy></Screen>;
  return <StageBuilder initial={saved} />;
}
