# Physical stage foundation

Schema 7 stores inches, with X pointing right, Y depth pointing down in the top-down view, and Z elevation pointing up. The provisional workspace is 480 x 360 inches (40 x 30 feet), not a competition standard. Dimensions live on the document and viewport/bounds functions consume them; dimension-editing UI is deferred.

Object X/Y is the center of its ground footprint (the face span for upright targets). Z is its bottom elevation; geometry.height, or geometry.faceHeight for targets, extends upward from Z. Fault lines have no height field and stay at Z=0. Rotation is clockwise in the top-down view, in degrees normalized to [0, 360). Rendering rotates about the same center. These conventions are view-oriented, not a promise of a right-handed 3D camera convention.

Provisional geometry (width x depth x height, inches):
- Cardboard target / no-shoot target: faceWidth 18, faceHeight 30, bottom elevation 48. These editable defaults are not certified competition dimensions. The upright face has zero ground depth; no stand geometry is implied.
- Wall: length 96, thickness 4, height 72, bottom elevation 0. These names are authoritative stored geometry fields.
- Start: 48 x 36 x 0, bottom elevation 0; a ground region.
- Fault line: stored length 96, ground elevation 0, no height/occlusion fields. A provisional fixed 2-inch strip width is shared by rendering and bounds through footprint().

The document contains no screen dimensions or editor selection. Viewport state stores zoom and screen-layout-unit pan offsets. Scale is min(viewportWidth/stageWidth, viewportHeight/stageDepth) times zoom. Offsets center the scaled stage then add pan. X/Y inverse projection requires callers to retain Z because the top-down projection discards elevation.

Zoom ranges from 0.5 to 3 and is centered on the viewport. Reset restores defaults and clears selection while preserving zoom/pan. Interactive pan is deferred to avoid object/scroll gesture conflicts; transforms support it and tests cover it. Zoom out to recover objects outside the visible viewport.

Rotated rectangular footprint bounds keep objects fully within the workspace. An object larger than the workspace is centered on each oversized axis. Rotation can move an object inward near a boundary. Later nonrectangular geometry needs a corresponding bounds implementation.

New object IDs use Expo's existing UUID v4 generator, injected into the pure ID helper. Generate once per add event, outside React state updaters. Duplicate insertion is rejected. Default IDs are stable within a document; cross-document identity will need a document ID when persistence arrives. Schema 1 layouts are not automatically converted: no real-world scale was established in that version and no persistence exists.

Run npm run test:stage for pure model/geometry checks. No persistence is included. The supported kinds are cardboardTarget, noShootTarget, steelPlate, steelPopper, start, wall, and faultLine.

## Phase 3A precision editing

The grid is derived from physical stage dimensions: 6-inch minor lines, 12-inch major lines, and labels every 5 feet. It is an editor overlay, never document data.

Snapping is temporary editor state. Defaults: enabled, 6-inch center-position grid, object alignment enabled with a 3-inch physical tolerance, and 15-degree rotation increments. Position increments are 12/6/3 inches. Rotation supports 15/5 degrees or free; the master switch disables both position and rotation snapping. Settings, zoom, and pan survive Reset; defaults/selection reset as before.

Dragging snaps the raw physical destination, never the last snapped point, so movement does not accumulate quantization drift. Grid rounding chooses the nearest multiple (exact halves toward positive infinity, with a tiny floating-point tolerance). Object alignment then overrides the grid independently on each axis if a feasible anchor lies within tolerance. Anchors are centers and rotated edge midpoints; wall length-axis midpoints are endpoints. Nearest candidates win, ties use document/anchor order. This is axis alignment, not collision prevention or a constraint system.

Bounds win over snapping. Infeasible object alignments are skipped; grid targets clamp inward if needed. Feedback only reports grid axes that remain on-grid and object alignments that are achievable. Alignment guides and the grid-snap indicator clear at drag end.

The inspector accepts bare inches, decimal/fractional inches, or feet/inches such as 5 ft 6 in and 5' 6". Feet/inches hints are rounded for display only; input fields retain the full stored inch value. Apply submits only changed fields atomically. Typed X/Y positions do not grid/object snap, but share the same physical bounds function as dragging. Changed rotation follows the active rotation setting.

Dimensions must be positive (start regions retain zero height); elevation is nonnegative. A valid resize or rotation can move the object inward. Edits whose rotated footprint cannot fit are rejected with a message; invalid edits leave the document untouched. Existing oversized-object fallback in constrainPosition is retained for future stage-size changes, which have no UI yet. Phase 3A used schema v2; the wall/fault-line increment below advances it to v3.

