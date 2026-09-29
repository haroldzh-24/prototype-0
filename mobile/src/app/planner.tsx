import { useCallback, useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Screen, Panel, Action, Copy, ui } from '@/ui/kit';
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
  return <Screen title="MATCHES">
    <Action title="+ Create Match" disabled={busy} onPress={() => edit('new')} />
    {!!error && !editing && !deleting && <><Copy>{error}</Copy><Action title="Retry" disabled={busy} onPress={() => void run(async () => {})} /></>}
    {!loaded && !error && <Copy>Loading matches...</Copy>}
    {loaded && !matches.length && <Copy>No matches yet. Create a match to add stages.</Copy>}
    {matches.map(match => <Panel key={match.id}>
      <Copy>{match.name}</Copy><Copy>{match.targetFamily} / {match.stageCount} {match.stageCount === 1 ? 'stage' : 'stages'}</Copy>
      <Action title={'Open ' + match.name} disabled={busy} onPress={() => router.push({ pathname: '/match', params: { id: match.id } })} />
      <Action title="Rename / Target family" disabled={busy} onPress={() => edit(match)} />
      <Action title="Duplicate match" disabled={busy} onPress={() => void run(() => repo.duplicateMatch(match.id))} />
      <Action title="Delete match" disabled={busy} onPress={() => { setError(''); setDeleting(match); }} />
    </Panel>)}
    <EditorSheet title={editing === 'new' ? 'Create Match' : 'Match Settings'} visible={editing !== null} close={() => { if (!running.current) setEditing(null); }}>
      <Panel><Copy>Match name</Copy><TextInput accessibilityLabel="Match name" autoFocus style={ui.input} value={name} maxLength={100} editable={!busy} onChangeText={setName} />
        <Copy>Target family</Copy><TargetFamilyPicker value={family} onChange={setFamily} disabled={busy} />
        {editing !== 'new' && <Copy>This sets the default for new targets. Existing targets keep their family and geometry.</Copy>}
        <Action title={busy ? 'Saving...' : editing === 'new' ? 'Create Match' : 'Save match'} disabled={busy || !name.trim()} onPress={() => void run(async () => {
          if (editing === 'new') { const id = await repo.createMatch(name, family); setEditing(null); router.push({ pathname: '/match', params: { id } }); }
          else if (editing) await repo.updateMatch(editing.id, name, family);
        })} />{!!error && <Copy>{error}</Copy>}
      </Panel>
    </EditorSheet>
    <EditorSheet title="Delete match" visible={deleting !== null} close={() => { if (!running.current) setDeleting(null); }}>
      <Panel><Copy>Delete {deleting?.name} and all its stages permanently? Other matches will be kept.</Copy>
        <Action title="Keep match" disabled={busy} onPress={() => setDeleting(null)} />
        <Action title={busy ? 'Deleting...' : 'Confirm delete match'} disabled={busy} onPress={() => { if (deleting) void run(() => repo.deleteMatch(deleting.id)); }} />
        {!!error && <Copy>{error}</Copy>}
      </Panel>
    </EditorSheet>
  </Screen>;
}
