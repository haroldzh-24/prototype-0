import type { ShooterPerformanceProfile, TimingFactor, UserProfile } from '../profile/model';
import { buildPersonalizedModel, timingFactors } from '../profile/personalizedPerformance';

export const trainingContexts = ['DRY_FIRE', 'LIVE_FIRE', 'PRESSURE_MATCH'] as const;
export type TrainingContext = typeof trainingContexts[number];
/** Uses the existing profile's units: seconds, or inches/second for movementSpeed. */
export type PerformanceObservation = {
  id: string; factor: TimingFactor; value: number; context: TrainingContext; measuredAt: string;
  source: 'VIDEO_ANALYSIS'; trainingSessionId: string; videoId: string; analysisVersion: number;
  eventIds: string[]; evidenceKey: string; confirmed: true;
};

/** Minimal deterministic bridge missing from the Phase 7A checkout. No mixing of contexts. */
export function calibrateObservations(base: ShooterPerformanceProfile, observations: PerformanceObservation[], context: TrainingContext): ShooterPerformanceProfile {
  const performance = { ...base, timingEvidence: { ...base.timingEvidence } };
  const unique = [...new Map(observations.map(o => [o.id, o])).values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const factor of timingFactors) {
    const samples = unique.filter(o => o.factor === factor && o.context === context && o.confirmed === true
      && o.source === 'VIDEO_ANALYSIS' && Number.isFinite(Date.parse(o.measuredAt))
      && buildPersonalizedModel({ [factor]: o.value, timingEvidence: { [factor]: { source: 'MEASURED', sampleCount: 1 } } }).factors[factor].status === 'MEASURED');
    if (!samples.length) continue;
    const mean = samples.reduce((sum, o) => sum + o.value, 0) / samples.length;
    performance[factor] = mean;
    performance.timingEvidence[factor] = { source: 'MEASURED', sampleCount: samples.length,
      standardDeviation: Math.sqrt(samples.reduce((sum, o) => sum + (o.value - mean) ** 2, 0) / samples.length),
      measuredAt: samples.map(o => o.measuredAt).sort().at(-1), origin: 'VIDEO_ANALYSIS', context };
  }
  return performance;
}
export function withVideoObservations(profile: UserProfile, observations: PerformanceObservation[], context: TrainingContext): UserProfile {
  const base = profile.videoCalibrationBase ?? profile.performance;
  const calibrated = calibrateObservations(base, observations, context);
  const performance = { ...profile.performance, timingEvidence: calibrated.timingEvidence };
  for (const factor of timingFactors) performance[factor] = calibrated[factor];
  return { ...profile, videoCalibrationBase: base, performanceObservations: observations, calibrationContext: context,
    performance };
}
