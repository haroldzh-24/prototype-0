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
- All engagements are from stops. Shooting on the move is not planned by V2 (the manual ENGAGE tools still support it).

## Pipeline

| Step | Module | What it does |
| --- | --- | --- |
| 1. Normalize | `normalizeStage.ts` | Validates geometry, start, firing areas, procedures; extracts targets, no-shoots, walls (with bounding boxes), downrange. Invalid input returns `invalid-input` with reasons. |
| 2. Travel graph | `travelGraph.ts` | Visibility graph over the corners of walls (and target stands) inflated by the body clearance, with exact all-pairs shortest paths between corners (Floyd–Warshall); point-to-point distance is the direct segment when clear, else the best corner chain. Travel may cross fault lines by default; with `travel: 'within-areas'` the firing areas' own corners (stepped 0.5 in inside) are nodes too, so walks can turn the inside corner of an L-shaped area. A start inside the body clearance is walked from the nearest clear point within clearance + 2 in (warned). |
| 3. Candidates | `candidatePositions.ts` | Samples each firing area on a grid (default 12 in), plus inset vertices and the point in each area nearest each target; keeps points that are strictly inside, inside the stage and clear of walls/target stands by the body clearance. Bounded (default 1500; the grid coarsens evenly beyond that and the plan says so). |
| 4. Coverage | `coverage.ts` | For each candidate and target: allowed area (per-target procedure; IDPA requires one), safe angle to **every sampled point of the target face** (edges plus five interior samples), and line of sight to at least one interior face sample past walls, ports, other target faces and no-shoots according to the ruleset policy. Sight lines stop 0.1 in short of the face, so a face mounted flush on a wall is not blocked by that wall. Records visible fraction, safe-angle margin and assumption flags. |
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

Reason codes per target: `NO_ALLOWED_AREA`, `IDPA_AREAS_REQUIRED` (IDPA target without an assigned position of cover), `OUTSIDE_SAFE_ANGLE`, `OCCLUDED`, `UNREACHABLE`, `PROCEDURE_ORDER` (its "engage after" procedure cannot be met: a cycle, a missing target, or a prerequisite that cannot be engaged).

## One legality rule for the app

`checkEngagement` in `coverage.ts` is the single legality check. The planner uses it for candidates, and the manual engagement analysis (`analyzeEngagements` in `planning/engagements.ts`) uses it for stationary and moving engagements, built from the route's own rules. Moving windows are found exactly by splitting each leg at every event line: firing-area edges, safe-angle lines through every sampled face point, and sight lines from each interior face sample past every occluder corner (wall and port edges, other target faces and no-shoots). Because visibility is sampled at five points across the face, an opening narrower than the gap between samples can show as several short windows instead of one.

In a saved order, a stationary target that cannot be engaged at its waypoint is skipped with a warning; the targets after it are still checked. (Saved moving orders are still authoritative: an infeasible moving order stops there, as before.)

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
| Hard cover | Walls are impenetrable; USPSA/PCSL barriers 69 in or taller extend to infinity, shorter ones only to their height ([USPSA 2.2.3.2](https://rules.uspsa.org/uspsa/section/2.2), [PCSL 9.1.1](https://rules.pcsleague.com/rulebook/09-stage-design.html)); IDPA simulated walls extend infinitely (§4.7.2) | Walls block line of sight. Under USPSA/PCSL a wall lower than 69 in blocks only when the target face is entirely below the wall top; seeing over it is recorded as an assumption. |
| No-shoots / overlapping targets | USPSA scoring areas of targets and no-shoots are impenetrable (9.1.5); IDPA non-threats are not hard cover (4.9); PCSL scores visible portions of same-plane paper (11.5.3) | Default policy: USPSA/PCSL treat other target faces and no-shoots as occluders; IDPA does not occlude but flags shots that pass a non-threat. |
| Ports | Openings in walls | A line of sight passes a wall only through a single port's horizontal span. Port height is not checked (plan view). |
| Stage procedures | Per-target firing areas and engagement order come from the stage brief | Allowed areas restrict stops; "engage after" is enforced across and within stops, or the target is reported with `PROCEDURE_ORDER`. |
| IDPA positions of cover | Targets are engaged from the positions of cover the brief defines | Each IDPA target needs at least one assigned area (`IDPA_AREAS_REQUIRED` otherwise), the same rule as the manual analysis. |

## What V2 does not check (always reported)

- Muzzle direction while moving, reloading or drawing (the draw/holster exceptions are shooter technique, not geometry).
- Vertical angles, shots over berms, elevation of ports and targets relative to the shooter's eyes.
- IDPA cover use, tactical priority and fault lines per position of cover (near-to-far ordering is only an approximation).
- Stage-specific muzzle safe points, exclusion zones, activators, swingers, movers and disappearing targets.
- Round-count limits per position (USPSA 1.2.1 is a course-design rule).

Also recorded as assumptions when they apply: seeing over a wall lower than 69 in, and sight lines that cross another target or no-shoot in plan view but pass above or below it according to the face heights in the stage model.

## Optimality claims

`diagnostics.exactPositions` is true when the minimum number of positions is proven **among the sampled candidates**: by the set-cover search without procedures, and with "engage after" procedures by finishing the walk search for every smaller stop count. `diagnostics.exactDistance` is true when, in addition, the distance search finished without reducing the candidate pool or thinning candidates; it describes the walk before refinement, which only shortens it. Both are false when a budget or the time limit is hit (`diagnostics.stoppedBy`); the plan is then the best found, and the UI says so. Sampling (grid spacing) bounds how close to the continuous optimum the result can be.

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
