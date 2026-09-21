import { evaluateCandidate, generateCandidates, rankCandidates } from './planner';
import type { PlannerContext, PlannerResult, RoutePlannerConfig } from './planner';
import type { StagePlan } from './model';
import type { StageRoute } from './route';

/** Presentation mapping only; all metrics and route decisions come from the planner. */
export function mapPlannerResults(result: PlannerResult) {
  return result.candidates.slice(0, 3).map(item => ({
    id: item.originalCandidate.id, route: item.originalCandidate.route,
    estimatedTime: item.metrics.estimatedTotalTime, movementDistance: item.metrics.movementDistance,
    positions: item.metrics.positionsUsed, reloads: item.metrics.reloadCount,
    roundsRemaining: item.metrics.roundsRemaining, routeStyle: item.effectiveStyle,
    personalizedFallback: item.warnings.some(w => w.code === 'PROFILE_FALLBACK'),
  }));
}
export type PlannerCard = ReturnType<typeof mapPlannerResults>[number];

export function generatePlannerCards(context: PlannerContext, config: RoutePlannerConfig) {
  const generated = generateCandidates(context, config);
  const ranked = rankCandidates(generated.candidates.map(candidate => evaluateCandidate(context, candidate)), config, { maxResults: 3 });
  return {
    cards: mapPlannerResults(ranked),
    message: generated.warnings.find(w => w.code !== 'SEARCH_LIMIT')?.message,
  };
}

/** Returning null requests confirmation without mutating the current plan or result. */
export function copyPlannerRoute(plan: StagePlan, route: StageRoute, confirmed = false): StagePlan | null {
  if (plan.route && !confirmed) return null;
  return { ...plan, route: { ...route,
    positions: route.positions.map(p => ({ ...p, position: { ...p.position },
      visibleTargetIds: [...p.visibleTargetIds], engagedTargetIds: [...p.engagedTargetIds] })),
    reloads: route.reloads.map(reload => ({ ...reload })),
  } };
}
