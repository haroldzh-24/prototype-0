/**
 * Expected points per target and for the stage (roadmap C3), from your hit shares by distance or what you plan
 * for a target (AA, AC, CC and a miss risk). Separate from the geometry planner: it reads a route, it never makes one.
 *
 * Scoring (docs/rules): USPSA paper A 5 / C 3 / D 1 minor, A 5 / C 4 / D 2 major (Appendix B1), best two hits score
 * (9.5.1); PCSL A 5 / C 3 / D 1 with no power-factor scoring (11.3.2.x) — which extra hits count is not stated in
 * the PCSL rules, so extra rounds are not credited there. A required hit not made scores nothing and costs 10
 * (USPSA 9.4, PCSL 11.3.4). Scoring steel is 5 points (USPSA B2 poppers, B3 plates; PCSL 11.3.3); USPSA steel must
 * fall (4.3.1.5, 9.5.1). The estimate assumes each steel is completed: a miss costs a makeup shot (time), not points.
 *
 * Model: each shot lands on its own (independent) with your shares at that distance. That ignores streaks and how
 * hard you push on a given stage; it is an estimate and says where its numbers came from.
 */
import type { StageDocument, StageObject } from '../stage/model';
import type { PowerFactor, ShooterPerformanceProfile } from '../profile/model';
import { hitRatesAt, validHitModel } from '../profile/hitModel';
import type { HitRates, RatesAt } from '../profile/hitModel';
import { exposure, isPaper, layered, stackOf, stackOrder } from '../stage/targetLayers';
import { inchesToYards } from '../stage/measurements';
import { footprintCenterOffset } from '../stage/geometry';
import { isEngageable, targetLabel } from './model';
import type { StagePlan } from './model';
import type { StageRoute } from './route';

export const plannedOutcomes = ['AA', 'AC', 'CC'] as const;
export type PlannedOutcome = typeof plannedOutcomes[number];
/** What you plan for one target; either part can be left to your numbers. */
export type TargetExpectation = { outcome?: PlannedOutcome; missRisk?: number };
export const MISS_RISKS: readonly number[] = [0, 0.05, 0.1, 0.25];
const MAX_MISS_RISK = 0.9;

export function validExpectation(e: unknown): e is TargetExpectation {
  const x = e as TargetExpectation;
  return !!x && typeof x === 'object' && (x.outcome === undefined || plannedOutcomes.includes(x.outcome))
    && (x.missRisk === undefined || typeof x.missRisk === 'number' && Number.isFinite(x.missRisk) && x.missRisk >= 0 && x.missRisk <= MAX_MISS_RISK);
}
/** Saved plans are untrusted: malformed entries are dropped, the rest kept. */
export function validExpectations(input: unknown): Record<string, TargetExpectation> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out = Object.fromEntries(Object.entries(input).filter(([k, v]) => typeof k === 'string' && k.length > 0 && validExpectation(v)).slice(0, 2000)
    .map(([k, v]) => [k, { ...(v.outcome ? { outcome: v.outcome } : {}), ...(v.missRisk !== undefined ? { missRisk: v.missRisk } : {}) }]));
  return Object.keys(out).length ? out : undefined;
}

export type ZoneValues = { A: number; C: number; D: number };
export function zoneValues(ruleset: 'USPSA' | 'PCSL', powerFactor: PowerFactor): ZoneValues {
  return ruleset === 'USPSA' && powerFactor === 'major' ? { A: 5, C: 4, D: 2 } : { A: 5, C: 3, D: 1 };
}
/**
 * Best `required` hits out of `shots` (scoring keeps the best hits, so a planned extra shot raises the odds; fewer
 * shots than required hits leave hits missing): chance that two scored hits are AA, AC or CC, and the expected points
 * (each required hit not made scores 0 and costs 10). Exact sum over every way the shots can land.
 */
export function bestHits(r: HitRates, required: number, v: ZoneValues, shots = required) {
  const n = Math.max(0, Math.min(Math.floor(shots), 12));
  const fact = (k: number) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
  let AA = 0, AC = 0, CC = 0, points = 0;
  for (let na = 0; na <= n; na++) for (let nc = 0; na + nc <= n; nc++) for (let nd = 0; na + nc + nd <= n; nd++) {
    const nm = n - na - nc - nd;
    const p = fact(n) / (fact(na) * fact(nc) * fact(nd) * fact(nm)) * r.a ** na * r.c ** nc * r.d ** nd * r.miss ** nm;
    if (!p) continue;
    let left = required;
    const take = (k: number) => { const used = Math.min(left, k); left -= used; return used; };
    const a = take(na), c = take(nc), d = take(nd);
    points += p * (v.A * a + v.C * c + v.D * d - 10 * left);
    if (required === 2) { if (a === 2) AA += p; else if (a === 1 && c === 1) AC += p; else if (c === 2) CC += p; }
  }
  return { odds: { AA, AC, CC }, points };
}
/**
 * A planned AA, AC or CC where each hit misses with probability `missRisk` (a miss scores 0 and costs 10).
 * With fewer than two rounds the unfired required hit is missing.
 */
