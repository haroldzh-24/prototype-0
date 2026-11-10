# Planner report card (2026-11-09)

AUTO-PLAN (Route Planner V2, version 2.1.0) works on real match stages. On 9 stages from the Area 4 USPSA
Championship 2026 match book, every plan was legal, came out the same twice, and finished in under half a second
(Node on a laptop; the phone will be slower). 4 stages were fully covered. On the other 5, the planner left
targets out and named the wall that hides each one. In every case that wall is in my rough sample file within half a
yard of the target (a target mounted on a frame, or a mesh frame the drawing shows), so those are sample-file
errors, not planner errors.

Run it: `cd mobile && node --test tests/plannerReportCard.test.cjs` (stages in `src/samples/area4.ts`, checks in
`src/samples/reportCard.ts`). In the app: + STAGE in a USPSA match → ADD 9 SAMPLE STAGES, then open one and AUTO-PLAN.

## Results

| Stage | Targets covered | Positions | Walk | Legal | Time | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 14 of 17 | 3 | 18.8 yd | yes | 177 ms | T1 sits behind the front-left panel in the file; T8 and T9 are on the back fence (the drawing shows them in its openings). |
| 3 | 13 of 13 | 3 | 25.2 yd | yes | 92 ms | 2 of the briefing's 11 paper targets aren't visible in the drawing and aren't in the file. |
| 4 | 17 of 17 | 2 | 10.9 yd | yes | 41 ms | |
| 7 | 18 of 18 | 4 | 31.9 yd | yes | 452 ms | The first search hit its node budget, so 4 stops isn't proven minimal. |
| 8 | 11 of 13 | 5 | 15.2 yd | yes | 425 ms | Covered 6 before the file got the window the drawing shows in the front panel. T2 is in the back frame; T10 is behind the right frame in the file. |
| 9 | 13 of 15 | 3 | 13.1 yd | yes | 21 ms | T1 and T8 are on frames in the file. The drawing cuts off the left of the bay. |
| 10 | 15 of 16 | 3 | 5.7 yd | yes | 50 ms | T8 is behind the top frame in the file. |
| 11 | 10 of 10 | 2 | 3.5 yd | yes | 30 ms | Briefing lists 6 mini poppers; 4 are visible in the drawing. |
| 12 | 4 of 7 | 2 | 4.3 yd | yes | 10 ms | T1 and T2 are behind the frame with the two no-shoots; on the day they were probably shot over or through it. |

"Legal" means: every stop is inside a shooting area, steel is engaged from at least 23 ft, and the plan, turned into an
ordinary route, passes ANALYZE. ANALYZE shares the planner's legality rules, so this is a consistency check, not an
independent proof.

## What this does and doesn't show

- It shows AUTO-PLAN runs on stages the size and shape of a real Area match, gives legal plans, explains every target
  it leaves out, and is fast enough on a laptop.
- It doesn't show the plans are as good as a strong shooter's: there are no reference plans yet. Harold shot this
  match; his plans, or plans from stage videos, go in `src/samples/area4.ts` next to each stage.
- The sample stages are approximate (about half a yard) and leave out barrels and no-shoots. Stages 1, 5, 6 and 13
  aren't included: their drawings didn't straighten automatically, or show too little of the bay.
- The test fails if any plan becomes illegal or nondeterministic, or covers fewer targets than today.

## Ask

Ask runs on Apple's on-device model, so it can only be checked on the phone. It needs an iPhone that supports Apple
Intelligence, with Apple Intelligence turned on (Settings → Apple Intelligence & Siri). The 10 questions to try are in
`mobile/docs/rc-hardware-validation.md` under "Ask".
