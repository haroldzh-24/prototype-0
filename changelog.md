# RC2 batch 4: Route Planner V2 and drill logger - 2026-10-22

- **Route Planner V2** (`mobile/src/planning/v2/`, PLAN in ROUTE mode): deterministic plan with the fewest legal shooting positions, then the shortest walk. Checks firing-area membership, the safe angle across every sampled point of each target face, and line of sight past walls (69 in low-wall rule), ports, other target faces and no-shoots per ruleset. Reports per-target reasons (no allowed area, safe angle, occluded, unreachable), near-limit engagements, assumptions and an explicit "not checked" list. Exact minimum positions (set cover) and branch-and-bound shortest walk over sampled candidates, then sub-grid refinement. Runs in cancellable slices on the JS thread. Design and rule citations: `docs/route-planner-v2.md`.
- Adopted V2 plans are ordinary editable routes; walking detours become bends. The engagement analysis and Route AI distance/blocked checks now follow drawn bends, the same path the timing evaluator measures.
- Shared geometry entry point `mobile/src/planning/kernel.ts`.
- Route AI: new `QUERY_PLAN` intent answers from V2's computed facts; replies are labelled AI WORDING and preview numbers COMPUTED BY THE APP.
- **Drill logger**: tap hits on the target diagram (face inches, +y up), tag zones, record misses and the aim point, time and splits. Group centre and offset, extreme spread, mean radius (MOA with distance), and rulebook-confirmed zone scoring (USPSA A/C/D Major/Minor, PCSL T/A/C/D with -10 per miss, IDPA points down). REPEAT DRILL links sessions; the session sheet shows the trend. No zone shapes are inferred.
- Dependency review recorded in `docs/dependency-review.md` (no high-severity advisory in shipped runtime code).
- The earlier automatic planner stays as reference until V2 is verified on devices, per AGENTS.md.
- Validation: 853/853 tests (22 V2, 7 drill logger, 2 V2 panel UI), TypeScript passed. No device testing.

# RC2 batch 3: diagram import, camera and training data - 2026-10-22

- Training videos can be imported from **Photos** (iOS) through the system photo picker, which runs out of process and needs no photo library permission; Files import remains. New local native module `modules/training-media` (PHPicker). No permission strings were added.
- Training sessions can be deleted. The delete also withdraws that session's profile measurements in the same transaction and then removes its app-owned video copies; videos in Photos/Files are untouched.
- Diagram import: saved references can be deleted (files are removed only when no draft on any stage still uses them, so duplicated stages keep shared originals); one damaged draft no longer hides the stage's other references, and unreadable ones can be removed; the 20-reference limit message explains what to do.
- Import cleanup: temporary renders, camera photos and picker copies are deleted once preserved; derivative images created during an import session are deleted on close unless a saved draft references them.
- Camera: "Open Settings to allow camera" appears after a denial; capture refuses while another sheet is presented and settles if iOS silently refuses to show the camera, so the import screen cannot stay busy.
- Performance: the diagram raster decoder uses a lookup table (about 2.6x faster in Node on a 1024 x 1024 raster; not yet measured on device). Audio for analysis now crosses from Swift as base64 16-bit PCM instead of a JS array of up to 960,000 numbers; the JS side still accepts the old format.
- Very thin crops now get a clear "too small to analyze" message.
- Validation: 822/822 tests (10 new in `tests/importTrainingFixes.test.cjs`), TypeScript passed, Expo autolinking resolves the new module. Swift changes (TrainingMedia, TrainingAudio PCM, DiagramImport camera guard) are not compiled or device-tested; see the hardware checklist.

# RC2 batch 2: honest movement optimizer and planner fixes - 2026-10-22

- PLAN is now the **Movement optimizer** (buttons OPTIMIZE / OPTIMIZE MOVEMENT). The sheet states it optimizes movement only and does not check targets, line of sight or safe angles.
- The safety setting is now **Safe-angle check (simplified)**, with a notice that it is not 180-degree compliance and does not check muzzle direction while moving, reloading or drawing. New rules default the safe direction to the stage's downrange; a notice appears when they differ, with a "Use stage downrange" action.
- Solver stops that landed exactly on a firing-area edge (legal for travel, illegal for shooting) now settle 0.5 in inside when the path stays clear, so a stationary engagement there passes the legality check. The solver and legality check now share one strict-inside test. Solver version 1.1.0.
- "Use Route" keeps coincident waypoints whole (ID, label, target assignments, moving engagements) and keeps reloads, bends and ENGAGE arrows wherever their waypoints and adjacency survive. Replacing a route lists exactly what would be dropped.
- Route AI reorder/delete on routes with bends no longer fail validation: stale bends and ENGAGE arrows are pruned.
- Specific solver errors when outside travel is off and no firing area exists or the start is outside every firing area.
- Route header separates planned targets from targets that pass checks (ENGAGE arrows are never counted as checked); the waypoint panel no longer double-counts moving engagements.
- Added the full-size 42-inch USPSA popper preset (manufacturer-sourced; recorded in docs/target-preset-sources.md with the rulebook review notes).
- Validation: 812/812 tests (10 new in `tests/plannerFixes.test.cjs`), TypeScript passed. No device testing.

# RC2 batch 1: stage correctness, downrange, cleanup - 2026-10-22

- Fixed unit entry: `36in`, `5ft` and similar values typed without a space were read as yards (36 in became 1296 in). Explicit feet/inch units are now honored with or without a space.
- Reset keeps the match's target family, the custom stage size and the downrange direction instead of restoring a generic 480 x 360 USPSA-less stage.
- Added a stage-level downrange direction (`downrangeDegrees`, default up the screen) with a Stage Settings control. Documents saved before it existed load unchanged and read as up the screen. New default stages put the start uprange (bottom) and targets downrange, use the match family's default target preset, and lay out correctly for all four directions.
- Rotation snapping now applies to targets and wall/fault-line angle edits, not only the start box. Wall length always pivots on the start endpoint, including when height or thickness change in the same edit.
- Grid snapping clamps endpoints to the stage edge when the stage size is not a grid multiple, so they are no longer rejected.
- Grid labels fall on whole yards; firing-area and planner summaries convert through `measurements.ts`.
- Loading and saving reject zero-size objects, duplicate object IDs, empty/duplicate port IDs, closed ports and non-finite downrange; a document is never saved in a form that cannot be reopened.
- Route AI context now carries downrange, so assistant undo stays consistent.
- App display name is PSP; deep-link scheme is `practicalshootingpartner` (slug and bundle ID unchanged to keep the EAS project and App Store identity).
- Removed unused Expo starter code (Explore screen, tab/animated-icon/themed components, `reset-project` script, starter-only images) and the stray `mobile/mobile` package; stopped tracking generated `test-results/`.
- Completed feature: editable physical workspace dimensions (recorded 2026-09-09; already implemented in Stage Settings).
- Updated AGENTS.md with current product direction; added GitHub Actions CI (tests and type check). Refreshed stale notes in the planning/stage READMEs and the UI audit.
- Validation: 802/802 tests (15 new regression tests in `tests/stageFixes.test.cjs`), TypeScript passed, `expo config` resolves. No device testing.

# 1.0.0 RC1 preparation ? 2026-10-15

- Feature freeze preserves stage geometry, SQLite compatibility, PATH/ENGAGE/REVIEW, document import/manual reconstruction and existing analysis.
- Repeated the RC audit against the existing working tree: 786/786 tests and TypeScript passed. Linked the root README to current mobile capabilities, limits and release gates; clarified that dated tracker reminders are historical and the RC checklist owns current hardware status.
- Marked automatic geometry detection EXPERIMENTAL. Detection errors explicitly retain manual reconstruction; regression tests cover oversized/unsupported/interrupted decoder errors without stage writes or lost manual overlays.
- Native image loading now validates header dimensions before decoding (80 MP maximum); invalid PDF bounds and nonfinite perspective outputs reject safely. These Swift guards require native compilation/device verification.
- Import uses an iOS keyboard-avoiding, bounded scroll area. Replaced the cloud-sync placeholder with an accurate local-storage statement.
- Removed the critical shell-quote advisory and two patchable transitive advisory entries; remaining SDK dependency advisories are recorded in release notes. No force upgrade or SDK migration.
- Aligned Expo SDK 57 compatibility patches and pinned production store builds to the documented SDK 57 Xcode image; kept version 1.0.0, existing IDs and remote build-number increments.
- Final automated validation: 786/786 tests (three new), TypeScript, SDK compatibility, installed dependency tree, Expo config/Apple autolinking, iOS Hermes export and diff whitespace checks passed. Security audit remains nonclean as documented.
- Replaced stale README instructions, added RC release notes and consolidated outstanding device checks. No native build, TestFlight submission or physical-device test was performed. See [current validation](mobile/docs/release-candidate.md).

# Clean-diagram automatic geometry prototype - 2026-10-15

Current release status: [1.0.0 RC1](mobile/docs/release-candidate.md). The [single hardware checklist](mobile/docs/rc-hardware-validation.md) supersedes dated device reminders below; historical automated counts are not current RC results.

- Added an opt-in deterministic local detector on the existing prepared/cropped diagram flow: thresholding, connected components, principal-axis straight/diagonal segments, wall-like solid-bar candidates, orthogonal connected strokes/corners, unknown boxes/circles, repeated silhouettes and regular pixel-grid hints. Small glyph-run/large-border suppression is heuristic. No real vendor symbol templates, OCR, automatic units/projection classification, AI service, model training or route/engagement recommendations were added.
- New proposals retain stable image/detector-scoped IDs, immutable image bounds and source/page provenance, editable image position/extent/angle, heuristic confidence and scale status at detection. Every automatic proposal starts rejected/approximate. Unknown shapes cannot commit until mapped; target icon size never determines physical target size. Existing inch conversion still requires explicit valid calibration.
- Integrated detection/cancel, shape outlines, classification, image size and segment angle/length edits, manual additions and batch accept/reject into Reconstruction preview. Reruns preserve user corrections/rejections; duplicate taps cannot replace the running cancellation controller. Recognition never writes stage geometry or alters PATH/ENGAGE/REVIEW. The existing additive editor action, explicit Save and separate SQLite metadata remain authoritative.
- Fixed synthetic L-boundaries being mistaken for circles with angular coverage, and replaced strict aspect-ratio comparisons with rounding-aware raster validation for ordinary downsampling of wide diagrams. Text suppression yields without repeatedly allocating component-object arrays. Added bounded browser and iPhone raster adapters, pure Hermes base64 decoding and a small Core Graphics pixels method in the existing native module; no dependency or permission changes.
- Added a seven-manifest synthetic evaluation dataset, repeatable renderer/evaluator and real-fixture manifest conventions. Positive fixtures match 9/9 annotated primitives (three possible walls, six unknown shapes/strokes), with zero misses/false candidates in those five positive cases and about 0.30 px weighted mean position error. The negative dimension/O-like-glyph case has TWO false unknown candidates; dense input falls back. One deliberately missing scale is reported and cannot be used to commit stage units. These are synthetic geometry results, not real stage-object recognition accuracy.
- Added 22 tests: detector fixtures, resolution invariance, provenance/IDs, calibration guards, rerun preservation, mapping/preset independence, overlay transformations, explicit/ambiguous synthetic templates, cancellation, evaluator errors, metadata validation, rounded downsampling, Hermes RGBA decoder, native-adapter availability/cancellation, preview batch/cancel journeys and SQLite reopen with exact stage/route payload preservation. Updated the prior empty-registry assertion to reflect the registered geometry detector with zero vendor templates.
- Final validation: 783/783 tests passed, zero failures/skips; TypeScript passed; iOS Hermes export passed (.expo/recognition-ios, 4.7 MB .hbc); Expo Apple autolinking resolves DiagramImportModule; browser image decoding -> registered detector -> provenance proposals passed alongside all previous import/warp/crop/original/IndexedDB checks. Diff and new-source whitespace checks passed. Swift/Xcode compilation, native pixel orientation/channel order, physical-device performance and usability remain unverified.
- Runtime limits: 1024 pixels per side, 2000 components, 200 proposals and cooperative 10-second wall-clock guard, with periodic yields/cancellation checks. Processing still runs on the JS thread and native base64 transfer adds transient memory. Desktop synthetic timing is not an iPhone performance guarantee. No real export, paper photograph, native iPhone or simulator execution was tested.
- Current capabilities, known false detections, performance concerns, complete changed-file list and unchecked native checks are in mobile/docs/diagram-recognition.md. Sample conventions are in mobile/tests/fixtures/diagram-recognition/README.md. Real-data evaluation, semantic templates, robust text/dimension discrimination, oblique/curved networks, OCR/units and reliable projection classification remain unfinished. September 9-10 device checks and September 9 snapping assessment remain overdue and unperformed.

