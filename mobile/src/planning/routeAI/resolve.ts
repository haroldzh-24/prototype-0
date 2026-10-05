import { intents } from './types';
import type { Decision } from './types';
import type { RouteAssistantCommand, RouteAssistantContext } from '../routeAssistant/types';
import { executeRouteAssistantCommand } from '../routeAssistant/executor';
import { candidateToStageRoute } from '../routeSolver/adoption';
import { clone } from '../routeAssistant/context';

const numericFields=['alternativeNumber','absoluteXInches','absoluteYInches','deltaXInches','deltaYInches','distanceValue','areaMinXInches','areaMinYInches','areaMaxXInches','areaMaxYInches'];
const fields=['intent','waypointReference','secondWaypointReference','areaReference','distanceUnit','direction','clarificationText',...numericFields];
export function validateDecision(value: unknown): Decision {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_STRUCTURED_OUTPUT');
  const v=value as Record<string,unknown>;
  if(!intents.includes(v.intent as Decision['intent'])||Object.keys(v).some(k=>!fields.includes(k)))throw new Error('INVALID_STRUCTURED_OUTPUT');
  for(const [k,x] of Object.entries(v)){
    if(x===null||x===undefined)continue;
    if(numericFields.includes(k)){
      if(typeof x!=='number'||!Number.isFinite(x))throw new Error('INVALID_STRUCTURED_OUTPUT');
    }else if(typeof x!=='string'||x.length>200)throw new Error('INVALID_STRUCTURED_OUTPUT');
  }
  return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null&&x!==undefined)) as Decision;
}
export function inches(value:number,unit:string):number {
  const factors:Record<string,number>={yd:36,yard:36,yards:36,ft:12,foot:12,feet:12,in:1,inch:1,inches:1};
  const factor=factors[unit.toLowerCase()];if(!factor||!Number.isFinite(value))throw new Error('INVALID_UNIT');return value*factor;
}
export function waypointCandidates(c:RouteAssistantContext,reference?:string):string[] {
  const r=reference?.trim().toLowerCase();
  if(!r||['that waypoint','this point','selected','that','this'].includes(r))return c.selectedWaypointId&&c.route.positions.some(p=>p.id===c.selectedWaypointId)?[c.selectedWaypointId]:c.route.positions.map(p=>p.id);
  const exact=c.route.positions.filter(p=>p.id.toLowerCase()===r||p.label.toLowerCase()===r);if(exact.length)return exact.map(p=>p.id);
  if(/^(the )?last( waypoint)?$/.test(r))return c.route.positions.slice(-1).map(p=>p.id);
  const number=r.match(/^(?:the )?(?:waypoint )?(\d+)(?:st|nd|rd|th)?(?: waypoint)?$/);
  const ordinal=['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth'].indexOf(r.replace(/^the /,'').replace(/ waypoint$/,''));
  if(number||ordinal>=0)return c.route.positions.slice((number?Number(number[1]):ordinal+1)-1,(number?Number(number[1]):ordinal+1)).map(p=>p.id);
  const near=r.match(/^(?:the one |waypoint )?near (.+)$/);
  if(near){
    const wallNumber=near[1].match(/^wall (\d+)$/);
    const object=wallNumber?c.stage.objects.filter(o=>o.type==='wall').slice(Number(wallNumber[1])-1,Number(wallNumber[1])):c.stage.objects.filter(o=>o.id.toLowerCase()===near[1]);
    if(object.length!==1)return [];
    // Only semantic explanation links qualify; no arbitrary proximity threshold.
    return c.route.positions.filter(w=>{
      const result=executeRouteAssistantCommand(c,{type:'ANSWER_ONLY',query:{type:'EXPLAIN_WAYPOINT',waypointId:w.id}});
      return result.kind==='answer'&&result.highlights?.stageObjectIds.includes(object[0].id);
    }).map(p=>p.id);
  }
  return [];
}
export type Resolution = {command:RouteAssistantCommand; pendingField?:'waypointReference'|'secondWaypointReference'|'areaReference'|'alternativeNumber'};
export function resolveDecision(c:RouteAssistantContext,d:Decision,newId:string):Resolution {
  const clarify=(question:string,options:{id:string;label:string}[],pendingField?:Resolution['pendingField']):Resolution=>({command:{type:'NEED_CLARIFICATION',question,options:options.length?options:[{id:'rephrase',label:'Describe the request more precisely'}]},pendingField});
  const waypoints=c.route.positions.map((p,i)=>({id:p.id,label:`Waypoint ${i+1} (${p.label})`}));
  let id:string|undefined,second:string|undefined;
  if(['QUERY_WAYPOINT','QUERY_EXPLANATION','MOVE_WAYPOINT','DELETE_WAYPOINT','REORDER_WAYPOINT'].includes(d.intent)){
    const candidates=waypointCandidates(c,d.waypointReference);
    if(candidates.length!==1)return clarify('Which waypoint do you mean?',candidates.length?waypoints.filter(p=>candidates.includes(p.id)):waypoints,'waypointReference');
    id=candidates[0];
  }
  if(d.intent==='REORDER_WAYPOINT'){
    const candidates=waypointCandidates(c,d.secondWaypointReference);
    if(candidates.length!==1)return clarify('Before which waypoint?',waypoints,'secondWaypointReference');second=candidates[0];
  }
  const sourceRevision=c.revision;
  switch(d.intent){
    case 'QUERY_DISTANCE':return {command:{type:'ANSWER_ONLY',query:{type:'DISTANCE'}}};
    case 'QUERY_WAYPOINTS':return {command:{type:'ANSWER_ONLY',query:{type:'WAYPOINTS'}}};
    case 'QUERY_ROUTE_SUMMARY':return {command:{type:'ANSWER_ONLY',query:{type:'SUMMARY'}}};
    case 'QUERY_AREAS':return {command:{type:'ANSWER_ONLY',query:{type:'REQUIRED_AREAS'}}};
    case 'QUERY_WAYPOINT':case 'QUERY_EXPLANATION':return {command:{type:'ANSWER_ONLY',query:{type:d.intent==='QUERY_WAYPOINT'?'WAYPOINT':'EXPLAIN_WAYPOINT',waypointId:id!}}};
    case 'QUERY_LONGEST_SEGMENT':{
      let longest=-1,fromId='START',toId='';let previous='START';
      for(const w of c.route.positions){const r=executeRouteAssistantCommand(c,{type:'ANSWER_ONLY',query:{type:'EXPLAIN_SEGMENT',fromId:previous,toId:w.id}});if(r.kind==='answer'){const length=(r.data as {distanceInches:number}).distanceInches;if(length>longest){longest=length;fromId=previous;toId=w.id;}}previous=w.id;}
      return toId?{command:{type:'ANSWER_ONLY',query:{type:'EXPLAIN_SEGMENT',fromId,toId}}}:{command:{type:'ANSWER_ONLY',query:{type:'SUMMARY'}}};
    }
    case 'QUERY_BLOCKERS':return c.route.positions.length?{command:{type:'ANSWER_ONLY',query:{type:'BLOCKING_GEOMETRY',from:clone(c.solverInput.start),to:clone(c.route.positions.at(-1)!.position)}}}:{command:{type:'ANSWER_ONLY',query:{type:'SUMMARY'}}};
    case 'QUERY_COMPARISON':{
      const r=executeRouteAssistantCommand(c,{type:'ANSWER_ONLY',query:{type:'ALTERNATIVES'}});
      const alternatives=r.kind==='answer'?r.data as NonNullable<RouteAssistantContext['solverResult']>['alternatives']:[];
      const n=d.alternativeNumber;
      if(!n||!Number.isInteger(n)||!alternatives[n-1])return clarify(alternatives.length?'Which alternative?':'No current alternatives. Generate routes in PLAN first.',alternatives.map((a,i)=>({id:String(i+1),label:`Alternative ${i+1}`})),'alternativeNumber');
      return {command:{type:'COMPARE_ROUTE',routeA:clone(c.route),routeB:candidateToStageRoute(clone(alternatives[n-1]),clone(c.plan))}};
    }
    case 'MOVE_WAYPOINT':{
      if(d.absoluteXInches!==undefined&&d.absoluteYInches!==undefined)return {command:{type:'MOVE_WAYPOINT',sourceRevision,waypointId:id!,destination:{kind:'absolute',position:{x:d.absoluteXInches,y:d.absoluteYInches}}}};
      if(d.distanceValue!==undefined&&d.distanceUnit&&d.direction){
        const distance=inches(d.distanceValue,d.distanceUnit);if(distance<0)return clarify('Use a positive distance and a direction.',[]);
        const directions:Record<string,[number,number]>={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};const axis=directions[d.direction.toLowerCase()];
        if(!axis)return clarify('Use left/right or up/down on the stage. Forward/back needs an orientation.',[]);
        return {command:{type:'MOVE_WAYPOINT',sourceRevision,waypointId:id!,destination:{kind:'delta',deltaXInches:axis[0]*distance,deltaYInches:axis[1]*distance}}};
      }
      // Directional moves must retain value/unit; do not accept model-computed delta arithmetic.
      return clarify('Where should the waypoint move? Give coordinates in inches or a distance, unit and direction.',[]);
    }
    case 'ADD_WAYPOINT':return d.absoluteXInches!==undefined&&d.absoluteYInches!==undefined?{command:{type:'ADD_WAYPOINT',sourceRevision,waypointId:newId,position:{x:d.absoluteXInches,y:d.absoluteYInches},placement:{kind:'nearest'}}}:clarify('Give the new waypoint X and Y in inches.',[]);
    case 'DELETE_WAYPOINT':return {command:{type:'DELETE_WAYPOINT',sourceRevision,waypointId:id!}};
    case 'REORDER_WAYPOINT':return {command:{type:'REORDER_WAYPOINT',sourceRevision,waypointId:id!,beforeId:second!}};
    case 'REPLAN':return {command:{type:'REPLAN',sourceRevision}};
    case 'REPLAN_AVOIDING_AREA':{
      const {areaMinXInches:x,areaMinYInches:y,areaMaxXInches:xx,areaMaxYInches:yy}=d;
      if(x!==undefined&&y!==undefined&&xx!==undefined&&yy!==undefined){
        if(xx<=x||yy<=y)return clarify('Give a rectangle with increasing X and Y bounds in inches.',[]);
        return {command:{type:'REPLAN_AVOIDING_AREA',sourceRevision,area:{id:newId,polygon:[{x,y},{x:xx,y},{x:xx,y:yy},{x,y:yy}]}}};
      }
      const areas=c.solverInput.requiredAreas;
      const matches=areas.filter(a=>a.id===d.areaReference);
      if(matches.length!==1)return clarify('Give the area rectangle bounds in inches, or choose a configured area.',areas.map((a,i)=>({id:a.id,label:`Area ${i+1}`})),'areaReference');
      const area=matches[0];
      if(area.polygon.length<3)return clarify('Avoidance needs a polygon area. Configure one in Route Settings.',[]);
      return {command:{type:'REPLAN_AVOIDING_AREA',sourceRevision,area:{id:newId,polygon:clone(area.polygon)}}};
    }
    case 'UNDO':return {command:{type:'UNDO_LAST_ASSISTANT_CHANGE',sourceRevision}};
    default:return clarify(d.clarificationText||'Describe the route question or waypoint change.',[]);
  }
}
