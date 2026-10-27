import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { uuid } from 'expo-modules-core';
import { Action, Copy, DataRow, Notice, Segmented, ui } from '../ui/kit';
import { extractAnalysisAudio } from './extractAnalysisAudio';
import { discardVideoAsset, importVideoAsset, playbackUri } from './videoAssets';
import type { VideoSession } from './videoModel';
import type { TrainingContext } from './observations';
import { intervalLabels } from './drillLibrary';
import type { LibraryDrill } from './drillLibrary';
import { marksOf, timeDrillFromSound, timingNotes } from './videoTiming';
import type { DrillTiming, DrillTimingResult, Mark } from './videoTiming';
import { MediaPlayerBoundary } from './MediaPlayerBoundary';

/** Plain words for why the sound couldn't be read; the times can always be typed. */
export function timingError(e: unknown): string {
  const text = String(e instanceof Error ? e.message : e);
  if (/extraction unavailable|Rebuild the iOS app|rebuilt iOS/i.test(text)) return 'This build of the app can’t read a video’s sound yet (it needs the next iPhone build). Type the times from your timer; the video is still saved with the run.';
  if (/no audio track|Decoded audio is empty/i.test(text)) return 'This video has no sound to time it from. Type the times from your timer.';
  if (/not in the browser/i.test(text)) return text + ' Type the times from your timer; the video is still saved with the run.';
  return text + ' Type the times from your timer, or time it again.';
}

/** The video of one run, waiting to be saved with it. */
export type RunVideo = { id: string; asset: VideoSession['asset']; durationMs: number | null; timing: DrillTiming | null };
const s2 = (ms: number) => (ms / 1000).toFixed(2) + ' s';

/** A small player with a button per mark (the beep, each shot) that plays from just before it. */
export function ClipPlayer({ uri, marks, onDuration }: { uri: string; marks: Mark[]; onDuration?: (ms: number) => void }) {
  const player = useVideoPlayer(uri, p => { p.timeUpdateEventInterval = 0.1; });
  const [error, setError] = useState('');
  useEffect(() => {
    const metadata = () => { try { if (Number.isFinite(player.duration) && player.duration > 0) onDuration?.(player.duration * 1000); } catch { /* duration stays unknown */ } };
    const listeners = [player.addListener('sourceLoad', metadata), player.addListener('statusChange', e => {
      if (e.status === 'error') setError('This video can’t be played here.'); else if (e.status === 'readyToPlay') { setError(''); metadata(); }
    })];
    metadata();
    return () => listeners.forEach(l => l.remove());
  }, [player]);
  const playFrom = (ms: number) => { try { player.pause(); player.currentTime = Math.max(0, ms / 1000 - 0.5); player.play(); setError(''); } catch { setError('Playback failed. Try again.'); } };
  return <View style={{ gap: 6 }}>
    <VideoView player={player} style={{ width: '100%', height: 220 }} nativeControls contentFit="contain" />
    {!!error && <Notice tone="warning">{error}</Notice>}
    {marks.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {marks.map(m => <Action key={m.label} title={'▶ ' + m.label} accessibilityLabel={'Play from ' + m.label} onPress={() => playFrom(m.ms)} />)}
    </View>}
  </View>;
}

/**
 * Time a run from its video: pick the video, the app finds the timer beep and the drill's shots in the audio, and you
 * check them against the video before using the times. The video is saved with the run; nothing is uploaded.
 */
