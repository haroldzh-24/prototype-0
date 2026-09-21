# Bug Tracker

## Candidate-generation verification - 2026-09-21

- TypeScript passed once; all 124 tests passed in one suite run, including nine new generation tests. No new defect identified.
- Bounded generation uses existing evaluator ammunition states to reject infeasible routes. No evaluator, UI or persistence changes.
- Search is deliberately incomplete at its limits; results retain all valid candidates found and include SEARCH_LIMIT warnings. No guarantee of an optimal route or of finding an existing feasible route after truncation.
- Existing evaluator does not support moving-reload overlap. This requested extension is tracked in features.md rather than approximated in the generator.
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
- Timing uses straight-line segments and additive profile estimates, with no collision/visibility solving or movement/reload overlap. Incomplete plans display warnings and provisional timing.
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
