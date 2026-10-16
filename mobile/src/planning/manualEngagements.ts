import type { StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { StageRoute } from './route';
import { connectionPoints, pathLength } from './routeGeometry';
import { engagementLabel } from './engagements';
import { isEngageable } from './model';

export type EngagementAnchor = { kind: 'waypoint'; waypointId: string }
  | { kind: 'section'; sectionId: string; fraction: number };
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
export function manualEngagementLabel(route: StageRoute, engagement: ManualEngagement): string {
  const anchor = engagement.anchor;
  if (anchor.kind !== 'waypoint') return '';
  return engagementLabel((route.manualEngagements ?? []).filter(e => e.anchor.kind === 'waypoint' && e.anchor.waypointId === anchor.waypointId).findIndex(e => e.id === engagement.id));
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
export function addManualEngagement(stage: StageDocument, route: StageRoute, engagement: ManualEngagement): StageRoute {
  if (route.manualEngagements?.some(e => e.id === engagement.id) || !validManualEngagements([engagement], route) || !stage.objects.some(o => o.id === engagement.targetId && isEngageable(o)) || !resolveAnchor(stage, route, engagement.anchor)) return route;
  return { ...route, manualEngagements: [...(route.manualEngagements ?? []), engagement] };
}
export function editManualEngagement(stage: StageDocument, route: StageRoute, id: string, change: Partial<Pick<ManualEngagement, 'targetId' | 'direction'>>): StageRoute {
  if (change.targetId !== undefined && !stage.objects.some(o => o.id === change.targetId && isEngageable(o)) || change.direction !== undefined && !Number.isFinite(change.direction)) return route;
  return { ...route, manualEngagements: route.manualEngagements?.map(e => e.id === id ? { ...e, ...change } : e) };
}
export const deleteManualEngagement = (route: StageRoute, id: string): StageRoute => ({ ...route, manualEngagements: route.manualEngagements?.filter(e => e.id !== id) });
export function reorderManualEngagement(route: StageRoute, id: string, direction: -1 | 1): StageRoute {
  const entries = [...(route.manualEngagements ?? [])], i = entries.findIndex(e => e.id === id), anchor = entries[i]?.anchor;
  if (!anchor || anchor.kind !== 'waypoint') return route;
  const peers = entries.map((e, index) => ({ e, index })).filter(({ e }) => e.anchor.kind === 'waypoint' && e.anchor.waypointId === anchor.waypointId);
  const j = peers[peers.findIndex(p => p.index === i) + direction]?.index;
  if (j === undefined) return route;
  [entries[i], entries[j]] = [entries[j], entries[i]];
  return { ...route, manualEngagements: entries };
}
/** Preserve IDs/targets across shape edits. Split sections project only onto their replacement chain.
 * Deleted waypoints lose their own annotations; annotations on merged travel sections project onto the merged section.
 * Reorders that break a section without a replacement chain remove its annotations, never attach them elsewhere. */
export function reconcileManualEngagements(stage: StageDocument, route: StageRoute, previous?: StageRoute, previousStage = stage): StageRoute {
  if (!route.manualEngagements) return route;
  const sections = routeSections(stage, route), oldSections = previous ? routeSections(stage, previous) : [];
  const entries = route.manualEngagements.flatMap(e => {
    // Keep pre-existing invalid records inspectable. Deliberately deleted valid references still clean up.
    const oldEntry = previous?.manualEngagements?.find(old => old.id === e.id);
    if (oldEntry && (!previousStage.objects.some(o => o.id === oldEntry.targetId && isEngageable(o)) || !resolveAnchor(previousStage, previous!, oldEntry.anchor))) return [e];
    if (!stage.objects.some(o => o.id === e.targetId && isEngageable(o))) return [];
    if (resolveAnchor(stage, route, e.anchor, sections)) return [e];
    if (e.anchor.kind === 'waypoint' || !previous) return [];
    const old = oldSections.find(s => s.id === (e.anchor.kind === 'section' ? e.anchor.sectionId : ''));
    const point = old && pointAlong(old.points, e.anchor.fraction);
    if (!old || !point) return [];
    // Locate the nearest surviving endpoints in the old route around the removed section.
    const oldIds = oldSections.length ? [oldSections[0].fromId, ...oldSections.map(s => s.toId)] : [];
    const newIds = sections.length ? [sections[0].fromId, ...sections.map(s => s.toId)] : [];
    let left = oldIds.indexOf(old.fromId), right = oldIds.indexOf(old.toId);
    while (left >= 0 && !newIds.includes(oldIds[left])) left--;
    while (right < oldIds.length && !newIds.includes(oldIds[right])) right++;
    const from = newIds.indexOf(oldIds[left]), to = newIds.indexOf(oldIds[right]);
    if (from < 0 || to <= from) return [];
    // Only a split/merge chain: no other surviving old waypoint can have moved into this interval.
    if (newIds.slice(from + 1, to).some(id => oldIds.includes(id) && (oldIds.indexOf(id) <= left || oldIds.indexOf(id) >= right))) return [];
    const replacement = sections.slice(from, to).map(s => ({ section: s, projection: projectToSection(s, point) })).sort((a, b) => a.projection.distance - b.projection.distance)[0];
    return replacement ? [{ ...e, anchor: { kind: 'section' as const, sectionId: replacement.section.id, fraction: replacement.projection.fraction } }] : [];
  });
  return JSON.stringify(entries) === JSON.stringify(route.manualEngagements) ? route : { ...route, manualEngagements: entries };
}