# Stage diagram document import - 2026-10-15

- Reframed import around printed/exported design diagrams from any stage-building application: briefing PDFs, screenshots/exports and photographs of paper. No range-scene reconstruction, paid AI service or custom model training was added.
- Added Expo document selection and immutable app-owned originals; browser blobs persist in IndexedDB. Added original viewing via native Quick Look and original browser downloads. Document/preparation/proposal drafts use a separate additive SQLite table; existing stage payload/schema and Matches -> Stages ownership remain unchanged. Metadata is independently copied on stage/match duplication and cascaded on deletion; files stay shared and immutable.
- Added a local iPhone module for one-based PDF page rendering/count/orientation, bounded EXIF-aware image decoding, advisory Vision paper boundaries, manual-corner Core Image perspective correction, quarter-turn rotation and layout cropping. Photo-only capture requests camera permission only on the user action and provides document-import fallback. Native Swift/Xcode execution remains unverified on Windows; Expo autolinking and resolved camera configuration passed.
- Added a manual layout-region crop and editable reconstruction preview over the source diagram: accept/reject, positions, endpoint lines, rotation, type/preset mapping, missing elements, known-grid/dimension calibration with unit conversion and explicit origin. New/changed source pixels invalidate prior scale and overlays; changed scale inputs require confirmation again. Invalid temporary numeric edits cannot reach native image/overlay styles or persistence. All reconstruction positions remain labeled approximate; printed target symbol dimensions never determine scale or physical target size.
- Acceptance adds fresh stable IDs once, rejects bounds/unsupported props/ports/duplicate starts atomically, and records a single undoable stage edit while preserving the exact existing plan/route/engagement data. Repeated acceptance never overwrites objects; the UI directs corrections to the editor or Undo. Source draft Save and the editor's normal geometry Save are distinct. Discarding preview changes clears the unsaved preview.
- Established a modular bounded/cancellable recognition contract and application/version-specific template format. The registry is empty. Automatic object, layout, projection, OCR and grid/dimension recognition are NOT implemented or sample-validated. Unknown/perspective/isometric views remain reference-only until explicit top-down confirmation; there is no claim of an automatic projection classifier. Ports/unsupported props still need the existing editor/port inspector.
- Added 18 tests (11 model/recognition, 3 native-adapter mocks, 2 SQLite, 2 component integration); strengthened the component flow for numeric validation, invalidation, source access and preview discard. Includes byte-preserving route acceptance/undo/redo/Save, metadata close/reopen/copy/isolation/cascade and copy-failure rollback. Native-adapter mocks do not execute Apple APIs.
- Final validation: 761/761 tests passed (18 added, zero failures/skips), TypeScript passed, iOS Hermes export passed (.expo/diagram-ios, 4.6 MB .hbc), Expo Apple autolinking resolved DiagramImportModule, camera usage configuration passed, and git diff --check passed.
- Separate actual headless Chrome verification passed on synthetic rasters: decode, rectangular and skewed quadrilateral warp, rotation, crop, unchanged original bytes, IndexedDB reload, original download and explicit PDF-unavailable fallback. This does not establish real-diagram recognition, app-wide browser usability or native behavior.
- Current limitations and required sample sets/native checks are in mobile/docs/stage-diagram-import.md. Browser PDF rendering, Android preparation, automatic layout/projection/object/scale detection, file relinking and shared-file garbage collection remain planned. No real sample diagrams, physical iPhone test, simulator run or Swift build was performed. September 9-10 device checks and September 9 snapping assessment remain overdue and unperformed.
- Files changed in this task: mobile/src/diagramImport/{model.ts,warp.ts,recognition.ts,assets.ts,assets.web.ts,preparation.ts,preparation.web.ts,DiagramImportScreen.tsx}; mobile/modules/diagram-import/{package.json,expo-module.config.json,ios/DiagramImport.podspec,ios/DiagramImportModule.swift}; mobile/src/editor/{StageBuilder.tsx,useDocumentHistory.ts}; mobile/src/storage/repository.ts; mobile/app.json; mobile/tests/{diagramImport.test.cjs,diagramPreparation.test.cjs,storage.test.cjs,ui-reorganization.test.cjs}; mobile/scripts/verify-diagram-import-browser.cjs; mobile/docs/stage-diagram-import.md; bugs.md; features.md; changelog.md. Prior route-planner workspace changes were retained.

# Route planner iPhone usability pass - 2026-10-15

- Fixed PATH taps moving waypoints/bends through finger jitter; movement now starts after six layout points. Multi-touch interruption latches until release, and marker unmount clears active drag state.
- Fixed waypoint hit regions covering selected-section bend controls. Bend insertion has a 44-point hit area without enlarging its visible plus symbol. Existing waypoint order and engagement lists remain available for coincident selections.
- Fixed REVIEW overlap selection always choosing the same target: repeated taps cycle distance-sorted candidates with stable ID tie ordering. ENGAGE release retains nearest-target behavior. Fixed read-only REVIEW selection and generic read-only canvas deselection callbacks.
- Added VoiceOver coordinate values and directional movement actions to waypoint/bend markers, bounded bend movement buttons, and button-based engagement creation from a waypoint or section midpoint (including curves). Existing direction/reassignment/reordering controls remain available. Arbitrary section fractions still use the canvas; the button flow uses midpoint anchors.
- Kept scrolling sheets, safe-area handling, no-animation modal transitions, Dynamic Type defaults and non-color coverage symbols. Wrapped target inspector actions on short widths and used readable target labels for engagement accessibility. Device rendering/focus/performance remain unverified.
- Added three regression tests: marker threshold/interruption/accessibility callbacks; deterministic overlapping target cycling; button creation with modal dismissal, mode changes, undo/redo and Save. Extended REVIEW callback coverage for read-only state and SQLite reopen assertions for resolved anchors, lettering and complete derived review coverage.
- Files changed in this pass: mobile/src/editor/{RouteOverlay.tsx,StageViewport.tsx,StageBuilder.tsx,manualEngagementGestures.ts,ManualEngagementOverlay.tsx,ManualReviewPanel.tsx}; mobile/tests/{ui-reorganization.test.cjs,manualEngagements.test.cjs,storage.test.cjs}; mobile/docs/rc-hardware-validation.md; bugs.md; features.md; changelog.md. Other pre-existing workspace changes were retained.
- Validation: full suite passed 743/743 (three new tests; zero failures/skips), TypeScript passed, iOS Hermes export passed (.expo/usability-ios, 4.6 MB .hbc), and git diff --check passed. One new read-only assertion exposed an additional fall-through deselection callback; fixed the callback and reran the required checks.
- No physical iPhone/simulator testing or native Swift/Xcode build was performed. Hardware-only tasks remain unchecked in mobile/docs/rc-hardware-validation.md. September 9-10 device tasks and September 9 snapping assessment remain overdue; obsolete age/scheduling wording was corrected without marking tests complete.
- No route storage schema, saved data format, legacy timing or ammunition analysis change.

# Route AI request hardening - 2026-10-05

- Added one typed request lifecycle with stable message/request IDs, duplicate-send/clarification protection, stale stage/revision checks, cancellation, bounded phase timeouts and recoverable Retry. Typed prompts and quick prompts share one pipeline.
- Scheduled assistant queries/validation/replans outside render after a UI yield through an injectable async executor. Solver CPU work remains synchronous JS; no multithreading claim. Added a four-entry exact-input/stage/revision solver cache and safe frozen-replan reuse on Apply.
- Guarded Apply against double taps and stale revisions; retained preview-first edits and explicit Save. Closing busy ASK, BUILD, stage changes, unmount and inactive/background invalidate appropriate work.
- Added native Task cancellation and session cleanup/recreation, fresh per-request sessions, two recent conversational turns, UTF-8 bridge bounds and development-only timing/cancellation/stale/cache diagnostics. Production web stays unavailable and exported mocks are excluded.
- Verification: TypeScript passes; final automated suite 711 tests (all original 682 retained, 29 added); Expo web export passes; 21 browser mock/unavailable/busy-cancel checks pass at 390x844, 375x667 and 320x568. Local Apple autolinking and public app config resolve. Swift compilation/model performance remain unverified on Windows; EAS/device instructions are in docs/route-ai.md.
- Preserved pre-existing work. No route algorithms, schema, cloud AI, new permissions, commits or pushes.

# On-device Route AI implementation - 2026-10-05

- Added a local Expo Swift Foundation Models bridge with on-device availability, guided decisions, actor-managed sessions, typed error mapping and trusted-fact formatting. No cloud/provider/network fallback or new permissions.
- Added bounded compact-context orchestration, deterministic reference/unit/direction resolution, current RouteAssistant queries and preview-only edits. No solver redesign or arbitrary plan patching.
- Added ROUTE ASK, a scrolling conversation with fixed composer, quick prompts, activity/error/clarification states, metrics, stale recalculation, ghost path/focus and controlled Apply/Cancel/undo through existing document history. Explicit Save and SQLite remain unchanged.
- Added injection-only mock and regression/browser smoke tests. Native compilation/device evidence remains pending; docs/route-ai.md provides architecture, limits and exact rebuild/test steps.
- Verification: TypeScript passed, all 682 automated tests passed (634 existing plus 48 added), Expo web export passed, and 15 browser checks passed at 390×844 / 375×667 / 320×568. Production export excludes test mocks/harness; network-source audit and diff whitespace checks passed. Native model performance was not measured.

# New offline route solver - 2026-10-05

