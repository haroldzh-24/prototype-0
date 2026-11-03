import { useState } from 'react';
import { View } from 'react-native';
import { Action, Copy, DataRow, Notice } from '../ui/kit';
import EditorSheet from './EditorSheet';
import type { ManualRouteReview, ReviewedEngagement } from '../planning/manualRouteReview';
import type { StageDocument } from '../stage/model';
import { targetNameWithType } from '../ui/words';
import { formatYards } from '../stage/measurements';
import { SEP } from '../ui/words';

/** REVIEW's panel. Its edits (removing invalid entries) go into the editor's one history: undo is in the header. */
export default function ManualReviewPanel({ review, stage, selectedTargetId, selectedEngagementId, onlyUnassigned, onToggle, onSelectTarget, onHighlight, onRemove, disabled }: {
  review: ManualRouteReview; stage: StageDocument; selectedTargetId: string | null; selectedEngagementId: string | null;
  onlyUnassigned: boolean; onToggle: () => void; onSelectTarget: (id: string | null) => void;
  onHighlight: (entry: ReviewedEngagement) => void; onRemove: (id: string) => void; disabled: boolean;
}) {
  const [sheet, setSheet] = useState<'summary' | 'target' | 'invalid' | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const selected = review.targets.find(t => t.target.id === selectedTargetId);
  const visible = review.targets.filter(t => !onlyUnassigned || !t.assigned);
  const highlight = (entry: ReviewedEngagement) => { onHighlight(entry); setSheet(null); };
  const entryRow = (entry: ReviewedEngagement) => <View key={entry.engagement.id}>
    <Action title={entry.source + (entry.issues.length ? SEP + 'Invalid reference' : '')} disabled={!entry.position} onPress={() => highlight(entry)} />
    {!!entry.issues.length && <Copy>{entry.issues.join('; ')}</Copy>}
  </View>;
  return <View style={{ flex: 1, gap: 4 }}>
    <Copy>Tap overlapping targets again to cycle, or choose a target in Review summary.</Copy>
    <Copy>{review.assignedTargets}/{review.totalTargets} targets assigned. {review.unassignedTargets} unassigned.</Copy>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      <Action title={'SHOW UNASSIGNED ONLY' + SEP + (onlyUnassigned ? 'ON' : 'OFF')} disabled={disabled} onPress={onToggle} />
      <Action title="REVIEW SUMMARY" disabled={disabled} onPress={() => setSheet('summary')} />
      {!!review.invalid.length && <Action title={'INVALID REFERENCES (' + review.invalid.length + ')'} disabled={disabled} onPress={() => setSheet('invalid')} />}
    </View>
    {selected && <View>
      <Copy>{targetNameWithType(stage, selected.target.id)}</Copy>
      <Copy>{(selected.assigned ? 'Assigned' : 'Unassigned') + SEP + selected.engagements.length + ' saved engagements'}</Copy>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}><Action title="TARGET ASSIGNMENTS" disabled={disabled} onPress={() => setSheet('target')} /><Action title="DESELECT TARGET" disabled={disabled} onPress={() => onSelectTarget(null)} /></View>
    </View>}
    <EditorSheet title={sheet === 'summary' ? 'Manual route review' : sheet === 'target' ? 'Target assignments' : 'Invalid references'} visible={sheet !== null} close={() => { setSheet(null); setRemoveId(null); }}>
      {sheet === 'summary' && <>
        <DataRow label="Numbered positions" value={review.waypoints} /><DataRow label="Manual route distance" value={formatYards(review.distance)} />
        <DataRow label="Saved position engagements" value={review.waypointEngagements} /><DataRow label="Saved route engagements" value={review.routeEngagements} />
        <DataRow label="Distinct assigned targets" value={review.assignedTargets} /><DataRow label="Unassigned targets" value={review.unassignedTargets} />
        {!!review.invalid.length && <DataRow label="Invalid references (excluded from coverage)" value={review.invalid.length} />}
        <Notice>Assignment records your manual plan. It does not establish visibility or feasibility.</Notice>
        {!visible.length && <Copy>{review.totalTargets ? 'No unassigned targets.' : 'No eligible targets in this stage.'}</Copy>}
        {visible.map(t => <Action key={t.target.id} title={targetNameWithType(stage, t.target.id) + SEP + (t.assigned ? 'Assigned' : 'Unassigned')} onPress={() => { onSelectTarget(t.target.id); setSheet('target'); }} />)}
      </>}
      {sheet === 'target' && (selected ? <>
        <Copy>{targetNameWithType(stage, selected.target.id) + SEP + 'ID: ' + selected.target.id}</Copy>
        <Copy>{(selected.assigned ? 'Assigned' : 'Unassigned') + SEP + selected.engagements.length + ' saved engagements referencing this target'}</Copy>
        {!selected.engagements.length && <Copy>No saved manual engagements.</Copy>}
        {selected.engagements.map(entryRow)}
        {selectedEngagementId && <Copy>Highlighted engagement: {selectedEngagementId}</Copy>}
      </> : <Copy>This target is no longer in the stage.</Copy>)}
      {sheet === 'invalid' && <>
        {!review.invalid.length && <Copy>No invalid references.</Copy>}
        {review.invalid.map(entry => <View key={entry.engagement.id}>
          <Copy>{'ID: ' + entry.engagement.id + SEP + 'Target ID: ' + entry.engagement.targetId}</Copy>{entryRow(entry)}
          <Action title={'REMOVE INVALID ENTRY ' + entry.engagement.id} variant="destructive" onPress={() => setRemoveId(entry.engagement.id)} />
          {removeId === entry.engagement.id && <><Copy>Remove this saved entry? Undo (top of the editor) can restore it.</Copy><Action title="CANCEL REMOVAL" onPress={() => setRemoveId(null)} /><Action title="CONFIRM REMOVAL" variant="destructive" onPress={() => { onRemove(entry.engagement.id); setRemoveId(null); }} /></>}
        </View>)}
      </>}
    </EditorSheet>
  </View>;
}
