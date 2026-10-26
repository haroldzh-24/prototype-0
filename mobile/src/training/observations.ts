import { createLocalProfile } from '../profile/model';
import type { ShooterPerformanceProfile, TimingFactor, UserProfile } from '../profile/model';
import { buildPersonalizedModel, timingFactors } from '../profile/personalizedPerformance';
import { fitMovement, moveDirections } from '../profile/movementModel';
import { buildHitModel } from '../profile/hitModel';
import { inchesToYards } from '../stage/measurements';
import type { HitCounts, HitKind } from '../profile/hitModel';
import type { MoveDirection } from '../profile/movementModel';
import { startingTypes } from './model';
import type { StartingType } from './model';

export const trainingContexts = ['DRY_FIRE', 'LIVE_FIRE', 'PRESSURE_MATCH'] as const;
export type TrainingContext = typeof trainingContexts[number];
/** `hitZones` is not a time: its value is the required hits (paper) or shots (steel) its `hits` counts cover. */
export type ObservationFactor = TimingFactor | 'stimulusResponseTime' | 'firstShotAcquisitionTime' | 'hitZones';
export type ObservationSource = 'VIDEO_ANALYSIS' | 'MANUAL_ENTRY' | 'STRUCTURED_TRAINING' | 'AUTOMATIC_DETECTOR';
/** Seconds, or physical inches/second for movementSpeed. Difficulty is the planner's points-per-yard scale. */
export type PerformanceObservation = {
  id: string; factor: ObservationFactor; value: number; context: TrainingContext; measuredAt: string;
  source: ObservationSource; trainingSessionId?: string; drillId?: string; videoId?: string; analysisVersion?: number;
  eventIds?: string[]; evidenceKey?: string; confirmed?: boolean;
  difficultyModel?: 'DISTANCE_ONLY'; difficulty?: number; distanceInches?: number; durationSeconds?: number;
  excluded?: boolean; validity?: 'VALID' | 'INVALID';
  /** Conditions recorded by drill-library runs. Observations under a special condition stay out of the profile's
   *  general numbers (see `generalSample`) and feed their own tables instead. */
  movement?: MoveDirection; moving?: boolean; startingType?: StartingType;
  targetKind?: 'paper' | 'steel' | 'partial'; position?: 'square' | 'port' | 'lean';
  /** Transitions: distance between the two targets, inches. */
  spreadInches?: number;
  /** hitZones only: how the required hits (or steel shots) landed. */
  hits?: HitCounts;
};
/** Starts that are a draw from the holster with the hands relaxed; other starts get their own numbers. */
export const HOLSTER_STARTS: readonly StartingType[] = ['competitionHolster', 'retentionHolster', 'appendix'];
/**
 * True when an observation belongs in the profile's general value for its factor: draws from the holster, splits
 * and transitions standing square on full paper, reloads standing still. Moving, steel, partial-target, port/lean
 * and other-start samples are kept and shown separately; they never pull the general numbers.
 */
