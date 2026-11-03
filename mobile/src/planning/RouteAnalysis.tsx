import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Action, Copy, DataRow, Panel, Stat, Notice, ui } from '../ui/kit';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from './model';
import { engagementLabel } from './engagements';
import { isEngageable } from './model';
import { evaluateRoute } from './route';
import type { StageRoute } from './route';
import type { PowerFactor, ShooterPerformanceProfile } from '../profile/model';
import { estimatedHitFactor, estimateStagePoints } from './expectedPoints';
import { estimateStageTime } from './stageTime';
import { planReloads } from './reloadPlan';
import type { TargetEstimate } from './expectedPoints';
import { formatYardsFixed, yardsToInches } from '../stage/measurements';
import { buildPersonalizedModel } from '../profile/personalizedPerformance';
import { positionName, positionNameWithNote, positionTitle, positionTitleWithNote, SEP, targetNameWithType, targetTypeName } from '../ui/words';
import { migrateManualEngagements } from './assignments';
import { REQUIRED_HITS_SOURCE, withPlanDefaults } from './planDefaults';
import { pointsSource, reviewTargets, timeSource, whatsMissing } from './planStatus';

function readableWarning(warning: string) {
  return warning
    .replace('Reload references a deleted shooting position.', 'Reload references a deleted position.')
    .replace(/: deleted or non-shootable target .+\.$/, ': a target is missing or cannot be engaged.');
}

const pct = (v: number) => Math.round(v * 100) + '%';
function targetLine(t: TargetEstimate) {
  const where = t.yards !== null ? formatYardsFixed(yardsToInches(t.yards), 1) : 'not in the route';
  if (t.kind === 'steel') return `${where} · 5 pts if it falls` + (t.expectedMakeups !== null ? ` · ${t.expectedMakeups.toFixed(2)} makeup shots expected` : '');
  if (t.expectedPoints === null || !t.odds) return `${where} · no estimate (log runs with hits, or plan AA/AC/CC)`;
  return `${where} · AA ${pct(t.odds.AA)} · AC ${pct(t.odds.AC)} · CC ${pct(t.odds.CC)} · ${t.expectedPoints.toFixed(1)} of ${t.maxPoints} pts`
    + (t.noShootPenalty > 0 ? ` (no-shoots −${t.noShootPenalty.toFixed(1)})` : '');
}
const sourceText = (t: TargetEstimate) => t.source === 'PLANNED' ? 'planned' : t.source === 'YOUR_NUMBERS' && t.measured
  ? `your numbers, ${t.measured.runs} run${t.measured.runs === 1 ? '' : 's'} at ${t.measured.fromYards.join('–')} yd` : 'no data';
