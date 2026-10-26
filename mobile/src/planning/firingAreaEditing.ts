import type { StageDocument } from '../stage/model';
import type { FiringArea } from './engagements';
import { endpoints } from '../stage/segments';

/**
 * Drawing firing areas on the stage: pure helpers for the editor. Areas are polygons in stage inches
 * (the same `FiringArea` the planner reads). Corners are kept inside the bay; an area must be a simple
 * polygon (no crossing edges) with at least three corners and a real size.
 */
export type Point = { x: number; y: number };

/** Smallest area worth keeping: one square foot. */
export const MIN_AREA_SQ_IN = 144;
/** Corners snap to whole inches unless they snap to a nearby corner or wall/fault-line end. */
const round = (v: number) => Math.round(v);

export function clampToBay(point: Point, stage: Pick<StageDocument, 'stage'>): Point {
  return { x: Math.min(stage.stage.width, Math.max(0, point.x)), y: Math.min(stage.stage.depth, Math.max(0, point.y)) };
}

/** Signed area (shoelace); its absolute value is the polygon's area in square inches. */
export function polygonArea(vertices: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) { const a = vertices[i], b = vertices[(i + 1) % vertices.length]; sum += a.x * b.y - b.x * a.y; }
  return sum / 2;
}

export function centroid(vertices: readonly Point[]): Point {
  const a = polygonArea(vertices);
  if (Math.abs(a) < 1e-9) return { x: vertices.reduce((s, p) => s + p.x, 0) / vertices.length, y: vertices.reduce((s, p) => s + p.y, 0) / vertices.length };
  let cx = 0, cy = 0;
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i], q = vertices[(i + 1) % vertices.length], f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function cross(o: Point, a: Point, b: Point) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when two non-adjacent edges cross (a bow-tie): the planner's inside test would be meaningless. */
export function selfIntersects(vertices: readonly Point[]): boolean {
  const n = vertices.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue; // neighbours share a corner
    if (segmentsCross(vertices[i], vertices[(i + 1) % n], vertices[j], vertices[(j + 1) % n])) return true;
  }
  return false;
}

/** Why these corners cannot make a firing area, or null when they can. */
export function areaProblem(vertices: readonly Point[]): string | null {
  if (vertices.length < 3) return 'An area needs at least 3 corners.';
  if (vertices.length > 64) return 'An area can have at most 64 corners.';
  if (!vertices.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return 'A corner is not a valid point.';
  if (selfIntersects(vertices)) return 'The edges cross. Place the corners in order around the area.';
  if (Math.abs(polygonArea(vertices)) < MIN_AREA_SQ_IN) return 'The area is too small (under one square foot).';
  return null;
}

/** Plain ray casting (the planner's own test treats the boundary as outside). */
export function pointInPolygon(point: Point, vertices: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The area under a tap; the last drawn wins where areas overlap. */
export function areaAt(areas: readonly FiringArea[], point: Point): string | null {
  for (let i = areas.length - 1; i >= 0; i--) if (pointInPolygon(point, areas[i].vertices)) return areas[i].id;
  return null;
}

/**
 * Where a tapped corner lands: on a nearby corner of another area or the end of a wall or fault line (so adjoining
 * areas and fault lines line up), otherwise on the nearest whole inch; always inside the bay.
 */
export function snapCorner(point: Point, stage: StageDocument, areas: readonly FiringArea[], toleranceInches: number): Point {
  const anchors: Point[] = areas.flatMap(a => a.vertices);
  for (const o of stage.objects) if (o.type === 'wall' || o.type === 'faultLine') { const e = endpoints(o); anchors.push(e.start, e.end); }
  let best: Point | null = null, bestDistance = toleranceInches;
  for (const a of anchors) { const d = Math.hypot(a.x - point.x, a.y - point.y); if (d <= bestDistance) { best = a; bestDistance = d; } }
  return clampToBay(best ? { x: best.x, y: best.y } : { x: round(point.x), y: round(point.y) }, stage);
}

export function nextAreaId(areas: readonly FiringArea[]): string {
  let i = 1; while (areas.some(a => a.id === `area-${i}`)) i++;
  return `area-${i}`;
}

/** The whole bay as one area (what the old settings button made). */
export function wholeBayArea(stage: Pick<StageDocument, 'stage'>, id: string): FiringArea {
  const { width, depth } = stage.stage;
  return { id, vertices: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }] };
}

/** Move one corner; the change is refused (null) when it would make the area invalid. */
export function moveCorner(area: FiringArea, index: number, point: Point, stage: Pick<StageDocument, 'stage'>): FiringArea | null {
  if (index < 0 || index >= area.vertices.length) return null;
  const vertices = area.vertices.map((v, i) => i === index ? clampToBay(point, stage) : v);
  return areaProblem(vertices) ? null : { ...area, vertices };
}

/** Remove an area and every target procedure's reference to it. */
export function removeArea<R extends { firingAreas: FiringArea[]; targetProcedures: Record<string, { areaIds?: string[] } & Record<string, unknown>> }>(rules: R, id: string): R {
  const targetProcedures = Object.fromEntries(Object.entries(rules.targetProcedures).map(([target, p]) => {
    if (!p.areaIds?.includes(id)) return [target, p];
    const areaIds = p.areaIds.filter(a => a !== id);
    const { areaIds: _drop, ...rest } = p;
    return [target, areaIds.length ? { ...rest, areaIds } : rest];
  }));
  return { ...rules, firingAreas: rules.firingAreas.filter(a => a.id !== id), targetProcedures };
}

