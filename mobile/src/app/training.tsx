import { useCallback, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import LibraryCard from '@/ui/LibraryCard';
import { contextLabels, startLabels } from '@/training/presentation';
import { OperationGate } from '@/training/operationGate';
import { router, useFocusEffect } from 'expo-router';
import { uuid } from 'expo-modules-core';
import { useRepository } from '@/storage/StorageProvider';
import type { StartingType, TrainingRecord } from '@/training/model';
import { drillKey } from '@/training/model';
import DrillRunEditor from '@/training/DrillRunEditor';
import LibraryRunEditor from '@/training/LibraryRunEditor';
import YourNumbers from '@/training/YourNumbers';
import type { LibraryRun } from '@/training/drillLibrary';
import { analyzeLibraryRun, libraryDrill, variantKey, variantLabel } from '@/training/drillLibrary';
import type { UserProfile } from '@/profile/model';
import type { DrillRun } from '@/training/drillLog';
import { drillTrend, groupStats, offsetText } from '@/training/drillLog';
import { trainingContexts } from '@/training/observations';
import type { TrainingContext } from '@/training/observations';
import { discardVideoAsset, importVideoAsset } from '@/training/videoAssets';
import { analyzeVideo } from '@/training/videoAnalysis';
import type { VideoSession } from '@/training/videoModel';
import { VideoAnalysisEditor } from '@/training/VideoAnalysisEditor';
import EditorSheet from '@/editor/EditorSheet';
import { useThemeMode } from '@/ui/theme';
import { Segmented, EmptyState, Loading } from '@/ui/kit';
import { Screen, ScreenHeader, Input, Notice, Copy, Panel, Action, ui } from '@/ui/kit';

export default function Training() {
  useThemeMode();
  const repo = useRepository(), [records, setRecords] = useState<TrainingRecord[]>([]), [message, setMessage] = useState('');
  const [name, setName] = useState('Practice session'), [context, setContext] = useState<TrainingContext>('DRY_FIRE');
  const [startingType, setStartingType] = useState<StartingType>('competitionHolster'), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{ recordId: string; videoId: string } | null>(null);
  const operation = useRef(new OperationGate());
  const [creating, setCreating] = useState(false), [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false), [sessionId, setSessionId] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');
  const refresh = async (token: number) => { const rows = await repo.listTraining('local');
    if (operation.current.current(token)) { setRecords(rows); setLoaded(true); setMessage(repo.trainingReadWarnings.join('\n')); } };
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const loadProfile = () => repo.loadProfile().then(p => setProfile(p)).catch(() => { /* the numbers view says what is missing */ });
  useFocusEffect(useCallback(() => {
    let active = true; operation.current.activate(); setBusy(false); setLoaded(false); setLoadError(false);
    repo.listTraining('local').then(rows => { if (active) { setRecords(rows); setLoaded(true); setMessage(repo.trainingReadWarnings.join('\n')); } })
      .catch(() => { if (active) setLoadError(true); });
    repo.loadProfile().then(p => { if (active) setProfile(p); }).catch(() => {});
    return () => { active = false; operation.current.dispose(); };
  }, [repo]));
  const run = async (work: (token: number) => Promise<void>) => {
    const token = operation.current.begin(); if (token === null) return;
    setBusy(true); setMessage('');
    try { await work(token); } catch (e) { if (operation.current.current(token)) setMessage(String(e)); }
    finally { if (operation.current.current(token)) setBusy(false); operation.current.finish(token); }
  };
  const create = () => run(async token => {
    if (!name.trim()) { setNameError('Enter a session name.'); return; }
    setNameError('');
    await repo.saveTraining({ id: uuid.v4(), userId: 'local', drillId: null, drillName: name.trim(), context, startingType,
      occurredAt: new Date().toISOString(), totalTime: null, notes: '', segments: [], videos: [] });
    await refresh(token);
    if (operation.current.current(token)) setCreating(false);
  });
  const importVideo = (record: TrainingRecord, from: 'files' | 'photos' = 'files') => run(async token => {
    const id = uuid.v4(), asset = await importVideoAsset(id, from);
    if (!asset) return;
    if (!operation.current.current(token)) { discardVideoAsset(asset); return; }
    const now = new Date().toISOString();
    const session: VideoSession = { id, trainingSessionId: record.id, drillId: record.drillId, asset,
      durationMs: null, fps: null, createdAt: record.occurredAt, importedAt: now,
      context: record.context ?? context, analysisStatus: 'ANNOTATING', analysisVersion: 1 };
    try { await repo.saveTraining({ ...record, context: session.context, videos: [...(record.videos ?? []), { session, analysis: analyzeVideo(session, []) }] }); }
    catch (error) { discardVideoAsset(asset); throw error; }
    await refresh(token); if (operation.current.current(token)) { setSessionId(null); setSelected({ recordId: record.id, videoId: id }); }
  });
  const [confirmDelete, setConfirmDelete] = useState(false), [loggingRun, setLoggingRun] = useState(false);
  const saveRun = async (record: TrainingRecord, run: DrillRun) => {
    await repo.saveTraining({ ...record, runs: [...(record.runs ?? []), run] });
    setRecords(current => current.map(r => r.id === record.id ? { ...r, runs: [...(r.runs ?? []), run] } : r));
    setLoggingRun(false);
  };
  const [loggingLibrary, setLoggingLibrary] = useState(false), [numbersOpen, setNumbersOpen] = useState(false);
  const [removingRun, setRemovingRun] = useState<string | null>(null);
  // The repository re-derives the session's profile measurements from its library runs in the same save.
  const saveLibraryRun = async (record: TrainingRecord, libraryRun: LibraryRun, par: number | null) => {
    const updated = { ...record, libraryRuns: [...(record.libraryRuns ?? []), libraryRun] };
    await repo.saveTraining(updated);
    setRecords(current => current.map(r => r.id === record.id ? updated : r));
    const key = variantKey(libraryRun);
    if ((profile?.drillPars?.[key] ?? null) !== par) await repo.setDrillPar(key, par);
    await loadProfile();
  };
  const removeLibraryRun = (record: TrainingRecord, runId: string) => run(async token => {
    const updated = { ...record, libraryRuns: (record.libraryRuns ?? []).filter(r => r.id !== runId) };
    await repo.saveTraining(updated);
    if (operation.current.current(token)) { setRecords(current => current.map(r => r.id === record.id ? updated : r)); setRemovingRun(null); }
    await loadProfile();
  });
  const libraryRunText = (libraryRun: LibraryRun) => {
    const drill = libraryDrill(libraryRun.drillId), a = analyzeLibraryRun(libraryRun, profile?.powerFactor ?? 'minor');
    if (!drill || !a) return 'Unknown drill';
    return [variantLabel(drill, libraryRun.choices), libraryRun.totalTime !== null ? libraryRun.totalTime.toFixed(2) + ' s' : null,
      a.score ? Math.round(a.score.percent * 100) + '% points' : null, a.score?.hitFactor != null ? 'HF ' + a.score.hitFactor.toFixed(2) : null,
      libraryRun.counts === false ? 'log only' : null].filter(Boolean).join(' · ');
  };
  // A repeated drill shares the original's drill key, so its runs join the same trend.
  const repeatDrill = (record: TrainingRecord) => run(async token => {
    await repo.saveTraining({ id: uuid.v4(), userId: 'local', drillId: drillKey(record), drillName: record.drillName, context: record.context ?? context,
      startingType: record.startingType, occurredAt: new Date().toISOString(), totalTime: null, notes: '', segments: [], videos: [] });
    await refresh(token);
    if (operation.current.current(token)) setSessionId(null);
  });
  const trendFor = (record: TrainingRecord) => drillTrend(records.filter(r => drillKey(r) === drillKey(record))
    .flatMap(r => (r.runs ?? []).map(run => ({ ...run, sessionName: r.drillName || 'Practice Session' }))));
  const deleteSession = (record: TrainingRecord) => run(async token => {
    await repo.deleteTraining(record.id);
    // The record is gone; remove its app-owned video copies (best effort, after the database commit).
    for (const video of record.videos ?? []) { try { discardVideoAsset(video.session.asset); } catch { /* already removed */ } }
    await refresh(token);
    if (operation.current.current(token)) { setConfirmDelete(false); setSessionId(null); }
  });
  const selectedRecord = records.find(r => r.id === selected?.recordId), selectedVideo = selectedRecord?.videos?.find(v => v.session.id === selected?.videoId);
  const activeSession = records.find(record => record.id === sessionId);
  const openSession = (record: TrainingRecord) => {
    const video = record.videos?.[0];
    if (video) setSelected({ recordId: record.id, videoId: video.session.id });
    else setSessionId(record.id);
  };
  return <Screen safeTop header={<ScreenHeader back={() => router.dismissTo('/')} title="TRAINING" action={<Action title="+ SESSION" variant="primary" disabled={busy} onPress={() => { setNameError(''); setCreating(true); }} />} />}>
    <EditorSheet title="CREATE SESSION" visible={creating} close={() => { if (!busy) setCreating(false); }}><Panel>
      <Input label="SESSION NAME" value={name} disabled={busy} onChange={value => { setName(value); setNameError(''); }} />
      {!!nameError && <Notice tone="error">{nameError}</Notice>}
      <Copy>CONTEXT</Copy><Segmented options={trainingContexts.map(value => contextLabels[value])} value={contextLabels[context]} disabled={busy}
        onChange={label => setContext(trainingContexts.find(value => contextLabels[value] === label)!)} />
      <Copy>START POSITION</Copy><Segmented options={Object.values(startLabels)} value={startLabels[startingType]} disabled={busy}
        onChange={label => setStartingType((Object.keys(startLabels) as StartingType[]).find(value => startLabels[value] === label)!)} />
      <Action title="CREATE SESSION" disabled={busy} onPress={create} variant="primary" />
      {!!message && <Notice tone="error">{message}</Notice>}
    </Panel></EditorSheet>
    {!loaded && !loadError && <Loading label="Loading sessions…" />}
    {loadError && <Panel><Notice tone="error">Couldn’t load training sessions.</Notice><Action title="RETRY" disabled={busy} onPress={() => run(async token => {
      setLoaded(false); setLoadError(false);
      try { await refresh(token); } catch { if (operation.current.current(token)) setLoadError(true); }
    })} /></Panel>}
    {loaded && !loadError && !records.length && <Panel><EmptyState title="NO TRAINING SESSIONS" detail="Create a session to begin recording practice history." />
      <Action title="CREATE SESSION" variant="primary" onPress={() => { setNameError(''); setCreating(true); }} /></Panel>}
    {loaded && !loadError && <Action title="YOUR NUMBERS" accessibilityLabel="Your numbers: what your drills have measured" onPress={() => setNumbersOpen(true)} />}
    {loaded && !loadError && !!records.length && <Copy>RECENT SESSIONS</Copy>}
    {loaded && !loadError && records.map(record => <LibraryCard key={record.id} name={record.drillName || 'Practice Session'}
      category={contextLabels[record.context ?? 'DRY_FIRE'].toUpperCase()}
      detail={new Date(record.occurredAt).toLocaleDateString() + ' • ' + startLabels[record.startingType] + '\n' + (record.videos?.length ?? 0) + ((record.videos?.length ?? 0) === 1 ? ' video' : ' videos')}
      disabled={busy} open={() => openSession(record)} more={() => setSessionId(record.id)} />)}
    <EditorSheet title="SESSION" visible={!!activeSession && !loggingRun && !loggingLibrary} close={() => { if (!busy) { setSessionId(null); setConfirmDelete(false); setRemovingRun(null); } }}>
      {activeSession && <Panel><Text style={ui.sectionTitle}>{activeSession.drillName || 'Practice Session'}</Text>
        <Copy>VIDEOS · {activeSession.videos?.length ?? 0}</Copy>
        {Platform.OS === 'ios' ? <>
          <Action title="ADD VIDEO FROM PHOTOS" variant="primary" disabled={busy} onPress={() => importVideo(activeSession, 'photos')} />
          <Action title="ADD VIDEO FROM FILES" disabled={busy} onPress={() => importVideo(activeSession, 'files')} />
        </> : <Action title="ADD VIDEO" variant="primary" disabled={busy} onPress={() => importVideo(activeSession)} />}
        {!activeSession.videos?.length && <Copy>No videos. Add a video to begin analysis.</Copy>}
        {activeSession.videos?.map((video, index) => <Action key={video.session.id}
          title={'Video ' + (index + 1) + ' · ' + (video.session.analysisStatus === 'REVIEWED' ? 'Analysis saved' : 'Needs review')}
          disabled={busy} onPress={() => { setSessionId(null); setSelected({ recordId: activeSession.id, videoId: video.session.id }); }} />)}
        <Copy>DRILL RUNS · {activeSession.runs?.length ?? 0}</Copy>
        <Action title="LOG DRILL RUN" disabled={busy} onPress={() => setLoggingRun(true)} />
        {(activeSession.runs ?? []).map((r, index) => { const g = groupStats(r); return <Copy key={r.id}>{`Run ${index + 1} · ${g.shots} hit(s), ${g.misses} miss(es) · ${offsetText(g.offset)}` + (g.meanRadius !== null ? ` · mean radius ${g.meanRadius.toFixed(1)} in` : '') + (r.totalTime !== null ? ` · ${r.totalTime.toFixed(2)} s` : '')}</Copy>; })}
        <Copy>DRILL LIBRARY · {activeSession.libraryRuns?.length ?? 0}</Copy>
        <Action title="LOG LIBRARY DRILL" disabled={busy} onPress={() => setLoggingLibrary(true)} />
        {(activeSession.libraryRuns ?? []).map((libraryRun, index) => <View key={libraryRun.id} style={{ gap: 4 }}>
          <Copy>{`${index + 1}. ${libraryRunText(libraryRun)}`}</Copy>
          {removingRun === libraryRun.id ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action title="KEEP" accessibilityLabel={`Keep library run ${index + 1}`} disabled={busy} onPress={() => setRemovingRun(null)} />
            <Action title="REMOVE RUN" variant="destructive" accessibilityLabel={`Confirm removing library run ${index + 1}`} disabled={busy} onPress={() => removeLibraryRun(activeSession, libraryRun.id)} />
          </View> : <Action title="REMOVE" variant="quiet" accessibilityLabel={`Remove library run ${index + 1}`} disabled={busy} onPress={() => setRemovingRun(libraryRun.id)} />}
        </View>)}
        {trendFor(activeSession).length > 1 && <>
          <Copy>TREND FOR THIS DRILL</Copy>
          {trendFor(activeSession).map(t => <Copy key={t.id}>{`${new Date(t.recordedAt).toLocaleDateString()} · ${t.meanRadius !== null ? t.meanRadius.toFixed(1) + ' in mean radius' : 'no hits'} · ${offsetText(t.offset)}` + (t.totalTime !== null ? ` · ${t.totalTime.toFixed(2)} s` : '')}</Copy>)}
        </>}
        <Action title="REPEAT DRILL" disabled={busy} onPress={() => repeatDrill(activeSession)} />
        {confirmDelete ? <>
          <Notice tone="warning">Delete this session, its {activeSession.videos?.length ?? 0} imported video copies and any profile measurements contributed from it? This cannot be undone. Videos in Photos or Files are not touched.</Notice>
          <Action title="Keep session" disabled={busy} onPress={() => setConfirmDelete(false)} />
          <Action title="Delete session" variant="destructive" disabled={busy} onPress={() => deleteSession(activeSession)} />
        </> : <Action title="DELETE SESSION" variant="destructive" disabled={busy} onPress={() => setConfirmDelete(true)} />}
        {!!message && <Notice tone="error">{message}</Notice>}
      </Panel>}
    </EditorSheet>
    {!!message && <Notice tone="warning">{message}</Notice>}
    {activeSession && <LibraryRunEditor visible={loggingLibrary} context={activeSession.context ?? 'DRY_FIRE'} powerFactor={profile?.powerFactor ?? 'minor'}
      pars={profile?.drillPars ?? {}} onClose={() => setLoggingLibrary(false)} onSave={(r, par) => saveLibraryRun(activeSession, r, par)} />}
    <YourNumbers visible={numbersOpen} records={records} profile={profile} onClose={() => setNumbersOpen(false)} />
    {activeSession && <DrillRunEditor visible={loggingRun} initialFamily="USPSA" onClose={() => setLoggingRun(false)} onSave={r => saveRun(activeSession, r)} />}
    {selectedRecord && selectedVideo && <VideoAnalysisEditor key={selectedVideo.session.id} record={selectedRecord} initialVideo={selectedVideo}
      onSaved={updated => setRecords(current => current.map(r => r.id === updated.id ? updated : r))} onClose={() => setSelected(null)} />}
  </Screen>;
}
