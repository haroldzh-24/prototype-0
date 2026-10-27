import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { uuid } from 'expo-modules-core';
import { Action, Copy, DataRow, Notice, Segmented, ui } from '../ui/kit';
import { extractPoseUntil } from './extractPose';
import { selectPoseSubject } from './poseDetection';
import { breakDownDraw, breakDownReload, phaseSeconds, runWindow, savedPhases } from './movementPhases';
import type { Breakdown, PhaseKind, SavedPhases, Side } from './movementPhases';
import type { VideoSession } from './videoModel';
import type { Mark } from './videoTiming';

/** Plain words for why tracking couldn't run. */
export function trackingError(e: unknown): string {
  const text = String(e instanceof Error ? e.message : e);
  if (/Unsupported local pose request|pose extraction unavailable|Rebuild the iOS app/i.test(text)) return 'Breaking down movements needs the next iPhone build of the app.';
  return text;
}
const seconds = (v: number | null) => v === null ? 'not seen' : v.toFixed(2) + ' s';

/**
 * The draw or reload of a saved run broken into movements, from body tracking on its video (movementPhases.ts). The
 * marks join the video's play buttons so you can check each one; KEEP saves them on the run.
 */
export default function PhaseBreakdown({ kind, session, beepMs, shotTimes, side, onSideChange, saved, onMarks, onKeep, disabled }: {
  kind: PhaseKind; session: VideoSession; beepMs: number; shotTimes: readonly number[]; side: Side; onSideChange: (side: Side) => void;
  saved: SavedPhases | undefined; onMarks: (marks: Mark[]) => void; onKeep: (phases: SavedPhases) => Promise<void> | void; disabled: boolean;
}) {
  const [status, setStatus] = useState<'IDLE' | 'TRACKING' | 'DONE' | 'FAILED'>('IDLE');
  const [progress, setProgress] = useState(0), [error, setError] = useState(''), [result, setResult] = useState<Breakdown | null>(null);
  // The hand the result was tracked for: KEEP saves this one, whatever the switch shows now.
  const [trackedSide, setTrackedSide] = useState<Side>(side);
  const job = useRef<AbortController | null>(null);
  useEffect(() => () => job.current?.abort(), []);
  // The run's own moments: the beep and first shot for a draw, the shots around the reload for a reload.
  const [fromMs, toMs] = kind === 'draw' ? [beepMs, beepMs + shotTimes[0] * 1000] : [beepMs + shotTimes[0] * 1000, beepMs + shotTimes[1] * 1000];
  const noun = kind === 'draw' ? 'DRAW' : 'RELOAD';

  const track = async () => {
    job.current?.abort();
    const controller = new AbortController(); job.current = controller;
    setStatus('TRACKING'); setProgress(0); setError(''); setResult(null); onMarks([]); setTrackedSide(side);
    try {
      const extraction = await extractPoseUntil(session, toMs + 300, uuid.v4(), controller.signal, setProgress);
      const { samples, warnings } = selectPoseSubject(runWindow(extraction, fromMs));
      const b = kind === 'draw' ? breakDownDraw(samples, fromMs, toMs, side) : breakDownReload(samples, fromMs, toMs, side);
      if (controller.signal.aborted) return;
      const extra = warnings.filter(w => /continuity lost/i.test(w));
      setResult({ ...b, problems: [...b.problems, ...extra] }); setStatus('DONE');
      onMarks(b.marks.filter(m => m.ms !== null && !['beep', 'shot', 'nextShot'].includes(m.key)).map(m => ({ label: m.label.toUpperCase(), ms: m.ms! })));
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(trackingError(e)); setStatus('FAILED');
    }
  };

  return <View style={{ gap: 6 }}>
    <Text style={ui.eyebrow}>{`${noun}, BROKEN DOWN`}</Text>
    {saved && status === 'IDLE' && <>
      {phaseSeconds(saved).map(p => <DataRow key={p.label} label={p.label} value={seconds(p.seconds)} />)}
      <Copy>Kept on this run. Track it again to check it against the video.</Copy>
    </>}
    {status !== 'TRACKING' && <>
      <Text style={ui.eyebrow}>SHOOTING HAND</Text>
      <Segmented options={['RIGHT', 'LEFT']} value={side === 'right' ? 'RIGHT' : 'LEFT'} disabled={disabled}
        onChange={v => { onSideChange(v === 'LEFT' ? 'left' : 'right'); setResult(null); setStatus('IDLE'); onMarks([]); }} />
      <Action title={`BREAK DOWN THE ${noun}`} disabled={disabled} onPress={() => { void track(); }} />
      <Copy>Tracks your body in the video, on this phone. Film your whole body from the side, start recording just before the beep, and keep others out of frame.</Copy>
    </>}
    {status === 'TRACKING' && <View style={{ gap: 4 }}>
      <Copy>{`Tracking your movement… ${Math.round(progress * 100)}%`}</Copy>
      <Action title="STOP" onPress={() => { job.current?.abort(); setStatus('IDLE'); onMarks([]); }} />
    </View>}
    {status === 'FAILED' && <Notice tone="warning">{error}</Notice>}
    {result && status === 'DONE' && <>
      {result.intervals.map(i => {
        const sure = [i.from, i.to].every(k => result.marks.find(m => m.key === k)?.sure);
        return <DataRow key={i.label} label={i.label} value={seconds(i.seconds) + (i.seconds !== null && !sure ? ' (unsure)' : '')} />;
      })}
      {result.problems.map(p => <Notice key={p} tone="warning">{p}</Notice>)}
      <Copy>First version: the marks come from reasoned rules not yet tuned on real range video. Play the video at each mark (the buttons above it) before you keep them.</Copy>
      <Action title="KEEP ON THIS RUN" variant="primary" disabled={disabled || result.marks.some(m => m.ms === null)}
        onPress={() => { void Promise.resolve(onKeep(savedPhases(result, trackedSide))).then(() => setStatus('IDLE')).catch(e => { setError(String(e)); setStatus('FAILED'); }); }} />
    </>}
  </View>;
}
