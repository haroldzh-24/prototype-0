import type { StagePosition } from '../stage/coordinates';
import type { RouteEvaluation, StageRoute } from './route';
import type { ShootingDifficulty } from './shootingDifficulty';
import type { CandidateRankingPolicy, EvaluatedPlannerCandidate, PlannerCandidate, PlannerContext,
  PlannerResult, PlannerWarning, RankedPlannerCandidate, RoutePlannerConfig } from './planner';

/** Fixed scales make scores comparable across batches. All scores are costs, not seconds. */
export const RANKING_CONFIG = {
  scales: { time: 10, movement: 120, difficulty: 10 },
  styles: {
    MINIMUM_MOVEMENT_HARDER_SHOOTING: { time: 0.1, movement: 5, difficulty: 0.15, positions: 2, reloads: 0.2, complexity: 0.2 },
    BALANCED: { time: 1, movement: 1, difficulty: 1, positions: 0.3, reloads: 0.3, complexity: 0.3 },
    MORE_MOVEMENT_EASIER_SHOOTING: { time: 0.2, movement: 0.25, difficulty: 6, positions: 0.05, reloads: 0.2, complexity: 0.1 },
  },
  geometry: { minimumSegment: 12, facingCoherence: 0.85, backwardCosine: -0.5, turnCosine: 0.5, reversalCosine: -0.5 },
  complexity: { segment: 0.2, turn: 1, reversal: 2, backwardYard: 0.5, position: 0.2 },
  backward: { avoidPerYard: 8, limitedPerYard: 1, limitedExcessPerYard: 6, shortRetreatInches: 36 },
  reload: {
    CONSERVATIVE: { reserve: 3, margin: 2, arrival: 2, time: 0.1 },
    BALANCED: { reserve: 1, margin: 0.5, arrival: 0.5, time: 0.5 },
    AGGRESSIVE: { reserve: 0, margin: 0, arrival: 0, time: 2 },
  },
  diversity: { geometryToleranceInches: 12, assignmentDifferenceFraction: 0.2, maxResults: 5 },
} as const;

export type RankingMetrics = Readonly<{
  estimatedTotalTime: number | null; movementDistance: number;
  totalShootingDifficulty: number; averageShootingDifficulty: number; maximumSingleTargetDifficulty: number;
  positionsUsed: number; reloadCount: number; roundsRemaining: number; ammoMargin: number;
  minimumArrivalRounds: number; reloadTime: number | null;
  rawReloadDuration: number | null; reloadMovementAvailable: number | null; reloadOverlap: number | null;
  directionChangeCount: number; sharpReversalCount: number; movementComplexityScore: number;
  backwardDistance: number; sustainedBackwardDistance: number; backwardSegmentCount: number;
}>;
export type RankingReason = Readonly<{ code: string; message: string; contribution: number }>;
export type RankingOptions = Readonly<{ maxResults?: number; diversity?: boolean }>;
const vector = (a: StagePosition, b: StagePosition) => ({ x: b.x - a.x, y: b.y - a.y });
const length = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);
const cosine = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x * b.x + a.y * b.y) / (length(a) * length(b));

/** Facing at departure = coherent mean of unit bearings to targets just engaged.
 * No facing is inferred at START, empty positions or dispersed bearings. Retreat
 * means travel >=12 inches more than 120 degrees away from that facing. This
 * rotation-invariant proxy does not claim to know the shooter's actual posture.
 */
