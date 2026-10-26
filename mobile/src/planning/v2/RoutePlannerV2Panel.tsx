import { useEffect, useRef, useState } from 'react';
import { activeRuleset, idpaOnHold, IDPA_ON_HOLD_NOTE } from '../../rules/rulesets';
import { Action, Copy, DataRow, Loading, Notice, Panel, Segmented } from '../../ui/kit';
import EditorSheet from '../../editor/EditorSheet';
import { meaningfulRoute } from '../../editor/routePresentation';
import type { StageDocument } from '../../stage/model';
import { formatYardsFixed } from '../../stage/measurements';
import { downrangeLabel, stageDownrange } from '../../stage/orientation';
import type { StagePlan } from '../model';
import { targetLabel } from '../model';
import type { PlannerCard } from '../plannerUI';
import { copyPlannerRoute } from '../plannerUI';
import { adoptionLosses } from '../routeSolver/adoption';
import { optionsFromPlan, planRouteAsync, planToStageRoute, snapshotFromPlan } from './index';
import type { ReasonCode, RoutePlan } from './types';

export const reasonText: Record<ReasonCode, string> = {
  NO_ALLOWED_AREA: 'No firing area the stage brief allows for this target.',
  IDPA_AREAS_REQUIRED: 'IDPA: assign this target\'s position(s) of cover in Route settings.',
  PROCEDURE_ORDER: 'Cannot satisfy its "engage after" procedure on this route.',
  STEEL_TOO_CLOSE: 'Every legal spot is closer to this steel than the ruleset allows (a DQ if fired on).',
  OUTSIDE_SAFE_ANGLE: 'From every legal spot, part of the target is past the safe angle.',
  OCCLUDED: 'Hidden by walls, other targets or no-shoots from every legal spot.',
  UNREACHABLE: 'Visible only from spots that cannot be walked to from the start.',
};
const statusText: Record<RoutePlan['status'], string> = {
  complete: 'All targets planned', partial: 'Some targets cannot be engaged', infeasible: 'No legal plan found',
  'no-targets': 'The stage has no scoring targets', 'invalid-input': 'The stage needs setup first',
};

/** Preview card in the shape the stage viewport already knows how to show. */
export function v2PreviewCard(result: RoutePlan, stage: StageDocument, plan: StagePlan): PlannerCard {
  const route = planToStageRoute(result, stage, plan);
  return { number: 1, label: 'Planned route', id: 'route-v2', route, estimatedTime: null, movementDistance: result.movementInches,
    positions: result.positions.length, reloads: 0, movingSegments: null, roundsRemaining: 0, routeStyle: 'GEOMETRY', personalization: null,
    personalizedFallback: false, sourceCounts: { auto: result.positions.length, manual: 0 }, reasons: [], details: [],
    comparison: `${result.targets.filter(t => t.status === 'covered').length}/${result.targets.length} targets planned` };
}

