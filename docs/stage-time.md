# Stage time from your numbers (roadmap C4) — 2026-10-26

Code: `mobile/src/planning/stageTime.ts` (estimate), `mobile/src/profile/engagementModel.ts` (transition fit, partial-target and steel curves), `mobile/src/planning/reloadPlan.ts` (reloads), shown in **ANALYZE** → TIMING.

## What goes in

| Part | From | Falls back to |
| --- | --- | --- |
| Moves | Your move fit per direction to downrange (C1, `docs/drill-library.md`), timed last shot to first shot, so the first shot at each position is inside the move | The profile's average speed |
| Draw | The profile's draw (Draw and Bill drills, hands at sides) | Generic 1.5 s |
| Splits | Your split curve at the target's distance (distance ladder, Bill and the other paper drills); a partly covered target uses your Hostage / partial curve. Within ½ yd of your closest or farthest logged distance counts as that distance (all curves); no extrapolation beyond | The profile's single split value (measured, typed in, or the generic default — ANALYZE says which) |
| Transitions | Your swing fit: time = base + per-degree × the angle between consecutive targets seen from the position (Blake, Wide transitions, El Presidente). With runs at one swing size only, or when wider swings were not slower in your runs, one average time for every swing (said in ANALYZE and Your numbers). Swings wider or narrower than any you logged (by more than 5°) are flagged. Into a steel target: your time per plate at that distance (Steel drill, clean runs) | The profile's single transition value (ANALYZE says how it is backed) |
| Steel makeups | Your steel miss rate at that distance (or the miss risk planned for that plate) × a split at that distance; outside your logged steel distances the nearest one, and ANALYZE says so | None |
| Reloads | The route's reloads: reload time not hidden by the incoming move | — |

The total is moves + draw + splits + transitions + steel makeups + reloads. Each target counts once, where the route first engages it (as in the evaluator). ANALYZE lists where each part came from ("your split curve for 5 targets", "2 transitions use the generic transition (0.40 s, not measured)", …) and the time by position, with the draw as its own row. Moves timed by your average speed (no sprint/shuffle runs) leave out the time to settle and fire the first shot after a move, and ANALYZE says so.

A typed-in split replaces the split curve and the partial-target splits; a typed-in transition replaces the swing fit. Steel time per plate is its own measurement and stays.

Video comparisons keep the route evaluator's simpler per-position plan times (average split and transition), so they can differ from ANALYZE's time by position.

The route evaluator used by video comparisons and the older optimizer is unchanged, so stored comparisons still re-check. The stage hit factor in ANALYZE (`docs/expected-points.md`) now divides by this estimate.

## Reloads around magazine capacity

**PLAN RELOADS** (ANALYZE, shown when a position would run dry) keeps the reloads already on the route and searches every way to add more — any position, any unused magazine — with the evaluator's ammunition rules over the whole route (an exact search over rounds left, the chambered round and the spare magazines). Of the plans that carry every position it takes the one with the least reload time not hidden by the incoming move, then the fewest reloads, then the latest ones (fewer rounds dropped). Added reloads are "on the move" into their position. Positions shot on the move never get one (it would cancel the moving engagement). Only a complete plan is applied; otherwise ANALYZE says what is missing: no magazines, no spare, a position needing more than your fullest magazine plus a chambered round, or spares too small for the stage.

## Not modelled yet

Shooting on the move (not timed); ports and leans (the Port / lean drill's extra time is shown in Your numbers but not added); start positions other than hands at sides; first-shot time after a turn; how depth changes and high/low targets affect transitions (the swing angle on the ground only).
