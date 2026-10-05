import { useCallback, useRef, useState } from 'react';
import { Text } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen, Panel, Action, Copy, EmptyState, Loading, Notice, ErrorState, ScreenHeader, MenuRow, Input, DeleteConfirmation, ui } from '@/ui/kit';
import LibraryCard from '@/ui/LibraryCard';
import EditorSheet from '@/editor/EditorSheet';
import { useRepository } from '@/storage/StorageProvider';
import type { Match, StageSummary } from '@/storage/repository';
import { createDefaultStage } from '@/stage/defaults';
import { createPlan } from '@/planning/model';

export default function MatchRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <MatchStages key={id ?? 'missing'} id={id} />;
}
function MatchStages({ id }: { id?: string }) {
  const repo = useRepository();
  const [match, setMatch] = useState<Match | null>(null), [stages, setStages] = useState<StageSummary[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), running = useRef(false);
  const [editing, setEditing] = useState<StageSummary | 'new' | null>(null), [name, setName] = useState('');
  const [menu, setMenu] = useState<StageSummary | null>(null);
  const [deleting, setDeleting] = useState<StageSummary | null>(null);
  const load = useCallback(async () => {
    if (!id) throw new Error('Choose a match from Matches.');
    const [match, stages] = await Promise.all([repo.loadMatch(id), repo.listStages(id)]);
    return { match, stages };
  }, [id, repo]);
  useFocusEffect(useCallback(() => {
    let active = true;
    load().then(data => { if (active) { setMatch(data.match); setStages(data.stages); setError(''); } })
      .catch(cause => { if (active) { setMatch(null); setError(String(cause)); } });
    return () => { active = false; };
  }, [load]));
  async function run(work: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await work(); const data = await load(); setMatch(data.match); setStages(data.stages); setEditing(null); setDeleting(null); }
    catch (cause) { setError(String(cause)); }
    finally { running.current = false; setBusy(false); }
  }
  return <Screen safeTop header={<ScreenHeader title="STAGES" back={() => router.dismissTo('/planner')} action={<Action title="+ STAGE" variant="primary" disabled={busy || !match} onPress={() => { setEditing('new'); setName(''); setError(''); }} />} />}>
    {!!error && !editing && !deleting && <ErrorState title="Couldn’t load or update stages." detail={error} busy={busy} retry={() => void run(async () => {})} />}
    {!match && !error && <Loading label="Loading stages…" />}
    {match && <>
      <Text style={ui.title}>{match.name}</Text>
      <Copy>{match.targetFamily} · {stages.length} {stages.length === 1 ? 'stage' : 'stages'}</Copy>

      {!stages.length && <EmptyState title="No stages" detail="Add your first stage to this match." />}
      {stages.map(stage => <LibraryCard key={stage.id} name={stage.name} detail={'Edited ' + new Date(stage.updatedAt).toLocaleString()}
        disabled={busy} open={() => router.push({ pathname: '/builder', params: { id: stage.id } })} more={() => setMenu(stage)} />)}
    </>}
    <EditorSheet title={menu?.name ?? 'Stage actions'} visible={!!menu} close={() => setMenu(null)}>
      <MenuRow title="Rename" onPress={() => { if (menu) { setEditing(menu); setName(menu.name); setError(''); } setMenu(null); }} />
      <MenuRow title="Duplicate" onPress={() => { if (menu) void run(() => repo.duplicateStage(menu.id)); setMenu(null); }} />
      <MenuRow title="Delete" destructive onPress={() => { setDeleting(menu); setError(''); setMenu(null); }} />
    </EditorSheet>
    <EditorSheet title={editing === 'new' ? 'Add Stage' : 'Rename Stage'} visible={editing !== null} close={() => { if (!running.current) setEditing(null); }}>
      <Panel><Input label="Stage name" value={name} disabled={busy} onChange={setName} />
        <Action variant="primary" title={busy ? 'Saving...' : editing === 'new' ? 'Open Stage Designer' : 'Apply name'} disabled={busy || !name.trim()} onPress={() => void run(async () => {
          if (editing === 'new' && match) {
            const current = await repo.loadMatch(match.id);
            const stageId = await repo.createStage(name, createDefaultStage(current.targetFamily), createPlan(), current.id);
            setEditing(null); router.push({ pathname: '/builder', params: { id: stageId } });
          } else if (editing && editing !== 'new') await repo.renameStage(editing.id, name);
        })} />{!!error && <ErrorState title="Changes could not be saved." detail={error} />}
      </Panel>
    </EditorSheet>
    <EditorSheet title="Delete stage" visible={deleting !== null} close={() => { if (!running.current) setDeleting(null); }}>
      <DeleteConfirmation noun="stage" detail={'Delete ' + deleting?.name + ' and its saved planning data?'} busy={busy} onKeep={() => setDeleting(null)} onDelete={() => { if (deleting) void run(() => repo.deleteStage(deleting.id)); }} error={error} />
    </EditorSheet>
  </Screen>;
}
