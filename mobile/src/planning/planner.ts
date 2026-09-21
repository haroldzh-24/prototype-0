import type { ShooterPerformanceProfile } from '../profile/model';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from './model';
import { isEngageable } from './model';
import { evaluateRoute } from './route';
import type { RouteEvaluation, StageRoute } from './route';
import { shootingDifficulty } from './shootingDifficulty';
import type { ShootingDifficulty } from './shootingDifficulty';
import { deriveRankingMetrics } from './ranking';
import type { RankingMetrics, RankingReason } from './ranking';

export type RouteStyle =
  /** Favor fewer positions and less travel, accepting harder engagements. */
  | 'MINIMUM_MOVEMENT_HARDER_SHOOTING'
  /** Balance movement and engagement difficulty. */
  | 'BALANCED'
  /** Accept more travel for closer/easier engagements. */
  | 'MORE_MOVEMENT_EASIER_SHOOTING'
  /** Falls back until the profile supports difficulty-dependent shooting cost. */
  | 'PERSONALIZED';
export type MovementPreferences = Readonly<{ backwardMovement: 'AVOID' | 'LIMITED' | 'ALLOWED' }>;
export type ReloadStrategy = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';
/** Ranking preferences; never change route legality. */
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
    | 'UNCOVERED_TARGET' | 'NO_COVERAGE' | 'INVALID_LOADOUT' | 'NO_VALID_ROUTE' | 'SEARCH_LIMIT'
    | 'PROFILE_FALLBACK' | 'MOVING_RELOAD_OVERLAP_NOT_MODELED' | 'TIMING_UNAVAILABLE';
  message: string; candidateId?: string;
}>;
export type EvaluatedPlannerCandidate = Readonly<{
  candidate: PlannerCandidate;
  evaluation: RouteEvaluation;
  /** Per engagement, not per shot. Missing/non-scoring references remain evaluator warnings. */
  shootingDifficulty: readonly (ShootingDifficulty & { positionId: string; targetId: string })[];
  warnings: readonly PlannerWarning[];
  metrics: RankingMetrics;
}>;
export type RankedPlannerCandidate = Readonly<{
  candidate: EvaluatedPlannerCandidate; originalCandidate: PlannerCandidate; score: number;
  rank: number; routeStyle: RouteStyle; effectiveStyle: RouteStyle; metrics: RankingMetrics;
  reasons: readonly RankingReason[]; warnings: readonly PlannerWarning[];
}>;
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
    metrics: deriveRankingMetrics(context, candidate, evaluation, difficulty),
    warnings: evaluation.warnings.map(message => ({ code: 'ROUTE_EVALUATION', message, candidateId: candidate.id })),
  };
}

/** Optional legacy override; null excludes a candidate. Scores are not seconds. */
export type CandidateRankingPolicy = (candidate: EvaluatedPlannerCandidate, config: RoutePlannerConfig) => number | null;
export { rankCandidates, RANKING_CONFIG } from './ranking';
export type { RankingMetrics, RankingReason, RankingOptions } from './ranking';
