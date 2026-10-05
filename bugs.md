# Final UI verification - 2026-10-05

- Source-fixable overhaul defects found in the final pass were fixed and moved to changelog.md. No known source-fixable UI overhaul issue remains after the final journey/source audit.
- Remaining UI verification needs native evidence: iOS safe areas, keyboards/focused-input scrolling, Dynamic Type, gesture handoff/crowded hit regions, physical touch, VoiceOver, platform Back/modal behavior and real AV/detector/overlay/Save-reopen flows. See docs/ui-overhaul.md.
- Browser layout passed at 390×844, 375×667 and 320×568, including doubled-browser-text stress and fixed video Save. Both existing browser smoke suites passed, including Save/reload. An earlier isolated-browser navigation timeout recovered after restart; it was not treated as a layout failure or a storage fix.
- Existing browser SQLite/OPFS teardown and temporary browser media limitations remain open outside the UI cleanup scope. Calculations and persistence were preserved.
- No dated unresolved bug or feature exceeds one month as of October 5, 2026; undated legacy entries cannot be aged reliably.

# Video Analysis interface verification - 2026-10-05

- Completed presentation fixes are in changelog.md. Browser layout checks passed at 390x844, 375x667 and 320x568, including fixed Save after scrolling and event sheets.
- Physical iOS media/extraction, overlays, cancellation, keyboard, safe-area, populated review/mapping and save/reopen verification remain open; see mobile/src/training/videoAnalysis.md.
- Existing browser SQLite/OPFS teardown and durable browser media limitations remain open.
- No dated unresolved bug or feature exceeds one month as of October 5, 2026. Undated legacy entries cannot be aged reliably.

# Segment 4 Training/Profile verification - 2026-10-05

- Completed session-library, blank-name validation, load-error retry, context wording and unavailable-metric presentation fixes are recorded in changelog.md.
- Source layout reviewed at 390x844, 375x667 and 320x568. Native keyboard coverage, large text, safe areas, selector wrapping and immediate sheet-to-analysis transitions remain unverified; see docs/segment-4-training-profile.md.
- Existing native video import/playback/Save-reopen and browser SQLite/OPFS issues remain tracked; no storage or analysis changes were made.
- No dated unresolved item exceeds one month as of October 5, 2026; undated legacy items cannot be aged reliably.

# Segment 3 ROUTE verification - 2026-10-05

- Fixed remaining ROUTE readiness, coordinate-entry, narrow EDIT toolbar, assignment feedback and moving-timing disclosure issues; completed fixes are in changelog.md.
- Source layout reviewed at 390x844, 375x667 and 320x568. Physical-phone tap placement, marker/window hit regions, keyboard coverage and large text remain unverified. This segment did not run browser screenshots.
- Canvas polygon editing remains deferred; structured point coordinates use the existing parser and validation.
- No dated unresolved item is over one month old as of October 5, 2026; undated legacy items cannot be aged reliably.

# Segment 2 BUILD verification - 2026-10-05

- Completed BUILD presentation fixes are in changelog.md. Browser checks cover default toolbar, Add, placement, Draw chooser, drawing, More and read-only 2.5D at all three requested sizes.
- Remaining verification: native rotation/endpoint gesture handoff, large text, safe areas, inspector keyboard coverage and progressive port fields. The browser canvas overlay occupies usable space on the smallest screen; native usability still needs review.
- Existing browser SQLite/OPFS teardown issue remains open; no storage changes were made.
- No dated unresolved bugs or features are over one month old as of October 5, 2026. Undated legacy items cannot be aged reliably.

# Segment 1 library verification - 2026-10-05

- Fixed duplicate library headings, missing Stages Retry, inconsistent inline error styling, and unconstrained long card names; completed fixes are in changelog.md.
- Browser review passed 15 layout checks: Home, Matches, Stages, create-match sheet and name-only stage sheet at 390 ? 844, 375 ? 667 and 320 ? 568. No page-level horizontal overflow.
- Rapid automated back navigation immediately after sheet closure was unreliable; verify sheet-close/back timing on native devices. Existing browser SQLite/OPFS teardown remains unresolved; this pass does not change storage.
- No dated unresolved item is over one month old as of October 5, 2026. Undated legacy entries cannot be aged reliably.