## Walls and fault-line segments

Walls store length/thickness/height explicitly, preserving their old physical dimensions and behavior. Fault lines store length only and are always ground markings, not walls or occluders. The shared footprint adapter maps both into rotated bounds and rendering dimensions without duplicating authoritative wall fields. Fault-line alignment uses centers and endpoints; walls retain center/edge-midpoint anchors.

Fault lines render as gold strips below walls and above targets. The inspector offers X/Y, rotation, and length only. Inapplicable geometry keys, nonzero ground elevation, nonpositive lengths, and oversized edits are rejected. Start behavior is unchanged; the subsequent target increment replaces the target proxy. Add/remove uses UUIDs and last-of-type removal. The default seven-object layout has no fault lines; Reset removes added segments and restores default walls while preserving editor settings.

Schema v3 reflects the wall field rename and new discriminant. There is no save/load or automatic migration from v2; any future import must explicitly map wall width/depth to length/thickness. Fault lines are independent straight segments; connected polylines and editable strip width are not implemented.


## Phase 3B-2 cardboard and no-shoot targets

Schema v4 replaces the generic target discriminator and proxy geometry with explicit cardboardTarget and noShootTarget objects sharing authoritative faceWidth/faceHeight. Existing default target IDs and X/Y locations remain; there are three cardboard targets and no default no-shoots. No migration or persistence is included.

Both faces are upright, with their horizontal span along local X at zero rotation. Rotation turns this span clockwise about its X/Y center. The vertical extent is [position.z, position.z + faceHeight]. Height/elevation do not create plan-view depth. Bounds use the rotated face span; alignment uses center and endpoints. Width/height must be finite and positive and bottom elevation finite and nonnegative. Legacy width/depth/height edits are rejected for targets.

Rendering shows a brown C silhouette for scoring cardboard and a white NS silhouette for no-shoots. These fixed-size editor badges provide touch area; their outlines are symbolic, with no scoring zones. A centered line shows the physical face span at viewport scale. Badges may extend past physical stage boundaries and overlap nearby objects; they never affect bounds/snapping. Face height and elevation are edited in the inspector and are not projected into top-down depth.

Both kinds use existing selection, drag, numeric editing, rotation settings and UUID add/remove behavior. Remove acts on the last object of the chosen type. Reset restores the default cardboard faces, removes added no-shoots, clears selection, and retains existing viewport/snapping settings. Inspector field generation and parsing are extracted into a pure helper for stage tests; the UI still applies edits through editObject.

No detailed target profile, scoring zones, occlusion, ports, partials, routes, ammunition, persistence, reconstruction, training/video analysis or AI is implemented. Native touch, keyboard and symbolic badge rendering still require device verification.


## Steel plates and upright poppers

Schema v5 adds steelPlate and steelPopper. Both store faceWidth and faceHeight in inches using the existing upright-face geometry, X/Y center, clockwise rotation and bottom elevation position.z. A plate is rectangular (default 12 x 12 inches, bottom 48 inches); a popper uses representative maximum width and overall height (default 12 x 42 inches, bottom 0). These are editable prototype dimensions, not certified competition specifications.

The popper's faceHeight is its overall vertical extent, labeled Overall height in the inspector. Its future 2.5D envelope is centered horizontally on local X, has zero plan depth, and extends from Z to Z + faceHeight. The simplified display silhouette is not an authoritative detailed physical contour. There is no stand/base volume, thickness, fallen state, tilt or visibility calculation. A future detailed popper contour can use the explicit kind and stored dimensions without deriving physical geometry from UI styles.

Both kinds use the existing rotated face-span bounds, center/endpoint alignment, grid and rotation snapping, atomic inspector validation and UUID allocation. Width/height must be finite and positive, elevation finite and nonnegative; legacy width/depth/height keys are rejected. Height and elevation never become ground depth.

Steel badges are blue-gray: a rectangular SP plate and a rounded-head/narrow-stem P popper. They are symbolic touch affordances, separate from the physical width line, and may overlap or extend beyond the stage near boundaries. Default objects/positions are unchanged; steel is added through dedicated controls. Removal is last-of-type. Reset removes added steel and restores the existing seven-object layout, preserving the existing editor settings and clearing selection.

No migration/persistence or other deferred features are included. Device rendering, selection, dragging and keyboard interaction remain unverified.


## Wall-owned firing ports