export default function DrillVideo({ drill, context, video, onChange, onUseTimes, disabled }: {
  drill: LibraryDrill; context: TrainingContext; video: RunVideo | null; onChange: (video: RunVideo | null) => void;
  onUseTimes: (shotTimes: number[]) => void; disabled: boolean;
}) {
  const [status, setStatus] = useState<'IDLE' | 'PICKING' | 'TIMING' | 'DONE' | 'FAILED'>('IDLE');
  const [progress, setProgress] = useState(0), [error, setError] = useState(''), [result, setResult] = useState<DrillTimingResult | null>(null);
  const [chosen, setChosen] = useState(0);
  const job = useRef<AbortController | null>(null);
  // The latest video, for async work that finishes after a change.
  const current = useRef(video); current.current = video;
  useEffect(() => () => job.current?.abort(), []);
  // A new video (or none) starts over.
  useEffect(() => { if (!video) { setStatus('IDLE'); setResult(null); setError(''); setChosen(0); } }, [video?.id]);

  const time = async (picked: RunVideo) => {
    job.current?.abort();
    const controller = new AbortController(); job.current = controller;
    setStatus('TIMING'); setProgress(0); setError(''); setResult(null); setChosen(0);
    // The extractor reads the file through a video session; this one is never saved.
    const session: VideoSession = { id: picked.id, trainingSessionId: 'drill-run', drillId: null, asset: picked.asset, durationMs: picked.durationMs, fps: null,
      createdAt: new Date().toISOString(), importedAt: new Date().toISOString(), context, analysisStatus: 'ANNOTATING', analysisVersion: 1 };
    try {
      const audio = await extractAnalysisAudio(session, uuid.v4(), controller.signal, setProgress);
      const timed = await timeDrillFromSound(audio, drill, controller.signal);
      if (controller.signal.aborted || current.current?.id !== picked.id) return;
      setResult(timed); setStatus('DONE');
    } catch (e) {
      if (controller.signal.aborted || current.current?.id !== picked.id) return;
      setError(timingError(e)); setStatus('FAILED');
    }
  };
  const pick = async () => {
    setStatus('PICKING'); setError('');
    const id = uuid.v4();
    try {
      const asset = await importVideoAsset(id, Platform.OS === 'ios' ? 'photos' : 'files');
      if (!asset) { setStatus('IDLE'); return; }
      if (video) discardVideoAsset(video.asset);
      const next: RunVideo = { id, asset, durationMs: null, timing: null };
      // Timing can fail before the parent re-renders with the new video (no audio module): point the ref at it now.
      current.current = next; onChange(next); void time(next);
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); setStatus('FAILED'); }
  };
  const remove = () => { job.current?.abort(); if (video) discardVideoAsset(video.asset); current.current = null; onChange(null); };

  if (!video) return <View style={{ gap: 6 }}>
    <Action title={status === 'PICKING' ? 'Opening…' : 'TIME IT FROM A VIDEO'} disabled={disabled || status === 'PICKING'} onPress={() => { void pick(); }} />
    <Copy>Pick the video of this run. The app finds the timer’s beep and your shots in its sound and fills the times for you to check. The video stays on this phone with the run.</Copy>
    {!!error && <Notice tone="warning">{error}</Notice>}
  </View>;

  const timing = result?.runs[Math.min(chosen, result.runs.length - 1)] ?? null;
  let uri: string | null = null, uriError = '';
  try { uri = playbackUri(video.asset); } catch (e) { uriError = String(e instanceof Error ? e.message : e); }
  const marks = timing ? marksOf(timing.beepMs, timing.shotTimes) : [];
  return <View style={{ gap: 6 }}>
    <Text style={ui.eyebrow}>{'VIDEO · ' + video.asset.name}</Text>
    {uri ? <MediaPlayerBoundary key={uri}><ClipPlayer uri={uri} marks={marks} onDuration={ms => { if (current.current && current.current.durationMs !== ms) onChange({ ...current.current, durationMs: ms }); }} /></MediaPlayerBoundary>
      : <Notice tone="warning">{uriError}</Notice>}
    {status === 'TIMING' && <View style={{ gap: 4 }}>
      <Copy>{`Finding the beep and your shots… ${Math.round(progress * 100)}%`}</Copy>
      <Action title="STOP" onPress={() => { job.current?.abort(); setStatus('FAILED'); setError('Stopped. Type the times from your timer, or time it again.'); }} />
    </View>}
    {status === 'FAILED' && !!error && <Notice tone="warning">{error}</Notice>}
    {status === 'FAILED' && <Action title="TIME IT AGAIN" disabled={disabled} onPress={() => { void time(video); }} />}
    {result?.problem && <Notice tone="warning">{result.problem}</Notice>}
    {result && result.runs.length > 1 && <>
      <Copy>{`This video has ${result.runs.length} beeps with shots after them. Pick the run to log (log the others one at a time).`}</Copy>
      <Segmented options={result.runs.map((_, i) => 'RUN ' + (i + 1))} value={'RUN ' + (Math.min(chosen, result.runs.length - 1) + 1)} disabled={disabled}
        onChange={label => setChosen(Number(label.slice(4)) - 1)} />
    </>}
    {timing && <>
      <DataRow label="Beep" value={s2(timing.beepMs) + ' into the video'} />
      {timing.shotTimes.map((t, i) => <DataRow key={i} label={`Shot ${i + 1} · ` + (i < drill.intervals.length ? intervalLabels[i === 0 ? 'start' : drill.intervals[i]] : 'Makeup')} value={t.toFixed(2) + ' s'} />)}
      {timingNotes(timing, drill).map(n => <Notice key={n} tone="warning">{n}</Notice>)}
      {result!.warnings.map(w => <Copy key={w}>{w}</Copy>)}
      <Action title={video.timing === timing ? 'TIMES IN USE' : 'USE THESE TIMES'} variant="primary" disabled={disabled || !timing.shotTimes.length}
        onPress={() => { onChange({ ...video, timing }); onUseTimes(timing.shotTimes); }} />
    </>}
    <Action title="REMOVE VIDEO" variant="quiet" disabled={disabled} onPress={remove} />
  </View>;
}
