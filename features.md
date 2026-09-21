# Planned Features

## Batch magazine device verification

- **Recorded:** 2026-09-21
- **Description:** Verify Plan / Loadout batch numeric fields and keyboard, inserted-magazine switch, append confirmation, individual edits and native save/reopen on iPhone.
- **Status:** Planned. Batch setup implementation is complete; see changelog.md.

## Target assignment device verification

- **Recorded:** 2026-09-21
- **Description:** On physical iPhone, check Route > Targets > Visible/Engaged, repeated target taps, overlapping targets, dragging beyond tap tolerance, pinch handoff, empty-stage pan, Done and normal object dragging afterward. Check selected-position arrows at different zooms/pans and after object moves/rotation, mass rounds followed by individual override, and native save/reopen.
- **Status:** Planned. Target-assignment implementation is complete and recorded in changelog.md.

Track features that are proposed or planned but not yet implemented.

## Companion-app visual verification

- **Recorded:** 2026-09-21
- **Description:** Check the new typography, compact tool icons, cyan focus states, metric rows and flat sheets on physical iPhone with larger text, landscape and keyboard visible. Compare against the companion-app reference image if supplied later; only the written visual brief was attached.
- **Status:** Planned. Completed visual changes are recorded in changelog.md.

## Builder swipe-back fix device verification

- **Recorded:** 2026-09-21
- **Description:** On iPhone, confirm Builder left-edge and full-screen swipes never navigate back, including between drags. Verify object/route drag, pan, pinch, explicit Back save/discard/cancel protection, and swipe-back on other routes.
- **Status:** Planned. Implementation is complete and recorded in changelog.md.

## Prototype 2 Phase 2 follow-up verification

- **Recorded:** 2026-09-18
- **Description:** Verify route marker dragging at different zooms, overlapping marker selection, route/edit mode switching, assignment/reorder/reload controls, and save/reopen on native devices. Manual route implementation is recorded in changelog.md.
- **Status:** Planned

## Phase 3B-2 follow-up verification

- **Recorded:** 2026-09-09
- **Description:** Verify cardboard/no-shoot badge distinction, selection and dragging near boundaries and overlapping objects on device. Implementation is complete and recorded in changelog.md.
- **Status:** Planned

## Steel target follow-up verification

- **Recorded:** 2026-09-09
- **Description:** Verify plate/popper symbol distinction and selection/dragging near edges and overlapping objects on device. Completed implementation is recorded in changelog.md.
- **Status:** Planned

## Firing-port follow-up verification

- **Recorded:** 2026-09-09
- **Description:** Verify numbered wall-opening markers and multi-port inspector selection/editing on device. Completed implementation is recorded in changelog.md.
- **Status:** Planned

## Physical partial-target follow-up verification

- **Recorded:** 2026-09-09
- **Description:** Verify retained-portion badges for both paper target roles and inspector preset interaction on device. Completed implementation is recorded in changelog.md.
- **Status:** Planned

## Editor object-operation follow-up verification

- **Recorded:** 2026-09-10
- **Description:** Verify palette creation, selected Duplicate/Delete and inspector handoff on device. Completed implementation is recorded in changelog.md.
- **Status:** Planned

## First 2.5D follow-up verification

- **Recorded:** 2026-09-10
- **Description:** Verify native preview display, view switching, wall openings, selected highlights and camera controls on device. Completed first-layer implementation is recorded in changelog.md.
- **Status:** Planned

## Loadout/planning follow-up verification

- **Recorded:** 2026-09-10
- **Description:** Verify magazine forms, starting-mag designation, chamber toggle and engagement assignments on device. Completed foundation is recorded in changelog.md.
- **Status:** Planned

## Canvas-first UI follow-up verification

- **Recorded:** 2026-09-21
- **Description:** Physically verify the new iPhone gestures: empty-stage pan, object/position drag, object-to-pinch handoff, lifting one pinch finger, 50-300% zoom, Fit, rotated/thin hit areas, landscape resizing, VoiceOver, safe areas, sheet keyboard/dismissal, and native back/swipe unsaved protection. Use the checklist in mobile/README.md.
- **Status:** Planned. This Windows workspace cannot run a physical iPhone or iOS simulator; Hermes export is not device interaction verification.
- Implemented UI and interactive panning are recorded in changelog.md.

## Future Ideas

### Edit physical workspace dimensions

- **Recorded:** 2026-09-09
- **Description:** Add controls for the document width/depth and a policy for oversized objects. Physical coordinates and rotation are complete in the mobile editor.
- **Status:** Proposed

### Prototype 2 follow-up

- **Recorded:** 2026-09-17
- **Description:** Add training session recording/drills and profile calibration from results. Add Apple authentication and cloud sync in a later phase. Automatic route generation remains deferred; manual routes are implemented.
- **Status:** Planned
- SQLite save/load and stage management are complete; see `changelog.md`.

### Edit start positions

- **Description:** Let users add, remove, and rename start positions. Numeric positioning and resizing are complete in mobile Phase 3A.
- **Priority:** Medium
- **Status:** Proposed

### Route comparison

- **Recorded:** 2026-09-18
- **Description:** Compare multiple manual route alternatives within a stage. One ordered manual route with movement segments is complete; see changelog.md.
- **Priority:** Low
- **Status:** Proposed

### Snap interaction refinement

- **Recorded:** 2026-09-09
- **Description:** Evaluate dense-layout snapping and add candidate retention or anchor priorities if device testing shows jitter. Current alignment uses nearest physical anchors with stable tie ordering.
- **Status:** Proposed

## Feature Entry Template

### [Feature name]

- **Description:** A concise explanation of the desired capability.
- **Motivation:** The user need or problem this feature addresses.
- **Requirements:** Key behavior and acceptance criteria.
- **Dependencies:** Related features, services, or technical prerequisites.
- **Priority:** Low | Medium | High
- **Status:** Proposed | Planned | In Progress
