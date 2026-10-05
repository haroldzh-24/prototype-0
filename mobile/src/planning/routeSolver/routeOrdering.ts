import type { Graph } from './navigationGraph';
import type { Geometry, Diagnostics } from './types';
import { inside, visited, EPS } from './traversability';
import { shortestPaths } from './shortestPath';
import { PriorityQueue } from './priorityQueue';
export function orderRoute(graph: Graph,g: Geometry,d: Diagnostics,limit: number,exactLimit: number,blocked?: string): number[] | null {
  const areas=g.requiredAreas;
  if(!areas.length)return [0];
  const edgeAllowed=(a:number,b:number)=>[a,b].sort((x,y)=>x-y).join(':')!==blocked;
  if(areas.length<=Math.min(exactLimit,12)) {
    // Exact coverage-state shortest search over the finite visibility graph.
    const mask=(ids:string[])=>ids.reduce((n,id)=>n|(1<<areas.findIndex(a=>a.id===id)),0);
    const full=(1<<areas.length)-1,initial=mask(visited([graph.nodes[0]],areas));
    const key=(node:number,coverage:number)=>`${node}/${coverage}`;
    type State={node:number;coverage:number;cost:number;count:number;key:string};
    const first:State={node:0,coverage:initial,cost:0,count:1,key:key(0,initial)};
    const open=new PriorityQueue<State>((a,b)=>a.cost-b.cost||a.count-b.count||a.node-b.node||a.coverage-b.coverage);
    open.push(first);
    const best=new Map<string,State>([[first.key,first]]),previous=new Map<string,string>();
    const masks=new Map<string,number>();
    let relaxations=0;
    while(open.size&&d.searchIterations<limit) {
      const current=open.pop()!;if(best.get(current.key)!==current)continue;
      d.searchIterations++;
      if(current.coverage===full){const path=[current.node];let k=current.key;while(previous.has(k)){k=previous.get(k)!;path.unshift(best.get(k)!.node);}return path;}
      for(const e of graph.edges[current.node]) {
        if(++relaxations>limit*16){d.searchIterations=limit;return null;}
        if(!edgeAllowed(current.node,e.to))continue;
        const ek=[current.node,e.to].sort((a,b)=>a-b).join(':');
        if(!masks.has(ek))masks.set(ek,mask(visited([graph.nodes[current.node],graph.nodes[e.to]],areas)));
        const coverage=current.coverage|masks.get(ek)!,k=key(e.to,coverage),cost=current.cost+e.distance,count=current.count+1,old=best.get(k);
        if(!old||cost<old.cost-EPS||(Math.abs(cost-old.cost)<EPS&&count<old.count)){const next={node:e.to,coverage,cost,count,key:k};best.set(k,next);previous.set(k,current.key);open.push(next);}else d.prunedCandidates++;
      }
    }
    return null;
  }
  d.warnings.push('Required-area count exceeds exact search limit; deterministic nearest-area search and 2-opt used.');
  let path=[0],remaining=areas.filter(a=>!inside(graph.nodes[0],a.polygon));
  const stops=[0];
  const trees=new Map<number,ReturnType<typeof shortestPaths>>();
  const leg=(a:number,b:number)=>{if(!trees.has(a))trees.set(a,shortestPaths(graph,a,d,limit,blocked));return trees.get(a)?.to(b)??null;};
  while(remaining.length) {
    let winner:{path:number[];distance:number}|null=null;
    for(let i=0;i<graph.nodes.length;i++)if(remaining.some(a=>inside(graph.nodes[i],a.polygon))) {
      const p=leg(path[path.length-1],i);
      if(p&&(!winner||p.distance<winner.distance-EPS))winner=p;
    }
    if(!winner)return null;
    path.push(...winner.path.slice(1));stops.push(path[path.length-1]);
    const covered=visited(path.map(i=>graph.nodes[i]),areas);remaining=remaining.filter(a=>!covered.includes(a.id));
  }
  const build=(order:number[])=>{const result=[order[0]];let cost=0;for(let i=1;i<order.length;i++){const p=leg(order[i-1],order[i]);if(!p)return null;cost+=p.distance;result.push(...p.path.slice(1));}return {path:result,cost};};
  let best=build(stops);if(!best)return path;
  for(let pass=0;pass<4&&d.searchIterations<limit;pass++) {
    let improved=false;
    for(let i=1;i<stops.length-1;i++)for(let j=i+1;j<stops.length;j++) {
      const trial=[...stops.slice(0,i),...stops.slice(i,j+1).reverse(),...stops.slice(j+1)],candidate=build(trial);d.routesEvaluated++;
      if(candidate&&candidate.cost<best.cost-EPS){stops.splice(0,stops.length,...trial);best=candidate;improved=true;}
    }
    if(!improved)break;
  }
  return best.path;
}
