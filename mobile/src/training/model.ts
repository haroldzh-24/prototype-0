import type { TrainingContext } from './observations';
import type { TrainingVideo } from './videoModel';
export const startingTypes = {
  competitionHolster: 'Draw — Competition/Standard Holster',
  retentionHolster: 'Draw — Level II/III Holster',
  appendix: 'Draw — Appendix', lowReady: 'Low Ready', highReady: 'High Ready', surrender: 'Surrender Start',
} as const;
export type StartingType = keyof typeof startingTypes;
/** Times are seconds; occurredAt is an ISO timestamp. Null means not measured. */
export type TrainingRecord = {
  id: string; userId: string; drillId: string | null; drillName: string;
  occurredAt: string; startingType: StartingType; totalTime: number | null; notes: string;
  segments: { id: string; label: string; seconds: number }[];
  context?: TrainingContext;
  videos?: TrainingVideo[];
};
