# Expected hits, points and hit factor (roadmap C3) — 2026-10-26

Code: `mobile/src/profile/hitModel.ts` (your hit shares by distance), `mobile/src/planning/expectedPoints.ts` (per target and stage), `ExpectedHits.tsx` (per-target planning), shown in **ANALYZE** (`RouteAnalysis.tsx`).

## Where the numbers come from

- **Your hits.** Library runs with counted hits (dry fire records none) become hit measurements, with or without shot times: of the run's required hits, how many were A, C or D, how many were not made, and any no-shoot hits. A PCSL T counts as two A hits (11.3.2.1); extra hits beyond the required count are taken best-first. PCSL runs with T hits on a multi-target drill are left out (whole-run counts can't say which target a T was on). Steel runs count plates hit and makeup shots. Runs saved before this version are re-derived when the app starts.
- **Your hit shares by distance** are rebuilt with the rest of the profile, from runs in the profile's calibration context (live fire unless changed; match runs count when the context is match), in three tables: full paper standing square, partly covered paper (Hostage / partial drill), and steel. Moving runs and port/lean runs are kept out.
- At a target's distance the app uses the logged distance (within ¼ yd), blends the two nearest logged distances, or, outside your range, uses the nearest one and says so.

## Per target

- **Distance** is measured on the ground from the route waypoint that engages the target to the target. A target the route doesn't engage has no distance, so no estimate from your numbers.
- **Paper:** two required hits, scored over the planned rounds. Each shot lands on its own with your shares at that distance. USPSA: with more rounds than required hits the best two count (9.5.1; an exact sum over every way the shots can land). PCSL: the rules don't say which extra hits count (docs/rules/pcsl.md), so extra rounds earn nothing. Fewer rounds than required hits leave a hit missing (−10). Shown: the chance of AA, AC and CC and the expected points.
- **Partly covered paper** (layers or paint leaving less than 95% of the face open, or a cut face) uses your partial-target runs; without them, full-target numbers, with a note that they are likely optimistic. On a hostage target (a no-shoot in its stack) your partial-target runs' no-shoot hits per required hit cost 10 each; without partial-target runs, no-shoot hits are not estimated and the note says so. Separately placed no-shoots and walls do not make a target partial.
- **Steel:** 5 points (USPSA B2 poppers, B3 plates; PCSL 11.3.3); USPSA steel must fall (4.3.1.5, 9.5.1). The estimate assumes each steel is completed: a miss costs a makeup shot, not points. The expected makeups per plate come from your steel miss rate (their time comes with C4).
- **Planned hits (EXPECTED HITS** in the target's PLANNING): plan for MY NUMBERS, AA, AC or CC, and a miss risk (MY NUMBERS, 0, 5, 10 or 25%). A planned pair is that pair whenever both hits land; each hit misses with the miss risk, which is your measured miss rate at that distance unless you set one (0% with no runs there, and the note says so). A miss risk alone adjusts your numbers. Saved with the stage; removed with the target.

## Scoring

USPSA paper A 5 / C 3 / D 1 minor, A 5 / C 4 / D 2 major (Appendix B1), best two hits (9.5.1); PCSL A 5 / C 3 / D 1 with no power-factor scoring (11.3.2.x). A required hit not made scores nothing and costs 10 (USPSA 9.4, PCSL 11.3.4). Power factor comes from the profile (Profile → POWER FACTOR); a per-match override is not built yet.

## Stage

ANALYZE → POINTS AND HIT FACTOR: each target's line (distance, AA/AC/CC, expected points, where the numbers came from), expected points of the maximum, and the **estimated hit factor = expected points ÷ estimated time**. The hit factor is only shown when every target is in the route with planned rounds, every target has an estimate, and the route has a time; otherwise the row says what is missing. It is marked provisional, with the reasons, when the route has warnings, a paper target has fewer than 2 rounds, or the time uses generic values (draw, split, transition, reload or movement not measured or typed in).

## Limits (also listed under the hit factor in ANALYZE)

- Hits are treated as independent; streaks and how hard you push on a given stage are not modelled.
- Shooting on the move uses your standing hit numbers.
- No-shoot hits only on hostage targets with partial-target runs.
- The time is today's ANALYZE estimate (average split, one transition time, your move fit). Splits by distance and exposure, transitions by spread and steel makeups come with C4.
