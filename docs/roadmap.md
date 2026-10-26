# Practical Shooting Partner — roadmap (2026-10-26)

**Goal.** The only app that plans a stage with *your* numbers, tells you which plan is fastest for you, and afterwards shows where you lost time against that plan. Scores (PractiScore), timers and drill apps already exist; none of the apps reviewed (Ballistic X, Mantis, Shooters Global) plans a stage, and nothing ties a plan to real performance. This matches the original goal: fastest suggested movement paths, planned reloads, and video that shows where to speed up.

**Who it's for.** Competitors who want to improve with evidence, not feel. They will not waste time on anything slow to enter or numbers they can't trust.

Status as of `b8eb65a` (913 tests passing). Nothing below has been used by a shooter on a phone at a match yet.

## 1. Foundation: before anyone relies on it

| # | Item | Today | Done when |
| --- | --- | --- | --- |
| 1 | **Phone build and real users** | Last 5 batches not on a phone; 3D needs the native build. Owner runs the EAS build. | Build installed; device checklist run; 3–5 local competitors use it for a week of matches and practice. |
| 2 | **Fast stage entry** (a walkthrough gives ~5 min per stage) | Radial menu done. Firing areas are typed as corner coordinates in yards. Fault lines don't limit the planner. Picture import is slow (~34 taps for a simple stage). | Firing areas drawn on the stage (tap corners, drag to adjust). Shooting area can come from fault lines and bay edges. "Trace over the picture": briefing photo under the editor, two-point scale, auto-filled objects you fix with the normal tools. A typical stage entered in under 5 minutes. |
| 3 | **One clear flow: BUILD → PLAN → WALK** | Route mode has three overlapping control sets (PATH/ENGAGE/REVIEW tabs, "No route yet" buttons, PLAN/OPTIMIZE/EDIT/ANALYZE/ASK bar). Movement optimizer duplicates PLAN. | One set of controls; OPTIMIZE folded into PLAN; old planner code retired. |

## 2. The differentiator

| # | Item | Today | Done when |
| --- | --- | --- | --- |
| 4 | **Plan by time, with reloads** | Route Planner V2 minimizes shooting positions, then walking distance. It plans no reloads. ANALYZE estimates a total time from profile defaults. | The planner estimates stage time from your draw, splits, transitions, movement speed and reloads; plans reloads around magazine capacity; shows 2–3 plans side by side ("Plan A 18.4 s · Plan B 17.6 s, hard lean on T5"). |
| 5 | **Your numbers** | Profile holds draw, reload, split, transition, movement speed, magazine capacity; defaults unless video analysis fills them. | Profile built from shot-timer splits and drill runs; expected points by distance and target size, so plans predict hit factor; every number shows how many samples it rests on. |
| 6 | **Close the loop after the match** | Video "execution comparison" exists but is heavy and unverified on a phone. | Enter stage time and hits (typed; later PractiScore) against the plan; see where time went vs the plan (movement, transitions, reloads); get "train this next". |

## 3. Training that feeds the loop

| # | Item | Today | Done when |
| --- | --- | --- | --- |
| 7 | **Drill library and charts** | Free-named sessions; tap-hit drill logging with rulebook scoring; trend is text lines; paper only. | Standard drills with par times; trend charts; drills suggested from your weakest numbers ("transitions past 10 yd cost you most"); steel drills. |

**Drills for the library** (each short, one timer run, and each pins down a number the planner needs):

| Drill | Setup | Gives | Planner use |
| --- | --- | --- | --- |
| Draw to first hit | 1 target, 7 yd, from each start position | Draw time per start; first-shot A rate | Stage start time by start position |
| Bill Drill | 6 shots, 1 target, 7 yd, from the holster | Close split; points dropped when pushing | Close-target split |
| Distance ladder | 2 shots at 5, 10, 15, 20, 25 yd | Split and points by distance | Time and expected points per engagement (hit factor) |
| Blake Drill | 3 targets ~1 yd apart, 2 each, 7 yd | Close transition | Tight arrays |
| Wide transitions | Targets 1, 3, 5 yd apart; near-to-far pairs | Transition vs spread and distance change | Transitions that depend on the array |
| Reload | 1 shot, reload, 1 shot; standing and stepping | Shot-to-shot reload, standing and moving | Where to reload; reloading on the move |
| Position-to-position | 2 shots, move 3/5/10 yd (forward, back, sideways), 2 shots | Last-to-first shot by distance | Movement speed plus fixed stop/start cost (the biggest gap today) |
| Shoot on the move | 2 per target walking toward/across, 5–10 yd | Split and points moving vs standing | Whether ON THE MOVE beats STANDING ONLY for you |
| Steel | 5 plates at 10–15 yd, then 20–25 yd | Steel split, miss rate | Steel engagements (misses cost makeup shots) |
| Port / lean | Same 2-target string through a low port or hard lean | Extra time vs standing square | Cost of awkward positions |
| El Presidente | Turn, draw, 2 each on 3 targets, reload, 2 each, 10 yd | Hit factor for a combined string | Check that the parts add up |

Record per run: total time, splits (typed or from a shot timer), hits by zone (already scored by rulebook), distance. Derived: hit factor, points per second, % of points, and the planner numbers, each with its sample count. Par times are set by the user (they differ by division and class). "What to improve" ranks skills by what they cost on your real stages, e.g. "transitions past 3 yd cost 2.1 s over your last 4 stages".
| 8 | **One-tap video** | Shot times from audio, body/hand tracking, comparison to plan: built, never run on a phone. | Import match video → shot times → compared with the plan, in a few taps; verified on a phone. |

## 4. Trust

| # | Item | Today | Done when |
| --- | --- | --- | --- |
| 9 | **Backup, export, sharing** | All data local on the phone. | Backup/restore (file or iCloud); share a stage with squadmates. |
| 10 | **Honest rules** | Stage check covers USPSA/PCSL/IDPA distance, round count and target rules; verified vs assumed is explicit. Scoring zones not drawn (no source gives positions). | More checks (PCSL Practical/Competition mixing, 9.2.2.1); scoring zones once a source gives positions; keep verified vs assumed explicit. |

## Parked

- **3D / EYE view:** keep, don't extend.
- **Ask (Route AI chat):** needs iPhone 15 Pro or newer on iOS 26 with Apple Intelligence; it edits routes, it doesn't plan. Keep, don't extend.
- **Automatic picture detector:** replace with trace-over (item 2).

## Order of work

1. Phone build (owner), firing areas drawn on the stage, route-screen cleanup. *(areas and BUILD → PLAN → WALK done 2026-10-26, batch 14; phone build, shooting areas from fault lines and trace-over still open)*
2. Time-based planning with reloads and side-by-side plans.
3. Your-numbers profile and the post-match comparison.
4. Drill library and charts.
5. Backup and sharing.

Needed from the owner: the phone build and device report; 3–5 real stage diagrams (briefing pages or screenshots) for trace-over; names of 3–5 testers.