# Application UI overhaul verification - 2026-10-04

- Browser full reload remained unreliable during 375 × 667 and 320 × 568 smoke runs: the editor reopened before reload, then reload left a blank page or “Opening your saved data…”. The existing SQLite/OPFS teardown investigation remains open; no storage behavior was changed in this presentation pass.
- Captured Expo web teardown logs show `ReferenceError: SharedArrayBuffer is not defined` in the existing `StorageProvider.tsx:18` pagehide callback calling `db.closeSync()`. This is concrete follow-up evidence, not a confirmed explanation for every startup timeout.
- Verify native safe areas, large text, keyboard coverage, event sheets, fixed video Save/dirty-close choices, media overlays and detector cancellation. See [the exact checklist](docs/ui-overhaul.md).
- Fixed presentation issues (buried video Save, cyclic session selectors and stale Profile focus data) are recorded in changelog.md.
- No dated unresolved bug is older than one month as of October 4, 2026. Undated legacy entries cannot be aged reliably.

# UI reorganization verification - 2026-10-04

- Native verification remains open for small phones, large text, safe areas, keyboards, sheet dismissal, selected-node/window hit regions and gesture handoff. Use the phone checklist in the final implementation report.
- Canvas firing-area editing remains deferred; polygon coordinates remain editable. A new saved-route stale banner was not added because saved routes have no reliable calculation fingerprint; existing discovery geometry-key invalidation remains authoritative.
- The existing web storage teardown/OPFS investigation remains open. Successful browser runs do not establish that it is fixed.
- Completed UI fixes are recorded in changelog.md. No dated unresolved item is more than one month old as of 2026-10-04; undated legacy entries cannot be aged reliably.

# Moving engagement verification - 2026-09-29

- Fixed endpoint-only target coverage, implied stops at every engagement, missing legal-area/safe-angle inputs and missing ordered engagement arrows; completed implementation is recorded in changelog.md.
- Final review corrected stationary prerequisite ordering and deferral to later moving windows, and made configured planner counts/ranking distinguish stops from waypoints. TypeScript passed; full-suite verification passed 523 tests, then 87 relevant tests passed after final changes (including two additional regressions).
- Native/browser engagement rendering and gestures remain unverified; use [the checklist](mobile/docs/moving-engagements.md). Firing polygons are explicit stage-brief inputs and must be kept aligned with edited fault-line marks. Projected ports, point movement and conservative reload-segment handling are documented model limits.
- No dated unresolved bugs or features exceed one month as of 2026-09-29. Undated legacy reports cannot be aged reliably; the existing browser storage teardown investigation remains open.

# Stage Designer verification - 2026-09-29

- Fixed oversized target symbols, center-only segment placement and missing document undo through this phase; completed changes are recorded in changelog.md.
- Browser reruns reproduced the existing web storage teardown/OPFS exclusive-handle issue before reaching the home screen. Restarting the isolated browser releases its worker handles; the previously logged investigation remains open.
- Physical-device gesture behavior remains unverified; run [the phone checklist](mobile/docs/designer-tools-testing.md). Approximate target silhouettes and unresolved vendor dimensions are tracked in [target sources](docs/target-preset-sources.md), not represented as exact scoring geometry.
- No dated unresolved bug is older than one month as of 2026-09-29; undated legacy reports cannot be aged reliably.

# Match hierarchy verification - 2026-09-29

- Fixed standalone stage organization and missing persistent match ownership; completed behavior is recorded in changelog.md. Match-family changes never rewrite placed targets. Deletion/duplication and upgrade migrations are atomic.
- TypeScript and the full 463-test suite passed. Ten new tests cover multiple matches, same-name stages, ownership/isolation, family changes, duplication/deletion rollback, byte-preserving migration, partial/unreadable legacy records, migration rollback/retry/idempotence and database close/reopen.
- The first full-suite run had one assertion mismatch between a plain JavaScript object and SQLite's null-prototype row; stored values matched. Normalized the assertion, added mixed-ownership migration coverage and reran the full suite successfully. Regenerated ignored Expo route types to include the new match screen; no type suppression was used.
- Browser smoke navigation is updated but was not executed. Native upgrade, UI, keyboards, family selection and back/unsaved guards require [phone verification](mobile/docs/match-hierarchy-testing.md).
- No dated unresolved bugs or features exceed one month as of 2026-09-29. Undated legacy entries cannot be aged reliably; the existing browser storage teardown investigation remains open.

