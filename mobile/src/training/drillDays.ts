/**
 * Drill runs without sessions: the app files each run under one record per local day and practice context
 * (dry fire, live fire, match), created on the first run of the day. Older hand-made sessions keep working and their
 * runs count the same; they show under History.
 */
import type { TrainingRecord } from './model';
import type { TrainingContext } from './observations';
import { analyzeLibraryRun, libraryDrill } from './drillLibrary';
import type { LibraryDrill, LibraryRun } from './drillLibrary';
import type { PowerFactor } from '../profile/model';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day, YYYY-MM-DD. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export const validDay = (day: unknown): day is string => typeof day === 'string' && DAY.test(day) && Number.isFinite(Date.parse(day + 'T12:00:00Z'));
export const isDrillDay = (record: Pick<TrainingRecord, 'kind'>) => record.kind === 'drillDay';

export function drillDayFor(records: readonly TrainingRecord[], day: string, context: TrainingContext): TrainingRecord | undefined {
  return records.find(r => isDrillDay(r) && r.day === day && (r.context ?? 'DRY_FIRE') === context && (r.libraryRuns?.length ?? 0) < 500);
}
export function newDrillDay(id: string, day: string, context: TrainingContext, occurredAt: string): TrainingRecord {
  return { id, userId: 'local', kind: 'drillDay', day, context, drillId: null, drillName: 'Drills', occurredAt, startingType: 'competitionHolster',
    totalTime: null, notes: '', segments: [], videos: [], libraryRuns: [] };
}
/** The record that holds a saved run, to change or remove it. */
export const recordOfRun = (records: readonly TrainingRecord[], runId: string) => records.find(r => r.libraryRuns?.some(run => run.id === runId));

export type DrillRunEntry = { run: LibraryRun; recordId: string; context: TrainingContext };
/** Every saved run of one drill (all options, every context), newest first. */
export function runsOfDrill(records: readonly TrainingRecord[], drillId: string): DrillRunEntry[] {
  return records.flatMap(r => (r.libraryRuns ?? []).filter(run => run.drillId === drillId).map(run => ({ run, recordId: r.id, context: r.context ?? 'DRY_FIRE' })))
    .sort((a, b) => Date.parse(b.run.recordedAt) - Date.parse(a.run.recordedAt));
}

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
/** One-line summary of a run: time, points and hit factor. */
export function runText(run: LibraryRun, powerFactor: PowerFactor = 'minor'): string {
  const score = analyzeLibraryRun(run, powerFactor)?.score ?? null;
  return [run.totalTime !== null ? run.totalTime.toFixed(2) + ' s' : null, score ? Math.round(score.percent * 100) + '% points' : null,
    score?.hitFactor != null ? 'HF ' + score.hitFactor.toFixed(2) : null, run.counts === false ? 'log only' : null].filter(Boolean).join(' · ') || 'no time';
}
/** The drill card's second line: how much you've logged and the latest run. */
export function drillCardText(records: readonly TrainingRecord[], drill: LibraryDrill, powerFactor: PowerFactor = 'minor'): string {
  const runs = runsOfDrill(records, drill.id);
  if (!runs.length) return drill.gives + '\nNo runs yet';
  const last = runs[0].run;
  return drill.gives + `\n${runs.length} run${runs.length === 1 ? '' : 's'} · last ${date(last.recordedAt)}, ${runText(last, powerFactor)}`;
}
/** History list: newest first; drill days are titled by their date. */
export function historyTitle(record: TrainingRecord): string {
  return isDrillDay(record) && record.day ? 'Drills · ' + new Date(record.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : record.drillName || 'Practice session';
}
export function historyDetail(record: TrainingRecord): string {
  const library = record.libraryRuns?.length ?? 0, logged = record.runs?.length ?? 0, videos = record.videos?.length ?? 0;
  const drills = [...new Set((record.libraryRuns ?? []).map(r => libraryDrill(r.drillId)?.name).filter(Boolean))];
  return [library ? `${library} drill run${library === 1 ? '' : 's'}` + (drills.length ? ': ' + drills.slice(0, 3).join(', ') + (drills.length > 3 ? '…' : '') : '') : null,
    logged ? `${logged} logged run${logged === 1 ? '' : 's'}` : null, videos ? `${videos} video${videos === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'Empty';
}
