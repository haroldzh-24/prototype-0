import { useCallback, useState } from 'react';
import { TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useRepository } from '@/storage/StorageProvider';
import type { StageSummary } from '@/storage/repository';
import { Screen, Panel, Action, Copy, ui } from '@/ui/kit';
export default function SavedStages() {
  const repo = useRepository(), [stages, setStages] = useState<StageSummary[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<string | null>(null), [name, setName] = useState(''), [deleting, setDeleting] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { let active = true; repo.listStages().then(rows => { if (active) { setStages(rows); setError(''); } }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, [repo]));
  async function run(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); setStages(await repo.listStages()); setRename(null); setDeleting(null); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  return <Screen title="SAVED STAGES"><Action title="+ New Stage" onPress={() => router.push('/builder')} />{!!error && <Copy>{error}</Copy>}{!stages.length && <Copy>No saved stages yet.</Copy>}
    {stages.map(stage => <Panel key={stage.id}><Copy>{stage.name}</Copy><Copy>Edited {new Date(stage.updatedAt).toLocaleString()}</Copy>
      <Action title="Open" disabled={busy} onPress={() => router.push({ pathname: '/builder', params: { id: stage.id } })} />
      <Action title="Rename" disabled={busy} onPress={() => { setRename(stage.id); setName(stage.name); }} />
      {rename === stage.id && <><TextInput accessibilityLabel="Stage name" style={ui.input} value={name} maxLength={100} onChangeText={setName} /><Action title="Apply name" disabled={busy} onPress={() => void run(() => repo.renameStage(stage.id, name))} /><Action title="Cancel rename" onPress={() => setRename(null)} /></>}
      <Action title="Duplicate" disabled={busy} onPress={() => void run(() => repo.duplicateStage(stage.id))} />
      <Action title="Delete" disabled={busy} onPress={() => setDeleting(stage.id)} />
      {deleting === stage.id && <><Copy>Delete this stage permanently?</Copy><Action title="Confirm delete" disabled={busy} onPress={() => void run(() => repo.deleteStage(stage.id))} /><Action title="Keep stage" onPress={() => setDeleting(null)} /></>}
    </Panel>)}
  </Screen>;
}
