/**
 * Expected points per target and for the stage (roadmap C3), from your hit shares by distance or what you plan
 * for a target (AA, AC, CC and a miss risk). Separate from the geometry planner: it reads a route, it never makes one.
 *
 * Scoring (docs/rules): USPSA paper scores its best two hits, A 5 / C 3 / D 1 minor, A 5 / C 4 / D 2 major
 * (Appendix B1); PCSL A 5 / C 3 / D 1 with no power-factor scoring (11.3.2.x). A required hit not made scores nothing
 * and costs 10 (USPSA 9.4, PCSL 11.3.4). Scoring steel is 5 points and must fall (USPSA B3, 4.3.1.5; PCSL 11.3.3):
 * a miss on steel costs a makeup shot (time), not points.
 *
 * Model: each required hit lands on its own (independent) with your shares at that distance. That ignores streaks
 * and how hard you push on a given stage; it is an estimate and says where its numbers came from.
 */
import type { StageDocument, StageObject } from '../stage/model';
import type { PowerFactor, ShooterPerformanceProfile } from '../profile/model';
import { hitRatesAt, validHitModel } from '../profile/hitModel';
import type { HitRates, RatesAt } from '../profile/hitModel';
import { exposure, isPaper, layered } from '../stage/targetLayers';
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
 * Best `required` hits out of `shots` (a planned extra shot raises the odds; scoring keeps the best hits): chance that
 * the two scored hits are AA, AC or CC, and the expected points (each required hit not made scores 0 and costs 10).
 * Shots land independently with the given shares; exact sum over every way the shots can land.
 */
export function bestHits(r: HitRates, required: number, v: ZoneValues, shots = required) {
  const n = Math.max(required, Math.min(Math.floor(shots), 12));
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
/** A planned AA, AC or CC where each hit misses with probability `missRisk` (a miss scores 0 and costs 10). */
export function plannedPair(outcome: PlannedOutcome, missRisk: number, v: ZoneValues) {
  const zones = outcome === 'AA' ? [v.A, v.A] : outcome === 'AC' ? [v.A, v.C] : [v.C, v.C], land = 1 - missRisk;
  return { odds: { AA: outcome === 'AA' ? land * land : 0, AC: outcome === 'AC' ? land * land : 0, CC: outcome === 'CC' ? land * land : 0 },
    points: land * (zones[0] + zones[1]) - 20 * missRisk };
}
/** Two shots for two required hits: chance of each pair (the rest is D hits or misses). */
export const pairOdds = (r: HitRates) => ({ AA: r.a * r.a, AC: 2 * r.a * r.c, CC: r.c * r.c });
/** Points from `required` hits at these shares with one shot each: each hit scores its zone, a missing one 0 and −10. */
export const expectedPaperPoints = (r: HitRates, required: number, v: ZoneValues) => required * (v.A * r.a + v.C * r.c + v.D * r.d - 10 * r.miss);

/** A planned outcome as shares, with the miss risk taken from what lands. */
export function plannedRates(outcome: PlannedOutcome | undefined, missRisk: number | undefined, measured: HitRates | null): HitRates | null {
  const base: HitRates | null = outcome === 'AA' ? { a: 1, c: 0, d: 0, miss: 0 } : outcome === 'AC' ? { a: 0.5, c: 0.5, d: 0, miss: 0 }
    : outcome === 'CC' ? { a: 0, c: 1, d: 0, miss: 0 } : measured;
  if (!base) return null;
  if (missRisk === undefined) return base;
  const landed = base.a + base.c + base.d, keep = landed > 0 ? (1 - missRisk) / landed : 0;
  return { a: base.a * keep, c: base.c * keep, d: base.d * keep, miss: landed > 0 ? missRisk : 1 };
}

export type TargetEstimate = {
  targetId: string; label: string; kind: 'paper' | 'partial' | 'steel';
  /** Ground distance from where the route shoots it, yards; null when the route doesn't engage it. */
  yards: number | null;
  /** Share of the face left open by layers and paint (1 = full face). */
  openFraction: number;
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

const yardsBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) / 36;
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
    const cut = t.type === 'cardboardTarget' && t.faceCut?.preset !== undefined && t.faceCut.preset !== 'full';
    const kind = steel ? 'steel' : open < 0.95 || cut ? 'partial' : 'paper';
    const planned = expectations[t.id];
    if (at?.moving) notes.push('Shot on the move: your standing numbers are used (moving runs are kept separately).');
    // Partial faces use your partial-target runs; without them, full-target numbers (likely optimistic).
    let measured = yards !== null ? hitRatesAt(model?.[kind], yards) : null;
    if (!measured && kind === 'partial' && yards !== null) {
      measured = hitRatesAt(model?.paper, yards);
      if (measured) notes.push('No partly covered target runs yet: full-target numbers used, likely optimistic.');
    }
    if (measured?.source === 'NEAREST') notes.push(`Beyond the distances you have logged: your ${measured.fromYards[0]} yd numbers are used.`);
    if (yards === null && !planned?.outcome) notes.push('Not engaged in the route yet: no distance to look up your numbers.');
    if (steel) {
      const missRisk = planned?.missRisk ?? measured?.rates.miss;
      return { targetId: t.id, label: targetLabel(stage, t.id), kind, yards, openFraction: 1, maxPoints: 5, expectedPoints: 5,
        rates: null, odds: null, expectedMakeups: missRisk !== undefined && missRisk < 1 ? missRisk / (1 - missRisk) : null,
        source: planned?.missRisk !== undefined ? 'PLANNED' : measured ? 'YOUR_NUMBERS' : 'NONE', measured, notes };
    }
    const rates = plannedRates(planned?.outcome, planned?.missRisk, measured?.rates ?? null);
    // A planned outcome is what scores; with your numbers, extra planned shots on the target improve the best two.
    const shots = planned?.outcome ? 2 : Math.max(2, plan.engagements[t.id] ?? 2);
    if (!planned?.outcome && shots > 2 && rates) notes.push(`${shots} shots planned: the best two hits score.`);
    // A planned pair is that pair whenever both hits land (each misses with the miss risk), not a random mix.
    const best = planned?.outcome ? plannedPair(planned.outcome, planned.missRisk ?? 0, values) : rates ? bestHits(rates, 2, values, shots) : null;
    return { targetId: t.id, label: targetLabel(stage, t.id), kind, yards, openFraction: open, maxPoints: 2 * values.A,
      expectedPoints: best ? best.points : null, rates, odds: best ? best.odds : null, expectedMakeups: null,
      source: planned?.outcome || planned?.missRisk !== undefined && measured ? 'PLANNED' : measured ? 'YOUR_NUMBERS' : 'NONE', measured, notes };
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
