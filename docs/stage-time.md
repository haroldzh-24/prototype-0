# Stage time from your numbers (roadmap C4) — 2026-10-26

Code: `mobile/src/planning/stageTime.ts` (estimate), `mobile/src/profile/engagementModel.ts` (transition fit, partial-target and steel curves), `mobile/src/planning/reloadPlan.ts` (reloads), shown in **ANALYZE** → TIMING.

## What goes in

| Part | From | Falls back to |
| --- | --- | --- |
| Moves | Your move fit per direction to downrange (C1, `docs/drill-library.md`), timed last shot to first shot, so the first shot at each position is inside the move | The profile's average speed |
| Draw | The profile's draw (Draw and Bill drills, hands at sides) | Generic 1.5 s |
| Splits | Your split curve at the target's distance (distance ladder, Bill and the other paper drills); a partly covered target uses your Hostage / partial curve. Within ½ yd of your closest or farthest logged distance counts as that distance; no extrapolation beyond | The profile's single split value |
| Transitions | Your swing fit: time = base + per-degree × the angle between consecutive targets seen from the position (Blake, Wide transitions, El Presidente). Into a steel target: your time per plate at that distance (Steel drill, clean runs) | The profile's single transition value |
| Steel makeups | Your steel miss rate at that distance (or the miss risk planned for that plate) × a split at that distance | None |
| Reloads | The route's reloads: reload time not hidden by the incoming move | — |

The total is moves + draw + splits + transitions + steel makeups + reloads. ANALYZE lists where each part came from ("your split curve for 5 targets", "2 transitions use your single transition value", …) and the time by position.

The route evaluator used by video comparisons and the older optimizer is unchanged, so stored comparisons still re-check. The stage hit factor in ANALYZE (`docs/expected-points.md`) now divides by this estimate.

## Reloads around magazine capacity

**PLAN RELOADS** (ANALYZE, shown when a position would run dry) walks the route with the evaluator's ammunition rules. When a position would run dry it reloads, with the fullest unused magazine, on the leg since the last reload that hides the most reload time behind the move (on a tie, the later one, which wastes fewer rounds) and still carries you through that position. It never invents magazines: with none left, or when a single position needs more than a full magazine, it says so. Reloads are added as "on the move" into the chosen position; edit them in the route as before.

## Not modelled yet

Shooting on the move (not timed); ports and leans (the Port / lean drill's extra time is shown in Your numbers but not added); start positions other than hands at sides; first-shot time after a turn; how depth changes affect transitions (the swing angle only).
