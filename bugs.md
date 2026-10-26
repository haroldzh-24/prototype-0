# 3D view and eye-level walk - 2026-10-25

- To check on a device after the next build (3D needs `expo-gl`, a native module): orbit and pinch feel, dragging a selected object, frame rate on a large stage, the eye view's scrubber, day/night colours outdoors.
- Known limits: sight lines in the eye view are plan-view lines with wall heights (same assumption as the planner); targets do not cast shadows or show scoring zones in 3D; route editing stays in 2D.

# Redesign and night mode - 2026-10-25

- Fixed before release (batch 9): with the React Compiler on, screens kept their old colours after a theme switch; turned the compiler off. Web: a second SQLite database for the theme choice made fresh loads fail about 1 in 3 times; web now uses localStorage.
- To check on a device: drag smoothness in the stage editor with the compiler off; switching Day / Night with the editor open (unsaved work must stay); System following the phone's dark mode (needs the next build, `userInterfaceStyle: automatic`).
- Not yet restyled to the mockups in detail: the drill logger's target diagram and video analysis colours keep their own palette (they sit on video or a paper target), and route-plan overlays keep their existing shapes.

# Rulebook research findings - 2026-10-25

- Fixed (batch 7): steel could be planned from closer than the rulebook minimum (a DQ); drill scoring ignored USPSA miss and no-shoot penalties and over-penalized PCSL tagged misses.
- Open, from the research (planned in `docs/rules/gap-list.md`): IDPA tactical priority is approximated as near-to-far; walls have no soft-cover or "treat as infinite" setting; no off-limits lines; the USPSA 8-hits-per-view rule is not checked.
- Unconfirmed: whether the app's USPSA "Metric" and "Classic" presets are the rulebook's "USPSA" and "IPSC" targets (they may not be mixed on one stage). Not enforced until confirmed.

# Route Planner V2 review - 2026-10-22

- Fixed (batch 5, details in changelog.md): ignored route settings and "engage after" procedures; the analysis and V2 disagreeing on legality; saved stationary orders dropping targets after an illegal one; refinement leaving stops on the legal limit; 21 s UI freeze and slow cancel on large stages; L-shaped areas unreachable with travel limited to areas; flush-mounted targets hidden; straight-line assistant explanations; starts near walls rejected.
- Known limitation: visibility is sampled at five points across each face, so an opening narrower than the gap between samples can show as several short windows. Planning time on a phone is unmeasured (Node timings only); add to the hardware checklist run.
- Second review (batch 6): fixed a start inside a thin wall being nudged through it, the planner/analysis edge rule with outside travel off, search time-limit overruns, and two-box L-shaped areas. Note: the seeded random generator copied across older tests (`seed * 1103515245 + 12345` in floating point) loses precision and repeats after about 11,000-15,000 draws (measured for seeds 5, 7, 11, 23, 41). The existing tests draw a few hundred values, so they are unaffected; the new review tests use mulberry32, and larger fuzzing should too.
- Not changed by design: a saved moving order remains authoritative (an infeasible moving engagement stops the moving sequence there).

# RC2 batch 1 verification - 2026-10-22

- Fixed: unit suffix without a space parsed as yards; Reset dropping family/size; rotation snapping ignored for targets and segments; inconsistent wall pivot; off-stage grid snaps; zero-size/duplicate-ID documents accepted. Details in changelog.md.
- Not changed by design: rotating a target does not bounds-check its face, matching placement, which deliberately keeps the exact tap even when a face overhangs the edge.
- New finding: the iOS app icon (`assets/expo.icon`, `assets/images/icon.png`) is still Expo's default logo. Replace before wider TestFlight distribution.
- Reminder (open more than one month): September 9-10 device checks and the September 9 dense-snapping assessment remain unperformed; see mobile/docs/rc-hardware-validation.md.

# RC1 release blockers ? 2026-10-15

No crash/persistence blocker has been reproduced by automated checks so far. Dependency security review remains open: npm reports 30 advisories (18 high, 12 moderate), including router URL decoding; critical shell-quote was patched. See release notes before wider distribution. Native release qualification is unfinished: a signed EAS build, install/upgrade, persistence/lifecycle smoke tests and device memory/gesture/accessibility checks remain required. The web SQLite worker/OPFS reload issue remains open; web is experimental and is not the RC demonstration target.

