import type { Decision, RouteAIAdapter, Availability, FormatRequest } from '../types';
/** Test-only injection. No production imports, environment toggle or browser-global override. */
export function mockAdapter(decisions:(Decision|Error)[]=[],availability:Availability='AVAILABLE') {
  const calls:{method:string;id?:string;request?:unknown}[]=[];
  const adapter:RouteAIAdapter={
    async getAvailability(){calls.push({method:'availability'});return availability;},
    async createSession(id){calls.push({method:'create',id});},async resetSession(id){calls.push({method:'reset',id});},
    async interpret(id,request){calls.push({method:'interpret',id,request});const d=decisions.shift();if(d instanceof Error)throw d;return d??{intent:'QUERY_ROUTE_SUMMARY'};},
    async format(id,request:FormatRequest){calls.push({method:'format',id,request});return `Mock response: ${JSON.stringify(request.facts)}`;},
  };return {adapter,calls};
}
