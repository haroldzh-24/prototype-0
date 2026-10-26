# Route Planner V2 — design

Status: implemented 2026-10-22 in `mobile/src/planning/v2/` (planner version 2.1.0 after the independent review, see [Review fixes](#review-fixes-2026-10-22)), alongside the existing movement optimizer (`routeSolver/`), which stays until V2 is verified on devices.

## Goal

Given a stage, produce **one** efficient, explainable plan that:

1. engages every required target from a legal shooting position, in the order the stage procedures require,
2. uses the **fewest shooting positions**, then the **shortest movement**,
3. reports precisely which targets cannot be covered and why, and
4. never claims more about safety or rule compliance than it actually checked.

Entry point: `planRoute(stageSnapshot, options) → RoutePlan`. Deterministic (same input, same output) unless the wall-clock guard `maxSearchMs` (default 3 s per search phase) is reached; that is flagged as `diagnostics.stoppedBy = 'time'` with a warning. The node budget (`maxSearchNodes`) is the deterministic limit.

`planRouteAsync(snapshot, options, signal)` computes the same plan in slices on the JS thread (it yields during the graph build, reachability, coverage, both searches and refinement), so the screen stays responsive and Cancel takes effect within one slice.

The app passes the route's own settings with `optionsFromPlan(plan)`: safe direction and half angle, ruleset, and whether travel may leave firing areas (`allowOutsideTravel`). Per-target procedures (allowed areas, "engage after") come from the same settings through `snapshotFromPlan`.

## Conventions

- Geometry in inches; stage plane origin top-left, +X right, +Y down the screen, headings in degrees (0 = +X, 90 = +Y).
- Downrange comes from the route's safe direction when set, else from the stage (`stageDownrange()`), default 270° (up the screen). When the two differ by more than 1° the plan warns and uses the route setting.
- A shooting position must be **strictly inside** a firing area (boundary counts as outside). This is deliberately stricter than USPSA 2.2.1.2, where fault lines count as inside the shooting area, so a planned stop never sits on a line.
- Engagements are from stops unless engaging on the move is turned on (see below).

## Pipeline

| Step | Module | What it does |
| --- | --- | --- |
| 1. Normalize | `normalizeStage.ts` | Validates geometry, start, firing areas, procedures; extracts targets, no-shoots, walls (with bounding boxes), downrange. Invalid input returns `invalid-input` with reasons. |
| 2. Travel graph | `travelGraph.ts` | Visibility graph over the corners of walls (and target stands) inflated by the body clearance, with exact all-pairs shortest paths between corners (Floyd–Warshall); point-to-point distance is the direct segment when clear, else the best corner chain. Travel may cross fault lines by default; with `travel: 'within-areas'` the firing areas' corners (stepped 0.5 in inside) and small offsets around every area vertex and every crossing of two areas' edges are nodes too, so walks can turn the inside corner of an L-shaped area, whether it is drawn as one polygon or as two boxes. A start inside the body clearance is walked from the nearest clear point within clearance + 2 in, reached without passing through a wall (warned); a start inside a wall is invalid input. |
| 3. Candidates | `candidatePositions.ts` | Samples each firing area on a grid (default 12 in), plus inset vertices and the point in each area nearest each target; keeps points that are strictly inside, inside the stage and clear of walls/target stands by the body clearance. Bounded (default 1500; the grid coarsens evenly beyond that and the plan says so). |
| 4. Coverage | `coverage.ts` | For each candidate and target: allowed area (per-target procedure; IDPA requires one), safe angle to **every sampled point of the target face** (edges plus five interior samples), and line of sight to at least one interior face sample past walls, ports, other target faces and no-shoots according to the ruleset policy. Sight lines stop 0.01 in short of the face, so a face mounted flush on a wall is not blocked by that wall. Records visible fraction, safe-angle margin and assumption flags. |
| 5. Optimize | `optimizeRoute.ts` | (a) Exact minimum number of positions by set cover over distinct coverage sets (ignoring order, so a lower bound). (b) Shortest walk with that many stops by branch and bound over a bounded pool of representative points per coverage set; with "engage after" procedures a target counts only once everything it must follow is engaged, a stop may be revisited, and the search adds one stop at a time until a walk exists. (c) Each target is engaged at the first stop where it and its prerequisites can be; engagements at a stop are ordered left to right across downrange (IDPA: near to far), then by procedure. (d) Refinement slides stops below grid resolution only while every engagement keeps its quality (see below). |
| 6. Report | `routePlanner.ts` | Status, positions, per-leg paths, per-target status and reasons, safety report, assumptions, diagnostics (including whether the result is provably minimal and whether a search stopped early). |

`adopt.ts` turns a plan into an ordinary editable route; detours around walls become bends, so the existing evaluator and engagement analysis follow the same path.

## Statuses

| Status | Meaning |
| --- | --- |
| `complete` | Every target is assigned to a legal position on a traversable route, in procedure order. |
| `partial` | Some targets cannot be engaged from any legal position, or not in the required order; the rest are planned. Each uncovered target lists reasons. |
| `infeasible` | No target can be engaged legally (or in the required order), or no legal position is reachable from the start. |
| `no-targets` | The stage has no scoring targets. |
| `invalid-input` | Missing start, firing areas, or damaged geometry. |

Reason codes per target: `NO_ALLOWED_AREA`, `IDPA_AREAS_REQUIRED` (IDPA target without an assigned position of cover), `STEEL_TOO_CLOSE` (steel only from closer than the ruleset minimum), `OUTSIDE_SAFE_ANGLE`, `OCCLUDED`, `UNREACHABLE`, `PROCEDURE_ORDER` (its "engage after" procedure cannot be met: a cycle, a missing target, or a prerequisite that cannot be engaged).

## One legality rule for the app

`checkEngagement` in `coverage.ts` is the single legality check. The planner uses it for candidates, and the manual engagement analysis (`analyzeEngagements` in `planning/engagements.ts`) uses it for stationary and moving engagements, built from the route's own rules. Moving windows are found exactly by splitting each leg at every event line: firing-area edges, safe-angle lines through every sampled face point, and sight lines from each interior face sample past every occluder corner (wall and port edges, other target faces and no-shoots). Because visibility is sampled at five points across the face, an opening narrower than the gap between samples can show as several short windows instead of one.

With outside travel turned off, the analysis treats walking along an area's edge as inside the area (the planner's travel rule); only shooting positions use the strict rule.

In a saved order, a stationary target that cannot be engaged at its waypoint is skipped with a warning; the targets after it are still checked. (Saved moving orders are still authoritative: an infeasible moving order stops there, as before.)

## Engaging on the move

With `moving: true` (the plan panel's ON THE MOVE, available when Route settings allow moving engagement; not for IDPA, whose cover rules are not modelled), after the standing plan is found:

1. **Stops are dropped** when every target a stop covered, plus anything already engaged on the move on its neighbouring legs, can be engaged from the walking path that replaces it. Each target needs at least `minMovingWindowInches` (default 36 in) of walking where it is legal by the same check as standing shots (firing area, steel distance, safe angle across the face, line of sight). Targets are placed one after another along the leg; "engage after" is kept and "stationary required" targets are never moved. The last stop is kept. The stop whose removal shortens the walk most goes first; this repeats until none can go.
2. **Approach** (`approachInches` on standing engagements): how far before each remaining stop its target is already legal on the walk in, when that is at least the same threshold.

Moving engagements are reported per position (`movingEngagements`, in order, with their stretch along `legs[i]`), adopted as ordinary moving engagements on the waypoint, and checked by the same engagement analysis. The fewest-positions proof applies to the standing plan (`diagnostics.movingStopsRemoved`, and `exactPositions` is false when stops were dropped). Shooting time and accuracy on the move are not checked; the threshold is geometric.

## Refinement

After the search, each stop may slide toward its neighbours to shorten the walk, only while, for every target engaged there:

- it stays legal and its safe-angle margin does not drop below the smaller of its original margin and the near-limit threshold (default 10°);
- its visible fraction does not drop, and no new low-wall, no-shoot or plan-view-height flag appears;
- the stop stays at least `AREA_MARGIN_INCHES` (3 in) inside its firing area, or no closer to the edge than it already was.

Refinement only ever shortens the walk (`diagnostics.refinedInches`); `refine: false` turns it off.

## Rule grounding

Sources reviewed 2026-10-22; see `docs/target-preset-sources.md` for target data.

| Topic | Rule | V2 behaviour |
| --- | --- | --- |
| 180° (USPSA) | Muzzle past 90° from the median intercept of the backstop is unsafe, at all times ([USPSA 10.5.2](https://rules.uspsa.org/uspsa/section/10.5)) | Every engagement direction (all face samples) must lie within ±90° of downrange (configurable half angle). Margins under 10° are flagged. |
| 180° (IDPA) | 180° plane through the shooter, perpendicular to the bay; stages may use muzzle safe points or exclusion zones (IDPA 2026 §2.9.1) | Same plane check. Safe points and exclusion zones are **not modelled** and are reported as not checked. |
| 180° (PCSL) | 180 plane perpendicular to the bay; briefing may set another angle ([PCSL 15.4](https://rules.pcsleague.com/rulebook/15-match-disqualifications.html)) | Same check; the half angle is configurable for briefing-specific angles. |
| Shooting areas | Firing while touching outside is a procedural; moving outside without firing is not penalized ([USPSA 10.2.1.1](https://rules.uspsa.org/uspsa/section/10.2)) | Stops must be inside firing areas; travel may cross fault lines unless `travel: 'within-areas'`. |
| Hard cover | Walls are impenetrable. USPSA: barriers 69 in or taller extend to infinity, shorter ones only to their built height unless marked ([USPSA 2.2.3.2](https://rules.uspsa.org/uspsa/section/2.2)). PCSL: walls 69 in or taller extend to infinity ([PCSL 9.1.1](https://rules.pcsleague.com/rulebook/09-stage-design.html)); the rule text says nothing about shorter walls. IDPA simulated walls extend infinitely (§4.7.2) | Walls block line of sight. Under USPSA/PCSL a wall lower than 69 in blocks only when the target face is entirely below the wall top; seeing over it is recorded as an assumption. For PCSL that built-height reading is borrowed from USPSA. |
| No-shoots / overlapping targets | USPSA scoring areas of targets and no-shoots are impenetrable (9.1.5); IDPA non-threats are not hard cover (4.9); PCSL scores visible portions of same-plane paper (11.5.3), and shots through paper into a different plane score normally (11.5.4) | Default policy: USPSA treats other target faces and no-shoots as occluders (the rule). PCSL uses the same policy as a conservative planning choice, not a PCSL rule. IDPA does not occlude but flags shots that pass a non-threat. |
| Steel distance | Firing at steel from closer than 23 ft (276 in) is a DQ, measured from the face to the nearest part of the body on the ground (USPSA 10.5.16); PCSL pistol minimum 7 yd (252 in, 1.8.1); IDPA steel closer than 10 yd (360 in) is a DQ (2.14) | Steel is engaged only from stops (and moving-window points) at least that far from the face, allowing 6 in from the stop to the feet. Otherwise the target is reported with `STEEL_TOO_CLOSE`. |
| Ports | Openings in walls | A line of sight passes a wall only through a single port's horizontal span. Port height is not checked (plan view). |
| Stage procedures | Per-target firing areas and engagement order come from the stage brief | Allowed areas restrict stops; "engage after" is enforced across and within stops, or the target is reported with `PROCEDURE_ORDER`. |
| IDPA positions of cover | Targets are engaged from the positions of cover the brief defines | Each IDPA target needs at least one assigned area (`IDPA_AREAS_REQUIRED` otherwise), the same rule as the manual analysis. |

## What V2 does not check (always reported)

- Muzzle direction while moving, reloading or drawing (the draw/holster exceptions are shooter technique, not geometry).
- Vertical angles, shots over berms, elevation of ports and targets relative to the shooter's eyes.
- IDPA cover use, tactical priority and fault lines per position of cover. The planner's near-to-far order is only an approximation: IDPA 2026 §3.2.1.2–3.2.1.5 puts targets in the open before targets seen from cover, applies near-to-far only to targets visible at the same time (within 2 yd counts as equal), and from vertical cover engages targets as they appear around its edge.
- Stage-specific muzzle safe points, exclusion zones, activators, swingers, movers and disappearing targets.
- Round-count limits per position (USPSA 1.2.1 is a course-design rule).

Also recorded as assumptions when they apply: seeing over a wall lower than 69 in, and sight lines that cross another target or no-shoot in plan view but pass above or below it according to the face heights in the stage model.

## Optimality claims

`diagnostics.exactPositions` is true when the minimum number of positions is proven **among the sampled candidates**: by the set-cover search without procedures, and with "engage after" procedures by finishing the walk search for every smaller stop count. `diagnostics.exactDistance` is true when, in addition, the distance search finished without reducing the candidate pool or thinning candidates; it describes the walk before refinement, which only shortens it. Each is false when the search that would prove it stopped at a budget or the time limit (`diagnostics.stoppedBy` records that some phase stopped early); the plan is then the best found, and the UI says so. For example, `exactPositions` can be true with `stoppedBy: 'time'` when the set cover finished but the walk search did not. When the walk search finds nothing in time, a greedy walk is used (it always finishes and yields like the rest). The clock is checked inside the expensive steps too, so a phase ends within a few tens of milliseconds of its limit in Node. Sampling (grid spacing) bounds how close to the continuous optimum the result can be.

Measured in Node on a development machine (phones are slower; part of the hardware checklist): typical stages of 12–32 targets plan in 0.7–2 s with the minimum proven. A 40-target, 40-wall stage on a 50 × 33 yd bay spends about 1 s before the search and stops at the 3 s search limit, with the event loop never blocked for more than about 0.15 s.

## Testing

`mobile/tests/routePlannerV2.test.cjs`: brute-force optimality on small stages, 180° margins including face extremes, occlusion by tall and low walls, ports, other targets and no-shoots per ruleset, unreachable areas, procedures, determinism, adoption cross-checked against the existing engagement analysis, and a performance bound.

`mobile/tests/plannerV2Review.test.cjs` (review fixes): route settings reach the planner; "engage after" within and across stops, including a return visit with the minimum proven; impossible procedures reported; the precedence-aware search against brute force; IDPA positions of cover; planner and analysis agreement on 30 random stages; saved-order skipping; refinement never loosening a margin (random stages, compared with `refine: false`); slicing, time limit and prompt cancel on a 40-target, 40-wall stage; L-shaped areas; flush-mounted targets; the plan-view height assumption; a start inside the clearance; and assistant explanations along bends. Each of these tests fails against the code before the fixes, except the brute-force check of the new precedence search.

## Review fixes (2026-10-22)

An independent review of the first version found, and planner 2.1.0 fixes:

1. Route settings (safe direction, half angle, travel limit, ruleset) and "engage after" procedures were ignored, so a plan could be called complete while breaking them.
2. The manual engagement analysis used a different legality rule (target centre only, full-height walls, no target or no-shoot occlusion), so it disagreed with V2 on 37 of 78 random adopted plans; a saved stationary order also dropped every target after the first illegal one.
3. Refinement pushed stops to the legal limit (safe-angle margins near 0°, stops 0.01 in from the fault line).
4. The async planner did not yield inside the searches or the graph build: a 40-target, 40-wall stage froze the screen for about 21 s and Cancel waited for it.
5. With travel limited to firing areas, walks could not turn the inside corner of an L-shaped area.

Minor: a face flush on a wall was reported hidden by it; plan-view crossings at a different height were not flagged; the assistant explained legs as straight lines; a start within the body clearance of a wall was rejected.

A second independent review of those fixes (commit 83989f5) confirmed the core changes against brute force and about 370 fuzzed stages, and found, now fixed: a start inside a thin wall was nudged through it and called complete; with outside travel off, the planner and the analysis disagreed on whether walking on an area's edge is allowed; a search phase could overrun its time limit by about 0.9 s (the clock was not read inside expensive steps); an L-shaped area drawn as two boxes was walked the long way round. It also prompted an event line for a walk crossing another target's face line in the moving-window analysis, and a shorter sight-line trim (0.01 in).