- Added the headless geometry-only `routeSolver.solveRoute` pipeline: detached inches-only stage intake, tolerant planar fault interpretation, physical barriers/restricted and explicit allowed-travel regions, finite visibility graph, A*/cached Dijkstra paths, exact small coverage-state search, deterministic nearest-area/2-opt ordering and coverage-preserving waypoint reduction.
- Active PLAN now calls the new solver and displays one best route with secondary genuine obstacle alternatives. Retired style/backward/personalized/legacy ranking and discovery controls from this flow while retaining historical code/tests and saved-data compatibility. Existing firing areas are required regions; absent areas use existing manual points; no requirements imply zero movement at Start.
- Added factual explanations/queries and versioned diagnostic counts, performance budgets and structured failure outcomes. Exact score is movement inches with waypoint-count/stable-ID tie breaking; no preference weights.
- Adoption copies a normal editable StagePlan route into the current editor, retaining replacement confirmation, explicit Save and detached rules/positions. Target/reload assignment remains manual; no new persistence schema or automatic regeneration. Real PLAN solving/preview/adoption and SQLite explicit-save/close/reopen/edit regressions cover integration.
- Benchmark fixes replaced growing-frontier sorting with heaps and repeated pair searches with cached source trees, reducing a ten-region desktop median from 1,869.57 to 351.10 ms. Four measured representative stages and full limits/file inventory are in docs/offline-route-solver.md.
- TypeScript passed; all **608 tests passed** (previous 570 preserved, 38 additions). Browser journey selector updated; browser/native execution remains unverified. Updated bugs.md/features.md and superseded legacy optimizer follow-up without changing training/Profile/manual-route analysis. No commit or push.

# Final source-level UI cleanup - 2026-10-05

- Retraced every requested normal Home/library/BUILD/ROUTE/Training/Video/Profile path while preserving completed Segments 1–5, calculations, geometry, SQLite, schemas, ownership and explicit Save boundaries.
- Unified responsive headers and safe-top Back controls; removed duplicate Training/Profile navigator headings. Shared actions, metric rows and family selectors wrap/constrain long content. Shared ErrorState puts technical details behind disclosure and supplies existing recovery actions; Profile, builder startup and comparison stage loads now have Retry.
- Moved stage-name editing and dirty Stage/Video close choices into keyboard-safe scrolling sheets. Failed video Save remains visible in the close sheet; invalid event timestamps retain the draft and show feedback inside the event sheet. Removed sheet/video modal animation. Done, local Apply and persistent Save retain distinct roles.
- Removed Save from route preview; standardized waypoint copy, numbered area names, concise delete/reset actions and simplified candidate/Vanilla copy. Comparison movement labels use Start/Waypoint names instead of stored IDs. Firing areas reveal one selected area's vertices. Ranking diagnostics stay under Details and alternatives remain collapsed.
- Added intentional empty Profile sample/calibration and reload-magazine guidance; suppressed load-error/empty flicker. Removed duplicate close-up help, applied semantic video review/error/confirmed tones, and improved destructive text contrast.
- Spaced short grid readings by zoom/font scale, separated waypoint labels from engagement circles, compacted unselected engagement labels and reused shared teal movement color. Expanded invisible thin-object hit regions without changing physical geometry; ensured Fit/snap/preview controls have 44-point targets and improved handle/disabled accessibility.
- TypeScript passed; **570/570 tests passed** (original 567 preserved plus three regressions). Expo web export passed. Both existing browser smoke suites passed, including gestures/history and Save/reopen/reload. The final responsive runner covers every mandatory surface at 390×844, 375×667 and 320×568, plus doubled-browser-text stress, with no page-level horizontal overflow and video Save visible.
- Updated docs/ui-overhaul.md, bugs.md and features.md; docs/current-ui-audit.md remains the BEFORE snapshot. Native evidence is still required for real safe areas/keyboards/Dynamic Type/VoiceOver/gestures/platform behavior/AV analysis. Existing browser storage/media limitations remain tracked separately. No commit or push.

# Video Analysis interface completion - 2026-10-05

- Retained TIMELINE / ANALYZE / COMPARE / RESULTS, fixed explicit Save and dirty-close choices, with local drafts preserved across sections. Long filenames truncate; duplicate Play/Pause is removed and precision controls expand.
- Timeline uses event/status/seconds rows, fused evidence review and collapsed historical diagnostics. Add/Edit opens an immediate focused sheet with relevant fields and validation preserving invalid timestamp drafts.
- Audio/Movement/Close-up share status presentation, progressive review and Details. Close-up exposes region/window/run steps, a selected-frame outline and compact confidence/settle summary; detector and cancellation behavior is preserved.
- Results group existing metrics and attach endpoint review to tentative measurements. Profile data is separate with eligible count and Add/Update contribution state, using unchanged repository eligibility and persistence.
- Compare progressively selects or changes the saved plan, reviews suggestions/alternatives, edits mappings in a sheet and displays planned/observed/delta and grouped deltas once mappings exist. Historical pan/pinch/Fit viewport opens through View Plan.
- TypeScript passed; all 567 tests passed (13 new component-state tests); Expo web export passed. Chromium checks at 390x844, 375x667 and 320x568 found no horizontal page overflow in all four sections, scrolled states and Add Event sheets. Fixed Save remained visible at 44px height. Invalid browser video fixture verifies presentation only.
- Updated bugs.md/features.md; physical iOS verification and existing browser storage limitations remain tracked. Detailed scope and phone checklist are in mobile/src/training/videoAnalysis.md. No algorithm, schema, SQLite or native extraction changes; no commit/push.

# Segment 4 Training and Profile - 2026-10-05

- Training reuses fixed shared header, library cards and context badges. Card tap opens the first existing video analysis or contextual video actions; overflow lists ADD VIDEO and all videos with Analysis saved/Needs review labels. No session-detail route or analysis editor changes.
- CREATE SESSION uses shared Input and wrapping selectors with explicit unchanged enum mapping, concise start labels, blank-name validation and busy controls. Creation still persists immediately; import/open behavior and explicit analysis Save are preserved.
- Loading and load-error Retry suppress the empty state until a successful read. Empty state includes deliberate guidance and CREATE SESSION.
- Profile presents LOCAL PROFILE / On this device, PERFORMANCE in tabular metric rows, factual TRAINING DATA counts, secondary CALIBRATION and CLOUD SYNC / Not available yet. Missing/nonfinite metrics show an em dash; stored zero stays zero. Calculations and defaults are unchanged.
- TypeScript passed. npm.cmd test passed 554/554 tests; focused UI suite passed 29/29, including four added Training/Profile regressions. Source layout reviewed at 390x844, 375x667 and 320x568; browser/native testing was not performed for this segment. Details and file list: docs/segment-4-training-profile.md.
- Segments 1-3, analysis algorithms, schemas, SQLite and persistence semantics were preserved. No commit or push.

# Segment 3 ROUTE interface - 2026-10-05

- Preserved PLAN / EDIT / ANALYZE / overflow. Added ROUTE distance/waypoint/coverage summary and NO ROUTE YET with PLAN ROUTE and manual edit.
- PLAN groups readiness and setup links inside ROUTE, keeps generation before Advanced, hides inert legacy planner controls in geometry-first mode, and presents compact results with collapsed alternatives. Preview Save remains disabled.
- ADD POINT now uses the existing deliberate-tap and viewport-to-stage conversion, with bounds checks, cancellation and marker interaction suppression while placing. EDIT wraps on narrow screens; waypoint details show neighboring distances, assignments and reload. Removed duplicate engagement management from waypoint order.
- Firing areas use structured point X/Y yard fields with add/remove, retaining the exact existing text parser and geometry validation. Route Settings progressively discloses firing areas, safety, target procedures and sampling settings.
- Analysis stays read-only-first with explicit Warnings and moving-fire timing Unavailable; its technical timing explanation is under Details. Route terms now use waypoints, engagement nodes and moving windows.
- Validation: npm.cmd run typecheck passed; npm.cmd test passed all 550 tests, including structured-coordinate and candidate-preview Save regressions. Final presentation changes also received focused UI verification. Source layout reviewed for 390x844, 375x667 and 320x568; device checks remain tracked. Algorithms, calculations, persistence and StagePlan semantics unchanged. No commit or push.

# Segment 2 Stage Designer BUILD - 2026-10-05

- Compact Back / intentional stage-name editing / Save header with SAVED or UNSAVED under the name. BUILD / ROUTE remains available.
- Canvas overlays expose placement and drawing controls only in their modes; normal toolbar remains SELECT / ADD / DRAW / More. Fit stays on canvas, edit history and secondary zoom live in More.
- Target inspectors separate BASIC, PLANNING, TARGET, PRESET INFO and advanced elevation. Walls separate GEOMETRY, PORTS and ADVANCED; ground objects retain only relevant fields. Direct dragging, rotation wheel and endpoint handles remain intact.
- Add sheet lists family, preset dimensions and type; source and verification details expand under Info. Choosing closes the sheet and retains repeated deliberate placement.
- Ports open through a summary, then individual port selection reveals fields; existing IDs and validation remain unchanged.
- More groups STAGE, PLANNING, VIEW, EDIT HISTORY and DANGER. 2.5D is explicitly read-only with rotate, zoom, fit and back.
- Typecheck passed; all 548 tests passed after updating five old UI expectations. Browser review passed 21 surfaces at 390x844, 375x667 and 320x568 without horizontal page overflow. Default canvas heights: 694 / 517 / 418 pixels; placement and drawing reclaim 53 pixels.
- No route algorithm, persistence, geometry math, StageDocument semantics or SQLite changes. No commit or push.

# Segment 1 design system and libraries - 2026-10-05

- Added ScreenHeader, StatusBadge, MenuRow, Input, ToolButton and DeleteConfirmation; reused dark semantic tokens, Action, Screen, Panel, Loading, EmptyState, Segmented, Section, Stat/DataRow and EditorSheet. Notices now support success.
- Home now has a two-line PRACTICAL / SHOOTING identity and full-width Stage Planner, Training and Profile launch cards with short descriptions.
- Matches and Stages use fixed shared headers with creation actions, consistent destructive overflow rows, shared name fields/delete confirmations and semantic error notices. Stages includes Retry. Card titles truncate deliberately after two lines; overflow has a separate 44-point full-height hit area with disabled accessibility.
- Existing match/stage creation, editing, duplication, deletion and repository callbacks are preserved. No algorithms, geometry, document/plan semantics, SQLite, persistence or explicit Save changes. No commit or push.
- Validation: npm.cmd run typecheck passed; npm.cmd test passed all 548 tests. Browser checked Home/Matches/Stages and both creation sheets at all three requested sizes (15 overflow assertions), with screenshots under mobile/.expo/segment1-*.png. Physical-device checks remain planned.

# Application UI presentation overhaul - 2026-10-04