# Stage dimensions verification - 2026-09-29

- Stage dimensions are now editable inside the designer. Boundary reductions require cancel/keep confirmation when physical footprints or shooting positions would be outside; confirmed resizes retain every object and planning reference. Completed work is recorded in changelog.md.
- TypeScript passed; all 453 regression tests passed, including fractional-yard conversion, resize immutability, rotated/cut footprints, unchanged-field precision and SQLite close/reopen. Browser/native UI interaction has not been verified in this change.
- No dated unresolved bugs or features are older than one month. Undated legacy entries cannot be aged reliably; the existing browser storage teardown investigation remains open.

# Phase 7A verification - 2026-09-21

- Added focused coverage for partial/complete profiles, deterministic curve interpolation, emergent movement/shooting tradeoffs, evaluator-owned reload overlap, corruption handling, explanations and optional profile persistence. TypeScript passed once; the full test suite passed once with 199 tests (17 new tests). No new defect identified; completed implementation is recorded in changelog.md.
- Native status rendering and measurement-entry/curve-aware accepted-route summaries remain planned in features.md. No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

# Phase 6B integration verification - 2026-09-21

- Added focused coverage for source selection, visibility isolation, equivalent-position deduplication, coverage warnings, fallback, stale geometry, bounded pools, preview immutability and normal editable route adoption. TypeScript passed once; the full suite passed once with 182 tests (13 new integration tests). No new defect identified. Completed integration is recorded in changelog.md.
- Native discovery preview gestures remain unverified and are tracked in features.md. No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

# Bug Tracker

## Phase 9A hardening verification - 2026-09-22

- Fixed queued audio cancellation being lost, stranded prepared native jobs, late UI completions after dismissal, cross-detector double taps, rotated-video selection geometry, nonfinite playback/overlay input handling, incomplete import cleanup and stage writes entering unrelated training transactions. Details are in changelog.md and mobile/docs/ios-device-verification.md.
- TypeScript passed once. The single full-suite run executed 447 tests: 444 passed, 3 failed because pre-existing pose/close-up adapter mocks did not expose the new native release method. Those mocks now implement release and assert cleanup; they were not rerun, respecting the requested one-run limit. All 19 new hardening tests passed. Corrected mocks still need verification in the next authorized run.
- Expo autolinking resolves all three custom module classes. Swift compilation, actual audio/Vision behavior, cancellation latency, low-memory/storage behavior and device gestures remain unverified. The device checklist is explicitly unchecked.
- No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably. Existing browser storage teardown investigation remains open.

## Phase 8F-B verification - 2026-09-22

- Closed the deferred inability to compare multiple observed strings at one planned position; original string IDs/details, summed string durations, shot counts and full engagement spans are now preserved. Completed implementation is recorded in changelog.md.
- Confirmed automatic suggestions cannot overwrite fixed mappings, rejected pairs remain unapplied, timeline/grouping edits block stale acceptance, historical snapshots remain unchanged, and review decisions survive SQLite reopen without profile mutation.
- TypeScript passed once; the full suite passed once with 428 tests, including 30 new mapping tests. No new defect identified. No screenshots, browser automation, iOS export, commit or push.
- Physical-device suggestion review remains unverified and is tracked in features.md. No dated unresolved bug or feature exceeds one month; undated legacy ideas cannot be aged reliably.

## Phase 8C verification - 2026-09-22

