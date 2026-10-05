import type { StageDocument } from '../../stage/model';
import type { StagePlan } from '../model';
import { createRoute } from '../route';
import { solverInputFromPlan } from '../routeSolver/adoption';
import type { RouteSolverResult } from '../routeSolver/types';
import type { RouteAssistantContext } from './types';
type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
export function clone<T>(value: T): Mutable<T> { return JSON.parse(JSON.stringify(value)); }
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Exact canonical content token avoids hash collisions; includes all plan/stage constraints. */
export function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined).map(k => `${JSON.stringify(k)}:${fingerprint((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function createRouteAssistantContext(stage: StageDocument, plan: StagePlan, options: { stageId?: string; solverResult?: RouteSolverResult; selectedWaypointId?: string } = {}): RouteAssistantContext {
  const snapshot: StageDocument = {schemaVersion:stage.schemaVersion,coordinateSystem:stage.coordinateSystem,
    stage:{width:stage.stage.width,depth:stage.stage.depth},objects:stage.objects};
  const input = solverInputFromPlan(snapshot, plan);
  return freeze(clone({ stageId:options.stageId, stage:snapshot, plan, route: plan.route ?? createRoute('assistant-route'), solverInput: input,
    revision: fingerprint({ stage:snapshot, plan, input }),
    ...(options.solverResult?{solverResult:options.solverResult}:{}),
    ...(options.selectedWaypointId?{selectedWaypointId:options.selectedWaypointId}:{}) }));
}
