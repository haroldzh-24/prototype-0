# Offline route solver — 2026-10-05

PLAN ROUTE now runs one deterministic, offline geometry solver. It minimizes traversable movement through caller-required regions and removes unnecessary route points. No profile, style, backward preference, viewport or screen coordinate participates in solving. No document/route schema, SQLite implementation or explicit Save boundary changed.

## Architecture and files

Public entry: `mobile/src/planning/routeSolver/index.ts`, exporting `solveRoute(input)` and its physical input/result types. All coordinates and distances are inches; polygon areas are square inches. The implementation has no React, native, network or LLM dependency.

Created in `mobile/src/planning/routeSolver/`:

| File | Responsibility |
| --- | --- |
| `types.ts` | Input, regions, barriers, options, snapshot, result, diagnostics and explanations |
| `stageGeometry.ts` | Detached stage bounds/start/barrier/region intake |
| `faultLineInterpretation.ts` | Derived planar fault graph, faces and open boundaries |
| `traversability.ts` | Physical intersection, projection, containment, coverage and movement predicates |
| `navigationGraph.ts` | Bounded finite candidate graph and visibility edges |
| `shortestPath.ts` | Deterministic A* and cached-source Dijkstra trees |
| `routeOrdering.ts` | Exact coverage-state search or nearest-area/2-opt ordering |
| `priorityQueue.ts` | Stable binary heap for large frontiers |
| `scoring.ts` | Coverage-preserving reduction, factual reasons and distance/count comparison |
| `solveRoute.ts` | Authoritative orchestration, validation, budgets and alternatives |
| `adoption.ts` | Plan intake, editable route conversion and transitional preview mapping |
| `index.ts` | Public solver and factual route queries |

Also created `mobile/tests/routeSolver.test.cjs`, `mobile/scripts/benchmark-route-solver.cjs`, and this report.

Modified `mobile/src/planning/AutoPlannerPanel.tsx`, `plannerUI.ts`, `README.md`; `mobile/tests/storage.test.cjs`, `ui-reorganization.test.cjs`, `final-ui-browser.cjs`; and root `bugs.md`, `features.md`, `changelog.md`.

## Fault intake

Raw `StageDocument` fault objects remain untouched. Endpoint clusters have a bounded diameter, preventing transitive chains from closing a large gap. Near endpoint-to-segment connections are projected onto existing geometry. Short loose-end gaps may receive explicit connecting edges. Intersections and T junctions split edges; collinear overlaps and duplicates share unique graph edges. Directed half-edge face walks detect enclosed positive-area regions. Dangling branches remain open even when attached to a closed region.

Central defaults: endpoint merge **2 in**, small gap **4 in**, near-collinear offset **2 in**, near-collinear direction angle **5°**, minimum region **36 in²**. Slightly crooked corners stay crooked; the solver does not round every corner to 90°. Near-collinear noise is removed from derived face outlines. Larger missing boundaries remain open with uncertainty warnings. Endpoint merges and inferred connections are counted. Interpretation is supporting intake, not an editable correction feature or an automatically required region.

## Traversability and graph

Walls become their oriented, endpoint-derived rectangular ground footprints, including thickness. Firing ports do not become walking openings. Additional physical barriers and explicit restricted polygons can be passed to the solver. Tangency to a blocked footprint is blocked. Optional clearance expands the collision distance; default is zero, modeling a point mover.

Fault lines are logical boundaries and never solid walls. When existing route settings explicitly disallow outside travel, the plan adapter supplies the allowed firing-polygon union. Segments are split at its boundary intersections and each interval must remain in the union. Otherwise fault areas do not constrain travel. Both endpoints and every movement segment remain inside rectangular stage bounds.

Graph nodes include Start, region vertices, preferred points when inside, polygon means, edge midpoints, projections of relevant physical anchors onto region edges, region intersections, allowed-travel corners and wall/restricted corners offset by clearance plus **0.01 in**. Outside/blocked points and near duplicates are rejected. A pair receives a Euclidean-distance edge only when its entire straight segment is traversable. This is finite geometry sampling, not arbitrary floating-point brute force.

