import type { StagePosition } from '../stage/coordinates';
import { isEngageable } from './model';
import type { PlannerCandidate, PlannerContext, PlannerWarning, RoutePlannerConfig } from './planner';
import { evaluateRoute } from './route';
import type { RouteEvaluation, ShootingPosition, StageRoute } from './route';
import { shootingDifficulty } from './shootingDifficulty';

/** Hard ceilings; callers may lower them for a smaller search, never raise them. */
export const PLANNER_SEARCH_LIMITS = Object.freeze({
  maxPositions: 12, maxSubsetChecks: 4095, maxSubsets: 64,
  maxOrdersPerSubset: 12, maxAssignmentsPerOrder: 16, maxEvaluations: 2000,
  maxTargets: 64, maxMagazines: 16,
});
export type PlannerSearchLimits = { -readonly [Key in keyof typeof PLANNER_SEARCH_LIMITS]: number };
export type GeneratedPlannerCandidate = PlannerCandidate & Readonly<{
  evaluation: RouteEvaluation;
  metrics: { estimatedTime: number | null; movementDistance: number; shootingDifficultyTotal: number; positionsUsed: number; reloadCount: number };
  warnings: readonly PlannerWarning[];
}>;
export type CandidateGenerationResult = Readonly<{
  status: 'GENERATED' | 'NO_VALID_ROUTE' | 'INVALID_INPUT';
  candidates: readonly GeneratedPlannerCandidate[];
  warnings: readonly PlannerWarning[];
  search: { subsetChecks: number; subsets: number; orders: number; assignments: number; evaluations: number; truncated: boolean };
}>;
const distance = (a: StagePosition, b: StagePosition) => Math.hypot(a.x - b.x, a.y - b.y);

/** Uses plan.route.positions as the manually supplied pool. All scoring targets require
 * positive planned rounds, matching evaluateRoute. Visibility is asserted by the user,
 * not geometrically proven. Config policies are intentionally deferred to the next phase.
 * Returned routes are ordinary StageRoute objects; nothing is applied to the input plan.
 */
