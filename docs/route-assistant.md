# Headless route assistant — October 5, 2026

The future on-device language interpreter calls:

```ts
executeRouteAssistantCommand(context, command, assistantHistory?)
```

Import from `mobile/src/planning/routeAssistant/index.ts`. This module has no React, model, network or storage dependency. Geometry stays in physical inches: X increases right, Y increases down, so two yards left is `deltaXInches: -72`.

## Files

Created eight module files: `types.ts`, `context.ts`, `queries.ts`, `validation.ts`, `executor.ts`, `preview.ts`, `history.ts`, `index.ts`; `mobile/tests/routeAssistant.test.cjs`; `mobile/scripts/benchmark-route-assistant.cjs`; and this document. This task updates the planning README and root bugs/features/changelog. Existing solver, planner UI and storage modifications were already in the worktree and were retained.

## Context and API

`createRouteAssistantContext(stage, plan, {solverResult?, selectedWaypointId?})` detaches and recursively freezes the physical stage snapshot, ordinary editable StageRoute, plan inputs needed for route adoption/reference checks, authoritative `solverInputFromPlan` inputs, optional solver result and selection. It includes an exact canonical content revision, excluding any React or viewport state from its API. A missing route becomes an empty transient route. Required areas retain PLAN ROUTE semantics: existing firing polygons, or mandatory existing route points when no polygons are configured.

Queries: `getRouteSummary`, `getWaypoints`, `getWaypoint`, `getRouteDistance`, `getRequiredAreas`, `getBlockingGeometry(context, from, to)`, `compareRoutes(context, routeA, routeB)`, `explainWaypoint`, `explainRouteSegment`, `getAlternatives`, `getRouteDiagnostics`. Structured query dispatch is available through `ANSWER_ONLY`. Missing waypoints/segments become structured errors in the executor. Segment references use `START` followed by adjacent existing waypoint IDs.

Commands: ANSWER_ONLY, MOVE_WAYPOINT, ADD_WAYPOINT, DELETE_WAYPOINT, REORDER_WAYPOINT, REPLAN, REPLAN_AVOIDING_AREA, COMPARE_ROUTE, UNDO_LAST_ASSISTANT_CHANGE, RESTORE_PREVIOUS_ROUTE, NEED_CLARIFICATION. All mutation payloads include `sourceRevision`. No JSON patches or generic modification payloads exist. `isRouteAssistantCommand(unknown)` enforces exact command/query keys and required payload shapes at runtime.

Move accepts an absolute `{x,y}` or explicit inch delta. Add takes an explicit physical position and before/after/between/nearest placement. Nearest chooses the closest existing physical route segment with stable first-segment tie breaking; an empty route inserts at index zero. Between requires adjacency and may refer to START. Delete removes reload references attached to the removed waypoint. Reorder preserves waypoint contents. Replan and temporary avoidance call the existing `solveRoute` and `candidateToStageRoute` exclusively.

Validation rejects unknown IDs, duplicate waypoint IDs, invalid route/reload/target references, non-finite coordinates, out-of-stage positions, incompatible solver intake and outdated revisions. Proposed geometry uses the existing traversability and area coverage functions. Expected errors return `{kind:'error', status:'invalid', code, durationMs}`. Structurally sound edits with blocked paths or lost required coverage return an invalid preview with factual warnings; Apply rejects them. Existing stale target references are never silently rewritten.

## Preview, acceptance and history

`RouteChangePreview` contains a deterministic ID, typed command, original/proposed ordinary routes, before/after metrics, comparison delta, warnings, affected IDs, validity, source revision and temporary constraints. Commands never modify the source context or StagePlan. Preview data is recursively frozen.

`applyRoutePreview(preview, assistantHistory)` is the controlled acceptance function. It reconstructs current context, rejects STALE_PREVIEW on document/plan changes, re-executes the typed command to verify the proposed route and temporary constraints, then checks structure, geometry and required coverage again. Edited preview JSON cannot supply arbitrary accepted route changes. It returns either a structured invalid result or `{status:'applied', history, dirty:true, requiresSave:true}`.

