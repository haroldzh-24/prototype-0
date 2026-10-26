# 3D stage view and eye-level walk-through (RC2 batch 10, 2026-10-25)

The stage editor has three views of the same stage document, switched with **2D · 3D · EYE** at the top left of the canvas (also under Stage tools and View):

| View | What it is for | Editing |
| --- | --- | --- |
| 2D | The plan, as before | Everything |
| 3D | Seeing the stage as built: walls with their real heights and ports, raised targets on stands, the planned route on the ground | Tap to select; drag the selected object along the ground (same snapping and bounds as a 2D drag, one undo step); − / + wall height (6 in steps) or target elevation (3 in steps); rotate; EDIT opens the usual inspector |
| EYE | Standing where the shooter stands: at the start, at each stop, or anywhere along the planned walk | None (looking only) |

Undo, Save and the unsaved-changes guard are shared, because all three views edit one document through the editor's existing handlers.

## 3D

- One finger orbits, two fingers pan and pinch to zoom; − / + / FIT buttons for one-handed use and the web. FIT stands uprange looking downrange from 50° up, as close as fits the whole bay.
- In ROUTE mode (or with the route layer on) the walking path is drawn on the ground in route blue, planned engagements on the move as wider green stretches, and stops as squares with their labels. Route editing (PATH, ENGAGE, REVIEW, adding waypoints) stays in 2D and switches back to it.
- Geometry is the same as the old 2.5D preview's (walls split around ports, target outlines and face cuts), now drawn with depth: `src/stage3d/scene.ts`.

## Eye level and engaging on the move

- Eye height defaults to 5 ft 3 in and is adjusted with − / + (36–84 in), remembered on the device.
- The scrubber under the view is the planned walk: stops are marks, green stretches are where the plan engages a target on the move. Drag along it, step a yard with ◀ ▶, or jump to START, P1, P2… The view turns toward what the plan engages at that point (drag to look around; RE-AIM to turn back).
- For every scoring target the list says, for that exact spot:
  - **ON THE MOVE** — the plan engages it on this stretch, with the yards of legal walking left;
  - **FROM HERE** — engaged standing at this stop;
  - **LEGAL** — not planned here but legal (firing area, safe angle, steel distance, line of sight), with the visible share of the face;
  - **VISIBLE** — can be seen but not legally engaged here, with the reason (outside its firing area, outside the safe angle, steel too close);
  - **HIDDEN**, or **DONE** once the plan has engaged it.
- These use the planner's own rules (`checkEngagement` in Route Planner V2) and the route analysis (`analyzeEngagements`), so the eye view, the plan and the 2D analysis agree. Without route settings (no firing areas) the list shows visibility only.
- Labels and the list are what to trust; the picture is a guide. Sight lines are plan-view lines with wall heights: a target seen over a wall under 69 in, or past another target, is marked as assumed (`docs/route-planner-v2.md`).

## Implementation

- `src/stage3d/math.ts` (matrices, rays, triangulation), `scene.ts` (vertex arrays, pick triangles, labels), `camera.ts` (orbit and eye cameras, fit), `walk.ts` (route walk and per-target status) are pure TypeScript and unit-tested (`tests/stage3d.test.cjs`).
- `scene.ts` caches each object's geometry by the object (the editor replaces objects on every edit, never mutates them), so a drag rebuilds one object, not the stage.
- `renderer.ts` is a small WebGL 1 renderer (two-sided lit triangles and lines), drawn on demand rather than every frame. No three.js: from reading both sources, three.js 0.186 would refuse expo-gl's WebGL 2 context (expo-gl 56.0.5+ makes it an instance of `WebGLRenderingContext`, which three takes for WebGL 1), and the stage needs only coloured polygons.
- `GLStage.tsx` loads `expo-gl` lazily. If its native module is missing or the GL context fails, the view shows a message and the older 2.5D preview instead of crashing.
- World space is right-handed with Z up: world = (stage x, −stage y, stage z), so the plan seen from above matches the 2D editor.

## Needs a new build

`expo-gl` is a native module, so 3D and EYE work in the first EAS build made after this change. Checked in the web build (WebGL in Chromium); not yet on a device. Device checks: orbit and pinch feel, dragging a selected object, frame rate on a large stage, the eye view's scrubber, and day/night colours outdoors.
