/**
 * How your hits land, by distance, from drill-library runs with counted hits (roadmap C3).
 *
 * Paper: shares of required hits that were A, C, D or missing (a PCSL T counts as two A hits; extra shots beyond the
 * required hits were best-first). Steel: share of shots that hit (a miss means a makeup shot). Separate tables for
 * full paper standing square, partly covered paper, and steel. Nothing here is a default: no runs, no table.
 */
export type HitCounts = { a: number; c: number; d: number; miss: number };
export type HitRates = { a: number; c: number; d: number; miss: number };
export type HitPoint = HitRates & { yards: number; runs: number;
  /** Required hits (paper) or shots (steel) behind the shares. */
  count: number };
export type HitKind = 'paper' | 'partial' | 'steel';
export type HitModel = Partial<Record<HitKind, HitPoint[]>>;
export const hitKinds: readonly HitKind[] = ['paper', 'partial', 'steel'];

/** Distances within half a yard are pooled. */
const bucket = (yards: number) => Math.round(yards * 2) / 2;

export function buildHitModel(samples: readonly { kind: HitKind; yards: number; hits: HitCounts }[]): HitModel {
  const model: HitModel = {};
  for (const kind of hitKinds) {
    const groups = new Map<number, { runs: number } & HitCounts>();
    for (const s of samples.filter(x => x.kind === kind && Number.isFinite(x.yards) && x.yards > 0)) {
      const total = s.hits.a + s.hits.c + s.hits.d + s.hits.miss;
      if (!(total > 0)) continue;
      const key = bucket(s.yards), g = groups.get(key) ?? { runs: 0, a: 0, c: 0, d: 0, miss: 0 };
      g.runs++; g.a += s.hits.a; g.c += s.hits.c; g.d += s.hits.d; g.miss += s.hits.miss; groups.set(key, g);
    }
    const points = [...groups].sort((x, y) => x[0] - y[0]).map(([yards, g]) => {
      const count = g.a + g.c + g.d + g.miss;
      return { yards, runs: g.runs, count, a: g.a / count, c: g.c / count, d: g.d / count, miss: g.miss / count };
    });
    if (points.length) model[kind] = points;
  }
  return model;
}

const share = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
export function validHitPoint(p: unknown): p is HitPoint {
  const x = p as HitPoint;
  return !!x && typeof x === 'object' && Number.isFinite(x.yards) && x.yards > 0 && Number.isSafeInteger(x.runs) && x.runs > 0
    && Number.isSafeInteger(x.count) && x.count > 0 && [x.a, x.c, x.d, x.miss].every(share) && Math.abs(x.a + x.c + x.d + x.miss - 1) < 1e-6;
}
/** Keeps well-formed tables only (saved profiles are untrusted). */
export function validHitModel(input: unknown): HitModel | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: HitModel = {};
  for (const kind of hitKinds) {
    const points = (input as HitModel)[kind];
    if (Array.isArray(points) && points.length && points.length <= 200 && points.every(validHitPoint)) out[kind] = points.map(p => ({ ...p }));
  }
  return Object.keys(out).length ? out : undefined;
}

export type RatesAt = { rates: HitRates; runs: number;
  /** MEASURED: a logged distance. BETWEEN: blended from the two nearest. NEAREST: outside your distances, the nearest one. */
  source: 'MEASURED' | 'BETWEEN' | 'NEAREST'; fromYards: number[] };
/** Your hit shares at a distance: measured, blended between the two nearest distances, or the nearest one (flagged). */
export function hitRatesAt(points: readonly HitPoint[] | undefined, yards: number): RatesAt | null {
  if (!points?.length || !Number.isFinite(yards)) return null;
  const pick = (p: HitPoint): HitRates => ({ a: p.a, c: p.c, d: p.d, miss: p.miss });
  const exact = points.find(p => Math.abs(p.yards - yards) < 0.25);
  if (exact) return { rates: pick(exact), runs: exact.runs, source: 'MEASURED', fromYards: [exact.yards] };
  const above = points.findIndex(p => p.yards > yards);
  if (above <= 0) { const p = above === 0 ? points[0] : points[points.length - 1]; return { rates: pick(p), runs: p.runs, source: 'NEAREST', fromYards: [p.yards] }; }
  const lo = points[above - 1], hi = points[above], t = (yards - lo.yards) / (hi.yards - lo.yards);
  const mix = (k: keyof HitRates) => lo[k] + (hi[k] - lo[k]) * t;
  return { rates: { a: mix('a'), c: mix('c'), d: mix('d'), miss: mix('miss') }, runs: lo.runs + hi.runs, source: 'BETWEEN', fromYards: [lo.yards, hi.yards] };
}
