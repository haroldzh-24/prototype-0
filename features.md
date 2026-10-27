# 1.0 plan - 2026-10-26

Full plan with "done when" for each item: [docs/roadmap.md](docs/roadmap.md). Milestones in order:
- A. The stage as it really is: **done 2026-10-26 (batch 15)** — IDPA rules on hold (targets kept); layers (hostage no-shoots, doubles) with slide/rotate/snap; the five hard-cover presets; rule checks for layers and PCSL mixing; drill-logger web fix. Needs a phone check.
- B. Fast stage entry: shooting areas from fault lines done (batch 16); drawing under the plan and Photos import started (batch 16).
- C. Plan by time and points: sprint and shuffle drills and the drill library **done 2026-10-26 (batch 17, `docs/drill-library.md`)**: 13 drills, timer-time entry, zone counts, par times, trends, Your numbers with run counts, move timing per direction used by ANALYZE. Expected AA/AC/CC per target with points and an estimated hit factor in ANALYZE **done (batch 18, `docs/expected-points.md`)**. Stage time from your numbers and PLAN RELOADS **done (batch 19, `docs/stage-time.md`)**. Next: 2-3 plans side by side (C5); "is slowing down worth it" per target (C6); power factor per match; timing on the move and for ports/leans.
- T. Training is the drill library (owner, 2026-10-26): T1 Training opens on the drills, runs filed by day, hits marked on the target **done (batch 20)**. T2 a run's video times itself from its sound (beep and shots, checked by you) **done (batch 21), needs a phone check with real range video**. T3 draw and reload broken into movements **first version (batch 22)**: needs the next phone build (native frame-rate change) and real draw and reload videos to tune. T5 practice timer with a buzz start signal and par buzz, and a buzz test (reaction and pocket experiments) **done (batch 23, `docs/haptic-timer.md`)**, needs the next phone build. Next: T4 more practice drills.
- D. Post-match result vs plan; backup, export, sharing.
- E. Phone build and device checklist; 3-5 testers; store readiness.
Dropped: coach chat; free video upload in Training (2026-10-26). Parked: extending 3D/EYE and Ask; IDPA rules.

# Planned: rulebook gap list, redesign and 3D - 2026-10-25

The prioritized list is [docs/rules/gap-list.md](docs/rules/gap-list.md), built from the USPSA, PCSL and IDPA rulebook research in `docs/rules/`. Summary:

- Done: the outdoor high-contrast redesign with night mode (batch 9); 3D stage view and editing alongside the 2D plan, and the eye-level walk-through of the planned route with engagements on the move (batch 10, `docs/stage-3d.md`; needs a new build for `expo-gl`).
- Next for 3D: adding objects and drawing walls in 3D, port editing by dragging, a downrange marker, and eye height on the shooter profile.
- Then, rules for the planner: IDPA tactical priority and positions of cover; wall soft cover and "treat as infinite"; off-limits lines; fault lines that become firing areas; the USPSA 8-hits-per-view check; required hits per target; match level; activated and moving targets; muzzle safe points and exclusion zones.
- Later: divisions and power factor on the profile, stage brief export, editor performance on large stages, Expo SDK 58.

# RC1 feature freeze ? 2026-10-15

All implemented features are frozen for 1.0.0 RC1. No OCR, recognition expansion, automatic route planning or training expansion is authorized for this release. Future ideas below are deferred backlog, not RC commitments. Older dated verification reminders are historical; track all current hardware outcomes only in the RC checklist. September statements that no items exceed one month no longer describe current status.

The only remaining release work is native build/TestFlight and hardware qualification in [one current checklist](mobile/docs/rc-hardware-validation.md). September 9?10 checks and dense snapping assessment remain over one month overdue. Documentation consolidation does not mark any check complete. Completed release hardening is in changelog.md.

# Clean-diagram recognition follow-up - 2026-10-15

Current release status: [1.0.0 RC1](mobile/docs/release-candidate.md). The [single hardware checklist](mobile/docs/rc-hardware-validation.md) supersedes dated device reminders below; historical automated counts are not current RC results.

