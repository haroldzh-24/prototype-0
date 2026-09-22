# Planned Features

## Automatic route optimizer follow-up - 2026-09-21

- **Status:** Planned. Typed foundation, bounded candidate generation and Phase 3 ranking are complete; see changelog.md.
- Phase 6A discovery and Phase 6B planner integration are complete; see changelog.md. Verify discovery controls, amber read-only markers, native pan/zoom, stale-geometry feedback and auto-route adoption on a physical device. Optional selected-auto-position visibility connections remain a future preview enhancement.
- Future geometry: legal shooting-area representation, body clearance, movement-path reachability, muzzle elevation/vertical port clearance, target-face occlusion and refined sampling near small openings. Current discovery provides only bounded 2D modeled-geometry estimates.
- Phase 4 evaluator movement/reload overlap is complete; see changelog.md.
- Phase 7A deterministic partial-profile personalization and difficulty/split observations are complete; see changelog.md. Future work: non-video measurement entry UI, recency weighting, difficulty-dependent first-shot acquisition, richer transition contexts, and curve-aware accepted manual-route summaries. Expand distance-only difficulty with target type, partial geometry and visibility difficulty only when supported by data. Verify Personalized status/details on a physical device.
- Phase 5A minimal planner UI is complete; selected routes use existing manual editing and persistence.
- Phase 5B planner presentation is complete; see changelog.md. Verify candidate A/B previews, pan/zoom, reload markers, Back to Results, expanded details, ruleset selection and confirmed route adoption on a physical device.
- Future ruleset constraints: presets currently store session-only typed metadata and share neutral evaluation; competition capacity, reload, engagement-order and penalty rules remain unimplemented.

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
- **Description:** Add a structured drill catalog and non-video measurement entry. Basic named training sessions, video annotation/calibration and automatic route generation are implemented; see changelog.md. Add Apple authentication and cloud sync in a later phase.
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

## Phase 8A follow-up - 2026-09-22

- Local video sessions, manual annotation, deterministic measurements and the bridge into existing profile fields are complete; see changelog.md and mobile/src/training/videoAnalysis.md.
- Verify native document import, video playback/scrubbing, nominal frame stepping, keyboard/marker editing, save/reopen and missing-file recovery on a physical device. Rebuild the native client for the added Expo modules.
- Add durable browser media storage; current browser file access lasts for the page session and reopening requires selecting the original file. Annotations already persist in SQLite.
- Local audio review, body-pose/movement, close-up hand/selected-region analysis and general event fusion are complete through Phase 8E; see changelog.md. Later Phase 8 work: semantic hand/firearm interpretation, target/string suggestions and detector-version migrations. Cloud processing and stage reconstruction remain out of scope.
- General observation types and explicit shot-to-shot transition calibration are complete in Phase 7B. Add a structured drill catalog and difficulty-labeled video measurement entry when inputs are known.
- No dated unresolved item is older than one month as of 2026-09-22; undated legacy ideas cannot be aged reliably.

## Phase 7B follow-up - 2026-09-22

- General observation/rebuild/lifecycle APIs and transition/difficulty calibration are complete; see changelog.md and mobile/src/training/videoAnalysis.md.
- Planned: non-video measurement-entry UI, known-difficulty video metadata entry and richer transition geometry only when measured. Explicitly reviewed audio detector output is implemented in Phase 8B.

## Phase 8B native verification and follow-up - 2026-09-22

- Rebuild the iOS app with the local TrainingAudio module, then verify AVFoundation compilation, imported MP4/MOV AAC decode, stereo/downmix, delayed audio tracks, seek accuracy, no-track/unsupported/corrupt files, cancellation, 60-second limits, memory/latency, review/save/reopen and explicit profile contribution. Windows automated checks cannot certify native decode.
- Tune heuristic thresholds against representative timer/range recordings after device verification. Long echoes, nearby shooters, clipping and impacts remain ambiguous. Shots less than 65 ms apart may merge.
- Android and browser extraction adapters remain planned; they currently report unavailable and keep manual annotation working. No native browser-API fallback is used.
- No dated unresolved item is more than one month old; undated legacy ideas cannot be aged reliably.

## Phase 8C native verification and follow-up - 2026-09-22

- Rebuild iOS with TrainingPose and verify Apple Vision compilation/execution, MOV/MP4/VFR timestamps, portrait/landscape/rotation/mirroring, skeleton alignment, partial framing, occlusion, low light/blur, multiple people, camera motion, timing accuracy, native memory/performance, progress/cancel and audio/manual coexistence.
- Verify confirmation/edit/rejection, save/reopen and explicit profile contribution. Without separately known distance, pose movement remains relative diagnostics and duration only.
- Android/web pose extraction, robust identity tracking, camera-motion compensation and calibrated thresholds against representative footage remain planned. Current continuity deliberately stops after long tracking loss.
- No dated unresolved bug or feature exceeds one month; undated legacy ideas cannot be aged reliably.

## Phase 8D native verification - 2026-09-22

- Close-up hand/selected-region analysis implementation is complete; see changelog.md. Verify native compilation/autolinking, hand continuity, rotated/mirrored/VFR selection, tracking loss, camera ambiguity, cancellation, gestures and save/reopen on physical iPhone.
- Future extensions: backward tracking, calibrated geometry, stronger camera/background separation and tracker reacquisition. Current measurements remain descriptive image-space values.

## Phase 8E follow-up - 2026-09-22

- General fusion and evidence review are complete; see changelog.md and mobile/src/training/eventFusion.md.
- Planned: verify raw/fused/confirmed presentation, evidence inspection, edit/confirm/reject, independent reruns and saved provenance on a physical device.
- Calibrate timing tolerances and confidence heuristics using representative recordings. Current close-up CUSTOM interpretations intentionally remain distinct from semantic body/audio events.
- Future detector migrations should introduce durable run UUIDs; current run references use detector family and analyzedAt.
- No dated unresolved item exceeds one month as of 2026-09-22; undated legacy ideas cannot be aged reliably.

## Phase 8F-A follow-up - 2026-09-22

- Historical route snapshots, optional Training links, manual execution mapping and descriptive timing/residual comparison are complete; see changelog.md and mobile/src/training/executionComparison.md.
- Verify physical-device stage selection, read-only snapshot viewport, selected interval preview, mapping edits, save/reopen and route-change warnings.
- Phase 8F-B mapping suggestions and multi-string engagement aggregation are complete; see changelog.md. Verify suggestion preview, individual/whole acceptance, rejection, multi-interval manual edits and save/reopen on a physical device. Validate confidence thresholds against representative recordings with user-confirmed ground truth. Arbitrary visual position recognition remains out of scope.
- Future work: multiple comparisons per video, historical candidate forecast capture and an explicit recompare-with-current-route action. The current evaluator has no full dwell estimate; the UI reports it as unavailable.
- No dated unresolved item exceeds one month as of 2026-09-22; undated legacy ideas cannot be aged reliably.

## Phase 9A device verification - 2026-09-22

- Code hardening is recorded in changelog.md. Rebuild the native client for prepare/release/cancellation and display-geometry changes.
- Run the unchecked [iOS verification checklist](mobile/docs/ios-device-verification.md), especially portrait/mirrored region selection, immediate cancel/rerun, backgrounding, low storage/memory, missing media, transaction recovery and persistence across relaunch.
- Swift compilation and physical-device audio/Vision execution remain unverified. Historical damaged-record repair and durable browser media storage remain future work.