/**
 * A first draft of the shooting area from the fault lines: the bay, minus everything downrange of a fault line
 * (looking downrange from where you stand, a fault line in front of you is a limit). Fault lines that run
 * downrange (side lines) are ignored; which side of them is legal is not shown by the line itself. A draft to check
 * and adjust: it does not read the stage brief.
 */
export function areaFromFaultLines(stage: StageDocument, downrangeDegrees: number, id: string): FiringArea {
  const r = downrangeDegrees * Math.PI / 180, f = { x: Math.cos(r), y: Math.sin(r) }, a = { x: -f.y, y: f.x };
  const toFrame = (p: Point) => ({ s: p.x * a.x + p.y * a.y, t: p.x * f.x + p.y * f.y });
  const fromFrame = (s: number, t: number): Point => ({ x: s * a.x + t * f.x, y: s * a.y + t * f.y });
  const { width, depth } = stage.stage;
  const bay = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }];
  const segments = stage.objects.filter(o => o.type === 'faultLine').map(o => {
    const e = endpoints(o as Extract<typeof o, { type: 'faultLine' }>), p = toFrame(e.start), q = toFrame(e.end);
    return p.s <= q.s ? { s1: p.s, t1: p.t, s2: q.s, t2: q.t } : { s1: q.s, t1: q.t, s2: p.s, t2: p.t };
  }).filter(g => g.s2 - g.s1 >= 1); // lines running downrange do not limit how far forward you may stand
  if (!segments.length) return wholeBayArea(stage, id);
  const frameBay = bay.map(toFrame), sMin = Math.min(...frameBay.map(p => p.s)) - 1, sMax = Math.max(...frameBay.map(p => p.s)) + 1;
  const tMin = Math.min(...frameBay.map(p => p.t)) - 1, tMax = Math.max(...frameBay.map(p => p.t)) + 1;
  const tAt = (g: typeof segments[number], s: number) => g.t1 + (g.t2 - g.t1) * (s - g.s1) / (g.s2 - g.s1);
  // Breakpoints: segment ends and crossings; between two breakpoints the limit is one segment (or none).
  const breaks = new Set<number>([sMin, sMax]);
  for (const g of segments) { breaks.add(g.s1); breaks.add(g.s2); }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const g = segments[i], h = segments[j], lo = Math.max(g.s1, h.s1), hi = Math.min(g.s2, h.s2);
    if (hi <= lo) continue;
    const dLo = tAt(g, lo) - tAt(h, lo), dHi = tAt(g, hi) - tAt(h, hi);
    if (dLo * dHi < 0) breaks.add(lo + (hi - lo) * dLo / (dLo - dHi));
  }
  const xs = [...breaks].filter(s => s >= sMin && s <= sMax).sort((p, q) => p - q);
  // The front limit along the bay, walked across; the polygon then closes far uprange.
  const front: { s: number; t: number }[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const lo = xs[i], hi = xs[i + 1], mid = (lo + hi) / 2;
    let limit: typeof segments[number] | null = null;
    for (const g of segments) if (g.s1 <= mid && mid <= g.s2 && (!limit || tAt(g, mid) < tAt(limit, mid))) limit = g;
    front.push(limit ? { s: lo, t: tAt(limit, lo) } : { s: lo, t: tMax }, limit ? { s: hi, t: tAt(limit, hi) } : { s: hi, t: tMax });
  }
  const region = [...front, { s: sMax, t: tMin }, { s: sMin, t: tMin }];
  // Keep the uprange side: in the frame, t grows downrange, so the region is t <= limit. Clip it to the bay.
  let poly: Point[] = region.map(p => fromFrame(p.s, p.t));
  for (let i = 0; i < bay.length; i++) {
    const p = bay[i], q = bay[(i + 1) % bay.length], inner = (v: Point) => (q.x - p.x) * (v.y - p.y) - (q.y - p.y) * (v.x - p.x) >= 0;
    const next: Point[] = [];
    for (let k = 0; k < poly.length; k++) {
      const u = poly[k], v = poly[(k + 1) % poly.length], iu = inner(u), iv = inner(v);
      if (iu) next.push(u);
      if (iu !== iv) {
        const den = (q.x - p.x) * (v.y - u.y) - (q.y - p.y) * (v.x - u.x);
        const t = ((q.x - p.x) * (p.y - u.y) - (q.y - p.y) * (p.x - u.x)) / den;
        next.push({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
      }
    }
    poly = next;
  }
  // Tidy: whole inches, no repeated or straight-through corners.
  let vertices = poly.map(v => ({ x: Math.round(v.x), y: Math.round(v.y) }));
  vertices = vertices.filter((v, i) => { const w = vertices[(i + 1) % vertices.length]; return v.x !== w.x || v.y !== w.y; });
  for (let changed = true; changed && vertices.length > 3;) {
    changed = false;
    for (let i = 0; i < vertices.length && vertices.length > 3; i++) {
      const p = vertices[(i + vertices.length - 1) % vertices.length], v = vertices[i], n = vertices[(i + 1) % vertices.length];
      if (Math.abs((v.x - p.x) * (n.y - p.y) - (v.y - p.y) * (n.x - p.x)) < 1e-9) { vertices.splice(i, 1); changed = true; i--; }
    }
  }
  return { id, vertices };
}
