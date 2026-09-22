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