- Basic deterministic geometry detection, provenance, unknown-shape review, batch decisions and synthetic evaluation are complete; details moved to changelog.md and [the recognition report](mobile/docs/diagram-recognition.md).
- Planned: real sample evaluation across applications, evaluated semantic templates, robust text/logo/dimension suppression, curved/oblique connected networks, OCR/units and reliable projection/quality detection. Current circle/rectangle/repeated silhouettes remain unclassified; grid spacing is image-only.
- Physical-device raster orientation/channel order, Swift compilation, memory/latency, cancellation, accessibility and Save/relaunch remain unverified. Android raster/preparation support remains planned. No service, training or new permission was added.

# Stage diagram import follow-up - 2026-10-15

- Completed document preparation, separate reference/draft persistence, calibrated manual overlays and modular recognition contract are recorded in changelog.md and [the implementation notes](mobile/docs/stage-diagram-import.md).
- Scope: imports accept documents from any stage-building application; automatic recognition must be evaluated across applications and unknown icon conventions must remain reviewable.
- Planned: real sample collection/evaluation, evaluated semantic templates by application/version, robust layout/projection/grid-unit/dimension detection, explicit port/unsupported-prop mapping, browser PDF rendering, Android preparation, relinking and safe orphan-file cleanup. No AI service or custom training is enabled.
- Native Swift build, real PDFs, paper boundaries, camera permissions/cancellation, memory, accessibility, Save/relaunch and low-storage checks remain unperformed; use the unchecked native checklist in the notes.

## Route planner iPhone follow-up - 2026-10-15

- Unperformed physical checks and the overdue September 9-10 backlog are consolidated in [the current checklist](mobile/docs/rc-hardware-validation.md). No device checks have been marked complete. September 9 snapping refinement also remains overdue.
- Completed interaction/accessibility fixes are recorded in changelog.md. Native focus, gesture interruption, safe areas, large text, latency and force-close restoration still require an iPhone.

# Route AI hardening device follow-up - 2026-10-05

- Request lifecycle, guarded async execution, cancellation, timeout/retry, compact context, solver caching and Apply races are implemented; completed work moved to changelog.md.
- Planned: EAS Swift build and physical-device tests of Foundation Models availability/generation/cancellation/session recovery, native performance, stage/navigation/background invalidation, composer keyboards/large text, and Apply/explicit Save/reopen. Exact Windows commands and checklist: docs/route-ai.md.
- True off-main-thread solver execution remains future work; this pass introduces a replaceable executor and UI yield while preserving route algorithms.
- No dated unresolved bug or feature is over one month old as of October 5, 2026; undated legacy entries cannot be aged reliably.

# Offline route solver follow-up - 2026-10-05

- Completed geometry solver and active PLAN integration moved to changelog.md; see docs/offline-route-solver.md.
- Planned: native device performance and PLAN/preview/adopt/edit/explicit Save/reopen verification; run the updated browser journey for the new geometry-only readiness flow.
- Future improvements: adaptive area candidate refinement, body/vertical clearance, dedicated required-region authoring, separate persisted required-waypoint intent, background/cancellable solving for larger stages and further exact-search performance tuning.
- On-device conversational Route AI now uses the structured assistant/solver API; native rebuild/device verification remains planned. Diagram document preparation/manual reconstruction is implemented separately; evaluated automatic recognition and 3D remain deferred. Do not revive style ranking or backward preferences.
- No dated unresolved bug or feature exceeds one month as of October 5, 2026; undated legacy items cannot be aged reliably.

# Final UI device follow-up - 2026-10-05

- Final source-level UI cleanup is complete; implementation and verification results moved to changelog.md and docs/ui-overhaul.md. No known source-fixable overhaul feature-path or presentation issue remains.
- Planned: physical-device verification of safe areas, software/hardware keyboards, native large text, VoiceOver, touch/gesture handoff, platform Back/modal behavior and real media/extraction/review/Save-reopen. Browser text stress does not replace these checks.
- Canvas polygon authoring, cloud sync, durable browser media and improved planning/analysis models remain separately planned features; current coordinate editing, local Profile and media fallbacks remain available. This pass did not implement new storage or algorithms.
- No dated unresolved item exceeds one month as of October 5, 2026; undated legacy entries cannot be aged reliably.

# Video Analysis device follow-up - 2026-10-05

- Interface work is complete and recorded in changelog.md.
- Planned: physical iOS verification of populated review/Results/Compare states, rotated selected-region overlays, playback precision, detector cancellation, keyboard/large text/safe areas, explicit Save/reopen/relink and profile contribution. See mobile/src/training/videoAnalysis.md.
- Durable browser media and existing detector calibration/platform support remain future work.

