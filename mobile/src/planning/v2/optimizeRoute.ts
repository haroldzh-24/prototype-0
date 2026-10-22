import type { Point } from './types';

export type CoverageCandidate = { id: string; point: Point; mask: bigint };
const popcount = (m: bigint) => { let c = 0; for (let x = m; x; x &= x - 1n) c++; return c; };
const lowestBit = (m: bigint) => m & -m;

/**
 * Work budget shared by the search phases. `limit` counts search nodes and keeps results deterministic; `deadline`
 * (a Date.now() value) is a wall-clock guard for slow devices. When either runs out the search stops, keeps the best
 * result so far, and `stoppedBy` records why.
 */
export type SearchBudget = { nodes: number; limit: number; deadline?: number; stoppedBy?: 'nodes' | 'time' };
/** Spends one node; true when the budget is exhausted. The clock is read every 256 nodes. */
export function spend(budget: SearchBudget): boolean {
  if (budget.stoppedBy) return true;
  if (++budget.nodes > budget.limit) { budget.stoppedBy = 'nodes'; return true; }
  if (budget.deadline !== undefined && (budget.nodes & 255) === 0 && Date.now() > budget.deadline) { budget.stoppedBy = 'time'; return true; }
  return false;
}
/** Runs a step generator to completion (synchronous callers). */
export function drain<T>(steps: Generator<void, T, void>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * Exact minimum set cover over distinct coverage masks (iterative deepening on the least-covered target).
 * Returns Infinity when `required` cannot be covered at all, and null if the budget runs out first.
 * Yields every 256 nodes so callers can keep the UI responsive.
 */
export function* minimumCoverSteps(masks: readonly bigint[], required: bigint, budget: SearchBudget): Generator<void, number | null, void> {
  if (!required) return 0;
  // Dominated masks never reduce the minimum count.
  const unique = [...new Set(masks.map(m => m & required))].filter(m => m);
  const useful = unique.filter(m => !unique.some(o => o !== m && (o & m) === m));
  if (!useful.length || (useful.reduce((a, m) => a | m, 0n) & required) !== required) return Infinity;
  const maxPop = Math.max(...useful.map(m => popcount(m)));
  function* search(uncovered: bigint, k: number): Generator<void, boolean | null, void> {
    if (!uncovered) return true;
    if (k === 0 || popcount(uncovered) > k * maxPop) return false;
    if (spend(budget)) return null;
    if ((budget.nodes & 255) === 0) yield;
    // Branch on the target with the fewest covering masks.
    let pick = 0n, options: bigint[] = [];
    for (let rest = uncovered; rest; rest &= rest - 1n) {
      const bit = lowestBit(rest), covering = useful.filter(m => m & bit);
      if (!pick || covering.length < options.length) { pick = bit; options = covering; }
      if (options.length <= 1) break;
    }
    for (const m of options) { const r = yield* search(uncovered & ~m, k - 1); if (r !== false) return r; }
    return false;
  }
  for (let k = Math.ceil(popcount(required) / maxPop); k <= useful.length; k++) {
    const r = yield* search(required, k);
    if (r === null) return null;
    if (r) return k;
  }
  return Infinity;
}
export function minimumCover(masks: readonly bigint[], required: bigint, budget: SearchBudget): number | null {
  return drain(minimumCoverSteps(masks, required, budget));
}

/** Up to `count` representatives per mask: the one nearest the start, then farthest-point spread. */
export function representatives(candidates: readonly CoverageCandidate[], start: Point, count: number): { pool: CoverageCandidate[]; reduced: boolean } {
  const groups = new Map<bigint, CoverageCandidate[]>();
  for (const c of candidates) if (c.mask) groups.set(c.mask, [...(groups.get(c.mask) ?? []), c]);
  let reduced = false;
  const pool: CoverageCandidate[] = [];
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  for (const group of groups.values()) {
    if (group.length <= count) { pool.push(...group); continue; }
    reduced = true;
    const chosen = [group.reduce((best, c) => d(c.point, start) < d(best.point, start) ? c : best)];
    while (chosen.length < count) {
      let far = group[0], farD = -1;
      for (const c of group) { if (chosen.includes(c)) continue; const near = Math.min(...chosen.map(s => d(s.point, c.point))); if (near > farD) { farD = near; far = c; } }
      chosen.push(far);
    }
    pool.push(...chosen);
  }
  return { pool, reduced };
}

/**
 * How engaging at one stop changes the set of engaged targets: `engaged | mask` without stage procedures. With
 * "engage after" procedures a target counts only once its prerequisites are engaged (earlier, or earlier at this stop).
 */
export type Advance = (engaged: bigint, mask: bigint) => bigint;
export const unordered: Advance = (engaged, mask) => engaged | mask;
/**
 * Builds the precedence-aware advance. `prerequisites` maps a target bit to the bits it must follow. Engaging every
 * eligible target as early as possible never hurts (it only unlocks more), so this closure is exact for a given walk.
 */
export function orderedAdvance(prerequisites: ReadonlyMap<bigint, bigint>): Advance {
  const constrained = [...prerequisites].filter(([, pre]) => pre);
  if (!constrained.length) return unordered;
  const constrainedMask = constrained.reduce((m, [bit]) => m | bit, 0n);
  return (engaged, mask) => {
    let e = engaged | (mask & ~constrainedMask), changed = true;
    while (changed) {
      changed = false;
      for (const [bit, pre] of constrained) if ((mask & bit) && !(e & bit) && (pre & e) === pre) { e |= bit; changed = true; }
    }
    return e;
  };
}

export type RouteSearchResult = { order: CoverageCandidate[]; distance: number; complete: boolean; nodes: number };

/**
 * Shortest walk from the start through exactly `k` stops that engages every `required` target.
 * Branch and bound: each stop must engage something new; a branch is cut when its distance reaches the best found or
 * when the remaining targets provably need more stops than remain (memoized exact cover, ignoring order, a valid lower
 * bound). A stop may be revisited when procedures make that useful. `complete` is false when the budget ran out
 * (the best walk found so far is returned). Yields every 256 nodes.
 */
export function* shortestCoveringWalkSteps(start: Point, pool: readonly CoverageCandidate[], required: bigint, k: number,
  travel: (a: Point, b: Point) => number, budget: SearchBudget, advance: Advance = unordered): Generator<void, RouteSearchResult, void> {
  let best: { order: CoverageCandidate[]; distance: number } | null = null, stopped = false;
  const first = budget.nodes;
  const masks = pool.map(c => c.mask & required);
  const coverMemo = new Map<bigint, number | null>();
  function* needed(mask: bigint): Generator<void, number | null, void> {
    const cached = coverMemo.get(mask);
    if (cached !== undefined) return cached;
    // The lower bound gets a small budget of its own; its work counts toward the shared budget.
    const inner: SearchBudget = { nodes: 0, limit: 2000, deadline: budget.deadline };
    const value = yield* minimumCoverSteps(masks, mask, inner);
    budget.nodes += inner.nodes;
    if (inner.stoppedBy === 'time') budget.stoppedBy = 'time';
    coverMemo.set(mask, value); return value;
  }
  function* visit(at: Point, engaged: bigint, order: CoverageCandidate[], distance: number): Generator<void, void, void> {
    if ((engaged & required) === required) { if (!best || distance < best.distance - 1e-9) best = { order: [...order], distance }; return; }
    const remaining = k - order.length;
    if (remaining <= 0) return;
    const need = yield* needed(required & ~engaged);
    // need === null means "not proven within budget": keep the branch rather than guess.
    if (need !== null && need > remaining) return;
    const options: { c: CoverageCandidate; d: number; next: bigint }[] = [];
    for (let i = 0; i < pool.length; i++) {
      if ((i & 31) === 31) yield; // first visits to a stop compute many walking distances
      if (!(masks[i] & ~engaged)) continue;
      const next = advance(engaged, masks[i]);
      if (next === engaged) continue;
      const d = travel(at, pool[i].point);
      if (Number.isFinite(d)) options.push({ c: pool[i], d, next });
    }
    options.sort((a, b) => a.d - b.d || a.c.id.localeCompare(b.c.id));
    for (const { c, d, next } of options) {
      if (spend(budget)) { stopped = true; return; }
      if ((budget.nodes & 255) === 0) yield;
      if (best && distance + d >= best.distance - 1e-9) break; // sorted by d: later options are no better
      order.push(c); yield* visit(c.point, next, order, distance + d); order.pop();
      if (stopped) return;
    }
  }
  yield* visit(start, 0n, [], 0);
  const found = best as { order: CoverageCandidate[]; distance: number } | null;
  return { order: found?.order ?? [], distance: found?.distance ?? Infinity, complete: !stopped && !budget.stoppedBy, nodes: budget.nodes - first };
}
/** Synchronous form with its own node limit (used by tests and simple callers). */
export function shortestCoveringWalk(start: Point, pool: readonly CoverageCandidate[], required: bigint, k: number,
  travel: (a: Point, b: Point) => number, nodeLimit: number, advance: Advance = unordered): RouteSearchResult {
  return drain(shortestCoveringWalkSteps(start, pool, required, k, travel, { nodes: 0, limit: nodeLimit }, advance));
}

/** Fallback when the search budget runs out without any walk: greedy most-new-engagements, nearest on ties. */
export function greedyWalk(start: Point, pool: readonly CoverageCandidate[], required: bigint, travel: (a: Point, b: Point) => number,
  advance: Advance = unordered): RouteSearchResult {
  const order: CoverageCandidate[] = []; let engaged = 0n, at = start, distance = 0;
  while ((engaged & required) !== required) {
    let pick: { c: CoverageCandidate; gain: number; d: number; next: bigint } | null = null;
    for (const c of pool) {
      const next = advance(engaged, c.mask & required), gain = popcount(next & ~engaged), d = travel(at, c.point);
      if (!gain || !Number.isFinite(d)) continue;
      if (!pick || gain > pick.gain || (gain === pick.gain && d < pick.d)) pick = { c, gain, d, next };
    }
    if (!pick) break;
    order.push(pick.c); engaged = pick.next; distance += pick.d; at = pick.c.point;
  }
  return { order, distance, complete: false, nodes: 0 };
}
