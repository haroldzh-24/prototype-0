# Phase 8F-A: plan versus confirmed execution

`executionComparison.ts` is a pure comparison layer. It does not update routes,
timeline events, detector output, observations or ShooterPerformanceProfile. The
optional `TrainingVideo.executionComparison` persists separately from video analysis,
so detector reruns, timeline edits and recalculation retain the link. Unlinked videos
keep their existing behavior. Existing SQLite training JSON stores it without a schema
migration or duplicate video analysis records.

## Historical route snapshot

Linking captures the saved stage ID/name, saved route ID, saved-stage revision timestamp,
snapshot version, capture time, physical stage/plan (including ordered positions,
assignments and reloads), timing profile inputs and authoritative `evaluateRoute`
output. All are copied. The estimate uses the current saved profile at linking time;
accepted routes currently do not persist their earlier candidate-generation forecasts.
Later route, physical stage, loadout or assignment changes produce an original-snapshot
warning. Merely saving unchanged contents does not. Live-stage deletion does not prevent
historical review. Linking an already changed route cannot recover a plan that was never
saved; the capture timestamp makes this boundary explicit.

The evaluator now exposes `positionDetails` from the same counts already used for its
split/transition totals. Engagement estimates exclude draw, movement and reload. This
adds a breakdown, not a second prediction model. Total and reload overlap formulas are
unchanged. Snapshots validate their evaluator output against their frozen inputs; old
unsupported or malformed snapshots are preserved but not interpreted/rendered.

## Observations and mapping

Only manual or explicitly confirmed timeline events enter observed timing. Cached
measurement eligibility is ignored: the existing video measurement engine re-derives
movement, position transitions, full reload, string and total intervals from trusted
events. Position dwell is explicitly paired POSITION_ENTRY to POSITION_EXIT within an
execution boundary. It is never inferred from still video or missing motion. A unique
STIMULUS-to-DRILL_END interval supplies observed total; multiple totals require an
explicit TOTAL mapping. Missing total is null, never earliest-to-latest video time.

Mappings link a stable observed interval ID (endpoint event references) to a planned
element ID and kind: MOVEMENT, POSITION, RELOAD, STRING or TOTAL. Each stores an ID,
source, confidence, confirmation state and creation/edit timestamps. Manual mappings
are confirmed ground truth. The schema reserves AUTOMATIC_SUGGESTION for future use;
unconfirmed mappings never enter comparisons. There is no automatic recognition here.

Incoming movement and reload elements use their destination position ID. Position and
string elements use the planned position ID. One-to-one assignments are deliberate:
duplicate references, crossing route order and ambiguous same-kind intervals are
rejected. A mapped string must fit within a mapped dwell at the same position. Historical
conflicts or deleted/unconfirmed endpoints are excluded with warnings. Changing endpoint
times recomputes numbers through their retained IDs. Add/update/remove return new mapping
records and leave source data unchanged.

## Timing and attribution

- Movement: evaluator seconds and physical route distance versus confirmed duration;
  no video-derived physical distance or speed.
- Positions: actual entry-to-exit dwell, shot/string counts, assigned targets/rounds and
  the separate evaluator engagement estimate. Predicted dwell and dwell delta are null:
  the evaluator has no dwell definition.
- Strings: confirmed first-to-last-shot duration versus the mapped position's evaluator
  engagement estimate. Differing planned and confirmed shot counts are warned about.
- Reload: raw duration, planned overlap and additional penalty come directly from the
  evaluator. Actual overlap is the timestamp intersection with the mapped incoming
  confirmed movement; absent mapping means unknown, not zero. Actual additional time is
  actual reload duration minus that intersection. Raw and additional deltas stay separate.
- Total: observed minus planned. Supported movement, engagement and additional-reload
  deltas are attributed; residual is total delta minus those deltas. The union of their
  actual intervals determines unattributed observed time. Planned unattributed time
  includes draw and any unmatched components. Their difference equals residual.

Dwell is descriptive and never added over movement/shooting/reload. Non-reload overlaps
and mappings outside the selected total are excluded from attribution, with warnings.
Missing planned estimates or unknown overlap also remain in residual. A zero attributed
bucket means no net attributed difference; it does not assert complete coverage.

Completeness reports mapped/total position, movement, reload and engagement elements;
percentage is their unweighted count ratio. It is not accuracy, score or time coverage.
Residual can remain with 100% element mapping. Alternate observed position-transition
and movement intervals may remain unmatched even when their endpoint times overlap.

## Training review

COMPARE TO PLAN -> saved stage -> its saved/manual/accepted route -> capture snapshot ->
choose mapping kind -> select planned element and confirmed interval -> assign/update.
The existing StageViewport/RouteOverlay renders the snapshot read-only, with selected
position highlighting. Interval selection highlights its row and previews its start in
the existing video player. Mappings can be removed. Save analysis persists changes;
discarding video changes discards unsaved mappings. Live geometry is never edited here.

Version 1 identifies comparison algorithm, route snapshot and linked video analysis.
Malformed comparison data does not prevent opening ordinary video analysis. Limits:
100 route positions, 2,000 stage objects, 500 mappings, 2,000 observed intervals.

## Remaining work

Physical-device interaction/save/reopen verification remains pending. Current storage
supports one comparison per video and one saved route per stage. Multi-string aggregation
and automatic ordered suggestions are implemented in [Phase 8F-B](mappingSuggestions.md).
Recorded candidate forecast history and an explicit recompare-with-current-route action are future work. Full dwell estimation,
arbitrary stage-coordinate recognition, coaching/scoring and new detectors are not added.
Manual source/confidence/event references can serve as future mapping ground truth.