# Segment 4 Training/Profile follow-up - 2026-10-05

- Completed Training home, session cards, Create Session and read-only Profile presentation are in changelog.md.
- Planned verification: physical-phone keyboard/safe-area and large-text behavior at the three requested sizes, explicit context/start choices, contextual video import/open, Profile refresh after saved contribution and sheet dismissal timing.
- Video Analysis interface work is complete; see changelog.md. Cloud/account implementation and durable browser media remain existing future features; no new persistence was added.

# Segment 3 ROUTE follow-up - 2026-10-05

- Completed ROUTE interface refinements are in changelog.md.
- Planned verification: physical-phone readiness/configuration return paths, tap-to-add cancellation and pinch rejection, selected-node arrows, moving-window selection, coordinate keyboards, large text, preview Back to Results, adoption and save/reopen.
- Future feature: dedicated firing-area canvas editing with structured coordinates as fallback, preserving polygon semantics.

# Segment 2 BUILD follow-up - 2026-10-05

- Completed BUILD organization has moved to changelog.md.
- Planned: physical-phone verification of compact stage-name editing, inspector keyboard/large-text behavior, repeated placement safeguards, rotation wheel, wall endpoint handles and progressive port selection.
- ROUTE UI Segment 3 is complete; verification follow-up is recorded above.

# Segment 1 library follow-up - 2026-10-05

- Planned verification: physical-phone safe areas, large text, short-screen keyboard coverage, sheet dismissal/back timing, overflow menus and delete confirmations on Home/Matches/Stages.
- Completed shared-kit and library refinements are recorded in changelog.md. No dated unresolved item exceeds one month; undated entries cannot be aged reliably.

# Application UI overhaul follow-up - 2026-10-04

- Complete physical-phone verification in [docs/ui-overhaul.md](docs/ui-overhaul.md), including all four video tasks, comparison mapping details, large text and short-screen keyboard behavior.
- Canvas firing-area authoring, durable browser video storage and cloud sync remain future features. Coordinate editing and missing-media/manual-analysis fallbacks remain available.
- Completed design-system, dashboard, library, route presentation, Training, video-task and Profile work is recorded in changelog.md.
- No dated unresolved feature is older than one month as of October 4, 2026; undated legacy ideas cannot be aged reliably.

# UI reorganization follow-up - 2026-10-04

- Planned verification: exercise BUILD/ROUTE on a physical phone, including prerequisite sheets, candidate preview/adoption, layer toggles, ordered assignments, explicit Save, dirty exit and saved-stage reopen.
- Future optional interaction: canvas-based firing polygon editing, retaining the coordinate fallback. This requires a separate focused editing feature and was deferred from this presentation pass.
- Completed interface changes are recorded in changelog.md. No dated unresolved feature is more than one month old as of 2026-10-04; undated entries cannot be aged reliably.

# Moving engagements follow-up - 2026-09-29

- Moving/stationary engagement planning, explicit stage-brief legality, ordered arrows, analysis and persistence are implemented; see changelog.md. Complete the [phone/browser checklist](mobile/docs/moving-engagements.md) for circle/arrow legibility, pan/pinch, waypoint edits, order rejection and save/reopen.
- Future modeling: performance-backed moving-versus-stationary timing, reload/firing scheduling within one segment, body/vertical port clearance, and direct firing-area/cover authoring tied to drawn fault lines. Current firing polygons and IDPA cover/exposure areas are explicit inputs; moving-fire timing is intentionally unavailable.
- No dated unresolved item exceeds one month as of 2026-09-29; undated legacy ideas cannot be aged reliably.

# Stage Designer presets/tools follow-up - 2026-09-29

- Implementation is complete; see changelog.md. Perform the [phone checklist](mobile/docs/designer-tools-testing.md), especially pinch handoff, small-target selection, rotation wheel, endpoint handles and save/relaunch. Browser touch emulation does not establish native-device behavior.
- Obtain dimensioned paper/popper outline drawings and reconcile vendor-size differences recorded in [target sources](docs/target-preset-sources.md). Current paper/popper shapes remain explicitly approximate.
- Diagram PDF/image/paper preparation and manual reconstruction preview are implemented; OCR and semantic object recognition remain deferred pending samples and native verification; basic geometric candidate detection is now implemented. Deterministic moving-engagement route work is recorded above and in changelog.md.
- No dated unresolved item is older than one month as of 2026-09-29. Undated older ideas cannot be aged reliably.

