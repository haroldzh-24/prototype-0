import { isStageRoute } from '../route';
import type { RouteAssistantContext } from './types';
import type { Point } from '../routeSolver/types';
export function validatePoint(c: RouteAssistantContext, p: Point): string | null {
  if(!p||![p.x,p.y].every(Number.isFinite))return 'INVALID_COORDINATE';
  return p.x<0||p.y<0||p.x>c.stage.stage.width||p.y>c.stage.stage.depth?'OUTSIDE_STAGE':null;
}
export function validateRoute(c: RouteAssistantContext, route: unknown): string | null {
  if(!isStageRoute(route))return 'INVALID_ROUTE';
  for(const p of route.positions){
    const error=validatePoint(c,p.position);if(error)return error;
    if([...p.visibleTargetIds,...p.engagedTargetIds].some(id=>!c.stage.objects.some(o=>o.id===id)))return 'OBJECT_NOT_FOUND';
  }
  if(route.reloads.some(r=>!route.positions.some(p=>p.id===r.positionId)||!c.plan.loadout.magazines.some(m=>m.id===r.magazineId)))return 'INVALID_RELOAD_REFERENCE';
  return null;
}
export function validateSolverCompatibility(c: RouteAssistantContext): string | null {
  const i=c.solverInput,s=c.stage.stage;
  const finite=(p:Point)=>!!p&&[p.x,p.y].every(Number.isFinite);
  if(c.stage.coordinateSystem!=='inches'||![s.width,s.depth].every(v=>Number.isFinite(v)&&v>0)||!finite(i.start)||validatePoint(c,i.start))return 'INVALID_SOLVER_INPUT';
  for(const o of c.stage.objects){
    if(!finite(o.position)||!Number.isFinite(o.rotation))return 'INVALID_SOLVER_INPUT';
    if(o.type==='wall'||o.type==='faultLine'){
      if(!Number.isFinite(o.geometry.length)||o.geometry.length<=0)return 'INVALID_SOLVER_INPUT';
      if(o.endpoints&&(!finite(o.endpoints.start)||!finite(o.endpoints.end)))return 'INVALID_SOLVER_INPUT';
      if(o.type==='wall'&&(!Number.isFinite(o.geometry.thickness)||o.geometry.thickness<0))return 'INVALID_SOLVER_INPUT';
    }
  }
  if(new Set(i.requiredAreas.map(a=>a.id)).size!==i.requiredAreas.length||i.requiredAreas.some(a=>!a.id||!a.polygon.length||a.polygon.length===2||!a.polygon.every(finite))||i.allowedTravelRegions?.some(r=>r.length<3||!r.every(finite)))return 'INVALID_SOLVER_INPUT';
  return null;
}