Schema v6 adds a required ports array to each wall; all default/new walls start with an independent empty array. FiringPort is not a StageObject. Each rectangular through-opening stores a stable UUID-based id, offset, width, height and sill in inches. Offset is the opening center along the wall's local length axis, measured from wall center (negative toward local left). Sill is measured upward from the wall's bottom, not from stage ground.

The opening occupies local X [offset - width/2, offset + width/2], the entire wall thickness, and world Z [wall.position.z + sill, wall.position.z + sill + height]. Its world horizontal center follows wall center plus offset times (cos rotation, sin rotation). This representation provides physical data for future 2.5D rendering, visibility or reconstruction without implementing those features. Translation/rotation/elevation changes preserve the ports array and local measurements.

The selected-wall inspector adds ports, selects them by numbered buttons, removes the selected port and edits all four measurements. Port numbering is a display index; stable IDs do not change when another port is removed. New ports start centered, 24 x 24 inches at local sill 36, reduced as needed to fit smaller walls. Add allocates its ID once outside state updates. Overlapping openings are permitted; no merging or overlap solving is included.

All edits pass through editObject. Ports require finite measurements, positive width/height, nonnegative sill, nonempty unique IDs (including across walls), and full containment within wall length/height. Invalid port edits and wall resizes are rejected atomically, including other submitted position/geometry changes. Exact boundary contact is allowed. Wall bounds and snapping retain the full wall footprint.

Top-down rendering uses pale cyan spans with jamb marks and numbers corresponding to inspector buttons. These are opening indicators, not a full-height gap claim or 2.5D view. Sill/height remain editable data rather than top-down depth. Ports inherit the parent view transform and are not independently draggable. Removing a wall removes its ports; Reset restores default empty arrays and clears editor selection as before.

No line-of-sight solving, partial targets, routes, ammunition planning, persistence/migration, reconstruction, training/video analysis or AI is added. Device rendering, port selection and keyboard interaction remain unverified.


## Physical cardboard/no-shoot cuts

Schema v7 adds faceCut: { kind: 'preset', preset: 'full' | 'upper' | 'lower' | 'left' | 'right' } exclusively to cardboardTarget and noShootTarget. These are physical material cuts, never a visibility flag, wall occlusion, a no-shoot overlay or a parent relationship. All defaults/new paper targets are full.

faceWidth/faceHeight describe the uncut rectangular reference. X/Y remain its horizontal center and position.z remains its uncut bottom reference. Full retains local X [-width/2, width/2], Z [0, height]. Upper retains Z [height/2, height]; lower [0, height/2]; left retains X [-width/2, 0]; right [0, width/2]. Each portion has half the reference area. World elevations add position.z. The activeFaceExtent helper is the authoritative retained rectangle used by bounds, alignment and badge rendering; future polygon variants can extend this geometry boundary without treating removed material as occlusion.

Left/right plan spans are asymmetric about the reference. Bounds rotate both their size and center offset; alignment uses the active midpoint and endpoints. Upper/lower change vertical extent but retain plan width. Grid snapping still snaps the stable object reference. Display containers never determine physical occupancy.

Inspector preset buttons submit atomic edits through editObject and retain ID, role, reference position, rotation and elevation. If a preset would add material outside stage bounds, it is rejected with an instruction to move inward first. Invalid presets and cuts on steel/walls/other objects are rejected. Normal dragging, resizing and rotation continue to constrain the active material.

Badges show a simple retained brown or white rectangle within the full reference area, with separate C/NS labels; no removed-half overlay is drawn. The physical plan line shows the retained span. This intentionally uses a rectangular reference rather than detailed target contour/scoring zones. Reset restores full default targets and removes added targets while retaining existing editor settings.

No arbitrary polygon editor, scoring zones, route/ammunition planning, line-of-sight solving, persistence/migration, reconstruction, training/video analysis or AI. Device visual/gesture verification remains pending.


## Editor object operations

The six-entry palette creates Cardboard, No-Shoot, Steel Plate, Popper, Wall and Fault Line at the physical stage center (visible with the current centered zoom UI), constrained by existing bounds, and selects the new object. Selected-object Duplicate and Delete replace last-of-type removal in the UI. The old removeLastObject helper remains for existing regression coverage.

Start Position is protected from deletion and duplication; all other standalone kinds are supported. Ports remain wall children and use their own existing inspector controls. Duplication clones geometry, cut presets and ports independently, retains rotation/elevation and all physical properties, and allocates fresh UUID IDs for both the object and every child port. Copies are inserted immediately after the source to preserve drawing layers.

