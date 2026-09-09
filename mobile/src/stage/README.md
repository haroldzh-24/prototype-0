# Physical stage foundation

Schema 2 stores inches, with X pointing right, Y depth pointing down in the top-down view, and Z elevation pointing up. The provisional workspace is 480 x 360 inches (40 x 30 feet), not a competition standard. Dimensions live on the document and viewport/bounds functions consume them; dimension-editing UI is deferred.

Object X/Y is the center of its rectangular ground footprint. Z is its bottom elevation; geometry.height extends upward from Z. Rotation is clockwise in the top-down view, in degrees normalized to [0, 360). Rendering rotates about the same center. These conventions are view-oriented, not a promise of a right-handed 3D camera convention.

Provisional geometry (width x depth x height, inches):
- Target: 24 x 24 x 30, bottom elevation 48. The ground rectangle is a placeholder envelope for the target assembly, not a cardboard face or official target dimensions.
- Wall: 96 x 4 x 72, bottom elevation 0; width is wall length, depth is thickness.
- Start: 48 x 36 x 0, bottom elevation 0; a ground region.

The document contains no screen dimensions or editor selection. Viewport state stores zoom and screen-layout-unit pan offsets. Scale is min(viewportWidth/stageWidth, viewportHeight/stageDepth) times zoom. Offsets center the scaled stage then add pan. X/Y inverse projection requires callers to retain Z because the top-down projection discards elevation.

Zoom ranges from 0.5 to 3 and is centered on the viewport. Reset restores defaults and clears selection while preserving zoom/pan. Interactive pan is deferred to avoid object/scroll gesture conflicts; transforms support it and tests cover it. Zoom out to recover objects outside the visible viewport.

Rotated rectangular footprint bounds keep objects fully within the workspace. An object larger than the workspace is centered on each oversized axis. Rotation can move an object inward near a boundary. Later nonrectangular geometry needs a corresponding bounds implementation.

New object IDs use Expo's existing UUID v4 generator, injected into the pure ID helper. Generate once per add event, outside React state updaters. Duplicate insertion is rejected. Default IDs are stable within a document; cross-document identity will need a document ID when persistence arrives. Schema 1 layouts are not automatically converted: no real-world scale was established in that version and no persistence exists.

Run npm run test:stage for pure model/geometry checks. No renderer, persistence, snapping, or geometry for additional object kinds is included in this phase.
