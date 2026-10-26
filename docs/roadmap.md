# Practical Shooting Partner — 1.0 plan (2026-10-26)

**Goal.** The only app that plans a stage with *your* numbers, tells you which plan is fastest for you, and afterwards shows where you lost time against that plan. Scores (PractiScore), timers and drill apps already exist; none of the apps reviewed (Ballistic X, Mantis, Shooters Global) plans a stage, and nothing ties a plan to real performance. This matches the original goal: fastest suggested movement paths, planned reloads, and video that shows where to speed up.

**Who it's for.** USPSA and PCSL competitors who want to improve with evidence, not feel. They will not waste time on anything slow to enter or numbers they can't trust.

**1.0 is done when** a shooter can, on their phone at a match: enter a stage from the match book in under 5 minutes; get 2–3 plans compared by expected time and hit factor using their own measured numbers; walk the plan at eye level; and after the match, enter their result and see where they lost time and what to train. Backed up, and tested by 3–5 local competitors.

Scope comes from the owner's ideas (2026-10-26, marked ★) and the earlier review. Done so far: radial add menu, target catalog, BUILD → PLAN → WALK, firing areas drawn on the stage (batches 12–14).

## Milestone A: the stage as it really is

| # | Item | Done when |
| --- | --- | --- |
| A1 ★ | **IDPA rules on hold, IDPA targets kept** | New matches offer USPSA and PCSL. Stage check, planner and drill scoring use no IDPA rules. IDPA targets stay in the add menu. Existing IDPA matches still open; the code is switched off, not deleted. |
| A2 ★ | **Targets on top of targets** | Tap a target → add a no-shoot (hostage), a second scoring target (doubles) or hard cover on top; slide up/down and sideways with snapping (1 in steps plus head, shoulder and centre stops), rotate, front/behind; the stack moves as one. Shown in 2D, 3D and EYE. The planner knows how much of each face is really shootable. |
| A3 ★ | **USPSA hard-cover presets** | The five painted versions (head only; diagonal open top-left; diagonal open top-right; centre strip; top open) as one-tap hard-cover layers on the USPSA Target, editable like any layer. Black is non-scoring and blocks. |
| A4 | **Rule checks for layers** | Coverage limits where the rulebook sets them (e.g. half-size targets keep half the lower A-zone visible, USPSA 4.2.1.1); PCSL Practical/Competition mixing (9.2.2.1). |
| A5 | **Drill logger web fix** | Tapped hits land where tapped in the web version. |

## Milestone B: fast stage entry

| # | Item | Done when |
| --- | --- | --- |
| B1 ★ | **Stage from a photo** (match book page, printout or screenshot from a stage-design program) | Pick photos from the album → the app finds and straightens the drawing, sets scale from the grid or labelled dimensions, reads labels and the briefing (round count, target counts), and drafts walls, fault lines, targets by type, no-shoots, steel and start. Briefing counts cross-check the draft ("8 targets in the briefing, 7 found"). |
| B2 | **Trace-over check screen** | The photo sits under the editor; you fix the draft with the normal tools. Replaces today's list-and-percent import screen. Needed whichever way B1 reads pictures. |
| B3 | **Shooting areas from fault lines** | One tap turns fault lines and bay edges into firing areas you can adjust. |

Decision deferred: on-phone reading vs a paid cloud vision service. Test both on 10–20 real match book photos, then choose (the cloud option needs internet, a small server and a rule change).

## Milestone C: plan by time and points

| # | Item | Done when |
| --- | --- | --- |
| C1 ★ | **Movement drills: sprint and shuffle** | Forward, sideways and backward, 1–3 yd (shuffle) and 5–15 yd (sprint); from last-shot-to-first-shot times the app fits top speed and fixed stop/start cost per movement type. |
| C2 | **Drill library** | The drills below, with timer-split entry, user-set par times, trend charts and sample counts on every number. |
| C3 ★ | **Expected hits per target: AA / AC / CC** (+ risk of a miss) | Advanced engagement settings: per target, defaulting from your distance-ladder numbers and how exposed the face is (A2/A3); override per target. Points by power factor (minor: 10/8/6, major: 10/9/8). |
| C4 | **Stage time and hit factor estimate** | Every leg timed with C1, transitions by spread, splits by distance and exposure, reloads planned around magazine capacity; stage HF = points ÷ time. |
| C5 | **2–3 plans side by side** | Compared by expected time and hit factor, with the trade-off spelled out ("hard lean at P2"). |
| C6 ★ | **Is slowing down worth it?** | Per target: time for AA vs accepting a C, against your stage hit factor ("T5: AA costs 0.35 s for +2 points; worth it while stage HF is under 5.7"). |

