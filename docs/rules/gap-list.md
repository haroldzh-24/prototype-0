# What PSP still needs — prioritized gap list (2026-10-25)

From the rulebook research in this folder, the 2026-10-22 audit, and the product priorities in `AGENTS.md` (reliable stage planning, Route Planner V2, hit-level training data, AI that only explains computed facts). Effort: S = hours, M = a day or two, L = several days. "Native" means it needs a new EAS build.

## Done in RC2 batch 7

| Item | Rules | Where |
| --- | --- | --- |
| Steel is never planned from too close (planner and moving windows) | USPSA 10.5.16 (23 ft), PCSL 1.8.1 (7 yd pistol), IDPA 2.14 (10 yd) | `planning/v2/coverage.ts`, `planning/engagements.ts` |
| Drill scoring with real penalties: required hits, best hits, misses as missing required hits, no-shoot and non-threat hits, procedurals, hit factor, IDPA final time | USPSA 9.4, 9.5; PCSL 11.2–11.3; IDPA 4.11, 4.12, 5.1 | `training/drillLog.ts` |
| Stage check in the editor: round count and USPSA course type, steel distance from firing areas, USPSA freestyle limits on long courses, PCSL 50 yd limit, IDPA 18-round strings, non-threat ratio, steel share, target distance | USPSA 1.1.5, 1.2.1, 2.1.3; PCSL 10.9.1; IDPA 6.5.3–6.5.15 | `rules/stageCheck.ts` |
| Doc corrections: IDPA preset sizes are vendor-sourced; PCSL occlusion is a planning choice; PCSL is silent on walls under 69 in | — | `docs/target-preset-sources.md`, `docs/route-planner-v2.md` |

## Next (needs your go-ahead: big)

| # | Item | Why | Effort |
| --- | --- | --- | --- |
| 1 | **UI redesign** to the approved outdoor high-contrast mockups | Readable in sun, glove-sized controls, clearer status | L |
| 2 | **3D stage view and editing** (orbit, select, move on the ground, height and rotation), sharing one document and undo history with the 2D plan | Requested; stage walk-through before match day | L, native (`expo-gl`) |
| 3 | **Eye-level view** from start and each planned position, with what is visible and what is assumed | Matches how shooters break down a stage | M, with item 2 |

## Then (rules the planner should model)

| # | Item | Rules | Effort |
| --- | --- | --- | --- |
| 4 | **IDPA tactical priority** in place of near-to-far: open before cover, near-to-far only for targets visible together (2 yd counts as equal), slicing the pie around vertical cover | IDPA 3.2.1.2–3.2.1.5 | M |
| 5 | **IDPA positions of cover** as objects with their single fault line; exposure to unengaged targets along the route; reload only when not exposed | IDPA 3.5, 3.6.4, 3.6.7 | L |
| 6 | **Wall properties**: soft cover, "treat as infinite" for walls under 69 in, mesh | USPSA 2.2.3.2, 4.1.4.2, 9.1.6; PCSL 9.1.1 | S |
| 7 | **Off-limits lines** as an object (crossing zeroes the stage; at least 24 in from fault lines); rear fault lines extend to infinity | USPSA 2.2.1.3, 2.2.1.5 | M |
| 8 | **Fault lines drawn on the stage become firing areas** (today areas are typed in Route settings) | Audit finding | M |
| 9 | **8 hits per location or view** check, using the planner's visibility | USPSA 1.2.1.1–1.2.1.3 | M |
| 10 | **Required hits per target** in the stage (default 2 paper, 1 steel; brief may change) feeding round counts and the planner | USPSA 9.5.1, PCSL 11.3.1 | S |
| 11 | **Match level** (I/II/III) on the match, so level-dependent rules (plates, freestyle, round limits) apply | USPSA 1.1.5.1, 1.2.1.3, 4.3.1.4 | S |
| 12 | **Activated, moving and disappearing targets** (activator links, disappearing rules) | USPSA 9.9; IDPA 3.2.3 | L |
| 13 | **Muzzle safe points, exclusion zones, disallowed actions** recorded per stage and shown as not checked or checked | IDPA 2.9.1; PCSL 7.12 | M |
| 14 | **Minimum visible A-zone** for hidden targets (needs zone geometry, which exists only as drawings) | USPSA 4.2.5, App. B1 | blocked on verified zone data |

## Later

| # | Item | Notes |
| --- | --- | --- |
| 15 | Divisions and power factor on the shooter profile (USPSA Major/Minor feeds scoring) | Drill logger already takes Major/Minor per run |
| 16 | Stage brief (WSB) export with the required fields | USPSA 3.2.1, PCSL 7.1, IDPA stage description |
| 17 | Editor performance on large stages (the whole document is serialized on every render) | Unmeasured; check on a phone first |
| 18 | Expo SDK 58 upgrade (fixes the moderate deep-link advisory) | After TestFlight is stable |
