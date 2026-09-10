# Bug Tracker

Use this file to document known defects from discovery through resolution.

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

## Bug Entry Template

### [Short bug title]

- **Description:** What is broken or behaving unexpectedly.
- **Symptoms:** Observable behavior, errors, or reproduction details.
- **Suspected cause:** The likely underlying cause, if known.
- **Evidence:** Logs, screenshots, test results, or relevant file references.
- **Fix:** The implemented or proposed resolution.
- **Status:** Open | Investigating | In Progress | Fixed | Closed
