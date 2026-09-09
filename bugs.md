# Bug Tracker

Use this file to document known defects from discovery through resolution.

## Reset button intentionally disabled

- **Description:** The Reset Positions button was intentionally broken for a class Git exercise.
- **Symptoms:** Clicking the button did not reset the stage.
- **Suspected cause:** The button's click-handler registration was intentionally removed.
- **Evidence:** `script.js` did not connect `resetButton` to `resetStage`.
- **Fix:** Restored the `resetButton` click-handler registration.
- **Status:** Fixed

### Mobile objects can leave the right/bottom stage edges

- **Recorded:** 2026-09-09
- **Description:** Movement clamps only negative coordinates; objects can become clipped and unreachable beyond the right/bottom edges.
- **Evidence:** `mobile/src/stage/operations.ts` preserves the original minimum-only clamp.
- **Fix:** Deferred intentionally; Phase 1 must preserve existing drag behavior.
- **Status:** Open

### Mobile object IDs are reused after removal

- **Recorded:** 2026-09-09
- **Description:** Count-based IDs are reused after last-object removal. Current controls avoid simultaneous duplicates, but future arbitrary deletion/references need stable allocation.
- **Evidence:** `addObject` in `mobile/src/stage/operations.ts`.
- **Fix:** Deferred to the next editor phase.
- **Status:** Open

## Bug Entry Template

### [Short bug title]

- **Description:** What is broken or behaving unexpectedly.
- **Symptoms:** Observable behavior, errors, or reproduction details.
- **Suspected cause:** The likely underlying cause, if known.
- **Evidence:** Logs, screenshots, test results, or relevant file references.
- **Fix:** The implemented or proposed resolution.
- **Status:** Open | Investigating | In Progress | Fixed | Closed