# Planned Features

## Match hierarchy phone verification - 2026-09-29

- **Status:** Planned verification. Match creation/settings/duplication/deletion, owned stage management, target-family defaults and standalone-stage migration are implemented; see changelog.md.
- Follow [the phone checklist](mobile/docs/match-hierarchy-testing.md) on the existing installation, especially upgrade/relaunch idempotence, family changes with mixed old/new targets, cancellation and match/stage delete isolation.

## Stage settings device verification - 2026-09-29

- **Status:** Planned verification. Name-only stage creation, yard-based Stage Settings and boundary-only resizing are complete; see changelog.md.
- Verify decimal keyboard entry, cancel/keep resize, selecting outside objects and shooting positions, manual correction and save/reopen on a physical device.
- Match-level organization now connects this name-only stage creation flow; completed work is recorded in changelog.md.

## Automatic route optimizer follow-up - 2026-09-21

- **Status:** Superseded by the geometry-first offline solver on 2026-10-05. Legacy discovery/generation/style ranking/personalization remain isolated for compatibility and historical regression coverage; their controls are retired from PLAN. Completion history remains in changelog.md.
- Movement reachability and explicit legal-area travel constraints are implemented in the new solver. Future body/vertical clearance and target-face occlusion work remains planned.
- Manual-route analysis, reload-overlap evaluation, training observations and existing Profile data remain available; they do not rank or alter the active solver's movement objective.
- Native verification now follows the offline solver entry above. Competition capacity, reload scheduling, engagement-order and penalty optimization are not part of the new movement solver.

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
# Route assistant follow-up - 2026-10-05

- Headless typed commands, factual queries, previews, controlled acceptance and normal-history undo are complete; moved to changelog.md. See docs/route-assistant.md.
- Host integration, atomic acceptance and conversational Route AI are implemented; see changelog.md and docs/route-ai.md. Planned: native rebuild/device verification, physical-device latency, Save/reopen journeys, streaming, optional background solver scheduling and canvas avoidance-region entry.
- Apple Foundation Models interpretation and ASK UI now call `executeRouteAssistantCommand`; native compilation and real model execution remain unverified.
- No dated unresolved bug or feature exceeds one month as of October 5, 2026; undated legacy items cannot be aged reliably.

# Manual route follow-up - 2026-10-15

- Completed ENGAGE annotations are recorded in changelog.md. Manual REVIEW coverage and authored-path summaries are complete; see changelog.md. Future optional timing/legality integration remains separate. Existing engagement metadata remains compatible; older moving-engagement analysis still uses waypoint chords.
- Verify PATH on a physical phone: select incoming sections, insert/drag/delete bends, toggle styles, reorder/delete waypoints, pinch handoff, pan/zoom, undo/redo, Save and relaunch. Implementation is recorded in changelog.md.
- Overdue reminder: September 9-10 device checks (paper/steel symbols, wall ports, partial targets, object actions, 2.5D and loadout) and September 9 snapping refinement are more than one month old as of October 15. Resolve or reschedule these entries.

# ENGAGE follow-up - 2026-10-15

- Verify on physical iPhone: 44-point selection areas with overlapping arrows/targets, several arrows at one waypoint, continuous creation on rounded sections, pinch interruption and remaining-finger pan, out-of-canvas release, temporary-guide cleanup, large text/short screens, VoiceOver engagement list, Save and app relaunch.
- Manual REVIEW is complete; see changelog.md. Manual annotations remain separate from older target assignment/legality/timing data; no automatic selection, legality inference, or timing integration was added.

# Manual REVIEW follow-up - 2026-10-15

- Verify on physical iPhone: assigned check/unassigned exclamation symbols, amber outlines on rotated targets, crowded-target taps at 50-300% zoom, pan/pinch without target selection, summary/inspector sheets on short screens and large text, VoiceOver status and source entries, route-location highlighting, invalid removal/Undo, and Save/relaunch.
- Completed coverage, filter, inspector and summary behavior is recorded in changelog.md. Optional future timing/visibility/feasibility analysis remains separate from manual assignment inspection.
- Reminder: September 9-10 device checks and September 9 snapping refinement remain more than one month overdue.
