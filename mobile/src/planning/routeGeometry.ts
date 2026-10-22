import type { StagePosition, StageSize } from '../stage/coordinates';
import type { StageRoute } from './route';

export type RouteBend = { id: string; position: StagePosition };
/** Geometry is separate from numbered positions and their engagement metadata. */
export type RouteConnection = { fromId: string; toId: string; style: 'STRAIGHT' | 'ROUNDED'; bends: RouteBend[] };
export function validConnections(value: unknown, positions: StageRoute['positions']): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !Array.isArray(positions)) return false;
  const keys = new Set<string>(), ids = new Set<string>();
  return value.every(c => {
    if (!c || typeof c.fromId !== 'string' || typeof c.toId !== 'string' || !['STRAIGHT', 'ROUNDED'].includes(c.style) || !Array.isArray(c.bends)) return false;
    const i = positions.findIndex(p => p?.id === c.toId);
    if (i < 0 || (i > 0 && positions[i-1].id !== c.fromId) || c.fromId === c.toId || keys.has(c.toId)) return false;
    keys.add(c.toId);
    return c.bends.every((b: RouteBend) => {
      if (!b || typeof b.id !== 'string' || !b.id || ids.has(b.id) || b.position?.space !== 'stage' || b.position.z !== 0 || ![b.position.x,b.position.y].every(Number.isFinite)) return false;
      ids.add(b.id); return true;
    });
  });
}
/** Discard geometry only when its endpoint pair is no longer adjacent. */
export function retainConnections(route: StageRoute): StageRoute {
  return { ...route, ...(route.connections ? { connections: route.connections.filter(c => {
    const i = route.positions.findIndex(p => p.id === c.toId);
    return i >= 0 && (i === 0 ? !route.positions.some(p => p.id === c.fromId) : route.positions[i-1].id === c.fromId);
  }) } : {}) };
}
export function setConnection(route: StageRoute, connection: RouteConnection): StageRoute {
  return { ...route, connections: [...(route.connections ?? []).filter(c => c.toId !== connection.toId), connection] };
}
export function clampRoutePoint(p: StagePosition, size: StageSize): StagePosition {
  return { space: 'stage', x: Math.max(0,Math.min(size.width,p.x)), y: Math.max(0,Math.min(size.depth,p.y)), z: 0 };
}
const distance = (a: StagePosition,b: StagePosition) => Math.hypot(b.x-a.x,b.y-a.y);
const mix = (a: StagePosition,b: StagePosition,t: number): StagePosition => ({space:'stage',x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:0});
/** Bounded quadratic corner cuts: <=12 inches and 20% of either edge.
 * Samples stay inside the corner triangle and are independent of viewport zoom. */
/** Only the connection geometry is read, so deeply readonly routes (assistant snapshots) are accepted too. */
type ConnectionSource = { readonly connections?: ReadonlyArray<{ readonly fromId: string; readonly toId: string; readonly style: string; readonly bends: ReadonlyArray<{ readonly position: StagePosition }> }> };
export function connectionPoints(route: ConnectionSource, fromId: string, toId: string, a: StagePosition, b: StagePosition): StagePosition[] {
  const c = route.connections?.find(c => c.fromId === fromId && c.toId === toId);
  const points = [a,...(c?.bends.map(b => b.position) ?? []),b];
  if (c?.style !== 'ROUNDED') return points;
  const result = [a];
  for (let i=1;i<points.length-1;i++) {
    const prev=points[i-1],corner=points[i],next=points[i+1];
    const incoming=distance(prev,corner),outgoing=distance(corner,next);
    const trim=Math.min(12,incoming*.2,outgoing*.2);
    if (trim < 1e-6) { result.push(corner); continue; }
    const entry=mix(corner,prev,trim/incoming),exit=mix(corner,next,trim/outgoing);
    result.push(entry);
    for(let step=1;step<=12;step++) { const t=step/12; result.push(mix(mix(entry,corner,t),mix(corner,exit,t),t)); }
  }
  result.push(b); return result;
}
export const pathLength = (points: StagePosition[]) => points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
