import type { Point } from './types';

export type CoverageCandidate = { id: string; point: Point; mask: bigint };
const popcount = (m: bigint) => { let c = 0; for (let x = m; x; x &= x - 1n) c++; return c; };
const lowestBit = (m: bigint) => m & -m;

/**
 * Exact minimum set cover over distinct coverage masks (iterative deepening on the least-covered target).
 * Returns Infinity when `required` cannot be covered at all, and null if the node budget runs out first.
 */
export function minimumCover(masks: readonly bigint[], required: bigint, budget: { nodes: number; limit: number }): number | null {
  if (!required) return 0;
  // Dominated masks never reduce the minimum count.
  const unique = [...new Set(masks)].filter(m => m & required);
  const useful = unique.filter(m => !unique.some(o => o !== m && (o & m) === m));
  if (!useful.length || (useful.reduce((a, m) => a | m, 0n) & required) !== required) return Infinity;
  const maxPop = Math.max(...useful.map(m => popcount(m & required)));
  const search = (uncovered: bigint, k: number): boolean | null => {
    if (!uncovered) return true;
    if (k === 0 || popcount(uncovered) > k * maxPop) return false;
    if (++budget.nodes > budget.limit) return null;
    // Branch on the target with the fewest covering masks.
    let pick = 0n, options: bigint[] = [];
    for (let rest = uncovered; rest; rest &= rest - 1n) {
      const bit = lowestBit(rest), covering = useful.filter(m => m & bit);
      if (!pick || covering.length < options.length) { pick = bit; options = covering; }
      if (options.length <= 1) break;
    }
    for (const m of options) { const r = search(uncovered & ~m, k - 1); if (r !== false) return r; }
    return false;
  };
  for (let k = Math.ceil(popcount(required) / maxPop); k <= useful.length; k++) {
    const r = search(required, k);
    if (r === null) return null;
    if (r) return k;
  }
  return Infinity;
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

export type RouteSearchResult = { order: CoverageCandidate[]; distance: number; complete: boolean; nodes: number };

/**
 * Shortest walk from the start through exactly `k` positions whose masks cover `required`.
 * Branch and bound: positions must add new coverage; a branch is cut when its distance reaches the best found or when
 * the remaining targets provably need more positions than remain (memoized exact cover). `complete` is false when the
 * node budget ran out (the best walk found so far is returned).
 */
export function shortestCoveringWalk(start: Point, pool: readonly CoverageCandidate[], required: bigint, k: number,
  travel: (a: Point, b: Point) => number, nodeLimit: number): RouteSearchResult {
  let best: { order: CoverageCandidate[]; distance: number } | null = null, nodes = 0, complete = true;
  const coverMemo = new Map<bigint, number | null>();
  const needed = (mask: bigint): number | null => {
    const cached = coverMemo.get(mask);
    if (cached !== undefined) return cached;
    const value = minimumCover(pool.map(c => c.mask), mask, { nodes: 0, limit: 5000 });
    coverMemo.set(mask, value); return value;
  };
  const visit = (at: Point, covered: bigint, order: CoverageCandidate[], distance: number) => {
    if (!complete) return;
    if ((covered & required) === required) { if (!best || distance < best.distance - 1e-9) best = { order: [...order], distance }; return; }
    const remaining = k - order.length;
    if (remaining <= 0) return;
    const missing = required & ~covered, need = needed(missing);
    // need === null means "not proven within budget": keep the branch rather than guess.
    if (need !== null && need > remaining) return;
    const options = pool.filter(c => (c.mask & missing) && !order.includes(c))
      .map(c => ({ c, d: travel(at, c.point) })).filter(o => Number.isFinite(o.d))
      .sort((a, b) => a.d - b.d || a.c.id.localeCompare(b.c.id));
    for (const { c, d } of options) {
      if (++nodes > nodeLimit) { complete = false; return; }
      if (best && distance + d >= best.distance - 1e-9) break; // sorted by d: later options are no better
      order.push(c); visit(c.point, covered | c.mask, order, distance + d); order.pop();
      if (!complete) return;
    }
  };
  visit(start, 0n, [], 0);
  const found = best as { order: CoverageCandidate[]; distance: number } | null;
  return { order: found?.order ?? [], distance: found?.distance ?? Infinity, complete, nodes };
}

/** Fallback when the search budget runs out without any walk: greedy max-new-coverage, nearest on ties. */
export function greedyWalk(start: Point, pool: readonly CoverageCandidate[], required: bigint, travel: (a: Point, b: Point) => number): RouteSearchResult {
  const order: CoverageCandidate[] = []; let covered = 0n, at = start, distance = 0;
  while ((covered & required) !== required) {
    let pick: { c: CoverageCandidate; gain: number; d: number } | null = null;
    for (const c of pool) {
      const gain = popcount(c.mask & required & ~covered), d = travel(at, c.point);
      if (!gain || !Number.isFinite(d)) continue;
      if (!pick || gain > pick.gain || (gain === pick.gain && d < pick.d)) pick = { c, gain, d };
    }
    if (!pick) break;
    order.push(pick.c); covered |= pick.c.mask; distance += pick.d; at = pick.c.point;
  }
  return { order, distance, complete: false, nodes: 0 };
}