export default function RoutePlannerV2Panel({ stage, plan, preview, onPreview, onClose, onUse, onConfigure }: {
  stage: StageDocument; plan: StagePlan; preview: PlannerCard | null; onPreview: (card: PlannerCard) => void;
  onClose: () => void; onUse: (plan: StagePlan) => void; onConfigure: (section: 'rules' | 'start' | 'areas') => void;
}) {
  const [result, setResult] = useState<RoutePlan | null>(null), [running, setRunning] = useState(false), [confirm, setConfirm] = useState(false), [error, setError] = useState('');
  const rules = plan.route?.engagementRules;
  // Engaging on the move follows the route setting; IDPA is planned standing (cover rules are not modelled).
  const movingAvailable = !!rules && rules.allowMoving !== false && activeRuleset(rules.ruleset) !== 'IDPA';
  const [moving, setMoving] = useState(movingAvailable);
  const abort = useRef<AbortController | null>(null);
  // A stage or route edit invalidates any result or run in progress.
  useEffect(() => { setResult(null); setConfirm(false); return () => { abort.current?.abort(); abort.current = null; }; }, [stage, plan]);
  const snapshot = snapshotFromPlan(stage, plan);
  const label = (id: string) => targetLabel(stage, id);
  async function run() {
    if (abort.current) return;
    const controller = new AbortController(); abort.current = controller;
    setRunning(true); setResult(null); setConfirm(false); setError('');
    try {
      // Runs in short slices on the JS thread so the screen stays responsive and Cancel works.
      const planned = await planRouteAsync(snapshot, { ...optionsFromPlan(plan), moving: moving && movingAvailable }, controller.signal);
      if (!controller.signal.aborted) setResult(planned);
    } catch (e) {
      if (!controller.signal.aborted) setError('Planning failed for this geometry. Review the stage and try again.');
    } finally {
      if (abort.current === controller) { abort.current = null; setRunning(false); }
    }
  }
  const cancel = () => { abort.current?.abort(); abort.current = null; setRunning(false); };
  const card = result && result.positions.length ? v2PreviewCard(result, stage, plan) : null;
  function use(confirmed = false) {
    if (!card) return;
    const next = copyPlannerRoute(plan, card.route, confirmed || !meaningfulRoute(plan.route));
    if (next) onUse(next); else setConfirm(true);
  }
  const losses = card ? adoptionLosses(plan.route, card.route) : null;
  return <EditorSheet title="PLAN ROUTE" visible={!preview} close={onClose}><Panel>
    <Copy>Fewest legal shooting positions, then the shortest walk.</Copy>
    <DataRow label="Firing areas" value={snapshot.firingAreas.length} />
    <DataRow label="Ruleset" value={snapshot.ruleset ?? 'USPSA'} />
    <DataRow label="Downrange" value={downrangeLabel(stageDownrange(stage))} />
    {movingAvailable
      ? <Segmented options={['STANDING ONLY', 'ON THE MOVE']} value={moving ? 'ON THE MOVE' : 'STANDING ONLY'} disabled={running} onChange={v => { setMoving(v === 'ON THE MOVE'); setResult(null); }} />
      : <Copy>{activeRuleset(rules?.ruleset) === 'IDPA' ? 'IDPA plans are standing only: cover is not modelled.' : 'Engaging on the move is off in Route settings.'}</Copy>}
    {idpaOnHold(rules?.ruleset) && <Copy>{IDPA_ON_HOLD_NOTE}</Copy>}
    {!snapshot.firingAreas.length && <Notice>Draw firing areas first: positions are only planned inside them.</Notice>}
    <Action title={snapshot.firingAreas.length ? 'EDIT FIRING AREAS' : 'DRAW FIRING AREAS'} variant={snapshot.firingAreas.length ? undefined : 'primary'} onPress={() => onConfigure('areas')} />
    <Action title="ROUTE SETTINGS" onPress={() => onConfigure('rules')} />
    {running && <><Loading label="Planning route..." /><Action title="CANCEL" onPress={cancel} /></>}
    {!!error && <Notice tone="error">{error}</Notice>}
    {!result && <Action variant="primary" title={running ? 'Planning...' : 'PLAN ROUTE'} disabled={running} onPress={() => { void run(); }} />}
    {result && <>
      <Copy>{statusText[result.status].toUpperCase()}</Copy>
      {result.errors.map(e => <Notice key={e} tone="error">{e}</Notice>)}
      {!!result.positions.length && <>
        <DataRow label="Positions" value={result.positions.length + (result.diagnostics.exactPositions ? ' (minimum)' : '')} />
        <DataRow label="Movement" value={formatYardsFixed(result.movementInches)} />
        {result.positions.map((p, i) => <Copy key={p.id}>{`P${i + 1}: `
          + (p.movingEngagements.length ? 'on the way in ' + p.movingEngagements.map(e => label(e.targetId)).join(', ') + ' · then ' : '')
          + p.engagements.map(e => label(e.targetId) + (e.nearSafeAngle ? ` (${Math.round(e.safeMarginDegrees)}° from limit)` : '') + (e.approachInches ? ` (can start ${formatYardsFixed(e.approachInches)} out)` : '')).join(', ')}</Copy>)}
      </>}
      {result.targets.filter(t => t.status === 'uncovered').map(t => <Notice key={t.targetId}>{label(t.targetId) + ': ' + t.reasons.map(r => reasonText[r]).join(' ')}</Notice>)}
      {result.warnings.map(w => <Notice key={w}>{w}</Notice>)}
      {result.assumptions.map(a => <Copy key={a}>{'Assumption: ' + a}</Copy>)}
      <Copy>{'Checked: ' + result.safety.checked.join(' ')}</Copy>
      <Copy>{'Not checked: ' + result.safety.notChecked.join(' ')}</Copy>
      {card && <>
        {confirm ? <>
          <Copy>Replace your existing route?</Copy>
          {losses && (losses.waypoints || losses.reloads || losses.bends || losses.engageArrows)
            ? <Notice>{`This replaces ${losses.waypoints} waypoint(s), ${losses.reloads} reload(s), ${losses.bends} bend(s) and ${losses.engageArrows} ENGAGE arrow(s).`}</Notice> : null}
          <Action title="Keep route" onPress={() => setConfirm(false)} />
          <Action variant="primary" title="Confirm replacement" onPress={() => use(true)} />
        </> : <Action variant="primary" title="USE ROUTE" onPress={() => use()} />}
        <Action title="VIEW ON STAGE" onPress={() => onPreview(card)} />
      </>}
      <Action title="PLAN AGAIN" onPress={() => setResult(null)} />
    </>}
  </Panel></EditorSheet>;
}