## Milestone D: close the loop and keep the data

| # | Item | Done when |
| --- | --- | --- |
| D1 | **Post-match result vs plan** | Enter stage time and hits; see where time went against the plan; get "train this next". |
| D2 | **Backup, export, sharing** | Backup and restore; share a stage with squadmates. |

## Milestone E: release 1.0

| # | Item | Done when |
| --- | --- | --- |
| E1 | **Phone build and device checklist** (owner runs the build) | Everything above checked on an iPhone. |
| E2 | **Testers** | 3–5 local competitors use it for a few matches; one round of fixes. |
| E3 | **Store readiness** | App icon, privacy details, screenshots, version 1.0.0; submission only with the owner's approval. |

## Drills for the library (C1, C2)

Each is short, one timer run, and pins down a number the planner needs.

| Drill | Setup | Gives | Planner use |
| --- | --- | --- | --- |
| Draw to first hit | 1 target, 7 yd, from each start position | Draw time per start; first-shot A rate | Stage start time by start position |
| Bill Drill | 6 shots, 1 target, 7 yd, from the holster | Close split; points dropped when pushing | Close-target split |
| Distance ladder | 2 shots at 5, 10, 15, 20, 25 yd | Split and points by distance | Expected AA/AC/CC and time per engagement |
| Blake Drill | 3 targets ~1 yd apart, 2 each, 7 yd | Close transition | Tight arrays |
| Wide transitions | Targets 1, 3, 5 yd apart; near-to-far pairs | Transition vs spread and distance change | Transitions that depend on the array |
| Reload | 1 shot, reload, 1 shot; standing and stepping | Shot-to-shot reload, standing and moving | Where to reload; reloading on the move |
| Sprint ★ | 2 shots, run 5/10/15 yd (forward, sideways, back), 2 shots | Top speed and fixed cost per direction | Long moves |
| Shuffle ★ | 2 shots, step 1–3 yd (sideways, forward, back), 2 shots | Short-move time | Short repositioning, stepping past walls |
| Shoot on the move | 2 per target walking toward/across, 5–10 yd | Split and points moving vs standing | Whether ON THE MOVE beats STANDING ONLY for you |
| Steel | 5 plates at 10–15 yd, then 20–25 yd | Steel split, miss rate | Steel engagements (misses cost makeup shots) |
| Port / lean | Same 2-target string through a low port or hard lean | Extra time vs standing square | Cost of awkward positions |
| Hostage / partial | 2 shots on a head-only or diagonal hard-cover target at 7 and 15 yd | Split and points on partial faces | Exposure-adjusted expected hits (A2, A3) |
| El Presidente | Turn, draw, 2 each on 3 targets, reload, 2 each, 10 yd | Hit factor for a combined string | Check that the parts add up |

Record per run: total time, splits (typed or from a shot timer), hits by zone (already scored by rulebook), distance. Derived: hit factor, points per second, % of points, and the planner numbers, each with its sample count. Par times are set by the user (they differ by division and class).

## Defaults taken (change any of them)

- Existing IDPA matches stay viewable; nothing is converted.
- Power factor: set in the profile, overridable per match.
- AA / AC / CC: set per target; per-engagement override can come later.
- Hard-cover lines: clean corner-to-corner diagonals and centred strips unless a vendor's pre-printed product is named.
- Photo reading: built so either on-phone or cloud reading can plug in; decided after testing real photos.

## Parked

- 3D / EYE: keep, don't extend.
- Ask (on-phone Route AI): keep as is.
- Coach chat: dropped (2026-10-26).
- IDPA rules: on hold (A1).
- One-tap match video analysis: after 1.0.

## Needed from the owner

The phone build and a device report (model, iOS version, build number); 10–20 photos of real match book pages or printouts; names of 3–5 testers; an app icon decision.
