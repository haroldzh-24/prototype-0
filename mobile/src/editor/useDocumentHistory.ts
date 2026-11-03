import { useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import type { StageDocument, StageObject } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { reconcilePlan } from '../planning/model';
import { syncLayers } from '../stage/targetLayers';
import { history, record, begin, end, undo, redo } from './history';
import { applyRoutePreview } from '../planning/routeAssistant/preview';
import type { RouteChangePreview } from '../planning/routeAssistant/types';
import type { AssistantHistory } from '../planning/routeAssistant/history';
export function useDocumentHistory(stage: StageDocument, plan: StagePlan) {
  const [h, render] = useState(() => { const synced = syncLayers(stage); return history({ stage: synced, plan: reconcilePlan(plan, synced) }); });
  const current = useRef(h);
  // Counts every change to the document (edits, undo, redo), so a note about one edit ("Deleted T3 · UNDO") can tell
  // whether the document is still exactly as that edit left it. Only a changed document counts: begin() and end()
  // (the start and end of a drag) and an edit that changes nothing leave it as it was.
  const revision = useRef(0);
  const assistantChanges = useRef<AssistantHistory['assistantChanges']>([]);
  const set = (update: (value: typeof h) => typeof h) => { const next = update(current.current); if (next.present !== current.current.present) revision.current++; current.current = next; render(current.current); };
  const setStage = (next: SetStateAction<StageDocument>) => set(h => {
    // Layered targets (hostages, doubles) follow their parent through every edit; a removed parent takes its layers.
    const stage = syncLayers(typeof next === 'function' ? next(h.present.stage) : next);
    return record(h, { stage, plan: reconcilePlan(h.present.plan, stage) });
  });
  const setPlan = (next: SetStateAction<StagePlan>) => set(h => {
    const plan = typeof next === 'function' ? next(h.present.plan) : next;
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
    if (result.status === 'applied') { assistantChanges.current = result.history.assistantChanges; current.current = result.history.document; revision.current++; render(current.current); }
    return result;
  };
  return { ...h.present, setStage, setPlan, appendObjects, getAssistantHistory, applyAssistantPreview, begin: () => set(begin), end: () => set(end), undo: () => set(undo), redo: () => set(redo), canUndo: h.past.length > 0, canRedo: h.future.length > 0,
    /** The history's revision now (read it right after an edit, in the same handler). */ revision: () => revision.current };
}
