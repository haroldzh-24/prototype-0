import type { StageRoute } from '../route';
import type { Geometry, Diagnostics, Point, Barrier, RouteSolverInput } from '../routeSolver/types';
import { stageGeometry } from '../routeSolver/stageGeometry';
import { isSegmentTraversable, isPointTraversable, visited, distanceBetweenPoints, segmentIntersectsWall } from '../routeSolver/traversability';
import type { RouteAssistantContext, RouteMetrics, ExplanationReason, Highlights, RouteComparison } from './types';
import { clone } from './context';
export function geometry(context: RouteAssistantContext, constraints: readonly Barrier[] = []): Geometry {
  const input = clone(context.solverInput) as RouteSolverInput;
  input.restrictedRegions = [...(input.restrictedRegions ?? []), ...constraints];
  const diagnostics: Diagnostics = {solverVersion:'assistant-evaluation',rawFaultSegmentCount:0,interpretedFaultRegionCount:0,endpointMerges:0,inferredGapClosures:0,graphNodeCount:0,graphEdgeCount:0,searchIterations:0,routesEvaluated:0,prunedCandidates:0,waypointReductions:0,finalDistance:null,solveDurationMs:0,warnings:[],unresolvedRequiredAreas:[]};
  return stageGeometry(input, diagnostics);
}
export const getWaypoints = (c: RouteAssistantContext) => clone(c.route.positions);
export const getWaypoint = (c: RouteAssistantContext, id: string) => clone(c.route.positions.find(p => p.id === id) ?? null);
export const getRequiredAreas = (c: RouteAssistantContext) => clone(c.solverInput.requiredAreas);
export const getAlternatives = (c: RouteAssistantContext) => clone(c.solverResult?.alternatives ?? []);
export const getRouteDiagnostics = (c: RouteAssistantContext) => clone(c.solverResult?.diagnostics ?? null);
export function routeMetrics(c: RouteAssistantContext, route: RouteAssistantContext['route'], constraints: readonly Barrier[] = []): RouteMetrics {
  const g = geometry(c, constraints), points = [g.start, ...route.positions.map(p => p.position)];
  const covered = visited(points, g.requiredAreas), missed = g.requiredAreas.filter(a => !covered.includes(a.id)).map(a => a.id);
  const warnings: string[] = [];
  if (!isPointTraversable(g.start, g)) warnings.push('INVALID_START');
  if (points.slice(1).some((p,i) => !isSegmentTraversable(points[i],p,g))) warnings.push('BLOCKED_ROUTE');
  if (missed.length) warnings.push('REQUIRED_AREAS_MISSED');
  let turns = 0;
  for (let i=1;i<points.length-1;i++) {
    const a=points[i-1], b=points[i], d=points[i+1];
    const cross=(b.x-a.x)*(d.y-b.y)-(b.y-a.y)*(d.x-b.x),dot=(b.x-a.x)*(d.x-b.x)+(b.y-a.y)*(d.y-b.y);
    if (distanceBetweenPoints(a,b)>1e-7 && distanceBetweenPoints(b,d)>1e-7 && Math.abs(Math.atan2(cross,dot))>1e-7) turns++;
  }
  return {distanceInches:points.slice(1).reduce((n,p,i)=>n+distanceBetweenPoints(points[i],p),0),waypointCount:route.positions.length,directionChanges:turns,requiredAreasVisited:covered,requiredAreasMissed:missed,valid:!warnings.length,warnings};
}
export const getRouteSummary = (c: RouteAssistantContext) => ({routeId:c.route.id,...routeMetrics(c,c.route)});
export const getRouteDistance = (c: RouteAssistantContext) => ({distanceInches:routeMetrics(c,c.route).distanceInches});
export function compareRoutes(c: RouteAssistantContext, a: RouteAssistantContext['route'], b: RouteAssistantContext['route'], constraints: readonly Barrier[] = []): RouteComparison {
  const before=routeMetrics(c,a),after=routeMetrics(c,b,constraints);
  return {before,after,distanceDifferenceInches:after.distanceInches-before.distanceInches,waypointDifference:after.waypointCount-before.waypointCount,directionChangeDifference:after.directionChanges-before.directionChanges,
    coverageGained:after.requiredAreasVisited.filter(id=>!before.requiredAreasVisited.includes(id)),coverageLost:before.requiredAreasVisited.filter(id=>!after.requiredAreasVisited.includes(id)),
    geometryChanges:{added:b.positions.filter(p=>!a.positions.some(q=>q.id===p.id)).map(p=>p.id),removed:a.positions.filter(p=>!b.positions.some(q=>q.id===p.id)).map(p=>p.id),moved:b.positions.filter(p=>a.positions.some(q=>q.id===p.id&&distanceBetweenPoints(p.position,q.position)>1e-7)).map(p=>p.id),reordered:a.positions.filter(p=>b.positions.some(q=>q.id===p.id)).map(p=>p.id).join('|')!==b.positions.filter(p=>a.positions.some(q=>q.id===p.id)).map(p=>p.id).join('|')}};
}
export function getBlockingGeometry(c: RouteAssistantContext, from: Point, to: Point) {
  const g=geometry(c);
  return {stageObjectIds:g.barriers.filter(b=>segmentIntersectsWall(from,to,b,g.clearance)).map(b=>b.id),restrictedRegionIds:g.restrictedRegions.filter(b=>segmentIntersectsWall(from,to,b,g.clearance)).map(b=>b.id),traversable:isSegmentTraversable(from,to,g)};
}
export function explainWaypoint(c: RouteAssistantContext, id: string) {
  const index=c.route.positions.findIndex(p=>p.id===id);
  if(index<0)return {status:'invalid',code:'WAYPOINT_NOT_FOUND'} as const;
  const trial=clone(c.route) as StageRoute; trial.positions.splice(index,1);
  trial.reloads=trial.reloads.filter(r=>r.positionId!==id);
  const delta=compareRoutes(c,c.route,trial),reasons:ExplanationReason[]=[];
  if(delta.coverageLost.length)reasons.push({type:'REQUIRED_AREA_VISIT',requiredAreaIds:delta.coverageLost});
  if(index<c.route.positions.length-1){
    const from=index?c.route.positions[index-1].position:c.solverInput.start,to=c.route.positions[index+1].position,b=getBlockingGeometry(c,from,to);
    if(b.stageObjectIds.length)reasons.push({type:'OBSTACLE_DETOUR',objectIds:b.stageObjectIds,distanceAddedInches:-delta.distanceDifferenceInches});
    if(b.restrictedRegionIds.length)reasons.push({type:'RESTRICTED_AREA_DETOUR',objectIds:b.restrictedRegionIds});
    if(!b.traversable&&!b.stageObjectIds.length&&!b.restrictedRegionIds.length)reasons.push({type:'STAGE_BOUNDARY_CONSTRAINT'});
  }
  if(!reasons.length && delta.after.valid)reasons.push({type:'REDUNDANT_WAYPOINT_REMOVED'});
  const solved=c.solverResult?.bestRoute;
  const matches=solved&&solved.waypoints.length===c.route.positions.length+1&&solved.waypoints.every((p,i)=>distanceBetweenPoints(p,i?c.route.positions[i-1].position:c.solverInput.start)<1e-7);
  if(matches&&!delta.after.valid&&!reasons.length)reasons.push({type:'SHORTEST_AVAILABLE_PATH'});
  return {waypointId:id,reasons,removable:delta.after.valid,removalImpact:delta};
}
export function explainRouteSegment(c: RouteAssistantContext, fromId: string, toId: string) {
  const ids=['START',...c.route.positions.map(p=>p.id)],index=ids.indexOf(fromId);
  if(index<0||ids[index+1]!==toId)return {status:'invalid',code:'SEGMENT_NOT_FOUND'} as const;
  const from=index?c.route.positions[index-1].position:c.solverInput.start,to=c.route.positions[index].position;
  return {fromId,toId,distanceInches:distanceBetweenPoints(from,to),...getBlockingGeometry(c,from,to),destination:explainWaypoint(c,toId)};
}
export const emptyHighlights = (): Highlights => ({waypointIds:[],stageObjectIds:[],requiredAreaIds:[],routeSegmentIds:[],temporaryRegionIds:[]});
export const formatExplanation = (reasons: readonly ExplanationReason[]) => reasons.map(r=>`${r.type}: ${(r.objectIds??r.requiredAreaIds??[]).join(', ')}`).join('\n');
