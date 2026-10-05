import type { RouteChangePreview } from './types';
import { createRouteAssistantContext, clone, fingerprint } from './context';
import { routeMetrics } from './queries';
import { validateRoute } from './validation';
import type { AssistantHistory } from './history';
import { recordAssistantRoute, previousRoute } from './history';
import { undo, end } from '../../editor/history';
import { executeRouteAssistantCommand, isIssuedPreview } from './executor';
export type ApplyResult = { status: 'applied'; history: AssistantHistory; dirty: true; requiresSave: true } | { status:'invalid'; code:string };
/** Controlled acceptance updates only normal editable document history; it never calls storage. */
export function applyRoutePreview(preview: RouteChangePreview, current: AssistantHistory): ApplyResult {
  const document=end(current.document),c=createRouteAssistantContext(document.present.stage,document.present.plan);
  if(preview.sourceRevision!==c.revision)return {status:'invalid',code:'STALE_PREVIEW'};
  if(fingerprint(preview.originalRoute)!==fingerprint(c.route))return {status:'invalid',code:'STALE_PREVIEW'};
  // Only a frozen, in-process replan can reuse its validated solve.
  // Deserialized previews and history-dependent commands are always re-executed.
  const reusable=isIssuedPreview(preview)&&(preview.command.type==='REPLAN'||preview.command.type==='REPLAN_AVOIDING_AREA');
  if(!reusable){
    const checked=executeRouteAssistantCommand(c,clone(preview.command),current);
    if(checked.kind!=='preview')return {status:'invalid',code:'INVALID_PREVIEW'};
    if(fingerprint(checked.preview.proposedRoute)!==fingerprint(preview.proposedRoute)||fingerprint(checked.preview.constraints)!==fingerprint(preview.constraints))return {status:'invalid',code:'INVALID_PREVIEW'};
  }
  const invalid=validateRoute(c,preview.proposedRoute);
  if(invalid)return {status:'invalid',code:invalid};
  if(!routeMetrics(c,preview.proposedRoute,preview.constraints).valid)return {status:'invalid',code:'INVALID_ROUTE_GEOMETRY'};
  if(preview.command.type==='UNDO_LAST_ASSISTANT_CHANGE'){
    if(!previousRoute(current,true))return {status:'invalid',code:'NO_PREVIOUS_ROUTE'};
    return {status:'applied',history:{document:undo(document),assistantChanges:current.assistantChanges.slice(0,-1)},dirty:true,requiresSave:true};
  }
  return {status:'applied',history:recordAssistantRoute({...current,document},clone(preview.proposedRoute)),dirty:true,requiresSave:true};
}
