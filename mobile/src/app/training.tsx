import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { uuid } from 'expo-modules-core';
import LibraryCard from '@/ui/LibraryCard';
import { contextLabels } from '@/training/presentation';
import { OperationGate } from '@/training/operationGate';
import { useRepository } from '@/storage/StorageProvider';
import type { TrainingRecord } from '@/training/model';
import { drillKey } from '@/training/model';
import DrillSheet from '@/training/DrillSheet';
import YourNumbers from '@/training/YourNumbers';
import type { LibraryRun } from '@/training/drillLibrary';
import { drillGroups, libraryDrill, libraryDrills, variantKey, variantLabel } from '@/training/drillLibrary';
import { drillCardText, drillDayFor, historyDetail, historyTitle, isDrillDay, localDay, newDrillDay, recordOfRun, runText } from '@/training/drillDays';
import type { UserProfile } from '@/profile/model';
import { drillTrend, groupStats, offsetText } from '@/training/drillLog';
import { trainingContexts } from '@/training/observations';
import type { TrainingContext } from '@/training/observations';
import { discardVideoAsset } from '@/training/videoAssets';
import { VideoAnalysisEditor } from '@/training/VideoAnalysisEditor';
import EditorSheet from '@/editor/EditorSheet';
import { readPref, writePref } from '@/ui/prefsStore';
import { useThemeMode } from '@/ui/theme';
import { Loading } from '@/ui/kit';
import { Screen, ScreenHeader, Notice, Copy, Panel, Action, ui } from '@/ui/kit';

const CONTEXT_KEY = 'psp.trainingContext';
const savedContext = (): TrainingContext => { const v = readPref(CONTEXT_KEY); return trainingContexts.includes(v as TrainingContext) ? v as TrainingContext : 'DRY_FIRE'; };

/**
 * Training is the drill library: pick a drill, run it, log it. Runs are filed by day and practice type for you, and
 * every run updates YOUR NUMBERS, which the stage planner uses. Earlier sessions (and their videos) are under History.
 */