export function generateCandidates(context: PlannerContext, _config: RoutePlannerConfig,
  requestedLimits: Partial<Record<keyof PlannerSearchLimits, number>> = {}): CandidateGenerationResult {
  const limits: PlannerSearchLimits = { ...PLANNER_SEARCH_LIMITS };
  const warnings: PlannerWarning[] = [], candidates: GeneratedPlannerCandidate[] = [];
  const search = { subsetChecks: 0, subsets: 0, orders: 0, assignments: 0, evaluations: 0, truncated: false };
  const warn = (code: PlannerWarning['code'], message: string) => { warnings.push({ code, message }); };
  const limited = () => { search.truncated = true; };
  const finish = (status: CandidateGenerationResult['status']): CandidateGenerationResult => {
    if (search.truncated) warn('SEARCH_LIMIT', 'Search limit reached; retained all valid candidates found. Search is not exhaustive.');
    if (status === 'NO_VALID_ROUTE') warn('NO_VALID_ROUTE', 'No valid route survived the bounded search and ammunition evaluation.');
    return { status, candidates, warnings, search };
  };
  for (const key of Object.keys(limits) as (keyof PlannerSearchLimits)[]) {
    const value = requestedLimits[key];
    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value < 1 || value > limits[key]) {
        warn('INVALID_INPUT', `Search limit ${key} must be an integer between 1 and ${limits[key]}.`);
        return finish('INVALID_INPUT');
      }
      limits[key] = value;
    }
  }
  const { stage, plan, profile } = context;
  const targets = stage.objects.filter(isEngageable);
  const targetIds = new Set(targets.map(t => t.id));
  const start = stage.objects.find(o => o.type === 'start');
  const finite = (p: StagePosition) => p && p.space === 'stage' && [p.x, p.y, p.z].every(Number.isFinite);
  if (!start || !finite(start.position) || !Number.isFinite(stage.stage.width) || !Number.isFinite(stage.stage.depth)
    || stage.stage.width <= 0 || stage.stage.depth <= 0 || targets.some(t => !finite(t.position))
    || new Set(stage.objects.map(o => o.id)).size !== stage.objects.length) {
    warn('INVALID_INPUT', 'Stage requires finite geometry, unique object IDs and an existing Start Position.');
    return finish('INVALID_INPUT');
  }
  if (!targets.length || targets.some(t => !Number.isSafeInteger(plan.engagements[t.id]) || plan.engagements[t.id] <= 0)
    || !Number.isSafeInteger(targets.reduce((sum, t) => sum + plan.engagements[t.id], 0))) {
    warn('INVALID_INPUT', 'Every scoring target requires a positive whole planned round count.');
    return finish('INVALID_INPUT');
  }
  const magazines = plan.loadout.magazines;
  if (typeof plan.loadout.chamberLoaded !== 'boolean' || new Set(magazines.map(m => m.id)).size !== magazines.length
    || magazines.some(m => !m.id || !Number.isSafeInteger(m.capacity) || m.capacity <= 0
      || !Number.isSafeInteger(m.startingRounds) || m.startingRounds < 0 || m.startingRounds > m.capacity)
    || !Number.isSafeInteger(magazines.reduce((sum, m) => sum + m.startingRounds, 1))
    || (plan.loadout.startingMagazineId !== null && !magazines.some(m => m.id === plan.loadout.startingMagazineId))) {
    warn('INVALID_LOADOUT', 'Magazine IDs, capacities, loaded counts or starting magazine are invalid.');
    return finish('INVALID_INPUT');
  }
  if (targets.length > limits.maxTargets || magazines.length > limits.maxMagazines) {
    limited(); return finish('NO_VALID_ROUTE');
  }
  const pool = plan.route?.positions ?? [];
  if (!pool.length) { warn('NO_POSITIONS', 'Place candidate shooting positions in the manual route first.'); return finish('INVALID_INPUT'); }
  if (new Set(pool.map(p => p.id)).size !== pool.length || pool.some(p => !p.id || !finite(p.position)
    || p.position.z !== 0 || p.position.x < 0 || p.position.y < 0 || p.position.x > stage.stage.width || p.position.y > stage.stage.depth
    || !Array.isArray(p.visibleTargetIds))) {
    warn('INVALID_INPUT', 'Candidate positions require unique IDs, ground-level stage coordinates and visibility arrays.');
    return finish('INVALID_INPUT');
  }
  if (pool.some(p => p.visibleTargetIds.some(id => !targetIds.has(id))))
    warn('INVALID_VISIBILITY', 'Ignored visibility references to missing or non-scoring targets.');
  let positions: ShootingPosition[] = pool.map(p => ({ ...p, position: { ...p.position },
    visibleTargetIds: [...new Set(p.visibleTargetIds.filter(id => targetIds.has(id)))], engagedTargetIds: [],
  })).filter(p => p.visibleTargetIds.length > 0);
  // Coverage-first truncation; distance and original order break ties deterministically.
  positions.sort((a, b) => b.visibleTargetIds.length - a.visibleTargetIds.length || distance(start.position, a.position) - distance(start.position, b.position));
  if (positions.length > limits.maxPositions) { positions = positions.slice(0, limits.maxPositions); limited(); }
  if (positions.some(p => !Number.isFinite(distance(start.position, p.position))
    || targets.some(t => !Number.isFinite(distance(p.position, t.position))))) {
    warn('INVALID_INPUT', 'Physical distances exceed the supported numeric range.');
    return finish('INVALID_INPUT');
  }
  const uncovered = targets.filter(t => !positions.some(p => p.visibleTargetIds.includes(t.id)));
  if (uncovered.length) {
    for (const target of uncovered) warn('UNCOVERED_TARGET', `Target ${target.id} has no visibility from the considered positions.`);
    warn('NO_COVERAGE', 'No combination of considered positions covers every scoring target.');
    return finish('NO_VALID_ROUTE');
  }
  const subsets: ShootingPosition[][] = [];
  // At most 2^12 masks, smaller subsets first. Supersets remain eligible because a
  // coverage-redundant position can improve shooting distance or ammunition feasibility.
  const masks = Array.from({ length: (1 << positions.length) - 1 }, (_, i) => i + 1);
  const countBits = (mask: number) => { let n = 0; for (; mask; mask &= mask - 1) n++; return n; };
  masks.sort((a, b) => countBits(a) - countBits(b) || a - b);
  for (const mask of masks) {
    if (search.subsetChecks >= limits.maxSubsetChecks || subsets.length >= limits.maxSubsets) { limited(); break; }
    search.subsetChecks++;
    const subset = positions.filter((_, i) => mask & (1 << i));
    if (targets.every(t => subset.some(p => p.visibleTargetIds.includes(t.id)))) subsets.push(subset);
  }
  search.subsets = subsets.length;
  const visited = new Set<string>();
  const routeKey = (route: StageRoute) => JSON.stringify([route.positions.map(p => [p.id, p.engagedTargetIds]), route.reloads]);
  const tryReloads = (route: StageRoute): void => {
    const key = routeKey(route);
    if (visited.has(key)) return;
    if (search.evaluations >= limits.maxEvaluations) { limited(); return; }
    visited.add(key); search.evaluations++;
    const evaluation = evaluateRoute(stage, plan, route, profile);
    const failure = evaluation.ammo.findIndex(state => !state.sufficient);
    if (failure >= 0) {
      const used = new Set([plan.loadout.startingMagazineId, ...route.reloads.map(r => r.magazineId)]);
      // Repair the first shortage; also try earlier arrivals for proactive reloads.
      // Each branch adds one unused magazine and stops at the shared evaluation cap.
      for (let i = failure; i >= 0; i--) {
        if (route.reloads.some(r => r.positionId === route.positions[i].id)) continue;
        for (const magazine of magazines) {
          if (used.has(magazine.id) || magazine.startingRounds === 0) continue;
          if (search.evaluations >= limits.maxEvaluations) { limited(); return; }
          const reloads = [...route.reloads, { positionId: route.positions[i].id, magazineId: magazine.id }];
          reloads.sort((a, b) => route.positions.findIndex(p => p.id === a.positionId) - route.positions.findIndex(p => p.id === b.positionId));
          tryReloads({ ...route, reloads });
        }
      }
      return;
    }
    const id = `planner-${candidates.length + 1}`;
    const totalDifficulty = route.positions.reduce((sum, p) => sum + p.engagedTargetIds.reduce((subtotal, targetId) =>
      subtotal + shootingDifficulty(p.position, targets.find(t => t.id === targetId)!.position).score, 0), 0);
    candidates.push({ id, route: { ...route, id }, evaluation,
      metrics: { estimatedTime: evaluation.timing?.total ?? null, movementDistance: evaluation.distance,
        shootingDifficultyTotal: totalDifficulty, positionsUsed: route.positions.length, reloadCount: evaluation.magazineChanges },
      warnings: evaluation.warnings.map(message => ({ code: 'ROUTE_EVALUATION', message, candidateId: id })),
    });
  };
  for (const subset of subsets) {
    let orderCount = 0;
    const orderPositions = (ordered: ShootingPosition[], remaining: ShootingPosition[]): void => {
      if (search.evaluations >= limits.maxEvaluations || orderCount >= limits.maxOrdersPerSubset) { limited(); return; }
      if (remaining.length) {
        const origin = ordered.length ? ordered[ordered.length - 1].position : start.position;
        for (const next of [...remaining].sort((a, b) => distance(origin, a.position) - distance(origin, b.position)))
          orderPositions([...ordered, next], remaining.filter(p => p !== next));
        return;
      }
      orderCount++; search.orders++;
      const choices = targets.map(t => ordered.filter(p => p.visibleTargetIds.includes(t.id))
        .sort((a, b) => shootingDifficulty(a.position, t.position).score - shootingDifficulty(b.position, t.position).score));
      // Mixed-radix enumeration gives bounded alternatives without a deep target recursion.
      const indexes = targets.map(() => 0);
      for (let attempt = 0; ; attempt++) {
        if (attempt >= limits.maxAssignmentsPerOrder || search.evaluations >= limits.maxEvaluations) { limited(); break; }
        search.assignments++;
        const assigned = ordered.map(p => ({ ...p, position: { ...p.position }, visibleTargetIds: [...p.visibleTargetIds],
          engagedTargetIds: targets.filter((_, i) => choices[i][indexes[i]].id === p.id).map(t => t.id),
        })).filter(p => p.engagedTargetIds.length > 0);
        // Empty positions are redundant for this assignment. Deduplication spans subsets/orders.
        tryReloads({ version: 1, id: 'pending', name: 'Planner candidate', positions: assigned, reloads: [] });
        let digit = 0;
        while (digit < indexes.length && ++indexes[digit] === choices[digit].length) { indexes[digit] = 0; digit++; }
        if (digit === indexes.length) break;
      }
    };
    orderPositions([], subset);
    if (search.evaluations >= limits.maxEvaluations) { limited(); break; }
  }
  return finish(candidates.length ? 'GENERATED' : 'NO_VALID_ROUTE');
}
