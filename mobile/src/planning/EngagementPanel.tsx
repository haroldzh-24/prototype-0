import { useState } from 'react';
import { activeRuleset } from '../rules/rulesets';
import { View } from 'react-native';
import { Action, Copy, DataRow } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import type { StageRoute } from './route';
import { targetLabel } from './model';
import { analyzeEngagements, reorderEngagement, suggestEngagements } from './engagements';
import { formatYards } from '../stage/measurements';
import EngagementSettings from './EngagementSettings';
import { SEP, targetNameWithType } from '../ui/words';

export default function EngagementPanel({ stage, route, onChange, authoring = true, selectedId }: { stage: StageDocument; route: StageRoute; onChange: (route: StageRoute) => void; authoring?: boolean; selectedId?: string | null }) {
  const [editing, setEditing] = useState(false), [error, setError] = useState('');
  const rules = route.engagementRules, analysis = rules ? analyzeEngagements(stage, route) : null;
  const edit = () => { setEditing(true); setError(''); };
  return <View style={{ gap: 8 }}>
    <Copy>Engagement order and details</Copy>
    {authoring && <Action title={rules ? 'ROUTE SETTINGS' : 'SET UP MOVING ENGAGEMENTS'} onPress={edit} />}
    {editing && <EngagementSettings stage={stage} initial={rules} onCancel={() => setEditing(false)} onApply={value => { onChange({ ...route, engagementRules: value }); setEditing(false); setError(''); }} />}
    {!!error && <Copy>{error}</Copy>}
    {analysis && <>
      <Copy>{activeRuleset(rules!.ruleset) + SEP + 'Circle = engagement. Dashed teal = moving; solid = stationary. Path points shape the path; you only stop where you shoot.'}</Copy>
      <Action title="RECALCULATE ENGAGEMENT ASSIGNMENTS AND ORDER" onPress={() => { onChange(suggestEngagements(stage, route)); setError(''); }} />
      <DataRow label="Standing positions" value={analysis.nodes.filter(n => n.kind === 'stationary').length} />
      <DataRow label="Moving sections" value={new Set(analysis.nodes.filter(n => n.kind === 'moving').map(n => n.waypointId)).size} />
      <DataRow label="Engagement marks" value={analysis.nodes.length} />
      <DataRow label="Targets covered" value={`${analysis.coveredTargetIds.length}/${analysis.alternatives.length}`} />
      <DataRow label="Movement" value={formatYards(analysis.segments.reduce((n, s) => n + s.distance, 0))} />
      {analysis.nodes.filter(n => !selectedId || n.waypointId === selectedId).map((node, index) => <View key={node.id} style={{ gap: 4 }}>
        <Copy>{'ENGAGEMENT ' + (index + 1) + SEP + node.kind.toUpperCase()}</Copy>
        {node.targets.map(t => <View key={t.targetId} style={{ gap: 4 }}>
          <Copy>{t.orderLabel + '. ' + targetNameWithType(stage, t.targetId) + '. ' + t.reason}</Copy>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{([-1, 1] as const).map(direction => <Action key={direction} title={direction < 0 ? 'ENGAGE EARLIER' : 'ENGAGE LATER'} onPress={() => {
            const change = reorderEngagement(stage, route, node.waypointId, t.targetId, direction); setError(change.error ?? ''); if (!change.error) onChange(change.route);
          }} />)}</View>
        </View>)}
      </View>)}
      {analysis.segments.flatMap((s, i) => s.noFiringIntervals.map((range, j) => <Copy key={`${s.id}-${j}`}>SEGMENT {i + 1}: {formatYards(range.start)}–{formatYards(range.end)} — No firing; traversing between shooting areas.</Copy>))}
      {analysis.alternatives.map(a => <Copy key={a.targetId}>{targetLabel(stage, a.targetId)}: {a.stationaryWaypointIds.length && a.movingSegmentIds.length ? 'Moving or stationary possible' : a.movingSegmentIds.length ? 'Moving window available' : a.stationaryWaypointIds.length ? 'Stationary only on this route' : 'No legal engagement found'}</Copy>)}
      {analysis.warnings.map(w => <Copy key={w}>{w}</Copy>)}
      <Copy>Geometry-first estimate: no shooter accuracy penalty or moving-fire time estimate. Ports use their horizontal projection; vertical clearance and competitor body clearance require course review.</Copy>
    </>}
  </View>;
}
