import { stageGeometry } from '../routeSolver/stageGeometry';
import { distanceBetweenPoints, edges, inside, intersection, segmentIntersectsWall } from '../routeSolver/traversability';
import type { Barrier, Diagnostics, Geometry } from '../routeSolver/types';
import type { StageDocument } from '../../stage/model';
import type { NormalizedStage, TargetFace } from './normalizeStage';
import { drain } from './optimizeRoute';
import type { Point } from './types';

/** Physical footprint of a target stand: the face line thickened to 4 in. */
function standBarrier(face: TargetFace): Barrier {
  const dx = face.right.x - face.left.x, dy = face.right.y - face.left.y, len = Math.hypot(dx, dy) || 1, h = 2;
  const nx = -dy / len * h, ny = dx / len * h;
  return { id: 'stand-' + face.id, polygon: [
    { x: face.left.x + nx, y: face.left.y + ny }, { x: face.right.x + nx, y: face.right.y + ny },
    { x: face.right.x - nx, y: face.right.y - ny }, { x: face.left.x - nx, y: face.left.y - ny }] };
}

/**
 * Polygon corners pushed outward along the vertex bisector, so paths can wrap obstacles at the body clearance.
 * A negative distance steps the corners inward instead (used for firing-area corners).
 */
function outsetCorners(polygon: readonly Point[], distance: number): Point[] {
  const n = polygon.length, area = polygon.reduce((s, p, i) => s + p.x * polygon[(i + 1) % n].y - polygon[(i + 1) % n].x * p.y, 0);
  const orientation = area >= 0 ? 1 : -1; // outward normal side depends on winding
  return polygon.map((v, i) => {
    const prev = polygon[(i - 1 + n) % n], next = polygon[(i + 1) % n];
    const e1 = { x: v.x - prev.x, y: v.y - prev.y }, e2 = { x: next.x - v.x, y: next.y - v.y };
    const l1 = Math.hypot(e1.x, e1.y) || 1, l2 = Math.hypot(e2.x, e2.y) || 1;
    const n1 = { x: orientation * e1.y / l1, y: -orientation * e1.x / l1 }, n2 = { x: orientation * e2.y / l2, y: -orientation * e2.x / l2 };
    const b = { x: n1.x + n2.x, y: n1.y + n2.y }, bl = Math.hypot(b.x, b.y) || 1;
    // Corner offset so both edges keep the clearance (capped for very sharp corners).
    const scale = distance / Math.max(0.25, (b.x * n1.x + b.y * n1.y) / bl);
    return { x: v.x + b.x / bl * scale, y: v.y + b.y / bl * scale };
  });
}

export type TravelGraph = {
  geometry: Geometry;
  traversable: (p: Point) => boolean;
  /** Shortest walking distance, Infinity when unreachable. */
  distance: (a: Point, b: Point) => number;
  /** Walking path from a to b (inclusive), or null when unreachable. */
  path: (a: Point, b: Point) => Point[] | null;
  /** True when b can be walked to from a; cheaper than distance (stops at the first connection found). */
  connected: (a: Point, b: Point) => boolean;
};

const emptyDiagnostics = (): Diagnostics => ({ solverVersion: 'v2-travel', rawFaultSegmentCount: 0, interpretedFaultRegionCount: 0, endpointMerges: 0, inferredGapClosures: 0,
  graphNodeCount: 0, graphEdgeCount: 0, searchIterations: 0, routesEvaluated: 0, prunedCandidates: 0, waypointReductions: 0, finalDistance: null, solveDurationMs: 0, warnings: [], unresolvedRequiredAreas: [] });

export type TravelOptions = { clearanceInches: number; travel: 'anywhere' | 'within-areas'; targetsBlockTravel: boolean };

/**
 * Visibility graph over obstacle corners with exact all-pairs shortest paths between corners (Floyd–Warshall).
 * Point-to-point distance = direct segment when clear, else best corner-to-corner chain. Walls (and optionally target
 * stands) are barriers inflated by the body clearance; fault lines do not block travel unless travel is limited to
 * firing areas, in which case the areas' own corners (stepped just inside) are graph nodes too, so a walk can turn the
 * inside corner of an L-shaped area.
 */
