# Stage Designer implementation report

Completed 2026-09-29. Scope: target presets, physical face rendering, placement/drawing tools, endpoint editing, rotation and document history.

## Changed files

Preset and geometry data:

- mobile/src/stage/targetPresets.ts (new central 14-preset registry)
- mobile/src/stage/targetShape.ts (new snapshot validation/copy)
- mobile/src/stage/targetPlacement.ts (new placement, scale and rotation operations)
- mobile/src/stage/presetFace.ts (new saved contour projection/clipping)
- mobile/src/stage/segments.ts (new endpoints, validation and physical snapping)
- mobile/src/stage/model.ts
- mobile/src/stage/operations.ts
- mobile/src/stage/projection.ts
- mobile/src/storage/repository.ts

Editor:

- mobile/src/editor/AddMenu.tsx
- mobile/src/editor/DraggableObject.tsx
- mobile/src/editor/ObjectInspector.tsx
- mobile/src/editor/StageBuilder.tsx
- mobile/src/editor/StageViewport.tsx
- mobile/src/editor/TargetFace.tsx (new physical face renderer)
- mobile/src/editor/GeometryControls.tsx (new endpoint handles/rotation wheel)
- mobile/src/editor/designerTools.ts (new exclusive modes/tap intent guard)
- mobile/src/editor/history.ts (new immutable undo/redo)
- mobile/src/editor/useDocumentHistory.ts (new stage/plan history adapter)

Tests and documentation:

- mobile/tests/designer-tools.test.cjs (32 new regression tests)
- mobile/tests/designer-browser-smoke.cjs (new browser touch integration check)
- mobile/tests/browser-smoke.cjs (updated existing Add workflow)
- docs/target-preset-sources.md
- mobile/docs/designer-tools-testing.md
- mobile/docs/designer-tools-implementation.md
- bugs.md, features.md, changelog.md

## Presets and physical scale

USPSA: Metric, Classic, Reduced, nominal 8-inch round plate, mini popper. PCSL: Practical, Mini Practical, Competition, legacy K-Zone, nominal 8-inch round plate. IDPA: Standard, Alternate, nominal 8-inch round plate and 6-inch square plate. Paper presets also support no-shoot roles.

The [source table](../../docs/target-preset-sources.md) lists all stable IDs, exact stored dimensions and explicit source/verification limitations. Nine paper presets and the popper have approximate contours. The four round/square steel presets have exact nominal mathematical geometry, not a universal size mandate.

Visible target width AND height equal stored inches times the viewport scale. Invisible touch regions have a 44-point minimum; the selected rotation UI is also larger. Neither changes stored geometry. New target instances keep their own preset ID, family, size and contour snapshot. Existing generic targets remain unchanged.

## Interaction and history

Select / Move, Pan, Add Target, Draw Wall and Draw Fault Line are exclusive. Add Target remains active after every deliberate short single-touch tap. Dragging pans, pinching zooms, and toolbar taps cannot place. Done/tool changes cancel temporary previews.

Drawing supports tap-start/tap-end or press-drag-release with a live preview, followed by connected segments. Done, Undo last segment and Cancel current segment are separate controls. Endpoints use inches; faults remain ground markings. Endpoint handles and numeric length/angle updates use validated physical geometry. Length/angle-only numeric edits keep the start anchor fixed.

Snap priority: nearby existing endpoint within 3 inches, angle within 5 degrees of a 45-degree increment, then the existing configured physical grid (default 6 inches). Snap OFF preserves free coordinates. Length is displayed in yards plus feet/inches; angles use degrees.

The target wheel and inspector edit the same rotation, normalized to [0,360), preserving the target anchor. Undo/redo covers placement, movement, rotation, wall/fault creation, endpoint/numeric edits, duplication and deletion. Stage/plan snapshots preserve removed planning references when undoing deletion. Drags are grouped into one entry. History holds up to 100 entries, is session-only and excludes pan/zoom. Editing after undo clears redo.

## Persistence

No database migration is needed. New document fields are optional additions to schema 7. Legacy objects keep their IDs, physical dimensions, family metadata and references. Old segment endpoints derive from center/length/angle; edited or newly drawn segments save endpoints. Match-family updates do not rewrite stage documents. Reopen validates saved outlines and endpoint consistency, accepting objects outside a subsequently reduced stage boundary without silently changing them.

## Validation and remaining checks

- npm.cmd run typecheck: passed.
- npm.cmd test: 495 passed, zero failed (463 existing plus 32 new).
- Browser emulation at 390 x 844: repeated placement, pan/pinch guards, connected walls, fault-line drawing, tool changes, undo/redo, numeric/wheel rotation, endpoint dragging/numeric segment edits and save/reopen passed.
- No physical-device test was performed. Follow the [exact phone checklist](designer-tools-testing.md).
- Unresolved: the existing web SQLite teardown/OPFS file-lock issue can interrupt browser reruns before the home screen; restarting the isolated test browser is the workaround. Also pending: dimensioned paper/popper contours and vendor-size differences in the source table; physical-device gestures and native persistence need the checklist. No dated backlog item exceeds one month; undated legacy entries cannot be aged reliably.

Photo import, OCR, reconstruction, new AI routes and route/Training redesign were not included.