export function generalSample(o: PerformanceObservation): boolean {
  if (o.factor === 'drawTime') return !o.startingType || HOLSTER_STARTS.includes(o.startingType);
  if (o.factor === 'reloadTime') return o.moving !== true;
  if (o.factor === 'averageSplitTime') return o.moving !== true && (o.targetKind ?? 'paper') === 'paper' && (o.position ?? 'square') === 'square';
  if (o.factor === 'transitionTime') return o.moving !== true && o.targetKind !== 'steel' && (o.position ?? 'square') === 'square';
  return true;
}
const timedFactors: ObservationFactor[] = [...timingFactors, 'stimulusResponseTime', 'firstShotAcquisitionTime'];
const factors: ObservationFactor[] = [...timedFactors, 'hitZones'];
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export function isPerformanceObservation(input: unknown): input is PerformanceObservation {
  if (!input || typeof input !== 'object') return false;
  const o = input as PerformanceObservation;
  if (!text(o.id) || !factors.includes(o.factor) || !positive(o.value) || !trainingContexts.includes(o.context)
    || !text(o.measuredAt) || !Number.isFinite(Date.parse(o.measuredAt))
    || !['VIDEO_ANALYSIS', 'MANUAL_ENTRY', 'STRUCTURED_TRAINING', 'AUTOMATIC_DETECTOR'].includes(o.source)) return false;
  for (const key of ['trainingSessionId', 'drillId', 'videoId', 'evidenceKey'] as const)
    if (o[key] !== undefined && !text(o[key])) return false;
  if (o.analysisVersion !== undefined && (!Number.isSafeInteger(o.analysisVersion) || o.analysisVersion < 1)) return false;
  if (o.eventIds !== undefined && (!Array.isArray(o.eventIds) || !o.eventIds.every(text))) return false;
  if (o.confirmed !== undefined && typeof o.confirmed !== 'boolean' || o.excluded !== undefined && typeof o.excluded !== 'boolean') return false;
  if (o.validity !== undefined && !['VALID', 'INVALID'].includes(o.validity)) return false;
  if (o.difficulty !== undefined && (!nonnegative(o.difficulty) || o.difficultyModel !== 'DISTANCE_ONLY')) return false;
  if (o.difficultyModel !== undefined && o.difficultyModel !== 'DISTANCE_ONLY') return false;
  if (o.distanceInches !== undefined && !positive(o.distanceInches) || o.durationSeconds !== undefined && !positive(o.durationSeconds)) return false;
  if (o.movement !== undefined && (!moveDirections.includes(o.movement) || o.factor !== 'movementSpeed')) return false;
  if (o.moving !== undefined && typeof o.moving !== 'boolean') return false;
  if (o.startingType !== undefined && !Object.hasOwn(startingTypes, o.startingType)) return false;
  if (o.targetKind !== undefined && !['paper', 'steel', 'partial'].includes(o.targetKind)) return false;
  if (o.position !== undefined && !['square', 'port', 'lean'].includes(o.position)) return false;
  if (o.spreadInches !== undefined && !positive(o.spreadInches)) return false;
  const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 10000;
  if ((o.factor === 'hitZones') !== (o.hits !== undefined)) return false;
  if (o.hits !== undefined && (!o.hits || typeof o.hits !== 'object' || ![o.hits.a, o.hits.c, o.hits.d, o.hits.miss].every(count)
    || o.hits.a + o.hits.c + o.hits.d + o.hits.miss !== o.value || o.hits.noShoot !== undefined && !count(o.hits.noShoot))) return false;
  // Legacy 8A speed samples already certified physical distance at extraction; retain that format.
  if (o.factor === 'movementSpeed' && o.source !== 'VIDEO_ANALYSIS' && !positive(o.distanceInches)) return false;
  if (o.factor === 'movementSpeed' && o.durationSeconds !== undefined && o.distanceInches !== undefined
    && Math.abs(o.value - o.distanceInches / o.durationSeconds) > Math.max(1, o.value) * 1e-10) return false;
  return o.source !== 'VIDEO_ANALYSIS' || text(o.videoId) && text(o.trainingSessionId) && o.analysisVersion !== undefined;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
/** Conflicting valid versions remain in history, but none contributes until explicitly replaced/removed. */
export function validateObservations(input: unknown) {
  const warnings: string[] = [], groups = new Map<string, Map<string, PerformanceObservation>>();
  if (!Array.isArray(input)) return { observations: [] as PerformanceObservation[], eligible: [] as PerformanceObservation[], warnings: ['Malformed observation collection ignored.'] };
  for (const item of input) {
    if (!isPerformanceObservation(item)) { warnings.push('Invalid observation skipped.'); continue; }
    const group = groups.get(item.id) ?? new Map<string, PerformanceObservation>();
    group.set(canonical(item), item); groups.set(item.id, group);
  }
  const observations: PerformanceObservation[] = [], eligible: PerformanceObservation[] = [];
  for (const id of [...groups.keys()].sort()) {
    const group = groups.get(id)!;
    const versions = [...group.keys()].sort().map(key => group.get(key)!);
    observations.push(...versions);
    if (versions.length > 1) { warnings.push(`Conflicting observation ID excluded: ${id}`); continue; }
    const o = versions[0];
    if (o.excluded || o.validity === 'INVALID' || o.confirmed === false
      || ['VIDEO_ANALYSIS', 'AUTOMATIC_DETECTOR'].includes(o.source) && o.confirmed !== true) continue;
    eligible.push(o);
  }
  return { observations, eligible, warnings: [...new Set(warnings)].sort() };
}
export type SampleStatistics = { sampleCount: number; mean: number; standardDeviation: number; measuredAt: string; sources: ObservationSource[] };
function statistics(samples: PerformanceObservation[]): SampleStatistics {
  const mean = samples.reduce((sum, o) => sum + o.value / samples.length, 0);
  // Scaling keeps the sum of squares finite for large, structurally valid values.
  const scale = samples.reduce((max, o) => Math.max(max, o.value), 0);
  const standardDeviation = scale * Math.sqrt(samples.reduce((sum, o) => sum + ((o.value - mean) / scale) ** 2 / samples.length, 0));
  return { sampleCount: samples.length, mean, standardDeviation,
    measuredAt: new Date(samples.reduce((max, o) => Math.max(max, Date.parse(o.measuredAt)), -Infinity)).toISOString(),
    sources: [...new Set(samples.map(o => o.source))].sort() };
}
export type RebuildOptions = { baseline: ShooterPerformanceProfile; observations: unknown; context: TrainingContext;
  manualOverrides?: Partial<Record<TimingFactor, number>> };
/** The only measurement-to-profile boundary. Other contexts remain available as separate statistics. */
export function rebuildPerformanceProfile({ baseline, observations: input, context, manualOverrides = {} }: RebuildOptions) {
  if (!trainingContexts.includes(context)) throw new Error('Invalid calibration context.');
  const { observations, eligible, warnings } = validateObservations(input);
  const performance = { ...baseline, timingEvidence: { ...baseline.timingEvidence } };
  const aggregates = Object.fromEntries(trainingContexts.map(c => [c, {}])) as Record<TrainingContext, Partial<Record<ObservationFactor, SampleStatistics>>>;
  for (const c of trainingContexts) for (const factor of timedFactors) {
    const samples = eligible.filter(o => o.context === c && o.factor === factor && generalSample(o));
    if (samples.length) aggregates[c][factor] = statistics(samples);
  }
  const valueSources = {} as Record<TimingFactor, 'MANUAL_OVERRIDE' | 'MEASURED' | 'GENERIC_ESTIMATED'>;
  for (const factor of timingFactors) {
    const stats = aggregates[context][factor];
    const override = manualOverrides[factor] ?? (baseline.timingEvidence?.[factor]?.source === 'MANUAL' ? baseline[factor] : undefined);
    if (override !== undefined && !positive(override)) throw new Error(`Invalid manual override: ${factor}`);
    if (override !== undefined) {
      performance[factor] = override; performance.timingEvidence[factor] = { source: 'MANUAL' };
      valueSources[factor] = 'MANUAL_OVERRIDE';
    } else if (stats) {
      performance[factor] = stats.mean;
      performance.timingEvidence[factor] = { source: 'MEASURED', sampleCount: stats.sampleCount,
        standardDeviation: stats.standardDeviation, measuredAt: stats.measuredAt,
        origin: stats.sources.length === 1 && stats.sources[0] === 'VIDEO_ANALYSIS' ? 'VIDEO_ANALYSIS' : 'TRAINING', context };
      valueSources[factor] = 'MEASURED';
    } else valueSources[factor] = 'GENERIC_ESTIMATED';
  }
  const shooting = eligible.filter(o => o.context === context && o.factor === 'averageSplitTime' && o.difficulty !== undefined && generalSample(o));
  const curve = [...new Set(shooting.map(o => o.difficulty!))].sort((a, b) => a - b).map(difficulty => {
    const stats = statistics(shooting.filter(o => o.difficulty === difficulty));
    return { difficultyModel: 'DISTANCE_ONLY' as const, difficulty, splitTime: stats.mean,
      sampleCount: stats.sampleCount, standardDeviation: stats.standardDeviation, measuredAt: stats.measuredAt };
  });
  // A split override applies to planner shooting costs too; measured curves remain in history/statistics.
  // The curve is derived like every measured value: rebuilt each time, gone when its measurements are gone.
  if (valueSources.averageSplitTime === 'MANUAL_OVERRIDE') performance.shootingObservations = [];
  else if (curve.length) performance.shootingObservations = curve;
  else delete performance.shootingObservations;
  // Every move with a measured distance and time, in this context; manual speed overrides keep the plain average.
  const moves = eligible.filter(o => o.context === context && o.factor === 'movementSpeed' && o.distanceInches !== undefined && o.durationSeconds !== undefined)
    .map(o => ({ direction: o.movement, distanceInches: o.distanceInches!, durationSeconds: o.durationSeconds! }));
  const movementModel = valueSources.movementSpeed === 'MANUAL_OVERRIDE' ? {} : fitMovement(moves);
  if (Object.keys(movementModel).length) performance.movementModel = movementModel; else delete performance.movementModel;
  // Hit shares by distance (paper standing square, partly covered paper, steel) for expected points per target.
  const kindOf = (o: PerformanceObservation): HitKind | null => o.moving || (o.position ?? 'square') !== 'square' ? null
    : o.targetKind === 'steel' ? 'steel' : o.targetKind === 'partial' ? 'partial' : 'paper';
  const hitModel = buildHitModel(eligible.filter(o => o.context === context && o.factor === 'hitZones' && o.hits && o.distanceInches !== undefined && kindOf(o))
    .map(o => ({ kind: kindOf(o)!, yards: inchesToYards(o.distanceInches!), hits: o.hits! })));
  if (Object.keys(hitModel).length) performance.hitModel = hitModel; else delete performance.hitModel;
  const model = buildPersonalizedModel(performance);
  return { performance, observations, aggregates, shootingAggregates: curve, valueSources, warnings,
    confidence: model.confidence, confidenceSupport: { factors: model.factors, curve: model.curve } };
}
export function calibrateObservations(base: ShooterPerformanceProfile, observations: PerformanceObservation[], context: TrainingContext) {
  return rebuildPerformanceProfile({ baseline: base, observations, context }).performance;
}
function inputsFor(profile: UserProfile, captureEdits = true): NonNullable<UserProfile['calibrationInputs']> {
  const existing = profile.calibrationInputs;
  const baseline = { ...(existing?.baseline ?? profile.videoCalibrationBase ?? profile.performance),
    timingEvidence: { ...(existing?.baseline ?? profile.videoCalibrationBase ?? profile.performance).timingEvidence },
    magazineCapacity: profile.performance.magazineCapacity, startingRounds: profile.performance.startingRounds, chamberedRound: profile.performance.chamberedRound };
  const manualOverrides = { ...existing?.manualOverrides };
  const expected = rebuildPerformanceProfile({ baseline, manualOverrides, observations: profile.performanceObservations ?? [],
    context: profile.calibrationContext ?? 'LIVE_FIRE' }).performance;
  for (const factor of timingFactors) {
    const explicit = profile.performance.timingEvidence?.[factor]?.source === 'MANUAL';
    // Detect later scalar edits against the previous rebuild, never an old baseline snapshot.
    const legacyOverwrittenManual = !existing && baseline.timingEvidence?.[factor]?.source === 'MANUAL'
      && profile.performance.timingEvidence?.[factor]?.source === 'MEASURED';
    const edited = !legacyOverwrittenManual && (captureEdits || !existing && !!profile.videoCalibrationBase)
      && (existing || profile.videoCalibrationBase) && profile.performance[factor] !== expected[factor];
    if (explicit || edited) manualOverrides[factor] = profile.performance[factor];
    // Legacy non-default scalars have no provenance. Preserve them conservatively as manual inputs.
    if (!existing && !baseline.timingEvidence?.[factor] && baseline[factor] !== createLocalProfile().performance[factor]) {
      manualOverrides[factor] ??= baseline[factor]; baseline[factor] = createLocalProfile().performance[factor];
    }
    if (baseline.timingEvidence?.[factor]?.source === 'MANUAL') {
      manualOverrides[factor] ??= baseline[factor];
      baseline[factor] = createLocalProfile().performance[factor]; delete baseline.timingEvidence![factor];
    }
  }
  return { version: 1, baseline, manualOverrides };
}
/** Derived fields (move fit, split curve): a rebuild without the data must not keep stale ones from the saved profile. */
function withDerived(performance: ShooterPerformanceProfile, rebuilt: ShooterPerformanceProfile): ShooterPerformanceProfile {
  const { movementModel: _model, shootingObservations: _curve, hitModel: _hits, ...rest } = performance;
  return { ...rest, ...(rebuilt.movementModel ? { movementModel: rebuilt.movementModel } : {}), ...(rebuilt.hitModel ? { hitModel: rebuilt.hitModel } : {}),
    ...(rebuilt.shootingObservations ? { shootingObservations: rebuilt.shootingObservations } : {}) };
}
export function withPerformanceObservations(profile: UserProfile, observations: unknown, context: TrainingContext = profile.calibrationContext ?? 'LIVE_FIRE', captureEdits = true): UserProfile {
  const calibrationInputs = inputsFor(profile, captureEdits);
  const result = rebuildPerformanceProfile({ ...calibrationInputs, observations, context });
  const { videoCalibrationBase: _legacy, ...rest } = profile;
  return { ...rest, calibrationInputs, performanceObservations: result.observations, calibrationContext: context,
    calibrationWarnings: result.warnings, performance: withDerived({ ...profile.performance, ...result.performance,
      magazineCapacity: profile.performance.magazineCapacity, startingRounds: profile.performance.startingRounds, chamberedRound: profile.performance.chamberedRound }, result.performance) };
}
/** Compatibility entry point used by Phase 8A. */
export const withVideoObservations = withPerformanceObservations;
export function setManualOverride(profile: UserProfile, factor: TimingFactor, value: number | null): UserProfile {
  if (!timingFactors.includes(factor) || value !== null && !positive(value)) throw new Error('Invalid manual override.');
  const calibrationInputs = inputsFor(profile);
  if (value === null) delete calibrationInputs.manualOverrides[factor]; else calibrationInputs.manualOverrides[factor] = value;
  const result = rebuildPerformanceProfile({ ...calibrationInputs, observations: profile.performanceObservations ?? [], context: profile.calibrationContext ?? 'LIVE_FIRE' });
  return { ...profile, calibrationInputs, performance: withDerived({ ...profile.performance, ...result.performance }, result.performance),
    performanceObservations: result.observations, calibrationWarnings: result.warnings };
}
/** Add detects conflicts; replace is an explicit revision of an ID; remove withdraws all versions. */
export function changeObservation(profile: UserProfile, change: { operation: 'add' | 'replace'; observation: PerformanceObservation } | { operation: 'remove'; id: string }) {
  const stored = validateObservations(profile.performanceObservations ?? []).observations;
  if (change.operation === 'remove') return withPerformanceObservations(profile, stored.filter(o => o.id !== change.id));
  if (!isPerformanceObservation(change.observation)) throw new Error('Invalid observation.');
  return withPerformanceObservations(profile, [...(change.operation === 'replace' ? stored.filter(o => o.id !== change.observation.id) : stored), change.observation]);
}
export function createTrainingObservation(input: PerformanceObservation): PerformanceObservation {
  if (!isPerformanceObservation(input)) throw new Error('Invalid observation.');
  return { ...input };
}
export function createMovementObservation(input: Omit<PerformanceObservation, 'factor' | 'value'> & { distanceInches: number; durationSeconds: number }) {
  return createTrainingObservation({ ...input, factor: 'movementSpeed', value: input.distanceInches / input.durationSeconds });
}
