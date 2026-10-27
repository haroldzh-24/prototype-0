/**
 * Drill runs without sessions: the app files each run under one record per local day and practice context
 * (dry fire, live fire, match), created on the first run of the day. Older hand-made sessions keep working and their
 * runs count the same; they show under History.
 */
import type { TrainingRecord } from './model';
import type { TrainingContext } from './observations';
import { analyzeLibraryRun, libraryDrill, variantLabel } from './drillLibrary';
import type { LibraryDrill, LibraryRun } from './drillLibrary';
import type { PowerFactor } from '../profile/model';
import { analyzeVideo } from './videoAnalysis';
import type { TimelineEvent, TrainingVideo, VideoSession } from './videoModel';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day, YYYY-MM-DD. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/** A real calendar day (2026-02-31 is not: dates roll over, so the day must read back unchanged). */
export const validDay = (day: unknown): day is string => typeof day === 'string' && DAY.test(day) && Number.isFinite(Date.parse(day + 'T12:00:00Z'))
  && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day;
export const isDrillDay = (record: Pick<TrainingRecord, 'kind'>) => record.kind === 'drillDay';

/** A record holds at most 500 runs and 100 videos (the repository's limits); a full one makes way for a new one. */
export function drillDayFor(records: readonly TrainingRecord[], day: string, context: TrainingContext, withVideo = false): TrainingRecord | undefined {
  return records.find(r => isDrillDay(r) && r.day === day && (r.context ?? 'DRY_FIRE') === context && (r.libraryRuns?.length ?? 0) < 500
    && (!withVideo || (r.videos?.length ?? 0) < 100));
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

/** A run's video as picked and timed in the drill sheet (see DrillVideo.tsx). */
export type PickedVideo = { id: string; asset: VideoSession['asset']; durationMs: number | null; timing: { beepMs: number } | null };
/**
 * Add a run and its video to a record. The video's timeline is the run's saved times placed from the beep the audio
 * found (so it always matches what was logged, even after you edited a time); with no beep it has no events. Marks past
 * the end of the video are left out. The video is never contributed to the profile on its own: the run is.
 */
export function addRun(record: TrainingRecord, run: LibraryRun, video?: PickedVideo, now = new Date().toISOString()): TrainingRecord {
  const runs = [...(record.libraryRuns ?? []), video ? { ...run, videoId: video.id } : run];
  if (!video) return { ...record, libraryRuns: runs };
  const session: VideoSession = { id: video.id, trainingSessionId: record.id, drillId: record.drillId, asset: video.asset,
    durationMs: video.durationMs !== null && Number.isFinite(video.durationMs) && video.durationMs > 0 ? video.durationMs : null, fps: null,
    createdAt: run.recordedAt, importedAt: now, context: record.context ?? 'DRY_FIRE', analysisStatus: 'REVIEWED', analysisVersion: 1 };
  const beep = video.timing?.beepMs;
  const marks: TimelineEvent[] = beep === undefined ? [] : [
    { id: `run:${run.id}:beep`, type: 'STIMULUS', timestampMs: beep, source: 'DERIVED', confidence: 'CONFIRMED', confirmed: true },
    ...run.shotTimes.map((t, i): TimelineEvent => ({ id: `run:${run.id}:shot:${i + 1}`, type: 'SHOT', timestampMs: beep + t * 1000, source: 'DERIVED', confidence: 'CONFIRMED', confirmed: true }))];
  const events = marks.filter(e => session.durationMs === null || e.timestampMs <= session.durationMs);
  const clip: TrainingVideo = { session, analysis: analyzeVideo(session, events) };
  return { ...record, libraryRuns: runs, videos: [...(record.videos ?? []), clip] };
}
/** Remove a run, and its video with it. `discard` lists the video copies to delete after the save commits. */
export function removeRun(record: TrainingRecord, runId: string): { record: TrainingRecord; discard: VideoSession['asset'][] } {
  const run = record.libraryRuns?.find(r => r.id === runId);
  const videos = record.videos ?? [], gone = run?.videoId ? videos.filter(v => v.session.id === run.videoId) : [];
  return { record: { ...record, libraryRuns: (record.libraryRuns ?? []).filter(r => r.id !== runId), ...(gone.length ? { videos: videos.filter(v => !gone.includes(v)) } : {}) },
    discard: gone.map(v => v.session.asset) };
}
/** Videos that belong to a drill run (watched from the drill, never contributed on their own). */
export const runVideoIds = (record: TrainingRecord) => new Set((record.libraryRuns ?? []).flatMap(r => r.videoId ? [r.videoId] : []));

export type LastRun = { run: LibraryRun; label: string };
/** The newest drill-library run anywhere (the home screen's LAST DRILL). */
export function lastLibraryRun(records: readonly Pick<TrainingRecord, 'libraryRuns'>[]): LastRun | null {
  const runs = records.flatMap(r => r.libraryRuns ?? []).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  const drill = runs[0] && libraryDrill(runs[0].drillId);
  return drill ? { run: runs[0], label: variantLabel(drill, runs[0].choices) } : null;
}
