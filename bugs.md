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

## Bug Entry Template

### [Short bug title]

- **Description:** What is broken or behaving unexpectedly.
- **Symptoms:** Observable behavior, errors, or reproduction details.
- **Suspected cause:** The likely underlying cause, if known.
- **Evidence:** Logs, screenshots, test results, or relevant file references.
- **Fix:** The implemented or proposed resolution.
- **Status:** Open | Investigating | In Progress | Fixed | Closed