## Search, ordering and scoring

Single-goal `shortestPath()` uses A* with an admissible Euclidean heuristic and node-index tie breaking. Multiple goals up to the default **8 required areas** use exact Dijkstra search over `(navigation node, visited-area mask)`, including regions crossed by an edge. This is exact on the generated finite graph, not a claim of globally optimal continuous region geometry. The mask accounts for overlapping regions and requirements satisfied en route without stopping.

Larger counts use deterministic nearest reachable required geometry, cached single-source Dijkstra trees, and at most four passes of open-route 2-opt. Area IDs are sorted before search, so caller creation order cannot change symmetric tie outcomes. The route starts at Start and ends once all requirements are visited; no return-to-start requirement is inferred.

Reduction repeatedly removes an intermediate point only when the shortcut is traversable and retains all covered requirements. A redundant terminal point can also be removed when its visit is unnecessary. Start remains the first solver point. Graph noise disappears without losing a sole required-area visit or obstacle detour.

Exact cost: `totalDistanceInches = sum(hypot(dx, dy))`; `score = totalDistanceInches`. Routes are compared lexicographically by `(totalDistanceInches, waypointCount, stable ID)`. There is no weighted style, time, shooting difficulty or personalization score. Search/reduction numeric comparisons use `1e-7` tolerance. `waypointCount` excludes Start, matching editable route positions. No secondary direction-change penalty is currently used.

The result has exactly one `bestRoute`, a separate small `alternatives` array, status and diagnostics. Only complete, traversable candidates qualify. Alternatives are attempted only when a retained primary corner has an obstruction explanation: at most six graph-edge-exclusion searches and two returned comparisons. Paths that remain within **6 in** of each other in both directions are treated as equivalent. Unobstructed routes produce no artificial variety. Every candidate is reduced and rescored; the shortest resulting candidate remains primary. Alternatives may legitimately be absent.

## UI and saved-route compatibility

`AutoPlannerPanel` calls `solverInputFromPlan()` → `solveRoute()` → result. Configured firing areas are required regions. Without firing areas, existing route positions are exact mandatory points. With no requirements the optimal movement is zero at Start; PLAN explains this rather than inventing target visits. A preferred point never overrides geometric area freedom.

PLAN displays the primary route and conditionally offers Compare Alternatives. View on Stage uses a preview-only adapter to the existing canvas contract. `GEOMETRY` is a preview discriminator, not a route style or solver option. Use Route preserves meaningful-route replacement confirmation and copies an ordinary `StagePlan.route`. Solver Start is omitted from editable positions because the stage already owns Start. Positions use ground-level `StagePosition`, stable IDs and mutable copied arrays. Existing engagement rules are detached/copied, while the existing plan loadout and round counts remain intact.

The movement solver does not generate target assignments or reload schedules. Coincident manual position assignments are retained; assignments at points removed by geometric reduction are not inferred onto another point. PLAN explicitly directs users to edit targets/reloads after adoption. Reloads start empty, avoiding references to eliminated point IDs. Existing move/add/delete/reorder tools operate normally. Manual edits never trigger automatic regeneration; Save remains explicit. Real SQLite save/close/reopen and subsequent editing are tested.

Retired from the active PLAN flow: `generatePlannerCards`, legacy candidate generation/evaluation/style ranking, automatic position-source discovery, personalized model construction, route-style selection, backward controls, reload strategy presets and competing ruleset/planner modes. Old `planner.ts`, `candidateGeneration.ts`, `ranking.ts`, `personalizedRoute.ts`, `positionDiscovery.ts`, `positionSources.ts`, legacy result presentation and their tests remain temporarily. Manual-route analysis, target rules, training/Profile data and saved route validation remain relevant. The transitional `PlannerCard` type and route-copy helper preserve preview/adoption compatibility; their legacy generation functions are never called by PLAN.

## Diagnostics, bounds and future API

