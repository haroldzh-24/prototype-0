import { useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { reconcilePlan } from '../planning/model';
import { history, record, begin, end, undo, redo } from './history';
import { applyRoutePreview } from '../planning/routeAssistant/preview';
import type { RouteChangePreview } from '../planning/routeAssistant/types';
import type { AssistantHistory } from '../planning/routeAssistant/history';
export function useDocumentHistory(stage: StageDocument, plan: StagePlan) {
  const [h, render] = useState(() => history({ stage, plan: reconcilePlan(plan, stage) }));
  const current = useRef(h);
  const assistantChanges = useRef<AssistantHistory['assistantChanges']>([]);
  const set = (update: (value: typeof h) => typeof h) => { current.current = update(current.current); render(current.current); };
  const setStage = (next: SetStateAction<StageDocument>) => set(h => {
    const stage = typeof next === 'function' ? next(h.present.stage) : next;
    return record(h, { stage, plan: reconcilePlan(h.present.plan, stage) });
  });
  const setPlan = (next: SetStateAction<StagePlan>) => set(h => record(h, { ...h.present, plan: typeof next === 'function' ? next(h.present.plan) : next }));
  const getAssistantHistory = (): AssistantHistory => ({ document: current.current, assistantChanges: assistantChanges.current });
  const applyAssistantPreview = (preview: RouteChangePreview) => {
    const result = applyRoutePreview(preview, getAssistantHistory());
    if (result.status === 'applied') { assistantChanges.current = result.history.assistantChanges; current.current = result.history.document; render(current.current); }
    return result;
  };
  return { ...h.present, setStage, setPlan, getAssistantHistory, applyAssistantPreview, begin: () => set(begin), end: () => set(end), undo: () => set(undo), redo: () => set(redo), canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