export function createTravelGraph(doc: StageDocument, stage: NormalizedStage, options: TravelOptions): TravelGraph {
  return drain(buildTravelGraph(doc, stage, options));
}

/** Same graph, built in steps that yield between rows of the all-pairs work (for the sliced async planner). */
export function* buildTravelGraph(doc: StageDocument, stage: NormalizedStage, options: TravelOptions): Generator<void, TravelGraph, void> {
  const stands = options.targetsBlockTravel ? [...stage.targets, ...stage.noShoots].map(standBarrier) : [];
  const geometry = stageGeometry({ stage: doc, start: stage.start, requiredAreas: [], barriers: stands,
    ...(options.travel === 'within-areas' ? { allowedTravelRegions: stage.areas.map(a => a.vertices) } : {}),
    options: { clearanceInches: options.clearanceInches } }, emptyDiagnostics());
  // Same rules as routeSolver/traversability (isPointTraversable / isSegmentTraversable), with a bounding-box prefilter:
  // a barrier whose box, inflated by the clearance, does not touch the segment's box cannot be within the clearance.
  const pad = geometry.clearance + 1e-6;
  const boxes = [...geometry.barriers, ...geometry.restrictedRegions].map(b => {
    const xs = b.polygon.map(q => q.x), ys = b.polygon.map(q => q.y);
    return { b, minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad };
  });
  const near = (minX: number, minY: number, maxX: number, maxY: number) => boxes.filter(x => x.maxX >= minX && x.minX <= maxX && x.maxY >= minY && x.minY <= maxY);
  const pointMemo = new Map<string, boolean>();
  const traversable = (p: Point) => {
    const k = `${p.x},${p.y}`, cached = pointMemo.get(k);
    if (cached !== undefined) return cached;
    const ok = Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= geometry.bounds.width && p.y <= geometry.bounds.depth
      && (!geometry.allowedTravelRegions || geometry.allowedTravelRegions.some(r => inside(p, r)))
      && !near(p.x, p.y, p.x, p.y).some(x => segmentIntersectsWall(p, p, x.b, geometry.clearance));
    pointMemo.set(k, ok); return ok;
  };
  const isSegmentTraversable = (a: Point, b: Point, _g: Geometry): boolean => {
    if (!traversable(a) || !traversable(b)) return false;
    if (near(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)).some(x => segmentIntersectsWall(a, b, x.b, geometry.clearance))) return false;
    if (geometry.allowedTravelRegions) {
      const split = [a, b, ...geometry.allowedTravelRegions.flatMap(r => edges(r).flatMap(e => { const q = intersection(a, b, e.a, e.b); return q ? [q] : []; }))]
        .sort((p, q) => distanceBetweenPoints(a, p) - distanceBetweenPoints(a, q));
      for (let i = 1; i < split.length; i++) { const m = { x: (split[i - 1].x + split[i].x) / 2, y: (split[i - 1].y + split[i].y) / 2 }; if (!geometry.allowedTravelRegions.some(r => inside(m, r))) return false; }
    }
    return true;
  };
  const corners = [...geometry.barriers, ...geometry.restrictedRegions]
    .flatMap(b => outsetCorners(b.polygon, options.clearanceInches + 0.5))
    .concat(options.travel === 'within-areas' ? stage.areas.flatMap(a => outsetCorners(a.vertices, -0.5)) : [])
    .filter(traversable);
  const n = corners.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  const next: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(-1));
  for (let i = 0; i < n; i++) { dist[i][i] = 0; next[i][i] = i; }
  for (let i = 0; i < n; i++) {
    if (i % 8 === 0) yield;
    for (let j = i + 1; j < n; j++) {
      if (!isSegmentTraversable(corners[i], corners[j], geometry)) continue;
      const d = distanceBetweenPoints(corners[i], corners[j]);
      dist[i][j] = dist[j][i] = d; next[i][j] = j; next[j][i] = i;
    }
  }
  for (let k = 0; k < n; k++) {
    if (k % 8 === 0) yield;
    for (let i = 0; i < n; i++) {
      const dik = dist[i][k]; if (dik === Infinity) continue;
      for (let j = 0; j < n; j++) { const v = dik + dist[k][j]; if (v < dist[i][j] - 1e-12) { dist[i][j] = v; next[i][j] = next[i][k]; } }
    }
  }
  const key = (p: Point) => `${p.x},${p.y}`;
  const visibleCorners = new Map<string, { index: number; d: number }[]>();
  const fromPoint = (p: Point) => {
    let list = visibleCorners.get(key(p));
    if (!list) { list = corners.flatMap((c, index) => isSegmentTraversable(p, c, geometry) ? [{ index, d: distanceBetweenPoints(p, c) }] : []); visibleCorners.set(key(p), list); }
    return list;
  };
  type Best = { d: number; i: number; j: number } | null;
  // Single-source distances from a point to every corner (first corner remembered for the path), computed once per
  // source: each later query to that source costs one pass over the destination's visible corners.
  const sources = new Map<string, { d: Float64Array; via: Int32Array }>();
  const fromSource = (a: Point) => {
    let s = sources.get(key(a));
    if (s) return s;
    const d = new Float64Array(n).fill(Infinity), via = new Int32Array(n).fill(-1);
    for (const u of fromPoint(a)) {
      const row = dist[u.index];
      for (let j = 0; j < n; j++) { const v = u.d + row[j]; if (v < d[j] - 1e-12) { d[j] = v; via[j] = u.index; } }
    }
    s = { d, via }; sources.set(key(a), s); return s;
  };
  const memo = new Map<string, { d: number; best: Best }>();
  const solve = (a: Point, b: Point) => {
    const k = key(a) + '|' + key(b), cached = memo.get(k);
    if (cached) return cached;
    let result: { d: number; best: Best };
    if (!traversable(a) || !traversable(b)) result = { d: Infinity, best: null };
    else if (isSegmentTraversable(a, b, geometry)) result = { d: distanceBetweenPoints(a, b), best: null };
    else {
      let best: Best = null;
      const sa = fromSource(a);
      for (const v of fromPoint(b)) {
        const total = sa.d[v.index] + v.d;
        if (total < (best?.d ?? Infinity) - 1e-12) best = { d: total, i: sa.via[v.index], j: v.index };
      }
      result = { d: best?.d ?? Infinity, best };
    }
    memo.set(k, result); memo.set(key(b) + '|' + key(a), result.best ? { d: result.d, best: { d: result.d, i: result.best.j, j: result.best.i } } : result);
    return result;
  };
  // Connected components of the corner graph (distances are symmetric): component = lowest corner index reachable.
  const component = corners.map((_, j) => { for (let i = 0; i < n; i++) if (dist[i][j] < Infinity) return i; return j; });
  const componentsOf = new Map<string, Set<number>>();
  const connected = (a: Point, b: Point) => {
    if (!traversable(a) || !traversable(b)) return false;
    if (isSegmentTraversable(a, b, geometry)) return true;
    let reach = componentsOf.get(key(a));
    if (!reach) { reach = new Set(fromPoint(a).map(v => component[v.index])); componentsOf.set(key(a), reach); }
    const seen = reach, cached = visibleCorners.get(key(b));
    if (cached) return cached.some(v => seen.has(component[v.index]));
    // Nearest corners first; usually the first few decide it, so b's full visibility list is not needed.
    const order = corners.map((_, i) => i).filter(i => seen.has(component[i]));
    const d = order.map(i => { const dx = corners[i].x - b.x, dy = corners[i].y - b.y; return dx * dx + dy * dy; });
    const ranked = order.map((i, k) => [d[k], i] as const).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return ranked.some(([, i]) => isSegmentTraversable(corners[i], b, geometry));
  };
  return {
    geometry, traversable, connected,
    distance: (a, b) => solve(a, b).d,
    path: (a, b) => {
      const r = solve(a, b);
      if (r.d === Infinity) return null;
      if (!r.best) return [a, b];
      const chain: Point[] = [a];
      for (let i = r.best.i; ; i = next[i][r.best.j]) { chain.push(corners[i]); if (i === r.best.j) break; }
      chain.push(b);
      return chain;
    },
  };
}
