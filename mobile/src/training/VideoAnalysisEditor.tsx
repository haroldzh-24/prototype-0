import { ExecutionComparisonReview } from './ExecutionComparisonReview';
import { FusionReview } from './FusionReview';
import { isTrustedEvent } from './videoModel';
import { reviewFusedHypothesis } from './eventFusion';
import type { FusionResult } from './eventFusion';
import { detectCloseUp, mergeCloseDetections } from './closeUp';
import type { CloseSelection } from './closeUp';
import { extractCloseUp } from './extractCloseUp';
import { CloseUpOverlay } from './CloseUpOverlay';
import { CloseUpReview } from './CloseUpReview';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { uuid } from 'expo-modules-core';
import { Action, Copy, Panel, Screen, ui } from '../ui/kit';
import { useRepository } from '../storage/StorageProvider';
import type { TrainingRecord } from './model';
import { analyzeVideo, videoAssetAvailable, videoObservations } from './videoAnalysis';
import { assetExists, discardVideoAsset, importVideoAsset, playbackUri } from './videoAssets';
import { assertTimeMs, confirmEvent, deleteEvent, editEvent, eventTypes, frameToTime, measurementLabels, msToSeconds, secondsToMs, sortEvents } from './videoModel';
import type { EventType, TimelineEvent, TrainingVideo } from './videoModel';
import { detectAudio, mergeAudioDetections } from './audioDetection';
import { extractAnalysisAudio } from './extractAnalysisAudio';
import { extractPose } from './extractPose';
import { detectPose, mergePoseDetections } from './poseDetection';
import { nearestPoseSample, PoseOverlay } from './PoseOverlay';

