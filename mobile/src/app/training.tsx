import { useCallback, useState } from 'react';
import { TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { uuid } from 'expo-modules-core';
import { useRepository } from '@/storage/StorageProvider';
import { startingTypes } from '@/training/model';
import type { StartingType, TrainingRecord } from '@/training/model';
import { trainingContexts } from '@/training/observations';
import type { TrainingContext } from '@/training/observations';
import { discardVideoAsset, importVideoAsset } from '@/training/videoAssets';
import { analyzeVideo } from '@/training/videoAnalysis';
import type { VideoSession } from '@/training/videoModel';
import { VideoAnalysisEditor } from '@/training/VideoAnalysisEditor';
import { Screen, Copy, Panel, Action, ui } from '@/ui/kit';

export default function Training() {
  const repo = useRepository(), [records, setRecords] = useState<TrainingRecord[]>([]), [message, setMessage] = useState('');
  const [name, setName] = useState('Practice session'), [context, setContext] = useState<TrainingContext>('DRY_FIRE');
  const [startingType, setStartingType] = useState<StartingType>('competitionHolster'), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{ recordId: string; videoId: string } | null>(null);
  const refresh = useCallback(() => repo.listTraining('local').then(setRecords), [repo]);
  useFocusEffect(useCallback(() => { let active = true; repo.listTraining('local').then(rows => { if (active) setRecords(rows); }).catch(e => { if (active) setMessage(String(e)); }); return () => { active = false; }; }, [repo]));
  const run = async (work: () => Promise<void>) => { if (busy) return; setBusy(true); setMessage(''); try { await work(); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } };
  const create = () => run(async () => {
    if (!name.trim()) throw new Error('Enter a session or drill name.');
    await repo.saveTraining({ id: uuid.v4(), userId: 'local', drillId: null, drillName: name.trim(), context, startingType,
      occurredAt: new Date().toISOString(), totalTime: null, notes: '', segments: [], videos: [] });
    await refresh();
  });
  const importVideo = (record: TrainingRecord) => run(async () => {
    const id = uuid.v4(), asset = await importVideoAsset(id);
    if (!asset) return;
    const now = new Date().toISOString();
    const session: VideoSession = { id, trainingSessionId: record.id, drillId: record.drillId, asset,
      durationMs: null, fps: null, createdAt: record.occurredAt, importedAt: now,
      context: record.context ?? context, analysisStatus: 'ANNOTATING', analysisVersion: 1 };
    try { await repo.saveTraining({ ...record, context: session.context, videos: [...(record.videos ?? []), { session, analysis: analyzeVideo(session, []) }] }); }
    catch (error) { discardVideoAsset(asset); throw error; }
    await refresh(); setSelected({ recordId: record.id, videoId: id });
  });
  const selectedRecord = records.find(r => r.id === selected?.recordId), selectedVideo = selectedRecord?.videos?.find(v => v.session.id === selected?.videoId);
  return <Screen title="TRAINING"><Panel><Copy>NEW SESSION</Copy>
    <TextInput style={ui.input} accessibilityLabel="Session or drill name" value={name} onChangeText={setName} />
    <Action title={`Context: ${context}`} disabled={busy} onPress={() => setContext(trainingContexts[(trainingContexts.indexOf(context) + 1) % trainingContexts.length])} />
    <Action title={startingTypes[startingType]} disabled={busy} onPress={() => { const keys = Object.keys(startingTypes) as StartingType[]; setStartingType(keys[(keys.indexOf(startingType) + 1) % keys.length]); }} />
    <Action title="Start Training" disabled={busy} onPress={create} />
  </Panel><Copy>RECENT SESSIONS</Copy>
    {!records.length && <Panel><Copy>No training sessions yet.</Copy></Panel>}
    {records.map(record => <Panel key={record.id}>
      <Copy>{record.drillName || 'Practice session'} / {new Date(record.occurredAt).toLocaleString()}</Copy>
      <Copy>{record.context ?? `Legacy session: import uses selected ${context} context`} · {startingTypes[record.startingType]}</Copy>
      {!!record.notes && <Copy>{record.notes}</Copy>}
      <Action title="Add / Import Video" disabled={busy} onPress={() => importVideo(record)} />
      {record.videos?.map(video => <Action key={video.session.id} title={`Open analysis · ${video.session.asset.name}`} onPress={() => setSelected({ recordId: record.id, videoId: video.session.id })} />)}
    </Panel>)}
    {!!message && <Copy>{message}</Copy>}
    {selectedRecord && selectedVideo && <VideoAnalysisEditor key={selectedVideo.session.id} record={selectedRecord} initialVideo={selectedVideo}
      onSaved={updated => setRecords(current => current.map(r => r.id === updated.id ? updated : r))} onClose={() => setSelected(null)} />}
  </Screen>;
}
