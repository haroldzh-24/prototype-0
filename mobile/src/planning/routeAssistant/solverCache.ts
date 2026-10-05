import { solveRoute } from '../routeSolver/solveRoute';
import type { RouteSolverInput, RouteSolverResult } from '../routeSolver/types';
import { clone, fingerprint, freeze } from './context';
/** Ephemeral, exact-input cache. Caller namespace includes stage identity and full route revision. */
export class AssistantSolverCache {
  private entries=new Map<string,RouteSolverResult>();
  readonly diagnostics={hits:0,misses:0};
  constructor(private limit=4){}
  solve(namespace:string,input:RouteSolverInput):RouteSolverResult {
    const key=fingerprint({namespace,input}),found=this.entries.get(key);
    if(found){this.diagnostics.hits++;this.entries.delete(key);this.entries.set(key,found);const result=clone(found);result.diagnostics.solveDurationMs=0;return result;}
    this.diagnostics.misses++;const result=solveRoute(input);
    this.entries.set(key,freeze(clone(result)));
    while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value!);
    return result;
  }
  clear(){this.entries.clear();}
}
export const assistantSolverCache=new AssistantSolverCache();
