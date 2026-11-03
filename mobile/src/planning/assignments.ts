/**
 * One engagement model (UI cohesion plan, phase 3): a position's `engagedTargetIds` is the single record of which
 * position engages a target. AUTO-PLAN writes it, ANALYZE checks it, the target sheet and the drag from a position to
 * a target change it through `assignTarget` / `unassignTarget`.
 *
 * Saved ENGAGE arrows (`route.manualEngagements`, the older second model) are folded into it once, when a plan is
 * normalised (`reconcilePlan` → `migrateManualEngagements`). After that the route carries no arrows.
 */
import type { StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import { isEngageable } from './model';
import type { ShootingPosition, StageRoute } from './route';
import { pathLength } from './routeGeometry';
import type { RouteConnection } from './routeGeometry';
import { resolveAnchor, routeSections } from './manualEngagements';

/** Where the route engages a target: the position (and its index in route order), and whether on the way in. */
export type TargetAssignment = { positionId: string; index: number; moving: boolean };
export function targetAssignment(route: StageRoute | undefined, targetId: string): TargetAssignment | null {
  const index = route?.positions.findIndex(p => p.engagedTargetIds.includes(targetId)) ?? -1;
  if (!route || index < 0) return null;
  const p = route.positions[index];
  return { positionId: p.id, index, moving: !!p.movingTargetIds?.includes(targetId) };
}

/**
 * Engage a target from a position, standing (the drag from a position to a target, or "Engaged from" in the target
 * sheet). A target has exactly one engagement, so it leaves any other position. Already engaged here: unchanged, so
 * the order the user set is kept. It is added last at this position and marked visible there.
 */
export function assignTarget(route: StageRoute, stage: Pick<StageDocument, 'objects'>, positionId: string, targetId: string): StageRoute {
  if (!route.positions.some(p => p.id === positionId) || !stage.objects.some(o => o.id === targetId && isEngageable(o))) return route;
  const engagedAt = route.positions.filter(p => p.engagedTargetIds.includes(targetId));
  if (engagedAt.length === 1 && engagedAt[0].id === positionId && !engagedAt[0].movingTargetIds?.includes(targetId)) return route;
  return { ...route, positions: route.positions.map(p => {
    if (p.id !== positionId && !p.engagedTargetIds.includes(targetId)) return p;
    const engaged = p.engagedTargetIds.filter(id => id !== targetId);
    return { ...p, ...(p.movingTargetIds ? { movingTargetIds: p.movingTargetIds.filter(id => id !== targetId) } : {}),
      engagedTargetIds: p.id === positionId ? [...engaged, targetId] : engaged,
      visibleTargetIds: p.id === positionId && !p.visibleTargetIds.includes(targetId) ? [...p.visibleTargetIds, targetId] : p.visibleTargetIds };
  }) };
}

/** Stop engaging a target (from one position, or from wherever it is engaged). It stays marked visible. */
export function unassignTarget(route: StageRoute, targetId: string, positionId?: string): StageRoute {
  if (!route.positions.some(p => (positionId === undefined || p.id === positionId) && p.engagedTargetIds.includes(targetId))) return route;
  return { ...route, positions: route.positions.map(p => (positionId !== undefined && p.id !== positionId) || !p.engagedTargetIds.includes(targetId) ? p : {
    ...p, engagedTargetIds: p.engagedTargetIds.filter(id => id !== targetId),
    ...(p.movingTargetIds ? { movingTargetIds: p.movingTargetIds.filter(id => id !== targetId) } : {}),
  }) };
}

const between = (a: StagePosition, b: StagePosition, t: number): StagePosition => ({ space: 'stage', x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0 });
/** Where a stretch's walk is at `fraction` (0 to 1) of its drawn length: start, bends, end. */
function pointOnStretch(connection: RouteConnection | undefined, from: StagePosition, to: StagePosition, fraction: number): StagePosition {
  const points = [from, ...(connection?.bends.map(b => b.position) ?? []), to], wanted = pathLength(points) * fraction;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (walked + length >= wanted) return length ? between(points[i - 1], points[i], (wanted - walked) / length) : points[i];
    walked += length;
  }
  return between(from, to, 0.5);
}
/** Splits a drawn connection's bends at `point` on its walk: the bends before it go to the first half, the rest after. */
function splitBends(connection: RouteConnection | undefined, from: StagePosition, to: StagePosition, point: StagePosition) {
  const points = [from, ...(connection?.bends.map(b => b.position) ?? []), to];
  let best = { segment: 1, distance: Infinity };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    const d = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
    if (d < best.distance - 1e-9) best = { segment: i, distance: d };
  }
  return { before: connection?.bends.slice(0, best.segment - 1) ?? [], after: connection?.bends.slice(best.segment - 1) ?? [] };
}
/** The first position label not taken: P1, P2… */
function freeLabel(labels: Set<string>): string {
  let number = 1;
  while (labels.has('P' + number)) number++;
  labels.add('P' + number);
  return 'P' + number;
}
/**
 * Puts a new position on the stretch that ends at `toId` (from the start or the position before it), at `point` on
 * that stretch, engaging `targets` in order. The drawn path is split there, its bends kept on their side. The one rule
 * for a position made on the path: the drag from the path to a target (`assignFromPath`) and the migration of old
 * arrows on a stretch (`migrateManualEngagements`) both use it.
 */