const sec = (v: number) => v.toFixed(2) + ' s';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * ANALYZE: the answer first (time, hit factor, what's missing, where the numbers come from), then the details folded:
 * targets (REVIEW's ✓ / ! marks), route, ammunition, time, points, warnings. It reads the one engagement model
 * (saved ENGAGE arrows folded in) and the planning defaults (rule rounds, profile loadout) without writing them.
 */
export default function RouteAnalysis({ stage, plan, route: savedRoute, profile, ruleset = 'USPSA', powerFactor = 'minor', edit, onRouteChange, onPlanChange }: {
  stage: StageDocument; plan: StagePlan; route: StageRoute; profile: ShooterPerformanceProfile | null;
  ruleset?: 'USPSA' | 'PCSL'; powerFactor?: PowerFactor; edit: () => void;
  /** Lets ANALYZE apply planned reloads to the route (used when the loadout is your own). */
  onRouteChange?: (route: StageRoute) => void;
  /** Lets ANALYZE apply planned reloads together with the profile loadout they use. Preferred over onRouteChange. */
  onPlanChange?: (plan: StagePlan) => void;
}) {
  const [details, setDetails] = useState(false), [reloadNote, setReloadNote] = useState<{ text: string; ok: boolean; reloads: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({}), [timeDetails, setTimeDetails] = useState(false);
  const route = migrateManualEngagements(stage, savedRoute);
  // Defaults for the route shown (its spare magazines are counted for these positions).
  const defaults = withPlanDefaults(stage, { ...plan, route }, profile), effective: StagePlan = { ...defaults.plan, route };
  const result = evaluateRoute(stage, effective, route, profile), analysis = result.engagementAnalysis;
  const points = estimateStagePoints(stage, effective, route, profile, ruleset, powerFactor);
  const time = estimateStageTime(stage, effective, route, profile, result);
  const review = reviewTargets(stage, route, analysis);
  const missing = whatsMissing({ stage, plan: effective, route, evaluation: result, review, time, points });
  // A hit factor needs the whole stage: every target routed, with planned rounds, estimated and timed.
  const scoring = stage.objects.filter(isEngageable);
  const unrouted = review.total - review.engaged;
  const unplanned = scoring.filter(t => !((effective.engagements[t.id] ?? 0) > 0)).length;
  const hitFactorBlock = unrouted ? `${unrouted} target${unrouted === 1 ? ' is' : 's are'} not in the route`
    : unplanned ? `Set planned rounds for ${plural(unplanned, 'target')}` : !points.complete ? 'Needs every target estimated'
    : !result.timing ? 'Needs the time estimate' : null;
  const hitFactor = hitFactorBlock || !time.available ? null : estimatedHitFactor(points, time.total);
  // Fewer rounds than required hits, route warnings, or generic timing values make the number provisional.
  const short = scoring.filter(t => (effective.engagements[t.id] ?? 0) > 0 && t.type === 'cardboardTarget' && effective.engagements[t.id] < 2).length;
  const generic = profile ? buildPersonalizedModel(profile).fallback.filter(f => f !== 'Shooting difficulty') : [];
  const provisional = [result.warnings.length ? 'route warnings' : '', short ? `${short} paper target${short === 1 ? '' : 's'} with fewer than 2 rounds` : '',
    generic.length ? `generic ${generic.join(', ').toLowerCase()} time${generic.length === 1 ? '' : 's'}` : ''].filter(Boolean);
  const moving = analysis ? new Set(analysis.nodes.filter(n => n.kind === 'moving').map(n => n.waypointId)).size : 0;
  // Reloads that use the profile loadout save that loadout with them, so the reloads point at real magazines.
  const canPlanReloads = !!onPlanChange || (!!onRouteChange && !defaults.loadoutNote);
  const fold = (key: string, title: string, summary: string, body: () => ReactNode) => <View key={key} style={{ gap: 12 }}>
    <Action variant="quiet" title={`${open[key] ? '▾' : '▸'} ${title.toUpperCase()}${summary ? SEP + summary.toUpperCase() : ''}`} accessibilityLabel={`${open[key] ? 'Hide' : 'Show'} ${title.toLowerCase()}`}
      onPress={() => setOpen(o => ({ ...o, [key]: !o[key] }))} />
    {open[key] && body()}
  </View>;
  return <Panel>
    <View style={ui.statGroup}>
      <Stat label={time.available && result.warnings.length ? 'Time (provisional)' : 'Time'} value={time.available ? sec(time.total) : '—'} />
      <Stat label={hitFactor !== null && provisional.length ? 'Hit factor (provisional)' : 'Hit factor'} value={hitFactor !== null ? hitFactor.toFixed(2) : '—'} />
      <Stat label="Targets" value={`${review.engaged}/${review.total}`} />
    </View>
    {time.available && <Copy>{timeSource(profile)}</Copy>}
    {hitFactor !== null && <Copy>{pointsSource(points)}</Copy>}
    {missing.length ? missing.map(line => <Notice key={line} tone="warning">{line}</Notice>) : <Notice tone="success">Nothing missing</Notice>}

    {fold('targets', 'Targets', `${review.engaged}/${review.total} engaged`, () => <>
      {review.targets.map(t => <DataRow key={t.targetId} label={`${t.mark} ${t.name}`} value={t.note} />)}
      <Copy>{review.checked ? 'Checked against your route rules: shooting areas, safe angle, line of sight past walls, targets and no-shoots, steel distance, and stage procedures.'
        : 'Not checked: without a shooting area, ✓ only means a position engages the target. Draw a shooting area to check line of sight and safe angles.'}</Copy>
    </>)}

    {fold('route', 'Route', `${plural(route.positions.length, 'position')} · ${formatYardsFixed(result.distance, 1)}`, () => <>
      <Copy>{['START', ...route.positions.map((_, i) => positionName(i))].join(' → ')}</Copy>
      <DataRow label="Movement" value={formatYardsFixed(result.distance, 1)} />
      <DataRow label="Positions shot on the way in" value={moving} />
      {analysis ? analysis.nodes.map(node => { const at = route.positions.findIndex(p => p.id === node.waypointId);
        return <Panel key={node.id}>
        <Copy>{node.kind === 'moving' ? `Moving${SEP}on the way to ${at >= 0 ? positionTitle(at) : 'the next position'}` : `${at >= 0 ? positionTitle(at) : 'Position'}${SEP}standing`}</Copy>
        {node.targets.map(t => <Copy key={t.targetId}>{t.orderLabel + '. ' + targetNameWithType(stage, t.targetId)}</Copy>)}
      </Panel>; }) : route.positions.map((p, i) => <Panel key={p.id}><Copy>{positionTitleWithNote(i, p.label)}</Copy>
        {p.engagedTargetIds.map((id, j) => <Copy key={id}>{engagementLabel(j) + '. ' + targetNameWithType(stage, id)}</Copy>)}
      </Panel>)}
    </>)}

    {fold('ammo', 'Ammunition', result.magazineChanges ? plural(result.magazineChanges, 'reload') : 'no reloads', () => <>
      {defaults.loadoutNote && <Copy>{defaults.loadoutNote}</Copy>}
      {!!defaults.defaultRoundIds.length && <Copy>{`Rounds for ${plural(defaults.defaultRoundIds.length, 'target')}: the rule default (2 per paper target, 1 per steel; ${REQUIRED_HITS_SOURCE}). Your own numbers replace it.`}</Copy>}
      {result.ammo.map((ammo, i) => <Panel key={ammo.positionId}><Copy>{positionTitle(i)}</Copy><DataRow label="Available" value={ammo.available} /><DataRow label="Required" value={ammo.required} /><DataRow label="Remaining" value={ammo.remaining} /></Panel>)}
      <DataRow label="Starting" value={result.startingRounds} />
      <DataRow label="Reloads" value={result.magazineChanges} />
      <DataRow label="Remaining" value={result.ammo.at(-1)?.remaining ?? result.startingRounds} />
      {route.reloads.map(r => { const at = route.positions.findIndex(p => p.id === r.positionId);
        return at >= 0 && <Copy key={r.positionId}>{`Reload ${(r.mode ?? 'moving') === 'moving' ? 'on the move into' : 'standing at'} ${positionNameWithNote(at, route.positions[at].label)}`}</Copy>; })}
      {canPlanReloads && result.ammo.some(a => !a.sufficient) && <Action title="PLAN RELOADS" accessibilityLabel="Plan reloads around magazine capacity" onPress={() => {
        // Only a plan that carries every position is applied; otherwise the note says what is missing.
        const planned = planReloads(stage, effective, route, profile, result);
        setReloadNote({ text: planned.note, ok: planned.complete, reloads: JSON.stringify(planned.complete ? planned.route.reloads : route.reloads) });
        if (!planned.complete || !planned.added) return;
        if (onPlanChange) onPlanChange({ ...plan, ...(defaults.loadoutNote ? { loadout: effective.loadout } : {}), route: planned.route });
        else onRouteChange?.(planned.route);
      }} />}
      {reloadNote && reloadNote.reloads === JSON.stringify(route.reloads) && <Notice tone={reloadNote.ok ? 'success' : 'warning'}>{reloadNote.text}</Notice>}
    </>)}

    {fold('time', 'Time', time.available ? sec(time.total) : 'not timed', () => <>
      {time.available ? <><DataRow label={result.warnings.length ? 'Provisional total' : 'Estimated total'} value={sec(time.total)} />
        <DataRow label="Movement" value={sec(time.movement)} />
        <DataRow label="Draw" value={sec(time.draw)} />
        <DataRow label="Splits" value={sec(time.splits)} />
        <DataRow label="Transitions" value={sec(time.transitions)} />
        {time.makeups > 0 && <DataRow label="Steel makeups" value={sec(time.makeups)} />}
        <DataRow label="Reloads" value={sec(time.reloads)} />
        <Copy>{timeSource(profile)}</Copy>
        {time.sources.map((line, i) => <Copy key={i}>{line}</Copy>)}
        <Action title={timeDetails ? 'HIDE TIME BY POSITION' : 'TIME BY POSITION'} onPress={() => setTimeDetails(!timeDetails)} />
        {timeDetails && time.draw > 0 && <DataRow label="Draw (start)" value={sec(time.draw)} />}
        {timeDetails && time.positions.map(p => <View key={p.positionId} style={{ gap: 2 }}>
          <DataRow label={p.label} value={sec(p.seconds)} />
          <Copy>{[p.arrival > 0 ? `move ${sec(p.arrival)}` : '', p.reload > 0 ? `reload ${sec(p.reload)}` : '',
            ...p.targets.map(t => `${t.label} ${formatYardsFixed(yardsToInches(t.yards), 1)}: ` + [t.transition ? `transition ${sec(t.transition.seconds)} (${Math.round(t.transition.degrees)}°)` : '',
              t.splits ? `${t.splits} × ${sec(t.secondsPerSplit)} split${t.splitSource === 'SINGLE' ? ' (single value)' : ''}` : '',
              t.makeups > 0 ? `${t.makeups.toFixed(2)} makeups` : ''].filter(Boolean).join(', ')).filter(Boolean)].filter(Boolean).join(' · ')}</Copy>
        </View>)}</> : <Copy>{time.reason}</Copy>}
      {analysis?.nodes.some(n => n.kind === 'moving') && <><Copy>MOVING-FIRE TIMING</Copy><Copy>Unavailable</Copy><Action title={details ? 'HIDE DETAILS' : 'DETAILS'} onPress={() => setDetails(!details)} />{details && <Copy>The current performance model does not estimate firing while moving. Route geometry and target coverage remain available.</Copy>}</>}
    </>)}

    {fold('points', 'Points and hit factor', hitFactor !== null ? hitFactor.toFixed(2) : 'not estimated', () => <>
      <DataRow label="Scoring" value={ruleset === 'USPSA' ? `USPSA ${powerFactor} (A ${points.zoneValues.A}, C ${points.zoneValues.C}, D ${points.zoneValues.D})` : 'PCSL (A 5, C 3, D 1; a T counts as two A)'} />
      {points.targets.map(t => <View key={t.targetId} style={{ gap: 2 }}>
        <DataRow label={`${t.label}${SEP}${targetTypeName(stage.objects.find(o => o.id === t.targetId)?.type ?? 'cardboardTarget')}${t.cutFace ? ' (cut face)' : t.kind === 'partial' ? ` (${pct(t.openFraction)} open)` : ''}`} value={targetLine(t)} />
        <Copy>{sourceText(t)}{t.notes.length ? ' · ' + t.notes.join(' ') : ''}</Copy>
      </View>)}
      <DataRow label="Expected points" value={points.complete ? `${points.expectedPoints.toFixed(1)} of ${points.maxPoints} (${pct(points.maxPoints ? points.expectedPoints / points.maxPoints : 0)})`
        : `${points.estimatedTargets} of ${points.targets.length} targets estimated`} />
      <DataRow label="Estimated hit factor" value={hitFactor !== null ? hitFactor.toFixed(2) + (provisional.length ? ' (provisional)' : '') : hitFactorBlock ?? 'Needs the time estimate'} />
      {hitFactor !== null && provisional.length > 0 && <Copy>{'Provisional: ' + provisional.join('; ') + '.'}</Copy>}
      <Copy>Hit factor = expected points ÷ estimated time. Set planned hits per target in the target's EXPECTED HITS.</Copy>
      <Copy>Not modelled yet: hits are treated as independent (no streaks, no pushing harder); hits on the move use your standing numbers; no-shoot hits only on hostage targets with partial-target runs; awkward positions (ports, leans) and start positions other than hands at sides add no time.</Copy>
    </>)}

    {fold('warnings', 'Warnings', String(result.warnings.length), () => <>
      {!result.warnings.length && <Copy>No warnings</Copy>}
      {result.warnings.filter(warning => details || !warning.startsWith('Moving engagement is geometry-only')).map((warning, i) => <Notice tone="warning" key={i}>{readableWarning(warning)}</Notice>)}
    </>)}
    <Action title="EDIT ROUTE" onPress={edit} />
  </Panel>;
}
