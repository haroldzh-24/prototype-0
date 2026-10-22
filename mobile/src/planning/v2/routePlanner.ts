import { candidatePositions } from './candidatePositions';
import { checkEngagement, defaultNoShootPolicy, headingDelta, headingTo } from './coverage';
import type { EngagementCheck } from './coverage';
import { normalizeStage } from './normalizeStage';
import type { NormalizedStage } from './normalizeStage';
import { greedyWalk, minimumCoverSteps, orderedAdvance, representatives, shortestCoveringWalkSteps } from './optimizeRoute';
import type { CoverageCandidate, RouteSearchResult, SearchBudget } from './optimizeRoute';
import { buildTravelGraph } from './travelGraph';
import { strictlyInside } from '../routeSolver/traversability';
import type { PlanRouteOptions, PlannedEngagement, PlannedPosition, Point, ReasonCode, RoutePlan, StageSnapshot, TargetReport } from './types';

export const PLANNER_VERSION = '2.1.0';
/** Refinement never moves a stop closer than this to the edge of its firing area (unless it already was). */
export const AREA_MARGIN_INCHES = 3;

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
    diagnostics: { candidateCount: 0, distinctCoverageSets: 0, minimumPositions: null, exactPositions: false, exactDistance: false, searchNodes: 0, durationMs: 0, truncatedCandidates: false, stoppedBy: null } };
}

/**
 * Route Planner V2 entry point. Deterministic for a given input unless the wall-clock limit is reached (flagged):
 * one plan with the fewest shooting positions, then the shortest walk, engaging every target that can be engaged
 * legally and in the order the stage procedures require, with explicit reasons for any that cannot.
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

const popcount = (m: bigint) => { let c = 0; for (let x = m; x; x &= x - 1n) c++; return c; };
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
/** Distance from p to the nearest edge of the best allowed firing area containing it (-1 when none contains it). */
function areaClearance(p: Point, stage: NormalizedStage, targetId: string): number {
  const allowed = stage.procedures[targetId]?.areaIds;
  let best = -1;
  for (const a of stage.areas) {
    if ((allowed && !allowed.includes(a.id)) || !strictlyInside(p, a.vertices)) continue;
    const v = a.vertices;
    best = Math.max(best, Math.min(...v.map((q, i) => segmentDistance(p, q, v[(i + 1) % v.length]))));
  }
  return best;
}
/** Nearest clear point within `radius`, searched on rings 1 in apart (deterministic order). */
function nearestClear(p: Point, radius: number, clear: (q: Point) => boolean): Point | null {
  for (let r = 1; r <= radius; r++) for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16, q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    if (clear(q)) return q;
  }
  return null;
}

