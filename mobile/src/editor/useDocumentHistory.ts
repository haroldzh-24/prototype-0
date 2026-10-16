import { reconcileManualEngagements } from '../planning/manualEngagements';
import { useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import type { StageDocument, StageObject } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { reconcilePlan } from '../planning/model';
import { history, record, begin, end, undo, redo } from './history';
import { applyRoutePreview } from '../planning/routeAssistant/preview';
import type { RouteChangePreview } from '../planning/routeAssistant/types';
import type { AssistantHistory } from '../planning/routeAssistant/history';
export function useDocumentHistory(stage: StageDocument, plan: StagePlan) {
  const [h, render] = useState(() => history({ stage, plan: reconcilePlan(plan, stage, { stage, route: plan.route }) }));
  const current = useRef(h);
  const assistantChanges = useRef<AssistantHistory['assistantChanges']>([]);
  const set = (update: (value: typeof h) => typeof h) => { current.current = update(current.current); render(current.current); };
  const setStage = (next: SetStateAction<StageDocument>) => set(h => {
    const stage = typeof next === 'function' ? next(h.present.stage) : next;
    return record(h, { stage, plan: reconcilePlan(h.present.plan, stage, { stage: h.present.stage, route: h.present.plan.route }) });
  });
  const setPlan = (next: SetStateAction<StagePlan>) => set(h => {
    let plan = typeof next === 'function' ? next(h.present.plan) : next;
    if (plan.route) plan = { ...plan, route: reconcileManualEngagements(h.present.stage, plan.route, h.present.plan.route) };
    return record(h, { ...h.present, plan });
  });
  // Reconstruction is strictly additive, including when old plans contain stale references.
  // Do not run unrelated target/route reconciliation while accepting imported objects.
  const appendObjects = (objects: StageObject[]) => set(h => {
    const ids = new Set(h.present.stage.objects.map(o => o.id));
    const additions = objects.filter(o => { if (ids.has(o.id)) return false; ids.add(o.id); return true; });
    return additions.length ? record(h, { stage: { ...h.present.stage, objects: [...h.present.stage.objects, ...additions] }, plan: h.present.plan }) : h;
  });
  const getAssistantHistory = (): AssistantHistory => ({ document: current.current, assistantChanges: assistantChanges.current });
  const applyAssistantPreview = (preview: RouteChangePreview) => {
    const result = applyRoutePreview(preview, getAssistantHistory());
    if (result.status === 'applied') { assistantChanges.current = result.history.assistantChanges; current.current = result.history.document; render(current.current); }
    return result;
  };
  return { ...h.present, setStage, setPlan, appendObjects, getAssistantHistory, applyAssistantPreview, begin: () => set(begin), end: () => set(end), undo: () => set(undo), redo: () => set(redo), canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
