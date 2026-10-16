import { useState } from 'react';
import { View } from 'react-native';
import { Action, Copy, DataRow, Notice } from '../ui/kit';
import EditorSheet from './EditorSheet';
import type { ManualRouteReview, ReviewedEngagement } from '../planning/manualRouteReview';
import type { StageDocument } from '../stage/model';
import { targetLabel } from '../planning/model';
import { formatYards } from '../stage/measurements';

export default function ManualReviewPanel({ review, stage, selectedTargetId, selectedEngagementId, onlyUnassigned, onToggle, onSelectTarget, onHighlight, onRemove, onUndo, onRedo, canUndo, canRedo, disabled }: {
  review: ManualRouteReview; stage: StageDocument; selectedTargetId: string | null; selectedEngagementId: string | null;
  onlyUnassigned: boolean; onToggle: () => void; onSelectTarget: (id: string | null) => void;
  onHighlight: (entry: ReviewedEngagement) => void; onRemove: (id: string) => void;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; disabled: boolean;
}) {
  const [sheet, setSheet] = useState<'summary' | 'target' | 'invalid' | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const selected = review.targets.find(t => t.target.id === selectedTargetId);
  const visible = review.targets.filter(t => !onlyUnassigned || !t.assigned);
  const highlight = (entry: ReviewedEngagement) => { onHighlight(entry); setSheet(null); };
  const entryRow = (entry: ReviewedEngagement) => <View key={entry.engagement.id}>
    <Action title={entry.source + (entry.issues.length ? ' / Invalid reference' : '')} disabled={!entry.position} onPress={() => highlight(entry)} />
    {!!entry.issues.length && <Copy>{entry.issues.join('; ')}</Copy>}
  </View>;
  return <View style={{ flex: 1, gap: 4 }}>
    <Copy>Tap overlapping targets again to cycle, or choose a target in Review summary.</Copy>
    <Copy>{review.assignedTargets}/{review.totalTargets} targets assigned. {review.unassignedTargets} unassigned.</Copy>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      <Action title={'SHOW UNASSIGNED ONLY ' + (onlyUnassigned ? 'ON' : 'OFF')} disabled={disabled} onPress={onToggle} />
      <Action title="Review summary" disabled={disabled} onPress={() => setSheet('summary')} />
      {!!review.invalid.length && <Action title={'Invalid references (' + review.invalid.length + ')'} disabled={disabled} onPress={() => setSheet('invalid')} />}
    </View>
    {selected && <View>
      <Copy>{targetLabel(stage, selected.target.id)} / {selected.target.id}</Copy>
      <Copy>{selected.assigned ? 'Assigned' : 'Unassigned'} / {selected.engagements.length} saved engagements</Copy>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}><Action title="Target assignments" disabled={disabled} onPress={() => setSheet('target')} /><Action title="Deselect target" disabled={disabled} onPress={() => onSelectTarget(null)} /></View>
    </View>}
    <EditorSheet title={sheet === 'summary' ? 'Manual route review' : sheet === 'target' ? 'Target assignments' : 'Invalid references'} visible={sheet !== null} close={() => { setSheet(null); setRemoveId(null); }}>
      {sheet === 'summary' && <>
        <DataRow label="Numbered waypoints" value={review.waypoints} /><DataRow label="Manual route distance" value={formatYards(review.distance)} />
        <DataRow label="Saved waypoint engagements" value={review.waypointEngagements} /><DataRow label="Saved route engagements" value={review.routeEngagements} />
        <DataRow label="Distinct assigned targets" value={review.assignedTargets} /><DataRow label="Unassigned targets" value={review.unassignedTargets} />
        {!!review.invalid.length && <DataRow label="Invalid references (excluded from coverage)" value={review.invalid.length} />}
        <Notice>Assignment records your manual plan. It does not establish visibility or feasibility.</Notice>
        {!visible.length && <Copy>{review.totalTargets ? 'No unassigned targets.' : 'No eligible targets in this stage.'}</Copy>}
        {visible.map(t => <Action key={t.target.id} title={targetLabel(stage, t.target.id) + (t.assigned ? ' / Assigned' : ' / Unassigned')} onPress={() => { onSelectTarget(t.target.id); setSheet('target'); }} />)}
      </>}
      {sheet === 'target' && (selected ? <>
        <Copy>{targetLabel(stage, selected.target.id)} / ID: {selected.target.id}</Copy>
        <Copy>{selected.assigned ? 'Assigned' : 'Unassigned'} / {selected.engagements.length} saved engagements referencing this target</Copy>
        {!selected.engagements.length && <Copy>No saved manual engagements.</Copy>}
        {selected.engagements.map(entryRow)}
        {selectedEngagementId && <Copy>Highlighted engagement: {selectedEngagementId}</Copy>}
      </> : <Copy>This target is no longer in the stage.</Copy>)}
      {sheet === 'invalid' && <>
        {!review.invalid.length && <Copy>No invalid references.</Copy>}
        {review.invalid.map(entry => <View key={entry.engagement.id}>
          <Copy>ID: {entry.engagement.id} / Target ID: {entry.engagement.targetId}</Copy>{entryRow(entry)}
          <Action title={'Remove invalid entry ' + entry.engagement.id} variant="destructive" onPress={() => setRemoveId(entry.engagement.id)} />
          {removeId === entry.engagement.id && <><Copy>Remove this saved entry? Undo can restore it.</Copy><Action title="Cancel removal" onPress={() => setRemoveId(null)} /><Action title="Confirm removal" variant="destructive" onPress={() => { onRemove(entry.engagement.id); setRemoveId(null); }} /></>}
        </View>)}
      </>}
      <View style={{ flexDirection: 'row', gap: 4 }}><Action title="Undo review edit" disabled={!canUndo || disabled} onPress={onUndo} /><Action title="Redo review edit" disabled={!canRedo || disabled} onPress={onRedo} /></View>
    </EditorSheet>
  </View>;
}