The host owns `AssistantHistory = {document: History<{stage,plan}>, assistantChanges}`. Initialize `document` with existing `editor/history.history`; adopt the returned history into the editable document on user acceptance. `recordAssistantRoute` calls existing `record`/`end`, and assistant undo calls existing `undo`. There is no second route snapshot stack. Metadata only identifies assistant-owned latest history transitions. Existing editor dirty detection compares editable versus saved snapshots; accepted history changes naturally participate in that comparison. The headless layer never writes SQLite or marks a snapshot saved. The current React builder is intentionally not wired to new assistant controls; a future host must own this history state and install accepted results atomically.

Undo is itself preview-first and allowed only when the latest normal history transition belongs to the assistant. Intervening manual document edits return NO_PREVIOUS_ROUTE rather than undoing those edits. RESTORE_PREVIOUS_ROUTE previews the prior normal history route while preserving the current stage/loadout. Normal undo/redo continues to work through existing history functions. Undo before a first route was created is unsupported because the previous snapshot contains no StageRoute.

Revisions use canonical exact stage/plan/input content rather than a collision-prone short hash or SQLite column. Identical content receives the same token; an edit then exact revert is therefore compatible. Context construction copies only defined StageDocument fields and explicit context options, excluding incidental top-level viewport data. Stage, loadout or assignment changes conservatively invalidate previews too. Revision/preview IDs are content tokens, potentially larger than UUIDs.

## Facts, focus and clarification

Comparison reports before/after movement inches, waypoint and direction-change counts, gained/lost required areas and added/removed/moved/reordered waypoint IDs. Differences are **after minus before**. Distance includes Start to the first waypoint.

Explanations compute the impact of removing a waypoint using existing geometry: REQUIRED_AREA_VISIT, OBSTACLE_DETOUR, RESTRICTED_AREA_DETOUR, STAGE_BOUNDARY_CONSTRAINT and REDUNDANT_WAYPOINT_REMOVED. SHORTEST_AVAILABLE_PATH is available only for geometry matching the current best solver result. These are factual counterfactual reasons, not claims of globally optimal continuous paths. `formatExplanation` provides a simple test formatter. Temporary avoidance remains preview data; neither stage nor saved plan contains the temporary region.

Highlights include waypoint IDs, real stage-object IDs, required-area IDs, route-segment IDs and separately named temporary-region IDs. Deleted waypoint IDs refer to the original route for before-preview focus. No geometry is changed by focus metadata. A null move waypoint resolves only an explicit current selection; otherwise it returns a question with waypoint choices. NEED_CLARIFICATION also accepts a structured question/options payload. Result kinds are answer, preview, comparison, clarification and error; facts remain structured.

## Measurements and verification

Desktop Node v24.20.0, ten warm samples per command; run `node scripts/benchmark-route-assistant.cjs` from mobile. Median / maximum milliseconds:

| Stage | Move | Delete | Replan | Avoid area |
| --- | --- | --- | --- | --- |
| One-wall detour | 1.25 / 2.33 | 0.31 / 0.45 | 6.73 / 16.03 | 17.40 / 27.61 |
| Ten regions | 1.02 / 1.21 | 0.68 / 1.41 | 438.13 / 548.27 | 485.86 / 561.83 |

Every executor result includes measured `durationMs`. Manual edits use geometry evaluation without solver calls. Replan/avoid are synchronous headless operations; no render path invokes them. A future native/background scheduler should execute them outside rendering, discard results if revisions change, and avoid repeated previews for unchanged commands. Apply intentionally recomputes solver commands for verification, so large-case acceptance also needs scheduling. No cancellation/native scheduler or artificial async wrapper was added.

`npm.cmd run typecheck` passes. `npm.cmd test` passes **634 tests**, preserving the previous 608 and adding 26 deterministic assistant tests for reads, edits, coverage, immutable previews, authoritative replan, avoidance, acceptance, stale/tampered previews, history, focus, clarification and untrusted payloads. Physical-device timing and UI/Save journeys remain unverified; existing storage Save/reopen tests remain passing.

Known limits: inherited finite-candidate/point-movement solver model; replanning uses existing adoption behavior, including reset reload/engagement assignments as documented by that adapter; temporary avoidance is not retained for subsequent replans; no natural-language parser, model, chat, Apple Foundation Models, cloud AI, schema migrations or changes to StageDocument/StagePlan semantics. No commit or push.
# Conversational host update — October 5, 2026

The headless layer described below is now connected to the on-device ASK UI and local Apple Foundation Models module. See [Route AI](route-ai.md) for the host/session/preview integration, current validation results and native checklist. Statements below excluding models/chat describe the scope of the original headless implementation.

