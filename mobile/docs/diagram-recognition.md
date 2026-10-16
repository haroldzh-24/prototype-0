# Automatic clean-diagram geometry prototype

Implemented October 15, 2026 on top of the document-first import foundation. The detector is local TypeScript over typed RGBA arrays; no package, remote service, model training, camera permission or other native permission was added. It is an opt-in prototype for **clean, cropped top-down drawings**, not real range photographs or validated recognition across stage-design applications.

## Capabilities and limits

| Evidence | Current output | What is not inferred |
| --- | --- | --- |
| Straight elongated components, including diagonal bars | Principal-axis endpoints, angle, image bounds; sufficiently solid/thick bars are **possible wall** candidates | A bar is not proven to be a wall; thin lines remain unknown |
| Connected orthogonal sparse strokes | Separate line candidates and shared-corner diagnostics | Arbitrary curved/oblique connected networks, automatic closed legal areas, wall-port geometry |
| Clear axis-aligned outline/filled boxes and circular silhouettes | Unknown rectangle/circle overlays with image-space size | Start box, paper target, steel or prop semantics from shape alone |
| Similar repeated component silhouettes | Stable repeated-group evidence | Automatic common semantic classification |
| Explicit supplied symbol templates | Bounded normalized-mask matching with ambiguity rejection and application/version provenance | No real vendor templates are registered. Unit tests use a synthetic diamond only |
| Regular long horizontal/vertical grid lines | Grid-spacing hint in normalized image units; grid excluded from object candidates | Inches, feet, yards, or a trustworthy drawing scale |
| Small aligned component runs and very large edge-touching borders | Heuristic text/border suppression | OCR, guaranteed text/logo/legend/dimension-arrow separation |

Thresholding composites alpha against white, finds connected components, then uses covariance/principal axes, projected extents, edge/radial/angular coverage, orthogonal runs and normalized component signatures. An angular-coverage check prevents the tested L-shaped boundary from becoming a false circle. Thresholds scale with raster size. This is intentionally limited image geometry processing, not universal stage-object recognition. Isolated glyphs, logos, arrows and schematic decorations remain a known source of false candidates. Cropping out page content is still a user task.

Projection starts unknown and the user must confirm top-down before running detection. The detector itself returns unknown projection and never upgrades it. An isometric drawing cannot be flattened into metric ground geometry by paper perspective correction. Dense/dark input, excessive components/proposals, invalid rasters, cancellation or timeout give a manual-reconstruction fallback. No reliable automatic photo/isometric/quality classifier has been established.

## Proposal and preview behavior

`Proposal` retains the existing normalized image position/endpoints, rotation, decision and type. Optional `extent` is editable image-overlay size. New recognition evidence stores original image-space bounds, primitive kind, repeated/template identifiers, the aligned source asset path/page and calibration status **at detection time**. The original evidence remains unchanged when users correct an overlay. The draft already retains the original document/page and its preparation transforms.

Detection can run without calibration and does not create inch coordinates. Only the existing `reconstruct` step can convert accepted candidates after a valid confirmed calibration. Printed target icons never determine physical target size; selected presets/defaults still do. Overlay width/height controls are explicitly labeled as image size, not target dimensions. Grid pixel spacing is a hint for the existing manual two-point calibration, not an automatic real-world scale.

In Reconstruction preview, choose **Detect clean diagram geometry**. Every new proposal starts rejected/approximate. Select individual overlays to classify, move, resize or rotate them; segment length/angle edits use the prepared image aspect ratio. Unknown/prop/port candidates cannot be accepted through the UI or committed through the model without supported manual mapping. Template confidence and wall confidence are heuristic agreement scores, not calibrated probabilities.

Use the separate batch selectors to accept/reject multiple classified proposals together. This marks decisions; **Add accepted elements to editor** remains the explicit, undoable, additive commit. Existing stage objects are never replaced. Rerunning on the same aligned image adds only new IDs and preserves prior classification, position, acceptance/rejection and extent edits. IDs are scoped to the source image and detector; preparing a different crop creates a new source scope. There is no cross-document deduplication promise.

Recognition uses the existing synchronous operation reservation. Double taps cannot replace the active cancellation controller; Cancel remains available outside the temporarily disabled form. Abort is checked around raster decoding and during processing. Visibility/session disposal prevents late results from changing the preview. Recognition does not write geometry or route/planning data. Saving its optional metadata uses the existing separate SQLite draft table; no migration or stage payload change was needed. PATH, ENGAGE, REVIEW and legacy ammunition/timing algorithms were not edited.

## Evaluation results

All seven checked-in fixture manifests are **synthetic**. There are no user-provided stage exports, photographs, held-out real samples or measured real-world accuracy results.