- Native body-pose build/execution and physical-device review remain unverified; tracked in features.md. Camera translation and subject identity remain heuristic limitations, not physical-distance measurements.
- Added regression coverage for provisional pose markers altering trusted timing/string boundaries, run metadata surviving edits/normalization and confirmed movement requiring real distance. Completed changes are recorded in changelog.md.
- Final validation: TypeScript passed once; full suite passed once with 302 tests (27 new pose tests). Expo autolinking resolves TrainingPose. No screenshots, extended browser automation, iOS export, commit or push. No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

## Phase 8B verification - 2026-09-22

- Native extraction and signal thresholds require device verification; tracked in features.md. Android/web/old iOS clients report extraction unavailable without disrupting manual editing.
- Corrected analysis normalization dropping optional detector-run metadata, and guarded reruns against replacing confirmed/manual markers or edits made during decode; completed work is recorded in changelog.md.
- TypeScript passed once and the full suite passed once with 275 tests (23 new). Synthetic coverage includes tones, impulses, rapid strings, echoes, noise, cancellation, malformed audio, timestamp offsets, deduplication, confirmation gating and SQLite reopen. Expo autolinking resolves TrainingAudio. No screenshots, browser automation, iOS export, commit or push.
- No dated unresolved bug or feature exceeds one month; undated legacy ideas cannot be aged reliably.

## Phase 6A discovery verification - 2026-09-21

- TypeScript passed once and all 169 tests passed once, including 17 focused discovery tests. No new defect identified; completed implementation is recorded in changelog.md.
- Discovery is a bounded 2D estimate, not proof of legal shooting space, movement reachability or vertical port clearance. These model extensions and Phase 6B integration remain in features.md. Invalid walls stop discovery; malformed targets/ports warn; truncated searches preserve completed candidates.
- No UI, existing planner behavior or persistence changes. No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

## Phase 5B planner verification - 2026-09-21

- TypeScript passed once and all 152 tests passed once. New coverage checks frozen manual-route preservation across preview switching, preview-to-confirmed-copy behavior, backend reason mapping, advanced metrics, search-limit propagation and ruleset metadata.
- No new defect identified by these checks. Native rendering, sheet transitions and gesture behavior remain physical-device verification tasks in features.md; helper tests do not certify native interactions.
- Completed planner presentation work is recorded in changelog.md. No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

## First automatic planner UI - 2026-09-21

- TypeScript passed once and all 146 tests passed once, including three focused planner UI helper tests.
- Generated results stay separate from the manual route; replacement requires confirmation and copies nested editable data. Changing inputs clears results; closing the panel cancels queued generation.
- No new defect identified. Physical-device UI verification remains planned in features.md.
- No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

## Moving reload verification - 2026-09-21

- Fixed additive-only reload timing; completed implementation is recorded in changelog.md. Ammunition simulation remains unchanged.
- TypeScript passed once and all 143 tests passed once, covering full/partial overlap, stationary/zero movement, final arrival, invalid reloads, unavailable timing, separate segments and ranking.
- No new defect identified. No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

## Route-style ranking verification - 2026-09-21

- TypeScript passed once; all 135 tests passed in one suite run, including 11 focused ranking tests. No new defect identified.
- Evaluator and generation remain unchanged. Ranking now reports evaluator overlap-adjusted reload timing and missing timing explicitly; Personalized falls back because current profiles lack difficulty-dependent shooting costs.
- Geometric facing and distance-only difficulty are approximations; future calibration remains in features.md; moving-reload overlap is complete in Phase 4.
- No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

## Candidate-generation verification - 2026-09-21

- TypeScript passed once; all 124 tests passed in one suite run, including nine new generation tests. No new defect identified.
- Bounded generation uses existing evaluator ammunition states to reject infeasible routes. No evaluator, UI or persistence changes.
- Search is deliberately incomplete at its limits; results retain all valid candidates found and include SEARCH_LIMIT warnings. No guarantee of an optimal route or of finding an existing feasible route after truncation.
- Moving-reload overlap is now implemented by the authoritative evaluator in Phase 4; the generator has no timing approximation.
- No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

## Route-planner foundation verification - 2026-09-21

- No new defect identified. TypeScript and all 115 tests pass, including five focused planner helper tests.
- Generation was deferred in the foundation and is now implemented in Phase 2; preference enforcement remains tracked in features.md. Existing route evaluator, manual route UI and persistence remain unchanged.
- No dated unresolved item is older than one month; undated legacy ideas cannot be aged reliably.

