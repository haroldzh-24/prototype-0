import { useEffect, useRef, useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { uuid } from 'expo-modules-core';
import { Action, Copy, DataRow, Notice, ui } from '../ui/kit';
import { extractHands, handTrackingAvailable } from './extractHands';
import { trackingExport } from './handTracking';
import type { HandTrack } from './handTracking';
import { breakDownRun, CAMERA, phasesFromRun, RECORDING_TIP, savedRunBreakdown, savedRunSeconds } from './drillScripts';
import type { RunBreakdown as Result } from './drillScripts';
import { phaseKindOf } from './drillLibrary';
import type { LibraryDrill, LibraryRun } from './drillLibrary';
import PhaseBreakdown, { trackingError } from './PhaseBreakdown';
import type { Side } from './movementPhases';
import type { VideoSession } from './videoModel';
import type { Mark } from './videoTiming';

const seconds = (v: number | null) => v === null ? 'not seen' : v.toFixed(2) + ' s';

/**
 * A saved run broken down by its drill's script from hand tracking on its video (drillScripts.ts): the draw, each
 * transition, the reload, each move. The marks join the video's play buttons so you can check each one; KEEP saves
 * them on the run, and EXPORT TRACKING shares the tracking so the marks can be tuned on real runs. Builds without
 * hand tracking fall back to the body-tracking draw/reload breakdown.
 */
export default function RunBreakdown({ drill, run, session, beepMs, side, onMarks, onKeep, disabled }: {
  drill: LibraryDrill; run: LibraryRun; session: VideoSession; beepMs: number;
  /** Your shooting hand, set in Profile. */
  side: Side;
  onMarks: (marks: Mark[]) => void; onKeep: (run: LibraryRun) => Promise<void> | void; disabled: boolean;
}) {
  const [status, setStatus] = useState<'IDLE' | 'TRACKING' | 'DONE' | 'FAILED'>('IDLE');
  const [progress, setProgress] = useState(0), [error, setError] = useState(''), [result, setResult] = useState<Result | null>(null);
  const [track, setTrack] = useState<HandTrack | null>(null), [trackedSide, setTrackedSide] = useState<Side>(side), [notice, setNotice] = useState('');
  const job = useRef<AbortController | null>(null);
  useEffect(() => () => job.current?.abort(), []);
  useEffect(() => { if (side !== trackedSide && status !== 'TRACKING') { setResult(null); setStatus('IDLE'); onMarks([]); setTrackedSide(side); } }, [side]);

  if (!handTrackingAvailable()) {
    const kind = phaseKindOf(run);
    return kind ? <PhaseBreakdown kind={kind} session={session} beepMs={beepMs} shotTimes={run.shotTimes} side={side} saved={run.phases}
      onMarks={onMarks} onKeep={phases => onKeep({ ...run, phases })} disabled={disabled} />
      : <Copy>Breaking down this drill needs the next iPhone build of the app (it tracks your hands on every frame).</Copy>;
  }
  const lastMs = beepMs + (run.shotTimes[run.shotTimes.length - 1] ?? 0) * 1000;
  const breakDown = async () => {
    job.current?.abort();
    const controller = new AbortController(); job.current = controller;
    setStatus('TRACKING'); setProgress(0); setError(''); setResult(null); setNotice(''); onMarks([]); setTrackedSide(side);
    try {
      const tracked = await extractHands(session, beepMs - 400, lastMs + 300, uuid.v4(), controller.signal, setProgress);
      if (controller.signal.aborted) return;
      const b = breakDownRun(tracked, drill, run, beepMs, side);
      setTrack(tracked); setResult(b); setStatus('DONE');
      onMarks(b.segments.flatMap(s => s.marks.filter(m => m.ms !== null && !['beep', 'shot', 'nextShot'].includes(m.key)).map(m => ({ label: `${m.label.toUpperCase()}${b.segments.length > 1 ? ' · ' + (s.shot + 1) : ''}`, ms: m.ms! }))));
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(trackingError(e)); setStatus('FAILED');
    }
  };
  const exportTracking = async () => {
    if (!track) return;
    try {
      const file = new File(Paths.cache, `psp-tracking-${drill.id}-${run.id.slice(0, 8)}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(trackingExport(track, { drillId: drill.id, beepMs, shotTimes: run.shotTimes, side: trackedSide, choices: run.choices }));
      await Share.share({ url: file.uri, title: 'PSP hand tracking' });
    } catch (e) { setNotice('Couldn’t share the tracking: ' + String(e instanceof Error ? e.message : e)); }
  };
  const saved = run.breakdown ? savedRunSeconds(run.breakdown) : [];
  return <View style={{ gap: 6 }}>
    <Text style={ui.eyebrow}>RUN, BROKEN DOWN</Text>
    {saved.length > 0 && status === 'IDLE' && <>
      {saved.map(s => <View key={s.title} style={{ gap: 2 }}><Text style={ui.eyebrow}>{s.title.toUpperCase()}</Text>
        {s.rows.map(r => <DataRow key={r.label} label={r.label} value={seconds(r.seconds)} />)}</View>)}
      <Copy>Kept on this run. Break it down again to check it against the video.</Copy>
    </>}
    {status !== 'TRACKING' && <>
      <DataRow label="Shooting hand" value={side === 'right' ? 'Right' : 'Left'} />
      <Action title="BREAK DOWN THIS RUN" disabled={disabled} onPress={() => { void breakDown(); }} />
      <Copy>{`Tracks your hands on every frame, on this phone. Camera: ${CAMERA[drill.id] ?? 'where your hands are in the picture.'} ${RECORDING_TIP}`}</Copy>
    </>}
    {status === 'TRACKING' && <View style={{ gap: 4 }}>
      <Copy>{`Tracking your hands… ${Math.round(progress * 100)}%`}</Copy>
      <Action title="STOP" onPress={() => { job.current?.abort(); setStatus('IDLE'); onMarks([]); }} />
    </View>}
    {status === 'FAILED' && <Notice tone="warning">{error}</Notice>}
    {result && status === 'DONE' && <>
      {result.segments.map(s => <View key={s.kind + s.shot} style={{ gap: 2 }}>
        <Text style={ui.eyebrow}>{s.title.toUpperCase()}</Text>
        {s.intervals.map(i => {
          const sure = [i.from, i.to].every(k => s.marks.find(m => m.key === k)?.sure);
          return <DataRow key={i.label} label={i.label} value={seconds(i.seconds) + (i.seconds !== null && !sure ? ' (unsure)' : '')} />;
        })}
        {s.problems.map(p => <Notice key={p} tone="warning">{p}</Notice>)}
      </View>)}
      {result.problems.map(p => <Notice key={p} tone="warning">{p}</Notice>)}
      {result.segments.length === 0 && <Copy>This drill is timed by its shots alone; the video has nothing more to break down.</Copy>}
      <Copy>First version: the marks come from reasoned rules not yet tuned on real range video. Play the video at each mark (the buttons above it) before you keep them.</Copy>
      <Action title="KEEP ON THIS RUN" variant="primary" disabled={disabled || !result.segments.some(s => s.marks.length)}
        onPress={() => {
          const phases = phasesFromRun(result, trackedSide, phaseKindOf(run));
          void Promise.resolve(onKeep({ ...run, breakdown: savedRunBreakdown(result, trackedSide), ...(phases ? { phases } : {}) })).then(() => setStatus('IDLE')).catch(e => { setError(String(e)); setStatus('FAILED'); });
        }} />
      {Platform.OS === 'ios' && <Action title="EXPORT TRACKING" variant="quiet" disabled={!track} onPress={() => { void exportTracking(); }} />}
      {!!notice && <Notice tone="warning">{notice}</Notice>}
    </>}
  </View>;
}
