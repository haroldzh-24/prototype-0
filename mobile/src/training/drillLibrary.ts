/**
 * Drill library (roadmap C1, C2): short drills, one timer run each, that pin down the numbers the planner uses.
 *
 * You enter the shot times your timer lists (or the splits); each drill knows what happened before every shot
 * (draw, split, transition, reload, move), so one run gives draw time, splits, transitions, reloads and move times
 * at once. Hits are counted by zone and scored with the same rules as the drill logger (src/training/drillLog.ts).
 * Runs become profile measurements (`libraryObservations`), re-derived from the saved run every time, never typed in.
 */
import type { StartingType } from './model';
import type { PerformanceObservation, TrainingContext } from './observations';
import type { MoveDirection } from '../profile/movementModel';
import type { HitCounts } from '../profile/hitModel';
import { yardsToInches } from '../stage/measurements';
import type { PowerFactor } from '../profile/model';
import { MAX_HITS_PER_RUN, PENALTY_TAGS, scoreRun, zoneChoices } from './drillLog';
import type { DrillHit } from './drillLog';
import { savedPhasesProblem } from './movementPhases';
import type { PhaseKind, SavedPhases } from './movementPhases';

export type IntervalKind = 'start' | 'split' | 'transition' | 'reload' | 'move' | 'shot';
export const intervalLabels: Record<IntervalKind, string> = {
  start: 'Start to first shot', split: 'Split', transition: 'Transition', reload: 'Reload', move: 'Move', shot: 'Shot to shot' };

export type LibraryFamily = 'USPSA' | 'PCSL';
export const libraryFamilies: readonly LibraryFamily[] = ['USPSA', 'PCSL'];
export type DrillChoice = { key: string; label: string; options: readonly { value: string; label: string }[]; initial: string };
export type Choices = Readonly<Record<string, string>>;
export type DrillGroup = 'Draw' | 'Shooting' | 'Transitions' | 'Reloads' | 'Movement' | 'Positions' | 'Combined';
export const drillGroups: readonly DrillGroup[] = ['Draw', 'Shooting', 'Transitions', 'Reloads', 'Movement', 'Positions', 'Combined'];

export type LibraryDrill = Readonly<{
  id: string; name: string; group: DrillGroup;
  setup: string; gives: string; planner: string;
  choices: readonly DrillChoice[];
  /** What happens before each shot; index 0 is the buzzer to the first shot. */
  intervals: readonly IntervalKind[];
  /** Steel: shots after the listed ones are makeups for misses. */
  makeups?: boolean;
  /** Paper hits the drill requires; null for steel (each plate is hit or missed). */
  requiredHits: number | null;
  /** Target distance in yards when the drill has no distance choice. */
  yards: number;
  /** Targets in the drill (zone counts are for the whole run, not per target). */
  targets: number;
}>;

const yd = (...values: number[]) => values.map(v => ({ value: String(v), label: v + ' YD' }));
const distance = (initial: number, ...values: number[]): DrillChoice => ({ key: 'distance', label: 'TARGET DISTANCE', options: yd(...values), initial: String(initial) });
const pairs = (n: number, between: IntervalKind): IntervalKind[] =>
  Array.from({ length: n }, (_, i) => i === 0 ? ['start', 'split'] as IntervalKind[] : [between, 'split'] as IntervalKind[]).flat();
const direction = (initial: MoveDirection): DrillChoice => ({ key: 'direction', label: 'DIRECTION', initial,
  options: [{ value: 'forward', label: 'FORWARD' }, { value: 'lateral', label: 'SIDEWAYS' }, { value: 'back', label: 'BACK' }] });

