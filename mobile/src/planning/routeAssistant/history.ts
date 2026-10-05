import type { History } from '../../editor/history';
import { record, end } from '../../editor/history';
import type { StageDocument } from '../../stage/model';
import type { StagePlan } from '../model';
import type { StageRoute } from '../route';
import { clone, fingerprint } from './context';
export type RouteDocument = { stage: StageDocument; plan: StagePlan };
/** Metadata only: snapshots and undo ordering remain owned by normal document history. */
export type AssistantHistory = { document: History<RouteDocument>; assistantChanges: { beforeRevision: string; afterRevision: string }[] };
export function previousRoute(h: AssistantHistory, assistantOnly: boolean): StageRoute | null {
  const document=end(h.document),previous=document.past.at(-1);
  if(!previous?.plan.route)return null;
  if(assistantOnly){const last=h.assistantChanges.at(-1);
    if(!last||last.afterRevision!==fingerprint(document.present)||last.beforeRevision!==fingerprint(previous))return null;
  }
  return clone(previous.plan.route);
}
export function recordAssistantRoute(h: AssistantHistory, route: StageRoute): AssistantHistory {
  const document=end(h.document), next={...document.present,plan:{...document.present.plan,route:clone(route)}};
  const updated=record(document,next);
  return {document:updated,assistantChanges:updated===document?h.assistantChanges:[...h.assistantChanges,{beforeRevision:fingerprint(document.present),afterRevision:fingerprint(next)}]};
}