[One current hardware checklist](mobile/docs/rc-hardware-validation.md) replaces all dated scheduling reminders below. September 9?10 device checks and September 9 snapping checks are over one month overdue and remain unperformed. Experimental recognition's known false candidates and lack of real samples remain documented limitations, with manual reconstruction available.

Completed RC fixes are recorded in changelog.md; [release notes](mobile/docs/release-candidate.md) contain current validation evidence. The October 15 repeat audit passed 786/786 automated tests and TypeScript without further runtime changes. Older entries below retain historical context; use only the consolidated checklist for current hardware status.

# Clean-diagram recognition verification - 2026-10-15

Current release status: [1.0.0 RC1](mobile/docs/release-candidate.md). The [single hardware checklist](mobile/docs/rc-hardware-validation.md) supersedes dated device reminders below; historical automated counts are not current RC results.

- Fixed the synthetic connected-L boundary being mistaken for a circle by requiring angular coverage, and fixed rounded wide-image downsampling being rejected by aspect validation; fixed rapid duplicate detection actions replacing the active cancellation controller. Completed changes and tests are in changelog.md.
- Known prototype errors: an isolated O-like glyph and dimension baseline produce two unknown false candidates in the negative fixture. Text/border suppression is heuristic and may also hide genuine small/repeated shapes or cropped boundaries. All proposals require review; unknown types cannot commit.
- No real diagrams or native execution were tested. Bounds/yield/timeout protections do not establish iPhone memory, latency, raster orientation, Swift compilation or cancellation quality. See [the report and unchecked native list](mobile/docs/diagram-recognition.md).
- Real icon classification, automatic units/scale, OCR and projection classification remain unfinished. September 9-10 device checks and September 9 snapping assessment remain more than one month overdue.

# Stage diagram import verification - 2026-10-15

- Source implementation and completed preservation/validation protections are recorded in changelog.md. No real-diagram recognition accuracy or native execution has been established.
- Remaining limitations: automatic layout/projection/semantic-symbol/real-scale detection is unavailable; basic geometric candidates are now supported; PDF/camera/native alignment require an unverified rebuilt iPhone client; browser PDF and Android preparation need adapters. Originals remain referenceable after preparation failure.
- Filesystem/IndexedDB and SQLite are separate stores; failed preparation can leave unreferenced files. Shared immutable originals are retained deliberately; safe cleanup/relinking remains planned. Existing browser SQLite/OPFS issues are unchanged.
- Physical-device and sample requirements: [stage diagram import](mobile/docs/stage-diagram-import.md). September 9-10 native checks and September 9 snapping assessment remain more than one month overdue; none were completed by this import work.

## Route planner iPhone follow-up - 2026-10-15

- Unperformed physical checks and the overdue September 9-10 backlog are consolidated in [the current checklist](mobile/docs/rc-hardware-validation.md). No device checks have been marked complete. September 9 snapping refinement also remains overdue.
- Completed interaction/accessibility fixes are recorded in changelog.md. Native focus, gesture interruption, safe areas, large text, latency and force-close restoration still require an iPhone.

# Route AI verification - 2026-10-05

- ASK, local Swift module, deterministic interpretation handoff, controlled preview acceptance and browser mock/unavailable journeys are implemented; completed work is in changelog.md and docs/route-ai.md.
- Native Foundation Models compilation/runtime linkage (local autolinking resolves), guided-generation accuracy, OS availability/error transitions, physical keyboard/gesture behavior, airplane-mode execution and model latency remain unverified on this Windows workspace. Use the Windows/EAS commands and device checklist in docs/route-ai.md.
- ASK now schedules RouteAssistant work after a UI yield, guards cancellation/timeouts/stale results, and avoids duplicate genuine replan solving on Apply. The solver CPU call is still synchronous JavaScript and can pause interaction on complex stages; true background execution and native cancellation responsiveness remain open. Ambiguous references clarify; avoiding a still-required area can remain impossible.
- Existing browser SQLite/OPFS and durable-media issues remain open. No schema/storage changes were made.
- No dated unresolved bug or feature exceeds one month as of October 5, 2026; undated legacy items cannot be aged reliably.

