/**
 * Plan reloads around magazine capacity (roadmap C4). Keeps the reloads already on the route and searches every way
 * to add more (one per position, any unused magazine) with the route evaluator's ammunition rules, over the whole
 * route. Of the plans that carry every position it picks the one with the least reload time left exposed (not hidden
 * by the incoming move), then the fewest reloads, then the latest ones (fewer rounds dropped). It never invents
 * magazines, and it only returns a route when the plan is complete; otherwise it says what is missing.
 * Positions shot on the move are never given a reload (a reload on that leg would cancel the moving engagement).
 */
import type { StageDocument } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { isEngageable } from './model';
import type { StagePlan } from './model';
import { evaluateRoute } from './route';
import type { StageRoute } from './route';

export type ReloadPlan = { route: StageRoute; added: number; complete: boolean; note: string };
type Reload = StageRoute['reloads'][number];

/** Rounds each position needs, counting every target once (where the route first engages it), as the evaluator does. */
function roundsByPosition(stage: StageDocument, plan: StagePlan, route: StageRoute): number[] {
  const valid = new Set(stage.objects.filter(isEngageable).map(o => o.id)), seen = new Set<string>();
  return route.positions.map(p => p.engagedTargetIds.reduce((sum, id) => {
    if (!valid.has(id) || seen.has(id)) return sum;
    seen.add(id); const r = plan.engagements[id];
    return Number.isSafeInteger(r) && r > 0 ? sum + r : sum;
  }, 0));
}

export function planReloads(stage: StageDocument, plan: StagePlan, route: StageRoute, profile: ShooterPerformanceProfile | null,
  base = evaluateRoute(stage, plan, { ...route, engagementRules: undefined }, profile)): ReloadPlan {
  const required = roundsByPosition(stage, plan, route), existing = route.reloads;
  if (base.ammo.every(a => a.sufficient)) return { route, added: 0, complete: true, note: 'No reload needed: the planned reloads and magazines cover the stage.' };
  const used = new Set([plan.loadout.startingMagazineId, ...existing.map(r => r.magazineId)].filter(Boolean) as string[]);
  const spares = plan.loadout.magazines.filter(m => !used.has(m.id) && m.startingRounds > 0);
  const fullest = Math.max(0, ...plan.loadout.magazines.map(m => m.startingRounds));
  const tooBig = route.positions.findIndex((p, i) => required[i] > fullest + 1);
  const fail = (note: string): ReloadPlan => ({ route, added: 0, complete: false, note });
  if (!plan.loadout.magazines.length) return fail('Add magazines in Loadout to plan reloads.');
  if (tooBig >= 0) return fail(`${route.positions[tooBig].label} needs ${required[tooBig]} rounds; your fullest magazine holds ${fullest} (+1 chambered). Plan fewer rounds there or split it over two positions.`);
  if (!spares.length) return fail('No spare loaded magazine: add one in Loadout or plan fewer rounds.');
  // Reload time a move can hide: the incoming leg's time, for a reload done on the move.
  const reloadTime = profile?.reloadTime ?? 0;
  const legSeconds = route.positions.map(p => base.segments.find(s => s.toId === p.id)?.seconds ?? 0);
  const exposed = (i: number) => Math.max(0, reloadTime - legSeconds[i]);
  const mags = new Map(plan.loadout.magazines.map(m => [m.id, m.startingRounds]));
  // Exact search over the ammunition states (rounds left, chambered round, spares left by size), the evaluator's rules:
  // least exposed reload time, then fewest reloads, then the latest ones.
  const sizes = [...new Set(spares.map(m => m.startingRounds))].sort((a, b) => b - a);
  type Cost = [number, number, number];
  type Best = { cost: Cost; picks: { index: number; size: number }[] } | null;
  const less = (a: Cost, b: Cost) => a[0] < b[0] - 1e-9 || Math.abs(a[0] - b[0]) <= 1e-9 && (a[1] < b[1] || a[1] === b[1] && a[2] < b[2]);
  const memo = new Map<string, Best>();
  const fixed = new Map(existing.map(r => [r.positionId, r]));
  const solve = (i: number, left: number, chamber: number, counts: number[]): Best => {
    if (i === route.positions.length) return { cost: [0, 0, 0], picks: [] };
    const key = `${i}|${left}|${chamber}|${counts.join(',')}`;
    if (memo.has(key)) return memo.get(key)!;
    let best: Best = null;
    const step = (rounds: number, chambered: number, nextCounts: number[], pick: { size: number } | null) => {
      const available = rounds + chambered;
      if (required[i] > available) return;
      const remaining = available - required[i], ch = Math.min(1, remaining), rest = solve(i + 1, remaining - ch, ch, nextCounts);
      if (!rest) return;
      const cost: Cost = pick ? [rest.cost[0] + exposed(i), rest.cost[1] + 1, rest.cost[2] - i] : rest.cost;
      if (!best || less(cost, best.cost)) best = { cost, picks: pick ? [{ index: i, size: pick.size }, ...rest.picks] : rest.picks };
    };
    const reloadChamber = chamber || left > 0 ? 1 : 0;
    const mine = fixed.get(route.positions[i].id);
    if (mine) step(mags.get(mine.magazineId) ?? 0, reloadChamber, counts, null);
    else {
      step(left, chamber, counts, null);
      if (!route.positions[i].movingTargetIds?.length) sizes.forEach((size, k) => {
        if (counts[k] > 0) step(size, reloadChamber, counts.map((c, j) => j === k ? c - 1 : c), { size });
      });
    }
    memo.set(key, best);
    return best;
  };
  const startMag = plan.loadout.startingMagazineId;
  const found = solve(0, mags.get(startMag ?? '') ?? 0, plan.loadout.chamberLoaded ? 1 : 0, sizes.map(size => spares.filter(m => m.startingRounds === size).length));
  const moving = route.positions.some(p => p.movingTargetIds?.length) ? ' Positions shot on the move were not given a reload (it would cancel the moving engagement).' : '';
  if (!found) return fail('Your spare magazines don\'t hold enough rounds for the whole stage: add a magazine or plan fewer rounds.' + moving);
  const pool = [...spares];
  const added: Reload[] = found.picks.map(({ index, size }) => {
    const mag = pool.splice(pool.findIndex(m => m.startingRounds === size), 1)[0];
    return { positionId: route.positions[index].id, magazineId: mag.id, mode: 'moving' };
  });
  const order = new Map(route.positions.map((p, i) => [p.id, i]));
  const reloads = [...existing, ...added].sort((a, b) => (order.get(a.positionId) ?? 0) - (order.get(b.positionId) ?? 0));
  const n = added.length;
  return { route: { ...route, reloads }, added: n, complete: true,
    note: `${n} reload${n === 1 ? '' : 's'} added${existing.length ? ` to your ${existing.length}` : ''}` + (found.cost[0] > 0.005 ? `; ${found.cost[0].toFixed(2)} s of reload time is not hidden by a move.` : ', all hidden by moves.') };
}
