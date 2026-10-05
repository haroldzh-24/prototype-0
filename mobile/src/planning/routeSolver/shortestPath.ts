import type { Graph } from './navigationGraph';
import type { Diagnostics } from './types';
import { distanceBetweenPoints } from './traversability';
import { PriorityQueue } from './priorityQueue';

/** One source supplies many area candidates; avoids repeating nearly identical A* searches. */
export function shortestPaths(graph:Graph,start:number,d:Diagnostics,limit:number,blocked?:string) {
  const costs=graph.nodes.map(()=>Infinity),previous=graph.nodes.map(()=>-1);
  const open=new PriorityQueue<{node:number;cost:number}>((a,b)=>a.cost-b.cost||a.node-b.node);
  costs[start]=0;open.push({node:start,cost:0});
  while(open.size&&d.searchIterations<limit){
    const current=open.pop()!;if(current.cost!==costs[current.node])continue;d.searchIterations++;
    for(const e of graph.edges[current.node]){
      if([current.node,e.to].sort((a,b)=>a-b).join(':')===blocked)continue;
      const cost=current.cost+e.distance;
      if(cost<costs[e.to]-1e-7){costs[e.to]=cost;previous[e.to]=current.node;open.push({node:e.to,cost});}
    }
  }
  // Partial trees are not authoritative if the budget was exhausted.
  if(open.size)return null;
  return {to(goal:number){if(!Number.isFinite(costs[goal]))return null;const path=[goal];while(path[0]!==start)path.unshift(previous[path[0]]);return {path,distance:costs[goal]};}};
}
/** Deterministic A*: physical Euclidean admissible heuristic, index tie break. */
export function shortestPath(graph: Graph,start: number,goal: number,d: Diagnostics,limit: number,blocked?: string): {path:number[];distance:number} | null {
  const costs=graph.nodes.map(()=>Infinity),previous=graph.nodes.map(()=>-1),open=new Set([start]);costs[start]=0;
  while(open.size&&d.searchIterations<limit) {
    d.searchIterations++;
    const current=[...open].sort((a,b)=>(costs[a]+distanceBetweenPoints(graph.nodes[a],graph.nodes[goal]))-(costs[b]+distanceBetweenPoints(graph.nodes[b],graph.nodes[goal]))||a-b)[0];
    if(current===goal){const path=[goal];while(path[0]!==start)path.unshift(previous[path[0]]);return {path,distance:costs[goal]};}
    open.delete(current);
    for(const edge of graph.edges[current]) {
      if([current,edge.to].sort((a,b)=>a-b).join(':')===blocked)continue;
      const cost=costs[current]+edge.distance;
      if(cost<costs[edge.to]-1e-7){costs[edge.to]=cost;previous[edge.to]=current;open.add(edge.to);}
    }
  }
  return null;
}
