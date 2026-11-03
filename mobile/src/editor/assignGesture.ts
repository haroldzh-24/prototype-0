import { stageToViewport, viewportToStage } from '../stage/coordinates';
import type { StagePosition, ViewportTransform } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { StageRoute } from '../planning/route';
import { isEngageable } from '../planning/model';
import { projectToSection, routeSections } from '../planning/manualEngagements';
import type { EngagementAnchor } from '../planning/manualEngagements';

/**
 * The drag that engages a target (PLAN, checklist line 3): from a position to a target assigns it there; from the path
 * between two positions to a target adds a position where the drag started and assigns it to that one. The drag only
 * reads the route; the editor applies the result (assignTarget / assignFromPath).
 */
type Point = { x: number; y: number };
export type AssignGesture = {
  /** Where the drag started: a position, or a point on the stretch of path ending at a position. */
  anchor: EngagementAnchor; point: StagePosition; origin: Point; cursor: Point;
  targetId: string | null; moved: boolean; cancelled: boolean;
};
/** The scoring target under the finger (its rotated face, at least 44 points); repeated taps cycle overlapping ones. */
export function targetAt(stage: StageDocument, transform: ViewportTransform, cursor: Point, selectedId?: string | null): string | null {
  const hits: { id: string; distance: number }[] = [];
  for (const target of stage.objects.filter(isEngageable)) {
    if (!('faceWidth' in target.geometry)) continue;
    const center = stageToViewport(target.position, transform), dx = cursor.x - center.x, dy = cursor.y - center.y;
    const angle = target.rotation * Math.PI / 180, x = dx * Math.cos(angle) + dy * Math.sin(angle), y = -dx * Math.sin(angle) + dy * Math.cos(angle);
    const width = Math.max(44, target.geometry.faceWidth * transform.scale), height = Math.max(44, target.geometry.faceHeight * transform.scale);
    if (Math.abs(x) <= width / 2 && Math.abs(y) <= height / 2) hits.push({ id: target.id, distance: Math.hypot(dx, dy) });
  }
  hits.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const index = hits.findIndex(hit => hit.id === selectedId);
  return hits.length ? hits[(index + 1) % hits.length].id : null;
}
/** Starts on a position (within 22 points of its centre) or on the drawn path (within 22 points); otherwise null. */
export function beginAssignGesture(stage: StageDocument, route: StageRoute, transform: ViewportTransform, cursor: Point): AssignGesture | null {
  const nearest = route.positions.map(p => ({ p, screen: stageToViewport(p.position, transform) }))
    .map(v => ({ ...v, distance: Math.hypot(cursor.x - v.screen.x, cursor.y - v.screen.y) })).sort((a, b) => a.distance - b.distance)[0];
  let anchor: EngagementAnchor, point: StagePosition;
  if (nearest && nearest.distance <= 22) { anchor = { kind: 'waypoint', waypointId: nearest.p.id }; point = nearest.p.position; }
  else {
    const stagePoint = viewportToStage({ space: 'viewport', ...cursor }, transform);
    const onPath = routeSections(stage, route).map(section => ({ section, projection: projectToSection(section, stagePoint) })).sort((a, b) => a.projection.distance - b.projection.distance)[0];
    if (!onPath || onPath.projection.distance * transform.scale > 22) return null;
    anchor = { kind: 'section', sectionId: onPath.section.id, fraction: onPath.projection.fraction }; point = onPath.projection.point;
  }
  return { anchor, point, origin: cursor, cursor, targetId: null, moved: false, cancelled: false };
}
/** A second finger cancels the drag for good (it becomes a pinch); the target is the one under the finger. */
export function moveAssignGesture(gesture: AssignGesture, stage: StageDocument, transform: ViewportTransform, cursor: Point, touches: number): AssignGesture {
  if (touches !== 1 || gesture.cancelled) return { ...gesture, cancelled: true, targetId: null };
  return { ...gesture, cursor, moved: gesture.moved || Math.hypot(cursor.x - gesture.origin.x, cursor.y - gesture.origin.y) > 6, targetId: targetAt(stage, transform, cursor) };
}
/** Released on a target inside the canvas after a real drag: what to assign. */
export function finishAssignGesture(gesture: AssignGesture, inside: boolean): { anchor: EngagementAnchor; point: StagePosition; targetId: string } | null {
  if (gesture.cancelled || !inside || !gesture.moved || !gesture.targetId) return null;
  return { anchor: gesture.anchor, point: gesture.point, targetId: gesture.targetId };
}
