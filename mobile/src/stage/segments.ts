import type { StageDocument, StageObject, SegmentEndpoints } from './model';
import type { StagePosition } from './coordinates';
import type { SnapSettings } from './snapping';
import { normalizeRotation } from './geometry';
import { validatePorts } from './ports';

export type Segment = Extract<StageObject, { type: 'wall' | 'faultLine' }>;
export const isSegment = (o: StageObject): o is Segment => o.type === 'wall' || o.type === 'faultLine';
export function derivedEndpoints(o: Segment): SegmentEndpoints {
  const a = o.rotation * Math.PI / 180, x = Math.cos(a) * o.geometry.length / 2, y = Math.sin(a) * o.geometry.length / 2;
  return { start: { ...o.position, x: o.position.x - x, y: o.position.y - y }, end: { ...o.position, x: o.position.x + x, y: o.position.y + y } };
}
export const endpoints = (o: Segment) => o.endpoints ?? derivedEndpoints(o);
export function segmentMetrics(start: StagePosition, end: StagePosition) {
  return { length: Math.hypot(end.x - start.x, end.y - start.y), angle: normalizeRotation(Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI) };
}
export function validPoint(p: StagePosition): boolean {
  return !!p && p.space === 'stage' && [p.x, p.y, p.z].every(Number.isFinite) && p.z >= 0;
}
export function setEndpoints(stage: StageDocument, object: Segment, start: StagePosition, end: StagePosition) {
  if (![start, end].every(p => validPoint(p) && p.x >= 0 && p.y >= 0 && p.x <= stage.stage.width && p.y <= stage.stage.depth) || start.z !== end.z || (object.type === 'faultLine' && start.z !== 0))
    return { stage, error: 'Endpoints must be finite, at the same elevation, and inside the stage.' };
  const { length, angle } = segmentMetrics(start, end);
  if (!Number.isFinite(length) || length < 0.001) return { stage, error: 'A segment must have finite, non-zero length.' };
  const common = { position: { ...start, x: start.x/2 + end.x/2, y: start.y/2 + end.y/2 }, rotation: angle, endpoints: { start: { ...start }, end: { ...end } } };
  const updated: Segment = object.type === 'wall'
    ? { ...object, ...common, geometry: { ...object.geometry, length } }
    : { ...object, ...common, geometry: { length } };
  if (updated.type === 'wall') { const error = validatePorts(updated.geometry, updated.ports); if (error) return { stage, error }; }
  return { stage: { ...stage, objects: stage.objects.some(o => o.id === object.id) ? stage.objects.map(o => o.id === object.id ? updated : o) : [...stage.objects, updated] } };
}
export function addSegment(stage: StageDocument, type: Segment['type'], id: string, start: StagePosition, end: StagePosition) {
  if (!id.trim() || stage.objects.some(o => o.id === id)) return { stage, error: 'Segment IDs must be fresh.' };
  const base = { id, position: start, rotation: 0 };
  const object: Segment = type === 'wall' ? { ...base, type, geometry: { length: 1, thickness: 4, height: 72 }, ports: [] } : { ...base, type, geometry: { length: 1 } };
  return setEndpoints(stage, object, start, end);
}
export function editSegmentMetrics(stage: StageDocument, object: Segment, length: number, angle: number) {
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(angle)) return { stage, error: 'Length must be positive and angle finite.' };
  const { start } = endpoints(object), a = normalizeRotation(angle) * Math.PI / 180;
  return setEndpoints(stage, object, start, { ...start, x: start.x + Math.cos(a) * length, y: start.y + Math.sin(a) * length });
}
/** Legacy documents have no endpoints. Stored endpoints must agree with the compatible center/length representation. */
export function validSavedEndpoints(object: Segment): boolean {
  if (object.endpoints === undefined) return true;
  const e = object.endpoints;
  if (!e || !validPoint(e.start) || !validPoint(e.end) || e.start.z !== e.end.z || (object.type === 'faultLine' && e.start.z !== 0)) return false;
  const expected = derivedEndpoints(object);
  return segmentMetrics(e.start,e.end).length >= 0.001 && (['start','end'] as const).every(key =>
    Math.hypot(e[key].x-expected[key].x,e[key].y-expected[key].y,e[key].z-expected[key].z) < 1e-6);
}
/** Physical snap priority: endpoint, strong 45-degree angle, then grid. Never screen-rounded. */
export function snapEndpoint(stage: StageDocument, point: StagePosition, start: StagePosition | null, settings: SnapSettings, excludedId?: string) {
  if (!settings.enabled) return { point, rule: 'Free' };
  const candidates = stage.objects.filter(isSegment).filter(o => o.id !== excludedId).flatMap(o => Object.values(endpoints(o)));
  const closest = candidates.map(p => ({ p, d: Math.hypot(p.x - point.x, p.y - point.y) })).filter(v => v.d <= settings.tolerance).sort((a, b) => a.d - b.d)[0];
  if (closest) return { point: { ...point, x: closest.p.x, y: closest.p.y }, rule: 'Endpoint' };
  if (start) {
    const { length, angle } = segmentMetrics(start, point), snapped = Math.round(angle / 45) * 45;
    if (length > 0 && Math.abs(angle - snapped) <= 5) {
      const a = snapped * Math.PI / 180, distance = (point.x - start.x) * Math.cos(a) + (point.y - start.y) * Math.sin(a);
      return { point: { ...point, x: start.x + Math.cos(a) * distance, y: start.y + Math.sin(a) * distance }, rule: 'Angle ' + (snapped % 360) + '°' };
    }
  }
  const grid = settings.gridIncrement;
  return { point: { ...point, x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid }, rule: 'Grid' };
}