export const libraryDrills: readonly LibraryDrill[] = Object.freeze([
  { id: 'draw', targets: 1, name: 'Draw to first hit', group: 'Draw', yards: 7, requiredHits: 1, intervals: ['start'],
    setup: 'One target. From the buzzer, draw and fire one shot. Log runs from each start position you see at matches.',
    gives: 'Draw time for each start position, and how often the first shot is an A.', planner: 'Stage start time by start position.',
    choices: [{ key: 'start', label: 'START', initial: 'competitionHolster', options: [{ value: 'competitionHolster', label: 'HANDS AT SIDES' },
      { value: 'surrender', label: 'SURRENDER' }, { value: 'lowReady', label: 'LOW READY' }, { value: 'highReady', label: 'HIGH READY' }] }, distance(7, 5, 7, 10)] },
  { id: 'bill', targets: 1, name: 'Bill Drill', group: 'Shooting', yards: 7, requiredHits: 6, intervals: ['start', 'split', 'split', 'split', 'split', 'split'],
    setup: 'One target. Draw and fire six shots as fast as you can keep them in the A-zone.',
    gives: 'Close-target split, and the points you drop when you push.', planner: 'Split on close targets.', choices: [distance(7, 5, 7, 10)] },
  { id: 'ladder', targets: 1, name: 'Distance ladder', group: 'Shooting', yards: 5, requiredHits: 2, intervals: ['start', 'split'],
    setup: 'One target. Two shots from the buzzer at 5, 10, 15, 20 and 25 yd. Log one run per distance.',
    gives: 'Split and points at each distance.', planner: 'Time and expected hits per engagement by distance.', choices: [distance(5, 5, 10, 15, 20, 25)] },
  { id: 'blake', targets: 3, name: 'Blake Drill', group: 'Transitions', yards: 7, requiredHits: 6, intervals: pairs(3, 'transition'),
    setup: 'Three targets about 1 yd apart at 7 yd. Two shots on each.',
    gives: 'Split and transition on a tight array.', planner: 'Tight arrays.', choices: [] },
  { id: 'wide', targets: 2, name: 'Wide transitions', group: 'Transitions', yards: 7, requiredHits: 4, intervals: pairs(2, 'transition'),
    setup: 'Two targets the chosen distance apart. Two shots on each.',
    gives: 'Transition time against how far apart the targets are.', planner: 'Transitions that depend on the array.',
    choices: [{ key: 'spread', label: 'TARGETS APART', options: yd(1, 3, 5), initial: '3' }, distance(7, 7, 10, 15)] },
  { id: 'reload', targets: 1, name: 'Reload', group: 'Reloads', yards: 7, requiredHits: 2, intervals: ['start', 'reload'],
    setup: 'One target at 7 yd. One shot, reload, one shot. Stand still, or take a step during the reload.',
    gives: 'Shot-to-shot reload, standing and stepping.', planner: 'Where to reload; reloading on the move.',
    choices: [{ key: 'mode', label: 'DURING THE RELOAD', initial: 'standing', options: [{ value: 'standing', label: 'STANDING' }, { value: 'stepping', label: 'STEPPING' }] }] },
  { id: 'sprint', targets: 2, name: 'Sprint', group: 'Movement', yards: 7, requiredHits: 4, intervals: ['start', 'split', 'move', 'split'],
    setup: 'Two shooting spots 5, 10 or 15 yd apart, targets about 7 yd from both. Two shots, run, two shots. Forward runs toward the targets, back runs away from them.',
    gives: 'Top speed and the fixed cost of starting and stopping, for each direction.', planner: 'Long moves.',
    choices: [{ key: 'move', label: 'RUN', options: yd(5, 10, 15), initial: '10' }, direction('lateral')] },
  { id: 'shuffle', targets: 2, name: 'Shuffle', group: 'Movement', yards: 7, requiredHits: 4, intervals: ['start', 'split', 'move', 'split'],
    setup: 'Two spots 1 to 3 yd apart, targets about 7 yd away. Two shots, step, two shots.',
    gives: 'Time for short repositioning.', planner: 'Short moves and stepping past walls.',
    choices: [{ key: 'move', label: 'STEP', options: yd(1, 2, 3), initial: '2' }, direction('lateral')] },
  { id: 'onTheMove', targets: 2, name: 'Shoot on the move', group: 'Movement', yards: 7, requiredHits: 4, intervals: pairs(2, 'transition'),
    setup: 'Two targets 5 to 10 yd away. Two shots on each while walking toward them or across them. Log a standing run to compare.',
    gives: 'Split and points moving against standing.', planner: 'Whether shooting on the move beats stopping, for you.',
    choices: [{ key: 'mode', label: 'WHILE', initial: 'toward', options: [{ value: 'toward', label: 'TOWARD' }, { value: 'across', label: 'ACROSS' }, { value: 'standing', label: 'STANDING' }] },
      distance(7, 5, 7, 10)] },
  { id: 'steel', targets: 5, name: 'Steel', group: 'Shooting', yards: 10, requiredHits: null, makeups: true, intervals: ['start', 'transition', 'transition', 'transition', 'transition'],
    setup: 'Five plates. One shot per plate; log every shot, makeups included.',
    gives: 'Time per plate, and how often you miss.', planner: 'Steel engagements (misses cost makeup shots).', choices: [distance(10, 10, 15, 20, 25)] },
  { id: 'port', targets: 2, name: 'Port / lean', group: 'Positions', yards: 10, requiredHits: 4, intervals: pairs(2, 'transition'),
    setup: 'Two targets, two shots on each, through a low port or around a hard lean. Log a standing-square run to compare.',
    gives: 'The extra time an awkward position costs you.', planner: 'Cost of awkward positions.',
    choices: [{ key: 'position', label: 'POSITION', initial: 'port', options: [{ value: 'square', label: 'SQUARE' }, { value: 'port', label: 'LOW PORT' }, { value: 'lean', label: 'HARD LEAN' }] },
      distance(10, 7, 10, 15)] },
  { id: 'partial', targets: 1, name: 'Hostage / partial', group: 'Shooting', yards: 7, requiredHits: 2, intervals: ['start', 'split'],
    setup: 'Two shots on a target with head-only or diagonal hard cover, or a no-shoot overlap, at 7 and 15 yd. Log a full-target run to compare.',
    gives: 'Split and points on partial faces.', planner: 'Expected hits on partly covered targets.',
    choices: [{ key: 'face', label: 'TARGET', initial: 'head', options: [{ value: 'head', label: 'HEAD ONLY' }, { value: 'diagonal', label: 'DIAGONAL' }, { value: 'full', label: 'FULL' }] },
      distance(7, 7, 15)] },
  { id: 'elPresidente', targets: 3, name: 'El Presidente', group: 'Combined', yards: 10, requiredHits: 12,
    intervals: [...pairs(3, 'transition'), 'reload', 'split', 'transition', 'split', 'transition', 'split'],
    setup: 'Three targets 1 yd apart at 10 yd, your back to them. Turn, draw, two on each, reload, two on each.',
    gives: 'Hit factor for a combined string, and whether your parts add up.', planner: 'Checks the planner’s numbers against a real string.', choices: [] },
] as LibraryDrill[]);
const byId = new Map(libraryDrills.map(d => [d.id, d]));
export const libraryDrill = (id: string) => byId.get(id);

