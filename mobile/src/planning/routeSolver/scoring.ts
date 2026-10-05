import type { Point, Geometry, Diagnostics, RouteCandidate } from './types';
import { isSegmentTraversable, visited, distanceBetweenPoints, segmentIntersectsWall } from './traversability';
/** Lexicographic distance, then waypoint count. No preference weights. */
export function compareRoutes(a: RouteCandidate,b: RouteCandidate): number {return a.totalDistanceInches-b.totalDistanceInches||a.waypointCount-b.waypointCount||a.id.localeCompare(b.id);}
export function reduceWaypoints(points: Point[],g: Geometry,d: Diagnostics): Point[] {
  const result=points.map(p=>({...p})),required=visited(result,g.requiredAreas);
  let changed=true;
  while(changed){changed=false;for(let i=1;i<result.length;i++){
    if(i<result.length-1&&!isSegmentTraversable(result[i-1],result[i+1],g))continue;
    const trial=result.filter((_,j)=>j!==i),coverage=visited(trial,g.requiredAreas);
    if(required.every(id=>coverage.includes(id))){result.splice(i,1);d.waypointReductions++;changed=true;break;}
  }}
  return result;
}
export function scoreRoute(id:string,points:Point[],g:Geometry,d:Diagnostics):RouteCandidate {
  const waypoints=reduceWaypoints(points,g,d),covered=visited(waypoints,g.requiredAreas),distance=waypoints.slice(1).reduce((n,p,i)=>n+distanceBetweenPoints(waypoints[i],p),0);
  const explanationData:RouteCandidate['explanationData']=[];
  for(let i=1;i<waypoints.length;i++) {
    const trial=waypoints.filter((_,j)=>j!==i),without=visited(trial,g.requiredAreas),areaIds=covered.filter(id=>!without.includes(id));
    if(areaIds.length)explanationData.push({kind:'required-area',waypointIndex:i,areaIds});
    if(i<waypoints.length-1){const barrierIds=[...g.barriers,...g.restrictedRegions].filter(b=>segmentIntersectsWall(waypoints[i-1],waypoints[i+1],b,g.clearance)).map(b=>b.id);if(barrierIds.length)explanationData.push({kind:'obstruction',waypointIndex:i,barrierIds});}
  }
  return {id,waypoints,totalDistanceInches:distance,requiredAreasVisited:covered,requiredAreasMissed:g.requiredAreas.filter(a=>!covered.includes(a.id)).map(a=>a.id),waypointCount:Math.max(0,waypoints.length-1),score:distance,explanationData};
}