## Batch magazine verification - 2026-09-21

- Missing batch magazine setup is implemented; see changelog.md. Invalid counts, over-capacity rounds, total overflow and duplicate IDs reject the entire batch without changing the current loadout.
- Physical iPhone form verification remains in features.md. No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.

## Target assignment verification - 2026-09-21

- Fixed deleted scoring targets leaving visible/engaged route references behind. Reconciliation now clears those references alongside planned rounds; completed fix is recorded in changelog.md.
- Automated checks: TypeScript and 107 tests pass, including assignment ownership, batch overrides, invalid inputs and SQLite reopen.
- Physical iPhone assignment gestures remain unverified and are tracked in features.md.
- No dated unresolved item exceeds one month as of 2026-09-21; undated legacy ideas cannot be aged reliably.

Use this file to document known defects from discovery through resolution.

## Visual refinement verification - 2026-09-21

- Reduced the reported heavy/dated presentation: shared neutral surfaces, less border nesting, smaller typography and compact navigation-style tools. Completed changes are in changelog.md.
- Protected model/storage/viewport files and existing UI event callbacks were compared against the pre-refinement source and remain unchanged. No new functional defect identified in the automated checks.
- Physical iPhone visual verification remains in features.md. The previously logged web storage teardown issue remains open; this styling pass does not change SQLite.
- No dated unresolved item exceeds one month as of 2026-09-21; undated legacy ideas cannot be aged reliably.

## Builder accidental swipe-back - 2026-09-21

- User reported left-edge canvas gestures triggering native back navigation. The completed route-option fix is recorded in changelog.md.
- Physical iPhone confirmation remains tracked in features.md; editor gesture handlers and other routes are unchanged.

## Web storage teardown log - 2026-09-21

- **Observed:** The Expo development server logged SharedArrayBuffer is not defined from StorageProvider.tsx's db.closeSync() pagehide callback during browser verification/navigation. The final full browser smoke completed successfully without uncaught CDP exceptions.
- **Status:** Investigating; reproducibility and cross-origin-isolation state at teardown are not yet established. No storage or SQLite code was changed in this UI iteration. This log does not establish an iOS failure.
- **Follow-up:** Reproduce web navigation/reload/close against both development and production hosting with cross-origin-isolation headers, then inspect synchronous SQLite teardown behavior.

## Canvas-first editor verification - 2026-09-21

- Removed the builder's scrolling ancestor; only modal forms scroll. Object/route responders own one finger and yield only for a two-finger viewport gesture. The context strip overlays the canvas so selection cannot resize it mid-drag.
- Implemented fixes are recorded in changelog.md. Native gesture behavior still requires physical iPhone verification, tracked in features.md; browser touch emulation cannot certify UIKit behavior.
- No dated unresolved item is over one month old as of 2026-09-21. Undated legacy ideas cannot be aged reliably.

## Prototype 2 Phase 2 verification - 2026-09-18

- Route geometry, assignment ownership, ammunition/reload/chamber simulation, missing references, profile timing, legacy saves and route persistence are covered by automated tests.
- Native-device route dragging, overlapping marker selection and form interaction remain unverified; tracked in features.md.
- Timing uses straight-line segments and profile estimates with movement/reload overlap (Phase 4), with no collision/visibility solving. Incomplete plans display warnings and provisional timing.
- No newly confirmed runtime defect. No dated unresolved items are older than one month; undated older ideas cannot be aged reliably.

## TestFlight New Stage crash - 2026-09-19

- **Description:** Tapping New Stage could allow a native creation/navigation failure to become an uncaught React Native fatal exception.
- **Evidence:** The release crash reached `RCTFatal`; browser smoke tests did not exercise native SQLite creation and the planner navigated before awaiting creation.
- **Fix:** New Stage now creates UUID-backed default document/plan/route data through the repository, awaits persistence before navigation, and displays/logs failures.
- **Status:** Fixed

## Reset button intentionally disabled