- Added semantic movement/warning colors, shared spacing, Action variants, sections, empty/loading/status messages, wrapping selection controls and keyboard/safe-area-aware screen chrome. Library titles and quiet sheet Done controls now share a consistent hierarchy.
- Home emphasizes Stage Planner with compact Training/Profile paths. Matches and Stages use primary creation actions and deliberate empty/loading states; card overflow/ownership flows are preserved.
- BUILD/ROUTE and SELECT/ADD/DRAW/PLAN/EDIT/ANALYZE remain intact. Designer status spacing is tighter; errors use danger color. Route planning shows real activity, primary Generate/Use actions, clearer movement-led alternatives and tabular analysis metrics with amber warnings.
- Training creation moves to New Session with explicit context/start choices, loading/empty guidance and no timer implication. Existing training persistence/import behavior is retained.
- Video Analysis now has TIMELINE/ANALYZE/COMPARE/RESULTS, confirmed versus suggested event presentation, event editing sheets, a fixed top-safe Save and fixed dirty-close choices. Tabs retain the same video draft and child state. Failed Save leaves the editor open; no autosave was added.
- Comparison editing, suggestion pairs and detailed timing information are progressive. User-facing mapping labels replace raw identifiers on suggestion actions. Existing acceptance/staleness/multi-interval/history behavior is retained.
- Profile is intentionally local/read-only, shows performance and context-separated sample counts, uses a compact unavailable cloud status and refreshes on focus after contribution.
- Existing algorithms, geometry, schemas, saved-data compatibility, explicit Save and stage dirty exit are unchanged. No required capability was intentionally removed. Before audit is preserved; design notes, all-file register, journey trace, validation and phone checklist are in [docs/ui-overhaul.md](docs/ui-overhaul.md).
- TypeScript and all 548 automated tests passed; Expo web export passed. The 390 × 844 full browser smoke passed. At 375 × 667 and 320 × 568, captured Home/library/Designer layouts had no horizontal page overflow and editing/Save/in-app reopen proceeded, but full reload hit the existing blank/storage-opening issue. Further fresh-page review hit navigation timeouts. Smaller Training/Profile/media review remains incomplete; native testing was not performed. Full results are recorded in the report.

# Canvas-first UI reorganization - 2026-10-04

- Match/stage card bodies open their existing destinations; separate overflow sheets expose edit/rename, duplicate and confirmed delete. Primary creation actions are + MATCH and + STAGE; stage creation still asks only for a name.
- Added persistent BUILD/ROUTE controls and SELECT/ADD/DRAW/overflow hierarchy. ADD reuses the preset picker in a bottom sheet. DRAW chooses wall/fault line, then retains connected drawing, draft cancellation, snapping and UNDO SEGMENT. UNDO EDIT/REDO EDIT, dimensions, grid/snapping, pan, accessible zoom, read-only 2.5D and reset remain available in secondary controls. Fit is on the canvas.
- Object selection retains physical dragging, endpoint/rotation handles, duplicate and confirmed delete. Basic inspector fields remain visible; preset/face-cut/port/elevation/thickness/round controls remain available under Advanced.
- ROUTE now provides PLAN/EDIT/ANALYZE/overflow. PLAN ROUTE exposes loadout/chamber/start magazine, target rounds and a dedicated progressive Route Settings sheet without leaving ROUTE. Generation can discover automatic candidates through the existing discovery system. Legacy preferences/diagnostics stay under Advanced; ignored geometry-first preferences are hidden and explained.
- Best-ranked results show a compact summary with Use Route and optional alternatives/details/preview. Effectively empty routes adopt directly; meaningful existing routes still require replacement confirmation. Adoption and sheet actions remain draft-only until designer Save.
- Waypoint labels/deletion/reloads/assignment entry live in waypoint context. Assigned targets show one ordered list; visibility/ownership controls and canvas assignment remain available. Engagement nodes/moving-window hit regions open focused order/detail sheets. Visualization layers are ephemeral, with selected-only arrows, target IDs/grid off by default in ROUTE.
- Read-only Route Analysis reuses the existing evaluator for movement, coverage, waypoint/engagement sequence, per-waypoint ammunition, timing and warnings. Recalculation and editing remain in EDIT/order/settings. Training changes only Start Training to CREATE SESSION.
- Added 16 component-callback/state regressions and updated existing browser smoke access paths. Final TypeScript passed; npm.cmd test passed 541 tests with no failures. Expo web export passed. The 390 x 844 browser smoke passed gestures, editing, preview, loadout, route assignment/reload/analysis, layer access, Save/reopen, dirty exit, stage CRUD, Training and Account. Native testing was not performed.
- The dedicated 390 x 844 designer smoke also passed repeated placement, connected drawing, rotation-wheel editing, endpoint manipulation and history. Final 320 x 568 browser review retained a 320 x 392 canvas with no document-width overflow. Final review expanded moving-window touch regions across their span and cached route-summary evaluation independently of viewport changes; TypeScript and all 541 tests passed again afterward.
- Route/engagement algorithms, stage geometry math, SQLite schema, saved-data semantics and explicit Save/dirty-exit protection are unchanged. The before snapshot docs/current-ui-audit.md was preserved. Optional polygon canvas editing, center-to-tap waypoint placement and a new saved-route stale banner remain deferred.

# Airsoft moving engagements and route visualization - 2026-09-29

- Added deterministic inch-based engagement windows for advancing, retreating, lateral and diagonal routes, with refined boundaries and geometric event checks for narrow doorways/ports. Route waypoints, moving windows and engagement nodes are separate solver concepts; moving engagements add no physical waypoint or stage object.
- Added explicit firing-area polygons, safe direction/half angle, travel/moving permission and per-target stage procedures. IDPA requires target-specific cover/exposure areas; no USPSA assumptions are silently applied. Configured routes validate wall collision, firing-area transitions, line of sight and target prerequisites. Legacy routes remain editable and explicitly unverified until configured.
- Added geometry-first automatic route search including targets hidden at both segment endpoints. Complete modeled legality and coverage precede movement distance and unnecessary-stop count. Order uses window availability/closing distance and angular transitions; infeasible saved-order edits reject. Stationary engagements remain where movement is prohibited, and available moving/stationary alternatives are exposed.
- Added stationary/moving circles, assigned target arrows with editable A/B/C order, highlighted moving path windows and waypoint markers. Route Analysis distinguishes stationary positions, moving segments, total nodes, target coverage, movement and no-firing travel. Explanations derive from solver data.
- Added optional route settings/moving assignments to existing JSON persistence with shape validation, independent candidate copies, target-deletion reconciliation and SQLite close/reopen coverage. Samples and rendered arrow coordinates are not saved. Existing ammunition accounting remains; moving-fire timing is explicitly unavailable and reload segments conservatively use stationary engagement.
- Added 30 regression tests. TypeScript passed. The full suite passed 523 tests, followed by 87 relevant tests after final ordering/metric fixes and two additional regression cases. No existing tests were removed. Native/browser rendering and gestures remain unverified. See [usage, model limits and UI checklist](mobile/docs/moving-engagements.md).

# Physically scaled presets and Stage Designer tools - 2026-09-29

- Added 14 stable presets across USPSA, PCSL and IDPA, including multiple paper variants and explicit nominal steel sizes. Presets record inches, shape, source units, references and verification. Placed targets save their preset ID, family, dimensions and independent outline. Existing saved targets and match-family changes never trigger geometry replacement. See [sources and unresolved dimensions](docs/target-preset-sources.md).
- Replaced fixed target badges with scaled face diagrams: both dimensions derive from inches x viewport scale; minimum touch regions remain invisible. Upright 2.5D previews use saved outlines with existing face cuts. Existing route/visibility calculations remain unchanged.
- Added exclusive Select / Move, Pan, Add Target, Draw Wall and Draw Fault Line tools. Target choice starts repeated deliberate-tap placement. Movement, multi-touch and long presses do not place targets. Done and tool changes cancel temporary state.
- Walls and fault lines support start/end taps or a press-and-drag preview, connected segments, Done, Undo last segment and Cancel current segment. Saved endpoints use inches, with compatible midpoint/length/rotation fields. Physical snap priority is endpoint (existing 3-inch tolerance), strong angle (within 5 degrees of a 45 degrees increment), then the configured grid. Snap can be disabled while drawing.
- Added draggable segment endpoints and start-anchored numeric length/angle edits. Invalid, nonfinite, zero-length and out-of-stage endpoint changes reject atomically; walls retain firing-port validation. Moving/duplicating segments keeps saved endpoints synchronized.
- Selected targets expose a rotation wheel and numeric angle input editing one normalized saved value. Wheel rotation retains the target anchor and crosses 359/0 smoothly.
- Added bounded session document undo/redo, including planning references removed with objects. Each drag groups into one step. Target/segment placement, edits and deletions are reversible; viewport pan/zoom never enter history. New edits after undo clear redo.
- Additive optional fields require no database migration. Legacy documents retain existing target data and derive old segment endpoints. Invalid saved outlines/endpoints reject without rewriting stored data.
- Validation: npm.cmd run typecheck passed; npm.cmd test passed all 495 tests (32 new). A 390 x 844 browser touch check passed repeated placement, pan/pinch guards, connected walls/fault lines, tool changes, rotation, endpoint dragging/numeric segment edits, undo/redo and save/reopen. Native-device verification was not performed. [Phone testing instructions](mobile/docs/designer-tools-testing.md).

# Match → Stages hierarchy - 2026-09-29

- Stage Planner now opens match cards showing name, target family and stage count. Create a match with only name/family; open it to create, rename, duplicate, delete or open its stages. Match settings support renaming and USPSA/PCSL/IDPA defaults; match deletion requires confirmation and duplication includes its stages.
- Added database schema v2 with separate match rows and persistent indexed stage ownership. New stage writes require a valid match. Match deletion/duplication and migration use atomic transactions in the existing shared write queue. Match records never contain StageDocument copies.
- Existing unowned stages migrate into one Imported Stages match (default USPSA), retaining their row IDs, timestamps and exact payload bytes, including geometry, routes, ammunition and references. Initialization is idempotent and rolls back failed migrations. The imported match is created only if unowned stages exist.
- Add Target defaults to the parent match's target family, permits a per-add override, and records the chosen family on newly created targets. Existing targets, geometry and dimensions are never changed by a match-family update. Existing generic target shapes/dimensions remain in use.
- Removed standalone creation/list shortcuts. Old Saved Stages URLs redirect to Matches; a builder URL without a saved stage ID redirects to Matches. Designer Back returns to its stage's owning match and retains the existing unsaved-changes guard.
- Added ten migration, match isolation, target-family immutability, duplication/rollback and save/reopen tests. Updated existing storage fixtures and browser smoke navigation for owned stages. TypeScript and all 463 tests passed. Phone steps and migration details are in mobile/docs/match-hierarchy-testing.md; native/browser UI verification was not performed.

# Editable stage dimensions - 2026-09-29

- Stage Planner now offers Add Stage → stage name → Open Stage Designer, using the existing 480 × 360-inch canvas (13⅓ × 10 yards). No dimensions are requested during creation.
- Added persistent Stage Settings access in object, route and 2.5D editing modes, with positive decimal-yard width/depth inputs and visible current dimensions. Dirty tracking and the existing Save action persist changes without a schema migration.
- Resize changes only the boundary. Reductions inspect rotated physical footprints, asymmetric cut targets and route positions, offering Cancel resize or Keep resize. Existing objects, firing ports, IDs, geometry, positions, route assignments and loadouts remain intact. Outside items are listed for selection, camera focus and manual correction, including after reopen.
- Stage/object/port fields, grids, snap controls and route distance displays now use yards. Conversion uses yards × 36 and inches ÷ 36; stored geometry retains fractional inches. Unchanged formatted inputs retain their exact stored values. Explicit legacy inch/foot inputs remain accepted.
- Bounded grid rendering for large user-entered dimensions. Updated the browser smoke script for name-only creation; it was not run. TypeScript and all 453 regression tests passed, including six new conversion/resize/persistence tests. Physical-device verification remains in features.md.