export function deriveRankingMetrics(context: PlannerContext, candidate: PlannerCandidate,
  evaluation: RouteEvaluation, difficulty: readonly ShootingDifficulty[]): RankingMetrics {
  const route = candidate.route, g = RANKING_CONFIG.geometry;
  const targets = new Map(context.stage.objects.map(o => [o.id, o.position]));
  let origin = context.stage.objects.find(o => o.type === 'start')?.position;
  let previousVector: ReturnType<typeof vector> | undefined;
  let turns = 0, reversals = 0, backward = 0, backwardSegments = 0, sustained = 0, retreatRun = 0, segments = 0;
  for (let i = 0; i < route.positions.length; i++) {
    const destination = route.positions[i];
    if (!origin) { origin = destination.position; continue; }
    const travel = vector(origin, destination.position), distance = length(travel);
    let isBackward = false;
    if (distance >= g.minimumSegment) {
      segments++;
      if (previousVector) {
        const c = cosine(previousVector, travel);
        if (c <= g.turnCosine) turns++;
        if (c <= g.reversalCosine) reversals++;
      }
      previousVector = travel;
      const bearings = (route.positions[i - 1]?.engagedTargetIds ?? []).flatMap(id => {
        const target = targets.get(id);
        if (!target) return [];
        const v = vector(origin!, target), n = length(v);
        return n > 0 ? [{ x: v.x / n, y: v.y / n }] : [];
      });
      const facing = bearings.reduce((sum, v) => ({ x: sum.x + v.x, y: sum.y + v.y }), { x: 0, y: 0 });
      isBackward = bearings.length > 0 && length(facing) / bearings.length >= g.facingCoherence && cosine(facing, travel) <= g.backwardCosine;
      if (isBackward) { backward += distance; backwardSegments++; }
    }
    if (isBackward) {
      const before = Math.max(0, retreatRun - RANKING_CONFIG.backward.shortRetreatInches);
      retreatRun += distance;
      sustained += Math.max(0, retreatRun - RANKING_CONFIG.backward.shortRetreatInches) - before;
    } else if (distance >= g.minimumSegment) retreatRun = 0;
    origin = destination.position;
  }
  const scores = difficulty.map(d => d.score), total = scores.reduce((a, b) => a + b, 0);
  const ammo = evaluation.ammo;
  // Arrival is BEFORE any reload; available is evaluator's AFTER-reload balance.
  const arrivals = ammo.map((_, i) => i ? ammo[i - 1].remaining : evaluation.startingRounds);
  const c = RANKING_CONFIG.complexity;
  return {
    estimatedTotalTime: evaluation.timing?.total ?? null, movementDistance: evaluation.distance,
    totalShootingDifficulty: total, averageShootingDifficulty: scores.length ? total / scores.length : 0,
    maximumSingleTargetDifficulty: Math.max(0, ...scores), positionsUsed: route.positions.length,
    reloadCount: evaluation.magazineChanges, roundsRemaining: ammo.at(-1)?.remaining ?? evaluation.startingRounds,
    ammoMargin: ammo.length ? Math.min(...ammo.map(a => a.remaining)) : evaluation.startingRounds,
    minimumArrivalRounds: arrivals.length ? Math.min(...arrivals) : evaluation.startingRounds,
    rawReloadDuration: evaluation.timing?.rawReloadDuration ?? null,
    reloadMovementAvailable: evaluation.timing?.reloadMovementAvailable ?? null,
    reloadOverlap: evaluation.timing?.reloadOverlap ?? null,
    reloadTime: evaluation.timing?.reloads ?? null, directionChangeCount: turns, sharpReversalCount: reversals,
    backwardDistance: backward, sustainedBackwardDistance: sustained, backwardSegmentCount: backwardSegments,
    movementComplexityScore: segments * c.segment + turns * c.turn + reversals * c.reversal + backward / 36 * c.backwardYard + route.positions.length * c.position,
  };
}

function nearDuplicate(a: StageRoute, b: StageRoute): boolean {
  const d = RANKING_CONFIG.diversity;
  if (a.positions.length !== b.positions.length) return false;
  if (a.positions.some((p, i) => p.id !== b.positions[i].id || length(vector(p.position, b.positions[i].position)) > d.geometryToleranceInches)) return false;
  const reloadKey = (r: StageRoute) => JSON.stringify(r.reloads.map(x => [x.positionId, x.magazineId, x.mode ?? 'moving']).sort());
  if (reloadKey(a) !== reloadKey(b)) return false;
  const assignments = (r: StageRoute) => new Map(r.positions.flatMap(p => p.engagedTargetIds.map(id => [id, p.id] as const)));
  const aa = assignments(a), bb = assignments(b), ids = new Set([...aa.keys(), ...bb.keys()]);
  const changes = [...ids].filter(id => aa.get(id) !== bb.get(id)).length;
  return changes / Math.max(1, ids.size) <= d.assignmentDifferenceFraction;
}

