import { createLocalProfile } from './model';
import type { PerformanceEvidence, ShooterPerformanceProfile, ShootingObservation, TimingFactor } from './model';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type FactorStatus = 'GENERIC' | 'PROFILE_ESTIMATE' | 'MANUAL' | 'MEASURED';
export const timingFactors: TimingFactor[] = ['movementSpeed', 'drawTime', 'reloadTime', 'averageSplitTime', 'transitionTime'];
export const factorLabels: Record<TimingFactor, string> = { movementSpeed: 'Movement', drawTime: 'Draw', reloadTime: 'Reload', averageSplitTime: 'Split', transitionTime: 'Transition' };
// Corruption guards, not performance predictions. Units match the existing profile.
const limits: Record<TimingFactor, [number, number]> = { movementSpeed: [1, 600], drawTime: [0.05, 60], reloadTime: [0.05, 60], averageSplitTime: [0.03, 10], transitionTime: [0.03, 10] };
const within = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
function quality(value: number, evidence: PerformanceEvidence): Confidence | null {
  if (!evidence || !['MANUAL', 'MEASURED'].includes(evidence.source)) return null;
  if (evidence.sampleCount !== undefined && (!Number.isSafeInteger(evidence.sampleCount) || evidence.sampleCount < 1 || evidence.sampleCount > 1e6)) return null;
  if (evidence.standardDeviation !== undefined && !within(evidence.standardDeviation, 0, value * 2)) return null;
  if (evidence.measuredAt !== undefined && (typeof evidence.measuredAt !== 'string' || !Number.isFinite(Date.parse(evidence.measuredAt)))) return null;
  if (evidence.source === 'MANUAL') return 'LOW';
  if (!evidence.sampleCount) return null;
  return evidence.sampleCount >= 5 && evidence.standardDeviation !== undefined && evidence.standardDeviation <= value * 0.5 ? 'HIGH' : evidence.sampleCount >= 2 ? 'MEDIUM' : 'LOW';
}
export type PersonalizedModel = {
  timingProfile: ShooterPerformanceProfile;
  factors: Record<TimingFactor, { status: FactorStatus; confidence: Confidence }>;
  curve: (ShootingObservation & { confidence: Confidence })[];
  usable: boolean; confidence: Confidence; using: string[]; fallback: string[]; warnings: string[];
};

/** No clocks or inferred training labels: the same stored profile gives the same model. */
export function buildPersonalizedModel(input: unknown): PersonalizedModel {
  const defaults = createLocalProfile().performance, timingProfile = { ...defaults };
  const profile = (input && typeof input === 'object' ? input : {}) as Partial<ShooterPerformanceProfile>;
  const factors = {} as PersonalizedModel['factors'], warnings: string[] = [];
  for (const key of timingFactors) {
    const value = profile[key], evidence = profile.timingEvidence?.[key];
    const valid = within(value, ...limits[key]), confidence = evidence ? quality(value as number, evidence) : 'LOW';
    let status: FactorStatus = 'GENERIC';
    if (valid && confidence && (evidence || value !== defaults[key])) {
      timingProfile[key] = value; status = evidence?.source ?? 'PROFILE_ESTIMATE';
    } else if (value !== undefined && (!valid || !confidence)) warnings.push(`${factorLabels[key]} data rejected; generic estimate used.`);
    factors[key] = { status, confidence: status === 'GENERIC' ? 'LOW' : confidence! };
  }
  const curve: PersonalizedModel['curve'] = [];
  if (profile.shootingObservations !== undefined && !Array.isArray(profile.shootingObservations)) warnings.push('Malformed shooting observations ignored.');
  const observations = Array.isArray(profile.shootingObservations) ? profile.shootingObservations : [];
  if (observations.length > 128) warnings.push('Shooting observation limit reached; only the first 128 records are considered.');
  for (const observation of observations.slice(0, 128)) {
    const confidence = observation && quality(observation.splitTime, { ...observation, source: 'MEASURED' });
    if (!observation || observation.difficultyModel !== 'DISTANCE_ONLY' || !within(observation.difficulty, 0, 1000)
      || !within(observation.splitTime, ...limits.averageSplitTime) || !confidence) {
      warnings.push('Invalid shooting observation ignored.'); continue;
    }
    curve.push({ ...observation, confidence });
  }
  // Duplicate aggregates may overlap samples. Choose the best-supported record, never invent a pooled count.
  curve.sort((a, b) => a.difficulty - b.difficulty || b.sampleCount - a.sampleCount || a.splitTime - b.splitTime);
  const unique = curve.filter((p, i) => !i || p.difficulty !== curve[i - 1].difficulty);
  const using = timingFactors.filter(k => factors[k].status !== 'GENERIC').map(k => factorLabels[k]);
  const fallback = timingFactors.filter(k => factors[k].status === 'GENERIC').map(k => factorLabels[k]);
  if (unique.length) using.push('Shooting difficulty'); else fallback.push('Shooting difficulty');
  const model: PersonalizedModel = { timingProfile, factors, curve: unique, usable: using.length > 0, confidence: 'LOW', using, fallback, warnings: [...new Set(warnings)] };
  model.confidence = getProfileConfidence(model);
  return model;
}

export function getProfileConfidence(model: PersonalizedModel): Confidence {
  if (model.curve.length >= 2 && model.curve.every(p => p.confidence === 'HIGH') && timingFactors.every(k => model.factors[k].confidence === 'HIGH')) return 'HIGH';
  if (model.curve.length >= 2 && model.curve.every(p => p.confidence !== 'LOW')
    || timingFactors.some(k => model.factors[k].status === 'MEASURED' && model.factors[k].confidence !== 'LOW')) return 'MEDIUM';
  return 'LOW';
}
export function estimateShootingCost(model: PersonalizedModel, difficulty: number) {
  const generic = { secondsPerSplit: model.timingProfile.averageSplitTime, status: 'FALLBACK' as const, confidence: 'LOW' as Confidence };
  if (!Number.isFinite(difficulty)) return generic;
  const exact = model.curve.find(p => p.difficulty === difficulty);
  if (exact) return { secondsPerSplit: exact.splitTime, status: 'MEASURED' as const, confidence: exact.confidence };
  const upper = model.curve.findIndex(p => p.difficulty > difficulty);
  if (upper < 1) return generic; // No extrapolation, including a one-point curve.
  const a = model.curve[upper - 1], b = model.curve[upper];
  const confidence = [a.confidence, b.confidence].includes('LOW') ? 'LOW' : [a.confidence, b.confidence].includes('MEDIUM') ? 'MEDIUM' : 'HIGH';
  return { secondsPerSplit: a.splitTime + (b.splitTime - a.splitTime) * (difficulty - a.difficulty) / (b.difficulty - a.difficulty), status: 'INTERPOLATED' as const, confidence };
}
export const estimateMovementCost = (model: PersonalizedModel, distanceInches: number) => ({ seconds: Number.isFinite(distanceInches) && distanceInches >= 0 ? distanceInches / model.timingProfile.movementSpeed : null, ...model.factors.movementSpeed });
// Generic transition timing only; angle/context observations can extend this boundary later.
export const estimateTransitionCost = (model: PersonalizedModel) => ({ seconds: model.timingProfile.transitionTime, ...model.factors.transitionTime });
// Raw duration only. The route evaluator alone computes moving-reload overlap.
export const estimateReloadCost = (model: PersonalizedModel) => ({ seconds: model.timingProfile.reloadTime, ...model.factors.reloadTime });