# Phase 7A: personalized performance model - 2026-09-21

- Documented the actual scalar profile and untyped training data in mobile/src/profile/personalizedPerformance.md; no training labels or seeded defaults are treated as measurements.
- Added optional evidence on existing scalar timings and aggregated difficulty-indexed split observations, bounded validation, interpolation within recorded support, independent generic fallbacks and LOW/MEDIUM/HIGH completeness metadata. Existing JSON persistence requires no migration.
- Personalized ranking compares profile-adapted evaluator time plus existing backward/ammunition preferences. The unchanged evaluator handles route timing, transitions, ammunition and moving-reload overlap. Other styles and candidate generation stay unchanged.
- Planner status and results expose sources, confidence, fallback factors and supported explanations. Accepted routes remain ordinary manual routes; their baseline summary does not yet apply the curve adapter.
- TypeScript passed once and all 199 tests passed once, including 17 new model/ranking and SQLite round-trip tests. No browser automation, screenshots or iOS export performed.

# Phase 6B: planner position sources - 2026-09-21

- Added MANUAL (default), AUTO and AUTO + MANUAL using a session-only adapter around the unchanged discovery, generator, evaluator and ranking engines.
- Manual visibility stays intact. Equivalent auto positions within six inches yield to manual positions; remaining auto positions are chosen by added target coverage within the existing 12-position search ceiling. Manual positions are never deleted; existing generator limits still apply when manual positions exceed the ceiling.
- Explicit discovery caches results for the editor session, rejects stale geometry and surfaces coverage, geometry and search-limit warnings. Empty discovery permits combined-mode manual fallback.
- Added amber read-only canvas markers and source counts on route results. Accepted routes use the existing editable route and confirmation flow; no persistence/model changes.
- Focused source integration tests added; final verification recorded in bugs.md.

# Changelog

## Phase 9A: iOS device hardening - 2026-09-22

- Audited Expo configuration, module registration/podspecs, AVFoundation/Vision processing, timestamps, media lifecycle, StageBuilder navigation, training persistence and stale-state rules before edits. Kept existing Phase 8F-B changes intact on ai-route-planner; no major feature, permission or schema migration added.
- Added synchronous audio preparation, shared extraction reservation, release-on-failure, cancellation/progress, native reader/generator shutdown and background/destroy hooks. Vision validates tracked rectangles and clears tracking/registration on frame-size changes. A lightweight transformed display-size lookup corrects close-up region selection for rotated source tracks.
- Added operation generations around training imports/saves/relinks, StageBuilder saves and snapshot linking. Stale completions are ignored; same-tap duplicate operations are blocked. Player initialization has local retry recovery, timestamps reject unavailable/nonfinite values, and unsaved/failed imported media is cleaned up without deleting persisted references.
- Bounded timeline input before sorting/fusion; guarded malformed stage/profile/training payloads; preserved unreadable training rows with visible warnings while listing healthy legacy records. Unknown video-level buffer fields are omitted on normalization. Stage writes now share the training/profile write queue so unrelated writes cannot be lost to a training rollback.
- Memoized dirty-video serialization and preserved existing discovery/fusion/mapping invalidation and observation-withdrawal behavior. Added the unchecked device checklist and code audit at mobile/docs/ios-device-verification.md.
- TypeScript passed once. One full-suite run: 447 tests, 444 passed and 3 failed due to old native adapter mocks missing release. All 19 new tests passed. Updated the three mocks and added release assertions afterward; no rerun was performed under the one-run constraint. Autolinking resolved all modules; no Swift compiler/device, browser automation, commit or push.

## Phase 8F-B: automatic execution mapping suggestions - 2026-09-22

- Added a separate deterministic mapping layer over stored historical route snapshots and confirmed timeline intervals. Compact observed/planned sequences preserve references, order, evaluator timing/distance, shots, strings and reload overlap. No route, timeline, detector or performance-profile mutation.
- Bounded K-best sequence alignment supports matches, planned skips, observed extras, conservative stable-fragment merging and multiple strings at a position. Shared comparison validation preserves fixed anchors and order across overlapping evidence kinds. Centralized scoring/bounds, confidence, deterministic explanations and diverse alternatives expose incomplete/conflicting/no-result states.
- Compare to Plan now offers Suggest Mapping, accept-all, individual accept/reject, conflict feedback and manual multi-interval editing. Preview highlights the historical route position/incoming segment and confirmed interval rows and seeks the video. Only explicit acceptance creates mappings for the existing comparison engine.
- Extended engagement comparison to retain individual string details, total shots/string counts, summed string durations and transition-inclusive spans. Existing evaluator reload timing, overlap and residual calculations remain authoritative. Single-shot groups retain zero-duration string references.
- Persisted algorithm/config/comparison/video-analysis/snapshot versions, generation timestamp, input fingerprint and review decisions with comparison JSON. Trusted timeline/grouping changes mark suggestions stale on read and block acceptance; provisional detector changes do not. Manual mappings remain available for review.
- TypeScript passed once; the full suite passed once with 428 tests (30 new), including SQLite reopen, immutability, anchors/conflicts, partial acceptance/rejection, malformed data, bounded alternatives, counts/timing/reload support, merging and stale detection. No screenshots, browser automation, iOS export, commit or push. Physical-device verification and recorded-ground-truth confidence calibration remain in features.md.
- Limits: lane combination is a bounded heuristic; indistinguishable planned positions cannot share one observed interval automatically. No arbitrary position/target recognition, stage reconstruction, new native detectors, coaching/scoring or cloud inference. See mobile/src/training/mappingSuggestions.md.

### Phase 5B planner preview and result polish - 2026-09-21

- Added VIEW ROUTE using the existing StageViewport/RouteOverlay and stage coordinate transforms. Preview shows numbered positions, directional paths, assigned-target connections, START, reload markers and highlighted incoming moving-reload segments. Object and position editing are disabled; pan/zoom/Fit remain available.
- Planner state stays mounted outside the hidden sheet during preview. Back to Results, header Back and Android hardware Back return to the same results, preferences and expansion state. Preview never assigns to the manual plan; confirmed USE THIS ROUTE retains the existing deep-copy/edit/save flow.
- Compact result cards show effective style, time, feet, position and reload counts, difficulty/ammo differences, and comparison labels derived from returned metrics without changing ranking or diversity. WHY THIS ROUTE displays backend reason messages as ranking preferences, not invented comparative achievements.
- DETAILS exposes total/average/maximum distance-proxy difficulty, loaded rounds/minimum margin, movement complexity, turns/reversals, estimated backward/sustained retreat, raw reload time, available movement, overlap and additional time. Missing timing is explicitly unavailable.
- Added typed session ruleset choices USPSA, IDPA, PCSL and Custom / Vanilla with extensible constraint metadata. All currently use neutral general evaluation; the UI explicitly discloses unmodeled competition rules. Personalized retains its Balanced fallback warning.
- LIMITED SEARCH is shown only when generation supplies SEARCH_LIMIT, including no-result searches. No generation, evaluation, ranking, route format or persistence changes.
- Validation: TypeScript passed once; all 152 tests passed in one suite run, including six new focused helper tests. No browser automation, screenshots, exports, commit or push. Physical-device verification remains in features.md.

### Phase 5A first usable automatic planner UI - 2026-09-21

- Added AI PLAN inside Route mode with route style, backward movement and reload strategy choices, plus position/target/visibility/magazine readiness counts and setup guidance.
- Generation uses the existing candidate generator, evaluator and ranking. Shows up to three results with estimated time, movement distance, positions, reloads, loaded rounds remaining and effective route style; Personalized warns about Balanced fallback.
- Added Ready, Generating, Results, No valid route and Error states. USE THIS ROUTE requires confirmation before replacing an existing route and deep-copies the selected route into the existing manual editing/save flow.
- Added three focused tests for result mapping, independent editable copies and overwrite confirmation. Phase 5B refinements remain in features.md.
- Validation: TypeScript passed once; all 146 tests passed in one suite run. No browser automation, screenshots, iOS export, commit or push.

## Moving reload overlap Phase 4 - 2026-09-21

- The authoritative evaluator overlaps successful reloads with their destination's incoming movement. Optional stationary mode opts out; omitted mode uses movement, including existing saved/generated entries. Route version and ammunition simulation remain unchanged.
- Exposed per-reload raw duration, available movement, overlap and additional penalty, plus totals. Total time adds movement once and only uncovered reload time. Missing profiles still disable timing; invalid magazines receive no timing credit.
- Ranking consumes evaluator timing, retains strategy weights and ammunition margins, and distinguishes stationary/moving alternatives for diversity. Removed the obsolete unsupported-overlap warning. No candidate generation or UI changes.
- Validation: TypeScript once and full tests once; all 143 tests passed, including eight new focused tests. No browser automation, screenshots, exports, commit or push.

### Automatic route ranking Phase 3 - 2026-09-21

- Added centralized Minimum Movement, Balanced and Easier Shooting scoring policies, derived metrics, ranks, additive explanation contributions and original candidate references.
- Personalized explicitly uses Balanced fallback: current performance profiles do not measure the extra shooting cost of target difficulty. Existing supported profile timing still comes from the authoritative evaluator.
- Added rotation-invariant target-facing retreat approximation, neutral ambiguous segments, direction-change/reversal complexity and Avoid/Limited/Allowed penalties.
- Added Conservative/Balanced/Aggressive ammunition-margin and additive reload-time preferences, with the initial overlap warning subsequently removed in Phase 4.
- Added greedy top-five diversity filtering with configurable limit; meaningful subset, order, assignment and reload alternatives survive. Legacy custom scoring callback remains compatible.
- Validation: TypeScript once and full test suite once, all 135 tests passed (11 new). No UI, evaluator, generation, persistence, browser, screenshot or export changes; no commit or push.

## Bounded route candidate generation - 2026-09-21

- Validation: TypeScript once and tests once; 124 tests passed, including nine new generation tests and the updated foundation generation test. No commit or push.
- Generate ordinary StageRoute candidates from manually placed plan.route.positions and user visibility. Every scoring target requires positive planned rounds; invalid input and uncovered targets produce typed warnings.
- Search smaller covering subsets first, keep useful supersets for easier shooting/ammunition alternatives, enumerate distance-ordered permutations from Start, and assign each target once with distance-difficulty-ordered alternatives. Remove empty positions and deduplicate equivalent routes.
- Repair evaluator-reported ammunition shortages by trying unused magazines at the failing or earlier arrivals; all accepted routes pass the existing ammunition simulation. Return authoritative evaluation, timing/distance/reload metrics, difficulty totals and warnings. Inputs are not mutated or automatically applied.
- Centralized ceilings: 12 positions, 4095 subset checks, 64 covering subsets, 12 orders per subset, 16 assignments per order, 2000 evaluator calls (including rejected/reload trials), 64 targets and 16 magazines. Callers may lower ceilings; truncated search retains all valid results and warns. Style ranking remains deferred.
- No UI, evaluator, persistence, browser automation or export changes. Reload timing was additive in Phase 2; Phase 4 now implements evaluator-owned movement overlap.

## Automatic route-planner foundation - 2026-09-21

