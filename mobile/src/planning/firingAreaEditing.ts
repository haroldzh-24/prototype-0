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
