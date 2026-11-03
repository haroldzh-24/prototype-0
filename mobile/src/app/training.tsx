import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { uuid } from 'expo-modules-core';
import LibraryCard from '@/ui/LibraryCard';
import { contextLabels, PLAN_PRACTICE_DEFAULT, READ_ONLY_NOTE, trainingIntro } from '@/training/presentation';
import { OperationGate } from '@/training/operationGate';
import { useRepository } from '@/storage/StorageProvider';
import type { TrainingRecord } from '@/training/model';
import { drillKey } from '@/training/model';
import DrillSheet from '@/training/DrillSheet';
import YourNumbers from '@/training/YourNumbers';
import type { LibraryRun } from '@/training/drillLibrary';
import { drillGroups, libraryDrill, libraryDrills, variantKey, variantLabel } from '@/training/drillLibrary';
import { addRun, drillCardText, drillDayFor, historyDetail, historyTitle, isDrillDay, localDay, newDrillDay, recordOfRun, removeRun, runText, runVideoIds } from '@/training/drillDays';
import type { PickedVideo } from '@/training/drillDays';
import type { UserProfile } from '@/profile/model';
import { readShootingHand } from '@/profile/devicePrefs';
import { drillTrend, groupStats, offsetText } from '@/training/drillLog';
import { trainingContexts } from '@/training/observations';
import type { TrainingContext } from '@/training/observations';
import type { Side } from '@/training/movementPhases';
import { discardVideoAsset } from '@/training/videoAssets';
import { VideoAnalysisEditor } from '@/training/VideoAnalysisEditor';
import EditorSheet from '@/editor/EditorSheet';
import { readPref, writePref } from '@/ui/prefsStore';
import { useThemeMode } from '@/ui/theme';
import { Loading } from '@/ui/kit';
import { Screen, ScreenHeader, Notice, Copy, Panel, Action, ui } from '@/ui/kit';

const CONTEXT_KEY = 'psp.trainingContext';
/** The practice type last picked on this phone, or null: then it follows Profile · Practice type for plans. */
const savedContext = (): TrainingContext | null => { const v = readPref(CONTEXT_KEY); return trainingContexts.includes(v as TrainingContext) ? v as TrainingContext : null; };

/**
 * Training is the drill library: pick a drill, run it, log it. Runs are filed by day and practice type for you; runs
 * that count update YOUR NUMBERS, and those of the practice type set in Profile are what your plans use. Drill days
 * are under History; sessions recorded before the drill library are a read-only archive at its bottom.
 * `/training?show=numbers` (Profile · YOUR NUMBERS) opens on YOUR NUMBERS.
 */