- Added typed route styles, backward movement preferences, reload strategies, configuration, candidates, evaluated/ranked results and warnings without changing StageDocument, StagePlan, saved routes or UI.
- Separated generation (explicit not-implemented stub), evaluation (delegates all movement/ammunition/timing to evaluateRoute) and ranking (stable pure helper with an explicit caller-supplied policy and optional exclusion). No automatic routes or default optimizer weights are implemented.
- Added independent distance-only shooting difficulty: ground-plane inches to target reference, one dimensionless point per yard, reported per unique scoring-target engagement. It does not alter shooting time; geometry/profile extensions remain planned.
- Validation: TypeScript once and test suite once; all 115 tests pass, including five new pure planner tests. No browser automation, exports, commit or push.

## Batch magazine editor - 2026-09-21

- Added Plan / Loadout > Batch Magazine Editor with quantity (1-100), capacity, loaded rounds and optional first-new-magazine insertion. Appends ordinary UUID-backed magazines using existing validation and designation; existing magazines and the separate chamber setting remain intact.
- Every magazine remains independently editable and uses existing persistence and ammunition simulation. Target/route implementation is unchanged.
- Added focused atomic creation/validation and SQLite reopen tests, including independent overrides. Physical iPhone form verification remains in features.md.

## Stage Planner target assignment and route editing - 2026-09-21

- Added Plan > Targets > Mass Target Editor with scoring-type counts, round steppers and one-time Apply to All. No-shoots are excluded; existing individual round overrides remain independent.
- Added Route > Targets > Visible/Engaged canvas modes with selected-target highlights, explicit Done, tap movement tolerance and pinch termination. Physical objects cannot drag during route assignment; empty-stage pan and viewport pinch remain available.
- Added selected-position visibility arrows using the existing viewport transform, with muted cyan visibility and brighter engaged lines/filled endpoints. These overlays do not change geometry, route distance or evaluation.
- Added per-type human labels (Cardboard 1, Steel 1, Popper 1) to canvas labels, target controls, route summaries and applicable warnings. Persistent IDs and the StagePlan/route storage format remain unchanged.
- Fixed deleted-target reconciliation to remove visible/engaged route references as well as rounds; builder also reconciles stale references when reopening.
- Validation: TypeScript and all 107 automated tests pass. Added focused batch/toggle and real SQLite reopen coverage; updated the deleted-reference regression to assert cleanup while retaining raw stale-route warning coverage. No browser automation; physical iPhone gestures remain a manual follow-up in features.md.

Record completed features, changes, and bug fixes. Add new releases or updates above older entries.

## Unreleased

### Companion-app visual refinement - 2026-09-21

- Replaced sand-heavy chrome with shared near-black/neutral-gray surfaces, white/gray text, a restrained cyan accent and muted red destructive actions. Added shared typography, statistic and data-row presentation components.
- Restyled the Builder top bar as a small Back chevron, dominant stage name and text Save action. Bottom tools now use original 22px line symbols and small normal-case labels on a single flat navigation surface; route tools use the same treatment.
- Reduced enclosing borders, title sizes, uppercase navigation, letter spacing and nested-card padding. Inspectors, wall ports, snapping, View and planning sheets use flat sections and thin dividers. ADD uses quieter two-column silhouette tiles.
- Presented existing route time/rounds/position counts, ammunition totals and profile values as large-number/small-label groups with aligned detail rows. No calculation, persistence, gesture, viewport, safe-area or navigation behavior changes. Builder swipe-back remains disabled.
- Retained physical object/material colors and the existing 2.5D scene palette. The reference image was not included with the attachment; this pass follows the supplied written visual specification.
- Validation: TypeScript and 104 existing tests pass. Final export and visual smoke results are recorded in mobile/README.md. No commit or push.


### Builder-only iOS swipe-back fix - 2026-09-21

- Disabled gestureEnabled and fullScreenGestureEnabled on the Builder Stack.Screen only. Removed the editor effect that re-enabled swipe-back whenever dragging stopped.
- Kept the explicit Back button, usePreventRemove unsaved-change protection, all canvas gestures, and other routes' navigation options unchanged.
- Validation: TypeScript and all 104 tests pass; physical iPhone left-edge verification remains pending.


### Canvas-first mobile UI overhaul - 2026-09-21

- Reorganized existing editor components without changing StageDocument, StagePlan, SQLite, stage operations, geometry, snapping, route evaluation, or shooter-profile models.
- Added fixed safe-area Back/name/Save bar, flexible Top Down/2.5D canvas and Add/Edit/Route/Plan/View action bar. Charcoal panels, gray dividers, sand accents and original silhouette tiles replace the green-heavy editor chrome.
- Added a selected-object action strip with Move guidance, Rotate, Edit, Duplicate, confirmed Delete and deselection. The strip does not resize the canvas and hides while dragging. Reset Positions and route-position deletion require confirmation.
- Added dismissible, keyboard-aware slide-up inspectors and separate PLAN sections; target round assignments are also available in the selected target inspector. VIEW contains preview switching, grid/route visibility, Fit/reset viewport and Grid/Snap settings.
- Route mode has its own position/assignment/reload/summary/exit actions. Route statistics and existing evaluation warnings stay in the summary panel; route overlays can remain visible but noninteractive during object editing.
- Added viewport-only one-finger background panning and anchored two-finger pinch zoom (50-300%), zoom buttons, percentage and Fit. Finger-count changes rebase the gesture to prevent jumps. Drag conversion still uses physical inches through the existing inverse transform.
- Removed the ScrollView ancestor of the canvas. Object and route-marker responders keep single-finger ownership and yield to a parent pinch; native back gestures disable during canvas interaction. Preserved usePreventRemove and the explicitly web-only beforeunload guard.
- Validation: 104 tests pass (all 97 existing plus seven viewport regressions); TypeScript and iOS Hermes export pass. Phone-width browser smoke (including touch gesture handoff and route panels) and git diff --check pass; details are recorded in mobile/README.md. Physical iPhone verification remains pending. No commit or push.


### Native New Stage crash fix - 2026-09-19

- New Stage now persists native-safe default StageDocument, StagePlan and route data before opening Builder.
- SQLite/creation failures are logged and shown in Stage Planner instead of becoming unhandled React Native fatal exceptions.
- Added a SQLite round-trip regression for the new-stage payload.

### Prototype 2 Phase 2 manual routes - 2026-09-18

- Added Stage editing / Route planning modes in the existing builder, sharing the authoritative stage. Route markers hide in editing mode; existing object editing, ADD menu, snapping, preview and loadout remain available.
- Added ordered, labeled, draggable shooting positions in physical inches, START-connected route lines, target numbers, manual visibility, unique intended engagements and reorder/delete controls.
- Added a versioned optional route in StagePlan with target-ID references and explicit reload choices. Existing SQLite payloads remain compatible; saves, reopening, duplication and unsaved-edit protection include routes. Reset clears route/engagements and retains loadout.
- Added derived movement distances, magazine/chamber simulation and warnings for shortages, missing targets/magazines, reused magazines, unassigned targets and missing planned rounds. Target counts reuse StagePlan.engagements; no shot-count defaults are invented.
- Added profile-based movement/draw/split/transition/reload timing, clearly provisional for incomplete plans. Straight-line movement and reloads are additive; reloads occur before engagement and discarded magazines cannot be reused. No automatic route generation or line-of-sight solver.
- Route payload validation protects saved copies. Selected overlapping route markers render above other markers; new default position labels avoid duplicates after deletion.
- Validation: all 95 tests pass (83 existing plus 12 route/persistence tests); TypeScript passes. Native-device interaction remains pending.

### Prototype 2 Phase 1 - 2026-09-17

- Home now opens a stack-based Expo Router flow to Stage Planner, Saved Stages, Stage Builder, Training and Account.
- Moved the existing builder into `src/editor/StageBuilder.tsx`; retained the stage model, physical operations, geometry, snapping, preview and planning systems.
- Added explicit stage naming/saving, reopening, renaming, independent duplication and confirmed deletion. Unsaved edits are guarded on navigation and browser unload.
- Added Expo SQLite and a repository with versioned document/plan payloads, local profile and training tables. Parameterized SQL stays outside React components.
- Replaced six add buttons with categorized full-screen icon tiles using existing object actions. Start selects the required existing start; firing ports remain wall-inspector edits.
- Added a shared dark technical screen style, typed training records and six starting types, plus a separate shooter performance profile with estimate defaults.
- Training currently displays records and explains that recording/drills are coming later. Account displays a persistent local profile; no authentication or route planning was added.
- Automated stage/planning and SQLite tests pass (83 tests), including database close/reopen, all object kinds, ammunition preservation, rename/copy/delete isolation, training records and profiles.
- TypeScript passes; Expo web starts, browser smoke checks pass, and the iOS production Hermes bundle exports successfully. Physical iOS/Android interaction still needs device verification.
- Browser reload verification retains start rotation, magazine capacity/loaded rounds and starting-magazine designation. Home screenshot inspected; `git diff --check` passes.
- Fixed SDK 57 SQLite web startup by using single-page output with WASM/cross-origin headers; close connections on page exit and prevent caching a worker that retains exclusive SQLite file handles.
- New TestFlight binary required for the added native SQLite dependency. No commit or push.

### Ammunition/loadout planning foundation - 2026-09-10

- Added separate shooter StagePlan with stable magazine IDs, labels, capacities, actual loaded counts, starting-mag designation and an independent chambered round.
- Added expandable Loadout / Planning UI with magazine add/delete/edit, chamber toggle and planned-round assignments for cardboard and steel only.
- Added available/planned/reserve totals and shortage warning. Invalid counts reject atomically; deleted/non-scoring references cannot consume ammunition.
- Stage Reset clears engagements while retaining loadout; duplicates start unassigned. Physical schema v7 and stage objects remain unchanged.
- Validation: TypeScript and all 80 stage/planning tests passed; git diff --check passed. No installs, exports, commits or pushes.
- No engagement order, running magazine/reload simulation, optimization, visibility solving, persistence or other excluded features. Device interaction remains unverified.


### First read-only 2.5D visualization - 2026-09-10

- Added Top Down / 2.5D toggle without replacing the authoritative editor or changing schema v7. Preview consumes the same StageDocument and retains Top Down selection/settings.
- Added pure orthographic projection and physical surface generation, displayed as SVG through the existing expo-image dependency.
- Walls render height/thickness and true rectangular port openings with jambs/sills/lintels. Paper faces honor physical cut extents and elevation; steel uses stored dimensions; fault lines/start remain on physical ground.
- Added five-foot ground grid, selected-object outlines, 15-degree view rotation and 0.5?3x preview zoom. All editing remains in Top Down.
- Validation: TypeScript and all 77 stage tests passed; git diff --check passed. No installs, exports, commits or pushes.
- Native rendering/control verification remains pending. Depth ordering is approximate, popper contour representative, and no visibility solving or other excluded features were added.


### Editor object-operation cleanup - 2026-09-10

- Added arbitrary selected deletion and physical duplication for all six standalone palette kinds; Start Position remains protected.
- Duplicates retain physical properties and cuts, clone child ports with fresh UUID IDs, and use a bounded one-foot offset with reverse-direction fallback.
- Replaced per-type Remove buttons with a compact creation palette and generic Duplicate/Delete actions. Creation spawns at stage center and selects the new object.
- Centralized editor action/selection handling outside StageDocument; Reset and deletion clear selection. Existing physical schema v7 and zoom/snapping/inspector behavior are retained.
- Validation: TypeScript and all 72 stage tests passed; git diff --check passed. No installs, exports, commits or pushes.
- Device interactions remain unverified; overlapping placement is allowed. No excluded planning, rendering or analysis features added.


