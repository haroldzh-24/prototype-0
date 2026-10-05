import { useState } from 'react';
import { View } from 'react-native';
import { Action, Copy, DataRow, Panel, Section, Stat, Notice, ui } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from './model';
import { engagementLabel } from './engagements';
import { isEngageable, targetLabel } from './model';
import { evaluateRoute } from './route';
import type { StageRoute } from './route';
import type { ShooterPerformanceProfile } from '../profile/model';
import { formatYards } from '../stage/measurements';

function readableWarning(warning: string) {
  return warning
    .replace('Reload references a deleted shooting position.', 'Reload references a deleted waypoint.')
    .replace(': position is outside the stage.', ': waypoint is outside the stage.')
    .replace('reloads at one position', 'reloads at one waypoint')
    .replace(' in Loadout / Planning.', ' in Target Rounds.')
    .replace(/: deleted or non-shootable target .+\.$/, ': a target is missing or cannot be engaged.');
}

export default function RouteAnalysis({ stage, plan, route, profile, edit }: {
  stage: StageDocument; plan: StagePlan; route: StageRoute; profile: ShooterPerformanceProfile | null; edit: () => void;
}) {
  const [details, setDetails] = useState(false);
  const result = evaluateRoute(stage, plan, route, profile), analysis = result.engagementAnalysis;
  const covered = analysis?.coveredTargetIds.length ?? new Set(route.positions.flatMap(p => p.engagedTargetIds)).size;
  return <Panel>
    <Section title="OVERVIEW"><View style={ui.statGroup}>
    <Stat label="Movement" value={formatYards(result.distance)} />
    <Stat label="Targets" value={`${covered} / ${stage.objects.filter(isEngageable).length}`} />
    <Stat label="Waypoints" value={route.positions.length} />
    <Stat label="Moving windows" value={analysis ? new Set(analysis.nodes.filter(n => n.kind === 'moving').map(n => n.waypointId)).size : 0} />
    </View></Section>
    <Copy>ROUTE</Copy><Copy>START → {route.positions.map((p, i) => `${i + 1} ${p.label}`).join(' → ') || 'No waypoints'}</Copy>
    <Copy>ENGAGEMENTS</Copy>
    {analysis ? analysis.nodes.map((node, i) => <Panel key={node.id}>
      <Copy>Engagement node {i + 1} · {node.kind}</Copy>
      {node.targets.map(t => <Copy key={t.targetId}>{t.orderLabel} {targetLabel(stage, t.targetId)}</Copy>)}
    </Panel>) : route.positions.map((p, i) => <Panel key={p.id}><Copy>Waypoint {i + 1} · {p.label}</Copy>
      {p.engagedTargetIds.map((id, j) => <Copy key={id}>{engagementLabel(j)} {targetLabel(stage, id)}</Copy>)}
    </Panel>)}
    <Copy>AMMUNITION</Copy>
    {result.ammo.map((ammo, i) => <Panel key={ammo.positionId}><Copy>Waypoint {i + 1}</Copy><DataRow label="Available" value={ammo.available} /><DataRow label="Required" value={ammo.required} /><DataRow label="Remaining" value={ammo.remaining} /></Panel>)}
    <DataRow label="Starting" value={result.startingRounds} />
    <DataRow label="Reloads" value={result.magazineChanges} />
    <DataRow label="Remaining" value={result.ammo.at(-1)?.remaining ?? result.startingRounds} />
    <Copy>TIMING</Copy>
    {result.timing ? <><DataRow label={result.warnings.length ? "Provisional total" : "Estimated total"} value={result.timing.total.toFixed(2) + ' s'} />
      <DataRow label="Movement" value={result.timing.movement.toFixed(2) + ' s'} />
      <DataRow label="Draw" value={result.timing.draw.toFixed(2) + ' s'} />
      <DataRow label="Splits" value={result.timing.splits.toFixed(2) + ' s'} />
      <DataRow label="Transitions" value={result.timing.transitions.toFixed(2) + ' s'} />
      <DataRow label="Reloads" value={result.timing.reloads.toFixed(2) + ' s'} /></> : <Copy>{analysis?.nodes.some(n => n.kind === 'moving') ? 'Unavailable' : 'Unavailable with current profile / route inputs'}</Copy>}
    {analysis?.nodes.some(n => n.kind === 'moving') && <><Copy>MOVING-FIRE TIMING</Copy><Copy>Unavailable</Copy><Action title={details ? 'Hide Details' : 'Details'} onPress={() => setDetails(!details)} />{details && <Copy>The current performance model does not estimate firing while moving. Route geometry and target coverage remain available.</Copy>}</>}
    <Copy>WARNINGS</Copy>
    {!result.warnings.length && <Copy>No warnings</Copy>}
    {result.warnings.filter(warning => details || !warning.startsWith('Moving engagement is geometry-only')).map((warning, i) => <Notice tone="warning" key={i}>{readableWarning(warning)}</Notice>)}
    <Action title="EDIT ROUTE" onPress={edit} />
  </Panel>;
}
