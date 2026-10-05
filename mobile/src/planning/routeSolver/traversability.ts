import type { Point, Barrier, Geometry } from './types';
export const EPS = 1e-7;
export const distanceBetweenPoints = (a: Point, b: Point) => Math.hypot(a.x-b.x, a.y-b.y);
export const cross = (a: Point,b: Point,c: Point) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function project(p: Point,a: Point,b: Point): Point {
  const d = (b.x-a.x)**2+(b.y-a.y)**2;
  const t = d ? Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/d)) : 0;
  return {x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)};
}
export function intersection(a: Point,b: Point,c: Point,d: Point): Point | null {
  const denominator = (b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x);
  if (Math.abs(denominator)<EPS) return null;
  const t=((c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x))/denominator;
  const u=((c.x-a.x)*(b.y-a.y)-(c.y-a.y)*(b.x-a.x))/denominator;
  return t>=-EPS && t<=1+EPS && u>=-EPS && u<=1+EPS ? {x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)} : null;
}
export function inside(p: Point, polygon: readonly Point[]): boolean {
  if(polygon.length===1) return distanceBetweenPoints(p,polygon[0])<EPS;
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j],b=polygon[i];
    if(distanceBetweenPoints(p,project(p,a,b))<EPS) return true;
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit=!hit;
  }
  return hit;
}
export const edges = (polygon: readonly Point[]) => polygon.map((a,i)=>({a,b:polygon[(i+1)%polygon.length]}));
export function segmentIntersectsRestrictedRegion(a: Point,b: Point,region: Barrier,clearance=0): boolean {
  if(inside(a,region.polygon)||inside(b,region.polygon)) return true;
  return edges(region.polygon).some(e => !!intersection(a,b,e.a,e.b) || Math.min(distanceBetweenPoints(a,project(a,e.a,e.b)),distanceBetweenPoints(b,project(b,e.a,e.b)),distanceBetweenPoints(e.a,project(e.a,a,b)),distanceBetweenPoints(e.b,project(e.b,a,b)))<=clearance+EPS);
}
export const segmentIntersectsWall = segmentIntersectsRestrictedRegion;
export const isPointInsideStage = (p: Point,g: Geometry) => Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=g.bounds.width&&p.y<=g.bounds.depth;
export const isPointTraversable = (p: Point,g: Geometry) => isPointInsideStage(p,g)&&(!g.allowedTravelRegions||g.allowedTravelRegions.some(r=>inside(p,r)))&&![...g.barriers,...g.restrictedRegions].some(b=>segmentIntersectsWall(p,p,b,g.clearance));
export function isSegmentTraversable(a: Point,b: Point,g: Geometry):boolean {
  if(!isPointTraversable(a,g)||!isPointTraversable(b,g)||[...g.barriers,...g.restrictedRegions].some(r=>segmentIntersectsWall(a,b,r,g.clearance)))return false;
  if(g.allowedTravelRegions){
    const split=[a,b,...g.allowedTravelRegions.flatMap(r=>edges(r).flatMap(e=>{const p=intersection(a,b,e.a,e.b);return p?[p]:[];}))].sort((p,q)=>distanceBetweenPoints(a,p)-distanceBetweenPoints(a,q));
    for(let i=1;i<split.length;i++){const p={x:(split[i-1].x+split[i].x)/2,y:(split[i-1].y+split[i].y)/2};if(!g.allowedTravelRegions.some(r=>inside(p,r)))return false;}
  }
  return true;
}
export function visited(points: readonly Point[],areas: readonly {id:string;polygon:readonly Point[]}[]): string[] {
  return areas.filter(r=>points.some(p=>inside(p,r.polygon))||points.slice(1).some((b,i)=>edges(r.polygon).some(e=>!!intersection(points[i],b,e.a,e.b)))).map(r=>r.id);
}
