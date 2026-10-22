import type { StageDocument } from '../../stage/model';
import type { StagePlan } from '../model';
import type { StageRoute } from '../route';
import type { PlannerCard } from '../plannerUI';
import type { RouteCandidate, RouteSolverInput } from './types';
import type { ManualEngagement } from '../manualEngagements';
import { retainConnections } from '../routeGeometry';
/** Existing firing areas are user-required regions. Without them, existing points are mandatory. */
export function solverInputFromPlan(stage: StageDocument,plan: StagePlan): RouteSolverInput {
  const start=stage.objects.find(o=>o.type==='start')?.position??{x:NaN,y:NaN};
  const areas=plan.route?.engagementRules?.firingAreas??[];
  return {stage,start,requiredAreas:areas.length?areas.map(a=>({id:a.id,polygon:a.vertices})): (plan.route?.positions??[]).map(p=>({id:p.id,polygon:[p.position]})),...(plan.route?.engagementRules?.allowOutsideTravel===false?{allowedTravelRegions:areas.map(a=>a.vertices)}:{})};
}
/** True when a manual-engagement anchor still refers to an existing waypoint or adjacent waypoint pair. */
export function anchorSurvives(anchor: ManualEngagement['anchor'], positions: StageRoute['positions']): boolean {
  if (anchor.kind === 'waypoint') return positions.some(p => p.id === anchor.waypointId);
  try {
    const [fromId, toId] = JSON.parse(anchor.sectionId) as [string, string];
    const i = positions.findIndex(p => p.id === toId);
    return i >= 0 && (i === 0 ? !positions.some(p => p.id === fromId) : positions[i - 1].id === fromId);
  } catch { return false; }
}
/**
 * Result is an ordinary route, detached from solver and plan; explicit Save stays with the editor.
 * Solver waypoints that coincide with existing waypoints reuse them whole (ID, label, target assignments,
 * moving engagements), so bends, reloads and ENGAGE arrows survive wherever their waypoints and adjacencies still exist.
 * Only genuinely new points get fresh `solver-waypoint-N` IDs.
 */
export function candidateToStageRoute(candidate:RouteCandidate,plan:StagePlan):StageRoute {
  const previous=plan.route, used=new Set<string>(), taken=new Set((previous?.positions??[]).map(p=>p.id));
  let fresh=0;
  const positions=candidate.waypoints.slice(1).map((p)=>{
    const existing=previous?.positions.find(q=>!used.has(q.id)&&Math.hypot(q.position.x-p.x,q.position.y-p.y)<1e-7);
    if(existing){used.add(existing.id);return JSON.parse(JSON.stringify(existing)) as StageRoute['positions'][number];}
    let id;do{id=`solver-waypoint-${++fresh}`;}while(taken.has(id));taken.add(id);
    return {id,label:`Waypoint ${fresh}`,position:{space:'stage' as const,x:p.x,y:p.y,z:0},visibleTargetIds:[],engagedTargetIds:[]};
  });
  const route:StageRoute={version:1,id:candidate.id,name:'Minimum movement route',positions,
    reloads:(previous?.reloads??[]).filter(r=>positions.some(p=>p.id===r.positionId)).map(r=>({...r})),
    ...(previous?.connections?{connections:JSON.parse(JSON.stringify(previous.connections))}:{}),
    ...(previous?.manualEngagements?{manualEngagements:previous.manualEngagements.filter(e=>anchorSurvives(e.anchor,positions)).map(e=>JSON.parse(JSON.stringify(e)))}:{}),
    ...(previous?.engagementRules?{engagementRules:JSON.parse(JSON.stringify(previous.engagementRules))}:{})};
  return retainConnections(route);
}
/** After waypoints are added, removed or reordered: drop bends and ENGAGE arrows whose waypoints or adjacency are gone. */
export function pruneRouteReferences(route:StageRoute):StageRoute {
  const pruned=retainConnections(route);
  return pruned.manualEngagements?{...pruned,manualEngagements:pruned.manualEngagements.filter(e=>anchorSurvives(e.anchor,pruned.positions))}:pruned;
}
/** What adopting `next` in place of `previous` would discard, for an honest confirmation message. */
export function adoptionLosses(previous:StageRoute|undefined,next:StageRoute):{waypoints:number;reloads:number;bends:number;engageArrows:number} {
  if(!previous)return {waypoints:0,reloads:0,bends:0,engageArrows:0};
  const kept=new Set(next.positions.map(p=>p.id));
  const bendCount=(r:StageRoute|undefined)=>(r?.connections??[]).reduce((n,c)=>n+c.bends.length,0);
  return {waypoints:previous.positions.filter(p=>!kept.has(p.id)).length,reloads:previous.reloads.length-next.reloads.length,
    bends:bendCount(previous)-bendCount(next),engageArrows:(previous.manualEngagements?.length??0)-(next.manualEngagements?.length??0)};
}
/** Transitional preview shape only; no legacy generation/evaluation/ranking is invoked. */
export function solverPreviewCard(candidate:RouteCandidate,plan:StagePlan,index:number):PlannerCard {
  return {number:index+1,label:index===0?'Minimum movement':'Alternative route',id:candidate.id,route:candidateToStageRoute(candidate,plan),estimatedTime:null,movementDistance:candidate.totalDistanceInches,positions:candidate.waypointCount,reloads:0,movingSegments:null,roundsRemaining:0,routeStyle:'GEOMETRY',personalization:null,personalizedFallback:false,sourceCounts:{auto:candidate.waypointCount,manual:0},reasons:candidate.explanationData.map(e=>e.kind==='obstruction'?`Waypoint ${e.waypointIndex} avoids ${e.barrierIds?.join(', ')}.`:`Required area ${e.areaIds?.join(', ')} requires waypoint ${e.waypointIndex}.`),details:[],comparison:`${candidate.requiredAreasVisited.length} required areas visited`};
}
