import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Action, Copy, ui } from '../ui/kit';
import { eventTypes } from './videoModel';
import type { EventType } from './videoModel';
import type { FusionResult, FusedHypothesis } from './eventFusion';

const labels = { AUDIO: 'Audio', BODY_POSE: 'Pose', CLOSE_UP_VISION: 'Vision', MANUAL: 'Manual' };
function EvidenceCard({ h, fusion, busy, onPreview, onReview }: {
  h: FusedHypothesis; fusion: FusionResult; busy: boolean; onPreview: (ms: number) => void;
  onReview: (id: string, action: 'CONFIRM' | 'REJECT', patch?: { type: EventType; timestampMs: number }) => void;
}) {
  const [expanded, setExpanded] = useState(false), [editing, setEditing] = useState(false);
  const [type, setType] = useState(h.type), [timestamp, setTimestamp] = useState(String(h.timestampMs));
  const [showTypes, setShowTypes] = useState(false);
  const suggested = h.status === 'SUGGESTED';
  return <View style={{ gap: 6, borderLeftWidth: 3, borderLeftColor: suggested ? '#eab54d' : '#58c9b9', paddingLeft: 8 }}>
    <Copy>{h.status === 'REJECTED' ? 'REJECTED' : h.status === 'CONFIRMED' ? 'CONFIRMED EVENT SUPPORT' : h.evidenceIds.length > 1 ? 'FUSED SUGGESTION' : 'RAW SUGGESTION'} · {h.type} · {(h.timestampMs / 1000).toFixed(3)} s · {h.confidence} · {h.families.map(f => labels[f]).join(' + ')}</Copy>
    <Action title={expanded ? 'Hide evidence' : 'Inspect evidence'} onPress={() => setExpanded(!expanded)} />
    {expanded && <>
      <Copy>Temporal spread: {h.temporalSpreadMs.toFixed(1)} ms. Score: {h.score.toFixed(2)}. {h.explanations.join(' · ')}</Copy>
      <Copy>Types: {h.disagreement.types.join(', ')} · {h.fusionVersion} / config {h.configVersion}</Copy>
      {h.warnings.map(w => <Copy key={w}>{w}</Copy>)}
      {h.evidenceIds.map(id => {
        const e = fusion.evidence.find(p => p.id === id);
        return <Copy key={id}>{e ? `${labels[e.family]} / ${e.source}: ${e.timestampMs.toFixed(2)} ms · ${e.confidence}\n${e.detectorVersion} · run ${e.runId}\n${e.warnings.join(' · ')}\n${JSON.stringify(e.sourceMetadata ?? {})}` : `Unavailable evidence: ${id}`}</Copy>;
      })}
      <Action title="Preview event" onPress={() => onPreview(h.timestampMs)} />
    </>}
    {suggested && <>
      <Action title="Confirm event" disabled={busy} onPress={() => onReview(h.id, 'CONFIRM')} />
      <Action title="Edit type / timestamp" disabled={busy} onPress={() => { setEditing(!editing); setType(h.type); setTimestamp(String(h.timestampMs)); }} />
      {editing && <>
        <Action title={`Event type: ${type}`} onPress={() => setShowTypes(!showTypes)} />
        {showTypes && eventTypes.map(t => <Action key={t} title={t} onPress={() => { setType(t); setShowTypes(false); }} />)}
        <TextInput style={ui.input} accessibilityLabel="Fused event milliseconds" value={timestamp} onChangeText={setTimestamp} keyboardType="decimal-pad" />
        <Action title="Confirm edited event" disabled={busy} onPress={() => onReview(h.id, 'CONFIRM', { type, timestampMs: timestamp.trim() ? Number(timestamp) : NaN })} />
      </>}
      <Action title="Reject suggestion" disabled={busy} onPress={() => onReview(h.id, 'REJECT')} />
    </>}
  </View>;
}
export function FusionReview(props: { fusion: FusionResult; busy: boolean; authoritativeEventId?: string; onPreview: (ms: number) => void;
  onReview: (id: string, action: 'CONFIRM' | 'REJECT', patch?: { type: EventType; timestampMs: number }) => void }) {
  const [showRejected, setShowRejected] = useState(false);
  return <>
    {!props.authoritativeEventId && props.fusion.warnings.map(w => <Copy key={w}>{w}</Copy>)}
    {props.fusion.hypotheses.filter(h => props.authoritativeEventId
      ? h.authoritativeEventId === props.authoritativeEventId && h.evidenceIds.length > 1
      : h.status !== 'CONFIRMED' && (h.status !== 'REJECTED' || showRejected))
      .sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id)).map(h => <EvidenceCard key={h.id} h={h} {...props} />)}
    {!props.authoritativeEventId && props.fusion.hypotheses.some(h => h.status === 'REJECTED') && <Action title={showRejected ? 'Hide rejected evidence' : 'Inspect rejected evidence'} onPress={() => setShowRejected(!showRejected)} />}
  </>;
}
