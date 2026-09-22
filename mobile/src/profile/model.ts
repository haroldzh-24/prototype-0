import type { PerformanceObservation, TrainingContext } from '../training/observations';
export type TimingFactor = 'drawTime' | 'reloadTime' | 'averageSplitTime' | 'transitionTime' | 'movementSpeed';
/** Metadata describes the existing scalar; it never stores a duplicate timing value. */
export type PerformanceEvidence = {
  source: 'MANUAL' | 'MEASURED'; sampleCount?: number;
  standardDeviation?: number; measuredAt?: string;
  origin?: 'VIDEO_ANALYSIS' | 'TRAINING'; context?: TrainingContext;
};
export type ShootingObservation = {
  difficultyModel: 'DISTANCE_ONLY'; difficulty: number; splitTime: number;
  sampleCount: number; standardDeviation?: number; measuredAt?: string;
};
/** Estimates only, in seconds and inches/second; independent of physical stages. */
export type ShooterPerformanceProfile = {
  drawTime: number; reloadTime: number; averageSplitTime: number; transitionTime: number;
  movementSpeed: number; magazineCapacity: number; startingRounds: number; chamberedRound: boolean;
  timingEvidence?: Partial<Record<TimingFactor, PerformanceEvidence>>;
  shootingObservations?: ShootingObservation[];
};
export type UserProfile = { id: string; displayName: string; identity: { provider: 'local' | 'apple'; subject: string | null }; performance: ShooterPerformanceProfile;
  performanceObservations?: PerformanceObservation[]; videoCalibrationBase?: ShooterPerformanceProfile; calibrationContext?: TrainingContext;
  calibrationInputs?: { version: 1; baseline: ShooterPerformanceProfile; manualOverrides: Partial<Record<TimingFactor, number>> };
  calibrationWarnings?: string[] };
export const createLocalProfile = (): UserProfile => ({
  id: 'local', displayName: 'Local shooter', identity: { provider: 'local', subject: null },
  performance: { drawTime: 1.5, reloadTime: 2, averageSplitTime: 0.25, transitionTime: 0.4,
    movementSpeed: 120, magazineCapacity: 15, startingRounds: 15, chamberedRound: false },
});
