import type { TrainingContext } from './observations';
import type { StartingType } from './model';
import { plannedElements } from './executionComparison';
import type { ExecutionComparison, MappingKind } from './executionComparison';
import { positionTitleWithNote, SEP } from '../ui/words';

/** Practice types in sentence case (buttons use them upper-cased: DRY FIRE, LIVE FIRE, PRESSURE / MATCH). */
export const contextLabels: Record<TrainingContext, string> = {
  DRY_FIRE: 'Dry fire', LIVE_FIRE: 'Live fire', PRESSURE_MATCH: 'Pressure / match',
};
/** The practice type before a noun: "live-fire runs", "dry-fire numbers". */
export const practiceAdjectives: Record<TrainingContext, string> = {
  DRY_FIRE: 'dry-fire', LIVE_FIRE: 'live-fire', PRESSURE_MATCH: 'pressure / match',
};
/** Button labels for choosing a practice type, and back. */
export const practiceButtons = (contexts: readonly TrainingContext[]) => contexts.map(c => contextLabels[c].toUpperCase());
export const practiceOfButton = (contexts: readonly TrainingContext[], label: string) => contexts.find(c => contextLabels[c].toUpperCase() === label);
/** Where the plans get their numbers: the Profile's "Practice type for plans" (stored as calibrationContext). */
export const PLAN_PRACTICE_DEFAULT: TrainingContext = 'LIVE_FIRE';
/** The line under PRACTICE in a drill's LOG: whether this run will reach your plans. */
export function practiceLine(context: TrainingContext, planPractice: TrainingContext, counts: boolean): string {
  if (!counts) return 'Kept in the log only';
  return context === planPractice ? 'Counts toward your plans' : `Practice only${SEP}your plans use ${practiceAdjectives[planPractice]} runs`;
}
/** Training's intro, following the practice type your plans use. */
export function trainingIntro(planPractice: TrainingContext): string {
  const adjective = practiceAdjectives[planPractice];
  return `Pick a drill, run it on your timer, log it. ${adjective.charAt(0).toUpperCase() + adjective.slice(1)} runs that count update YOUR NUMBERS, which your plans use.`;
}
/** Why MARK ON TARGET or the movement breakdown isn't offered (shown instead of hiding them). */
export const MARK_ON_TARGET_NOTE = 'Marking hits works on single paper-target drills, live fire.';
export const BREAKDOWN_NOTE = 'Breakdown works on runs with a video whose beep was used. Older builds of the app break down only Bill Drill, Draw from hands at sides and standing Reload.';
export const READ_ONLY_NOTE = 'Read-only: recorded before the drill library.';
export const startLabels: Record<StartingType, string> = {
  competitionHolster: 'Competition Holster', retentionHolster: 'Level II / III Holster',
  appendix: 'Appendix', lowReady: 'Low Ready', highReady: 'High Ready', surrender: 'Surrender',
};
export function metricValue(value: number | null | undefined, unit: string): string {
  // Measured values are averages: two decimals are plenty (0.2426666 s reads as 0.24 s).
  return typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(2))} ${unit}` : '—';
}

/** Presentation only: persisted mapping IDs and comparison calculations stay intact. */
export function labeledPlanElements(comparison: ExecutionComparison, kind: MappingKind) {
  return plannedElements(comparison, kind).map(element => {
    if (kind !== 'MOVEMENT') return element;
    const route = comparison.snapshot?.plan.route;
    const segment = comparison.snapshot?.evaluation.segments.find(s => s.toId === element.id);
    if (!route || !segment) return element;
    const label = (id: string) => { const index = route.positions.findIndex(p => p.id === id); return index < 0 ? 'Start' : positionTitleWithNote(index, route.positions[index].label); };
    return { ...element, label: `${label(segment.fromId)} → ${label(segment.toId)}` };
  });
}
