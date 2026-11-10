/**
 * The planner report card: AUTO-PLAN (Route Planner V2) run on real match stages and checked.
 *
 * - Complete: which targets the plan engages, and the planner's reason for each one it can't.
 * - Legal: every stop strictly inside a shooting area, steel no closer than the ruleset's minimum, and the plan,
 *   adopted as an ordinary route, passing the app's ANALYZE engagement check (route adoption and the analysis are a
 *   second path through the code; they share the legality kernel, so this is a consistency check, not a proof).
 * - Fast enough: finished within its time limit and node budget.
 * - Same answer twice: planning is deterministic.
 * Rounds: what the plan would fire (best-N hits on paper, one per steel) against the briefing.
 */
import type { StageDocument } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { planRoute, planToStageRoute, snapshotFromPlan, optionsFromPlan } from '../planning/v2';
import type { RoutePlan } from '../planning/v2';
import { analyzeEngagements } from '../planning/engagements';
import type { FiringArea } from '../planning/engagements';
import { pointInPolygon } from '../planning/firingAreaEditing';
import { STEEL_MIN_INCHES } from '../planning/v2/normalizeStage';
import type { SampleSpec } from './area4';
import { buildSample } from './area4';

export type StageCard = {
  id: string; stage: number; name: string;
  targets: number; covered: number; uncovered: { id: string; reasons: string[] }[];
  positions: number; walkYards: number; status: RoutePlan['status'];
  legal: { insideAreas: boolean; steelDistance: boolean; analyzeAgrees: boolean; notes: string[] };
  rounds: { planned: number; briefing: number; hiddenInDrawing: number };
  durationMs: number; stoppedBy: RoutePlan['diagnostics']['stoppedBy']; exact: boolean; deterministic: boolean;
};

const signature = (p: RoutePlan) => JSON.stringify(p.positions.map(q => [Math.round(q.point.x), Math.round(q.point.y), q.engagements.map(e => e.targetId), q.movingEngagements.map(e => e.targetId)]));

export function gradeStage(spec: SampleSpec, built?: { document: StageDocument; plan: StagePlan; firingAreas: FiringArea[] }): StageCard {
  const { document, plan, firingAreas } = built ?? buildSample(spec);
  const snapshot = snapshotFromPlan(document, plan), options = optionsFromPlan(plan);
  const result = planRoute(snapshot, options), again = planRoute(snapshot, options);
  const targets = document.objects.filter(o => o.type === 'cardboardTarget' || o.type === 'steelPopper' || o.type === 'steelPlate');
  const notes: string[] = [];
  // Stops strictly inside a shooting area.
  const insideAreas = result.positions.every(p => firingAreas.some(a => pointInPolygon(p.point, a.vertices)));
  if (!insideAreas) notes.push('A stop is outside every shooting area.');
  // Steel distance from the stop (or the moving point) that engages it.
  const steelIds = new Set(targets.filter(t => t.type !== 'cardboardTarget').map(t => t.id));
  let steelDistance = true;
  for (const p of result.positions) for (const e of [...p.engagements, ...p.movingEngagements]) {
    if (!steelIds.has(e.targetId)) continue;
    const t = targets.find(o => o.id === e.targetId)!, from = e.moving?.at ?? p.point;
    if (Math.hypot(t.position.x - from.x, t.position.y - from.y) < STEEL_MIN_INCHES.USPSA - 1) { steelDistance = false; notes.push(`${e.targetId} is engaged from closer than 23 ft.`); }
  }
  // The plan as an ordinary route passes ANALYZE: every engaged target is covered there too.
  let analyzeAgrees = true;
  if (result.positions.length) {
    const route = planToStageRoute(result, document, plan), analysis = analyzeEngagements(document, route);
    const engaged = result.positions.flatMap(p => [...p.engagements, ...p.movingEngagements].map(e => e.targetId));
    const missing = engaged.filter(id => !analysis.coveredTargetIds.includes(id));
    if (missing.length || analysis.truncated) { analyzeAgrees = false; notes.push(`ANALYZE doesn't confirm ${missing.join(', ') || 'the route (analysis truncated)'}.`); }
  }
  const covered = result.targets.filter(t => t.status === 'covered');
  const paperShots = spec.briefing.bestHits;
  const planned = covered.reduce((n, t) => n + (steelIds.has(t.targetId) ? 1 : paperShots), 0);
  const hidden = spec.hidden ?? 0;
  return {
    id: spec.id, stage: spec.stage, name: spec.name, targets: targets.length, covered: covered.length,
    uncovered: result.targets.filter(t => t.status !== 'covered').map(t => ({ id: t.targetId, reasons: t.reasons })),
    positions: result.positions.length, walkYards: Math.round(result.movementInches / 36 * 10) / 10, status: result.status,
    legal: { insideAreas, steelDistance, analyzeAgrees, notes },
    rounds: { planned, briefing: spec.briefing.rounds, hiddenInDrawing: hidden },
    durationMs: Math.round(result.diagnostics.durationMs), stoppedBy: result.diagnostics.stoppedBy, exact: result.diagnostics.exactPositions,
    deterministic: signature(result) === signature(again),
  };
}

/** One line per stage, for the docs and the report page. */
export function cardLine(c: StageCard): string {
  const legal = c.legal.insideAreas && c.legal.steelDistance && c.legal.analyzeAgrees ? 'legal' : 'NOT LEGAL: ' + c.legal.notes.join(' ');
  return `Stage ${c.stage}: ${c.covered}/${c.targets} targets from ${c.positions} positions, ${c.walkYards} yd walk, ${legal}, ${c.durationMs} ms${c.stoppedBy ? ` (stopped by ${c.stoppedBy})` : ''}`;
}
