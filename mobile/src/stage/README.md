# Physical stage foundation

Schema 3 stores inches, with X pointing right, Y depth pointing down in the top-down view, and Z elevation pointing up. The provisional workspace is 480 x 360 inches (40 x 30 feet), not a competition standard. Dimensions live on the document and viewport/bounds functions consume them; dimension-editing UI is deferred.

Object X/Y is the center of its rectangular ground footprint. Z is its bottom elevation; geometry.height extends upward from Z for objects with height. Fault lines have no height field and stay at Z=0. Rotation is clockwise in the top-down view, in degrees normalized to [0, 360). Rendering rotates about the same center. These conventions are view-oriented, not a promise of a right-handed 3D camera convention.

Provisional geometry (width x depth x height, inches):
- Target: 24 x 24 x 30, bottom elevation 48. The ground rectangle is a placeholder envelope for the target assembly, not a cardboard face or official target dimensions.
- Wall: length 96, thickness 4, height 72, bottom elevation 0. These names are authoritative stored geometry fields.
- Start: 48 x 36 x 0, bottom elevation 0; a ground region.
- Fault line: stored length 96, ground elevation 0, no height/occlusion fields. A provisional fixed 2-inch strip width is shared by rendering and bounds through footprint().

The document contains no screen dimensions or editor selection. Viewport state stores zoom and screen-layout-unit pan offsets. Scale is min(viewportWidth/stageWidth, viewportHeight/stageDepth) times zoom. Offsets center the scaled stage then add pan. X/Y inverse projection requires callers to retain Z because the top-down projection discards elevation.

Zoom ranges from 0.5 to 3 and is centered on the viewport. Reset restores defaults and clears selection while preserving zoom/pan. Interactive pan is deferred to avoid object/scroll gesture conflicts; transforms support it and tests cover it. Zoom out to recover objects outside the visible viewport.

Rotated rectangular footprint bounds keep objects fully within the workspace. An object larger than the workspace is centered on each oversized axis. Rotation can move an object inward near a boundary. Later nonrectangular geometry needs a corresponding bounds implementation.

New object IDs use Expo's existing UUID v4 generator, injected into the pure ID helper. Generate once per add event, outside React state updaters. Duplicate insertion is rejected. Default IDs are stable within a document; cross-document identity will need a document ID when persistence arrives. Schema 1 layouts are not automatically converted: no real-world scale was established in that version and no persistence exists.

Run npm run test:stage for pure model/geometry checks. No persistence is included. The supported kinds are the existing target/start markers, walls, and ground fault-line segments.

## Phase 3A precision editing

The grid is derived from physical stage dimensions: 6-inch minor lines, 12-inch major lines, and labels every 5 feet. It is an editor overlay, never document data.

Snapping is temporary editor state. Defaults: enabled, 6-inch center-position grid, object alignment enabled with a 3-inch physical tolerance, and 15-degree rotation increments. Position increments are 12/6/3 inches. Rotation supports 15/5 degrees or free; the master switch disables both position and rotation snapping. Settings, zoom, and pan survive Reset; defaults/selection reset as before.

Dragging snaps the raw physical destination, never the last snapped point, so movement does not accumulate quantization drift. Grid rounding chooses the nearest multiple (exact halves toward positive infinity, with a tiny floating-point tolerance). Object alignment then overrides the grid independently on each axis if a feasible anchor lies within tolerance. Anchors are centers and rotated edge midpoints; wall length-axis midpoints are endpoints. Nearest candidates win, ties use document/anchor order. This is axis alignment, not collision prevention or a constraint system.

Bounds win over snapping. Infeasible object alignments are skipped; grid targets clamp inward if needed. Feedback only reports grid axes that remain on-grid and object alignments that are achievable. Alignment guides and the grid-snap indicator clear at drag end.

The inspector accepts bare inches, decimal/fractional inches, or feet/inches such as 5 ft 6 in and 5' 6". Feet/inches hints are rounded for display only; input fields retain the full stored inch value. Apply submits only changed fields atomically. Typed X/Y positions do not grid/object snap, but share the same physical bounds function as dragging. Changed rotation follows the active rotation setting.

Dimensions must be positive (start regions retain zero height); elevation is nonnegative. A valid resize or rotation can move the object inward. Edits whose rotated footprint cannot fit are rejected with a message; invalid edits leave the document untouched. Existing oversized-object fallback in constrainPosition is retained for future stage-size changes, which have no UI yet. Phase 3A used schema v2; the wall/fault-line increment below advances it to v3.

## Walls and fault-line segments

Walls store length/thickness/height explicitly, preserving their old physical dimensions and behavior. Fault lines store length only and are always ground markings, not walls or occluders. The shared footprint adapter maps both into rotated bounds and rendering dimensions without duplicating authoritative wall fields. Fault-line alignment uses centers and endpoints; walls retain center/edge-midpoint anchors.

Fault lines render as gold strips below walls and above targets. The inspector offers X/Y, rotation, and length only. Inapplicable geometry keys, nonzero ground elevation, nonpositive lengths, and oversized edits are rejected. Existing target/start behavior is unchanged. Add/remove uses UUIDs and last-of-type removal. The default seven-object layout has no fault lines; Reset removes added segments and restores default walls while preserving editor settings.

Schema v3 reflects the wall field rename and new discriminant. There is no save/load or automatic migration from v2; any future import must explicitly map wall width/depth to length/thickness. Fault lines are independent straight segments; connected polylines and editable strip width are not implemented.
