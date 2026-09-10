# Changelog

Record completed features, changes, and bug fixes. Add new releases or updates above older entries.

## Unreleased

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