export default function Training() {
  useThemeMode();
  const repo = useRepository(), [records, setRecords] = useState<TrainingRecord[]>([]), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<{ recordId: string; videoId: string } | null>(null);
  const operation = useRef(new OperationGate());
  const [sessionId, setSessionId] = useState<string | null>(null), [drillId, setDrillId] = useState<string | null>(null);
  const [context, setContextState] = useState<TrainingContext>(savedContext);
  const setContext = (next: TrainingContext) => { setContextState(next); writePref(CONTEXT_KEY, next); };
  const [historyOpen, setHistoryOpen] = useState(false), [numbersOpen, setNumbersOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false), [removingRun, setRemovingRun] = useState<string | null>(null);
  const recordsRef = useRef(records); recordsRef.current = records;
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
  const pf = profile?.powerFactor ?? 'minor';

  // A run goes into today's record for its practice type, made on the first run of the day. The repository re-derives
  // the record's profile measurements from its runs in the same save.
  const saveLibraryRun = async (libraryRun: LibraryRun, par: number | null | undefined) => {
    const current = recordsRef.current, existing = drillDayFor(current, localDay(new Date(libraryRun.recordedAt)), context);
    const record = existing ?? newDrillDay(uuid.v4(), localDay(new Date(libraryRun.recordedAt)), context, libraryRun.recordedAt);
    const updated = { ...record, libraryRuns: [...(record.libraryRuns ?? []), libraryRun] };
    await repo.saveTraining(updated);
    setRecords(list => existing ? list.map(r => r.id === updated.id ? updated : r) : [updated, ...list]);
    const key = variantKey(libraryRun);
    if (par !== undefined && (profile?.drillPars?.[key] ?? null) !== par) await repo.setDrillPar(key, par);
    await loadProfile();
  };
  const removeLibraryRun = async (runId: string) => {
    const record = recordOfRun(recordsRef.current, runId);
    if (!record) return;
    const updated = { ...record, libraryRuns: (record.libraryRuns ?? []).filter(r => r.id !== runId) };
    await repo.saveTraining(updated);
    setRecords(list => list.map(r => r.id === record.id ? updated : r)); setRemovingRun(null);
    await loadProfile();
  };
  const libraryRunText = (libraryRun: LibraryRun) => {
    const drill = libraryDrill(libraryRun.drillId);
    return drill ? variantLabel(drill, libraryRun.choices) + ' · ' + runText(libraryRun, pf) : 'Unknown drill';
  };
  const trendFor = (record: TrainingRecord) => drillTrend(records.filter(r => drillKey(r) === drillKey(record))
    .flatMap(r => (r.runs ?? []).map(logged => ({ ...logged, sessionName: r.drillName || 'Practice Session' }))));
  const deleteSession = (record: TrainingRecord) => run(async token => {
    await repo.deleteTraining(record.id);
    // The record is gone; remove its app-owned video copies (best effort, after the database commit).
    for (const video of record.videos ?? []) { try { discardVideoAsset(video.session.asset); } catch { /* already removed */ } }
    await refresh(token);
    if (operation.current.current(token)) { setConfirmDelete(false); setSessionId(null); }
  });
  const selectedRecord = records.find(r => r.id === selected?.recordId), selectedVideo = selectedRecord?.videos?.find(v => v.session.id === selected?.videoId);
  const activeSession = records.find(record => record.id === sessionId);
  const ready = loaded && !loadError;

  return <Screen safeTop header={<ScreenHeader back={() => router.dismissTo('/')} title="TRAINING" />}>
    {!loaded && !loadError && <Loading label="Loading your drills…" />}
    {loadError && <Panel><Notice tone="error">Couldn’t load your training.</Notice><Action title="RETRY" disabled={busy} onPress={() => run(async token => {
      setLoaded(false); setLoadError(false);
      try { await refresh(token); } catch { if (operation.current.current(token)) setLoadError(true); }
    })} /></Panel>}
    {ready && <>
      <Copy>Pick a drill, run it on your timer, log it. Every run updates YOUR NUMBERS, which the stage planner uses.</Copy>
      <Action title="YOUR NUMBERS" accessibilityLabel="Your numbers: what your drills have measured" onPress={() => setNumbersOpen(true)} />
      {drillGroups.map(group => <View key={group} style={{ gap: 8 }}>
        <Text style={ui.eyebrow}>{group.toUpperCase()}</Text>
        {libraryDrills.filter(d => d.group === group).map(d => <LibraryCard key={d.id} name={d.name} detail={drillCardText(records, d, pf)}
          disabled={busy} open={() => setDrillId(d.id)} />)}
      </View>)}
      {records.length > 0 && <Action title={(historyOpen ? 'HIDE HISTORY' : 'HISTORY') + ` · ${records.length}`} accessibilityLabel={historyOpen ? 'Hide history' : 'Show history'}
        onPress={() => setHistoryOpen(!historyOpen)} />}
      {historyOpen && records.map(record => <LibraryCard key={record.id} name={historyTitle(record)}
        category={contextLabels[record.context ?? 'DRY_FIRE'].toUpperCase()}
        detail={(isDrillDay(record) ? '' : new Date(record.occurredAt).toLocaleDateString() + '\n') + historyDetail(record)}
        disabled={busy} open={() => { setConfirmDelete(false); setRemovingRun(null); setSessionId(record.id); }} />)}
    </>}
    <EditorSheet title={activeSession ? historyTitle(activeSession) : 'HISTORY'} visible={!!activeSession} close={() => { if (!busy) { setSessionId(null); setConfirmDelete(false); setRemovingRun(null); } }}>
      {activeSession && <Panel>
        <Copy>{contextLabels[activeSession.context ?? 'DRY_FIRE']}</Copy>
        {!!activeSession.videos?.length && <>
          <Copy>VIDEOS · {activeSession.videos.length}</Copy>
          {activeSession.videos.map((video, index) => <Action key={video.session.id}
            title={'Video ' + (index + 1) + ' · ' + (video.session.analysisStatus === 'REVIEWED' ? 'Analysis saved' : 'Needs review')}
            disabled={busy} onPress={() => { setSessionId(null); setSelected({ recordId: activeSession.id, videoId: video.session.id }); }} />)}
        </>}
        {!!activeSession.runs?.length && <>
          <Copy>LOGGED RUNS · {activeSession.runs.length}</Copy>
          {activeSession.runs.map((r, index) => { const g = groupStats(r); return <Copy key={r.id}>{`Run ${index + 1} · ${g.shots} hit(s), ${g.misses} miss(es) · ${offsetText(g.offset)}` + (g.meanRadius !== null ? ` · mean radius ${g.meanRadius.toFixed(1)} in` : '') + (r.totalTime !== null ? ` · ${r.totalTime.toFixed(2)} s` : '')}</Copy>; })}
          {trendFor(activeSession).length > 1 && <>
            <Copy>TREND FOR THIS DRILL</Copy>
            {trendFor(activeSession).map(t => <Copy key={t.id}>{`${new Date(t.recordedAt).toLocaleDateString()} · ${t.meanRadius !== null ? t.meanRadius.toFixed(1) + ' in mean radius' : 'no hits'} · ${offsetText(t.offset)}` + (t.totalTime !== null ? ` · ${t.totalTime.toFixed(2)} s` : '')}</Copy>)}
          </>}
        </>}
        <Copy>DRILL RUNS · {activeSession.libraryRuns?.length ?? 0}</Copy>
        {(activeSession.libraryRuns ?? []).map((libraryRun, index) => <View key={libraryRun.id} style={{ gap: 4 }}>
          <Copy>{`${index + 1}. ${libraryRunText(libraryRun)}`}</Copy>
          {removingRun === libraryRun.id ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action title="KEEP" accessibilityLabel={`Keep library run ${index + 1}`} disabled={busy} onPress={() => setRemovingRun(null)} />
            <Action title="REMOVE RUN" variant="destructive" accessibilityLabel={`Confirm removing library run ${index + 1}`} disabled={busy}
              onPress={() => run(async () => { await removeLibraryRun(libraryRun.id); })} />
          </View> : <Action title="REMOVE" variant="quiet" accessibilityLabel={`Remove library run ${index + 1}`} disabled={busy} onPress={() => setRemovingRun(libraryRun.id)} />}
        </View>)}
        {confirmDelete ? <>
          <Notice tone="warning">{`Delete ${isDrillDay(activeSession) ? 'this day’s drill runs' : 'this session'}` + (activeSession.videos?.length ? `, its ${activeSession.videos.length} imported video copies` : '')
            + ' and the measurements they added to your numbers? This cannot be undone.' + (activeSession.videos?.length ? ' Videos in Photos or Files are not touched.' : '')}</Notice>
          <Action title="Keep" disabled={busy} onPress={() => setConfirmDelete(false)} />
          <Action title="Delete" variant="destructive" disabled={busy} onPress={() => deleteSession(activeSession)} />
        </> : <Action title={isDrillDay(activeSession) ? 'DELETE THIS DAY' : 'DELETE SESSION'} variant="destructive" disabled={busy} onPress={() => setConfirmDelete(true)} />}
        {!!message && <Notice tone="error">{message}</Notice>}
      </Panel>}
    </EditorSheet>
    {!!message && <Notice tone="warning">{message}</Notice>}
    <DrillSheet visible={!!drillId} drillId={drillId} records={records} context={context} onContextChange={setContext} powerFactor={pf}
      pars={profile?.drillPars ?? {}} onSave={saveLibraryRun} onRemove={removeLibraryRun} onClose={() => setDrillId(null)} />
    <YourNumbers visible={numbersOpen} records={records} profile={profile} onClose={() => setNumbersOpen(false)} />
    {selectedRecord && selectedVideo && <VideoAnalysisEditor key={selectedVideo.session.id} record={selectedRecord} initialVideo={selectedVideo}
      onSaved={updated => setRecords(current => current.map(r => r.id === updated.id ? updated : r))} onClose={() => setSelected(null)} />}
  </Screen>;
}