# Offline route solver verification - 2026-10-05

- Active legacy generation/ranking was replaced; completed implementation and benchmark-driven search fixes are recorded in changelog.md.
- Known model limits: finite candidate geometry rather than globally optimal continuous region paths, point movement/default zero body clearance, inferred fault connections requiring review, and target/reload assignment editing after adoption. See docs/offline-route-solver.md.
- Native end-to-end solver interaction/performance and browser journey execution are unverified. The browser audit script now uses the new Configure action; this pass verified real component solving/adoption and SQLite save/reopen automatically.
- Existing browser SQLite/OPFS teardown and media persistence issues remain open; no storage schema or teardown change was made.
- No dated unresolved bug or feature exceeds one month as of October 5, 2026; undated legacy items cannot be aged reliably.

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
- Current status (October 15, 2026): September 9-10 physical-device checks remain overdue and unperformed. Use mobile/docs/rc-hardware-validation.md; no replacement testing date has been scheduled.

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
# Headless route assistant verification - 2026-10-05

- Preview tampering, outdated document revisions, invalid physical coordinates and intervening-manual-edit undo are guarded; completed behavior is in changelog.md.
- Large solver previews and acceptance recomputation remain synchronous; ten-region desktop medians measured 438–486 ms. Native/background scheduling and physical-device timing remain follow-up work. See docs/route-assistant.md.
- Inherited solver/adoption limits remain: finite candidates, point movement, required-point fallback and reset assignments/reloads on replan. No storage, schema or solver algorithm change was made.
- No dated unresolved item is older than one month as of October 5, 2026; undated legacy items cannot be aged reliably.

# Manual PATH verification - 2026-10-15

- Fixed straight-only manual rendering and distance evaluation; completed work is in changelog.md.
- Native bend/waypoint touch and pinch handoff remain unverified in this Windows workspace. Existing browser SQLite/OPFS teardown issues remain open; repository close/reopen tests do not establish browser reliability.
- Older moving-engagement windows/analysis follow waypoint chords. Manual ENGAGE now uses authored-curve anchors independently; Manual REVIEW coverage is complete; timing/legality integration remains separate. PATH hides older engagement controls/overlays while editing.
- Reminder: September 9-10 physical-device verification items in features.md are now more than one month overdue.

- Validation: TypeScript passed. Initial full suite: 710/713 passed; three navigation regressions from automatic PATH entry were fixed by retaining explicit PATH entry. Relevant route/storage/UI rerun: 83/83 passed. Git whitespace check passed. Native gesture testing remains pending.

# ENGAGE verification - 2026-10-15

- Completed fixes (curve attachment, orphan references, temporary-guide cleanup and gesture isolation) are recorded in changelog.md.
- Physical iPhone touch, VoiceOver and layout verification remain open; see features.md. Existing browser SQLite/OPFS issues remain open. SQLite close/reopen tests do not certify browser storage reliability.
- Manual ENGAGE annotations do not feed the older ammunition/timing/legality calculations; the analysis screen explicitly identifies this limitation. Manual REVIEW now inspects saved assignments independently.

- Final ENGAGE verification: complete suite 726/726 passed, TypeScript passed, and git whitespace check passed. No test failures remain. Source-level responder tests cover creation, invalid release, pinch cancellation, normal pan, termination and guide cleanup; physical iPhone verification is still pending.

# Manual REVIEW verification - 2026-10-15

- Completed fixes for discarded stale saved references, misleading arrow counts and chord-only review distances are in changelog.md. Missing target/anchor references remain inspectable, never count toward coverage and require explicit confirmed removal. Deliberate deletion of valid targets/waypoints retains existing annotation cleanup.
- Physical iPhone layout, VoiceOver, hit regions and gesture checks remain pending in features.md. Existing browser SQLite/OPFS issues remain unresolved; successful repository round trips do not certify browser storage behavior.

- Final REVIEW verification: complete suite 740/740 passed (14 added over the 726 baseline), TypeScript passed, and whitespace check passed. Expo production web export and iOS Hermes bytecode export passed. The initial iOS export was blocked by sandbox compiler permissions; the approved outside-sandbox retry passed. Native compilation/device interaction and existing browser OPFS reliability remain unverified.