export function rankCandidates(candidates: readonly EvaluatedPlannerCandidate[], config: RoutePlannerConfig,
  policyOrOptions?: CandidateRankingPolicy | RankingOptions): PlannerResult {
  const override = typeof policyOrOptions === 'function' ? policyOrOptions : undefined;
  const options = typeof policyOrOptions === 'object' ? policyOrOptions : {};
  const limit = options.maxResults ?? (override ? candidates.length : RANKING_CONFIG.diversity.maxResults);
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('maxResults must be a nonnegative integer.');
  const warnings: PlannerWarning[] = candidates.flatMap(c => c.warnings);
  const ranked: RankedPlannerCandidate[] = [];
  const effectiveStyle = config.style === 'PERSONALIZED' ? 'BALANCED' : config.style;
  // Even a complete current profile has no distance/difficulty-dependent shooting
  // measurements. Multiplying difficulty by averageSplitTime would invent data.
  const common: PlannerWarning[] = [];
  if (config.style === 'PERSONALIZED') common.push({ code: 'PROFILE_FALLBACK', message: 'Balanced fallback: ShooterPerformanceProfile lacks difficulty-dependent shooting costs needed to compare harder shots against movement.' });
  warnings.push(...common);
  // Missing times must not make one candidate artificially cheaper than another.
  const useTiming = candidates.every(c => c.metrics.estimatedTotalTime !== null);
  if (!useTiming) {
    const warning: PlannerWarning = { code: 'TIMING_UNAVAILABLE', message: 'Timing unavailable for part of this batch; time terms omitted for all candidates.' };
    warnings.push(warning); common.push(warning);
  }
  for (const candidate of candidates) {
    if (!override && candidate.evaluation.ammo.some(a => !a.sufficient)) continue;
    const m = candidate.metrics, w = RANKING_CONFIG.styles[effectiveStyle], s = RANKING_CONFIG.scales;
    const reasons: RankingReason[] = [];
    const add = (code: string, message: string, contribution: number) => reasons.push({ code, message, contribution });
    add('TIME', 'Lower evaluator estimated time', useTiming ? (m.estimatedTotalTime ?? 0) / s.time * w.time : 0);
    add('MOVEMENT', 'Less total movement', m.movementDistance / s.movement * w.movement);
    add('DIFFICULTY', 'Lower total shooting difficulty (distance proxy)', m.totalShootingDifficulty / s.difficulty * w.difficulty);
    add('POSITIONS', 'Fewer shooting positions', m.positionsUsed * w.positions);
    add('RELOADS', 'Fewer reloads', m.reloadCount * w.reloads);
    const neutralComplexity = m.movementComplexityScore - m.backwardDistance / 36 * RANKING_CONFIG.complexity.backwardYard;
    add('COMPLEXITY', 'Less movement complexity (segments, turns and positions)', neutralComplexity * w.complexity);
    const b = RANKING_CONFIG.backward;
    add('BACKWARD', 'Backward-movement preference penalty', config.movement.backwardMovement === 'ALLOWED' ? 0 :
      config.movement.backwardMovement === 'AVOID' ? m.backwardDistance / 36 * b.avoidPerYard :
        m.backwardDistance / 36 * b.limitedPerYard + m.sustainedBackwardDistance / 36 * b.limitedExcessPerYard);
    const r = RANKING_CONFIG.reload[config.reloadStrategy];
    add('AMMO_MARGIN', `Prefer at least ${r.reserve} spare rounds after engagement`, Math.max(0, r.reserve - m.ammoMargin) * r.margin);
    add('ARRIVAL_MARGIN', 'Avoid arriving near empty before a reload', Math.max(0, r.reserve - m.minimumArrivalRounds) * r.arrival);
    add('RELOAD_TIME', 'Lower evaluator reload penalty after movement overlap', useTiming ? (m.reloadTime ?? 0) * r.time : 0);
    const score = override ? override(candidate, config) : reasons.reduce((n, r) => n + r.contribution, 0);
    if (score === null) continue;
    if (!Number.isFinite(score)) throw new Error('Planner ranking scores must be finite or null.');
    ranked.push({ candidate, originalCandidate: candidate.candidate, score, rank: 0, routeStyle: config.style,
      effectiveStyle, metrics: m, reasons: override ? [{ code: 'CUSTOM_POLICY', message: 'Caller-supplied ranking policy', contribution: score }] : reasons,
      warnings: [...candidate.warnings, ...common] });
  }
  ranked.sort((a, b) => a.score - b.score);
  const selected: RankedPlannerCandidate[] = [];
  for (const result of ranked) {
    if (selected.length >= limit) break;
    if ((options.diversity ?? !override) && selected.some(other => nearDuplicate(other.originalCandidate.route, result.originalCandidate.route))) continue;
    selected.push({ ...result, rank: selected.length + 1 });
  }
  return { status: 'RANKED', candidates: selected, warnings };
}