Duplicates prefer a 12-inch X/Y offset, constrained by active bounds; reverse-direction candidates avoid coincident copies at edges. If an object fills all available space, a coincident bounded copy can be unavoidable. No collision avoidance or automatic viewport movement is added.

objectActions is an editor event adapter: it allocates IDs outside replayable React state updaters and returns document plus separate selection. Create/duplicate select the new ID, delete clears selection, stale selections become null, and Reset restores fresh defaults and clears selection. Zoom/pan/snapping remain separate unchanged state. StageDocument and schema v7 are unchanged.

No 2.5D rendering, routes, ammunition, line-of-sight, persistence, reconstruction, training/video analysis or AI is included. Device gesture and palette interaction verification remains pending.


## First read-only 2.5D visualization

Top Down remains the authoritative editing mode. The view toggle mounts a read-only Stage25D preview of the same StageDocument; there is no second editable document and schema v7 is unchanged. Top Down state, selection, zoom and snapping are retained while previewing. The preview does not expose edit callbacks, palette, inspector or object-operation controls.

projection.ts converts physical local geometry into world-space surfaces, then applies an orthographic projection with 30-degree downward pitch and default 45-degree yaw. Camera yaw changes in 15-degree increments; preview zoom is bounded to 0.5?3. The initial scene fits all surfaces with margins, then zooms about that fit center. Camera state is local to the mounted preview and resets when returning to it. No free camera or interactive preview selection is included.

The installed expo-image displays a generated base64 SVG using basic polygons, lines and text. No new package or engine is needed. Geometry comes from stored dimensions/rotation/elevation, activeFaceExtent and footprint; UI values are colors, line weights and fit margins only. A 5-foot ground grid shows physical scale, and the start region carries a START label.

Walls have both broad faces, thickness edges and top surfaces. A local X/Z partition removes cells inside the union of all port rectangles; only material surfaces and exposed jamb/sill/lintel faces are emitted. Port coordinates remain attached to the parent wall and use its bottom elevation. This is an opening in geometry, not a colored marker or full-height gap.

Cardboard and no-shoot faces are upright brown/white rectangles containing only active cut material at the correct world elevations. Steel plates use physical width/height. Poppers use a representative normalized contour scaled to stored width/overall height, not a certified physical outline. Fault lines and the start region lie on the ground. No unmodeled target stands are invented.

The selected Top Down object's surfaces receive blue outlines in preview. Painter sorting uses average camera depth after ground surfaces: intersecting/overlapping surfaces can order incorrectly, and this must never be treated as line-of-sight or target-visibility analysis. Wall partition seams may be visible. Native SVG display, camera controls and dense-scene performance require device verification. Very high zoom can crop the scene; zoom out to recover it.

No routes, ammunition planning, visibility solving, persistence, reconstruction, training/video analysis or AI is implemented.


## Ammunition/loadout planning foundation

Shooter-specific StagePlan lives separately in planning/model.ts and React state. Physical StageDocument/schema v7 and object geometry remain unchanged. The expandable Loadout / Planning section is available without replacing navigation or either stage view.

Loadout stores chamberLoaded, a nullable startingMagazineId and a collection of magazines with stable UUID IDs, optional labels, capacity and startingRounds. The designated magazine starts inserted; every other magazine is a carried spare. New magazines default to capacity 10 and zero loaded rounds, with no automatic starting designation. Deleting the starting magazine clears the designation. Counts describe the initial loadout after chambering: the chambered round is separate, never subtracted from or added to magazine counts.

Capacities are positive safe integers; loaded counts are nonnegative safe integers no greater than capacity. Invalid edits reject atomically. Engagements map physical object IDs to nonnegative integer planned rounds, only for cardboardTarget, steelPlate and steelPopper. Unassigned targets count as zero; cut presets do not infer shot requirements. Duplicated targets receive no copied assignment. Deleted references are pruned, and summaries defensively ignore missing/unsupported references. Stage Reset clears engagements but retains the shooter loadout.

Available ammunition = sum of actual magazine startingRounds + (chamberLoaded ? 1 : 0). Planned total is the sum of valid assignments; reserve is available minus planned and can be negative. A shortage warning appears when reserve is negative. Capacity is never used as an assumed ammunition count.

This is aggregate planning only: no engagement order, running magazine state, reload events, route optimization, line-of-sight, reconstruction, persistence, training/video analysis or AI. The stable magazine and object IDs support later ordered events without adding them now. Device form/keyboard interaction remains unverified.
