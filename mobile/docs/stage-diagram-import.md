# Stage diagram import

Implemented October 15, 2026. Inputs from any stage-building application are in scope; automatic recognition coverage is not universal or established. The input is a **stage-design document**, not a photograph of a real range. Digital briefing PDFs, exported diagrams/screenshots and photographs of paper are separate source cases. No paid AI service, model download or custom training is enabled. A local clean-diagram geometry prototype is now available; see diagram-recognition.md for its measured synthetic results and limitations.

## User flow

Open an existing stage within its match, then **Stage tools → Import stage diagram**. Existing stages need not be empty.

1. Import a PDF/image with Expo DocumentPicker, **Choose from Photos** (iPhone, batch 16: PHPicker through the TrainingMedia module's `pickImage`, no photo-library permission), or choose Photograph paper in a rebuilt iPhone client. Original bytes are copied into app-owned Documents storage before preparation; the browser stores originals in IndexedDB. Open or download original document uses native Quick Look or a byte-preserving browser download, including when preparation fails. Picker cancellation creates no reference. Camera access is requested only after Photograph paper, with a file-import fallback when denied/unavailable. No microphone or photo-library permission is requested by this feature.
2. On iPhone, render a chosen one-based PDF page. Page count and orientation come from PDFKit. Locked, unreadable, empty, oversized and invalid-page documents produce errors while retaining the original reference. Images are decoded with EXIF orientation and a bounded raster size. The original file is never rasterized in place.
3. For an image/photo, Vision suggests a paper quadrilateral when it can. Verify the four numbered corners; use taps or coordinate fields if detection fails or selects the wrong rectangle. Reset, rotate and align using Core Image perspective correction. Digital exports can retain the full-page corners. The browser supports manual quadrilateral alignment, rotation and crop, without automatic boundary detection.
4. Crop the corrected page to its actual top-down layout. Exclude briefing text, headings, logos, legends, equipment tables and inset views. Select opposite crop corners or edit percentages. **Layout-region detection is manual in this version.**
5. Classify the drawing as top-down or perspective/isometric. It starts unknown. Unknown and perspective views cannot produce geometry. This is a conservative user-confirmation guard, **not a validated automatic projection classifier**. Correcting a photograph of paper does not flatten an isometric drawing printed on that paper.
6. Calibrate two points against printed grid spacing or a labeled real-world distance (inches, feet or yards, converted to inches). Confirm the evidence source. Never use a target icon's printed dimensions, PDF DPI or paper size as stage scale. Uniform scale and a stage origin are explicit. Positions remain marked approximate; perspective correction estimates page proportions, so check a second independent dimension. Nonuniform drawing scale is unsupported.
7. Add/edit numbered overlays on the aligned source diagram. Select overlays from the list, accept/reject, move by tapping or coordinate fields, set rotation, change type/preset, and set segment endpoints. Wall/fault-line overlays include their proposed lines and endpoints. All begin rejected. Default physical dimensions are explicitly provisional and can be edited in the existing stage inspector after acceptance. Repreparing a page/crop clears prior overlays and calibration; changing calibration inputs requires confirmation again.
8. Add only accepted elements to the editor. This is one undoable additive edit. It never resizes the stage, removes objects, replaces a start, edits an existing object, or reconciles the existing plan/route. Bounds errors reject the entire addition. Duplicate acceptance uses stable import/proposal IDs and cannot duplicate objects. To correct an already-added object, edit it in the stage editor or Undo the addition before accepting corrected overlays.
9. **Save reference draft** persists only document/preparation/proposal metadata. **Add accepted elements to editor** also saves the draft but geometry remains an editor draft until the editor's normal **Save** action. Close offers save-draft/keep-editing/discard-preview choices. Saving a reference is not saving the stage. Source reference and reconstruction history are not route history. Detect clean diagram geometry now adds review-only candidates; unknown shapes must be classified. Batch selectors mark multiple decisions before the explicit editor addition.

## Tracing over the drawing (batch 16)

Once a draft is aligned, cropped, marked top-down and has a confirmed scale, closing the import shows that drawing under the stage in BUILD and PLAN, at its calibrated size and origin (`backdropOf`/`latestBackdrop` in `src/diagramImport/model.ts`, drawn by `src/editor/StageBackdrop.tsx` over the grid and under the stage objects). View settings → Drawing OFF / LIGHT / HALF / STRONG. Trace with the normal tools (press and hold to add, DRAW for walls and fault lines, AREAS → FROM FAULT LINES). The latest calibrated draft for the stage is used.

## Storage and compatibility

`src/diagramImport/model.ts` stores source asset references, selected/rendered page, rectified and cropped rasters, normalized corners/crop, projection, calibration evidence/uncertainty, origin and proposals. Existing `StageDocument` schema 7, inch coordinates and plan payload version 1 are unchanged. `diagram_imports(stageId,id,payload)` is an additive SQLite table with stage foreign keys. Originals and derived files are separate from SQLite geometry. Match/stage copies get independent metadata records sharing immutable local source files; deleting a stage/match cascades its reference rows. No existing stage payload is rewritten when saving a reference.

Acceptance maps proposals to existing stage types, target families and selected presets. Targets use physical defaults/preset dimensions, independent of printed symbol size. Walls/fault lines use calibrated endpoints. Unsupported props and standalone port candidates cannot silently turn into arbitrary geometry: they must be rejected/mapped, then added using the existing editor/wall-port inspector. The recognition interface retains `prop` and `port` candidates for later mapping work.

`useDocumentHistory.appendObjects` records additions with the exact existing plan object. Normal target reconciliation is deliberately bypassed here, including for well-formed stale manual references. PATH geometry, ENGAGE annotations, REVIEW coverage inputs, ammunition/timing data and ownership remain unchanged. Route analysis can naturally reflect the presence of newly accepted targets; this does not assign them automatically.

Native files use relative `diagram-imports/<generated-id>.<extension>` references. Browser blobs live in `stage-diagram-documents` IndexedDB, not ephemeral blob URLs. Missing files/storage errors are explicit. SQLite metadata and filesystem/blob writes are not a distributed transaction: a failed/cancelled preparation can leave unreferenced files. Files are intentionally retained rather than deleting originals still shared by duplicated stages. Reference deletion/garbage collection, document relinking and backup/export are future work. Browser site-data eviction can remove IndexedDB independently of SQLite.

## Recognition boundary

`recognition.ts` defines bounded RGBA input, cancellation, application/version-specific symbol templates, optional layout-region/projection findings, proposed objects, confidence, uncertainty and warnings. The adapter wrapper validates detector output, rejects late/invalid results, and forces all proposals to unaccepted/approximate. It never auto-calibrates or converts an unknown projection into confirmed top-down geometry. The registry contains the clean-geometry-v1 prototype, with no enabled real-vendor symbol templates. It returns review-only geometric candidates and is integrated with manual overlays; see diagram-recognition.md.

After evaluating samples, start with deterministic line/contour/connected-component methods and reusable vendor/version-specific symbol templates. Separate paper/no-shoot, plate/popper, line conventions, wall ports, start symbols and unsupported props; preserve ambiguity for review. Text/legend exclusion and dimension extraction need their own evaluated stages. Basic geometric recognition and regular pixel-grid hints are implemented. Semantic symbol recognition, OCR, real grid/dimension units, automatic layout classification and automatic projection classification are **not complete**.

## Platform status and validation

- iPhone native source: local `modules/diagram-import` uses PDFKit, Vision, Core Image, ImageIO, Quick Look and a photo-only UIKit camera picker. Requires a rebuilt development client/EAS iOS build; unavailable in Expo Go or an older installed client. Module autolinking and resolved Expo camera usage configuration have been checked. Windows cannot compile these Apple frameworks. Swift/Xcode compilation and camera/PDF/Vision behavior remain unverified.
- Browser: actual image decoding, manual quadrilateral warp, clockwise rotation, layout crop, original-byte preservation and IndexedDB reload have been verified with synthetic PNGs by `scripts/verify-diagram-import-browser.cjs`. PDF files can be retained as references; page rendering requires iPhone, or a PNG/JPEG page export. Direct browser camera capture and automatic paper boundaries are unavailable.
- Android: document preservation/reference drafts are available; PDF/image preparation and direct camera capture need an adapter. The UI reports this and does not invent output.
- Automated model/adapter/SQLite/component tests exercise calibration, projection guards, defaults/presets, calibrated segments, bounds, rejection/idempotence, cancellation, page selection, invalidation, stage undo/redo, explicit Save, exact route preservation, reference reopen/copy/isolation/cascade, and duplication rollback. Final results: 761/761 tests passed (18 added), TypeScript passed, iOS Hermes export passed, module autolinking/configuration passed, and diff whitespace checks passed.
- No real stage-design samples, physical iPhone tests or iOS simulator tests have been performed. Synthetic math/raster fixtures do not establish recognition accuracy, native usability or real-document reconstruction quality.

Run from `mobile`:

```text
npm test
npm run typecheck
npx expo export --platform ios --output-dir .expo/diagram-ios
npx expo-modules-autolinking resolve --platform apple
npx expo config --type public
node scripts/verify-diagram-import-browser.cjs
```

The browser script accepts `PLAYWRIGHT_MODULE` pointing to an installed Playwright module; its default is this workspace's existing cached installation. It uses installed Chrome and creates `.expo/diagram-browser/corrected-synthetic.png`. It is a focused browser check, not part of the Node test count.

## Samples needed next

Collect permission-cleared, original multi-page briefing PDFs and corresponding PNG/JPEG exports from each intended stage-building application/version. Include the same plans photographed on paper: all four rotations, skew, shadows, folds, partial borders, glare, low resolution and cluttered backgrounds. Include grid and labeled-dimension examples, nonuniform/schematic plans, perspective/isometric views, pages with multiple diagrams and large legends/logos, and clear top-down controls.

For each drawing, supply the intended layout region, projection type, known distances/units, object centers/orientations, segment endpoints, target family/preset where known, ports, props and start locations. Include icon variants from different applications and examples where target icons are deliberately oversized. Keep separate development and held-out examples. Measure false positives on text/logos, missed/incorrect symbols, scale error and coordinate/rotation error before enabling a detector. Synthetic fixtures alone are insufficient.

## Unperformed native checks

Tracked only in [the RC hardware checklist](rc-hardware-validation.md). No physical-device checks have been completed. Automatic geometry detection is EXPERIMENTAL; manual reconstruction remains the supported fallback.