- **Description:** The Reset Positions button was intentionally broken for a class Git exercise.
- **Symptoms:** Clicking the button did not reset the stage.
- **Suspected cause:** The button's click-handler registration was intentionally removed.
- **Evidence:** `script.js` did not connect `resetButton` to `resetStage`.
- **Fix:** Restored the `resetButton` click-handler registration.
- **Status:** Fixed

## Mobile Phase 2

- Right/bottom clipping and count-based ID reuse are resolved; details moved to `changelog.md`.
- Device testing remains needed for selection, rotated hit areas, and scroll/drag interaction. No new confirmed defect from automated checks.

## Mobile Phase 3A verification

- **Recorded:** 2026-09-09
- Physical bounds and invalid numeric edit checks are covered by stage tests.
- Device verification remains pending for keyboard/inspector scrolling, rotated hit areas, and snap feel in dense layouts. These are verification tasks, not confirmed defects.

## Wall/fault-line increment verification

- **Recorded:** 2026-09-09
- TypeScript and stage tests cover the wall field rename and fault-line creation, ground-only edits, rotation, bounds, snapping, and Reset.
- Thin fault-line touch interaction still needs device verification; no new confirmed defect from these checks.

## Phase 3B-2 target verification

- **Recorded:** 2026-09-09
- Physical face bounds, invalid target edits, snapping, inspector parsing and Reset are covered by stage tests.
- Device verification remains pending for target badge selection, overlapping badges, rotated dragging and inspector keyboard interaction.
- Symbolic target badges may extend beyond the physical face bounds; they do not represent stand geometry or change snapping.
- No new confirmed runtime defect; completed model changes are recorded in changelog.md.

## Steel target verification

- **Recorded:** 2026-09-09
- Regression coverage added for steel physical geometry, edits, rotated bounds, snapping, IDs and Reset.
- Device verification is pending for plate/popper symbols, overlapping touch areas, rotation and inspector keyboard interaction.
- No new confirmed runtime defect; symbolic badge bounds remain separate from physical face bounds.

## Firing-port verification

- **Recorded:** 2026-09-09
- Atomic port validation and wall-resize containment, local geometry preservation, stable IDs and Reset are covered by stage tests.
- Device verification remains pending for numbered opening markers, multi-port selection and inspector keyboard interaction.
- Overlapping ports are allowed and may have overlapping markers; overlap solving is outside this increment.

## Physical partial-target verification

- **Recorded:** 2026-09-09
- Active asymmetric bounds, rotated anchors, all five presets, reference preservation and atomic rejection are covered by stage tests.
- Device verification remains pending for half-face badge distinction and preset selection near stage edges.
- Preset restoration outside bounds is intentionally rejected rather than moving the reference position.

## Editor object-operation verification

- **Recorded:** 2026-09-10
- Automated coverage includes selected deletion, start protection, independent duplication with fresh child IDs, bounds, valid selection and repeated operation cycles.
- Palette/actions and overlapping copies still need device verification.
- When an object fills the available workspace, duplication may remain coincident after bounds enforcement; collision avoidance is not implemented.

## First 2.5D visualization verification

- **Recorded:** 2026-09-10
- Projection, physical surfaces, port union openings, rotated attachment and all partial-face presets are covered by stage tests.
- Native SVG display, view switching, camera controls and dense-scene performance remain unverified.
- Basic average-depth sorting can misorder intersecting surfaces; preview is not a visibility solver. Wall partition seams may be visible.

## Loadout/planning verification

- **Recorded:** 2026-09-10
- Magazine validation, actual-round totals, chamber counting, start designation, reserve/shortage and deleted target references are covered by stage/planning tests.
- Device keyboard/form interaction remains unverified.
- Unassigned targets count as zero; the summary does not infer required shots or reload feasibility.

## Prototype 2 Phase 1 verification - 2026-09-17

