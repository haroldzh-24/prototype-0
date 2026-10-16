import { stageToViewport, viewportToStage } from '../stage/coordinates';
import type { StagePosition, ViewportTransform } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { StageRoute } from '../planning/route';
import { isEngageable } from '../planning/model';
import { projectToSection, resolveAnchor, routeSections } from '../planning/manualEngagements';
import type { EngagementAnchor } from '../planning/manualEngagements';

type Point = { x: number; y: number };
export type EngagementGesture = {
  anchor: EngagementAnchor; point: StagePosition; origin: Point; cursor: Point;
  editingId?: string; direction: number; targetId: string | null; moved: boolean; cancelled: boolean;
};
export function targetAt(stage: StageDocument, transform: ViewportTransform, cursor: Point, selectedId?: string | null): string | null {
  // Match the rotated target marker's selection rectangle, with a 44-point minimum.
  const hits: { id: string; distance: number }[] = [];
  for (const target of stage.objects.filter(isEngageable)) {
    if (!('faceWidth' in target.geometry)) continue;
    const center = stageToViewport(target.position, transform), dx = cursor.x - center.x, dy = cursor.y - center.y;
    const angle = target.rotation * Math.PI / 180, x = dx * Math.cos(angle) + dy * Math.sin(angle), y = -dx * Math.sin(angle) + dy * Math.cos(angle);
    const width = Math.max(44, target.geometry.faceWidth * transform.scale), height = Math.max(44, target.geometry.faceHeight * transform.scale);
    const distance = Math.hypot(dx, dy);
    if (Math.abs(x) <= width / 2 && Math.abs(y) <= height / 2 ) hits.push({ id: target.id, distance });
  }
  hits.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const index = hits.findIndex(hit => hit.id === selectedId);
  return hits.length ? hits[(index + 1) % hits.length].id : null;
}
export function beginEngagementGesture(stage: StageDocument, route: StageRoute, transform: ViewportTransform, cursor: Point): EngagementGesture | null {
  const sections = routeSections(stage, route);
  const waypoint = route.positions.map(p => ({ p, screen: stageToViewport(p.position, transform) }))
    .map(v => ({ ...v, distance: Math.hypot(cursor.x - v.screen.x, cursor.y - v.screen.y) })).sort((a, b) => a.distance - b.distance)[0];
  // The waypoint center always remains available for another engagement, even with several arrows.
  if (!waypoint || waypoint.distance > 10) {
    const arrows = (route.manualEngagements ?? []).flatMap(e => {
      const point = resolveAnchor(stage, route, e.anchor, sections);
      if (!point) return [];
      const a = stageToViewport(point, transform), dx = cursor.x - a.x, dy = cursor.y - a.y;
      const along = Math.max(18, Math.min(44, dx * Math.cos(e.direction) + dy * Math.sin(e.direction)));
      const distance = Math.hypot(dx - along * Math.cos(e.direction), dy - along * Math.sin(e.direction));
      const markerDistance = e.anchor.kind === 'section' ? Math.hypot(dx, dy) : Infinity;
      return [{ e, point, distance: Math.min(distance, markerDistance) }];
    }).filter(v => v.distance <= 22).sort((a, b) => a.distance - b.distance);
    if (arrows[0]) { const { e, point } = arrows[0]; return { anchor: e.anchor, point, origin: cursor, cursor, editingId: e.id, direction: e.direction, targetId: e.targetId, moved: false, cancelled: false }; }
  }
  let anchor: EngagementAnchor, point: StagePosition;
  if (waypoint && waypoint.distance <= 22) { anchor = { kind: 'waypoint', waypointId: waypoint.p.id }; point = waypoint.p.position; }
  else {
    const stagePoint = viewportToStage({ space: 'viewport', ...cursor }, transform);
    const nearest = sections.map(section => ({ section, projection: projectToSection(section, stagePoint) })).sort((a, b) => a.projection.distance - b.projection.distance)[0];
    if (!nearest || nearest.projection.distance * transform.scale > 22) return null;
    anchor = { kind: 'section', sectionId: nearest.section.id, fraction: nearest.projection.fraction }; point = nearest.projection.point;
  }
  return { anchor, point, origin: cursor, cursor, direction: 0, targetId: null, moved: false, cancelled: false };
}
export function moveEngagementGesture(gesture: EngagementGesture, stage: StageDocument, transform: ViewportTransform, cursor: Point, touches: number): EngagementGesture {
  if (touches !== 1 || gesture.cancelled) return { ...gesture, cancelled: true, targetId: null };
  const anchor = stageToViewport(gesture.point, transform), dx = cursor.x - anchor.x, dy = cursor.y - anchor.y;
  return { ...gesture, cursor, moved: gesture.moved || Math.hypot(cursor.x - gesture.origin.x, cursor.y - gesture.origin.y) > 6,
    direction: Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : gesture.direction, targetId: targetAt(stage, transform, cursor) };
}
export function finishEngagementGesture(gesture: EngagementGesture, inside: boolean) {
  if (gesture.cancelled || !inside || !gesture.moved) return null;
  if (gesture.editingId) return { kind: 'direction' as const, id: gesture.editingId, direction: gesture.direction };
  return gesture.targetId ? { kind: 'create' as const, anchor: gesture.anchor, targetId: gesture.targetId, direction: gesture.direction } : null;
}