export type LibraryRun = {
  id: string; drillId: string; recordedAt: string;
  choices: Record<string, string>;
  /** Shot times from the buzzer as the timer lists them, seconds; empty when only the total was entered. */
  shotTimes: number[];
  /** The last shot time, or the total you entered. */
  totalTime: number | null;
  family: LibraryFamily;
  powerFactor?: PowerFactor;
  /** Hits counted by zone (the family's zone tags). Omitted when not recorded (dry fire). Steel: only M, the misses. */
  zones?: Record<string, number>;
  procedurals?: number;
  notes: string;
  /** False keeps the run in the log only: it adds nothing to your profile. Missing: true. */
  counts?: boolean;
  /** Where each shot hit, marked on the target (single-target paper drills). `zones` are then the counts of its tags. */
  target?: LibraryTarget;
  /** The run's video, kept in the same record's `videos` (roadmap T2). */
  videoId?: string;
  /** The draw or reload broken into movements from the video, kept by you (roadmap T3). */
  phases?: SavedPhases;
};
/** A saved run with a breakdown this version can't read (a later version's, or damaged) keeps the run and drops it. */
export function withReadablePhases(run: LibraryRun): LibraryRun {
  if (run.phases === undefined || !savedPhasesProblem(run.phases) && run.phases.kind === phaseKindOf(run)) return run;
  const { phases: _dropped, ...rest } = run;
  return rest;
}
/** Which movement breakdown a run can have: hands-at-sides draws, and standing reloads. */
export function phaseKindOf(run: Pick<LibraryRun, 'drillId' | 'choices'>): PhaseKind | null {
  const drill = libraryDrill(run.drillId);
  if (!drill) return null;
  const choices = choicesFor(drill, run.choices);
  if (drill.id === 'bill' || drill.id === 'draw' && choices.start === 'competitionHolster') return 'draw';
  if (drill.id === 'reload' && choices.mode === 'standing') return 'reload';
  return null;
}
/**
 * Hits marked on the face, as in the drill logger (src/training/drillLog.ts): inches from the face centre, +y up.
 * Zones are tagged by the shooter, never read from the coordinates (no official zone geometry is published as data).
 */
