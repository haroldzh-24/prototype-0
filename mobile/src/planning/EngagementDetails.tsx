import { useState } from 'react';
import { View } from 'react-native';
import { Action, Copy, DataRow, Notice } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import type { StageRoute } from './route';
import { analyzeEngagements, reorderEngagement } from './engagements';
import { targetLabel } from './model';
import { formatYards } from '../stage/measurements';

export default function EngagementDetails({ stage, route, nodeId, onChange }: {
  stage: StageDocument; route: StageRoute; nodeId: string | null; onChange: (route: StageRoute) => void;
}) {
  const [editing, setEditing] = useState(false), [error, setError] = useState('');
  const node = analyzeEngagements(stage, route).nodes.find(n => n.id === nodeId);
  if (!node) return <Copy>Select an engagement node or moving window on the canvas.</Copy>;
  const windows = node.targets.flatMap(t => t.window ? [t.window] : []);
  return <View style={{ gap: 8 }}>
    <Copy>{node.kind === 'moving' ? 'MOVING WINDOW' : 'ENGAGEMENT NODE'}</Copy>
    {windows.length > 0 && <DataRow label="Window span" value={formatYards(Math.max(...windows.map(w => w.endDistanceAlongSegment)) - Math.min(...windows.map(w => w.startDistanceAlongSegment)))} />}
    <Copy>TARGETS</Copy>
    {node.targets.map(t => <View key={t.targetId}><Copy>{t.orderLabel} {targetLabel(stage, t.targetId)}</Copy>
      {editing && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{([-1, 1] as const).map(direction => <Action key={direction} title={direction < 0 ? 'Earlier' : 'Later'} onPress={() => {
        const result = reorderEngagement(stage, route, node.waypointId, t.targetId, direction);
        setError(result.error ?? ''); if (!result.error) onChange(result.route);
      }} />)}</View>}
    </View>)}
    <Action title={editing ? 'DONE' : 'EDIT ORDER'} onPress={() => setEditing(!editing)} />
    {!!error && <Notice tone="error">{error}</Notice>}
  </View>;
}