### Physical cardboard and no-shoot cuts - 2026-09-09

- Advanced schema to v7 with a discriminated physical faceCut preset on cardboard/no-shoot targets: full, upper, lower, left and right.
- Added authoritative active-face extents; asymmetric rotated bounds and alignment anchors use retained material. Upper/lower cuts reduce vertical extent, not plan depth.
- Preserved the uncut reference position/elevation, rotation, ID and role on preset changes. Invalid or out-of-bounds preset changes are rejected atomically.
- Added inspector preset buttons and simple retained-rectangle badges with distinct cardboard/no-shoot colors and labels. Default and Reset paper faces remain full.
- Validation: TypeScript and all 64 stage tests passed; git diff --check passed. No installs, exports, commits or pushes.
- No occlusion semantics, overlays, polygon editing, detailed scoring or other excluded features. Device rendering/gestures remain unverified.


### Wall-owned firing ports - 2026-09-09

- Advanced to schema v6; walls own zero or more rectangular firing ports with stable UUID IDs, wall-center-relative offset, width, height and wall-bottom-relative sill, all in inches.
- Added selected-wall Add Port / Remove Port controls, numbered port selection and measurement editing. New/default walls start without ports.
- Added numbered cyan top-down opening spans that inherit wall movement/rotation without rewriting local geometry. Existing wall bounds/snapping use the full wall footprint.
- Added atomic containment and finite/positive measurement validation, including rejection of wall resizes that invalidate ports and duplicate port IDs across walls.
- Validation: TypeScript and all 57 stage tests passed; git diff --check passed. No installs, Expo exports, commits or pushes.
- Overlapping ports are allowed; no visibility solving, persistence or other excluded features. Device interaction/rendering remains unverified.


### Mobile steel plates and poppers - 2026-09-09

- Added explicit steelPlate and steelPopper kinds in schema v5 using authoritative face width/height, center position, clockwise rotation and bottom elevation. Plate defaults are 12 x 12 inches at Z=48; poppers are representative 12 x 42-inch upright faces at Z=0.
- Reused physical span bounds, center/endpoint snapping, selection, dragging, inspector validation and UUID IDs. The popper inspector labels face height as Overall height.
- Added blue-gray SP plate and P popper silhouettes and dedicated add/remove controls. Default seven-object layout and Reset/editor-setting behavior are preserved.
- Added creation, movement, rotation, dimensions, elevation, bounds, snapping, inspector, unique-ID and Reset regression tests.
- Validation: TypeScript and all 52 stage tests passed; git diff --check passed. No package installs, commits or pushes.
- No detailed popper contour, base/stand volume, falling simulation, visibility calculation, persistence or other excluded features. Device verification remains pending.


### Mobile cardboard and no-shoot targets - 2026-09-09

- Replaced generic target proxies with explicit cardboardTarget and noShootTarget objects in schema v4. Face width/height, X/Y center, clockwise rotation and bottom elevation are authoritative physical data in inches.
- Upright face spans drive shared bounds and center/endpoint snapping; face height does not become ground depth. Default cardboard targets are editable 18 x 30-inch faces at 48-inch bottom elevation, retaining default IDs/locations.
- Added distinct brown C and white NS target symbols with physical span lines, dedicated add/remove controls, and face dimension/elevation inspector fields. Existing selection, dragging, rotation and Reset behavior is retained.
- Extracted inspector field parsing for direct regression coverage. Added target creation, movement, rotated bounds, dimensions, elevation, snapping, inspector edits, ID and Reset tests.
- Validation: TypeScript and all 43 stage tests passed; git diff --check passed. No packages installed, commits or pushes.
- No persistence/migration, scoring zones, occlusion or other deferred object types added. Device interaction and rendering remain unverified.

### Mobile walls and ground fault lines - 2026-09-09

- Walls now store physical length, thickness, and height explicitly; center position, rotation, and existing editing behavior are preserved.
- Added the faultLine type with length-only geometry, zero ground elevation, gold-strip rendering, and shared movement, bounds, grid/alignment snapping, rotation, selection, and inspector editing.
- Added Add Fault Line / Remove Fault Line controls with UUIDs and last-of-type removal. Default layout is unchanged; Reset removes added fault lines.
- Advanced the document schema to v3 for the wall field rename; no persistence or migration added.
- Validation: TypeScript and all 32 stage tests passed. No exports, package installs, commits, or pushes. Device interaction remains unverified.

### Mobile measurement grid and precise editing - 2026-09-09

- Added physical 6-inch minor/12-inch major grid lines and 5-foot labels as viewport overlays.
- Added 12/6/3-inch center snapping, 3-inch object-axis alignment tolerance, 15/5/free rotation snapping, and temporary visual snap feedback. Settings are editor state; schema remains v2.
- Added selected-object numeric position, rotation, dimension, and elevation editing with feet/inches hints and decimal/fractional measurement input. Start-region position and resizing are complete.
- Centralized atomic edit validation and physical bounds. Invalid or oversized edits are rejected without mutating the document.
- Extracted dragging, grid, guides, settings, and inspector components from StageViewport.
- Fixed signed-zero and floating-point half-step rounding discovered by snap regression tests.
- Validation: all 27 stage tests, TypeScript, Expo web/static export, Android/iOS Hermes exports, and `git diff --check` passed. Device gestures and keyboard interaction have not been manually tested.


### Mobile physical stage and viewport foundation - 2026-09-09

- Added schema 2 physical coordinates in inches and a provisional 480 x 360-inch workspace.
- Added center-based rectangular geometry, elevation, normalized clockwise rotation, and exact rotated footprint bounds. Fixed right/bottom escape during dragging; rotation also constrains objects within the stage.
- Added temporary selection, rotation buttons, measured viewport fit, and 0.5x-3x zoom. Reset clears selection but preserves zoom/pan. Pan transforms are supported; interactive panning is deferred.
- Replaced count-based add IDs with UUID v4 from existing Expo modules, with duplicate insertion protection.
- Extracted viewport rendering/dragging; added scrollable controls, a selection outline, and 12 lightweight stage tests.
- Object dimensions are provisional proxies, not competition specifications. No persistence or additional object types.
- Validation: TypeScript passed; all 12 stage tests passed; Expo Android/iOS Hermes bundles and web static export passed; git diff whitespace checks passed. Native device gestures were not manually tested.

### Mobile Stage Model Foundation - 2026-09-09

- Added a versioned StageDocument with one ordered collection of target, wall, and start objects.
- Centralized fresh defaults and ID-based movement; added explicit document/viewport coordinate types with identity conversion in legacy layout units.
- Migrated the mobile editor to shared document state and dragging while retaining styles, positions, dimensions, drawing order, add/remove/reset semantics, and minimum-only bounds checks.
- Physical coordinates and stable ID allocation remain proposed follow-up work; no persistence or new editor features added.
- Validation: TypeScript passed; Expo Android/iOS/web export passed (Hermes required execution outside the sandbox); inline regression checks passed for defaults, reset isolation, coordinate round trips, movement/clamping, 500 legacy add/remove comparisons, and unchanged styles. On-device gestures were not manually tested.

### Added

- A responsive 2D stage-planning area.
- Three labeled shooting-position blocks with mouse, touch, and pen dragging.
- Boundary checks that keep position blocks inside the stage.
- A button that returns all blocks to their starting positions.
- Simple, clean styling with a stage grid and clear drag states.
- Three draggable, cardboard-shaped target markers.
- Three draggable wall objects in horizontal and vertical orientations.
- Controls for adding and removing targets and walls during a session.
- Unique internal IDs for dynamically created targets and walls.

### Changed

- Added future stage-planning ideas to `features.md`.
- Extended boundary checking and reset behavior to targets and walls.
- Simplified the stage to one draggable block labeled `Start Position`.
- Reset now removes added objects, restores removed defaults, and returns every default object to its starting location.
- Reused the shared drag behavior for both default and newly created objects.

### Fixed

- Nothing yet.
# Phase 6A automatic shooting-position discovery - 2026-09-21

- Added a pure opt-in physical-grid discovery engine, rotated wall collision/segment helpers, target-center LOS with explicitly projected port openings, and inferred visibility/distance/difficulty metadata using the existing shootingDifficulty helper.
- Added deterministic proximity/target-set/per-target-difficulty deduplication, optional Start distance context, fresh manual-compatible position conversion, centralized hard search bounds and explicit geometry/truncation warnings. Existing manual positions, generation, evaluation, ranking, persistence and UI remain unchanged.
- Documented legal-area, reachability, clearance, elevation, sampling and Phase 6B integration limits in mobile/src/planning/positionDiscovery.md.
- Validation: TypeScript passed once; full existing suite passed once, 169 tests total including 17 new focused discovery tests. No browser, screenshots, export or device tooling run.

## Phase 8A: local video analysis foundation - 2026-09-22

- Added typed video sessions/results to existing Training records and SQLite JSON persistence; no new database or cloud upload. Native picker cache files move into app-owned documents; web uses local page-session media with original-file relinking.
- Added millisecond timelines, explicit seconds/frame conversions with unknown-FPS rejection, source/confidence/confirmation metadata, marker edit/delete/confirm, movement segments and manually labeled shot strings.
- Added deterministic response, split, reload, post-reload, movement, transition and total intervals, including the 2R2 example. Missing sequences remain partial; reload/movement/target boundaries never become splits; physical distance is never inferred.
- Replaced the Training placeholder with minimal named-session creation, context/start selection, video import and a dark annotation editor with playback/scrubbing/stepping, marker editing, measurement/completeness review, save/discard and explicit profile contribution.
- Inspection found only Phase 7A scalar profiles/evidence in this checkout, not the observation/calibrator system described in the request. Added the minimal typed observation/calibration bridge to existing fields and guards, preserving VIDEO_ANALYSIS provenance and separate contexts. No alternate shooter profile system.
- Only manual or user-confirmed evidence contributes. Repeated contribution replaces samples; annotation edits/deletes withdraw stale samples; calibration and Training persistence roll back together on failure. Legacy records load; unknown analysis versions reject without overwrite.
- Added Expo 57 video/document-picker/file-system dependencies; no camera, microphone or broad media permission requests; background playback and picture-in-picture are disabled. Automatic analysis remains deferred.
- Final verification: TypeScript passed once and all 231 tests passed once (32 new focused video tests). No screenshot/browser automation, iOS export, commit or push was performed.

## Phase 7B completion - 2026-09-22

- Generalized the working Phase 8A observation bridge for structured/manual measurements and future confirmed detectors, with one deterministic rebuild API, context-isolated statistics and existing confidence-model support.
- Added explicit removable manual overrides, capture of newer scalar edits, safe legacy baseline migration, deterministic duplicate-conflict exclusion, runtime sample validation, and observation add/replace/remove/rebuild repository APIs.
- Fixed slow valid results being discarded by performance thresholds, high-variability evidence rejection, stale baseline restoration over manual edits, and video withdrawal incorrectly affecting non-video samples.
- Added physical movement, raw reload, transition, distinct response/acquisition storage, and difficulty-tagged split curve calibration using the existing planner scale and interpolation.
- Preserved atomic video/profile writes, confirmed-evidence gating, existing timeline/editor behavior, route evaluation/ranking and database schema version.
- Verification: 252 tests passed in one suite run, including 21 new calibration regressions and all existing video tests. TypeScript passed after correcting one narrowing error and rerunning only the type check.
# Phase 8B local audio suggestions - 2026-09-22

