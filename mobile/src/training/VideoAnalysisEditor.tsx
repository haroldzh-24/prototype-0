import { useCallback, useEffect, useMemo, useState } from 'react';
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

function Player({ video, onMetadata, onMark }: { video: TrainingVideo;
  onMetadata: (durationMs: number, fps: number | null) => void; onMark: (ms: number) => void }) {
  const [timeMs, setTimeMs] = useState(0), [seekText, setSeekText] = useState('0'), [error, setError] = useState('');
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  const player = useVideoPlayer(playbackUri(video.session.asset), p => { p.timeUpdateEventInterval = 0.05; });
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
      assertTimeMs(ms, video.session.durationMs); player.pause(); player.currentTime = msToSeconds(ms);
      setTimeMs(ms); setSeekText(String(Math.round(ms))); setError('');
    } catch (e) { setError(String(e)); }
  };
  const step = video.session.fps ? frameToTime(1, video.session.fps) : 50;
  return <Panel>
    <VideoView player={player} style={{ width: '100%', height: 220 }} nativeControls contentFit="contain" />
    <Copy>{Math.round(timeMs)} / {video.session.durationMs === null ? '?' : Math.round(video.session.durationMs)} ms</Copy>
    <Action title={playing ? 'Pause' : 'Play'} disabled={!ready} onPress={() => playing ? player.pause() : player.play()} />
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
      return { session, analysis: analyzeVideo(session, previous.analysis.events) };
    });
  }, []);
  const observations = useMemo(() => videoObservations(video, record.startingType), [video, record.startingType]);
  const changeEvents = (events: TimelineEvent[]) => {
    const session = { ...video.session, analysisStatus: 'ANNOTATING' as const };
    setVideo({ session, analysis: analyzeVideo(session, events) }); setMessage('');
  };
  const guard = (fn: () => void) => { try { fn(); } catch (e) { setMessage(String(e)); } };
  const metadata = () => ({ ...(target.trim() ? { targetId: target.trim() } : {}), ...(stringId.trim() ? { stringId: stringId.trim() } : {}),
    ...(movementType.trim() ? { movementType: movementType.trim() } : {}), ...(distance.trim() ? { distanceInches: Number(distance) } : {}) });
  const mark = (ms: number) => guard(() => changeEvents(sortEvents([...video.analysis.events, {
    id: uuid.v4(), type, timestampMs: ms, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, metadata: metadata(),
  }], video.session.durationMs)));
  const save = async (contribute = false) => {
    if (busy) return; setBusy(true);
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
        setVideo({ session, analysis: analyzeVideo(session, video.analysis.events) }); setMessage('Original video relinked. Save to retain the reference.');
      }
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={close}>
    <Screen title="VIDEO ANALYSIS">
      <Action title="Close analysis" onPress={close} disabled={busy} />
      <Copy>{video.session.asset.name} · {video.session.context} · {dirty ? 'Unsaved changes' : 'Saved'}</Copy>
      {video.session.asset.storage === 'BROWSER_SESSION' && <Copy>Browser video access lasts for this page session. Annotations are saved; reselect the original file after reloading.</Copy>}
      {available === true && <Player key={video.session.asset.uri} video={video} onMetadata={onMetadata} onMark={ms => { if (!busy) mark(ms); }} />}
      {available === null && <Copy>Checking local video…</Copy>}
      {available === false && <Panel><Copy>Video file unavailable. Saved annotations and measurements are still accessible.</Copy>
        <Action title="Relink original video (keep markers)" onPress={relink} disabled={busy} /></Panel>}
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
          if (editingId) { changeEvents(editEvent(video.analysis.events, editingId, { type, timestampMs: ms, metadata: metadata() }, video.session.durationMs)); setEditingId(null); }
          else mark(ms);
        })} />
        {editingId && <Action title="Cancel marker edit" onPress={() => setEditingId(null)} />}
      </Panel>
      <Panel><Copy>TIMELINE · milliseconds from video start</Copy>
        {!video.analysis.events.length && <Copy>No markers yet. Select an event type, pause at the event, and add it.</Copy>}
        {video.analysis.events.map(e => <View key={e.id} style={{ gap: 6 }}>
          <Copy>{Math.round(e.timestampMs)} ms · {e.type} · {e.source} / {e.confirmed || e.source === 'MANUAL' ? 'Confirmed' : e.confidence}</Copy>
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
      <Panel><Copy>Profile contribution: {observations.length} eligible measurements</Copy>
        <Copy>Compatible timings: holster draw, complete reload, labeled same-target splits, movement with known distance. Other intervals remain in the analysis.</Copy>
        <Copy>Contributing activates {video.session.context} calibration. Other contexts stay separate. Repeat contribution replaces these samples.</Copy>
        <Action title="Save analysis" disabled={busy} onPress={() => save()} />
        <Action title={`Add ${observations.length} eligible measurements to profile`} disabled={busy || !observations.length} onPress={() => save(true)} />
      </Panel>
      {!!message && <Copy>{message}</Copy>}
      {dirty && <Action title="Discard changes and close" disabled={busy} onPress={() => {
        if (video.session.asset.uri !== JSON.parse(saved).session.asset.uri) discardVideoAsset(video.session.asset);
        onClose();
      }} />}
    </Screen>
  </Modal>;
}