| Fixture | Expected / matched | False / missed | Observed position / rotation error |
| --- | --- | --- | --- |
| Clean bar, circle, rectangle | 3 / 3 | 0 / 0 | Mean 0 px; defined angles 0 degrees |
| Connected L boundary | 2 / 2 | 0 / 0 | Mean 0.25 px; 0 degrees |
| Diagonal wall-like bar | 1 / 1 | 0 / 0 | 0 px; about 0.00165 degrees |
| Repeated diamonds | 2 / 2 | 0 / 0 | Mean about 1.12 px; orientation not scored |
| Grid and glyph run | 1 / 1 | 0 / 0 | 0 px; 0 degrees; three probable text components suppressed |
| Dimension baseline and isolated O-like glyph | 0 / 0 | **2 / 0** | Both false candidates stay unknown |
| Dense unsupported crop | 0 / 0 | 0 / 0 | Manual fallback, not successful object recognition |

The five positive fixtures match nine annotated primitives: three possible-wall candidates and six unknown shapes/strokes. Correct `unknown` output is not a successful paper/steel/start/prop classification. Across the positive fixtures the weighted mean position error is about 0.30 pixels. The intentionally uncalibrated grid case reports one **missing scale** failure and cannot commit stage units. Separate unit tests check invalid scale, mistaken semantic labels, angle wrapping, misses and false detections in the evaluator. No dimension OCR or automatic calibration was tested or claimed.

The evaluator uses one-to-one greedy nearest-location matching within 12 raster pixels after primitive matching; semantic type is scored separately. Crowded real examples will need manual matching audits. Pixel/angle results are algorithm fixtures, not evidence of printout or vendor recognition accuracy. Final validation passed 783/783 tests (22 added, zero failures/skips), TypeScript, iOS Hermes export, Apple module autolinking, and diff/new-source whitespace checks. Swift compilation and physical-device execution remain unverified. The actual browser test decodes a synthetic PNG through the browser raster adapter and runs the registered recognizer; it is not an app-wide usability or native test.

Reproduce from `mobile`:

```text
node scripts/evaluate-diagram-recognition.cjs
node --test tests/diagramRecognition.test.cjs tests/diagramRasterReader.test.cjs
node scripts/verify-diagram-import-browser.cjs
npm test
npm run typecheck
npx expo export --platform ios --output-dir .expo/recognition-ios
npx expo-modules-autolinking resolve --platform apple
```

The per-case metrics/warnings/timings are in `.expo/diagram-recognition-evaluation.json`. See [fixture conventions](../tests/fixtures/diagram-recognition/README.md) for real-data manifests and permission-cleared original samples. Keep development and held-out real examples separate, preserve application/version provenance, and score each source population separately. No examples have been downloaded or represented as tested real data.

## Runtime and native status

Raster adapters bound input to 1024 pixels on the long side; the detector rejects sides below 8 or above 1024, over 2000 components, over 200 proposals, and work exceeding a 10-second wall-clock budget. It yields and checks AbortSignal during processing. A current desktop run of the 256-square fixtures took roughly 50-185 ms per case; a focused 1024-square synthetic check took roughly 365 ms. These are Windows/Node observations with timer yields, not iPhone latency guarantees or a throughput benchmark.

Processing still runs on the JavaScript thread and some component/template/grouping work between yields can pause interaction. Base64 native transfer plus RGBA, masks, queues and signatures consume transient memory; native peak memory and cancellation latency are unmeasured. No worker/background implementation is claimed. The image-size, component and proposal budgets are intentional limits rather than silently downsampling away arbitrary detail.

Browser uses its existing canvas decoder. iPhone adds only a bounded `pixels` method to the existing DiagramImport module using Core Graphics and a Hermes-compatible JS base64 decoder. Native image/file preparation is otherwise unchanged. Missing/older native modules report that a rebuild is needed and preserve manual reconstruction. Android preparation/raster decoding remains unsupported. Hermes export validates JS bundling/bytecode; it does not compile the new Swift method.

## Unfinished checks

Automatic geometry detection is **EXPERIMENTAL**, with synthetic-only evaluation. Native build, physical-device checks and real-sample evaluation remain unperformed; see [the single RC hardware checklist](rc-hardware-validation.md). Recognition expansion is outside the feature-frozen RC.

## Files changed in this pass

- `src/diagramImport/geometryDetector.ts`, `recognition.ts`, `model.ts`, `proposalEdits.ts`, `evaluation.ts`, `rasterReader.ts`, `rasterReader.web.ts`, `DiagramImportScreen.tsx`.
- `modules/diagram-import/ios/DiagramImportModule.swift` (bounded raster method only).
- `tests/diagramRecognition.test.cjs`, `diagramRasterReader.test.cjs`, `diagramImport.test.cjs`, `ui-reorganization.test.cjs`, `storage.test.cjs`, and `tests/fixtures/diagram-recognition/`.
- `scripts/evaluate-diagram-recognition.cjs`, `scripts/verify-diagram-import-browser.cjs`, this report, `docs/stage-diagram-import.md`, and root `bugs.md`, `features.md`, `changelog.md`.

Other pre-existing uncommitted route/import work was retained.
