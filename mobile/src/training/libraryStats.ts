/**
 * "Your numbers": what the drill library has measured, with the number of runs behind every value.
 * Computed straight from saved runs of one context (dry fire, live fire or match), never from defaults.
 */
import type { TrainingRecord, StartingType } from './model';
import type { TrainingContext } from './observations';
import { analyzeLibraryRun, choicesFor, libraryDrill, targetYards, variantKey } from './drillLibrary';
import type { LibraryAnalysis, LibraryRun } from './drillLibrary';
import { fitMovement, moveDirections } from '../profile/movementModel';
import type { MoveDirection, MovementModel } from '../profile/movementModel';
import type { PowerFactor } from '../profile/model';

export type Stat = { mean: number; sd: number | null; n: number; best: number; latestAt: string };
type Sample = { value: number; at: string };
/** Mean, sample SD (n > 1), best (lowest unless `higherIsBetter`) and the latest run's date. */
export function stat(samples: readonly Sample[], higherIsBetter = false): Stat | null {
  const values = samples.map(s => s.value).filter(Number.isFinite);
  if (!values.length) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)) : null;
  const latest = samples.reduce((max, s) => Math.max(max, Date.parse(s.at)), -Infinity);
  return { mean, sd, n: values.length, best: higherIsBetter ? Math.max(...values) : Math.min(...values), latestAt: new Date(latest).toISOString() };
}
const avg = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;

type Row = { run: LibraryRun; a: LibraryAnalysis; choices: Record<string, string>; yards: number; at: string };
export type Accuracy = { yards: number; runs: number; required: number; a: number; c: number; d: number; miss: number; noShoots: number };
export type LibraryNumbers = {
  runs: number;
  draw: { start: StartingType; stat: Stat }[];
  /** Standing square on full paper. */
  splits: { yards: number; stat: Stat; points: Stat | null }[];
  transitions: { spreadYards: number; stat: Stat }[];
  /** transition = overhead + perYard × spread, from 2+ spreads. */
  transitionFit: { overhead: number; perYard: number; runs: number } | null;
  reloads: { mode: 'standing' | 'stepping'; stat: Stat }[];
  movement: { model: MovementModel; moves: { direction: MoveDirection; yards: number; stat: Stat }[] };
  onTheMove: { mode: 'standing' | 'toward' | 'across'; split: Stat; points: Stat | null }[];
  /** `missRuns`: runs whose misses are known (shots and misses count only those). */
  steel: { yards: number; perPlate: Stat | null; runs: number; missRuns: number; shots: number; misses: number }[];
  /** Shooting time (first to last shot); extra = against standing square at the same distance. */
  positions: { position: 'square' | 'port' | 'lean'; yards: number; shooting: Stat; extra: number | null }[];
  partial: { face: 'head' | 'diagonal' | 'full'; yards: number; split: Stat | null; points: Stat | null }[];
  /** Share of required hits that were A, C, D or missing, standing square on full paper. */
  accuracy: Accuracy[];
  elPresidente: { hitFactor: Stat | null; shooting: Stat | null; predicted: number | null } | null;
};

const general = (r: Row) => !(r.run.drillId === 'onTheMove' && r.choices.mode !== 'standing') && r.run.drillId !== 'steel'
  && !(r.run.drillId === 'port' && r.choices.position !== 'square') && !(r.run.drillId === 'partial' && r.choices.face !== 'full');
function groupBy<K, T>(items: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) { const k = key(item); map.set(k, [...(map.get(k) ?? []), item]); }
  return map;
}
const sorted = <T extends { yards: number }>(rows: T[]) => rows.sort((a, b) => a.yards - b.yards);