function Player({ video, onMetadata, onMark, preview, onCloseUp, closeBusy }: { video: TrainingVideo; preview: { ms: number; key: number } | null;
  onCloseUp: (selection: CloseSelection, preMs: number, postMs: number) => void; closeBusy: boolean;
  onMetadata: (durationMs: number, fps: number | null) => void; onMark: (ms: number) => void }) {
  const [timeMs, setTimeMs] = useState(0), [seekText, setSeekText] = useState('0'), [error, setError] = useState('');
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  const [overlay, setOverlay] = useState(false), [playerWidth, setPlayerWidth] = useState(0);
  const [selecting, setSelecting] = useState(false), [closeOverlay, setCloseOverlay] = useState(false);
  const [selection, setSelection] = useState<CloseSelection | null>(null);
  const [preMs, setPreMs] = useState('500'), [postMs, setPostMs] = useState('2000');
  const poseSamples = video.analysis.poseRun?.preview ?? [];
  const poseSample = overlay ? nearestPoseSample(poseSamples, timeMs) : null;
  const player = useVideoPlayer(playbackUri(video.session.asset), p => { p.timeUpdateEventInterval = 0.05; });
  useEffect(() => {
    if (!preview) return;
    try { player.pause(); player.currentTime = msToSeconds(preview.ms); setTimeMs(preview.ms); setSeekText(String(preview.ms)); }
    catch { setError('Preview seek failed. Use the player controls to inspect this marker.'); }
  }, [preview, player]);
  useEffect(() => {
    const metadata = () => {
      if (Number.isFinite(player.duration) && player.duration > 0) {
        if (video.analysis.events.some(e => e.timestampMs > secondsToMs(player.duration))) {
          setError('This file is shorter than the saved timeline. Relink the original recording.'); return;
        }
        const fps = player.availableVideoTracks[0]?.frameRate;
        onMetadata(secondsToMs(player.duration), fps && fps > 0 ? fps : null);
      }
    };
    const listeners = [player.addListener('sourceLoad', metadata),
      player.addListener('timeUpdate', e => { if (e.currentTime >= 0) setTimeMs(secondsToMs(e.currentTime)); }),
      player.addListener('playingChange', e => setPlaying(e.isPlaying)),
      player.addListener('statusChange', e => {
        setReady(e.status === 'readyToPlay');
        if (e.status === 'error') setError('Video cannot be played. The file may be missing or its format unsupported. Annotations are preserved.');
        else if (e.status === 'readyToPlay') { setError(''); metadata(); }
      })];
    metadata(); setReady(player.status === 'readyToPlay');
    return () => listeners.forEach(listener => listener.remove());
  }, [player, onMetadata, video.analysis.events]);
  const seek = (ms: number) => {
    try {
      assertTimeMs(ms, video.session.durationMs); setSelecting(false); player.pause(); player.currentTime = msToSeconds(ms);
      setTimeMs(ms); setSeekText(String(Math.round(ms))); setError('');
    } catch (e) { setError(String(e)); }
  };
  const step = video.session.fps ? frameToTime(1, video.session.fps) : 50;
  return <Panel>
    <View onLayout={e => setPlayerWidth(e.nativeEvent.layout.width)} style={{ height: 220 }}>
      <VideoView player={player} style={{ width: '100%', height: 220 }} nativeControls={!selecting} contentFit="contain" />
      {(selecting || closeOverlay) && <CloseUpOverlay run={video.analysis.closeRun} timeMs={timeMs} width={playerWidth} height={220}
        videoWidth={player.availableVideoTracks[0]?.size?.width ?? 1} videoHeight={player.availableVideoTracks[0]?.size?.height ?? 1}
        selecting={selecting} onSelect={value => { setSelection(value); setSelecting(false); }} />}
      {overlay && <PoseOverlay sample={poseSample} width={playerWidth} height={220} />}
    </View>
    <Action title={selecting ? 'Cancel region selection' : 'ANALYZE CLOSE-UP: select region on current frame'} disabled={!ready || closeBusy || !player.availableVideoTracks[0]?.size?.width} onPress={() => {
      player.pause(); setTimeMs(secondsToMs(player.currentTime)); setSelecting(!selecting); setSelection(null);
    }} />
    {selecting && <Copy>Drag a box around the object. Use playback/seek controls to choose a representative frame first. Tracking runs forward from this frame.</Copy>}
    {selection && <>
      <Copy>Selected frame {selection.timestampMs.toFixed(0)} ms. Pre/post windows: 100?10000 ms.</Copy>
      <TextInput style={ui.input} accessibilityLabel="Pre-event window ms" value={preMs} onChangeText={setPreMs} keyboardType="numeric" />
      <TextInput style={ui.input} accessibilityLabel="Post-event window ms" value={postMs} onChangeText={setPostMs} keyboardType="numeric" />
      <Action title="Run close-up analysis" disabled={closeBusy || ![Number(preMs), Number(postMs)].every(n => Number.isFinite(n) && n >= 100 && n <= 10000)}
        onPress={() => { setCloseOverlay(true); onCloseUp(selection, Number(preMs), Number(postMs)); }} />
    </>}
    {video.analysis.closeRun && <>
      <Action title={closeOverlay ? 'Hide close-up overlay' : 'Show close-up overlay'} onPress={() => setCloseOverlay(!closeOverlay)} />
      {closeOverlay && <>
        <Copy>{(() => { const f = video.analysis.closeRun!.preview.find(f => Math.abs(f.timestampMs - timeMs) <= 50);
          return f ? f.object.status + ' ? confidence ' + f.object.confidence.toFixed(2) : 'No saved close-up sample near this time.'; })()}</Copy>
        <Action title="Preview next close-up sample" onPress={() => { const samples = video.analysis.closeRun!.preview;
          const next = samples.find(f => f.timestampMs > timeMs + 1) ?? samples[0]; if (next) seek(next.timestampMs); }} />
        {video.analysis.closeRun.events.filter(e => timeMs >= e.preStartMs && timeMs <= e.postEndMs).map(e => <Copy key={e.eventId}>{timeMs < e.timestampMs ? 'PRE' : 'POST'} event window ? {e.timestampMs} ms</Copy>)}
      </>}
    </>}
    {!!poseSamples.length && <>
      <Action title={overlay ? 'Hide pose overlay' : 'Show pose overlay'} onPress={() => setOverlay(!overlay)} />
      {overlay && <>
        <Copy>{poseSample ? `Pose sample: ${poseSample.timestampMs.toFixed(1)} ms${poseSample.body ? '' : ' · no reliable body'}` : 'No saved pose sample near this timestamp.'}</Copy>
        <Action title="Preview next saved pose sample" disabled={!ready} onPress={() => {
          const next = poseSamples.find(s => s.timestampMs > timeMs + 1) ?? poseSamples[0]; seek(next.timestampMs);
        }} />
        <Copy>Sampled review overlay; gaps are not interpolated. Native full-screen playback does not show this overlay.</Copy>
      </>}
    </>}
    <Copy>{Math.round(timeMs)} / {video.session.durationMs === null ? '?' : Math.round(video.session.durationMs)} ms</Copy>
    <Action title={playing ? 'Pause' : 'Play'} disabled={!ready || selecting} onPress={() => playing ? player.pause() : player.play()} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Action title={`− ${video.session.fps ? '1 frame*' : '50 ms'}`} disabled={!ready} onPress={() => seek(Math.max(0, secondsToMs(player.currentTime) - step))} />
      <Action title={`+ ${video.session.fps ? '1 frame*' : '50 ms'}`} disabled={!ready} onPress={() => seek(Math.min(video.session.durationMs ?? 0, secondsToMs(player.currentTime) + step))} />
    </View>
    {video.session.fps !== null && <Copy>*Nominal FPS step; variable-rate video and player seeking may differ.</Copy>}
    <TextInput accessibilityLabel="Seek time in milliseconds" style={ui.input} value={seekText} onChangeText={setSeekText} keyboardType="decimal-pad" />
    <Action title="Seek to ms" disabled={!ready} onPress={() => seek(seekText.trim() ? Number(seekText) : NaN)} />
    <Action title="Add selected event at current time" disabled={!ready} onPress={() => { player.pause(); onMark(secondsToMs(player.currentTime)); }} />
    {!!error && <Copy>{error}</Copy>}
  </Panel>;
}