- Added a local iOS Expo module using AVFoundation to decode imported video audio to bounded 16 kHz mono PCM with video PTS alignment; no new external package, network service or permission. Missing-module/unsupported platforms retain manual editing.
- Added deterministic frame features, frequency-flexible timer candidates, impulsive shot candidates, centralized limits/confidence, close-echo suppression, trusted-marker deduplication and recoverable warnings/cancellation.
- Added explicit Analyze/Re-analyze Audio and individual preview/edit/confirm/delete in the existing timeline. Analysis yields for manual editing and merges into current state; confirmed events survive reruns.
- Reused timeline derivation and the existing observation/calibration pipeline. Trusted SHOT events can acquire a first-shot timing role without relabeling; string durations are derived alongside splits. Suggestions never auto-confirm or invoke profile contribution.
- Persisted bounded versioned run diagnostics and original detector provenance through normalization/SQLite. PCM and feature arrays remain temporary.
- Added synthetic detector and persistence coverage; updated the prior deletion regression to expect first-shot timing from the earliest remaining trusted SHOT. Native build/decode/playback still requires physical-device verification. Details: mobile/src/training/audioDetection.md.
- Validation: TypeScript passed once; full suite passed once with 275 tests (23 new). Expo autolinking resolves TrainingAudio. Confidence/noise thresholds were then collected into the same config without changing their values; the focused audio tests were rechecked.
# Phase 8C local pose and movement suggestions - 2026-09-22

- Added the local TrainingPose Expo module: sequential orientation-corrected AVFoundation frame sampling plus Apple Vision body pose, actual presentation timestamps, bounded samples/images and progress/cancellation. No external dependency, network inference or permission change.
- Added typed normalized joints, conservative subject continuity, deterministic time-based smoothing, reaction/gross movement/temporal position suggestions and acceleration/stabilization diagnostics. Camera ambiguity and missing observations degrade or stop detection without inventing joints or physical distance.
- Added Analyze Movement, purple reviewable timeline markers, movement interval bars and optional sparse skeleton overlay with letterbox alignment and exact saved-sample preview. Audio remains separately available; edits remain available during analysis.
- Reused trusted-event measurement derivation and explicit shared observation/profile contribution. Confirmed reactions feed stimulusResponseTime; movement speed still requires a known physical distance. Unconfirmed pose markers do not change trusted measurements or shooting strings.
- Persisted bounded versioned pose diagnostics and up to 120 selected preview samples. Reruns preserve confirmed/manual/audio evidence. Added synthetic pose, bridge error/cancellation and SQLite persistence coverage. Native device verification remains planned; see mobile/src/training/poseDetection.md.
- Validation: TypeScript passed once and all 302 tests passed in one full-suite run, including 27 new pose tests. Expo autolinking resolves TrainingPose; no screenshots/browser automation, iOS export, commit or push.

## Phase 8D local close-up analysis - 2026-09-22

- Extended the local Vision module with bounded hand pose, user-selected region tracking, actual timestamps, display orientation normalization, translational registration, progress and cancellation.
- Added validated normalized samples, conservative hand continuity, descriptive paths/velocity/variance/coverage, configurable pre/post-event summaries, return/settle and generic transition/proximity suggestions. Camera ambiguity lowers confidence; gaps stay missing.
- Added current-frame region selection and toggleable sparse overlay to the existing player, metric review and normal timeline confirmation/rejection. Persisted bounded diagnostics in existing Training JSON; reruns retain all manual/confirmed evidence and other detector runs. No physical scoring, semantic recognition, cloud inference or permission changes.
- Native build/device validation remains required; see mobile/src/training/closeUp.md. No screenshots, browser automation, iOS export, commit or push.

- Final Phase 8D validation: TypeScript passed once; full suite passed once with 327 tests, including 25 new close-up tests. The focused fixture run exposed the transient-transition bug before final validation. Git whitespace check passed.
# Phase 8E - General event fusion - 2026-09-22

- Added a pure bounded fusion module with normalized compact evidence, explicit event compatibility, per-category timing tolerances, trusted anchors, family-balanced weighted median timestamps, independent-modality confidence, warning penalties and deterministic explanations.
- Persisted versioned hypotheses and evidence references alongside untouched detector runs. Manual/confirmed events retain type/time; new support attaches without recreating them. Independent reruns retain confirmed provenance and unaffected detector outputs.
- Added raw/fused/confirmed review, evidence inspection, editable one-event confirmation, evidence-preserving rejection and duplicate timeline suppression. Existing explicit observation/profile contribution boundaries remain in place.
- Added synthetic coverage for modality combinations, confidence independence, warnings, disagreement, malformed input, bounds, reruns, confirmation/edit/rejection, profile boundaries and SQLite provenance persistence.
- Implementation policy and limitations: mobile/src/training/eventFusion.md. Device verification and empirical calibration remain planned in features.md.
- Validation: TypeScript passed once; full suite passed once, 364/364 tests (37 new). No screenshots, browser automation, iOS export, commit or push.
# Phase 8F-A - Planned versus confirmed execution - 2026-09-22

- Added optional per-video historical stage/route snapshots with saved revision, capture time, fixed evaluator inputs/output and versioned manual mapping records. Video recalculation and independent detector reruns retain links; live edits never rewrite snapshot history.
- Added pure confirmed-only movement, dwell, string, reload and total comparison. Exposed per-position engagement detail from the authoritative route evaluator without changing its timing formulas. Unknown dwell estimates remain unavailable.
- Added reload raw/overlap/additional comparisons and reconciled delta buckets with explicit residual/unattributed time. Conflicting, stale and unconfirmed mappings are excluded; malformed historical comparisons leave normal video analysis usable.
- Added Training's Compare to Plan workflow with stage/route selection, read-only existing StageViewport/RouteOverlay, interval highlighting/preview, add/update/remove mappings, completeness and descriptive review. Existing explicit calibration is unchanged.
- Added focused synthetic and SQLite reopen coverage. Remaining device verification and Phase 8F-B work are tracked in features.md; policy is in mobile/src/training/executionComparison.md.
- Final validation: TypeScript passed once; full suite passed once, 398/398 tests (34 new). No screenshots, browser automation, iOS export, commit or push.
# Headless Route AI tool layer - 2026-10-05

- Added immutable inches-only assistant context, exact content revisions, strict typed/runtime-validated command union and deterministic read/explanation/comparison queries. No model, chat, network AI or arbitrary JSON patch API.
- Added move/add/delete/reorder/replan/temporary-avoidance previews with geometry/coverage validity, before/after deltas and transient focus metadata. Replan calls the existing authoritative solver; stage and plan schemas/semantics are unchanged.
- Added controlled acceptance with stale/tamper checks, revalidation and existing document history record/undo integration. Accepted changes remain dirty editable data requiring explicit Save; temporary constraints never enter stage/plan persistence.
- Added 26 deterministic assistant tests and a repeatable preview benchmark. TypeScript passed; all 634 tests passed, preserving 608 existing tests. Desktop ten-region replan/avoid medians were 438.13/485.86 ms; scheduling and native/host integration remain documented follow-ups.
- API, file inventory, history/acceptance contract, performance, limitations and future-model entry point are recorded in docs/route-assistant.md. No commit or push.

# Manual PATH editor - 2026-10-15

- Added optional endpoint-keyed route connections with separate unnumbered bend records and STRAIGHT/ROUNDED styles. Legacy routes default to straight connections; no SQLite schema migration is needed.
- PATH opens manual editing, with ENGAGE and REVIEW visibly reserved. Select a numbered waypoint for its incoming section, tap + to insert bends, drag diamonds, and use CONNECTION for style and bend deletion. Existing waypoint creation, dragging, deletion and ordering remain available.
- Rounded geometry uses bounded quadratic corner cuts (at most 12 inches and 20% of either adjacent edge), sampled in stage inches. Distance/timing and the overlay share geometry. Endpoints stay fixed; reorder/delete removes disconnected geometry.
- Route edits use existing document undo/redo and plan JSON persistence without changing physical objects. Added geometry, transform/history and SQLite reopen regressions.

# Manual ENGAGE mode - 2026-10-15

- Added separate manual engagement records with stable UUIDs, target IDs, direction angles, waypoint-ID anchors and endpoint-pair section IDs with normalized arc-length fractions. Reuses the same stage-inch samples as STRAIGHT/ROUNDED PATH rendering. No SQLite schema migration, dependency, or native permission change.
- Added drag-to-target creation, short directional arrows, temporary dotted guides, target highlighting, selectable unlettered route markers and independent A/B/.../AA waypoint sequences. Contextual selection supports target reassignment, direction drag/rotation, deletion and per-waypoint ordering; the engagement list also makes overlapping arrows accessible.
- Kept PATH handles and stage objects independent of ENGAGE gestures. Empty-canvas pan and pinch navigation remain available; a second finger cancels creation without resuming after pinch. Release, invalid targets and responder termination clear transient guides without recording partial annotations.
- Added split/merge reconciliation preserving engagement/target IDs, removal of annotations attached to deleted waypoints/targets, and safe removal of sections broken by reorder. Existing document history groups edits and restores complete annotations with undo/redo.
- Older stage records and assignment metadata remain supported. Manual annotations persist in existing plan JSON; legacy timing/coverage/legality analysis stays separate and now explains that limitation. REVIEW remains reserved.
- Kept selection controls in a contextual sheet so selecting/deselecting arrows cannot resize the canvas during a gesture. Final verification: complete 726-test suite and TypeScript passed; whitespace check passed.

# Manual REVIEW mode - 2026-10-15

- Added pure derived review of distinct eligible target IDs, unassigned targets, invalid references, saved engagement sources/counts and actual rendered route distance. Coverage excludes no-shoot targets, props, missing targets and unresolved anchors; no persistent coverage state or timing model was added.
- Added assigned green checks, unassigned dashed amber outlines/exclamation marks, selected-target emphasis, an unassigned-only review filter, compact target inspector and scrollable summary/assignment sheets. Selecting a source highlights and centers its saved route anchor without changing zoom or route data.
- REVIEW uses existing canvas pan/pinch/tap handling with PATH/ENGAGE editing disabled. Mode switches preserve geometry, annotations, viewport and applicable selections. Target/source inspection is independent of legacy ammunition/timing analysis and does not establish visibility or feasibility.
- Preserved structurally valid but unresolved saved references for inspection and explicit confirmed removal with Undo/Redo. Storage still rejects malformed anchors, duplicate engagement IDs and nonfinite values; new ENGAGE creation still requires an existing eligible target and valid anchor. Older stages require no migration.
- Validation: complete 740-test suite (+14), TypeScript and whitespace checks passed. Expo production web export and iOS Hermes export passed; iOS required an approved retry after sandbox permission denial. Physical iPhone checks remain in features.md.