export default function Training() {
  useThemeMode();
  const { show } = useLocalSearchParams<{ show?: string }>();
  const repo = useRepository(), [records, setRecords] = useState<TrainingRecord[]>([]), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<{ recordId: string; videoId: string } | null>(null);
  const operation = useRef(new OperationGate());
  const [sessionId, setSessionId] = useState<string | null>(null), [drillId, setDrillId] = useState<string | null>(null);
  const [chosenContext, setContextState] = useState<TrainingContext | null>(savedContext);
  const setContext = (next: TrainingContext) => { setContextState(next); writePref(CONTEXT_KEY, next); };
  // Set in Profile; read again whenever Training comes back into view.
  const [hand, setHand] = useState<Side>(readShootingHand);
  const [historyOpen, setHistoryOpen] = useState(false), [olderOpen, setOlderOpen] = useState(false), [numbersOpen, setNumbersOpen] = useState(show === 'numbers');
  useEffect(() => { if (show === 'numbers') setNumbersOpen(true); }, [show]);
  const [confirmDelete, setConfirmDelete] = useState(false), [removingRun, setRemovingRun] = useState<string | null>(null);
  const recordsRef = useRef(records); recordsRef.current = records;
  const refresh = async (token: number) => { const rows = await repo.listTraining('local');
    if (operation.current.current(token)) { setRecords(rows); setLoaded(true); setMessage(repo.trainingReadWarnings.join('\n')); } };
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const loadProfile = () => repo.loadProfile().then(p => setProfile(p)).catch(() => { /* the numbers view says what is missing */ });
  useFocusEffect(useCallback(() => {
    let active = true; operation.current.activate(); setBusy(false); setLoaded(false); setLoadError(false); setHand(readShootingHand());
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
  // Profile · Practice type for plans; the PRACTICE control starts on it until you pick one on this phone.
  const planPractice = profile?.calibrationContext ?? PLAN_PRACTICE_DEFAULT;
  const context = chosenContext ?? planPractice;

  // Saves and removals run one at a time, each built from the records as the previous one left them (a removal racing
  // a save could otherwise write back the run it removed).
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const queued = <T,>(work: () => Promise<T>): Promise<T> => { const next = writes.current.then(work, work); writes.current = next.catch(() => {}); return next; };
  const commit = (updated: TrainingRecord) => {
    const list = recordsRef.current.some(r => r.id === updated.id) ? recordsRef.current.map(r => r.id === updated.id ? updated : r) : [updated, ...recordsRef.current];
    recordsRef.current = list; setRecords(list);
  };
  // A run goes into today's record for its practice type, made on the first run of the day. The repository re-derives
  // the record's profile measurements from its runs in the same save. A par that fails to save doesn't undo the run:
  // the warning comes back with the success, so the run isn't saved twice.
  const saveLibraryRun = (libraryRun: LibraryRun, par: number | null | undefined, video?: PickedVideo) => queued(async () => {
    const day = localDay(new Date(libraryRun.recordedAt)), existing = drillDayFor(recordsRef.current, day, context, !!video);
    const updated = addRun(existing ?? newDrillDay(uuid.v4(), day, context, libraryRun.recordedAt), libraryRun, video);
    await repo.saveTraining(updated);
    commit(updated);
    let warning: string | undefined;
    const key = variantKey(libraryRun);
    if (par !== undefined && (profile?.drillPars?.[key] ?? null) !== par) {
      try { await repo.setDrillPar(key, par); } catch (e) { warning = `The par couldn’t be saved (${e instanceof Error ? e.message : String(e)}).`; }
    }
    await loadProfile();
    return warning;
  });
  const removeLibraryRun = (runId: string) => queued(async () => {
    const record = recordOfRun(recordsRef.current, runId);
    if (!record) return;
    const { record: updated, discard } = removeRun(record, runId);
    await repo.saveTraining(updated);
    // The run is gone; remove its app-owned video copy (best effort, after the database commit).
    for (const asset of discard) { try { discardVideoAsset(asset); } catch { /* already removed */ } }
    commit(updated); setRemovingRun(null);
    await loadProfile();
  });
  // A changed run (a kept movement breakdown) replaces the saved one in its record.
  const updateLibraryRun = (changed: LibraryRun) => queued(async () => {
    const record = recordOfRun(recordsRef.current, changed.id);
    if (!record) throw new Error('This run is no longer saved.');
    const updated = { ...record, libraryRuns: (record.libraryRuns ?? []).map(r => r.id === changed.id ? changed : r) };
    await repo.saveTraining(updated);
    commit(updated);
  });
  const libraryRunText = (libraryRun: LibraryRun) => {
    const drill = libraryDrill(libraryRun.drillId);
    return drill ? variantLabel(drill, libraryRun.choices) + ' · ' + runText(libraryRun, pf) : 'Unknown drill';
  };
  const trendFor = (record: TrainingRecord) => drillTrend(records.filter(r => drillKey(r) === drillKey(record))
    .flatMap(r => (r.runs ?? []).map(logged => ({ ...logged, sessionName: r.drillName || 'Practice Session' }))));
  // Only a drill day is deleted from here; older sessions are a read-only archive.
  const deleteDay = (record: TrainingRecord) => run(async token => {
    if (!isDrillDay(record)) return;
    await repo.deleteTraining(record.id);
    // The record is gone; remove its app-owned video copies (best effort, after the database commit).
    for (const video of record.videos ?? []) { try { discardVideoAsset(video.session.asset); } catch { /* already removed */ } }
    await refresh(token);
    if (operation.current.current(token)) { setConfirmDelete(false); setSessionId(null); }
  });
  const selectedRecord = records.find(r => r.id === selected?.recordId), selectedVideo = selectedRecord?.videos?.find(v => v.session.id === selected?.videoId);
  const activeSession = records.find(record => record.id === sessionId);
  const legacy = !!activeSession && !isDrillDay(activeSession);
  const days = records.filter(isDrillDay), older = records.filter(r => !isDrillDay(r));
  const ready = loaded && !loadError;
  const openRecord = (record: TrainingRecord) => { setConfirmDelete(false); setRemovingRun(null); setSessionId(record.id); };

  return <Screen safeTop header={<ScreenHeader back={() => router.dismissTo('/')} title="TRAINING" />}>
    {!loaded && !loadError && <Loading label="Loading your drills…" />}
    {loadError && <Panel><Notice tone="error">Couldn’t load your training.</Notice><Action title="RETRY" disabled={busy} onPress={() => run(async token => {
      setLoaded(false); setLoadError(false);
      try { await refresh(token); } catch { if (operation.current.current(token)) setLoadError(true); }
    })} /></Panel>}
    {ready && <>
      <Copy>{trainingIntro(planPractice)}</Copy>
      <Action title="YOUR NUMBERS" accessibilityLabel="Your numbers: what your drills have measured" onPress={() => setNumbersOpen(true)} />
      {drillGroups.map(group => <View key={group} style={{ gap: 8 }}>
        <Text style={ui.eyebrow}>{group.toUpperCase()}</Text>
        {libraryDrills.filter(d => d.group === group).map(d => <LibraryCard key={d.id} name={d.name} detail={drillCardText(records, d, pf)}
          disabled={busy} open={() => setDrillId(d.id)} />)}
      </View>)}
      {records.length > 0 && <Action title={(historyOpen ? 'HIDE HISTORY' : 'HISTORY') + ` · ${days.length}`} accessibilityLabel={historyOpen ? 'Hide history' : 'Show history'}
        onPress={() => setHistoryOpen(!historyOpen)} />}
      {historyOpen && <>
        {!days.length && <Copy>No drill days yet. Runs you log are filed here by day.</Copy>}
        {days.map(record => <LibraryCard key={record.id} name={historyTitle(record)} category={contextLabels[record.context ?? 'DRY_FIRE'].toUpperCase()}
          detail={historyDetail(record)} disabled={busy} open={() => openRecord(record)} />)}
        {older.length > 0 && <Action title={(olderOpen ? 'HIDE OLDER SESSIONS' : 'OLDER SESSIONS') + ` · ${older.length}`}
          accessibilityLabel={olderOpen ? 'Hide older sessions' : 'Show older sessions'} onPress={() => setOlderOpen(!olderOpen)} />}
        {olderOpen && older.length > 0 && <>
          <Copy>Recorded before the drill library. Their videos can be watched and their analysis read; they can’t be changed.</Copy>
          {older.map(record => <LibraryCard key={record.id} name={historyTitle(record)} category={contextLabels[record.context ?? 'DRY_FIRE'].toUpperCase()}
            detail={new Date(record.occurredAt).toLocaleDateString() + '\n' + historyDetail(record)} disabled={busy} open={() => openRecord(record)} />)}
        </>}
      </>}
    </>}
    <EditorSheet title={activeSession ? historyTitle(activeSession) : 'HISTORY'} visible={!!activeSession} close={() => { if (!busy) { setSessionId(null); setConfirmDelete(false); setRemovingRun(null); } }}>
      {activeSession && <Panel>
        <Copy>{contextLabels[activeSession.context ?? 'DRY_FIRE']}</Copy>
        {legacy && <Notice>{READ_ONLY_NOTE}</Notice>}
        {!!activeSession.videos?.length && <>
          <Text style={ui.eyebrow}>{`VIDEOS · ${activeSession.videos.length}`}</Text>
          {activeSession.videos.map((video, index) => runVideoIds(activeSession).has(video.session.id)
            ? <Copy key={video.session.id}>{`Video ${index + 1} · ` + (() => { const r = activeSession.libraryRuns?.find(x => x.videoId === video.session.id); const d = r && libraryDrill(r.drillId); return d ? `${d.name} run, watch it from the drill` : 'a drill run'; })()}</Copy>
            // Older videos open read-only: watch them and read their analysis, nothing is changed or added to your numbers.
            : <Action key={video.session.id} title={`VIDEO ${index + 1} · ` + (video.session.analysisStatus === 'REVIEWED' ? 'ANALYSIS SAVED' : 'NOT REVIEWED')}
              accessibilityLabel={`Watch video ${index + 1}, read-only`} disabled={busy} onPress={() => { setSessionId(null); setSelected({ recordId: activeSession.id, videoId: video.session.id }); }} />)}
        </>}
        {!!activeSession.runs?.length && <>
          <Text style={ui.eyebrow}>{`LOGGED RUNS · ${activeSession.runs.length}`}</Text>
          {activeSession.runs.map((r, index) => { const g = groupStats(r); return <Copy key={r.id}>{`Run ${index + 1} · ${g.shots} hit(s), ${g.misses} miss(es) · ${offsetText(g.offset)}` + (g.meanRadius !== null ? ` · mean radius ${g.meanRadius.toFixed(1)} in` : '') + (r.totalTime !== null ? ` · ${r.totalTime.toFixed(2)} s` : '')}</Copy>; })}
          {trendFor(activeSession).length > 1 && <>
            <Text style={ui.eyebrow}>TREND FOR THIS DRILL</Text>
            {trendFor(activeSession).map(t => <Copy key={t.id}>{`${new Date(t.recordedAt).toLocaleDateString()} · ${t.meanRadius !== null ? t.meanRadius.toFixed(1) + ' in mean radius' : 'no hits'} · ${offsetText(t.offset)}` + (t.totalTime !== null ? ` · ${t.totalTime.toFixed(2)} s` : '')}</Copy>)}
          </>}
        </>}
        {(!legacy || !!activeSession.libraryRuns?.length) && <Text style={ui.eyebrow}>{`DRILL RUNS · ${activeSession.libraryRuns?.length ?? 0}`}</Text>}
        {(activeSession.libraryRuns ?? []).map((libraryRun, index) => <View key={libraryRun.id} style={{ gap: 4 }}>
          <Copy>{`${index + 1}. ${libraryRunText(libraryRun)}`}</Copy>
          {legacy ? null : removingRun === libraryRun.id ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action title="KEEP" accessibilityLabel={`Keep library run ${index + 1}`} disabled={busy} onPress={() => setRemovingRun(null)} />
            <Action title="REMOVE RUN" variant="destructive" accessibilityLabel={`Confirm removing library run ${index + 1}`} disabled={busy}
              onPress={() => run(async () => { await removeLibraryRun(libraryRun.id); })} />
          </View> : <Action title="REMOVE" variant="quiet" accessibilityLabel={`Remove library run ${index + 1}`} disabled={busy} onPress={() => setRemovingRun(libraryRun.id)} />}
        </View>)}
        {!legacy && (confirmDelete ? <>
          <Notice tone="warning">{'Delete this day’s drill runs' + (activeSession.videos?.length ? `, its ${activeSession.videos.length} imported video copies` : '')
            + ' and the measurements they added to your numbers? This cannot be undone.' + (activeSession.videos?.length ? ' Videos in Photos or Files are not touched.' : '')}</Notice>
          <Action title="KEEP" disabled={busy} onPress={() => setConfirmDelete(false)} />
          <Action title="DELETE" variant="destructive" disabled={busy} onPress={() => deleteDay(activeSession)} />
        </> : <Action title="DELETE THIS DAY" variant="destructive" disabled={busy} onPress={() => setConfirmDelete(true)} />)}
        {!!message && <Notice tone="error">{message}</Notice>}
      </Panel>}
    </EditorSheet>
    {!!message && <Notice tone="warning">{message}</Notice>}
    <DrillSheet visible={!!drillId} drillId={drillId} records={records} context={context} onContextChange={setContext} planPractice={planPractice} powerFactor={pf}
      pars={profile?.drillPars ?? {}} onSave={saveLibraryRun} onRemove={removeLibraryRun} onUpdate={updateLibraryRun} hand={hand}
      onClose={() => setDrillId(null)} />
    <YourNumbers visible={numbersOpen} records={records} profile={profile} onClose={() => setNumbersOpen(false)} />
    {selectedRecord && selectedVideo && <VideoAnalysisEditor key={selectedVideo.session.id} record={selectedRecord} initialVideo={selectedVideo} readOnly
      onSaved={updated => setRecords(current => current.map(r => r.id === updated.id ? updated : r))} onClose={() => setSelected(null)} />}
  </Screen>;
}