export function VideoAnalysisEditor({ record, initialVideo, onSaved, onClose }: {
  record: TrainingRecord; initialVideo: TrainingVideo; onSaved: (record: TrainingRecord) => void; onClose: () => void;
}) {
  const repo = useRepository(), [video, setVideo] = useState(initialVideo), [saved, setSaved] = useState(JSON.stringify(initialVideo));
  const [available, setAvailable] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [type, setType] = useState<EventType>('STIMULUS'), [showTypes, setShowTypes] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null), [timestamp, setTimestamp] = useState('0');
  const [target, setTarget] = useState(''), [stringId, setStringId] = useState(''), [movementType, setMovementType] = useState(''), [distance, setDistance] = useState('');
  const [analyzing, setAnalyzing] = useState(false), [audioMessage, setAudioMessage] = useState('');
  const [preview, setPreview] = useState<{ ms: number; key: number } | null>(null);
  const audioJob = useRef<AbortController | null>(null);
  const poseJob = useRef<AbortController | null>(null);
  const [analyzingMovement, setAnalyzingMovement] = useState(false), [poseMessage, setPoseMessage] = useState('');
  const [poseProgress, setPoseProgress] = useState(0);
  const closeJob = useRef<AbortController | null>(null);
  const [analyzingClose, setAnalyzingClose] = useState(false), [closeMessage, setCloseMessage] = useState('');
  const runCloseUp = async (selection: CloseSelection, preMs: number, postMs: number) => {
    if (closeJob.current || poseJob.current || audioJob.current || busy) return;
    const controller = new AbortController(); closeJob.current = controller; setAnalyzingClose(true);
    try {
      const extraction = await extractCloseUp(video.session, selection, uuid.v4(), controller.signal, p => {
        if (closeJob.current === controller) setCloseMessage('Analyzing close-up locally... ' + Math.round(p * 100) + '%');
      });
      if (controller.signal.aborted || closeJob.current !== controller) return;
      const previous = currentVideo.current;
      const run = detectCloseUp(extraction, selection, previous.analysis.events.filter(e => e.timestampMs <= extraction.durationMs), preMs, postMs);
      const events = mergeCloseDetections(previous.analysis.events, run, previous.session.durationMs);
      setVideo({ ...previous, analysis: analyzeVideo(previous.session, events, previous.analysis.audioRun, previous.analysis.poseRun, run, previous.analysis.fusion) });
      setCloseMessage('Close-up results ready. Review generic CUSTOM suggestions before confirming; save to retain.');
    } catch (error) { if (closeJob.current === controller) setCloseMessage(String(error)); }
    finally { if (closeJob.current === controller) { closeJob.current = null; setAnalyzingClose(false); } }
  };
  const currentVideo = useRef(video);
  useEffect(() => { currentVideo.current = video; }, [video]);
  useEffect(() => () => { closeJob.current?.abort(); closeJob.current = null; audioJob.current?.abort(); audioJob.current = null; poseJob.current?.abort(); poseJob.current = null; }, []);
  const runMovement = async () => {
    if (closeJob.current || poseJob.current || audioJob.current || busy) return;
    const controller = new AbortController(); poseJob.current = controller;
    setAnalyzingMovement(true); setPoseProgress(0); setPoseMessage('Analyzing movement locally...');
    try {
      const extraction = await extractPose(video.session, uuid.v4(), controller.signal, value => {
        if (poseJob.current === controller) setPoseProgress(value);
      });
      if (controller.signal.aborted || poseJob.current !== controller) return;
      const previous = currentVideo.current;
      // Interpret against current stimuli and markers, including edits during native extraction.
      const run = detectPose(extraction, previous.analysis.events);
      const merged = mergePoseDetections(previous.analysis.events, run, previous.session.durationMs);
      const session = { ...previous.session, analysisStatus: 'ANNOTATING' as const };
      setVideo({ ...previous, session, analysis: analyzeVideo(session, merged.events, previous.analysis.audioRun, merged.run, previous.analysis.closeRun, previous.analysis.fusion) });
      setPoseMessage('Movement suggestions ready. Review the subject and timing before confirming; save to retain this analysis.');
    } catch (error) {
      if (poseJob.current === controller) setPoseMessage(String(error));
    } finally {
      if (poseJob.current === controller) { poseJob.current = null; setAnalyzingMovement(false); }
    }
  };
  const runAudio = async () => {
    if (closeJob.current || audioJob.current || poseJob.current || busy) return;
    const controller = new AbortController(); audioJob.current = controller;
    setAnalyzing(true); setAudioMessage('Analyzing audio locally...');
    try {
      const audio = await extractAnalysisAudio(video.session, uuid.v4(), controller.signal);
      const run = await detectAudio(audio, controller.signal);
      if (controller.signal.aborted || audioJob.current !== controller) return;
      // Merge against the CURRENT timeline, including edits made during decode.
      setVideo(previous => {
        const merged = mergeAudioDetections(previous.analysis.events, run, previous.session.durationMs);
        const session = { ...previous.session, analysisStatus: 'ANNOTATING' as const };
        return { ...previous, session, analysis: analyzeVideo(session, merged.events, merged.run, previous.analysis.poseRun, previous.analysis.closeRun, previous.analysis.fusion) };
      });
      setAudioMessage('Audio suggestions ready. Preview, edit, confirm or reject each candidate, then save.');
    } catch (error) {
      if (audioJob.current === controller) setAudioMessage(String(error));
    } finally {
      if (audioJob.current === controller) { audioJob.current = null; setAnalyzing(false); }
    }
  };
  const dirty = JSON.stringify(video) !== saved;
  useEffect(() => {
    let active = true; setAvailable(null);
    videoAssetAvailable(video.session, assetExists).then(value => { if (active) setAvailable(value); });
    return () => { active = false; };
  }, [video.session.asset.uri]);
  const onMetadata = useCallback((durationMs: number, fps: number | null) => {
    setVideo(previous => {
      if (previous.session.durationMs === durationMs && previous.session.fps === fps) return previous;
      if (previous.analysis.events.some(e => e.timestampMs > durationMs)) return previous;
      const session = { ...previous.session, durationMs, fps };
      return { ...previous, session, analysis: analyzeVideo(session, previous.analysis.events, previous.analysis.audioRun, previous.analysis.poseRun, previous.analysis.closeRun, previous.analysis.fusion) };
    });
  }, []);
  const observations = useMemo(() => videoObservations(video, record.startingType), [video, record.startingType]);
  const changeEvents = (events: TimelineEvent[], fusion: FusionResult | undefined = video.analysis.fusion) => {
    const session = { ...video.session, analysisStatus: 'ANNOTATING' as const };
    setVideo({ ...video, session, analysis: analyzeVideo(session, events, video.analysis.audioRun, video.analysis.poseRun, video.analysis.closeRun, fusion) }); setMessage('');
  };
  const guard = (fn: () => void) => { try { fn(); } catch (e) { setMessage(String(e)); } };
  const metadata = () => ({ ...(target.trim() ? { targetId: target.trim() } : {}), ...(stringId.trim() ? { stringId: stringId.trim() } : {}),
    ...(movementType.trim() ? { movementType: movementType.trim() } : {}), ...(distance.trim() ? { distanceInches: Number(distance) } : {}) });
  const mark = (ms: number) => guard(() => changeEvents(sortEvents([...video.analysis.events, {
    id: uuid.v4(), type, timestampMs: ms, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, metadata: metadata(),
  }], video.session.durationMs)));
  const save = async (contribute = false) => {
    if (busy || analyzing || analyzingMovement || analyzingClose) return; setBusy(true);
    try {
      const nextVideo = contribute ? { ...video, session: { ...video.session, analysisStatus: 'REVIEWED' as const } } : video;
      const updated = { ...record, videos: (record.videos ?? []).map(v => v.session.id === nextVideo.session.id ? nextVideo : v) };
      if (contribute) await repo.contributeTrainingVideo(updated, video.session.id); else await repo.saveTraining(updated);
      setVideo(nextVideo); setSaved(JSON.stringify(nextVideo)); onSaved(updated);
      setMessage(contribute ? `${observations.length} measurements contributed. Active profile context: ${video.session.context}.` : 'Analysis saved. Changed evidence was removed from any previous profile contribution.');
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  };
  const close = () => { if (busy) return; if (dirty) setMessage('Save your changes before closing, or choose Discard changes.'); else onClose(); };
  const relink = async () => {
    setBusy(true);
    try {
      const asset = await importVideoAsset(uuid.v4());
      if (asset) {
        if (asset.name !== video.session.asset.name || (video.session.asset.size !== undefined && asset.size !== video.session.asset.size)) {
          discardVideoAsset(asset); throw new Error('Choose the same original recording (matching name and size) to preserve annotations.');
        }
        const session = { ...video.session, asset, durationMs: null, fps: null };
        setVideo({ ...video, session, analysis: analyzeVideo(session, video.analysis.events, video.analysis.audioRun, video.analysis.poseRun, video.analysis.closeRun, video.analysis.fusion) }); setMessage('Original video relinked. Save to retain the reference.');
      }
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={close}>
    <Screen title="VIDEO ANALYSIS">
      <Action title="Close analysis" onPress={close} disabled={busy} />
      <Copy>{video.session.asset.name} · {video.session.context} · {dirty ? 'Unsaved changes' : 'Saved'}</Copy>
      {video.session.asset.storage === 'BROWSER_SESSION' && <Copy>Browser video access lasts for this page session. Annotations are saved; reselect the original file after reloading.</Copy>}
      {available === true && <Player key={video.session.asset.uri} video={video} preview={preview} onCloseUp={runCloseUp} closeBusy={busy || analyzing || analyzingMovement || analyzingClose} onMetadata={onMetadata} onMark={ms => { if (!busy) mark(ms); }} />}
      {available === null && <Copy>Checking local video…</Copy>}
      {available === false && <Panel><Copy>Video file unavailable. Saved annotations and measurements are still accessible.</Copy>
        <Action title="Relink original video (keep markers)" onPress={relink} disabled={busy || analyzing || analyzingMovement || analyzingClose} /></Panel>}
      {!!closeMessage && <Copy>{closeMessage}</Copy>}
      {analyzingClose && <Action title="Cancel close-up analysis" onPress={() => closeJob.current?.abort()} />}
      {video.analysis.closeRun && <CloseUpReview run={video.analysis.closeRun} />}
      <Panel><Copy>AUDIO DETECTIONS</Copy>
        <Action title={analyzing ? 'ANALYZING AUDIO...' : video.analysis.audioRun ? 'RE-ANALYZE AUDIO' : 'ANALYZE AUDIO'} disabled={busy || analyzing || analyzingMovement || analyzingClose || available !== true} onPress={runAudio} />
        {analyzing && <Action title="Cancel audio analysis" onPress={() => { audioJob.current?.abort(); setAudioMessage('Cancelling audio analysis...'); }} />}
        {!!audioMessage && <Copy>{audioMessage}</Copy>}
        <Copy>Suggestions require review. Audio may come from other shooters or impacts. Dry fire may produce only a beep.</Copy>
        {video.analysis.audioRun && <>
          <Copy>{video.analysis.audioRun.candidates.length} candidates · {video.analysis.audioRun.matches.length} matched existing markers · {video.analysis.audioRun.detectorVersion}</Copy>
          {video.analysis.audioRun.warnings.map(w => <Copy key={w}>{w}</Copy>)}
        </>}
      </Panel>
      <Panel><Copy>MOVEMENT SUGGESTIONS</Copy>
        <Action title={analyzingMovement ? `ANALYZING MOVEMENT... ${Math.round(poseProgress * 100)}%` : 'ANALYZE MOVEMENT'}
          disabled={busy || analyzing || analyzingMovement || analyzingClose || available !== true} onPress={runMovement} />
        {analyzingMovement && <Action title="Cancel movement analysis" onPress={() => { poseJob.current?.abort(); setPoseMessage('Cancelling movement analysis...'); }} />}
        {!!poseMessage && <Copy>{poseMessage}</Copy>}
        <Copy>Review body visibility and camera movement. Video displacement is not physical distance. Position events do not identify stage locations.</Copy>
        {video.analysis.poseRun && <>
          <Copy>{video.analysis.poseRun.sampleCount} sampled frames · {video.analysis.poseRun.missingCount} unusable · {video.analysis.poseRun.matches.length} matched existing markers</Copy>
          {video.analysis.poseRun.warnings.map(w => <Copy key={w}>{w}</Copy>)}
          {video.analysis.poseRun.armPhases.map(p => <Copy key={p.stimulusId}>Gross arm motion: {p.onsetMs.toFixed(0)} ms; stabilization: {p.stabilizationMs?.toFixed(0) ?? 'not observed'} ms. This does not identify hand-on-gun or draw completion.</Copy>)}
        </>}
      </Panel>
      <Panel>
        <Copy>{editingId ? 'EDIT MARKER' : 'NEW MARKER'}</Copy>
        <Action title={`Event type: ${type}`} onPress={() => setShowTypes(!showTypes)} disabled={busy} />
        {showTypes && eventTypes.map(value => <Action key={value} title={value} onPress={() => { setType(value); setShowTypes(false); }} />)}
        <TextInput style={ui.input} accessibilityLabel="Marker milliseconds" value={timestamp} onChangeText={setTimestamp} keyboardType="decimal-pad" placeholder="Time in ms" placeholderTextColor="#888" />
        <TextInput style={ui.input} accessibilityLabel="Target label" value={target} onChangeText={setTarget} placeholder="Target label (optional)" placeholderTextColor="#888" />
        <TextInput style={ui.input} accessibilityLabel="Same-target string label" value={stringId} onChangeText={setStringId} placeholder="Same-target string label (optional)" placeholderTextColor="#888" />
        <TextInput style={ui.input} accessibilityLabel="Movement type" value={movementType} onChangeText={setMovementType} placeholder="Movement type (optional)" placeholderTextColor="#888" />
        <TextInput style={ui.input} accessibilityLabel="Known movement distance in inches" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" placeholder="Known movement distance, inches (optional)" placeholderTextColor="#888" />
        <Copy>Use a target/string label only for shots on one target. Distance belongs on MOVEMENT_START and must come from known drill/stage data.</Copy>
        <Action title={editingId ? 'Apply marker edit' : 'Add marker at entered ms'} disabled={busy} onPress={() => guard(() => {
          const ms = timestamp.trim() ? Number(timestamp) : NaN;
          if (editingId) { changeEvents(editEvent(video.analysis.events, editingId, { type, timestampMs: ms,
            metadata: { ...video.analysis.events.find(e => e.id === editingId)?.metadata, targetId: undefined, stringId: undefined,
              movementType: undefined, distanceInches: undefined, ...metadata() } }, video.session.durationMs)); setEditingId(null); }
          else mark(ms);
        })} />
        {editingId && <Action title="Cancel marker edit" onPress={() => setEditingId(null)} />}
      </Panel>
      <Panel><Copy>TIMELINE · milliseconds from video start</Copy>
        {video.analysis.movementSegments.map(s => <View key={s.id} style={{ gap: 4 }}>
          <Copy>MOVEMENT · {s.startMs.toFixed(0)}–{s.endMs.toFixed(0)} ms · {s.durationMs.toFixed(0)} ms · {s.confidence}</Copy>
          <View style={{ height: 4, backgroundColor: '#263239' }}><View style={{ height: 4, backgroundColor: '#58c9b9',
            marginLeft: `${100 * s.startMs / Math.max(1, video.session.durationMs ?? s.endMs)}%`,
            width: `${100 * s.durationMs / Math.max(1, video.session.durationMs ?? s.endMs)}%` }} /></View>
        </View>)}
        {video.analysis.poseRun?.segments.map(s => <View key={s.id} style={{ gap: 4 }}>
          <Copy>LAST POSE RUN · {s.startMs.toFixed(0)}–{s.endMs.toFixed(0)} ms · {s.durationMs.toFixed(0)} ms · {s.confidence}. Current review status is on the markers below.</Copy>
          <View style={{ height: 4, backgroundColor: '#263239' }}><View style={{ height: 4, backgroundColor: '#c498ff',
            marginLeft: `${100 * s.startMs / Math.max(1, video.session.durationMs ?? s.endMs)}%`,
            width: `${100 * s.durationMs / Math.max(1, video.session.durationMs ?? s.endMs)}%` }} /></View>
        </View>)}
        {!video.analysis.events.length && <Copy>No markers yet. Select an event type, pause at the event, and add it.</Copy>}
        {video.analysis.fusion && <FusionReview fusion={video.analysis.fusion} busy={busy}
          onPreview={ms => setPreview(previous => ({ ms, key: (previous?.key ?? 0) + 1 }))}
          onReview={(id, action, patch) => guard(() => {
            const reviewed = reviewFusedHypothesis(video.analysis.events, video.analysis.fusion!, id, action, patch, video.session.durationMs);
            changeEvents(reviewed.events, reviewed.fusion);
          })} />}
        {video.analysis.events.filter(e => isTrustedEvent(e) || !video.analysis.fusion?.evidence.some(p => p.timelineEventId === e.id && video.analysis.fusion?.hypotheses.some(h => h.evidenceIds.includes(p.id)))).map(e => <View key={e.id} style={{ gap: 6, borderLeftWidth: 3, paddingLeft: 8,
          borderLeftColor: !e.confirmed && e.source === 'POSE_DETECTED' ? '#c498ff' : e.source === 'AUDIO_DETECTED' && !e.confirmed ? '#eab54d' : '#58c9b9' }}>
          {e.source === 'VISION_DETECTED' && <Copy>{e.metadata?.note ?? 'CLOSE-UP'}{e.confirmed ? '' : ' ? review required'}</Copy>}
          {e.source === 'POSE_DETECTED' && !e.confirmed && <Copy>POSE SUGGESTION · review required</Copy>}
          {e.source === 'AUDIO_DETECTED' && !e.confirmed && <Copy>AUDIO SUGGESTION · review required</Copy>}
          <Copy>{isTrustedEvent(e) ? 'CONFIRMED EVENT' : 'RAW SUGGESTION'}</Copy>
          <Copy>{Math.round(e.timestampMs)} ms · {e.type} · {e.source} / {e.confirmed || e.source === 'MANUAL' ? 'Confirmed' : e.confidence}</Copy>
          {isTrustedEvent(e) && video.analysis.fusion && <FusionReview fusion={video.analysis.fusion} authoritativeEventId={e.id} busy={busy}
            onPreview={ms => setPreview(previous => ({ ms, key: (previous?.key ?? 0) + 1 }))} onReview={() => {}} />}
          <Action title={`Preview at ${e.timestampMs.toFixed(2)} ms`} disabled={available !== true} onPress={() => setPreview(previous => ({ ms: e.timestampMs, key: (previous?.key ?? 0) + 1 }))} />
          <Action title="Edit" disabled={busy} onPress={() => { setEditingId(e.id); setTimestamp(String(e.timestampMs)); setType(e.type);
            setTarget(e.metadata?.targetId ?? ''); setStringId(e.metadata?.stringId ?? ''); setMovementType(e.metadata?.movementType ?? ''); setDistance(e.metadata?.distanceInches?.toString() ?? ''); }} />
          {!e.confirmed && <Action title="Confirm event" disabled={busy} onPress={() => guard(() => changeEvents(confirmEvent(video.analysis.events, e.id)))} />}
          <Action title="Delete event" disabled={busy} onPress={() => guard(() => { changeEvents(deleteEvent(video.analysis.events, e.id)); if (editingId === e.id) setEditingId(null); })} />
        </View>)}
      </Panel>
      <Panel><Copy>DERIVED MEASUREMENTS</Copy>
        {video.analysis.measurements.map(m => <View key={m.id}><Copy>{measurementLabels[m.kind]}: {m.durationMs.toFixed(1)} ms · {m.confidence}</Copy>
          {!m.eligible && <Action title="Confirm measurement endpoints" disabled={busy} onPress={() => guard(() => changeEvents(m.eventIds.reduce((events, id) => confirmEvent(events, id), video.analysis.events)))} />}
        </View>)}
        {!video.analysis.measurements.length && <Copy>Add matching start/end events to derive measurements.</Copy>}
        {Object.entries(video.analysis.completeness).map(([label, value]) => <Copy key={label}>{label}: {value}</Copy>)}
        <Copy>{video.analysis.movementSegments.length} movement segments · {video.analysis.shotStrings.length} shot strings</Copy>
        {video.analysis.warnings.map(w => <Copy key={w}>{w}</Copy>)}
      </Panel>
      <ExecutionComparisonReview video={video} busy={busy || analyzing || analyzingMovement || analyzingClose}
        onChange={executionComparison => setVideo(previous => ({ ...previous, executionComparison }))}
        onPreview={ms => setPreview(previous => ({ ms, key: (previous?.key ?? 0) + 1 }))} />
      <Panel><Copy>Profile contribution: {observations.length} eligible measurements</Copy>
        <Copy>Compatible timings: stimulus response, holster draw, complete reload, labeled same-target splits, movement with known physical distance. Other intervals remain in the analysis.</Copy>
        <Copy>Contributing activates {video.session.context} calibration. Other contexts stay separate. Repeat contribution replaces these samples.</Copy>
        <Action title="Save analysis" disabled={busy || analyzing || analyzingMovement || analyzingClose} onPress={() => save()} />
        <Action title={`Add ${observations.length} eligible measurements to profile`} disabled={busy || analyzing || analyzingMovement || analyzingClose || !observations.length} onPress={() => save(true)} />
      </Panel>
      {!!message && <Copy>{message}</Copy>}
      {dirty && <Action title="Discard changes and close" disabled={busy} onPress={() => {
        if (video.session.asset.uri !== JSON.parse(saved).session.asset.uri) discardVideoAsset(video.session.asset);
        onClose();
      }} />}
    </Screen>
  </Modal>;
}