export type LibraryTarget = { presetId: string | null; faceWidth: number; faceHeight: number; aim: { x: number; y: number }; hits: DrillHit[] };
export const MAX_LIBRARY_RUNS = 500;
const MAX_SHOTS = 100;

/** Drills where hits can be marked on the target: one plain paper target (partial faces are covered, steel has none). */
export const canMarkHits = (drill: LibraryDrill) => drill.targets === 1 && drill.requiredHits !== null && drill.id !== 'partial';
/** Zone counts from the tagged hits; undefined when nothing is tagged. */
export function zonesFromHits(hits: readonly DrillHit[]): Record<string, number> | undefined {
  const counts: Record<string, number> = {};
  for (const h of hits) if (h.zone) counts[h.zone] = (counts[h.zone] ?? 0) + 1;
  return Object.keys(counts).length ? counts : undefined;
}
function targetProblem(target: LibraryTarget, drill: LibraryDrill, run: LibraryRun): string | null {
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!canMarkHits(drill)) return `Hits can't be marked on the target for ${drill.name}.`;
  if (!target || typeof target !== 'object' || (target.presetId !== null && typeof target.presetId !== 'string')) return 'Invalid target.';
  if (!finite(target.faceWidth) || !finite(target.faceHeight) || target.faceWidth <= 0 || target.faceHeight <= 0 || target.faceWidth > 120 || target.faceHeight > 120) return 'Invalid target face size.';
  if (!target.aim || !finite(target.aim.x) || !finite(target.aim.y)) return 'Invalid aim point.';
  if (!Array.isArray(target.hits) || target.hits.length > MAX_HITS_PER_RUN) return 'Too many hits.';
  const ids = new Set<string>(), allowed = zoneChoices[run.family];
  for (const h of target.hits) {
    if (!h || typeof h.id !== 'string' || !h.id || ids.has(h.id) || !Number.isInteger(h.order) || h.order < 1) return 'Invalid hit.';
    ids.add(h.id);
    if ((h.x === null) !== (h.y === null)) return 'A hit needs both coordinates or neither.';
    // The diagram is the face's bounding box: a tap is at most half the width or height from the centre.
    if (h.x !== null && (!finite(h.x) || !finite(h.y) || Math.abs(h.x) > target.faceWidth / 2 + 0.01 || Math.abs(h.y as number) > target.faceHeight / 2 + 0.01)) return 'Hit coordinates are outside the target area.';
    // Every marked hit has its zone (the counts are the tags).
    if (typeof h.zone !== 'string' || !allowed.includes(h.zone)) return h.zone === null ? 'A marked hit has no zone.' : 'Invalid zone.';
    if (h.x === null && !PENALTY_TAGS.includes(h.zone ?? '')) return 'Only misses and no-shoot hits may omit coordinates.';
  }
  // The counts are the marks: they can never disagree.
  const canonical = (zones: Record<string, number> | undefined) => JSON.stringify(Object.entries(zones ?? {}).filter(([, n]) => n > 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  if (canonical(zonesFromHits(target.hits)) !== canonical(run.zones)) return 'Hit counts do not match the hits marked on the target.';
  return null;
}

/** Defaults filled in, unknown keys dropped. Invalid values stay so validation can name them. */
export function choicesFor(drill: LibraryDrill, choices: Choices = {}): Record<string, string> {
  return Object.fromEntries(drill.choices.map(c => [c.key, choices[c.key] ?? c.initial]));
}
/** Runs with the same drill and choices share trends and a par time. */
export function variantKey(run: Pick<LibraryRun, 'drillId' | 'choices'>): string {
  const drill = libraryDrill(run.drillId);
  const choices = drill ? choicesFor(drill, run.choices) : run.choices;
  return [run.drillId, ...Object.keys(choices).sort().map(k => `${k}=${choices[k]}`)].join('|');
}
export function variantLabel(drill: LibraryDrill, choices: Choices): string {
  const full = choicesFor(drill, choices);
  const parts = drill.choices.map(c => c.options.find(o => o.value === full[c.key])?.label.toLowerCase()).filter(Boolean);
  return [drill.name, ...parts].join(' · ');
}
const choiceNumber = (drill: LibraryDrill, choices: Choices, key: string) => {
  const value = Number(choicesFor(drill, choices)[key]); return Number.isFinite(value) && value > 0 ? value : null;
};
export const targetYards = (drill: LibraryDrill, choices: Choices) => choiceNumber(drill, choices, 'distance') ?? drill.yards;

/** Times typed or pasted from a shot timer: shot times from the buzzer, or splits (the first is the draw). */
export function parseShotTimes(text: string, mode: 'times' | 'splits'): { times: number[] } | { problem: string } {
  // "1,42" (no space, digits both sides, no point) is a decimal comma; otherwise commas separate times.
  const parts = text.split(/[\s;]+/).filter(Boolean).flatMap(token => /^\d+,\d+$/.test(token) && !/[.]/.test(token) && !/,\d+,/.test(token)
    ? [token.replace(',', '.')] : token.split(',')).filter(Boolean);
  if (!parts.length) return { times: [] };
  const values = parts.map(Number);
  if (values.some(v => !Number.isFinite(v) || v <= 0)) return { problem: 'Times must be numbers of seconds, for example 1.42 1.68.' };
  if (values.length > MAX_SHOTS) return { problem: `A run holds at most ${MAX_SHOTS} shots.` };
  const times = mode === 'splits' ? values.reduce<number[]>((all, v) => [...all, (all[all.length - 1] ?? 0) + v], []) : values;
  if (times.some((t, i) => i > 0 && t <= times[i - 1])) return { problem: 'Shot times must increase. If these are splits, choose SPLITS.' };
  return { times: times.map(t => Math.round(t * 1000) / 1000) };
}

export type Interval = { kind: IntervalKind; seconds: number; shot: number };
/** What each time on the timer measured. Steel runs with makeups only give the overall time per plate. */
export function intervalsOf(drill: LibraryDrill, shotTimes: readonly number[]): Interval[] {
  const listed = drill.intervals.length, makeups = shotTimes.length > listed;
  return shotTimes.map((t, i) => ({ shot: i + 1, seconds: Math.round((i ? t - shotTimes[i - 1] : t) * 1000) / 1000,
    kind: i === 0 ? 'start' : makeups ? 'shot' : drill.intervals[i] }));
}

/** Reason the run cannot be saved, or null. Used before saving and when loading saved sessions. */
export function libraryRunProblem(run: LibraryRun): string | null {
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!run || typeof run !== 'object' || typeof run.id !== 'string' || !run.id || !Number.isFinite(Date.parse(run.recordedAt))) return 'Invalid drill run.';
  const drill = typeof run.drillId === 'string' ? libraryDrill(run.drillId) : undefined;
  if (!drill) return 'Unknown drill.';
  if (!run.choices || typeof run.choices !== 'object' || Object.keys(run.choices).some(k => !drill.choices.some(c => c.key === k))) return 'Invalid drill options.';
  for (const c of drill.choices) if (!c.options.some(o => o.value === run.choices[c.key])) return `Choose ${c.label.toLowerCase()}.`;
  if (!Array.isArray(run.shotTimes) || run.shotTimes.length > MAX_SHOTS || run.shotTimes.some(t => !finite(t) || t <= 0 || t > 600)
    || run.shotTimes.some((t, i) => i > 0 && t <= run.shotTimes[i - 1])) return 'Invalid shot times.';
  const listed = drill.intervals.length;
  if (run.shotTimes.length && (run.shotTimes.length < listed || run.shotTimes.length > listed && !drill.makeups))
    return `${drill.name} has ${listed} shot${listed === 1 ? '' : 's'}; ${run.shotTimes.length} time${run.shotTimes.length === 1 ? '' : 's'} entered.`;
  if (run.totalTime !== null && (!finite(run.totalTime) || run.totalTime <= 0 || run.totalTime > 3600)) return 'Invalid total time.';
  if (run.shotTimes.length && run.totalTime !== run.shotTimes[run.shotTimes.length - 1]) return 'The total time must be the last shot time.';
  if (!libraryFamilies.includes(run.family)) return 'Invalid target family.';
  if (run.powerFactor !== undefined && run.powerFactor !== 'major' && run.powerFactor !== 'minor') return 'Invalid power factor.';
  if (run.zones !== undefined) {
    const allowed = drill.requiredHits === null ? ['M'] : zoneChoices[run.family];
    if (!run.zones || typeof run.zones !== 'object' || Object.entries(run.zones).some(([k, n]) => !allowed.includes(k) || !Number.isInteger(n) || n < 0 || n > 300))
      return 'Invalid hit counts.';
    if (drill.makeups && run.shotTimes.length && (run.zones.M ?? 0) > run.shotTimes.length - listed) return 'More misses than makeup shots.';
    const shots = ['A', 'C', 'D', 'T', 'M'].reduce((n, z) => n + (run.zones![z] ?? 0), 0);
    if (!drill.makeups && run.shotTimes.length && shots > run.shotTimes.length)
      return `${shots} hits and misses counted for ${run.shotTimes.length} shots. Count each shot once (no-shoot hits are extra).`;
  }
  if (run.procedurals !== undefined && !(Number.isInteger(run.procedurals) && run.procedurals >= 0 && run.procedurals <= 100)) return 'Invalid procedurals.';
  if (typeof run.notes !== 'string' || run.notes.length > 2000) return 'Invalid notes.';
  if (run.counts !== undefined && typeof run.counts !== 'boolean') return 'Invalid run setting.';
  if (run.videoId !== undefined && (typeof run.videoId !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(run.videoId))) return 'Invalid video link.';
  if (run.phases !== undefined) {
    const problem = savedPhasesProblem(run.phases);
    if (problem) return problem;
    if (run.phases.kind !== phaseKindOf(run)) return 'This drill has no such movement breakdown.';
  }
  if (run.target !== undefined) return targetProblem(run.target, drill, run);
  return null;
}

