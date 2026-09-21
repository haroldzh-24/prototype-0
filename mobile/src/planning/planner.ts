import type { ShooterPerformanceProfile } from '../profile/model';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from './model';
import { isEngageable } from './model';
import { evaluateRoute } from './route';
import type { RouteEvaluation, StageRoute } from './route';
import { shootingDifficulty } from './shootingDifficulty';
import type { ShootingDifficulty } from './shootingDifficulty';

export type RouteStyle =
  /** Favor fewer positions and less travel, accepting harder engagements. */
  | 'MINIMUM_MOVEMENT_HARDER_SHOOTING'
  /** Balance movement and engagement difficulty. */
  | 'BALANCED'
  /** Accept more travel for closer/easier engagements. */
  | 'MORE_MOVEMENT_EASIER_SHOOTING'
  /** Future policy calibrated from ShooterPerformanceProfile. */
  | 'PERSONALIZED';
export type MovementPreferences = Readonly<{ backwardMovement: 'AVOID' | 'LIMITED' | 'ALLOWED' }>;
export type ReloadStrategy = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';
/** Policy intent only: backward limits, reload thresholds and style weights are deferred. */
export type RoutePlannerConfig = Readonly<{
  style: RouteStyle;
  movement: MovementPreferences;
  reloadStrategy: ReloadStrategy;
}>;
export const createRoutePlannerConfig = (): RoutePlannerConfig => ({
  style: 'BALANCED', movement: { backwardMovement: 'AVOID' }, reloadStrategy: 'BALANCED',
});
export type PlannerContext = Readonly<{
  stage: StageDocument; plan: StagePlan; profile: ShooterPerformanceProfile | null;
}>;
/** Reuse the manual route representation, including visibility, assignments and reloads. */
export type PlannerCandidate = Readonly<{ id: string; route: StageRoute }>;
export type PlannerWarning = Readonly<{
  code: 'ROUTE_EVALUATION' | 'NO_POSITIONS' | 'INVALID_INPUT' | 'INVALID_VISIBILITY'
    | 'UNCOVERED_TARGET' | 'NO_COVERAGE' | 'INVALID_LOADOUT' | 'NO_VALID_ROUTE' | 'SEARCH_LIMIT';
  message: string; candidateId?: string;
}>;
export type EvaluatedPlannerCandidate = Readonly<{
  candidate: PlannerCandidate;
  evaluation: RouteEvaluation;
  /** Per engagement, not per shot. Missing/non-scoring references remain evaluator warnings. */
  shootingDifficulty: readonly (ShootingDifficulty & { positionId: string; targetId: string })[];
  warnings: readonly PlannerWarning[];
}>;
export type RankedPlannerCandidate = Readonly<{ candidate: EvaluatedPlannerCandidate; score: number }>;
export type PlannerResult = Readonly<{
  status: 'NOT_IMPLEMENTED' | 'RANKED';
  candidates: readonly RankedPlannerCandidate[];
  warnings: readonly PlannerWarning[];
}>;
export { generateCandidates, PLANNER_SEARCH_LIMITS } from './candidateGeneration';
export type { CandidateGenerationResult, GeneratedPlannerCandidate, PlannerSearchLimits } from './candidateGeneration';

/** The existing evaluator is the sole source of distance, ammunition and all timing. */
export function evaluateCandidate(context: PlannerContext, candidate: PlannerCandidate): EvaluatedPlannerCandidate {
  const { stage, plan, profile } = context;
  const evaluation = evaluateRoute(stage, plan, candidate.route, profile);
  const targets = new Map(stage.objects.filter(isEngageable).map(target => [target.id, target]));
  const seen = new Set<string>();
  const difficulty: (ShootingDifficulty & { positionId: string; targetId: string })[] = [];
  for (const position of candidate.route.positions) for (const targetId of position.engagedTargetIds) {
    const target = targets.get(targetId);
    if (!target || seen.has(targetId)) continue;
    seen.add(targetId);
    difficulty.push({ positionId: position.id, targetId, ...shootingDifficulty(position.position, target.position) });
  }
  return { candidate, evaluation, shootingDifficulty: difficulty,
    warnings: evaluation.warnings.map(message => ({ code: 'ROUTE_EVALUATION', message, candidateId: candidate.id })),
  };
}

/** Future policy owns style weights, preference enforcement and personalized scoring.
 * Return null to exclude a candidate (e.g. incomplete or infeasible); lower scores rank first.
 * Scores are not seconds. No default optimizer policy is implemented in this phase.
 */
export type CandidateRankingPolicy = (candidate: EvaluatedPlannerCandidate, config: RoutePlannerConfig) => number | null;
export function rankCandidates(candidates: readonly EvaluatedPlannerCandidate[], config: RoutePlannerConfig,
  scoreCandidate: CandidateRankingPolicy): PlannerResult {
  const ranked: RankedPlannerCandidate[] = [];
  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, config);
    if (score === null) continue;
    if (!Number.isFinite(score)) throw new Error('Planner ranking scores must be finite or null.');
    ranked.push({ candidate, score });
  }
  // Stable sort preserves input order on ties; the caller's array is never sorted in place.
  ranked.sort((a, b) => a.score - b.score);
  return { status: 'RANKED', candidates: ranked, warnings: candidates.flatMap(candidate => candidate.warnings) };
}
