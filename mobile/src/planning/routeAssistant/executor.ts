import type { StageRoute } from '../route';
import { solveRoute } from '../routeSolver/solveRoute';
import { assistantSolverCache } from './solverCache';
import { candidateToStageRoute } from '../routeSolver/adoption';
import type { RouteSolverInput, Barrier } from '../routeSolver/types';
import { project, distanceBetweenPoints } from '../routeSolver/traversability';
import type { RouteAssistantContext, RouteAssistantCommand, RouteAssistantResult, RouteQuery } from './types';
import { clone, freeze, fingerprint } from './context';
import * as Q from './queries';
import { validatePoint, validateRoute, validateSolverCompatibility } from './validation';
import { previousRoute } from './history';
import type { AssistantHistory } from './history';
function query(c: RouteAssistantContext,q: RouteQuery): unknown {
  switch(q.type){
    case 'SUMMARY':return Q.getRouteSummary(c);
    case 'WAYPOINTS':return Q.getWaypoints(c);
    case 'DISTANCE':return Q.getRouteDistance(c);
    case 'REQUIRED_AREAS':return Q.getRequiredAreas(c);
    case 'ALTERNATIVES':return Q.getAlternatives(c);
    case 'DIAGNOSTICS':return Q.getRouteDiagnostics(c);
    case 'WAYPOINT':return Q.getWaypoint(c,q.waypointId)??{status:'invalid',code:'WAYPOINT_NOT_FOUND'};
    case 'EXPLAIN_WAYPOINT':return Q.explainWaypoint(c,q.waypointId);
    case 'EXPLAIN_SEGMENT':return Q.explainRouteSegment(c,q.fromId,q.toId);
    case 'BLOCKING_GEOMETRY':{const invalid=validatePoint(c,q.from)??validatePoint(c,q.to);return invalid?{status:'invalid',code:invalid}:Q.getBlockingGeometry(c,q.from,q.to);}
  }
}
/** The only future model entry point. Runtime boundary rejects extra fields and malformed payloads. */
const issuedPreviews=new WeakSet<object>();
export const isIssuedPreview=(preview:object)=>issuedPreviews.has(preview);
export function executeRouteAssistantCommand(c: RouteAssistantContext, command: RouteAssistantCommand, history?: AssistantHistory): RouteAssistantResult {
  const started=performance.now();
  const error=(code:string):RouteAssistantResult=>({kind:'error',status:'invalid',code,durationMs:performance.now()-started});
  if(!isRouteAssistantCommand(command))return error('INVALID_COMMAND');
  if(command.type==='NEED_CLARIFICATION')return {kind:'clarification',data:clone(command),durationMs:performance.now()-started};
  const compatibility=validateSolverCompatibility(c);if(compatibility)return error(compatibility);
  if(command.type==='ANSWER_ONLY'){
    const data=query(c,command.query),h=Q.emptyHighlights();
    const waypointId='waypointId' in command.query?command.query.waypointId:null;
    if(waypointId&&c.route.positions.some(p=>p.id===waypointId)){
      h.waypointIds=[waypointId];const facts=Q.explainWaypoint(c,waypointId);
      if(facts.reasons)for(const r of facts.reasons){h.stageObjectIds.push(...(r.objectIds??[]).filter(id=>c.stage.objects.some(o=>o.id===id)));h.requiredAreaIds.push(...r.requiredAreaIds??[]);}
    }
    if(command.query.type==='EXPLAIN_SEGMENT'){const facts=Q.explainRouteSegment(c,command.query.fromId,command.query.toId);if(!('status' in facts))h.routeSegmentIds=[`${command.query.fromId}->${command.query.toId}`];}
    if(data&&typeof data==='object'&&'status' in data&&data.status==='invalid'&&'code' in data)return error(String(data.code));
    return {kind:'answer',data,highlights:h,durationMs:performance.now()-started};
  }
  if(command.type==='COMPARE_ROUTE'){
    const invalid=validateRoute(c,command.routeA)??validateRoute(c,command.routeB);if(invalid)return error(invalid);
    return {kind:'comparison',data:Q.compareRoutes(c,command.routeA,command.routeB),durationMs:performance.now()-started};
  }
  if(command.sourceRevision!==c.revision)return error('STALE_REVISION');
  let route=clone(c.route) as StageRoute; const constraints:Barrier[]=[];let solverDurationMs:number|undefined;
  const find=(id:string)=>route.positions.findIndex(p=>p.id===id);
  if(command.type==='MOVE_WAYPOINT'){
    const id=command.waypointId??c.selectedWaypointId;
    if(!id)return {kind:'clarification',data:{question:'Which waypoint should move?',options:route.positions.map(p=>({id:p.id,label:p.label}))},durationMs:performance.now()-started};
    const i=find(id);if(i<0)return error('WAYPOINT_NOT_FOUND');
    const d=command.destination,p=d.kind==='absolute'?d.position:{x:route.positions[i].position.x+d.deltaXInches,y:route.positions[i].position.y+d.deltaYInches};
    const invalid=validatePoint(c,p);if(invalid)return error(invalid);
    route.positions[i].position={space:'stage',...p,z:0};
  }else if(command.type==='ADD_WAYPOINT'){
    if(find(command.waypointId)>=0||command.waypointId==='START')return error('DUPLICATE_WAYPOINT_ID');
    const invalid=validatePoint(c,command.position);if(invalid)return error(invalid);
    const p=command.placement;let index=0;
    if(p.kind==='before'||p.kind==='after'){index=find(p.waypointId);if(index<0)return error('WAYPOINT_NOT_FOUND');if(p.kind==='after')index++;}
    else if(p.kind==='between'){index=p.fromId==='START'?-1:find(p.fromId);if(index<0&&p.fromId!=='START'||find(p.toId)!==index+1)return error('INVALID_SEGMENT_REFERENCE');index++;}
    else {const points=[c.solverInput.start,...route.positions.map(p=>p.position)];let nearest=Infinity;
      for(let i=1;i<points.length;i++){const d=distanceBetweenPoints(command.position,project(command.position,points[i-1],points[i]));if(d<nearest){nearest=d;index=i-1;}}
    }
    route.positions.splice(index,0,{id:command.waypointId,label:`Waypoint ${command.waypointId}`,position:{space:'stage',...command.position,z:0},visibleTargetIds:[],engagedTargetIds:[]});
  }else if(command.type==='DELETE_WAYPOINT'){
    const i=find(command.waypointId);if(i<0)return error('WAYPOINT_NOT_FOUND');route.positions.splice(i,1);route.reloads=route.reloads.filter(r=>r.positionId!==command.waypointId);
  }else if(command.type==='REORDER_WAYPOINT'){
    const i=find(command.waypointId),j=find(command.beforeId);if(i<0||j<0)return error('WAYPOINT_NOT_FOUND');if(i===j)return error('INVALID_REORDER');
    const [p]=route.positions.splice(i,1);route.positions.splice(find(command.beforeId),0,p);
  }else if(command.type==='REPLAN'||command.type==='REPLAN_AVOIDING_AREA'){
    const input=clone(c.solverInput) as RouteSolverInput;
    if(command.type==='REPLAN_AVOIDING_AREA'){
      if(command.area.polygon.length<3||command.area.polygon.some(p=>validatePoint(c,p)))return error('INVALID_AVOIDANCE_AREA');
      if(c.stage.objects.some(o=>o.id===command.area.id)||(input.restrictedRegions??[]).some(r=>r.id===command.area.id))return error('DUPLICATE_REGION_ID');
      constraints.push(clone(command.area));input.restrictedRegions=[...(input.restrictedRegions??[]),...constraints];
    }
    const result=c.stageId?assistantSolverCache.solve(`${c.stageId}:${c.revision}`,input):solveRoute(input);solverDurationMs=result.diagnostics.solveDurationMs;if(!result.bestRoute)return error(`SOLVER_${result.status.toUpperCase().replace('-','_')}`);
    route=candidateToStageRoute(result.bestRoute,clone(c.plan) as Parameters<typeof candidateToStageRoute>[1]);
  }else {
    if(!history||fingerprint(history.document.present)!==fingerprint({stage:c.stage,plan:c.plan}))return error('HISTORY_UNAVAILABLE');
    const previous=previousRoute(history,command.type==='UNDO_LAST_ASSISTANT_CHANGE');if(!previous)return error('NO_PREVIOUS_ROUTE');route=previous;
  }
  const invalid=validateRoute(c,route);if(invalid)return error(invalid);
  const delta=Q.compareRoutes(c,c.route,route,constraints),h=Q.emptyHighlights();
  h.waypointIds=[...new Set([...delta.geometryChanges.added,...delta.geometryChanges.removed,...delta.geometryChanges.moved])];
  if(delta.geometryChanges.reordered)h.waypointIds=[...new Set([...h.waypointIds,...route.positions.map(p=>p.id)])];
  h.requiredAreaIds=[...delta.coverageLost,...delta.coverageGained];h.temporaryRegionIds=constraints.map(b=>b.id);
  for(const id of h.waypointIds){
    if(c.route.positions.some(p=>p.id===id)){const facts=Q.explainWaypoint(c,id);for(const reason of facts.reasons??[])h.stageObjectIds.push(...(reason.objectIds??[]).filter(id=>c.stage.objects.some(o=>o.id===id)));}
  }
  const proposedPoints=[c.solverInput.start,...route.positions.map(p=>p.position)];
  for(let i=1;i<proposedPoints.length;i++)h.stageObjectIds.push(...Q.getBlockingGeometry(c,proposedPoints[i-1],proposedPoints[i]).stageObjectIds.filter(id=>c.stage.objects.some(o=>o.id===id)));
  h.stageObjectIds=[...new Set(h.stageObjectIds)];
  const preview=freeze({id:fingerprint({stageId:c.stageId,revision:c.revision,command,route}),command:clone(command),originalRoute:clone(c.route) as StageRoute,proposedRoute:route,before:delta.before,after:delta.after,delta,warnings:[...delta.after.warnings],affectedWaypointIds:h.waypointIds,affectedStageObjectIds:h.stageObjectIds,valid:delta.after.valid,sourceStageId:c.stageId,sourceRevision:c.revision,constraints});
  issuedPreviews.add(preview);
  return {kind:'preview',preview,highlights:h,durationMs:performance.now()-started,...(solverDurationMs!==undefined?{solverDurationMs}:{})};
}

