import type { StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { StageRoute } from './route';
import { connectionPoints, pathLength } from './routeGeometry';

export type EngagementAnchor = { kind: 'waypoint'; waypointId: string }
  | { kind: 'section'; sectionId: string; fraction: number };
/**
 * Saved ENGAGE arrow, the older second engagement model. Still read (and validated) when a saved plan loads;
 * migrateManualEngagements (assignments.ts) turns it into position engagements, and nothing creates new ones. The
 * stretch helpers below (routeSections, projectToSection, resolveAnchor) also serve the drag that engages a target.
 */
export type ManualEngagement = { id: string; targetId: string; anchor: EngagementAnchor; direction: number };
export type RouteSection = { id: string; fromId: string; toId: string; points: StagePosition[] };
/** Endpoint pairs already identify PATH connections. Encoding is collision-safe and stable across shape/style edits. */
export const routeSectionId = (fromId: string, toId: string) => JSON.stringify([fromId, toId]);
export function routeSections(stage: StageDocument, route: StageRoute): RouteSection[] {
  const start = stage.objects.find(o => o.type === 'start');
  return route.positions.flatMap((to, i) => {
    const from = i ? route.positions[i - 1] : start;
    return from ? [{ id: routeSectionId(from.id, to.id), fromId: from.id, toId: to.id,
      points: connectionPoints(route, from.id, to.id, from.position, to.position) }] : [];
  });
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const interpolate = (a: StagePosition, b: StagePosition, t: number): StagePosition => ({ space: 'stage', x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0 });
export function pointAlong(points: StagePosition[], fraction: number): StagePosition | null {
  if (!points.length) return null;
  let remaining = Math.max(0, Math.min(1, fraction)) * pathLength(points);
  for (let i = 1; i < points.length; i++) {
    const length = distance(points[i - 1], points[i]);
    if (length > 0 && remaining <= length) return interpolate(points[i - 1], points[i], remaining / length);
    remaining -= length;
  }
  return points[points.length - 1];
}
/** Project onto the exact polyline used to render both straight and rounded PATH sections. */
export function projectToSection(section: RouteSection, point: StagePosition) {
  const total = pathLength(section.points);
  let traversed = 0, best = { point: section.points[0], fraction: 0, distance: Infinity };
  for (let i = 1; i < section.points.length; i++) {
    const a = section.points[i - 1], b = section.points[i], length = distance(a, b);
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (length * length))) : 0;
    const projected = interpolate(a, b, t), d = distance(point, projected);
    if (d < best.distance) best = { point: projected, fraction: total ? (traversed + length * t) / total : 0, distance: d };
    traversed += length;
  }
  return best;
}
export function resolveAnchor(stage: StageDocument, route: StageRoute, anchor: EngagementAnchor, sections = routeSections(stage, route)): StagePosition | null {
  if (!anchor) return null;
  if (anchor.kind === 'waypoint') return route.positions.find(p => p.id === anchor.waypointId)?.position ?? null;
  if (anchor.kind !== 'section' || !Number.isFinite(anchor.fraction) || anchor.fraction < 0 || anchor.fraction > 1) return null;
  const section = sections.find(s => s.id === anchor.sectionId);
  return section ? pointAlong(section.points, anchor.fraction) : null;
}
export function validManualEngagements(value: unknown, route: StageRoute, allowMissingAnchors = false): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !Array.isArray(route.positions)) return false;
  const ids = new Set<string>();
  return value.every(e => {
    if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id) || typeof e.targetId !== 'string' || !e.targetId || !Number.isFinite(e.direction) || !e.anchor) return false;
    ids.add(e.id);
    const a = e.anchor;
    if (a.kind === 'waypoint') return typeof a.waypointId === 'string' && !!a.waypointId && (allowMissingAnchors || route.positions.some(p => p?.id === a.waypointId));
    if (a.kind !== 'section' || typeof a.sectionId !== 'string' || !Number.isFinite(a.fraction) || a.fraction < 0 || a.fraction > 1) return false;
    try {
      const pair = JSON.parse(a.sectionId);
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(id => typeof id === 'string' && !!id) || pair[0] === pair[1] || routeSectionId(pair[0], pair[1]) !== a.sectionId) return false;
      const i = route.positions.findIndex(p => p?.id === pair[1]);
      return allowMissingAnchors || i >= 0 && (i > 0 ? route.positions[i - 1]?.id === pair[0] : !route.positions.some(p => p?.id === pair[0]));
    } catch { return false; }
  });
}