export function libraryNumbers(records: readonly TrainingRecord[], context: TrainingContext, powerFactor: PowerFactor = 'minor'): LibraryNumbers {
  // LOG ONLY runs stay out of your numbers (they still show in the session and its trend).
  const rows: Row[] = records.filter(r => (r.context ?? 'DRY_FIRE') === context).flatMap(r => (r.libraryRuns ?? []).filter(run => run.counts !== false).flatMap(run => {
    const drill = libraryDrill(run.drillId), a = analyzeLibraryRun(run, powerFactor);
    if (!drill || !a) return [];
    const choices = choicesFor(drill, run.choices);
    return [{ run, a, choices, yards: targetYards(drill, choices), at: run.recordedAt }];
  }));
  const timed = rows.filter(r => r.run.shotTimes.length);
  const of = (drillIds: string[]) => timed.filter(r => drillIds.includes(r.run.drillId));
  const pts = (list: Row[]) => stat(list.flatMap(r => r.a.score ? [{ value: r.a.score.percent, at: r.at }] : []), true);

  const draw = [...groupBy(of(['draw', 'bill']), r => (r.run.drillId === 'bill' ? 'competitionHolster' : r.choices.start) as StartingType)]
    .map(([start, list]) => ({ start, stat: stat(list.map(r => ({ value: r.a.start!, at: r.at })))! }));
  const splitRows = timed.filter(r => general(r) && r.a.splits.length);
  const splits = sorted([...groupBy(splitRows, r => r.yards)].map(([yards, list]) =>
    ({ yards, stat: stat(list.map(r => ({ value: avg(r.a.splits), at: r.at })))!, points: pts(list) })));

  const spread = (r: Row) => r.run.drillId === 'wide' ? Number(r.choices.spread) : 1;
  const transitionRows = of(['blake', 'wide', 'elPresidente']).filter(r => r.a.transitions.length);
  const transitions = [...groupBy(transitionRows, spread)].map(([spreadYards, list]) =>
    ({ spreadYards, stat: stat(list.map(r => ({ value: avg(r.a.transitions), at: r.at })))! })).sort((a, b) => a.spreadYards - b.spreadYards);
  let transitionFit: LibraryNumbers['transitionFit'] = null;
  if (transitions.length >= 2) {
    const xs = transitionRows.map(spread), ys = transitionRows.map(r => avg(r.a.transitions)), mx = avg(xs), my = avg(ys);
    const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0), slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
    if (sxx > 0 && Number.isFinite(slope)) transitionFit = { overhead: my - slope * mx, perYard: slope, runs: transitionRows.length };
  }

  const reloadRows = of(['reload', 'elPresidente']).filter(r => r.a.reloads.length);
  const reloads = [...groupBy(reloadRows, r => r.run.drillId === 'reload' && r.choices.mode === 'stepping' ? 'stepping' as const : 'standing' as const)]
    .map(([mode, list]) => ({ mode, stat: stat(list.map(r => ({ value: avg(r.a.reloads), at: r.at })))! }));

  const moveRows = of(['sprint', 'shuffle']).filter(r => r.a.moves.length);
  const samples = moveRows.map(r => ({ direction: r.choices.direction as MoveDirection, distanceInches: Number(r.choices.move) * 36, durationSeconds: r.a.moves[0] }));
  const moves = moveDirections.flatMap(direction => [...groupBy(moveRows.filter(r => r.choices.direction === direction), r => Number(r.choices.move))]
    .map(([yards, list]) => ({ direction, yards, stat: stat(list.map(r => ({ value: r.a.moves[0], at: r.at })))! })).sort((a, b) => a.yards - b.yards));

  const onTheMove = [...groupBy(of(['onTheMove']).filter(r => r.a.splits.length), r => r.choices.mode as 'standing' | 'toward' | 'across')]
    .map(([mode, list]) => ({ mode, split: stat(list.map(r => ({ value: avg(r.a.splits), at: r.at })))!, points: pts(list) }));

  // Misses are known from the shot count, or counted with a total; dry fire records none.
  const steel = sorted([...groupBy(rows.filter(r => r.run.drillId === 'steel'), r => r.yards)].map(([yards, list]) => {
    const known = context === 'DRY_FIRE' ? [] : list.filter(r => r.a.steelMisses !== null);
    return { yards, runs: list.length, missRuns: known.length, shots: known.reduce((s, r) => s + 5 + r.a.steelMisses!, 0),
      misses: known.reduce((s, r) => s + r.a.steelMisses!, 0), perPlate: stat(list.flatMap(r => r.a.perPlate !== null ? [{ value: r.a.perPlate, at: r.at }] : [])) };
  }));

  const positionRows = of(['port']).filter(r => r.a.shooting !== null);
  const positions = [...groupBy(positionRows, r => `${r.choices.position}|${r.yards}`)].map(([, list]) => {
    const position = list[0].choices.position as 'square' | 'port' | 'lean', yards = list[0].yards;
    const shooting = stat(list.map(r => ({ value: r.a.shooting!, at: r.at })))!;
    // Extra time is against standing square at the same distance.
    const square = positionRows.filter(r => r.choices.position === 'square' && r.yards === yards);
    return { position, yards, shooting, extra: position !== 'square' && square.length ? shooting.mean - avg(square.map(r => r.a.shooting!)) : null };
  }).sort((a, b) => a.yards - b.yards || a.position.localeCompare(b.position));

  const partial = [...groupBy(rows.filter(r => r.run.drillId === 'partial'), r => `${r.choices.face}|${r.yards}`)].map(([, list]) => ({
    face: list[0].choices.face as 'head' | 'diagonal' | 'full', yards: list[0].yards,
    split: stat(list.filter(r => r.a.splits.length).map(r => ({ value: avg(r.a.splits), at: r.at }))), points: pts(list) }))
    .sort((a, b) => a.yards - b.yards || a.face.localeCompare(b.face));

  const scored = rows.filter(r => general(r) && r.run.zones && libraryDrill(r.run.drillId)?.requiredHits);
  const accuracy = sorted([...groupBy(scored, r => r.yards)].map(([yards, list]) => {
    let required = 0, a = 0, c = 0, d = 0, noShoots = 0;
    for (const r of list) {
      const z = r.run.zones!, need = libraryDrill(r.run.drillId)!.requiredHits!;
      // A PCSL T counts as two A hits (11.3.2.1); hits beyond the required count were extra shots, best ones first.
      let left = need;
      const take = (n: number) => { const used = Math.min(left, n); left -= used; return used; };
      required += need; a += take(2 * (z.T ?? 0) + (z.A ?? 0)); c += take(z.C ?? 0); d += take(z.D ?? 0); noShoots += z.NS ?? 0;
    }
    return { yards, runs: list.length, required, a: a / required, c: c / required, d: d / required, miss: (required - a - c - d) / required, noShoots };
  }));

  const elRows = rows.filter(r => r.run.drillId === 'elPresidente');
  // The prediction uses your other drills only, never the El Presidente runs it is compared with.
  const others = (list: Row[]) => list.filter(r => r.run.drillId !== 'elPresidente');
  const mean = (list: Row[], pick: (r: Row) => number[]) => list.length ? avg(list.map(r => avg(pick(r)))) : undefined;
  const split10 = mean(others(splitRows).filter(r => r.yards === 10), r => r.a.splits);
  const t1 = mean(others(transitionRows).filter(r => spread(r) === 1), r => r.a.transitions);
  const standingReload = mean(others(reloadRows).filter(r => r.choices.mode !== 'stepping'), r => r.a.reloads);
  const elPresidente = elRows.length ? {
    hitFactor: stat(elRows.flatMap(r => r.a.score?.hitFactor != null ? [{ value: r.a.score.hitFactor, at: r.at }] : []), true),
    shooting: stat(elRows.filter(r => r.a.shooting !== null).map(r => ({ value: r.a.shooting!, at: r.at }))),
    // First shot to last: six splits, four transitions and a reload, from your other drills.
    predicted: split10 !== undefined && t1 !== undefined && standingReload !== undefined ? 6 * split10 + 4 * t1 + standingReload : null,
  } : null;

  return { runs: rows.length, draw, splits, transitions, transitionFit, reloads, movement: { model: fitMovement(samples), moves },
    onTheMove, steel, positions, partial, accuracy, elPresidente };
}

export type TrendPoint = { runId: string; at: string; total: number | null; hitFactor: number | null; percent: number | null };
/** Runs of one variant (same drill and choices), oldest first, across every context. */
export function libraryTrend(records: readonly TrainingRecord[], key: string, powerFactor: PowerFactor = 'minor'): TrendPoint[] {
  return records.flatMap(r => (r.libraryRuns ?? []).filter(run => variantKey(run) === key).map(run => {
    const score = analyzeLibraryRun(run, powerFactor)?.score ?? null;
    return { runId: run.id, at: run.recordedAt, total: run.totalTime, hitFactor: score?.hitFactor ?? null, percent: score?.percent ?? null };
  })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
