import { endpoints } from '../../stage/segments';
import { interpretFaultLines, defaultFaultTolerances } from './faultLineInterpretation';
import type { RouteSolverInput, Geometry, Diagnostics, Point } from './types';
export function stageGeometry(input: RouteSolverInput,d: Diagnostics): Geometry {
  const faults=interpretFaultLines(input.stage,{...defaultFaultTolerances,...input.options?.tolerances},d);
  const barriers=input.stage.objects.filter(o=>o.type==='wall').map(o=>{
    const {start:a,end:b}=endpoints(o),length=Math.hypot(b.x-a.x,b.y-a.y),h=o.geometry.thickness/2;
    const nx=length?-(b.y-a.y)/length:0,ny=length?(b.x-a.x)/length:1;
    return {id:o.id,polygon:[{x:a.x+nx*h,y:a.y+ny*h},{x:b.x+nx*h,y:b.y+ny*h},{x:b.x-nx*h,y:b.y-ny*h},{x:a.x-nx*h,y:a.y-ny*h}]};
  });
  const copy=(p: Point)=>({x:p.x,y:p.y});
  return {bounds:{width:input.stage.stage.width,depth:input.stage.stage.depth},start:copy(input.start),barriers:[...barriers,...(input.barriers??[]).map(b=>({id:b.id,polygon:b.polygon.map(copy)}))],restrictedRegions:(input.restrictedRegions??[]).map(b=>({id:b.id,polygon:b.polygon.map(copy)})),...(input.allowedTravelRegions?{allowedTravelRegions:input.allowedTravelRegions.map(r=>r.map(copy))}:{}),requiredAreas:input.requiredAreas.map(a=>({...a,polygon:a.polygon.map(copy),...(a.preferredPoint?{preferredPoint:copy(a.preferredPoint)}:{})})),faultRegions:faults.regions,openFaultBoundaries:faults.open,clearance:input.options?.clearanceInches??0};
}
