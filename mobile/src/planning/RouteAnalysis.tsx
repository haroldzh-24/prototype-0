import { useState } from 'react';
import { View } from 'react-native';
import { Action, Copy, DataRow, Panel, Section, Stat, Notice, ui } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from './model';
import { engagementLabel } from './engagements';
import { isEngageable, targetLabel } from './model';
import { evaluateRoute } from './route';
import type { StageRoute } from './route';
import type { PowerFactor, ShooterPerformanceProfile } from '../profile/model';
import { estimatedHitFactor, estimateStagePoints } from './expectedPoints';
import type { TargetEstimate } from './expectedPoints';
import { formatYards } from '../stage/measurements';

function readableWarning(warning: string) {
  return warning
    .replace('Reload references a deleted shooting position.', 'Reload references a deleted waypoint.')
    .replace(': position is outside the stage.', ': waypoint is outside the stage.')
    .replace('reloads at one position', 'reloads at one waypoint')
    .replace(' in Loadout / Planning.', ' in Target Rounds.')
    .replace(/: deleted or non-shootable target .+\.$/, ': a target is missing or cannot be engaged.');
}

const pct = (v: number) => Math.round(v * 100) + '%';
function targetLine(t: TargetEstimate) {
  const where = t.yards !== null ? `${t.yards.toFixed(1)} yd` : 'not in the route';
  if (t.kind === 'steel') return `${where} · 5 pts if it falls` + (t.expectedMakeups !== null ? ` · ${t.expectedMakeups.toFixed(2)} makeup shots expected` : '');
  if (t.expectedPoints === null || !t.odds) return `${where} · no estimate (log runs with hits, or plan AA/AC/CC)`;
  return `${where} · AA ${pct(t.odds.AA)} · AC ${pct(t.odds.AC)} · CC ${pct(t.odds.CC)} · ${t.expectedPoints.toFixed(1)} of ${t.maxPoints} pts`;
}
const sourceText = (t: TargetEstimate) => t.source === 'PLANNED' ? 'planned' : t.source === 'YOUR_NUMBERS' && t.measured
  ? `your numbers, ${t.measured.runs} run${t.measured.runs === 1 ? '' : 's'} at ${t.measured.fromYards.join('–')} yd` : 'no data';

export default function RouteAnalysis({ stage, plan, route, profile, ruleset = 'USPSA', powerFactor = 'minor', edit }: {
  stage: StageDocument; plan: StagePlan; route: StageRoute; profile: ShooterPerformanceProfile | null;
  ruleset?: 'USPSA' | 'PCSL'; powerFactor?: PowerFactor; edit: () => void;
}) {
  const [details, setDetails] = useState(false);
  const result = evaluateRoute(stage, plan, route, profile), analysis = result.engagementAnalysis;
  const points = estimateStagePoints(stage, plan, route, profile, ruleset, powerFactor);
  // A hit factor needs the whole stage: every target routed, with planned rounds, estimated and timed.
  const scoring = stage.objects.filter(isEngageable);
  const unrouted = scoring.filter(t => !route.positions.some(p => p.engagedTargetIds.includes(t.id))).length;
  const unplanned = scoring.filter(t => !((plan.engagements[t.id] ?? 0) > 0)).length;
  const hitFactorBlock = !points.complete ? 'Needs every target estimated' : unrouted ? `${unrouted} target${unrouted === 1 ? ' is' : 's are'} not in the route`
    : unplanned ? `Set planned rounds for ${unplanned} target${unplanned === 1 ? '' : 's'}` : !result.timing ? 'Needs the time estimate' : null;
  const hitFactor = hitFactorBlock ? null : estimatedHitFactor(points, result.timing!.total);
  const covered = analysis?.coveredTargetIds.length ?? new Set(route.positions.flatMap(p => p.engagedTargetIds)).size;
  return <Panel>
    {!!route.manualEngagements?.length && <Notice tone="warning">Manual ENGAGE arrows are not included in these timing, target coverage and ammunition estimates. Use REVIEW to inspect saved manual assignments.</Notice>}
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
    <Copy>POINTS AND HIT FACTOR</Copy>
    <DataRow label="Scoring" value={ruleset === 'USPSA' ? `USPSA ${powerFactor} (A ${points.zoneValues.A}, C ${points.zoneValues.C}, D ${points.zoneValues.D})` : 'PCSL (A 5, C 3, D 1; a T counts as two A)'} />
    {points.targets.map(t => <View key={t.targetId} style={{ gap: 2 }}>
      <DataRow label={`${t.label}${t.kind === 'partial' ? ` (${pct(t.openFraction)} open)` : ''}`} value={targetLine(t)} />
      <Copy>{sourceText(t)}{t.notes.length ? ' · ' + t.notes.join(' ') : ''}</Copy>
    </View>)}
    <DataRow label="Expected points" value={points.complete ? `${points.expectedPoints.toFixed(1)} of ${points.maxPoints} (${pct(points.maxPoints ? points.expectedPoints / points.maxPoints : 0)})`
      : `${points.estimatedTargets} of ${points.targets.length} targets estimated`} />
    <DataRow label="Estimated hit factor" value={hitFactor !== null ? hitFactor.toFixed(2) + (result.warnings.length ? ' (provisional: see warnings)' : '') : hitFactorBlock ?? 'Needs the time estimate'} />
    <Copy>Hit factor = expected points ÷ estimated time. Each hit is treated as landing on its own with your shares at that distance; steel assumes you knock it down. Set planned hits per target in the target's EXPECTED HITS.</Copy>
    <Copy>WARNINGS</Copy>
    {!result.warnings.length && <Copy>No warnings</Copy>}
    {result.warnings.filter(warning => details || !warning.startsWith('Moving engagement is geometry-only')).map((warning, i) => <Notice tone="warning" key={i}>{readableWarning(warning)}</Notice>)}
    <Action title="EDIT ROUTE" onPress={edit} />
  </Panel>;
}