export type LibraryScore = {
  points: number; maxPoints: number; percent: number; hitFactor: number | null; misses: number; penalties: number; method: string;
  /** PCSL caps points per target and a T counts as two hits, so with T hits on a multi-target drill the counts for the
   *  whole run can score higher than per-target scoring would (PCSL 11.3.2.1, 11.3.4). Shown as an estimate. */
  approximate: boolean;
};
/** Paper drills: zone counts scored by the family's rules (drillLog `scoreRun`). Steel and dry runs: null. */
export function scoreLibraryRun(run: LibraryRun, fallback: PowerFactor = 'minor'): LibraryScore | null {
  const drill = libraryDrill(run.drillId);
  if (!drill || drill.requiredHits === null || !run.zones) return null;
  let order = 0;
  const hits: DrillHit[] = Object.entries(run.zones).flatMap(([zone, n]) => Array.from({ length: n }, () => ({ id: 'z' + ++order, order, x: null, y: null, zone })));
  const score = scoreRun({ family: run.family, hits, requiredHits: drill.requiredHits, procedurals: run.procedurals ?? 0, totalTime: run.totalTime },
    run.powerFactor ?? fallback);
  // Both rulebooks cap a hit at 5 points (USPSA Appendix B1, PCSL 11.3.2).
  const maxPoints = 5 * drill.requiredHits, points = score.points ?? 0;
  return { points, maxPoints, percent: maxPoints ? points / maxPoints : 0, hitFactor: score.hitFactor, misses: score.misses, penalties: score.penalties, method: score.method,
    approximate: run.family === 'PCSL' && drill.targets > 1 && (run.zones.T ?? 0) > 0 };
}

