import { endpoints } from '../../stage/segments';
import type { StageDocument } from '../../stage/model';
import type { Diagnostics, FaultTolerances, Point } from './types';
import { distanceBetweenPoints as distance, project, intersection, EPS } from './traversability';
export const defaultFaultTolerances: FaultTolerances = { endpointMergeInches: 2, smallGapInches: 4, collinearInches: 2, angleDegrees: 5, minimumRegionAreaSquareInches: 36 };
/** Derived planar graph only: the original drawing is never rewritten. */
export function interpretFaultLines(stage: Readonly<StageDocument>,t: FaultTolerances,d: Diagnostics) {
  const raw=stage.objects.filter(o=>o.type==='faultLine').sort((a,b)=>a.id.localeCompare(b.id)).map(o=>{const e=endpoints(o);return {a:{x:e.start.x,y:e.start.y},b:{x:e.end.x,y:e.end.y}};});
  d.rawFaultSegmentCount=raw.length;
  const points=raw.flatMap(e=>[e.a,e.b]);
  // Bounded-diameter clusters avoid a chain of nearby marks bridging a large gap.
  const clusters: Point[][]=[];
  for(const p of points) {
    let cluster=clusters.find(c=>c.every(q=>distance(p,q)<=t.endpointMergeInches));
    if(!cluster){cluster=[];clusters.push(cluster);} else if(!cluster.some(q=>distance(p,q)<EPS)) d.endpointMerges++;
    cluster.push(p);
  }
  const centers=new Map<Point,Point>();
  for(const c of clusters){const p={x:c.reduce((n,p)=>n+p.x,0)/c.length,y:c.reduce((n,p)=>n+p.y,0)/c.length};c.forEach(q=>centers.set(q,p));}
  const segments=raw.map(e=>({a:centers.get(e.a)!,b:centers.get(e.b)!})).filter(e=>distance(e.a,e.b)>EPS);
  // Snap a near endpoint to an existing segment: includes crooked T junctions.
  for(let i=0;i<segments.length;i++) for(const key of ['a','b'] as const) {
    const p=segments[i][key];
    const options=segments.flatMap((s,j)=>j===i?[]:[{p:project(p,s.a,s.b),j}]).map(v=>({...v,d:distance(p,v.p)})).filter(v=>v.d>EPS&&v.d<=t.collinearInches).sort((a,b)=>a.d-b.d||a.j-b.j);
    if(options[0]){segments[i][key]=options[0].p;d.inferredGapClosures++;}
  }
  // Close only short continuations or near corner endpoints; never extrapolate long missing edges.
  const degree=(p: Point)=>segments.reduce((n,s)=>n+Number(distance(p,s.a)<EPS)+Number(distance(p,s.b)<EPS),0);
  const loose=segments.flatMap((s,i)=>[{p:s.a,i},{p:s.b,i}]).filter(v=>degree(v.p)===1);
  const used=new Set<number>();
  for(let i=0;i<loose.length;i++) {
    if(used.has(i))continue;
    const candidates=loose.map((v,j)=>({v,j,d:distance(loose[i].p,v.p)})).filter(v=>v.j>i&&!used.has(v.j)&&v.v.i!==loose[i].i&&v.d<=t.smallGapInches).sort((a,b)=>a.d-b.d||a.j-b.j);
    if(candidates[0]){segments.push({a:loose[i].p,b:candidates[0].v.p});used.add(i);used.add(candidates[0].j);d.inferredGapClosures++;}
  }
  const vertices: Point[]=[], adjacency: number[][]=[];
  const vertex=(p: Point)=>{const index=vertices.findIndex(q=>distance(p,q)<EPS);if(index>=0)return index;vertices.push({...p});adjacency.push([]);return vertices.length-1;};
  const unique=new Set<string>();
  segments.forEach((s,i)=>{
    const split=[s.a,s.b];
    segments.forEach((e,j)=>{if(i===j)return;const p=intersection(s.a,s.b,e.a,e.b);if(p)split.push(p);for(const q of [e.a,e.b])if(distance(q,project(q,s.a,s.b))<EPS)split.push(q);});
    split.sort((a,b)=>distance(s.a,a)-distance(s.a,b));
    for(let k=1;k<split.length;k++) {const a=vertex(split[k-1]),b=vertex(split[k]);if(a===b)continue;const key=[a,b].sort((x,y)=>x-y).join(':');if(unique.has(key))continue;unique.add(key);adjacency[a].push(b);adjacency[b].push(a);}
  });
  adjacency.forEach((neighbors,i)=>neighbors.sort((a,b)=>Math.atan2(vertices[a].y-vertices[i].y,vertices[a].x-vertices[i].x)-Math.atan2(vertices[b].y-vertices[i].y,vertices[b].x-vertices[i].x)));
  const seen=new Set<string>(),regions: Point[][]=[], closedEdges=new Set<string>();
  for(let a=0;a<vertices.length;a++)for(const b of adjacency[a]) {
    if(seen.has(`${a}:${b}`))continue;
    let u=a,v=b;const face:number[]=[],walk:string[]=[];
    for(let step=0;step<=unique.size*2;step++) {
      const key=`${u}:${v}`;if(seen.has(key))break;seen.add(key);walk.push(key);face.push(u);
      const neighbors=adjacency[v], next=neighbors[(neighbors.indexOf(u)+neighbors.length-1)%neighbors.length];u=v;v=next;
      if(u===a&&v===b)break;
    }
    const polygon=face.map(i=>vertices[i]);
    let spike=true;
    while(spike&&polygon.length>3){spike=false;for(let i=0;i<polygon.length;i++){if(distance(polygon[(i+polygon.length-1)%polygon.length],polygon[(i+1)%polygon.length])<EPS){polygon.splice(i,1);polygon.splice(i%polygon.length,1);spike=true;break;}}}
    // Remove near-collinear drawing noise from the face, without rounding corners to a grid.
    for(let i=polygon.length-1;i>=0&&polygon.length>3;i--){
      const a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[i],c=polygon[(i+1)%polygon.length];
      const angle=Math.abs(Math.atan2((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x),(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)))*180/Math.PI;
      if(angle<=t.angleDegrees&&distance(b,project(b,a,c))<=t.collinearInches)polygon.splice(i,1);
    }
    const area=polygon.reduce((n,p,i)=>{const q=polygon[(i+1)%polygon.length];return n+p.x*q.y-q.x*p.y;},0)/2;
    if(u===a&&v===b&&area>=t.minimumRegionAreaSquareInches){regions.push(polygon);walk.forEach(key=>{const [a,b]=key.split(':').map(Number);if(!walk.includes(`${b}:${a}`))closedEdges.add([a,b].sort((x,y)=>x-y).join(':'));});}
  }
  const open=[...unique].filter(k=>!closedEdges.has(k)).map(k=>{const [a,b]=k.split(':').map(Number);return {a:vertices[a],b:vertices[b]};});
  if(open.length)d.warnings.push('Open fault boundaries remain; no large missing boundary was inferred.');
  if(d.endpointMerges||d.inferredGapClosures)d.warnings.push('Fault geometry contains inferred connections; raw stage marks are unchanged.');
  d.interpretedFaultRegionCount=regions.length;
  return {regions,open};
}
