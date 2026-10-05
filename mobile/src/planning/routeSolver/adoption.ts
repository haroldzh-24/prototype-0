import type { StageDocument } from '../../stage/model';
import type { StagePlan } from '../model';
import type { StageRoute } from '../route';
import type { PlannerCard } from '../plannerUI';
import type { RouteCandidate, RouteSolverInput } from './types';
/** Existing firing areas are user-required regions. Without them, existing points are mandatory. */
export function solverInputFromPlan(stage: StageDocument,plan: StagePlan): RouteSolverInput {
  const start=stage.objects.find(o=>o.type==='start')?.position??{x:NaN,y:NaN};
  const areas=plan.route?.engagementRules?.firingAreas??[];
  return {stage,start,requiredAreas:areas.length?areas.map(a=>({id:a.id,polygon:a.vertices})): (plan.route?.positions??[]).map(p=>({id:p.id,polygon:[p.position]})),...(plan.route?.engagementRules?.allowOutsideTravel===false?{allowedTravelRegions:areas.map(a=>a.vertices)}:{})};
}
/** Result is an ordinary route, detached from solver and plan; explicit Save stays with the editor. */
export function candidateToStageRoute(candidate:RouteCandidate,plan:StagePlan):StageRoute {
  return {version:1,id:candidate.id,name:'Minimum movement route',positions:candidate.waypoints.slice(1).map((p,i)=>{
    const existing=plan.route?.positions.find(q=>Math.hypot(q.position.x-p.x,q.position.y-p.y)<1e-7);
    return {id:`solver-waypoint-${i+1}`,label:`Waypoint ${i+1}`,position:{space:'stage',x:p.x,y:p.y,z:0},visibleTargetIds:[...(existing?.visibleTargetIds??[])],engagedTargetIds:[...(existing?.engagedTargetIds??[])]};
  }),reloads:[],...(plan.route?.engagementRules?{engagementRules:JSON.parse(JSON.stringify(plan.route.engagementRules))}:{})};
}
/** Transitional preview shape only; no legacy generation/evaluation/ranking is invoked. */
export function solverPreviewCard(candidate:RouteCandidate,plan:StagePlan,index:number):PlannerCard {
  return {number:index+1,label:index===0?'Minimum movement':'Alternative route',id:candidate.id,route:candidateToStageRoute(candidate,plan),estimatedTime:null,movementDistance:candidate.totalDistanceInches,positions:candidate.waypointCount,reloads:0,movingSegments:null,roundsRemaining:0,routeStyle:'GEOMETRY',personalization:null,personalizedFallback:false,sourceCounts:{auto:candidate.waypointCount,manual:0},reasons:candidate.explanationData.map(e=>e.kind==='obstruction'?`Waypoint ${e.waypointIndex} avoids ${e.barrierIds?.join(', ')}.`:`Required area ${e.areaIds?.join(', ')} requires waypoint ${e.waypointIndex}.`),details:[],comparison:`${candidate.requiredAreasVisited.length} required areas visited`};
}
