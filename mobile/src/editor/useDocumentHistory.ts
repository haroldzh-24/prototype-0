import { useState } from 'react';
import type { SetStateAction } from 'react';
import type { StageDocument } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { reconcilePlan } from '../planning/model';
import { history, record, begin, end, undo, redo } from './history';
export function useDocumentHistory(stage: StageDocument, plan: StagePlan) {
  const [h, set] = useState(() => history({ stage, plan: reconcilePlan(plan, stage) }));
  const setStage = (next: SetStateAction<StageDocument>) => set(h => {
    const stage = typeof next === 'function' ? next(h.present.stage) : next;
    return record(h, { stage, plan: reconcilePlan(h.present.plan, stage) });
  });
  const setPlan = (next: SetStateAction<StagePlan>) => set(h => record(h, { ...h.present, plan: typeof next === 'function' ? next(h.present.plan) : next }));
  return { ...h.present, setStage, setPlan, begin: () => set(begin), end: () => set(end), undo: () => set(undo), redo: () => set(redo), canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
