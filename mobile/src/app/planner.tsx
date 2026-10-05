import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Screen, Panel, Action, Copy, EmptyState, Loading, Notice, ErrorState, ScreenHeader, MenuRow, Input, DeleteConfirmation } from '@/ui/kit';
import LibraryCard from '@/ui/LibraryCard';
import EditorSheet from '@/editor/EditorSheet';
import TargetFamilyPicker from '@/ui/TargetFamilyPicker';
import { useRepository } from '@/storage/StorageProvider';
import type { MatchSummary } from '@/storage/repository';
import type { TargetFamily } from '@/stage/targetFamily';

export default function Matches() {
  const repo = useRepository();
  const [matches, setMatches] = useState<MatchSummary[]>([]), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), running = useRef(false);
  const [editing, setEditing] = useState<MatchSummary | 'new' | null>(null);
  const [menu, setMenu] = useState<MatchSummary | null>(null);
  const [deleting, setDeleting] = useState<MatchSummary | null>(null);
  const [name, setName] = useState(''), [family, setFamily] = useState<TargetFamily>('USPSA');
  useFocusEffect(useCallback(() => {
    let active = true;
    repo.listMatches().then(rows => { if (active) { setMatches(rows); setLoaded(true); setError(''); } })
      .catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [repo]));
  async function run(work: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await work(); setMatches(await repo.listMatches()); setLoaded(true); setEditing(null); setDeleting(null); }
    catch (cause) { setError(String(cause)); }
    finally { running.current = false; setBusy(false); }
  }
  const edit = (match: MatchSummary | 'new') => {
    setName(match === 'new' ? '' : match.name); setFamily(match === 'new' ? 'USPSA' : match.targetFamily);
    setError(''); setEditing(match);
  };
  return <Screen safeTop header={<ScreenHeader title="MATCHES" back={() => router.dismissTo('/')} action={<Action title="+ MATCH" variant="primary" disabled={busy} onPress={() => edit('new')} />} />}>
    <Copy>Competition stage libraries</Copy>
    {!!error && !editing && !deleting && <ErrorState title="Couldn’t load or update matches." detail={error} busy={busy} retry={() => void run(async () => {})} />}
    {!loaded && !error && <Loading label="Loading matches…" />}
    {loaded && !error && !matches.length && <EmptyState title="No matches" detail="Create a match to start organizing stages." />}
    {matches.map(match => <LibraryCard key={match.id} name={match.name} category={match.targetFamily}
      detail={match.stageCount + ' ' + (match.stageCount === 1 ? 'stage' : 'stages')} disabled={busy}
      open={() => router.push({ pathname: '/match', params: { id: match.id } })} more={() => setMenu(match)} />)}
    <EditorSheet title={menu?.name ?? 'Match actions'} visible={!!menu} close={() => setMenu(null)}>
      <MenuRow title="Edit match" onPress={() => { if (menu) edit(menu); setMenu(null); }} />
      <MenuRow title="Duplicate" onPress={() => { if (menu) void run(() => repo.duplicateMatch(menu.id)); setMenu(null); }} />
      <MenuRow title="Delete" destructive onPress={() => { setDeleting(menu); setError(''); setMenu(null); }} />
    </EditorSheet>
    <EditorSheet title={editing === 'new' ? 'Create Match' : 'Match Settings'} visible={editing !== null} close={() => { if (!running.current) setEditing(null); }}>
      <Panel><Input label="Match name" value={name} disabled={busy} onChange={setName} />
        <Copy>Target family</Copy><TargetFamilyPicker value={family} onChange={setFamily} disabled={busy} />
        {editing !== 'new' && <Copy>This sets the default for new targets. Existing targets keep their family and geometry.</Copy>}
        <Action variant="primary" title={busy ? 'Saving...' : editing === 'new' ? 'Create Match' : 'Save match'} disabled={busy || !name.trim()} onPress={() => void run(async () => {
          if (editing === 'new') { const id = await repo.createMatch(name, family); setEditing(null); router.push({ pathname: '/match', params: { id } }); }
          else if (editing) await repo.updateMatch(editing.id, name, family);
        })} />{!!error && <ErrorState title="Changes could not be saved." detail={error} />}
      </Panel>
    </EditorSheet>
    <EditorSheet title="Delete match" visible={deleting !== null} close={() => { if (!running.current) setDeleting(null); }}>
      <DeleteConfirmation noun="match" detail={'Delete ' + deleting?.name + ' and all its stages? Saved planning data will be removed.'} busy={busy} onKeep={() => setDeleting(null)} onDelete={() => { if (deleting) void run(() => repo.deleteMatch(deleting.id)); }} error={error} />
    </EditorSheet>
  </Screen>;
}