// JSON-safe tool schema: no generic patches, arbitrary fields or coerced numeric values.
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(k=>k in v)&&Object.keys(v).every(k=>[...required,...optional].includes(k));
const str=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const num=(v:unknown)=>typeof v==='number';
const point=(v:unknown)=>obj(v)&&keys(v,['x','y'])&&num(v.x)&&num(v.y);
function validQuery(v:unknown):boolean {
  if(!obj(v))return false;
  if(['SUMMARY','WAYPOINTS','DISTANCE','REQUIRED_AREAS','ALTERNATIVES','DIAGNOSTICS'].includes(String(v.type)))return keys(v,['type']);
  if(v.type==='WAYPOINT'||v.type==='EXPLAIN_WAYPOINT')return keys(v,['type','waypointId'])&&str(v.waypointId);
  if(v.type==='EXPLAIN_SEGMENT')return keys(v,['type','fromId','toId'])&&str(v.fromId)&&str(v.toId);
  return v.type==='BLOCKING_GEOMETRY'&&keys(v,['type','from','to'])&&point(v.from)&&point(v.to);
}
export function isRouteAssistantCommand(v:unknown):v is RouteAssistantCommand {
  if(!obj(v))return false;
  if(v.type==='ANSWER_ONLY')return keys(v,['type','query'])&&validQuery(v.query);
  if(v.type==='COMPARE_ROUTE')return keys(v,['type','routeA','routeB']);
  if(v.type==='NEED_CLARIFICATION')return keys(v,['type','question','options'])&&str(v.question)&&Array.isArray(v.options)&&v.options.length>0&&v.options.every(o=>obj(o)&&keys(o,['id','label'])&&str(o.id)&&str(o.label));
  if(!str(v.sourceRevision))return false;
  const base=['type','sourceRevision'];
  switch(v.type){
    case 'REPLAN':case 'UNDO_LAST_ASSISTANT_CHANGE':case 'RESTORE_PREVIOUS_ROUTE':return keys(v,base);
    case 'DELETE_WAYPOINT':return keys(v,[...base,'waypointId'])&&str(v.waypointId);
    case 'REORDER_WAYPOINT':return keys(v,[...base,'waypointId','beforeId'])&&str(v.waypointId)&&str(v.beforeId);
    case 'MOVE_WAYPOINT':{const d=v.destination;return keys(v,[...base,'waypointId','destination'])&&(v.waypointId===null||str(v.waypointId))&&obj(d)&&(d.kind==='absolute'?keys(d,['kind','position'])&&point(d.position):d.kind==='delta'&&keys(d,['kind','deltaXInches','deltaYInches'])&&num(d.deltaXInches)&&num(d.deltaYInches));}
    case 'ADD_WAYPOINT':{const p=v.placement;return keys(v,[...base,'waypointId','position','placement'])&&str(v.waypointId)&&point(v.position)&&obj(p)&&(p.kind==='nearest'?keys(p,['kind']):p.kind==='between'?keys(p,['kind','fromId','toId'])&&str(p.fromId)&&str(p.toId):(p.kind==='before'||p.kind==='after')&&keys(p,['kind','waypointId'])&&str(p.waypointId));}
    case 'REPLAN_AVOIDING_AREA':{const a=v.area;return keys(v,[...base,'area'])&&obj(a)&&keys(a,['id','polygon'])&&str(a.id)&&Array.isArray(a.polygon)&&a.polygon.every(point);}
    default:return false;
  }
}
