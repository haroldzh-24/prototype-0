import type { StageDocument } from '../../stage/model';
import type { StagePlan } from '../model';
import type { StageRoute } from '../route';
import type { RouteSolverInput, RouteSolverResult, Point, Barrier } from '../routeSolver/types';
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type RouteAssistantContext = DeepReadonly<{
  stageId?: string; stage: StageDocument; plan: StagePlan; route: StageRoute; solverInput: RouteSolverInput;
  solverResult?: RouteSolverResult; revision: string; selectedWaypointId?: string;
}>;
export type Placement = { kind: 'before' | 'after'; waypointId: string } | { kind: 'between'; fromId: string; toId: string } | { kind: 'nearest' };
export type RouteQuery =
  | { type: 'SUMMARY' | 'WAYPOINTS' | 'DISTANCE' | 'REQUIRED_AREAS' | 'ALTERNATIVES' | 'DIAGNOSTICS' }
  | { type: 'WAYPOINT' | 'EXPLAIN_WAYPOINT'; waypointId: string }
  | { type: 'EXPLAIN_SEGMENT'; fromId: string; toId: string }
  | { type: 'BLOCKING_GEOMETRY'; from: Point; to: Point };
type Mutation = { sourceRevision: string };
export type RouteAssistantCommand =
  | { type: 'ANSWER_ONLY'; query: RouteQuery }
  | { type: 'COMPARE_ROUTE'; routeA: StageRoute; routeB: StageRoute }
  | { type: 'NEED_CLARIFICATION'; question: string; options: { id: string; label: string }[] }
  | (Mutation & { type: 'MOVE_WAYPOINT'; waypointId: string | null; destination: { kind: 'absolute'; position: Point } | { kind: 'delta'; deltaXInches: number; deltaYInches: number } })
  | (Mutation & { type: 'ADD_WAYPOINT'; waypointId: string; position: Point; placement: Placement })
  | (Mutation & { type: 'DELETE_WAYPOINT'; waypointId: string })
  | (Mutation & { type: 'REORDER_WAYPOINT'; waypointId: string; beforeId: string })
  | (Mutation & { type: 'REPLAN' })
  | (Mutation & { type: 'REPLAN_AVOIDING_AREA'; area: Barrier })
  | (Mutation & { type: 'UNDO_LAST_ASSISTANT_CHANGE' | 'RESTORE_PREVIOUS_ROUTE' });
export type Highlights = { waypointIds: string[]; stageObjectIds: string[]; requiredAreaIds: string[]; routeSegmentIds: string[]; temporaryRegionIds: string[] };
export type RouteMetrics = { distanceInches: number; waypointCount: number; directionChanges: number; requiredAreasVisited: string[]; requiredAreasMissed: string[]; valid: boolean; warnings: string[] };
export type RouteComparison = { before: RouteMetrics; after: RouteMetrics; distanceDifferenceInches: number; waypointDifference: number; directionChangeDifference: number; coverageGained: string[]; coverageLost: string[]; geometryChanges: { added: string[]; removed: string[]; moved: string[]; reordered: boolean } };
export type ExplanationReason = { type: 'OBSTACLE_DETOUR' | 'REQUIRED_AREA_VISIT' | 'STAGE_BOUNDARY_CONSTRAINT' | 'RESTRICTED_AREA_DETOUR' | 'SHORTEST_AVAILABLE_PATH' | 'REDUNDANT_WAYPOINT_REMOVED'; objectIds?: string[]; requiredAreaIds?: string[]; distanceAddedInches?: number };
export type RouteChangePreview = DeepReadonly<{ id: string; command: RouteAssistantCommand; originalRoute: StageRoute; proposedRoute: StageRoute; before: RouteMetrics; after: RouteMetrics; delta: RouteComparison; warnings: string[]; affectedWaypointIds: string[]; affectedStageObjectIds: string[]; valid: boolean; sourceStageId?: string; sourceRevision: string; constraints: Barrier[] }>;
export type RouteAssistantResult =
  | { kind: 'answer'; data: unknown; highlights?: Highlights; durationMs: number }
  | { kind: 'comparison'; data: RouteComparison; durationMs: number }
  | { kind: 'preview'; preview: RouteChangePreview; highlights: Highlights; durationMs: number; solverDurationMs?: number }
  | { kind: 'clarification'; data: { question: string; options: { id: string; label: string }[] }; durationMs: number }
  | { kind: 'error'; status: 'invalid'; code: string; durationMs: number };
