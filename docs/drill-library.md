# Drill library (roadmap C1, C2) — 2026-10-26

Short drills, one shot-timer run each, that measure the numbers the planner needs. Code: `mobile/src/training/drillLibrary.ts` (drills, runs, scoring, measurements), `libraryStats.ts` (Your numbers), `mobile/src/profile/movementModel.ts` (move timing), screens `LibraryRunEditor.tsx` and `YourNumbers.tsx`.

## Logging a run

Training → open a session → **LOG LIBRARY DRILL** → pick a drill → set its options → enter the times → count hits → **SAVE RUN**.

- **Times.** SHOT TIMES: the times your timer lists, from the buzzer (`1.42 1.68 3.40 3.62`). SPLITS: the timer's splits, the first being buzzer to first shot. TOTAL ONLY: a total gives the hit factor and the trend, but no draw, split or move times. The run must have exactly the drill's number of shots (steel: five or more; extra shots are makeups).
- **What each time measured** is shown as you type (`Shot 3 · Move 1.72 s`).
- **Hits** are counted by zone with − / + (USPSA: A, C, D, M, NS; PCSL adds T) and scored with the drill logger's rules: best hits up to the required count, −10 per missing hit, no-shoot hit and procedural; USPSA minor A 5 / C 3 / D 1, major A 5 / C 4 / D 2 (Appendix B1); PCSL T counts as two A hits (11.3.2.1). Counts are for the whole run, so scoring assumes the drill's shots per target were fired; on a PCSL drill with several targets, T hits make the score an estimate (PCSL caps points per target), shown as ≈. More hits and misses than shots is refused. Leave all at zero to log times only. Dry-fire sessions don't count hits.
- **Par time** per drill variant (same drill and options), optional; shown against the run and on the trend. The field shows the saved par; it changes only when you type in it.
- **PROFILE: COUNTS / LOG ONLY.** LOG ONLY keeps the run out of your profile and Your numbers (a warm-up, a bad setup); it still shows in the session and its trend.
- Runs are listed in the session; **REMOVE** (with a confirm) deletes one and withdraws its measurements.

## The drills

| Drill | Shots: what each time is | Options | Measures |
| --- | --- | --- | --- |
| Draw to first hit | start | start position (hands at sides, surrender, low ready, high ready); 5/7/10 yd | draw time by start; first-shot A rate |
| Bill Drill | start, 5 splits | 5/7/10 yd | draw (hands at sides), close split, points |
| Distance ladder | start, split | 5/10/15/20/25 yd (one run per distance) | split and points by distance |
| Blake Drill | start, split, transition, split, transition, split | — (3 targets 1 yd apart, 7 yd) | split, transition 1 yd apart |
| Wide transitions | start, split, transition, split | 1/3/5 yd apart; 7/10/15 yd | transition by spread |
| Reload | start, reload | standing / stepping | shot-to-shot reload |
| Sprint | start, split, move, split | run 5/10/15 yd; forward / sideways / back | move time per direction and distance |
| Shuffle | start, split, move, split | step 1/2/3 yd; direction | short move time |
| Shoot on the move | start, split, transition, split | toward / across / standing; 5/7/10 yd | split and points moving vs standing |
| Steel | start, 4 plate-to-plate (+ makeups) | 10/15/20/25 yd | time per plate (clean runs), miss rate |
| Port / lean | start, split, transition, split | square / low port / hard lean; 7/10/15 yd | extra time vs square at the same distance |
| Hostage / partial | start, split | head only / diagonal / full; 7/15 yd | split and points on partial faces |
| El Presidente | turn-start, 2 each on 3 targets, reload, 2 each | — (10 yd) | hit factor; your parts added up vs the real string |

Setups and distances are the drills' usual forms (docs/roadmap.md); they are training setups, not rulebook dimensions. Not in yet: near-to-far pairs in Wide transitions (both targets are at one distance).

## From runs to the profile

- Each counted run gives **one measurement per factor** (the run's mean), so sample counts are runs, not shots. Ids are `lib:<session>:<run>:<n>`.
- The session's library runs are the source of truth: every save **re-derives** them in the same database transaction as the session (editing, LOG ONLY, removing a run and deleting the session all update the profile). Video measurements of the same session are untouched.
- Measurements carry the session's context (dry fire, live fire, match). The planner uses the profile's calibration context (live fire unless changed).
- **General numbers vs conditions.** The profile's draw, split (and the split-by-distance curve), transition and reload use only: draws from the holster with hands relaxed; splits and transitions standing square on full paper; standing reloads. Moving, steel, partial-target, port/lean, surrender/ready-start and stepping-reload measurements are stored and shown in Your numbers, but never pull the general values (`generalSample`, `mobile/src/training/observations.ts`).
- Draw comes only from the Draw and Bill drills (other drills' first shot includes things that aren't a draw at 7 yd).

## Move timing (C1)

A move is timed from the last shot before it to the first shot after it, so it includes starting, stopping and settling. From sprint and shuffle runs the app fits **time = start-and-stop + distance ÷ speed**:

- per direction (forward = toward downrange within 45°, back = away, otherwise sideways) when that direction has runs at two or more distances;
- otherwise the direction uses the start-and-stop fitted over all directions with its own speed, or, with runs at a single distance only, its average speed (the app says so and asks for another distance).
- Below the shortest measured move the time scales down to zero (a lean costs less than a full step); past the longest it follows the line, and ANALYZE warns that the leg is longer than your longest measured move. A leg in a direction you haven't measured uses the fit across all directions, with a warning.
- A leg that bends around a wall is timed as the direction it covers the most ground in.
- A typed-in movement speed (manual override) wins over the fit.

Route timing (**ANALYZE**) now times each leg with the fit for its direction to downrange; without sprint/shuffle data it keeps using the average speed, computed exactly as before. Older planners that rank candidates by estimated time use it too. AUTO-PLAN (Route Planner V2) still chooses routes by distance; time-based planning is C4.

## Your numbers

Training → **YOUR NUMBERS**, by context: what the planner uses (with "measured, n samples", "typed in" or "generic default"), then draw by start, splits and accuracy (A/C/D/miss shares of required hits) by distance, transitions by spread (with the cost per extra yard once two spreads are logged), reloads, move fits and times, shooting on the move, steel, ports and leans, partial targets, El Presidente, and a trend per drill variant against its par. Every value shows its run count; sample SD is shown from two runs. El Presidente's "parts add up" uses your other drills only (10 yd splits, transitions 1 yd apart, standing reloads), never the El Presidente runs themselves. Steel misses show only for runs whose misses are known (not dry fire). It opens on the context the planner uses.

## Not used by the planner yet

Accuracy by distance, partial-target and steel numbers feed C3 (expected AA/AC/CC per target); transitions by spread, draw by start position, on-the-move and port/lean costs feed C4 (stage time and hit factor). Until then they are shown, not used.