- Automated SQLite round trips and CRUD isolation pass alongside all existing stage/planning tests.
- Browser smoke checks pass for navigation, every ADD tile, rotation/preview, stage save/reopen/reload, ammunition retention, unsaved-edit protection, rename/duplicate/delete, Training and Account.
- SQLite web is experimental and uses exclusive file handles; use one app tab at a time. Native storage does not use this web backend. Fixed startup/page-navigation issues are recorded in `changelog.md`.
- Native-device checks remain pending for back/swipe unsaved-edit protection, SQLite persistence across app restarts, ADD tiles, dragging, inspector keyboard interaction and 2.5D rendering.
- Existing dated follow-up items are from September 9–10, 2026; none are over one month old. Older undated ideas cannot be aged reliably.

## Bug Entry Template

### [Short bug title]

- **Description:** What is broken or behaving unexpectedly.
- **Symptoms:** Observable behavior, errors, or reproduction details.
- **Suspected cause:** The likely underlying cause, if known.
- **Evidence:** Logs, screenshots, test results, or relevant file references.
- **Fix:** The implemented or proposed resolution.
- **Status:** Open | Investigating | In Progress | Fixed | Closed

## Phase 8A verification - 2026-09-22

- Added focused regression coverage for time/frame conversion, timeline validation/editing, 2R2, movement and shot strings, incomplete sequences, source confirmation, context isolation, profile integration, missing assets, versioning, SQLite reopen and atomic rollback.
- Completed implementation and fixes are recorded in changelog.md. Physical-device import/playback/seeking and browser media persistence follow-up remain in features.md.
- No dated unresolved item is older than one month; undated legacy ideas cannot be aged reliably.
- Final verification: TypeScript passed once; the full suite passed once with 231 tests, including 32 new video-analysis tests. No screenshot/browser automation, iOS export, commit or push was performed.

## Phase 7B verification - 2026-09-22

- Completed fixes for overwritten manual inputs, stale baseline restoration, order-dependent duplicate conflicts, slow-performance rejection and non-video sample withdrawal are recorded in changelog.md.
- Added focused coverage for generalized observations, overrides/removal, invalid stored data, slow results, duplicate conflicts, contexts, movement/reload/shooting/transition calibration, lifecycle persistence, legacy 8A compatibility and personalized route consumption.
- No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.
- Final verification: all 252 tests passed in one full-suite run (21 new tests). TypeScript initially found one narrowing error; after correction, its targeted rerun passed. No browser/device tooling, export, commit or push was performed.

## Phase 8D verification - 2026-09-22

- Native close-up Vision execution and player/region alignment remain unverified; see features.md and mobile/src/training/closeUp.md. Low light/blur are reported through confidence/missing data; tracker drift and global registration ambiguity remain limitations.
- Fixed a one-frame jump producing a sustained transition in synthetic fixtures; event edits now refresh close-up windows and deletions remove stale summaries. Completed work is in changelog.md.
- No dated unresolved bug or feature exceeds one month; undated legacy items cannot be aged reliably.

- Final Phase 8D validation: TypeScript passed once; full suite passed once with 327 tests, including 25 new close-up tests. The focused fixture run exposed the transient-transition bug before final validation. Git whitespace check passed.

## Phase 8E verification - 2026-09-22

- Completed duplicate-marker suppression, evidence-preserving rejection and confirmed-support retention across independent detector reruns are recorded in changelog.md.
- Physical-device fusion review and empirical confidence/tolerance calibration remain pending in features.md. Current generic close-up events do not imply semantic gun actions or motion onset.
- No dated unresolved bug or feature exceeds one month; undated legacy items cannot be aged reliably.
- Final validation: TypeScript passed once; the full suite passed once with 364 tests, including 37 new fusion tests. No screenshots, browser automation, iOS export, commit or push were performed.

## Phase 8F-A verification - 2026-09-22

- Completed protection against historical route drift, unconfirmed actual timings, reload overlap double-counting and lost links during video recalculation is recorded in changelog.md.
- Device mapping/viewport/save/reopen verification remains pending in features.md. Unsupported dwell prediction and multi-string aggregation are explicit limitations, not inferred measurements.
- No dated unresolved item exceeds one month; undated legacy ideas cannot be aged reliably.
- Final validation: TypeScript passed once; the full suite passed once with 398/398 tests, including 34 new comparison tests. No screenshots, browser automation, iOS export, commit or push were performed.
