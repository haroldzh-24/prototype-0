# Route Planner V2 — design

Status: implemented 2026-10-22 in `mobile/src/planning/v2/`, alongside the existing movement optimizer (`routeSolver/`), which stays until V2 is verified on devices.

## Goal

Given a stage, produce **one** efficient, explainable plan that:

1. engages every required target from a legal shooting position,
2. uses the **fewest shooting positions**, then the **shortest movement**,
3. reports precisely which targets cannot be covered and why, and
4. never claims more about safety or rule compliance than it actually checked.

Entry point: `planRoute(stageSnapshot, options) → RoutePlan` (deterministic: same input, same output).

## Conventions

- Geometry in inches; stage plane origin top-left, +X right, +Y down the screen, headings in degrees (0 = +X, 90 = +Y).
- Downrange comes from the stage (`stageDownrange()`), default 270° (up the screen).
- A shooting position must be **strictly inside** a firing area (boundary counts as outside). This is deliberately stricter than USPSA 2.2.1.2, where fault lines count as inside the shooting area, so a planned stop never sits on a line.
- All engagements are from stops. Shooting on the move is not planned by V2 (the manual ENGAGE tools still support it).

## Pipeline

| Step | Module | What it does |
| --- | --- | --- |
| 1. Normalize | `normalizeStage.ts` | Validates geometry, start, firing areas, procedures; extracts targets, no-shoots, walls, downrange. Invalid input returns `invalid-input` with reasons. |
| 2. Candidates | `candidatePositions.ts` | Samples each firing area on a grid (default 12 in), plus inset vertices and the point in each area nearest each target; keeps points that are strictly inside, inside the stage and clear of walls/target stands by the body clearance. Bounded (default 600). |
| 3. Coverage | `coverage.ts` | For each candidate and target: allowed area (per-target procedure), safe angle to **every sampled point of the target face** (not just its centre), and line of sight to at least one face sample through walls, ports, other target faces and no-shoots according to the ruleset policy. Records visible fraction and safe-angle margin. |
| 4. Travel graph | `travelGraph.ts` | Visibility graph over walls (and target stands) inflated by the body clearance; Dijkstra shortest paths between candidates; travel may cross fault lines by default. |
| 5. Optimize | `optimizeRoute.ts` | (a) Exact minimum number of positions by set cover over distinct coverage sets. (b) Shortest travel among covers of that size by branch and bound over a bounded pool of representative points per coverage set. (c) Each target is assigned to the first position on the route that can engage it; engagements at a stop are ordered left to right across downrange (IDPA: near to far). |
| 6. Report | `routePlanner.ts` | Status, positions, per-leg paths, per-target status and reasons, safety report, assumptions, diagnostics (including whether the result is provably minimal). |

`adopt.ts` turns a plan into an ordinary editable route; detours around walls become bends, so the existing evaluator and engagement analysis follow the same path.

## Statuses

| Status | Meaning |
| --- | --- |
| `complete` | Every target is assigned to a legal position on a traversable route. |
| `partial` | Some targets cannot be engaged from any legal position; the rest are planned. Each uncovered target lists reasons. |
| `infeasible` | No target can be engaged legally, or no legal position is reachable from the start. |
| `no-targets` | The stage has no scoring targets. |
| `invalid-input` | Missing start, firing areas, or damaged geometry. |

Reason codes per target: `NO_ALLOWED_AREA`, `OUTSIDE_SAFE_ANGLE`, `OCCLUDED`, `UNREACHABLE`.

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

## What V2 does not check (always reported)

- Muzzle direction while moving, reloading or drawing (the draw/holster exceptions are shooter technique, not geometry).
- Vertical angles, shots over berms, elevation of ports and targets relative to the shooter's eyes.
- IDPA cover use, tactical priority and fault lines per position of cover (near-to-far ordering is only an approximation).
- Stage-specific muzzle safe points, exclusion zones, activators, swingers, movers and disappearing targets.
- Round-count limits per position (USPSA 1.2.1 is a course-design rule).

## Optimality claims

`diagnostics.exactPositions` is true when the set-cover search finished: no plan with fewer positions exists **among the sampled candidates**. `diagnostics.exactDistance` is true when the distance search finished without reducing the candidate pool. Both are false when a budget is hit; the plan is then the best found, and the UI says so. Sampling (grid spacing) bounds how close to the continuous optimum the result can be.

## Testing

`mobile/tests/routePlannerV2.test.cjs`: brute-force optimality on small stages, 180° margins including face extremes, occlusion by tall and low walls, ports, other targets and no-shoots per ruleset, unreachable areas, procedures, determinism, adoption cross-checked against the existing engagement analysis, and a performance bound.
