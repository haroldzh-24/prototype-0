import type { TrainingContext } from './observations';
import type { TrainingVideo } from './videoModel';
import type { DrillRun } from './drillLog';
import type { LibraryRun } from './drillLibrary';
export const startingTypes = {
  competitionHolster: 'Draw — Competition/Standard Holster',
  retentionHolster: 'Draw — Level II/III Holster',
  appendix: 'Draw — Appendix', lowReady: 'Low Ready', highReady: 'High Ready', surrender: 'Surrender Start',
} as const;
export type StartingType = keyof typeof startingTypes;
/** Times are seconds; occurredAt is an ISO timestamp. Null means not measured. */
export type TrainingRecord = {
  id: string; userId: string;
  /** Links sessions of the same drill. Sessions created with "Repeat drill" share `drillKey(original)`. */
  drillId: string | null; drillName: string;
  occurredAt: string; startingType: StartingType;
  /** Legacy session-level timing kept for saved data compatibility; per-run timing lives on `runs`. */
  totalTime: number | null; notes: string;
  /** Legacy session-level segments kept for saved data compatibility; per-run splits live on `runs`. */
  segments: { id: string; label: string; seconds: number }[];
  context?: TrainingContext;
  videos?: TrainingVideo[];
  /** Drill runs with individual hit coordinates. */
  runs?: DrillRun[];
  /** Drill-library runs (timer times and zone counts); they feed the profile, see `libraryObservations`. */
  libraryRuns?: LibraryRun[];
  /**
   * 'drillDay': the record the app keeps for one day's drill runs in one context (see `drillDays.ts`); the shooter
   * never creates or names it. Missing: a session created by hand in an earlier version.
   */
  kind?: 'drillDay';
  /** Local calendar day of a drill day, YYYY-MM-DD. */
  day?: string;
};
/** Stable drill identity: the shared drillId, or one derived from the first session of a drill. */
export const drillKey = (record: Pick<TrainingRecord, 'id' | 'drillId'>) => record.drillId ?? `drill-${record.id}`;