export function plannedPair(outcome: PlannedOutcome, missRisk: number, v: ZoneValues, shots = 2) {
  const zones = outcome === 'AA' ? [v.A, v.A] : outcome === 'AC' ? [v.A, v.C] : [v.C, v.C], land = 1 - missRisk;
  const fired = Math.max(0, Math.min(2, Math.floor(shots)));
  const both = fired === 2 ? land * land : 0;
  return { odds: { AA: outcome === 'AA' ? both : 0, AC: outcome === 'AC' ? both : 0, CC: outcome === 'CC' ? both : 0 },
    points: zones.slice(0, fired).reduce((s, z) => s + land * z - 10 * missRisk, 0) - 10 * (2 - fired) };
}
/** Two shots for two required hits: chance of each pair (the rest is D hits or misses). */
export const pairOdds = (r: HitRates) => ({ AA: r.a * r.a, AC: 2 * r.a * r.c, CC: r.c * r.c });
/** Points from `required` hits at these shares with one shot each: each hit scores its zone, a missing one 0 and −10. */
export const expectedPaperPoints = (r: HitRates, required: number, v: ZoneValues) => required * (v.A * r.a + v.C * r.c + v.D * r.d - 10 * r.miss);

/** Your shares with a planned miss risk: what lands keeps its A/C/D mix. Null when nothing landed to mix. */
export function plannedRates(outcome: PlannedOutcome | undefined, missRisk: number | undefined, measured: HitRates | null): HitRates | null {
  const base: HitRates | null = outcome === 'AA' ? { a: 1, c: 0, d: 0, miss: 0 } : outcome === 'AC' ? { a: 0.5, c: 0.5, d: 0, miss: 0 }
    : outcome === 'CC' ? { a: 0, c: 1, d: 0, miss: 0 } : measured;
  if (!base) return null;
  if (missRisk === undefined) return base;
  const landed = base.a + base.c + base.d;
  if (!(landed > 0)) return null;
  const keep = (1 - missRisk) / landed;
  return { a: base.a * keep, c: base.c * keep, d: base.d * keep, miss: missRisk };
}

export type TargetEstimate = {
  targetId: string; label: string; kind: 'paper' | 'partial' | 'steel';
  /** Ground distance from where the route shoots it, yards; null when the route doesn't engage it. */
  yards: number | null;
  /** Share of the face left open by layers and paint (1 = full face). */
  openFraction: number;
  /** A face cut (upper/lower/left/right portion): partial, but not measured as an open share. */
  cutFace: boolean;
  /** Expected no-shoot penalty included in `expectedPoints` (hostage targets with partial-target data). */
  noShootPenalty: number;
  maxPoints: number;
  /** Null when there is nothing to base it on (no runs at all and nothing planned). */
  expectedPoints: number | null;
  rates: HitRates | null;
  odds: { AA: number; AC: number; CC: number } | null;
  /** Steel: expected makeup shots for this plate. */
  expectedMakeups: number | null;
  source: 'PLANNED' | 'YOUR_NUMBERS' | 'NONE';
  measured: RatesAt | null;
  notes: string[];
};
export type StagePointsEstimate = {
  targets: TargetEstimate[];
  maxPoints: number;
  /** Sum over the targets that have an estimate. */
  expectedPoints: number;
  estimatedTargets: number;
  complete: boolean;
  zoneValues: ZoneValues;
};

const yardsBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => inchesToYards(Math.hypot(a.x - b.x, a.y - b.y));
/** Where the route shoots each target from: its stationary waypoint, or the waypoint ending a moving leg. */
function shotFrom(route: StageRoute | undefined): Map<string, { x: number; y: number; moving: boolean }> {
  const from = new Map<string, { x: number; y: number; moving: boolean }>();
  for (const p of route?.positions ?? []) for (const id of p.engagedTargetIds)
    if (!from.has(id)) from.set(id, { x: p.position.x, y: p.position.y, moving: !!p.movingTargetIds?.includes(id) });
  return from;
}
function targetCenter(t: StageObject) { const o = footprintCenterOffset(t); return { x: t.position.x + o.x, y: t.position.y + o.y }; }

