# Changelog

Record completed features, changes, and bug fixes. Add new releases or updates above older entries.

## Unreleased

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
