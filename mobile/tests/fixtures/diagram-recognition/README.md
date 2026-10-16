# Diagram recognition fixtures

Every checked-in image description here is **synthetic**. There are no real stage-builder exports or paper photographs in this dataset. The diamond template used by a unit test is synthetic and is never registered in the application.

JSON stores reproducible drawing primitives plus independently written expected annotations. `render.cjs` renders them to RGBA without an image-processing package. Positive cases cover isolated axial/diagonal wall-like bars, connected orthogonal strokes, an outline rectangle, a circle, repeated unknown silhouettes, and a light grid/text run. The dense case checks fallback. `annotation-ambiguity.json` intentionally measures two false detections from a dimension baseline and an isolated O-like glyph; it must not be presented as a successful recognition case.

Run from `mobile`:

```text
node scripts/evaluate-diagram-recognition.cjs
node --test tests/diagramRecognition.test.cjs tests/diagramRasterReader.test.cjs
```

The report is `.expo/diagram-recognition-evaluation.json`. It separates matched locations/shapes, correct/wrong candidate classifications, false detections, misses, mean pixel-position errors, unoriented line-angle errors, missing/incorrect scale, and desktop elapsed time. A correct `unknown` label means the geometry remained unclassified; it is not a successful paper/steel/prop classification. Confidence values are heuristic agreement, not calibrated probabilities.

## Adding permission-cleared real examples

Keep real samples in a separate directory, preserving the original export/photo and application/version provenance. Use the existing page/crop pipeline and raster reader to produce a top-down, at-most-1024-pixel-per-side RGBA file. Store those exact raw bytes as `sample.rgba`; do not rename PNG/JPEG bytes to RGBA. No decoding package is needed by the Node evaluator. Supply annotations in a companion manifest:

```json
{
  "id": "user-sample-001",
  "origin": "user-provided",
  "application": "Name and version, if known",
  "original": "original-export.png",
  "width": 512,
  "height": 512,
  "rgbaFile": "sample.rgba",
  "expected": [
    {"id":"wall-1","type":"wall","shape":"line","center":{"x":0.5,"y":0.4},"rotation":0}
  ],
  "scale": {"expectedInchesPerPixel":1,"actualInchesPerPixel":1}
}
```

Coordinates are normalized to the **prepared crop**. Annotation centers for segments are their midpoints; candidate segment positions in the app remain their starts. `shape` is line/rectangle/circle/symbol. Omit rotation when visually undefined or symmetric, particularly circles. Include all expected elements so misses are measurable. Set ground-truth candidate types accurately: do not call every circle steel or every line a wall. The optional scale check compares an independently verified scale to the supplied manual calibration; no automatic dimension/OCR reading is implemented. Omit actual scale to record missing calibration. The shipped grid example deliberately does this.

Evaluate with `node scripts/evaluate-diagram-recognition.cjs <sample-directory>`. Keep development and held-out examples separate and report their `origin` separately. Include multiple software icon conventions, legends/text, thin/colored lines, noisy backgrounds, real dimension arrows, rotated symbols and cases that must remain manual. Isometric/perspective drawings are unsupported: retain them for manual-fallback/workflow testing, not top-down metric scoring. Do not infer real printout accuracy from this synthetic dataset.