Results include solver version `1.0.0`, raw fault count, interpreted region count, merge/gap counts, graph nodes/edges, search iterations, evaluated/pruned routes, reductions, final physical distance, elapsed milliseconds, warnings and unresolved area IDs. Duration is measured and naturally varies; route geometry and other search results are deterministic. On failed coverage search the unresolved list conservatively includes every required area because no complete result exists. No normal-user diagnostics panel was added.

Default limits: **512 navigation nodes**, **100,000 search iterations**, **8 areas for exact search**, **2 alternatives**. Hard bounds: 512 stage objects, 32 required areas, 64 vertices per explicit polygon, 256 combined explicit region/barrier/allowed-travel vertices, 50,000 estimated geometry samples, 200,000 maximum configured search iterations, 12 maximum exact-mask areas, six alternative searches. Exact search also caps edge relaxations at 16 times the iteration budget. Input, graph and search limits produce structured `invalid-input`, `unreachable` or `limit` outcomes; a limit never returns a fabricated partial primary route.

Factual public APIs already available: `solveRoute`, `getRouteSummary`, `compareRoutes`, `explainWaypoint`, `solverInputFromPlan`, `candidateToStageRoute`. Explanation records identify areas requiring a waypoint or barrier IDs obstructing its removal. They contain facts, not LLM reasoning. Future conversational `previewReplan` should call `solveRoute` on a proposed detached input. Future `previewMoveWaypoint`/`previewDeleteWaypoint` should use copied ordinary routes plus these traversability/coverage predicates, returning a proposal and violations before applying anything through existing editor/Save actions. Those mutation-preview wrappers and the language model are deferred.

## Validation and performance

`npm.cmd run typecheck`: **passed**. `npm.cmd test`: **608/608 passed**, preserving the previous 570 tests, adapting one retired-generator UI mock, and adding 36 solver tests, one real PLAN callback integration test and one real SQLite close/reopen test. Coverage includes all requested cases, plus allowed-travel concavity, overlapping/duplicate fault pieces, dangling/crooked T junctions, bounded search, malformed physical input, A* and factual query APIs. The browser journey's Configure selector is updated; browser/native journeys were not executed in this task.

Benchmark command: `node scripts/benchmark-route-solver.cjs`. Windows desktop Node **v24.20.0**, one warmup then ten measured solves per stage, with alternatives enabled. These are desktop JavaScript measurements, not on-device claims.

| Stage | Median ms | Maximum ms | Nodes / edges | Search iterations | Distance in |
| --- | ---: | ---: | ---: | ---: | ---: |
| Clear, one region | 0.52 | 1.22 | 10 / 45 | 2 | 480.00 |
| One wall detour | 5.83 | 18.38 | 22 / 120 | 56 | 531.91 |
| Four regions, three walls | 282.56 | 342.91 | 77 / 1,185 | 4,726 | 1,083.75 |
| Ten regions, two walls | 351.10 | 408.71 | 127 / 4,635 | 9,779 | 1,240.66 |

Benchmarking exposed repeated candidate-to-candidate searches. Cached-source shortest trees reduced the ten-region median from **1,869.57 ms** to **351.10 ms**. Binary heaps replace sorting growing coverage frontiers.

Known limits: finite area/corner candidates; continuous optimum and body/vertical passage clearance are not certified; inferred short fault connections can be ambiguous; complex polygons need adaptive refinement; exact multi-region solving can hit budgets; synchronous JS can briefly block the UI despite bounded work and the initial paint delay; alternatives are bounded obstacle comparisons rather than exhaustive route enumeration. Polygon input is expected to describe simple regions. Without configured areas, ordinary saved waypoints act as requirements, since saved routes have no separate required/generated intent flag. Target coverage, ammunition feasibility, reload optimization and firing procedures are still editable/analysis concerns, not movement-solver objectives. Native performance and interactions remain planned. Photo import, conversational AI and 3D were not implemented.

No commit or push. No dated unresolved project item is over one month old as of October 5, 2026; undated legacy entries cannot be aged reliably.