function* planSteps(snapshot: StageSnapshot, options: PlanRouteOptions): Generator<void, RoutePlan, void> {
  const started = Date.now();
  const half = options.safeHalfAngleDegrees ?? 90, nearMargin = options.nearSafeAngleMarginDegrees ?? 10;
  const maxNodes = options.maxSearchNodes ?? 200000, maxMs = options.maxSearchMs ?? 3000;
  const finish = (plan: RoutePlan): RoutePlan => ({ ...plan, diagnostics: { ...plan.diagnostics, durationMs: Date.now() - started } });
  const normalized = normalizeStage(snapshot, options);
  if (!normalized.stage) return finish(emptyPlan('invalid-input', normalized.errors, undefined, half));
  const stage = normalized.stage;
  if (!stage.targets.length) return finish({ ...emptyPlan('no-targets', [], stage.downrangeDegrees, half), start: stage.start });
  const policy = options.noShootPolicy ?? defaultNoShootPolicy(stage.ruleset);
  const clearance = options.clearanceInches ?? 6, travel = options.travel ?? 'anywhere';
  const graph = yield* buildTravelGraph(snapshot.stage, stage, { clearanceInches: clearance, travel, targetsBlockTravel: options.targetsBlockTravel ?? true });
  const warnings: string[] = [];
  if (headingDelta(stage.downrangeDegrees, stage.stageDownrangeDegrees) > 1)
    warnings.push(`The route's safe direction (${Math.round(stage.downrangeDegrees)}°) differs from the stage's downrange (${Math.round(stage.stageDownrangeDegrees)}°). The plan uses the route setting.`);

  // A start inside the body clearance of a wall or stand is walked from the nearest clear point instead.
  let origin: Point = stage.start;
  if (!graph.traversable(stage.start)) {
    const inStage = stage.start.x >= 0 && stage.start.y >= 0 && stage.start.x <= stage.size.width && stage.start.y <= stage.size.depth;
    const outsideAreas = travel === 'within-areas' && !stage.areas.some(a => strictlyInside(stage.start, a.vertices));
    const nudged = inStage && !outsideAreas ? nearestClear(stage.start, clearance + 2, graph.traversable) : null;
    if (!nudged) {
      const why = !inStage ? 'The start position is outside the stage.'
        : outsideAreas ? 'The start is outside every firing area, and travel is limited to firing areas.'
        : 'The start position is inside a wall or target stand.';
      return finish({ ...emptyPlan('invalid-input', [why], stage.downrangeDegrees, half), start: stage.start });
    }
    origin = nudged;
    warnings.push(`The start is within ${clearance} in of a wall or target stand; the walk begins from the nearest clear point, ${Math.hypot(nudged.x - stage.start.x, nudged.y - stage.start.y).toFixed(1)} in away.`);
  }

  // 2-3. Candidates and their legal engagements.
  const { candidates, truncated } = candidatePositions({ ...stage, start: origin }, options.candidateSpacingInches ?? 12, options.maxCandidates ?? 1500, graph.traversable, clearance);
  const reachableIds = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    if (i % 4 === 0) yield;
    if (graph.connected(origin, candidates[i].point)) reachableIds.add(candidates[i].id);
  }
  const checks = new Map<string, Map<string, EngagementCheck>>();
  const failures = new Map<string, Set<ReasonCode>>(stage.targets.map(t => [t.id, new Set<ReasonCode>()]));
  const legalCount = new Map<string, number>(stage.targets.map(t => [t.id, 0]));
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
    if (seen.has('IDPA_AREAS_REQUIRED')) return ['IDPA_AREAS_REQUIRED'];
    // Report the furthest stage a candidate reached: area -> safe angle -> line of sight.
    if (seen.has('OCCLUDED')) return ['OCCLUDED'];
    if (seen.has('OUTSIDE_SAFE_ANGLE')) return ['OUTSIDE_SAFE_ANGLE'];
    return ['NO_ALLOWED_AREA'];
  };

  // Stage procedures: "engage after" order. A target is orderable when it can be engaged and so can everything it
  // must follow (no cycles, no missing targets). The others are reported instead of planned out of order.
  const ids = new Set(stage.targets.map(t => t.id));
  const after = (id: string) => stage.procedures[id]?.afterTargetIds ?? [];
  const state = new Map<string, 'visiting' | 'ok' | 'blocked'>(), orderProblem = new Map<string, string>();
  const orderable = (id: string): boolean => {
    const s = state.get(id);
    if (s === 'ok') return true;
    if (s) { if (s === 'visiting') orderProblem.set(id, 'the "engage after" procedures form a cycle'); return false; }
    state.set(id, 'visiting');
    let ok = !!(coverable & bit.get(id)!);
    for (const pre of after(id)) {
      if (!ids.has(pre)) { ok = false; orderProblem.set(id, `${pre} is not an engageable target on this stage`); }
      else if (!orderable(pre)) { ok = false; if (!orderProblem.has(id)) orderProblem.set(id, `${pre} cannot be engaged on this route`); }
    }
    state.set(id, ok ? 'ok' : 'blocked'); return ok;
  };
  let required = 0n;
  for (const t of stage.targets) if (orderable(t.id)) required |= bit.get(t.id)!;
  const prerequisites = new Map<bigint, bigint>();
  for (const t of stage.targets) if (required & bit.get(t.id)!) prerequisites.set(bit.get(t.id)!, after(t.id).reduce((m, pre) => m | bit.get(pre)!, 0n));
  const ordered = [...prerequisites.values()].some(pre => pre);
  const advance = orderedAdvance(prerequisites);

  const uncoveredReports: TargetReport[] = stage.targets.filter(t => !(required & bit.get(t.id)!)).map(t => {
    const procedure = !!(coverable & bit.get(t.id)!);
    if (procedure) warnings.push(`${t.id}: its "engage after" procedure cannot be met (${orderProblem.get(t.id) ?? 'a required target cannot be engaged'}).`);
    return { targetId: t.id, status: 'uncovered', reasons: procedure ? ['PROCEDURE_ORDER'] : reasonFor(t.id), legalCandidateCount: legalCount.get(t.id) ?? 0 };
  });
  const hasProcedures = Object.values(stage.procedures).some(p => p?.areaIds || p?.afterTargetIds?.length);
  const base = {
    version: 2 as const, start: stage.start, errors: [],
    safety: { downrangeDegrees: stage.downrangeDegrees, safeHalfAngleDegrees: half,
      checked: [`Every sampled point of each engaged target face is within ±${half}° of downrange (${Math.round(stage.downrangeDegrees)}°) from its shooting position.`,
        'Shooting positions are strictly inside a firing area allowed for the target.', 'Line of sight reaches the target face past walls, ports' + (policy === 'occlude' ? ', other target faces and no-shoots.' : '; shots passing a non-threat are flagged.'),
        ...(hasProcedures ? ['Stage procedures: allowed firing areas per target and "engage after" order.'] : [])],
      notChecked: stage.ruleset === 'IDPA' ? [...NOT_CHECKED, ...IDPA_NOT_CHECKED] : NOT_CHECKED, nearSafeAngle: [] as RoutePlan['safety']['nearSafeAngle'] },
  };
  const diagnosticsBase = { candidateCount: candidates.length, distinctCoverageSets: new Set(coverage.map(c => c.mask)).size, truncatedCandidates: truncated };
  if (!required) return finish({ ...base, status: 'infeasible', positions: [], legs: [], movementInches: 0, targets: uncoveredReports,
    assumptions: [], warnings: [...warnings, coverable ? 'No target can be engaged in the order the stage procedures require.' : 'No target can be engaged legally from a reachable position.'],
    diagnostics: { ...diagnosticsBase, minimumPositions: null, exactPositions: false, exactDistance: false, searchNodes: 0, durationMs: 0, stoppedBy: null } });

  // 5. Fewest positions, then shortest walk. The exact cover ignores order, so it is a lower bound; with procedures
  // the walk search tries one more stop at a time until a walk exists.
  const searchable = coverage.map(c => ({ ...c, mask: c.mask & required })).filter(c => c.mask);
  const coverBudget: SearchBudget = { nodes: 0, limit: maxNodes, deadline: Date.now() + maxMs };
  const k = yield* minimumCoverSteps(searchable.map(c => c.mask), required, coverBudget);
  const { pool, reduced } = representatives(searchable, origin, options.representativesPerCoverage ?? 4);
  const walkBudget: SearchBudget = { nodes: 0, limit: maxNodes, deadline: Date.now() + maxMs };
  let walk: RouteSearchResult | null = null, minimumProven: number | null = null;
  if (typeof k === 'number' && Number.isFinite(k)) {
    let proven = true;
    for (let stops = k; stops <= popcount(required) && !walk; stops++) {
      const result = yield* shortestCoveringWalkSteps(origin, pool, required, stops, graph.distance, walkBudget, advance);
      if (result.order.length) { walk = result; if (proven) minimumProven = result.order.length; }
      else if (!result.complete) proven = false;
      if (!proven) break;
    }
    if (!ordered) minimumProven = k;
  }
  if (!walk || !walk.order.length) walk = greedyWalk(origin, pool, required, graph.distance, advance);
  const exactPositions = minimumProven !== null && walk.order.length === minimumProven;

  // Engage each target at the first stop where it and everything it must follow can be engaged.
  const stops = walk.order.map(stop => ({ point: stop.point, row: checks.get(stop.id)! }));
  const assignedTo: string[][] = stops.map(() => []);
  let engaged = 0n;
  walk.order.forEach((stop, i) => {
    const next = advance(engaged, stop.mask & required);
    for (const t of stage.targets) if ((next & ~engaged) & bit.get(t.id)!) assignedTo[i].push(t.id);
    engaged = next;
  });

  // Local refinement below grid resolution: slide each stop toward its neighbours while it still engages its assigned
  // targets at least as well as before (safe margin down to the near-limit threshold at most, same visible fraction,
  // no new low-wall, no-shoot or height flags, at least AREA_MARGIN_INCHES inside the area) and the walk gets shorter.
  const before = walk.distance;
  const legFrom = (i: number) => (i === 0 ? origin : stops[i - 1].point);
  const faces = new Map(stage.targets.map(t => [t.id, t]));
  const baseline = stops.map((stop, i) => assignedTo[i].map(id => ({ id, check: stop.row.get(id)!, clearance: areaClearance(stop.point, stage, id) })));
  const localCost = (i: number, p: Point) => graph.distance(legFrom(i), p) + (i + 1 < stops.length ? graph.distance(p, stops[i + 1].point) : 0);
  const keepsAssignments = (i: number, p: Point) => graph.traversable(p) && graph.connected(legFrom(i), p)
    && baseline[i].every(({ id, check: was, clearance: inset }) => {
      const now = checkEngagement(p, faces.get(id)!, stage, half, policy);
      return now.legal && now.safeMarginDegrees >= Math.min(was.safeMarginDegrees, nearMargin) - 1e-9
        && now.visibleFraction >= was.visibleFraction - 1e-9
        && (was.throughNoShoot || !now.throughNoShoot) && (was.overLowWall || !now.overLowWall) && (was.passesAboveOrBelow || !now.passesAboveOrBelow)
        && areaClearance(p, stage, id) >= Math.min(AREA_MARGIN_INCHES, inset) - 1e-9;
    });
  const assess = (point: Point) => new Map(stage.targets.map(t => [t.id, checkEngagement(point, t, stage, half, policy)] as const));
  for (let round = 0; round < (options.refine === false ? 0 : 4); round++) {
    let improved = false;
    for (let i = 0; i < stops.length; i++) {
      yield;
      const prev = legFrom(i), next = i + 1 < stops.length ? stops[i + 1].point : null;
      const goals = next ? [prev, next, { x: (prev.x + next.x) / 2, y: (prev.y + next.y) / 2 }] : [prev];
      for (const goal of goals) {
        const from = stops[i].point, current = localCost(i, from);
        // Binary search for the farthest acceptable point toward the goal, then keep it only if it is cheaper.
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
  const nudge = Math.hypot(origin.x - stage.start.x, origin.y - stage.start.y);
  const movementInches = nudge + stops.reduce((sum, stop, i) => sum + graph.distance(legFrom(i), stop.point), 0);

  // Report each stop with engagements ordered across downrange (IDPA: near to far), then by procedure order.
  const positions: PlannedPosition[] = [], legs: Point[][] = [], assumptions = new Set<string>();
  const assigned = new Map<string, string>();
  stops.forEach((stop, index) => {
    const id = `v2-p${index + 1}`, row = stop.row;
    const engageable = stage.targets.filter(t => row.get(t.id)?.legal).map(t => t.id);
    const mine = stage.targets.filter(t => assignedTo[index].includes(t.id));
    const rel = (t: typeof mine[number]) => ((headingTo(stop.point, t.center) - stage.downrangeDegrees + 540) % 360) - 180;
    const dist = (t: typeof mine[number]) => Math.hypot(t.center.x - stop.point.x, t.center.y - stop.point.y);
    mine.sort((a, b) => stage.ruleset === 'IDPA' ? dist(a) - dist(b) || rel(a) - rel(b) : rel(a) - rel(b) || dist(a) - dist(b));
    // Stable topological pass: a target that must follow another at this stop moves after it.
    const here = new Set(mine.map(t => t.id)), placed = new Set<string>(), sequence: typeof mine = [];
    while (mine.length) {
      const pick = Math.max(0, mine.findIndex(t => after(t.id).every(pre => !here.has(pre) || placed.has(pre))));
      sequence.push(mine[pick]); placed.add(mine[pick].id); mine.splice(pick, 1);
    }
    const engagements: PlannedEngagement[] = sequence.map((t, i) => {
      const c = row.get(t.id)!; assigned.set(t.id, id);
      if (c.overLowWall) assumptions.add('Some targets are only visible over walls lower than 69 in; the plan assumes shooting over them is allowed and possible from eye height.');
      if (c.passesAboveOrBelow) assumptions.add('Some lines of sight cross another target or no-shoot in plan view and are treated as passing above or below it, using the face heights in the stage model.');
      if (c.throughNoShoot) warnings.push(`${t.id}: every visible line passes a non-threat (penalty risk).`);
      return { targetId: t.id, order: i + 1, visibleFraction: c.visibleFraction, safeMarginDegrees: c.safeMarginDegrees,
        nearSafeAngle: c.safeMarginDegrees < nearMargin, throughNoShoot: c.throughNoShoot, overLowWall: c.overLowWall };
    });
    positions.push({ id, point: stop.point, engagements, engageableTargetIds: engageable });
    const leg = graph.path(legFrom(index), stop.point) ?? [legFrom(index), stop.point];
    legs.push(index === 0 && nudge > 0 ? [stage.start, ...leg] : leg);
  });
  const covered: TargetReport[] = stage.targets.filter(t => assigned.has(t.id))
    .map(t => ({ targetId: t.id, status: 'covered', reasons: [], positionId: assigned.get(t.id), legalCandidateCount: legalCount.get(t.id) ?? 0 }));
  const missedByWalk: TargetReport[] = stage.targets.filter(t => !assigned.has(t.id) && (required & bit.get(t.id)!))
    .map(t => ({ targetId: t.id, status: 'uncovered', reasons: [ordered ? 'PROCEDURE_ORDER' : 'UNREACHABLE'], legalCandidateCount: legalCount.get(t.id) ?? 0 }));
  const nearSafeAngle = positions.flatMap(p => p.engagements.filter(e => e.nearSafeAngle).map(e => ({ targetId: e.targetId, positionId: p.id, marginDegrees: e.safeMarginDegrees })));
  const stoppedBy = coverBudget.stoppedBy === 'time' || walkBudget.stoppedBy === 'time' ? 'time' as const
    : coverBudget.stoppedBy || walkBudget.stoppedBy ? 'nodes' as const : null;
  if (truncated) warnings.push('Candidate positions were thinned to stay within the search bound; a denser grid might find a shorter walk.');
  if (stoppedBy === 'time') warnings.push(`The search reached its ${(maxMs / 1000).toFixed(1)} s time limit; this is the best plan found in time and may differ on a faster device.`);
  if (!walk.complete) warnings.push('The distance search stopped at its budget; this is the best walk found, not a proven shortest one.');
  if (!exactPositions) warnings.push('The minimum number of positions was not proven within the search budget.');
  if (nearSafeAngle.length) warnings.push(`${nearSafeAngle.length} engagement(s) are within ${nearMargin}° of the safe-angle limit.`);
  const targets = [...covered, ...missedByWalk, ...uncoveredReports].sort((a, b) => stage.targets.findIndex(t => t.id === a.targetId) - stage.targets.findIndex(t => t.id === b.targetId));
  const allCovered = targets.every(t => t.status === 'covered');
  return finish({ ...base, status: allCovered ? 'complete' : 'partial', positions, legs, movementInches, targets,
    safety: { ...base.safety, nearSafeAngle }, assumptions: [...assumptions], warnings,
    diagnostics: { ...diagnosticsBase, minimumPositions: minimumProven, exactPositions,
      exactDistance: exactPositions && walk.complete && !reduced && !truncated, refinedInches: Math.max(0, before - (movementInches - nudge)),
      searchNodes: coverBudget.nodes + walkBudget.nodes, durationMs: 0, stoppedBy } });
}

/** Headings helper re-exported for tests and UI explanations. */
export { headingDelta };
