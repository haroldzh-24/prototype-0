import type { RouteSolverInput, RouteSolverResult, Diagnostics } from './types';
import { stageGeometry } from './stageGeometry';
import { navigationGraph } from './navigationGraph';
import { orderRoute } from './routeOrdering';
import { scoreRoute, compareRoutes } from './scoring';
import { isPointTraversable, isSegmentTraversable, distanceBetweenPoints, project } from './traversability';
export const SOLVER_VERSION='1.0.0';
export function solveRoute(input: RouteSolverInput): RouteSolverResult {
  const started=Date.now();
  const diagnostics:Diagnostics={solverVersion:SOLVER_VERSION,rawFaultSegmentCount:0,interpretedFaultRegionCount:0,endpointMerges:0,inferredGapClosures:0,graphNodeCount:0,graphEdgeCount:0,searchIterations:0,routesEvaluated:0,prunedCandidates:0,waypointReductions:0,finalDistance:null,solveDurationMs:0,warnings:[],unresolvedRequiredAreas:[]};
  const finish=(status:RouteSolverResult['status'],bestRoute:RouteSolverResult['bestRoute']=null,alternatives:RouteSolverResult['alternatives']=[]):RouteSolverResult=>{diagnostics.solveDurationMs=Date.now()-started;diagnostics.finalDistance=bestRoute?.totalDistanceInches??null;return {status,bestRoute,alternatives,diagnostics};};
  const finite=(p:{x:number;y:number})=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const options=input.options??{};
  if(input.stage.objects.some(o=>!finite(o.position)||!Number.isFinite(o.rotation)||((o.type==='wall'||o.type==='faultLine')&&(!Number.isFinite(o.geometry.length)||o.geometry.length<=0||(o.endpoints&&(!finite(o.endpoints.start)||!finite(o.endpoints.end)))||(o.type==='wall'&&(!Number.isFinite(o.geometry.thickness)||o.geometry.thickness<0)))))||(input.allowedTravelRegions&&input.allowedTravelRegions.some(r=>r.length<3||!r.every(finite)))){diagnostics.warnings.push('Invalid stage or allowed-travel geometry.');return finish('invalid-input');}
  if(input.stage.coordinateSystem!=='inches'||!finite(input.start)||!Number.isFinite(input.stage.stage.width)||!Number.isFinite(input.stage.stage.depth)||input.stage.stage.width<=0||input.stage.stage.depth<=0||new Set(input.requiredAreas.map(a=>a.id)).size!==input.requiredAreas.length||input.requiredAreas.some(a=>!a.id||!a.polygon.length||a.polygon.length===2||!a.polygon.every(finite)||(a.preferredPoint&&!finite(a.preferredPoint)))||[...(input.barriers??[]),...(input.restrictedRegions??[])].some(b=>b.polygon.length<3||!b.polygon.every(finite))||Object.values(options.tolerances??{}).some(v=>!Number.isFinite(v)||v<0)||[options.clearanceInches??0,options.maxNodes??512,options.maxSearchIterations??100000,options.exactAreaLimit??8,options.maxAlternatives??2].some(v=>!Number.isFinite(v)||v<0)){
    diagnostics.warnings.push('Invalid physical solver input.');return finish('invalid-input');
  }
  // Intake work is quadratic: bound it before building planar/visibility graphs.
  if(input.stage.objects.length>512||input.requiredAreas.length>32||input.requiredAreas.some(a=>a.polygon.length>64)||[...(input.barriers??[]),...(input.restrictedRegions??[])].some(b=>b.polygon.length>64)||(input.allowedTravelRegions?.some(r=>r.length>64))||input.requiredAreas.reduce((n,a)=>n+a.polygon.length,0)+[...(input.barriers??[]),...(input.restrictedRegions??[])].reduce((n,b)=>n+b.polygon.length,0)+(input.allowedTravelRegions?.reduce((n,r)=>n+r.length,0)??0)>256) {diagnostics.warnings.push('Geometry intake limit exceeded.');return finish('limit');}
  const g=stageGeometry(input,diagnostics);
  g.requiredAreas.sort((a,b)=>a.id.localeCompare(b.id));
  if(!isPointTraversable(g.start,g)){diagnostics.warnings.push('Start is outside the stage or blocked.');return finish('invalid-input');}
  const graph=navigationGraph(g,Math.min(512,options.maxNodes??512),diagnostics);
  if(!graph)return finish('limit');
  const limit=Math.min(200000,options.maxSearchIterations??100000),exactLimit=options.exactAreaLimit??8;
  const path=orderRoute(graph,g,diagnostics,limit,exactLimit);
  if(!path){diagnostics.unresolvedRequiredAreas=g.requiredAreas.map(a=>a.id);diagnostics.warnings.push(diagnostics.searchIterations>=limit?'Search budget exhausted.':'Required geometry is unreachable.');return finish(diagnostics.searchIterations>=limit?'limit':'unreachable');}
  const primary=scoreRoute('route-best',path.map(i=>graph.nodes[i]),g,diagnostics);diagnostics.routesEvaluated++;
  if(primary.requiredAreasMissed.length||primary.waypoints.slice(1).some((p,i)=>!isSegmentTraversable(primary.waypoints[i],p,g)))return finish('unreachable');
  const candidates=[primary];
  // Bounded edge-exclusion searches expose different obstacle-side paths, when present.
  const requested=primary.explanationData.some(e=>e.kind==='obstruction')?Math.min(2,Math.floor(options.maxAlternatives??2)):0;
  for(let i=1;i<path.length&&i<=6&&requested>0&&diagnostics.searchIterations<limit;i++) {
    const blocked=[path[i-1],path[i]].sort((a,b)=>a-b).join(':');
    const alternative=orderRoute(graph,g,diagnostics,limit,exactLimit,blocked);if(!alternative)continue;
    const candidate=scoreRoute(`route-alternative-${i}`,alternative.map(j=>graph.nodes[j]),g,diagnostics);diagnostics.routesEvaluated++;
    const nearPath=(p:typeof g.start,points:typeof candidate.waypoints)=>points.length===1?distanceBetweenPoints(p,points[0])<6:points.slice(1).some((q,i)=>distanceBetweenPoints(p,project(p,points[i],q))<6);
    const same=(a:typeof candidate,b:typeof candidate)=>a.waypoints.every(p=>nearPath(p,b.waypoints))&&b.waypoints.every(p=>nearPath(p,a.waypoints));
    if(!candidate.requiredAreasMissed.length&&!candidates.some(c=>same(c,candidate)))candidates.push(candidate);else diagnostics.prunedCandidates++;
  }
  candidates.sort(compareRoutes);
  if(diagnostics.searchIterations>=limit)diagnostics.warnings.push('Alternative comparison stopped at the search limit.');
  return finish('success',{...candidates[0],id:'route-best'},candidates.slice(1,requested+1).map((route,i)=>({...route,id:`route-alternative-${i+1}`})));
}
