# Moving engagements for recreational airsoft

Open Route Analysis → Set up moving engagements. Choose USPSA, PCSL or IDPA, enter the stage brief's firing-area polygon corners in yards, safe direction/half angle, movement permission and outside-area travel permission. Sampling is configurable from 0.25 to 24 physical inches (default 2). The whole-stage area button is an explicit choice; the solver never assumes all traversable ground permits firing.

Use target procedures for stationary-only targets, permitted areas and prerequisite target engagements. IDPA requires explicit per-target areas representing the brief's cover/exposure constraints. These are course-author inputs, not automatic rulebook or cover interpretation. Fault-line marks are not closed legal-area polygons: enter the permitted side as firing-area geometry and keep it aligned when editing the course.

Recalculate assignments/order for the current physical path, or use Auto Planner to search waypoint subsets/orders. Manual/Auto/Combined source selection remains available. Configured routes use complete modeled legality/coverage, then movement distance, then stationary-stop count. Search uses at most 12 input waypoints, 256 route evaluations and a 512-prefix queue; limits are reported and no global optimum is claimed. Waypoints control the path; moving engagements create no additional waypoint or physical stage object.

Each straight segment uses regular physical samples plus polygon-edge, safe-angle and projected wall/port silhouette events. Midpoints classify the resulting intervals; boundary refinement keeps their legal side. This catches narrow openings between regular samples. Stage bounds and full wall footprints constrain movement. Firing areas, safe angles, projected line of sight and target procedures constrain firing. Windows are omitted for targets completed earlier in the route. Overlapping windows are ordered by closing distance, opening distance, angular change from travel/previous engagement and stable target identity. No shot duration or accuracy penalty is invented.

Saved route data contains optional `engagementRules` plus waypoint target assignments/order and `movingTargetIds`. Existing route version 1 and old manual routes remain supported. Windows, recommended points, circles and arrows are derived from current geometry on every analysis; they are not persisted as physical geometry. Illegal order edits reject with a reason. Geometry changes can invalidate coverage and require recalculation. Planner adoption deep-copies settings and assignments; target deletion reconciles moving references.

Solid circles indicate stationary engagements. Dashed teal circles indicate recommended engagements during movement; thick teal path portions show the assigned legal windows. W markers identify editable path waypoints. A/B/C arrows and the analysis list share solver order. Several targets at one point share a circle. Counts distinguish stationary positions, moving segments, engagement nodes, target coverage and movement distance; outside-area travel intervals are identified separately.

Limits: projected 2D ports do not establish vertical clearance. Movement uses a point and full wall footprints, including port footprints; no body radius or stand geometry is inferred. Reload segments retain stationary engagements to avoid inventing simultaneous reload/firing scheduling. Moving-route timing is unavailable until supported movement/firing performance data exists; ammunition accounting remains active. This version does not infer firing polygons or cover from drawn markings. Existing unconfigured manual routes remain explicitly unverified.

## Manual UI verification (not yet performed)

1. Set up a lateral path below two wall sections with a doorway between them and three airsoft targets beyond it. Configure firing areas and safe direction, recalculate, and confirm a moving sequence with no added waypoint.
2. Check circle grouping, arrowheads, A/B/C labels, legibility and waypoint dragging in a phone-sized viewport. Pan/pinch and confirm physical window distances do not change.
3. Reorder overlapping targets and verify both labels and list update. Attempt to reverse disjoint doorway windows and verify rejection.
4. Configure two disjoint firing areas. Verify the intervening path remains traversable while its analysis reports no firing. Disable outside travel and verify the route is rejected.
5. Change safe direction, move a wall, or restrict a target's area; confirm invalid saved engagements disappear from legal coverage. Recalculate and verify fresh arrows.
6. Select IDPA; verify missing per-target areas prevent legal coverage. Add explicit cover/exposure areas and target prerequisites, then verify their effect.
7. Save/reopen the stage, check assignment/order, settings, arrows and window distances, then generate/preview/adopt a route and verify edits do not alter other candidates.
8. Repeat on a physical iPhone. Automated geometry and SQLite tests do not certify native rendering or gestures.
