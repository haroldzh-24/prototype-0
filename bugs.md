# Bug Tracker

Use this file to document known defects from discovery through resolution.

## Prototype 2 Phase 2 verification - 2026-09-18

- Route geometry, assignment ownership, ammunition/reload/chamber simulation, missing references, profile timing, legacy saves and route persistence are covered by automated tests.
- Native-device route dragging, overlapping marker selection and form interaction remain unverified; tracked in features.md.
- Timing uses straight-line segments and additive profile estimates, with no collision/visibility solving or movement/reload overlap. Incomplete plans display warnings and provisional timing.
- No newly confirmed runtime defect. No dated unresolved items are older than one month; undated older ideas cannot be aged reliably.

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
