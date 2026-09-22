import { buildPersonalizedModel, estimateShootingCost, factorLabels, timingFactors } from '../profile/personalizedPerformance';
import type { Confidence } from '../profile/personalizedPerformance';
import type { PlannerCandidate, PlannerContext } from './planner';
import type { ShootingDifficulty } from './shootingDifficulty';
import { evaluateRoute } from './route';

/** Adapt a per-target split curve into the evaluator's existing average split input.
 * The weighted average reproduces the sum of observed per-target split costs;
 * draw, transitions, travel, ammunition and overlap stay entirely in evaluateRoute.
 */
export function evaluatePersonalizedRoute(context: PlannerContext, candidate: PlannerCandidate,
  difficulty: readonly (ShootingDifficulty & { targetId: string })[]) {
  const model = buildPersonalizedModel(context.profile);
  let weighted = 0, splits = 0, curveSplits = 0, fallbackSplits = 0;
  for (const target of difficulty) {
    const rounds = context.plan.engagements[target.targetId];
    if (!Number.isSafeInteger(rounds) || rounds <= 1) continue;
    const count = rounds - 1, estimate = estimateShootingCost(model, target.score);
    weighted += count * estimate.secondsPerSplit; splits += count;
    if (estimate.status === 'FALLBACK') fallbackSplits += count; else curveSplits += count;
  }
  const timingProfile = { ...model.timingProfile, averageSplitTime: splits ? weighted / splits : model.timingProfile.averageSplitTime };
  const evaluation = evaluateRoute(context.stage, context.plan, candidate.route, timingProfile);
  const usable = timingFactors.some(k => model.factors[k].status !== 'GENERIC') || curveSplits > 0;
  let confidence: Confidence = model.confidence;
  if (!usable) confidence = 'LOW';
  else if (fallbackSplits > 0 && confidence === 'HIGH') confidence = 'MEDIUM';
  const relevantFactors = timingFactors.filter(k => k === 'movementSpeed' ? evaluation.distance > 0
    : k === 'reloadTime' ? evaluation.magazineChanges > 0
    : k === 'averageSplitTime' ? fallbackSplits > 0
    : k === 'transitionTime' ? (evaluation.timing?.transitions ?? 0) > 0 : (evaluation.timing?.draw ?? 0) > 0);
  const using = relevantFactors.filter(k => model.factors[k].status !== 'GENERIC').map(k => factorLabels[k]);
  const fallback = relevantFactors.filter(k => model.factors[k].status === 'GENERIC').map(k => factorLabels[k]);
  if (curveSplits) using.push('Shooting difficulty');
  if (fallbackSplits) fallback.push('Shooting difficulty');
  const explanations = relevantFactors.map(k => `${factorLabels[k]}: ${model.factors[k].status === 'GENERIC' ? 'generic estimate' : model.factors[k].status === 'PROFILE_ESTIMATE' ? 'unverified profile estimate' : model.factors[k].status === 'MANUAL' ? 'manual profile estimate' : 'recorded measurement'} used.`);
  if (curveSplits) explanations.push(`Recorded shooting-difficulty curve supplies ${curveSplits} firing intervals; interpolation stays within recorded difficulty values.`);
  if (fallbackSplits) explanations.push(`Shooting-distance data is limited: ${fallbackSplits} firing intervals use the baseline split estimate; no extrapolation.`);
  if (!splits) explanations.push('No firing splits on this route; difficulty-dependent first-shot acquisition is not modeled.');
  if (evaluation.timing && evaluation.timing.reloadOverlap > 0 && model.factors.reloadTime.status === 'MEASURED') {
    explanations.push(`Evaluator reports ${evaluation.timing.reloadOverlap.toFixed(2)} s of the measured reload duration hidden by movement.`);
  }
  return { model, evaluation, timingProfile, usable, confidence, explanations, curveSplits, fallbackSplits, using, fallback };
}
export type PersonalizedRouteEstimate = ReturnType<typeof evaluatePersonalizedRoute>;