function insertOnStretch(stage: Pick<StageDocument, 'objects'>, route: StageRoute, toId: string, point: StagePosition, targets: string[], id: string, label: string): StageRoute {
  const index = route.positions.findIndex(p => p.id === toId), start = stage.objects.find(o => o.type === 'start');
  const from = index > 0 ? route.positions[index - 1] : start;
  if (index < 0 || !from) return route;
  const drawn = route.connections?.find(c => c.fromId === from.id && c.toId === toId);
  const split = splitBends(drawn, from.position, route.positions[index].position, point);
  const connections = drawn ? [...route.connections!.filter(c => c !== drawn),
    ...(split.before.length ? [{ ...drawn, toId: id, bends: split.before }] : []), ...(split.after.length ? [{ ...drawn, fromId: id, bends: split.after }] : [])] : route.connections;
  const inserted: ShootingPosition = { id, label, position: { space: 'stage', x: point.x, y: point.y, z: 0 }, visibleTargetIds: [...targets], engagedTargetIds: [...targets] };
  return { ...route, positions: [...route.positions.slice(0, index), inserted, ...route.positions.slice(index)], ...(connections !== undefined ? { connections } : {}) };
}

/**
 * The drag from the path to a target: a new position where the drag started on the path between two positions (or
 * between the start and P1), engaging that target there (it leaves any other position, as with `assignTarget`).
 * `sectionId` is the stretch (routeSectionId(fromId, toId)); `point` is on it. Unchanged when the stretch or the target
 * is gone.
 */
export function assignFromPath(stage: StageDocument, route: StageRoute, sectionId: string, point: StagePosition, targetId: string, id: string): StageRoute {
  const section = routeSections(stage, route).find(s => s.id === sectionId);
  if (!section || route.positions.some(p => p.id === id) || !stage.objects.some(o => o.id === targetId && isEngageable(o))) return route;
  const label = freeLabel(new Set(route.positions.map(p => p.label)));
  const inserted = insertOnStretch(stage, route, section.toId, point, [], id, label);
  return inserted === route ? route : assignTarget(inserted, stage, id, targetId);
}

/**
 * Folds saved ENGAGE arrows into the one engagement model, then drops them from the route:
 * - an arrow from a position adds its target to that position's engagements, after the ones already there, in the
 *   arrows' saved order;
 * - arrows from the path between two positions become one new position at the middle of that stretch (the drawn path
 *   is split there, bends kept on their side), engaging their targets in saved order.
 * A target keeps the position that already engaged it (ANALYZE already checked that one); later arrows to it are
 * dropped, as are arrows to deleted targets or from positions or stretches that no longer exist. Idempotent: a route
 * without arrows is returned unchanged.
 */
export function migrateManualEngagements(stage: StageDocument, route: StageRoute): StageRoute {
  if (route.manualEngagements === undefined) return route;
  const { manualEngagements, ...rest } = route;
  const sections = routeSections(stage, route);
  const targets = new Set(stage.objects.filter(isEngageable).map(o => o.id));
  const claimed = new Set(route.positions.flatMap(p => p.engagedTargetIds));
  const atPosition = new Map<string, string[]>(), onSection = new Map<string, { targets: string[]; firstId: string }>();
  for (const e of manualEngagements) {
    if (!targets.has(e.targetId) || claimed.has(e.targetId) || !resolveAnchor(stage, route, e.anchor, sections)) continue;
    claimed.add(e.targetId);
    if (e.anchor.kind === 'waypoint') atPosition.set(e.anchor.waypointId, [...(atPosition.get(e.anchor.waypointId) ?? []), e.targetId]);
    else { const s = onSection.get(e.anchor.sectionId); if (s) s.targets.push(e.targetId); else onSection.set(e.anchor.sectionId, { targets: [e.targetId], firstId: e.id }); }
  }
  const ids = new Set(route.positions.map(p => p.id)), labels = new Set(route.positions.map(p => p.label));
  const start = stage.objects.find(o => o.type === 'start');
  let next: StageRoute = { ...rest, positions: route.positions.map(p => {
    const engage = atPosition.get(p.id) ?? [];
    return engage.length ? { ...p, engagedTargetIds: [...p.engagedTargetIds, ...engage], visibleTargetIds: [...new Set([...p.visibleTargetIds, ...engage])] } : p;
  }) };
  route.positions.forEach((p, i) => {
    const section = sections.find(s => s.toId === p.id), added = section && onSection.get(section.id);
    const from = i ? route.positions[i - 1].position : start?.position;
    if (!section || !added || !from) return;
    let id = 'position-' + added.firstId, n = 2;
    while (ids.has(id)) id = `position-${added.firstId}-${n++}`;
    ids.add(id);
    const drawn = route.connections?.find(c => c.fromId === section.fromId && c.toId === section.toId);
    next = insertOnStretch(stage, next, p.id, pointOnStretch(drawn, from, p.position, 0.5), added.targets, id, freeLabel(labels));
  });
  return next;
}
