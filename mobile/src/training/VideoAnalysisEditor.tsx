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
import { AppState, Modal, Platform, Text, TextInput, View } from 'react-native';
import { videoDisplaySize } from './videoDisplaySize';
import { OperationGate } from './operationGate';
import { MediaPlayerBoundary } from './MediaPlayerBoundary';
import { useVideoPlayer, VideoView } from 'expo-video';
import { uuid } from 'expo-modules-core';
import { Action, Copy, Panel, Screen, Stat, StatusBadge, Notice, ErrorState, ui } from '../ui/kit';
import { Segmented } from '../ui/kit';
import { SafeAreaView } from 'react-native-safe-area-context';
import EditorSheet from '../editor/EditorSheet';
import { useRepository } from '../storage/StorageProvider';
import type { TrainingRecord } from './model';
import { analyzeVideo, videoAssetAvailable, videoObservations } from './videoAnalysis';
import { assetExists, discardVideoAsset, importVideoAsset, playbackUri } from './videoAssets';
import { assertTimeMs, confirmEvent, deleteEvent, editEvent, eventTypes, frameToTime, measurementLabels, msToSeconds, playbackTimeMs, secondsToMs, sortEvents } from './videoModel';
import type { EventType, TimelineEvent, TrainingVideo } from './videoModel';
import { detectAudio, mergeAudioDetections } from './audioDetection';
import { extractAnalysisAudio } from './extractAnalysisAudio';
import { extractPose } from './extractPose';
import { detectPose, mergePoseDetections } from './poseDetection';
import { nearestPoseSample, PoseOverlay } from './PoseOverlay';

