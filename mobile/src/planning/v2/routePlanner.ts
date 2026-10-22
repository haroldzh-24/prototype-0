import { candidatePositions } from './candidatePositions';
import { checkEngagement, headingDelta, headingTo } from './coverage';
import type { EngagementCheck } from './coverage';
import { normalizeStage } from './normalizeStage';
import { greedyWalk, minimumCover, representatives, shortestCoveringWalk } from './optimizeRoute';
import type { CoverageCandidate } from './optimizeRoute';
import { createTravelGraph } from './travelGraph';
import type { PlanRouteOptions, PlannedEngagement, PlannedPosition, Point, ReasonCode, RoutePlan, StageSnapshot, TargetReport } from './types';

export const PLANNER_VERSION = '2.0.0';

const NOT_CHECKED = [
  'Muzzle direction while moving, reloading or drawing (shooter technique, not stage geometry).',
  'Vertical angles, shots over berms, and port or target elevation relative to the shooter\'s eyes.',
  'Stage-specific muzzle safe points, exclusion zones, activated, moving or disappearing targets.',
  'Round-count limits per position.',
];
const IDPA_NOT_CHECKED = ['IDPA cover use, tactical priority and one fault line per position of cover (near-to-far order is an approximation).'];

function emptyPlan(status: RoutePlan['status'], errors: string[], downrange = 270, half = 90): RoutePlan {
  return { version: 2, status, start: null, positions: [], legs: [], movementInches: 0, targets: [],
    safety: { downrangeDegrees: downrange, safeHalfAngleDegrees: half, checked: [], notChecked: NOT_CHECKED, nearSafeAngle: [] },
    assumptions: [], warnings: [], errors,
    diagnostics: { candidateCount: 0, distinctCoverageSets: 0, minimumPositions: null, exactPositions: false, exactDistance: false, searchNodes: 0, durationMs: 0, truncatedCandidates: false } };
}

/**
 * Route Planner V2 entry point. Deterministic: one plan with the fewest shooting positions, then the shortest walk,
 * engaging every target that can be engaged legally, with explicit reasons for any that cannot.
 * See docs/route-planner-v2.md for the rules applied and what is not checked.
 */