export type LibraryAnalysis = {
  drill: LibraryDrill; intervals: Interval[];
  start: number | null; splits: number[]; transitions: number[]; reloads: number[]; moves: number[];
  /** First shot to last shot, seconds. */
  shooting: number | null;
  /** Steel: average time per plate after the first, clean runs only; misses = makeup shots. */
  perPlate: number | null; steelMisses: number | null;
  score: LibraryScore | null;
};
const mean = (values: readonly number[]) => values.reduce((s, v) => s + v, 0) / values.length;
export function analyzeLibraryRun(run: LibraryRun, fallback: PowerFactor = 'minor'): LibraryAnalysis | null {
  const drill = libraryDrill(run.drillId);
  if (!drill) return null;
  const intervals = intervalsOf(drill, run.shotTimes);
  const of = (kind: IntervalKind) => intervals.filter(i => i.kind === kind).map(i => i.seconds);
  const n = run.shotTimes.length, listed = drill.intervals.length;
  // Shots past the five listed are makeups; while typing (fewer than five) it is not known yet.
  const steelMisses = drill.makeups ? (n ? (n >= listed ? n - listed : null) : run.zones?.M ?? null) : null;
  return { drill, intervals, start: n ? run.shotTimes[0] : null, splits: of('split'), transitions: of('transition'), reloads: of('reload'), moves: of('move'),
    shooting: n > 1 ? run.shotTimes[n - 1] - run.shotTimes[0] : null,
    perPlate: drill.makeups && n === listed ? (run.shotTimes[n - 1] - run.shotTimes[0]) / (listed - 1) : null, steelMisses,
    score: scoreLibraryRun(run, fallback) };
}