function Details({ children }: { children: React.ReactNode }) {
 const [open, setOpen] = useState(false);
 return <View style={{ gap: 8 }}><Action title={open ? 'Hide details' : 'Details'} onPress={() => setOpen(!open)} />{open && children}</View>;
}
function Player({ video, onMetadata, onMark, preview, onCloseUp, closeBusy, task }: { video: TrainingVideo; preview: { ms: number; key: number } | null; task: string;
  onCloseUp: (selection: CloseSelection, preMs: number, postMs: number) => void; closeBusy: boolean;
  onMetadata: (durationMs: number, fps: number | null) => void; onMark: (ms: number) => void }) {
  const [timeMs, setTimeMs] = useState(0), [seekText, setSeekText] = useState('0'), [error, setError] = useState('');
  const [precision, setPrecision] = useState(false);
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  const [overlay, setOverlay] = useState(false), [playerWidth, setPlayerWidth] = useState(0);
  const [selecting, setSelecting] = useState(false), [closeOverlay, setCloseOverlay] = useState(false);
  const [selection, setSelection] = useState<CloseSelection | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    let active = true; setDisplaySize(null); setSelection(null); setSelecting(false);
    void videoDisplaySize(video.session).then(size => { if (active) setDisplaySize(size); });
    return () => { active = false; };
  }, [video.session.asset.uri]);
  const [preMs, setPreMs] = useState('500'), [postMs, setPostMs] = useState('2000');
  const poseSamples = video.analysis.poseRun?.preview ?? [];
  const poseSample = overlay ? nearestPoseSample(poseSamples, timeMs) : null;
  const player = useVideoPlayer(playbackUri(video.session.asset), p => { p.timeUpdateEventInterval = 0.05; });
  const selectionSize = Platform.OS === 'web' ? player.availableVideoTracks[0]?.size : displaySize;
  useEffect(() => {
    if (!preview) return;
    try { player.pause(); player.currentTime = msToSeconds(preview.ms); setTimeMs(preview.ms); setSeekText(String(preview.ms)); }
    catch { setError('Preview seek failed. Use the player controls to inspect this marker.'); }
  }, [preview, player]);
  useEffect(() => {
    const metadata = () => {
      try {
      if (Number.isFinite(player.duration) && player.duration > 0) {
        if (video.analysis.events.some(e => e.timestampMs > secondsToMs(player.duration))) {
          setError('This file is shorter than the saved timeline. Relink the original recording.'); return;
        }
        const fps = player.availableVideoTracks[0]?.frameRate;
        onMetadata(secondsToMs(player.duration), fps && Number.isFinite(fps) && fps > 0 ? fps : null);
      }
      } catch { setError('Video metadata is unavailable. Retry playback or continue manual editing.'); }
    };
    const listeners = [player.addListener('sourceLoad', metadata),
      player.addListener('timeUpdate', e => { const ms = playbackTimeMs(e.currentTime); if (ms !== null) setTimeMs(ms); }),
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
  const control = (action: () => void) => { try { action(); } catch { setError('Playback failed. Retry or continue manual editing.'); } };
  const step = video.session.fps ? frameToTime(1, video.session.fps) : 50;
  return <Panel>
    <View onLayout={e => setPlayerWidth(e.nativeEvent.layout.width)} style={{ height: 220 }}>
      <VideoView player={player} style={{ width: '100%', height: 220 }} nativeControls={!selecting} contentFit="contain" />
      {(selecting || closeOverlay || (task === 'ANALYZE' && selection !== null)) && <CloseUpOverlay run={video.analysis.closeRun} timeMs={timeMs} width={playerWidth} height={220}
        videoWidth={selectionSize?.width ?? 0} videoHeight={selectionSize?.height ?? 0}
        selectedRegion={task === 'ANALYZE' && selection && Math.abs(selection.timestampMs - timeMs) < 50 ? selection.region : undefined} selecting={selecting} onSelect={value => { setSelection(value); setSelecting(false); }} />}
      {overlay && <PoseOverlay sample={poseSample} width={playerWidth} height={220} />}
    </View>
    <View style={[{ gap: 12 }, task !== 'ANALYZE' && { display: 'none' }]}><Action title={selecting ? 'Cancel region selection' : '1. SELECT REGION'} disabled={!ready || closeBusy || !selectionSize?.width} onPress={() => {
      control(() => { player.pause(); setTimeMs(secondsToMs(player.currentTime)); setSelecting(!selecting); setSelection(null); });
    }} />
    {ready && !selectionSize?.width && <Copy>Close-up selection needs displayed video dimensions. Rebuild the iOS app if unavailable; manual annotation remains available.</Copy>}
    {selecting && <Copy>Drag a box around the object. Use playback/seek controls to choose a representative frame first. Tracking runs forward from this frame.</Copy>}
    {selection && <>
      <Copy>2. SET WINDOW / selected frame {selection.timestampMs.toFixed(0)} ms. Windows: 100-10000 ms.</Copy>
      <Copy>Before (ms)</Copy><TextInput style={ui.input} accessibilityLabel="Pre-event window ms" value={preMs} onChangeText={setPreMs} keyboardType="numeric" />
      <Copy>After (ms)</Copy><TextInput style={ui.input} accessibilityLabel="Post-event window ms" value={postMs} onChangeText={setPostMs} keyboardType="numeric" />
      <Action title="3. RUN ANALYSIS" disabled={closeBusy || ![Number(preMs), Number(postMs)].every(n => Number.isFinite(n) && n >= 100 && n <= 10000)}
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
    </View><Copy>{Math.round(timeMs)} / {video.session.durationMs === null ? '?' : Math.round(video.session.durationMs)} ms</Copy>
    <Action title={precision ? 'Hide precision controls' : 'Precision controls'} onPress={() => setPrecision(!precision)} />{precision && <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Action title={`− ${video.session.fps ? '1 frame*' : '50 ms'}`} disabled={!ready} onPress={() => seek(Math.max(0, secondsToMs(player.currentTime) - step))} />
      <Action title={`+ ${video.session.fps ? '1 frame*' : '50 ms'}`} disabled={!ready} onPress={() => seek(Math.min(video.session.durationMs ?? 0, secondsToMs(player.currentTime) + step))} />
    </View>
    {video.session.fps !== null && <Copy>*Nominal FPS step; variable-rate video and player seeking may differ.</Copy>}
    <TextInput accessibilityLabel="Seek time in milliseconds" style={ui.input} value={seekText} onChangeText={setSeekText} keyboardType="decimal-pad" />
    <Action title="Seek to ms" disabled={!ready} onPress={() => seek(seekText.trim() ? Number(seekText) : NaN)} />
    <Action title="Add selected event at current time" disabled={!ready} onPress={() => control(() => { player.pause(); onMark(secondsToMs(player.currentTime)); })} />
    </>} {!!error && <><Copy>VIDEO COULDN'T LOAD</Copy><Action title="Retry playback" onPress={() => control(() => player.replace(playbackUri(video.session.asset)))} /><Details><Copy>{error}</Copy></Details></>}
  </Panel>;
}

export function VideoAnalysisEditor({ record, initialVideo, onSaved, onClose }: {
  record: TrainingRecord; initialVideo: TrainingVideo; onSaved: (record: TrainingRecord) => void; onClose: () => void;
}) {
  const repo = useRepository(), [video, setVideo] = useState(initialVideo), [saved, setSaved] = useState(() => JSON.stringify(initialVideo));
  const [section, setSection] = useState('TIMELINE'), [confirmClose, setConfirmClose] = useState(false);
  const [eventSheet, setEventSheet] = useState(false);
  const [failures, setFailures] = useState<Record<string, boolean>>({});
  const [reviewOpen, setReviewOpen] = useState(false), [contributed, setContributed] = useState(false);
  useEffect(() => { let active = true; void repo.loadProfile().then(p => { if (active) setContributed((p.performanceObservations ?? []).some(o => o.source === 'VIDEO_ANALYSIS' && o.videoId === initialVideo.session.id)); }).catch(() => {}); return () => { active = false; }; }, [repo, initialVideo.session.id]);
  const operation = useRef(new OperationGate());
  const pendingAssets = useRef<TrainingVideo['session']['asset'][]>([]);
  const savingAsset = useRef(false);
  const discardPendingAssets = () => {
    for (const asset of pendingAssets.current) { try { discardVideoAsset(asset); } catch { /* Keep annotations usable if cleanup fails. */ } }
    pendingAssets.current = [];
  };
  const [available, setAvailable] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const fail = (error: unknown) => { setMessageError(true); setMessage(String(error)); };
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
    if (closeJob.current || poseJob.current || audioJob.current || operation.current.busy) return;
    const controller = new AbortController(); closeJob.current = controller; setAnalyzingClose(true); setFailures(previous => ({ ...previous, 'CLOSE-UP': false }));
    try {
      const extraction = await extractCloseUp(video.session, selection, uuid.v4(), controller.signal, p => {
        if (closeJob.current === controller) setCloseMessage('Analyzing close-up locally...');
      });
      if (controller.signal.aborted || closeJob.current !== controller) return;
      const previous = currentVideo.current;
      const run = detectCloseUp(extraction, selection, previous.analysis.events.filter(e => e.timestampMs <= extraction.durationMs), preMs, postMs);
      const events = mergeCloseDetections(previous.analysis.events, run, previous.session.durationMs);
      setVideo({ ...previous, analysis: analyzeVideo(previous.session, events, previous.analysis.audioRun, previous.analysis.poseRun, run, previous.analysis.fusion) });
      setCloseMessage('Close-up results ready. Review generic CUSTOM suggestions before confirming; save to retain.');
    } catch (error) { if (closeJob.current === controller) { setFailures(previous => ({ ...previous, 'CLOSE-UP': !controller.signal.aborted })); setCloseMessage(String(error)); } }
    finally { if (closeJob.current === controller) { closeJob.current = null; setAnalyzingClose(false); } }
  };
  const currentVideo = useRef(video);
  useEffect(() => { currentVideo.current = video; }, [video]);
  useEffect(() => {
    operation.current.activate();
    const stop = () => { closeJob.current?.abort(); audioJob.current?.abort(); poseJob.current?.abort(); };
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { stop(); closeJob.current = null; audioJob.current = null; poseJob.current = null;
      operation.current.dispose(); subscription.remove(); if (!savingAsset.current) discardPendingAssets(); };
  }, []);
  const runMovement = async () => {
    if (closeJob.current || poseJob.current || audioJob.current || operation.current.busy) return;
    const controller = new AbortController(); poseJob.current = controller;
    setAnalyzingMovement(true); setFailures(previous => ({ ...previous, 'MOVEMENT': false })); setPoseProgress(0); setPoseMessage('Analyzing movement locally...');
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
      if (poseJob.current === controller) { setFailures(previous => ({ ...previous, 'MOVEMENT': !controller.signal.aborted })); setPoseMessage(String(error)); }
    } finally {
      if (poseJob.current === controller) { poseJob.current = null; setAnalyzingMovement(false); }
    }
  };
  const runAudio = async () => {
    if (closeJob.current || audioJob.current || poseJob.current || operation.current.busy) return;
    const controller = new AbortController(); audioJob.current = controller;
    setAnalyzing(true); setFailures(previous => ({ ...previous, 'AUDIO': false })); setAudioMessage('Analyzing audio locally...');
    try {
      const audio = await extractAnalysisAudio(video.session, uuid.v4(), controller.signal, value => {
        if (audioJob.current === controller) setAudioMessage('Analyzing audio locally...');
      });
      if (controller.signal.aborted || audioJob.current !== controller) return;
      setAudioMessage('Processing audio results...');
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
      if (audioJob.current === controller) { setFailures(previous => ({ ...previous, 'AUDIO': !controller.signal.aborted })); setAudioMessage(String(error)); }
    } finally {
      if (audioJob.current === controller) { audioJob.current = null; setAnalyzing(false); }
    }
  };
  const pendingReview = (family: 'AUDIO' | 'BODY_POSE' | 'CLOSE_UP_VISION', source: TimelineEvent['source']) => video.analysis.fusion
    ? video.analysis.fusion.hypotheses.filter(h => h.status === 'SUGGESTED' && h.families.includes(family)).length
    : video.analysis.events.filter(e => !isTrustedEvent(e) && e.source === source).length;
  const serializedVideo = useMemo(() => JSON.stringify(video), [video]);
  const dirty = serializedVideo !== saved;
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
    setVideo({ ...video, session, analysis: analyzeVideo(session, events, video.analysis.audioRun, video.analysis.poseRun, video.analysis.closeRun, fusion) }); setMessageError(false); setMessage('');
  };
  const [eventError, setEventError] = useState('');
  const guard = (fn: () => void) => { try { fn(); } catch (e) { if (eventSheet) setEventError(String(e)); else fail(e); } };
  const metadata = () => ({ ...(target.trim() ? { targetId: target.trim() } : {}), ...(stringId.trim() ? { stringId: stringId.trim() } : {}),
    ...(movementType.trim() ? { movementType: movementType.trim() } : {}), ...(distance.trim() ? { distanceInches: Number(distance) } : {}) });
  const mark = (ms: number) => guard(() => changeEvents(sortEvents([...video.analysis.events, {
    id: uuid.v4(), type, timestampMs: ms, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, metadata: metadata(),
  }], video.session.durationMs)));
  const save = async (contribute = false) => {
    if (audioJob.current || poseJob.current || closeJob.current) return;
    const token = operation.current.begin(); if (token === null) return;
    setBusy(true); savingAsset.current = true;
    try {
      const nextVideo = contribute ? { ...video, session: { ...video.session, analysisStatus: 'REVIEWED' as const } } : video;
      const updated = { ...record, videos: (record.videos ?? []).map(v => v.session.id === nextVideo.session.id ? nextVideo : v) };
      if (contribute) await repo.contributeTrainingVideo(updated, video.session.id); else await repo.saveTraining(updated);
      pendingAssets.current = pendingAssets.current.filter(a => a.uri !== nextVideo.session.asset.uri);
      if (!operation.current.current(token)) { discardPendingAssets(); return; }
      setContributed(contribute); setVideo(nextVideo); setSaved(JSON.stringify(nextVideo)); onSaved(updated);
      setMessageError(false); setMessage(contribute ? `${observations.length} measurements added to your profile.` : 'Analysis saved.');
      return true;
    } catch (e) { if (operation.current.current(token)) fail(e); else discardPendingAssets(); }
    finally { savingAsset.current = false; if (operation.current.current(token)) setBusy(false); operation.current.finish(token); }
  };
  const close = () => { if (operation.current.busy) return; if (dirty) setConfirmClose(true); else onClose(); };
  const relink = async () => {
    if (audioJob.current || poseJob.current || closeJob.current) return;
    const token = operation.current.begin(); if (token === null) return;
    setBusy(true);
    try {
      const asset = await importVideoAsset(uuid.v4());
      if (!operation.current.current(token)) { if (asset) discardVideoAsset(asset); return; }
      if (asset) {
        if (asset.name !== video.session.asset.name || (video.session.asset.size !== undefined && asset.size !== video.session.asset.size)) {
          discardVideoAsset(asset); throw new Error('Choose the same original recording (matching name and size) to preserve annotations.');
        }
        const session = { ...video.session, asset, durationMs: null, fps: null };
        pendingAssets.current.push(asset);
        setVideo({ ...video, session, analysis: analyzeVideo(session, video.analysis.events, video.analysis.audioRun, video.analysis.poseRun, video.analysis.closeRun, video.analysis.fusion) }); setMessageError(false); setMessage('Original video relinked. Save to retain the reference.');
      }
    } catch (e) { if (operation.current.current(token)) fail(e); }
    finally { if (operation.current.current(token)) setBusy(false); operation.current.finish(token); }
  };
  const closePrompt = confirmClose && <Panel><Copy>Save changes before closing?</Copy><Action title="Save changes" variant="primary" disabled={busy || analyzing || analyzingMovement || analyzingClose} onPress={async () => { if (await save()) onClose(); }} /><Action title="Keep editing" onPress={() => setConfirmClose(false)} />
    <Action title="Discard changes and close" variant="destructive" disabled={busy} onPress={() => {
      if (operation.current.busy) return;
      discardPendingAssets(); onClose();
    }} />{messageError && <ErrorState title="Changes could not be saved or applied. Keep editing and try again." detail={message} />}</Panel>;
  return <Modal visible animationType="none" onRequestClose={close}>
    <Screen title="ANALYSIS" header={<SafeAreaView edges={['top']} style={{ backgroundColor: '#0A0A0A' }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 12, gap: 12 }}><Action title="Close analysis" variant="quiet" onPress={close} disabled={busy} /><Action title="Save analysis" variant="primary" disabled={busy || analyzing || analyzingMovement || analyzingClose} onPress={() => save()} /></View></SafeAreaView>}>
      <EditorSheet title="Close analysis" visible={confirmClose} close={() => setConfirmClose(false)}>{closePrompt}</EditorSheet>
      <Text numberOfLines={1} ellipsizeMode="middle" style={ui.copy}>{video.session.asset.name}</Text><Copy>{video.session.context.replaceAll('_', ' ')} / {dirty ? 'UNSAVED' : 'SAVED'}</Copy>
      <Segmented options={['TIMELINE', 'ANALYZE', 'COMPARE', 'RESULTS']} value={section} onChange={setSection} />
      {video.session.asset.storage === 'BROWSER_SESSION' && <Copy>Browser video access lasts for this page session. Annotations are saved; reselect the original file after reloading.</Copy>}
      {available === true && <MediaPlayerBoundary key={video.session.asset.uri}><Player task={section} video={video} preview={preview} onCloseUp={runCloseUp} closeBusy={busy || analyzing || analyzingMovement || analyzingClose} onMetadata={onMetadata} onMark={ms => { if (!busy) mark(ms); }} /></MediaPlayerBoundary>}
      {available === null && <Copy>Checking local video…</Copy>}
      {available === false && <Panel><Copy>ORIGINAL VIDEO MISSING / Saved annotations remain available.</Copy>
        <Action title="Relink original video (keep markers)" onPress={relink} disabled={busy || analyzing || analyzingMovement || analyzingClose} /></Panel>}
      <View style={[{ gap: 16 }, section !== 'ANALYZE' && { display: 'none' }]}><Action title={reviewOpen ? 'Close review' : 'REVIEW SUGGESTIONS'} onPress={() => setReviewOpen(!reviewOpen)} />
      <Panel><Copy>CLOSE-UP</Copy>{Platform.OS !== 'ios' && <Copy>Requires the iOS analysis build.</Copy>}<StatusBadge tone={failures['CLOSE-UP'] ? 'error' : analyzingClose ? 'selected' : pendingReview('CLOSE_UP_VISION', 'VISION_DETECTED') ? 'warning' : video.analysis.closeRun ? 'success' : 'inactive'} label={analyzingClose ? 'RUNNING' : failures['CLOSE-UP'] ? 'ERROR' : video.analysis.closeRun ? pendingReview('CLOSE_UP_VISION', 'VISION_DETECTED') ? 'NEEDS REVIEW' : 'COMPLETE' : 'NOT RUN'} />{failures['CLOSE-UP'] && <Notice tone="error">Close-up analysis failed. Try again.</Notice>}{!!closeMessage && <Details><Copy>{closeMessage}</Copy></Details>}</Panel>
      {analyzingClose && <Action title="Cancel close-up analysis" onPress={() => closeJob.current?.abort()} />}
      {video.analysis.closeRun && <CloseUpReview run={video.analysis.closeRun} />}
      <Panel>{failures.AUDIO && <Copy>AUDIO ANALYSIS FAILED / TRY AGAIN</Copy>}<Copy>AUDIO</Copy><StatusBadge tone={failures.AUDIO ? 'error' : analyzing ? 'selected' : pendingReview('AUDIO', 'AUDIO_DETECTED') ? 'warning' : video.analysis.audioRun ? 'success' : 'inactive'} label={analyzing ? 'RUNNING' : failures['AUDIO'] ? 'ERROR' : video.analysis.audioRun ? pendingReview('AUDIO', 'AUDIO_DETECTED') ? 'NEEDS REVIEW' : 'COMPLETE' : 'NOT RUN'} />{Platform.OS !== 'ios' && <Copy>Requires the iOS analysis build.</Copy>}
        <Action title={analyzing ? 'ANALYZING AUDIO...' : video.analysis.audioRun ? 'RE-ANALYZE AUDIO' : 'ANALYZE AUDIO'} disabled={busy || analyzing || analyzingMovement || analyzingClose || available !== true} onPress={runAudio} />
        {analyzing && <Action title="Cancel audio analysis" onPress={() => { audioJob.current?.abort(); setAudioMessage('Cancelling audio analysis...'); }} />}
        {!!audioMessage && <Details><Copy>{audioMessage}</Copy></Details>}
        <Copy>Suggestions require review. Audio may come from other shooters or impacts. Dry fire may produce only a beep.</Copy>
        {video.analysis.audioRun && <><Action title="REVIEW AUDIO" onPress={() => setReviewOpen(true)} />
          <Copy>{pendingReview('AUDIO', 'AUDIO_DETECTED')} suggestions need review</Copy><Copy>{video.analysis.audioRun.candidates.length} suggestions · {video.analysis.audioRun.matches.length} matched markers</Copy>
          {video.analysis.audioRun.warnings.map(w => <Copy key={w}>{w}</Copy>)}
        </>}
      </Panel>
      <Panel>{failures.MOVEMENT && <Copy>MOVEMENT ANALYSIS FAILED / TRY AGAIN</Copy>}<Copy>MOVEMENT</Copy><StatusBadge tone={failures.MOVEMENT ? 'error' : analyzingMovement ? 'selected' : pendingReview('BODY_POSE', 'POSE_DETECTED') ? 'warning' : video.analysis.poseRun ? 'success' : 'inactive'} label={analyzingMovement ? 'RUNNING' : failures['MOVEMENT'] ? 'ERROR' : video.analysis.poseRun ? pendingReview('BODY_POSE', 'POSE_DETECTED') ? 'NEEDS REVIEW' : 'COMPLETE' : 'NOT RUN'} />{Platform.OS !== 'ios' && <Copy>Requires the iOS analysis build.</Copy>}
        <Action title={analyzingMovement ? 'ANALYZING MOVEMENT...' : 'ANALYZE MOVEMENT'}
          disabled={busy || analyzing || analyzingMovement || analyzingClose || available !== true} onPress={runMovement} />
        {analyzingMovement && <Action title="Cancel movement analysis" onPress={() => { poseJob.current?.abort(); setPoseMessage('Cancelling movement analysis...'); }} />}
        {!!poseMessage && <Details><Copy>{poseMessage}</Copy></Details>}
        <Copy>Review body visibility and camera movement. Video displacement is not physical distance. Position events do not identify stage locations.</Copy>
        {video.analysis.poseRun && <><Action title="REVIEW MOVEMENT" onPress={() => setReviewOpen(true)} />
          <Copy>{pendingReview('BODY_POSE', 'POSE_DETECTED')} suggestions need review</Copy><Copy>{video.analysis.poseRun.segments.length} motion phases detected</Copy><Details><Copy>{video.analysis.poseRun.sampleCount} sampled frames · {video.analysis.poseRun.missingCount} unusable · {video.analysis.poseRun.matches.length} matched existing markers</Copy>
          {video.analysis.poseRun.warnings.map(w => <Copy key={w}>{w}</Copy>)}
          {video.analysis.poseRun.armPhases.map(p => <Copy key={p.stimulusId}>Gross arm motion: {p.onsetMs.toFixed(0)} ms; stabilization: {p.stabilizationMs?.toFixed(0) ?? 'not observed'} ms. This does not identify hand-on-gun or draw completion.</Copy>)}</Details>
        </>}
      </Panel>
      </View>
      <View style={[{ gap: 16 }, section !== 'TIMELINE' && !(section === 'ANALYZE' && reviewOpen) && { display: 'none' }]}>
      <Action title="+ Add event" variant="primary" onPress={() => { setEventError(''); setEditingId(null); setEventSheet(true); }} />
      <EditorSheet title={editingId ? 'Edit Event' : 'Add Event'} visible={eventSheet} close={() => setEventSheet(false)}><Panel>
        <Copy>{editingId ? 'EDIT EVENT' : 'NEW EVENT'}</Copy>
        {!!eventError && <Notice tone="error">{eventError}</Notice>}
        <Copy>Type</Copy><Action title={`Event type: ${type.replaceAll('_', ' ')}`} onPress={() => setShowTypes(!showTypes)} disabled={busy} />
        {showTypes && eventTypes.map(value => <Action key={value} title={value.replaceAll('_', ' ')} onPress={() => { setType(value); setShowTypes(false); }} />)}
        <Copy>Timestamp (ms)</Copy><TextInput style={ui.input} accessibilityLabel="Marker milliseconds" value={timestamp} onChangeText={setTimestamp} keyboardType="decimal-pad" placeholder="Time in ms" placeholderTextColor="#888" />
        {(type === 'SHOT' || type === 'FIRST_SHOT') && <><TextInput style={ui.input} accessibilityLabel="Target label" value={target} onChangeText={setTarget} placeholder="Target label (optional)" placeholderTextColor="#888" />
        <TextInput style={ui.input} accessibilityLabel="Same-target string label" value={stringId} onChangeText={setStringId} placeholder="Same-target string label (optional)" placeholderTextColor="#888" />
        </>}{(type === 'MOVEMENT_START' || type === 'MOVEMENT_STOP') && <><TextInput style={ui.input} accessibilityLabel="Movement type" value={movementType} onChangeText={setMovementType} placeholder="Movement type (optional)" placeholderTextColor="#888" />
        <TextInput style={ui.input} accessibilityLabel="Known movement distance in inches" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" placeholder="Known movement distance, inches (optional)" placeholderTextColor="#888" />
        </>}<Copy>Use a target/string label only for shots on one target. Distance belongs on MOVEMENT_START and must come from known drill/stage data.</Copy>
        <Action title={editingId ? 'Apply marker edit' : 'Add marker at entered ms'} variant="primary" disabled={busy} onPress={() => guard(() => {
          const ms = timestamp.trim() ? Number(timestamp) : NaN;
          if (editingId) { changeEvents(editEvent(video.analysis.events, editingId, { type, timestampMs: ms,
            metadata: { ...video.analysis.events.find(e => e.id === editingId)?.metadata, targetId: undefined, stringId: undefined,
              movementType: undefined, distanceInches: undefined, ...metadata() } }, video.session.durationMs)); setEditingId(null); }
          else { assertTimeMs(ms, video.session.durationMs); mark(ms); }
          setEventSheet(false);
        })} />
        <Action title="Cancel" onPress={() => setEventSheet(false)} />
      </Panel></EditorSheet>
      <Panel><Copy>TIMELINE · milliseconds from video start</Copy>
        {video.analysis.movementSegments.map(s => <View key={s.id} style={{ gap: 4 }}>
          <Copy>MOVEMENT · {s.startMs.toFixed(0)}–{s.endMs.toFixed(0)} ms · {s.durationMs.toFixed(0)} ms · {s.confidence}</Copy>
          <View style={{ height: 4, backgroundColor: '#263239' }}><View style={{ height: 4, backgroundColor: '#58c9b9',
            marginLeft: `${100 * s.startMs / Math.max(1, video.session.durationMs ?? s.endMs)}%`,
            width: `${100 * s.durationMs / Math.max(1, video.session.durationMs ?? s.endMs)}%` }} /></View>
        </View>)}
        <Details>{video.analysis.poseRun?.segments.map(s => <View key={s.id} style={{ gap: 4 }}>
          <Copy>LAST POSE RUN · {s.startMs.toFixed(0)}–{s.endMs.toFixed(0)} ms · {s.durationMs.toFixed(0)} ms · {s.confidence}. Current review status is on the markers below.</Copy>
          <View style={{ height: 4, backgroundColor: '#263239' }}><View style={{ height: 4, backgroundColor: '#c498ff',
            marginLeft: `${100 * s.startMs / Math.max(1, video.session.durationMs ?? s.endMs)}%`,
            width: `${100 * s.durationMs / Math.max(1, video.session.durationMs ?? s.endMs)}%` }} /></View>
        </View>)}</Details>
        {!video.analysis.events.length && <Copy>No markers yet. Select an event type, pause at the event, and add it.</Copy>}
        {video.analysis.fusion && <FusionReview fusion={video.analysis.fusion} busy={busy}
          onPreview={ms => setPreview(previous => ({ ms, key: (previous?.key ?? 0) + 1 }))}
          onReview={(id, action, patch) => guard(() => {
            const reviewed = reviewFusedHypothesis(video.analysis.events, video.analysis.fusion!, id, action, patch, video.session.durationMs);
            changeEvents(reviewed.events, reviewed.fusion);
          })} />}
        {video.analysis.events.filter(e => (isTrustedEvent(e) || !video.analysis.fusion?.evidence.some(p => p.timelineEventId === e.id && video.analysis.fusion?.hypotheses.some(h => h.evidenceIds.includes(p.id))))).map(e => <View key={e.id} style={{ gap: 6, borderLeftWidth: 3, paddingLeft: 8,
          borderLeftColor: !e.confirmed && e.source === 'POSE_DETECTED' ? '#c498ff' : e.source === 'AUDIO_DETECTED' && !e.confirmed ? '#eab54d' : '#58c9b9' }}>
          {e.source === 'VISION_DETECTED' && <Copy>{e.metadata?.note ?? 'CLOSE-UP'}{e.confirmed ? '' : ' ? review required'}</Copy>}
          {e.source === 'POSE_DETECTED' && !e.confirmed && <Copy>POSE SUGGESTION · review required</Copy>}
          {e.source === 'AUDIO_DETECTED' && !e.confirmed && <Copy>AUDIO SUGGESTION · review required</Copy>}
          <Copy>{e.type.replaceAll('_', ' ')}</Copy><Copy>{(e.timestampMs / 1000).toFixed(2)} s</Copy><StatusBadge tone={e.source === 'MANUAL' || e.confirmed ? 'success' : 'warning'} label={e.source === 'MANUAL' ? 'MANUAL' : e.confirmed ? 'CONFIRMED' : 'SUGGESTED'} />
          {isTrustedEvent(e) && video.analysis.fusion && <Details><FusionReview fusion={video.analysis.fusion} authoritativeEventId={e.id} busy={busy}
            onPreview={ms => setPreview(previous => ({ ms, key: (previous?.key ?? 0) + 1 }))} onReview={() => {}} /></Details>}
          <Action title={`Preview at ${e.timestampMs.toFixed(2)} ms`} disabled={available !== true} onPress={() => setPreview(previous => ({ ms: e.timestampMs, key: (previous?.key ?? 0) + 1 }))} />
          <Action title="Edit" disabled={busy} onPress={() => { setEventError(''); setEventSheet(true); setEditingId(e.id); setTimestamp(String(e.timestampMs)); setType(e.type);
            setTarget(e.metadata?.targetId ?? ''); setStringId(e.metadata?.stringId ?? ''); setMovementType(e.metadata?.movementType ?? ''); setDistance(e.metadata?.distanceInches?.toString() ?? ''); }} />
          {!e.confirmed && <Action title="Confirm event" disabled={busy} onPress={() => guard(() => changeEvents(confirmEvent(video.analysis.events, e.id)))} />}
          <Action title="Delete event" variant="destructive" disabled={busy} onPress={() => guard(() => { changeEvents(deleteEvent(video.analysis.events, e.id)); if (editingId === e.id) setEditingId(null); })} />
        </View>)}
      </Panel>
      </View>
      <View style={[{ gap: 16 }, section !== 'RESULTS' && { display: 'none' }]}>
      <Panel><Copy>DERIVED MEASUREMENTS</Copy>
        {(['REACTION', 'DRAW', 'SPLITS', 'RELOAD', 'MOVEMENT', 'TARGET TRANSITIONS', 'TOTAL'] as const).map(group => {
          const kinds = { REACTION: ['REACTION'], DRAW: ['DRAW', 'PRESENTATION'], SPLITS: ['SPLIT'], RELOAD: ['MAG_ACCESS', 'RELOAD_MANIPULATION', 'RELOAD', 'POST_RELOAD_SHOT'], MOVEMENT: ['MOVEMENT', 'POSITION_TRANSITION'], 'TARGET TRANSITIONS': ['TARGET_TRANSITION'], TOTAL: ['TOTAL', 'STRING_TIME'] };
          const measurements = video.analysis.measurements.filter(m => kinds[group].includes(m.kind));
          return measurements.length > 0 && <View key={group} style={{ gap: 12 }}><Copy>{group}</Copy>{measurements.map(m => <View key={m.id} style={{ gap: 8 }}><Stat label={measurementLabels[m.kind]} value={m.eligible ? msToSeconds(m.durationMs).toFixed(2) : '\u2014'} unit={m.eligible ? 's' : undefined} />
            {!m.eligible && <><Copy>Endpoints need review</Copy><Details><Copy>Candidate {(m.durationMs / 1000).toFixed(2)} s / {m.confidence}</Copy><Action title="Confirm measurement endpoints" disabled={busy} onPress={() => guard(() => changeEvents(m.eventIds.reduce((events, id) => confirmEvent(events, id), video.analysis.events)))} /></Details></>}
          </View>)}</View>;
        })}
        {!video.analysis.measurements.length && <Copy>Add matching start/end events to derive measurements.</Copy>}
        <Details>{Object.entries(video.analysis.completeness).map(([label, value]) => <Copy key={label}>{label}: {value}</Copy>)}
        <Copy>{video.analysis.movementSegments.length} movement segments · {video.analysis.shotStrings.length} shot strings</Copy>
        </Details>{video.analysis.warnings.map(w => <Copy key={w}>{w}</Copy>)}
      </Panel>
      </View>
      <View style={section !== 'COMPARE' ? { display: 'none' } : undefined}>
      <ExecutionComparisonReview video={video} busy={busy || analyzing || analyzingMovement || analyzingClose}
        onChange={executionComparison => setVideo(previous => ({ ...previous, executionComparison }))}
        onPreview={ms => setPreview(previous => ({ ms, key: (previous?.key ?? 0) + 1 }))} />
      </View>
      <View style={section !== 'RESULTS' ? { display: 'none' } : undefined}>
      <Panel><Copy>PROFILE DATA</Copy><Copy>{observations.length} eligible measurements</Copy><Details>
        <Copy>Compatible timings: stimulus response, holster draw, complete reload, labeled same-target splits, movement with known physical distance. Other intervals remain in the analysis.</Copy>
        <Copy>Contributing activates {video.session.context} calibration. Other contexts stay separate. Repeat contribution replaces these samples.</Copy>
        </Details>{contributed && <Copy>Added to {video.session.context.replaceAll('_', ' ')} profile</Copy>}<Action title={contributed ? 'UPDATE PROFILE DATA' : `Add ${observations.length} eligible measurements to profile`} disabled={busy || analyzing || analyzingMovement || analyzingClose || !observations.length} onPress={() => save(true)} />
      </Panel>
      </View>
      {!!message && (messageError ? <ErrorState title="Video changes could not be saved or applied." detail={message} /> : <Notice tone="success">{message}</Notice>)}
    </Screen>
  </Modal>;
}
