import type { Geometry, Point, Diagnostics } from './types';
import { edges, inside, intersection, project, isPointTraversable, isSegmentTraversable, distanceBetweenPoints as distance, EPS } from './traversability';
export type Graph = {nodes: Point[];edges: {to:number;distance:number}[][]};
/** Useful finite geometry samples, sorted independently of caller area order. */
export function navigationGraph(g: Geometry,maxNodes: number,d: Diagnostics): Graph | null {
  const seeds: Point[]=[g.start];
  if(g.allowedTravelRegions)seeds.push(...g.allowedTravelRegions.flat());
  for(const b of [...g.barriers,...g.restrictedRegions]) for(const p of b.polygon) {
    // Square offsets cover both sides of thin walls and concave obstacle vertices.
    const offset=g.clearance+0.01;
    for(const x of [-offset,offset])for(const y of [-offset,offset])seeds.push({x:p.x+x,y:p.y+y});
  }
  const anchors=[...seeds,...g.requiredAreas.flatMap(r=>r.polygon)];
  const regionVertices=g.requiredAreas.reduce((n,r)=>n+r.polygon.length,0);
  if(seeds.length+regionVertices*anchors.length+regionVertices**2>50000){d.warnings.push('Navigation sampling budget exceeded.');return null;}
  for(const r of [...g.requiredAreas].sort((a,b)=>a.id.localeCompare(b.id))) {
    seeds.push(...r.polygon);
    if(r.preferredPoint&&inside(r.preferredPoint,r.polygon))seeds.push(r.preferredPoint);
    seeds.push({x:r.polygon.reduce((n,p)=>n+p.x,0)/r.polygon.length,y:r.polygon.reduce((n,p)=>n+p.y,0)/r.polygon.length});
    for(const e of edges(r.polygon)) {seeds.push({x:(e.a.x+e.b.x)/2,y:(e.a.y+e.b.y)/2});for(const p of anchors)seeds.push(project(p,e.a,e.b));}
    for(const other of g.requiredAreas)for(const a of edges(r.polygon))for(const b of edges(other.polygon)){const p=intersection(a.a,a.b,b.a,b.b);if(p)seeds.push(p);}
  }
  const nodes:Point[]=[];
  for(const p of [g.start,...seeds.slice(1).sort((a,b)=>a.x-b.x||a.y-b.y)])if(isPointTraversable(p,g)&&!nodes.some(q=>distance(p,q)<EPS)){nodes.push({...p});if(nodes.length>maxNodes){d.warnings.push('Navigation node limit exceeded.');return null;}}
  const graph:Graph={nodes,edges:nodes.map(()=>[])};
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(isSegmentTraversable(nodes[i],nodes[j],g)){const cost=distance(nodes[i],nodes[j]);graph.edges[i].push({to:j,distance:cost});graph.edges[j].push({to:i,distance:cost});d.graphEdgeCount++;}
  d.graphNodeCount=nodes.length;return graph;
}