export function planRoute(snapshot: StageSnapshot, options: PlanRouteOptions = {}): RoutePlan {
  const steps = planSteps(snapshot, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * Same plan as planRoute, computed in slices that yield to the event loop about every `sliceMs` so the UI stays
 * responsive and the work can be cancelled. This is cooperative scheduling on the JS thread, not a background thread.
 */
export async function planRouteAsync(snapshot: StageSnapshot, options: PlanRouteOptions = {}, signal?: AbortSignal, sliceMs = 12): Promise<RoutePlan> {
  const steps = planSteps(snapshot, options);
  let step = steps.next(), last = Date.now();
  while (!step.done) {
    if (signal?.aborted) throw new Error('Planning cancelled.');
    if (Date.now() - last >= sliceMs) { await new Promise(resolve => setTimeout(resolve, 0)); last = Date.now(); if (signal?.aborted) throw new Error('Planning cancelled.'); }
    step = steps.next();
  }
  return step.value;
}

function* planSteps(snapshot: StageSnapshot, options: PlanRouteOptions): Generator<void, RoutePlan, void> {
  const started = Date.now();
  const half = options.safeHalfAngleDegrees ?? 90, nearMargin = options.nearSafeAngleMarginDegrees ?? 10;
  const finish = (plan: RoutePlan): RoutePlan => ({ ...plan, diagnostics: { ...plan.diagnostics, durationMs: Date.now() - started } });
  const normalized = normalizeStage(snapshot, options);
  if (!normalized.stage) return finish(emptyPlan('invalid-input', normalized.errors, undefined, half));
  const stage = normalized.stage;
  if (!stage.targets.length) return finish({ ...emptyPlan('no-targets', [], stage.downrangeDegrees, half), start: stage.start });
  const policy = options.noShootPolicy ?? (stage.ruleset === 'IDPA' ? 'warn' : 'occlude');
  const clearance = options.clearanceInches ?? 6;
  const graph = createTravelGraph(snapshot.stage, stage, { clearanceInches: clearance, travel: options.travel ?? 'anywhere', targetsBlockTravel: options.targetsBlockTravel ?? true });
  if (!graph.traversable(stage.start)) return finish({ ...emptyPlan('invalid-input', ['The start position is outside the stage or inside a wall or target stand.'], stage.downrangeDegrees, half), start: stage.start });

  // 2-3. Candidates and their legal engagements.
  const { candidates, truncated } = candidatePositions(stage, options.candidateSpacingInches ?? 12, options.maxCandidates ?? 1500, graph.traversable, clearance);
  const checks = new Map<string, Map<string, EngagementCheck>>();
  const failures = new Map<string, Set<ReasonCode>>(stage.targets.map(t => [t.id, new Set<ReasonCode>()]));
  const legalCount = new Map<string, number>(stage.targets.map(t => [t.id, 0]));
  const reachable = candidates.filter(c => graph.connected(stage.start, c.point));
  const reachableIds = new Set(reachable.map(c => c.id));
  const bit = new Map(stage.targets.map((t, i) => [t.id, 1n << BigInt(i)]));
  const coverage: CoverageCandidate[] = [];
  for (const c of candidates) {
    yield; // one candidate's checks per slice step
    const row = new Map<string, EngagementCheck>(); let mask = 0n;
    for (const t of stage.targets) {
      const check = checkEngagement(c.point, t, stage, half, policy);
      row.set(t.id, check);
      if (!check.legal) { failures.get(t.id)!.add(check.failure!); continue; }
      legalCount.set(t.id, legalCount.get(t.id)! + 1);
      if (reachableIds.has(c.id)) mask |= bit.get(t.id)!;
    }
    checks.set(c.id, row);
    if (mask) coverage.push({ id: c.id, point: c.point, mask });
  }
  const coverable = coverage.reduce((m, c) => m | c.mask, 0n);
  const reasonFor = (targetId: string): ReasonCode[] => {
    if ((legalCount.get(targetId) ?? 0) > 0) return ['UNREACHABLE'];
    const seen = failures.get(targetId)!;
    // Report the furthest stage a candidate reached: area -> safe angle -> line of sight.
    if (seen.has('OCCLUDED')) return ['OCCLUDED'];
    if (seen.has('OUTSIDE_SAFE_ANGLE')) return ['OUTSIDE_SAFE_ANGLE'];
    return ['NO_ALLOWED_AREA'];
  };
  const uncoveredReports: TargetReport[] = stage.targets.filter(t => !(coverable & bit.get(t.id)!))
    .map(t => ({ targetId: t.id, status: 'uncovered', reasons: reasonFor(t.id), legalCandidateCount: legalCount.get(t.id) ?? 0 }));
  const base = {
    version: 2 as const, start: stage.start, errors: [],
    safety: { downrangeDegrees: stage.downrangeDegrees, safeHalfAngleDegrees: half,
      checked: [`Every sampled point of each engaged target face is within ±${half}° of downrange (${stage.downrangeDegrees}°) from its shooting position.`,
        'Shooting positions are strictly inside a firing area allowed for the target.', 'Line of sight reaches the target face past walls, ports' + (policy === 'occlude' ? ', other target faces and no-shoots.' : '; shots passing a non-threat are flagged.')],
      notChecked: stage.ruleset === 'IDPA' ? [...NOT_CHECKED, ...IDPA_NOT_CHECKED] : NOT_CHECKED, nearSafeAngle: [] as RoutePlan['safety']['nearSafeAngle'] },
  };
  const diagnosticsBase = { candidateCount: candidates.length, distinctCoverageSets: new Set(coverage.map(c => c.mask)).size, truncatedCandidates: truncated };
  if (!coverable) return finish({ ...base, status: 'infeasible', positions: [], legs: [], movementInches: 0, targets: uncoveredReports,
    assumptions: [], warnings: ['No target can be engaged legally from a reachable position.'],
    diagnostics: { ...diagnosticsBase, minimumPositions: null, exactPositions: false, exactDistance: false, searchNodes: 0, durationMs: 0 } });

  // 5. Fewest positions, then shortest walk.
  const budget = { nodes: 0, limit: options.maxSearchNodes ?? 200000 };
  const k = minimumCover(coverage.map(c => c.mask), coverable, budget);
  const { pool, reduced } = representatives(coverage, stage.start, options.representativesPerCoverage ?? 4);
  let walk = typeof k === 'number' && Number.isFinite(k)
    ? shortestCoveringWalk(stage.start, pool, coverable, k, graph.distance, options.maxSearchNodes ?? 200000) : null;
  if (!walk || !walk.order.length) walk = greedyWalk(stage.start, pool, coverable, graph.distance);
  const exactPositions = typeof k === 'number' && Number.isFinite(k) && walk.order.length === k;

  // Assign each target to the first stop on the route that can engage it.
  const assess = (point: Point) => new Map(stage.targets.map(t => [t.id, checkEngagement(point, t, stage, half, policy)] as const));
  const stops = walk.order.map(stop => ({ point: stop.point, row: checks.get(stop.id)! }));
  const assignedTo: string[][] = stops.map(() => []);
  const taken = new Set<string>();
  stops.forEach((stop, i) => { for (const t of stage.targets) if ((coverable & bit.get(t.id)!) && !taken.has(t.id) && stop.row.get(t.id)?.legal) { taken.add(t.id); assignedTo[i].push(t.id); } });

  // Local refinement below grid resolution: slide each stop toward its neighbours while it still legally engages its
  // assigned targets and the walk gets shorter. Only ever shortens the walk.
  const before = walk.distance;
  const legFrom = (i: number) => (i === 0 ? stage.start : stops[i - 1].point);
  const localCost = (i: number, p: Point) => graph.distance(legFrom(i), p) + (i + 1 < stops.length ? graph.distance(p, stops[i + 1].point) : 0);
  const keepsAssignments = (i: number, p: Point) => graph.traversable(p) && graph.connected(legFrom(i), p)
    && assignedTo[i].every(id => checkEngagement(p, stage.targets.find(t => t.id === id)!, stage, half, policy).legal);
  for (let round = 0; round < 4; round++) {
    let improved = false;
    for (let i = 0; i < stops.length; i++) {
      yield;
      const prev = legFrom(i), next = i + 1 < stops.length ? stops[i + 1].point : null;
      const goals = next ? [prev, next, { x: (prev.x + next.x) / 2, y: (prev.y + next.y) / 2 }] : [prev];
      for (const goal of goals) {
        const from = stops[i].point, current = localCost(i, from);
        // Binary search for the farthest legal point toward the goal, then keep it only if it is cheaper.
        let lo = 0, hi = 1, best: Point | null = null;
        for (let it = 0; it < 12; it++) {
          const t = (lo + hi) / 2, p = { x: from.x + (goal.x - from.x) * t, y: from.y + (goal.y - from.y) * t };
          if (keepsAssignments(i, p)) { lo = t; best = p; } else hi = t;
        }
        if (best && localCost(i, best) < current - 1e-6) { stops[i] = { point: best, row: assess(best) }; improved = true; }
      }
    }
    if (!improved) break;
  }
  const movementInches = stops.reduce((sum, stop, i) => sum + graph.distance(legFrom(i), stop.point), 0);

  // Report each stop with engagements ordered across downrange (IDPA: near to far).
  const positions: PlannedPosition[] = [], legs: Point[][] = [], assumptions = new Set<string>(), warnings: string[] = [];
  const assigned = new Map<string, string>();
  stops.forEach((stop, index) => {
    const id = `v2-p${index + 1}`, row = stop.row;
    const engageable = stage.targets.filter(t => row.get(t.id)?.legal).map(t => t.id);
    const mine = stage.targets.filter(t => assignedTo[index].includes(t.id));
    const rel = (t: typeof mine[number]) => ((headingTo(stop.point, t.center) - stage.downrangeDegrees + 540) % 360) - 180;
    const dist = (t: typeof mine[number]) => Math.hypot(t.center.x - stop.point.x, t.center.y - stop.point.y);
    mine.sort((a, b) => stage.ruleset === 'IDPA' ? dist(a) - dist(b) || rel(a) - rel(b) : rel(a) - rel(b) || dist(a) - dist(b));
    const engagements: PlannedEngagement[] = mine.map((t, i) => {
      const c = row.get(t.id)!; assigned.set(t.id, id);
      if (c.overLowWall) assumptions.add('Some targets are only visible over walls lower than 69 in; the plan assumes shooting over them is allowed and possible from eye height.');
      if (c.throughNoShoot) warnings.push(`${t.id}: every visible line passes a non-threat (penalty risk).`);
      return { targetId: t.id, order: i + 1, visibleFraction: c.visibleFraction, safeMarginDegrees: c.safeMarginDegrees,
        nearSafeAngle: c.safeMarginDegrees < nearMargin, throughNoShoot: c.throughNoShoot, overLowWall: c.overLowWall };
    });
    positions.push({ id, point: stop.point, engagements, engageableTargetIds: engageable });
    legs.push(graph.path(legFrom(index), stop.point) ?? [legFrom(index), stop.point]);
  });
  const covered: TargetReport[] = stage.targets.filter(t => assigned.has(t.id))
    .map(t => ({ targetId: t.id, status: 'covered', reasons: [], positionId: assigned.get(t.id), legalCandidateCount: legalCount.get(t.id) ?? 0 }));
  const missedByWalk: TargetReport[] = stage.targets.filter(t => !assigned.has(t.id) && (coverable & bit.get(t.id)!))
    .map(t => ({ targetId: t.id, status: 'uncovered', reasons: ['UNREACHABLE'], legalCandidateCount: legalCount.get(t.id) ?? 0 }));
  const nearSafeAngle = positions.flatMap(p => p.engagements.filter(e => e.nearSafeAngle).map(e => ({ targetId: e.targetId, positionId: p.id, marginDegrees: e.safeMarginDegrees })));
  if (truncated) warnings.push('Candidate positions were thinned to stay within the search bound; a denser grid might find a shorter walk.');
  if (!walk.complete) warnings.push('The distance search stopped at its budget; this is the best walk found, not a proven shortest one.');
  if (!exactPositions) warnings.push('The minimum number of positions was not proven within the search budget.');
  if (nearSafeAngle.length) warnings.push(`${nearSafeAngle.length} engagement(s) are within ${nearMargin}° of the safe-angle limit.`);
  const targets = [...covered, ...missedByWalk, ...uncoveredReports].sort((a, b) => stage.targets.findIndex(t => t.id === a.targetId) - stage.targets.findIndex(t => t.id === b.targetId));
  const allCovered = targets.every(t => t.status === 'covered');
  return finish({ ...base, status: allCovered ? 'complete' : 'partial', positions, legs, movementInches, targets,
    safety: { ...base.safety, nearSafeAngle }, assumptions: [...assumptions], warnings,
    diagnostics: { ...diagnosticsBase, minimumPositions: typeof k === 'number' && Number.isFinite(k) ? k : null, exactPositions,
      exactDistance: exactPositions && walk.complete && !reduced && !truncated, refinedInches: Math.max(0, before - movementInches), searchNodes: budget.nodes + walk.nodes, durationMs: 0 } });
}

/** Headings helper re-exported for tests and UI explanations. */
export { headingDelta };
