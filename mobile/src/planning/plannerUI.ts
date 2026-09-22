import type { PositionMetadata } from './positionSources';
import { evaluateCandidate, generateCandidates, rankCandidates } from './planner';
import type { PlannerContext, PlannerResult, RoutePlannerConfig, RankingMetrics, PlannerWarning } from './planner';
import type { StagePlan } from './model';
import type { StageRoute } from './route';

/** Presentation mapping only; all metrics and route decisions come from the planner. */
export function mapPlannerResults(result: PlannerResult, sources: Record<string, PositionMetadata> = {}) {
  const candidates = result.candidates.slice(0, 3);
  return candidates.map((item, index) => ({
    number: index + 1,
    label: candidates.length > 1 && candidates.every(other => other === item || item.metrics.movementDistance < other.metrics.movementDistance) ? 'Lowest Movement'
      : candidates.length > 1 && candidates.every(other => other === item || item.metrics.averageShootingDifficulty < other.metrics.averageShootingDifficulty) ? 'Easier Shooting'
      : index === 0 ? 'Recommended Candidate' : 'Alternative Candidate',
    sourceCounts: { auto: item.originalCandidate.route.positions.filter(p => sources[p.id]?.source === 'AUTO_DISCOVERED').length, manual: item.originalCandidate.route.positions.filter(p => sources[p.id]?.source !== 'AUTO_DISCOVERED').length },
    id: item.originalCandidate.id, route: item.originalCandidate.route,
    estimatedTime: item.metrics.estimatedTotalTime, movementDistance: item.metrics.movementDistance,
    positions: item.metrics.positionsUsed, reloads: item.metrics.reloadCount,
    roundsRemaining: item.metrics.roundsRemaining, routeStyle: item.effectiveStyle,
    personalizedFallback: item.warnings.some(w => w.code === 'PROFILE_FALLBACK'),
    reasons: item.reasons.map(reason => reason.message),
    details: plannerDetails(item.metrics),
    comparison: `Average difficulty ${item.metrics.averageShootingDifficulty.toFixed(1)} · Ammo margin ${item.metrics.ammoMargin} rounds`,
  }));
}
export type PlannerCard = ReturnType<typeof mapPlannerResults>[number];

export function generatePlannerCards(context: PlannerContext, config: RoutePlannerConfig, sources: Record<string, PositionMetadata> = {}) {
  const generated = generateCandidates(context, config);
  const ranked = rankCandidates(generated.candidates.map(candidate => evaluateCandidate(context, candidate)), config, { maxResults: 3 });
  return {
    cards: mapPlannerResults(ranked, sources),
    message: generated.warnings.find(w => w.code !== 'SEARCH_LIMIT')?.message,
    searchWarning: plannerSearchWarning(generated.warnings),
  };
}

export const rulesets = ['USPSA', 'IDPA', 'PCSL', 'CUSTOM'] as const;
export type PlannerRuleset = typeof rulesets[number];
export type PlannerRuleConstraints = Readonly<{
  magazineCapacity?: number; reloadRestrictions?: readonly string[]; engagementOrder?: readonly string[];
}>;
/** Session metadata only. Add independently modeled constraints here when supported. */
export function rulesetMetadata(choice: PlannerRuleset) {
  return { choice, label: choice === 'CUSTOM' ? 'Custom / Vanilla' : choice,
    constraints: {} as PlannerRuleConstraints,
    description: 'General ammunition and timing evaluation only. USPSA, IDPA and PCSL currently behave identically to Custom / Vanilla. Competition capacity, reload, engagement-order and penalty rules are not modeled.' };
}
export function plannerSearchWarning(warnings: readonly PlannerWarning[]) {
  return warnings.find(w => w.code === 'SEARCH_LIMIT') ?? null;
}
export function plannerDetails(m: RankingMetrics) {
  const seconds = (n: number | null) => n === null ? 'Unavailable' : `${n.toFixed(2)} s`;
  return [
    ['Total shooting difficulty', m.totalShootingDifficulty.toFixed(1)],
    ['Average shooting difficulty', m.averageShootingDifficulty.toFixed(1)],
    ['Maximum target difficulty', m.maximumSingleTargetDifficulty.toFixed(1)],
    ['Rounds remaining (loaded)', `${m.roundsRemaining} rounds`],
    ['Minimum ammo margin', `${m.ammoMargin} rounds`],
    ['Movement complexity (index)', m.movementComplexityScore.toFixed(1)],
    ['Direction changes / sharp reversals', `${m.directionChangeCount} / ${m.sharpReversalCount}`],
    ['Backward movement (estimate)', `${(m.backwardDistance / 12).toFixed(1)} ft / ${m.backwardSegmentCount} segments`],
    ['Sustained retreat (estimate)', `${(m.sustainedBackwardDistance / 12).toFixed(1)} ft`],
    ['Raw reload duration', seconds(m.rawReloadDuration)],
    ['Movement available for reloads', seconds(m.reloadMovementAvailable)],
    ['Reload overlap with movement', seconds(m.reloadOverlap)],
    ['Additional reload time', seconds(m.reloadTime)],
  ].map(([label, value]) => ({ label, value }));
}

/** Canvas selection only: never assigns to plan.route or copies a candidate into it. */
export function plannerPreviewRoute(plan: StagePlan, candidate: PlannerCard | null) {
  return candidate?.route ?? plan.route;
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
