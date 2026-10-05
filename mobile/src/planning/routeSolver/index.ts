export { solveRoute, SOLVER_VERSION } from './solveRoute';
export type { RouteSolverInput, RouteSolverResult, RouteCandidate, RequiredArea, SolverOptions, Diagnostics, Point } from './types';
export { candidateToStageRoute, solverInputFromPlan } from './adoption';
import type { RouteCandidate } from './types';
export function getRouteSummary(route:RouteCandidate){return {id:route.id,totalDistanceInches:route.totalDistanceInches,waypointCount:route.waypointCount,requiredAreasVisited:[...route.requiredAreasVisited],requiredAreasMissed:[...route.requiredAreasMissed]};}
export function compareRoutes(a:RouteCandidate,b:RouteCandidate){return {first:getRouteSummary(a),second:getRouteSummary(b),distanceDifferenceInches:a.totalDistanceInches-b.totalDistanceInches,waypointDifference:a.waypointCount-b.waypointCount};}
export function explainWaypoint(route:RouteCandidate,index:number){return route.explanationData.filter(e=>e.waypointIndex===index).map(e=>({...e,...(e.areaIds?{areaIds:[...e.areaIds]}:{}),...(e.barrierIds?{barrierIds:[...e.barrierIds]}:{})}));}
