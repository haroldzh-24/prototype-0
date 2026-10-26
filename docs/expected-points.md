# Expected hits, points and hit factor (roadmap C3) — 2026-10-26

Code: `mobile/src/profile/hitModel.ts` (your hit shares by distance), `mobile/src/planning/expectedPoints.ts` (per target and stage), `ExpectedHits.tsx` (per-target planning), shown in **ANALYZE** (`RouteAnalysis.tsx`).

## Where the numbers come from

- **Your hits.** Library runs with counted hits (live fire or match; dry fire records none) become hit measurements: of the run's required hits, how many were A, C or D, and how many were not made. A PCSL T counts as two A hits (11.3.2.1); extra shots beyond the required hits count best-first, as scoring does. Steel runs count plates hit and makeup shots.
- **Your hit shares by distance** are rebuilt with the rest of the profile (calibration context, usually live fire), in three tables: full paper standing square, partly covered paper (Hostage / partial drill), and steel. Moving runs and port/lean runs are kept out.
- At a target's distance the app uses the logged distance (within ¼ yd), blends the two nearest logged distances, or, outside your range, uses the nearest one and says so.

## Per target

- **Distance** is measured on the ground from the route waypoint that engages the target to the target. A target the route doesn't engage has no distance, so no estimate from your numbers.
- **Paper:** two required hits. Each shot lands on its own with your shares at that distance; with more planned rounds than required hits, the best two count (an exact sum over every way the shots can land). Shown: the chance of AA, AC and CC and the expected points.
- **Partly covered paper** (layers or paint leaving less than 95% of the face open, or a cut face) uses your partial-target runs; without them, full-target numbers, with a note that they are likely optimistic.
- **Steel:** 5 points and must fall (USPSA B3, 4.3.1.5; PCSL 11.3.3). A miss costs a makeup shot, not points; the expected makeups per plate come from your steel miss rate (time for them comes with C4).
- **Planned hits (EXPECTED HITS** in the target's PLANNING): plan for MY NUMBERS, AA, AC or CC, and a miss risk (MY NUMBERS, 0, 5, 10 or 25%). A planned pair is that pair whenever both hits land; each hit misses with the miss risk. A miss risk alone adjusts your numbers. Saved with the stage; removed with the target.

## Scoring

USPSA paper A 5 / C 3 / D 1 minor, A 5 / C 4 / D 2 major (Appendix B1); PCSL A 5 / C 3 / D 1 with no power-factor scoring. A required hit not made scores nothing and costs 10 (USPSA 9.4, PCSL 11.3.4). Power factor comes from the profile (Profile → POWER FACTOR); a per-match override is not built yet.

## Stage

ANALYZE → POINTS AND HIT FACTOR: each target's line (distance, AA/AC/CC, expected points, where the numbers came from), expected points of the maximum, and the **estimated hit factor = expected points ÷ estimated time**. The hit factor is only shown when every target is in the route with planned rounds, every target has an estimate, and the route has a time; otherwise the row says what is missing. With route warnings it is marked provisional.

## Limits (said in the app)

- Hits are treated as independent; streaks and how hard you push on a given stage are not modelled.
- Shooting on the move uses your standing numbers.
- The time is today's ANALYZE estimate (average split, one transition time, your move fit). Splits by distance and exposure, transitions by spread and steel makeups come with C4.