/**
 * How the run's required hits landed: a PCSL T counts as two A hits (11.3.2.1), extra hits beyond the required count
 * are dropped best-first (like scoring), and required hits not made are misses. Steel: hits and makeup shots.
 * Null when hits were not counted, or the misses are not known.
 */
export function hitCounts(run: LibraryRun): HitCounts | null {
  const drill = libraryDrill(run.drillId);
  if (!drill) return null;
  if (drill.requiredHits === null) {
    const misses = analyzeLibraryRun(run)?.steelMisses ?? null;
    return misses === null || !run.zones && !run.shotTimes.length ? null : { a: drill.intervals.length, c: 0, d: 0, miss: misses };
  }
  if (!run.zones) return null;
  const z = run.zones;
  let left = drill.requiredHits;
  const take = (n: number) => { const used = Math.min(left, n); left -= used; return used; };
  const a = take(2 * (z.T ?? 0) + (z.A ?? 0)), c = take(z.C ?? 0), d = take(z.D ?? 0);
  return { a, c, d, miss: left, ...(z.NS ? { noShoot: z.NS } : {}) };
}

/** Conditions that keep a measurement out of the profile's general numbers (see observations `generalSample`). */
function conditions(drill: LibraryDrill, choices: Record<string, string>): Partial<PerformanceObservation> {
  if (drill.id === 'onTheMove') return { moving: choices.mode !== 'standing' };
  if (drill.id === 'steel') return { targetKind: 'steel' };
  if (drill.id === 'partial') return { targetKind: choices.face === 'full' ? 'paper' : 'partial' };
  if (drill.id === 'port') return { position: choices.position as 'square' | 'port' | 'lean' };
  return {};
}
const spreadYards = (drill: LibraryDrill, choices: Record<string, string>) =>
  drill.id === 'wide' ? Number(choices.spread) : drill.id === 'blake' || drill.id === 'elPresidente' ? 1 : null;