export function estimateStagePoints(stage: StageDocument, plan: StagePlan, route: StageRoute | undefined,
  performance: Pick<ShooterPerformanceProfile, 'hitModel'> | null, ruleset: 'USPSA' | 'PCSL', powerFactor: PowerFactor): StagePointsEstimate {
  const values = zoneValues(ruleset, powerFactor), model = validHitModel(performance?.hitModel), from = shotFrom(route);
  const expectations = validExpectations(plan.expectations) ?? {};
  const targets = stage.objects.filter(isEngageable).map((t): TargetEstimate => {
    const steel = t.type !== 'cardboardTarget', at = from.get(t.id), notes: string[] = [];
    const yards = at ? yardsBetween(at, targetCenter(t)) : null;
    const open = !steel && isPaper(t) && layered(stage, t) ? exposure(stage, t).fraction : 1;
    const cutFace = t.type === 'cardboardTarget' && t.faceCut?.preset !== undefined && t.faceCut.preset !== 'full';
    const kind: TargetEstimate['kind'] = steel ? 'steel' : open < 0.95 || cutFace ? 'partial' : 'paper';
    const stack = stackOf(stage, t), hostage = !!stack && stackOrder(stage, stack).some(o => o.type === 'noShootTarget');
    const planned = expectations[t.id];
    if (at?.moving) notes.push('Shot on the move: your standing hit numbers are used (on-the-move hits are not modelled yet).');
    // Partial faces use your partial-target runs; without them, full-target numbers (likely optimistic).
    let measured = yards !== null ? hitRatesAt(model?.[kind], yards) : null, partialData = kind === 'partial' && !!measured;
    if (!measured && kind === 'partial' && yards !== null) {
      measured = hitRatesAt(model?.paper, yards); partialData = false;
      if (measured) notes.push('No partly covered target runs yet: full-target numbers used, likely optimistic.');
    }
    if (measured?.source === 'NEAREST') notes.push(`Beyond the distances you have logged: your ${measured.fromYards[0]} yd numbers are used.`);
    if (yards === null && !planned?.outcome) notes.push('Not engaged in the route yet: no distance to look up your numbers.');
    const base = { targetId: t.id, label: targetLabel(stage, t.id), kind, yards, cutFace, measured, notes };
    if (steel) {
      const missRisk = planned?.missRisk ?? measured?.rates.miss;
      return { ...base, openFraction: 1, noShootPenalty: 0, maxPoints: 5, expectedPoints: 5, rates: null, odds: null,
        expectedMakeups: missRisk !== undefined && missRisk < 1 ? missRisk / (1 - missRisk) : null,
        source: planned?.missRisk !== undefined ? 'PLANNED' : measured ? 'YOUR_NUMBERS' : 'NONE' };
    }
    const rounds = plan.engagements[t.id];
    const fired = Number.isSafeInteger(rounds) && rounds > 0 ? rounds : 2;
    if (!(Number.isSafeInteger(rounds) && rounds > 0)) notes.push('No planned rounds yet: two shots assumed.');
    else if (rounds < 2) notes.push(`${rounds} round planned for 2 required hits: the missing hit costs 10.`);
    // PCSL rules don't say which extra hits count, so extra rounds earn nothing there.
    const credited = ruleset === 'PCSL' ? Math.min(fired, 2) : fired;
    if (fired > 2 && ruleset === 'USPSA' && !planned?.outcome) notes.push(`${fired} shots planned: the best two hits score.`);
    if (fired > 2 && ruleset === 'PCSL') notes.push(`${fired} shots planned: PCSL rules don't say which extra hits count, so the extra rounds are not credited.`);
    // A planned pair keeps your measured miss rate unless you set one.
    const missRisk = planned?.missRisk ?? (planned?.outcome ? measured?.rates.miss : undefined);
    if (planned?.outcome && planned.missRisk === undefined)
      notes.push(measured ? `Miss risk from your numbers: ${Math.round(measured.rates.miss * 100)}%.` : 'Miss risk 0%: no runs at this distance to take it from.');
    const rates = plannedRates(planned?.outcome, missRisk, measured?.rates ?? null);
    if (!rates && measured && planned?.missRisk !== undefined) notes.push('Your runs at this distance landed no hits, so a miss risk alone gives no estimate.');
    const best = planned?.outcome ? plannedPair(planned.outcome, missRisk ?? 0, values, credited) : rates ? bestHits(rates, 2, values, credited) : null;
    // Hostage targets: no-shoot hits per required hit from your partial-target runs, −10 each.
    const nsShare = hostage && partialData ? measured?.noShoot ?? 0 : 0;
    const noShootPenalty = best ? 10 * nsShare * credited : 0;
    if (hostage && !partialData) notes.push('No-shoot hits are not estimated (no hostage/partial runs at this distance).');
    return { ...base, openFraction: open, noShootPenalty, maxPoints: 2 * values.A, expectedPoints: best ? best.points - noShootPenalty : null, rates,
      odds: best ? best.odds : null, expectedMakeups: null,
      source: planned?.outcome || planned?.missRisk !== undefined && rates ? 'PLANNED' : measured ? 'YOUR_NUMBERS' : 'NONE' };
  });
  const known = targets.filter(t => t.expectedPoints !== null);
  return { targets, maxPoints: targets.reduce((s, t) => s + t.maxPoints, 0), expectedPoints: known.reduce((s, t) => s + t.expectedPoints!, 0),
    estimatedTargets: known.length, complete: known.length === targets.length, zoneValues: values };
}

/** Stage hit factor estimate: expected points ÷ estimated time (points never below zero). */
export function estimatedHitFactor(points: StagePointsEstimate, seconds: number | null): number | null {
  if (!points.complete || seconds === null || !(seconds > 0)) return null;
  return Math.max(0, points.expectedPoints) / seconds;
}