/**
 * Profile measurements from one run: one per factor per run (the run's mean), so sample counts are runs, not shots.
 * Ids are stable (`lib:<session>:<run>:<n>`), so saving the session again replaces them instead of adding copies.
 */
export function libraryObservations(record: { id: string; context?: TrainingContext }, run: LibraryRun): PerformanceObservation[] {
  const drill = libraryDrill(run.drillId);
  if (!drill || run.counts === false || libraryRunProblem(run)) return [];
  const a = analyzeLibraryRun(run)!, choices = choicesFor(drill, run.choices), yards = targetYards(drill, choices), inches = yardsToInches(yards);
  const out: PerformanceObservation[] = [], extra = conditions(drill, choices);
  const base = { context: record.context ?? 'DRY_FIRE', measuredAt: run.recordedAt, source: 'STRUCTURED_TRAINING' as const,
    trainingSessionId: record.id, drillId: 'library:' + drill.id, evidenceKey: run.id };
  const add = (o: Pick<PerformanceObservation, 'factor' | 'value'> & Partial<PerformanceObservation>) => {
    if (Number.isFinite(o.value) && o.value > 0) out.push({ ...base, ...o, id: `lib:${record.id}:${run.id}:${out.length + 1}` });
  };
  // Hits count only where they were fired for real (dry fire records none). Whole-run PCSL counts with T hits on
  // several targets are estimates (see LibraryScore.approximate), so they stay out of the hit shares.
  const hits = base.context === 'DRY_FIRE' || a.score?.approximate ? null : hitCounts(run);
  if (hits) add({ factor: 'hitZones', value: hits.a + hits.c + hits.d + hits.miss, hits, distanceInches: inches, ...extra });
  // A total alone measures no draw, split or move.
  if (!run.shotTimes.length) return out;
  if ((drill.id === 'draw' || drill.id === 'bill') && a.start !== null)
    add({ factor: 'drawTime', value: a.start, distanceInches: inches, startingType: (drill.id === 'draw' ? choices.start : 'competitionHolster') as StartingType });
  if (a.splits.length) add({ factor: 'averageSplitTime', value: mean(a.splits), difficultyModel: 'DISTANCE_ONLY', difficulty: yards, distanceInches: inches, ...extra });
  const spread = spreadYards(drill, choices);
  if (a.transitions.length && !drill.makeups) add({ factor: 'transitionTime', value: mean(a.transitions), distanceInches: inches, ...(spread ? { spreadInches: yardsToInches(spread) } : {}), ...extra });
  if (drill.makeups && a.perPlate !== null) add({ factor: 'transitionTime', value: a.perPlate, distanceInches: inches, ...extra });
  if (a.reloads.length) add({ factor: 'reloadTime', value: mean(a.reloads), distanceInches: inches, moving: drill.id === 'reload' && choices.mode === 'stepping' });
  const move = choiceNumber(drill, choices, 'move');
  if (move) for (const seconds of a.moves)
    add({ factor: 'movementSpeed', value: yardsToInches(move) / seconds, distanceInches: yardsToInches(move), durationSeconds: seconds, movement: choices.direction as MoveDirection });
  return out;
}
/** Every library measurement of one session, in run order. */
export const sessionLibraryObservations = (record: { id: string; context?: TrainingContext; libraryRuns?: LibraryRun[] }) =>
  (record.libraryRuns ?? []).flatMap(run => libraryObservations(record, run));
/** Library measurements are recognised by id, so other measurements of the same session are never touched. */
export const isLibraryObservation = (o: { id: string }, sessionId: string) => o.id.startsWith(`lib:${sessionId}:`);
