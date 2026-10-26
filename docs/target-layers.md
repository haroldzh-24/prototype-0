# Target layers and painted hard cover (RC2 batch 15, 2026-10-26)

Select a paper target in BUILD → **LAYERS**:

- **ADD ON TOP:** a no-shoot (a hostage) or a second scoring target (a "double"). It copies the target's preset and size, starts over the lower left (no-shoot, in front) or to the right (target, behind), and then slides (1 in steps), rotates (5° steps) and goes in front or behind. Slides snap so the layer's top edge meets the target's neck, shoulder line, centre or top, its side edges meet the head edges, centre line or sides, or its centre lines up with the target's.
- **HARD COVER (painted black):** HEAD ONLY, TOP OPEN, OPEN TOP LEFT, OPEN TOP RIGHT, CENTRE STRIP (the owner's five), up to 3 per target. Each paint edge slides (level edges snap to the neck, shoulders and centre) and turns in 5° steps.
- The panel shows the stack face-on, as the shooter sees it, and the target's **open scoring area** in percent.

A layer is selected like any target; it offers LAYER, BASE TARGET and DELETE. Dragging any face of a stack moves the whole stack; turning or deleting the target carries or removes its layers; duplicating copies them. Every change is one undo step.

## Model

- A layer is an ordinary `cardboardTarget` or `noShootTarget` with `attachment: { parentId, offset, roll, front }` (`src/stage/model.ts`). Its position and facing are derived from the parent by `syncLayers` (`src/stage/targetLayers.ts`), which runs on every editor change: along the parent's face line by `offset.x`, at the parent's centre height plus `offset.y`, half an inch uprange (front) or downrange (behind). One level only.
- Painted cover is `hardCover: HardCover[]` on a paper target: `edge` paints everything on one side of a line, `strip` everything outside a band. Face coordinates: inches from the face centre, x to the shooter's right, y up; angles clockwise as the shooter sees them.
- The five presets use clean lines on the outline's own landmarks (neck at 0.3 h, shoulders at 0.15 h above centre, head 0.34 w wide). No vendor's printed split lines are copied. USPSA 4.2.4.3 allows painting the hidden part a contrasting colour, so only where the edge falls is the designer's choice.
- Schema 7 is unchanged; both fields are optional.

## Effect on planning and checks

- `exposure()` samples each layered scoring face on a fine grid: its outline, minus its own paint, minus layers in front of it (or minus its parent when it is behind). The planner aims at the bounding box of the open area (`targetFace(object, stage)`), and faces in one stack do not block each other's sight lines; their cover is already in the open area. Separate no-shoots and targets still block as before.
- A face with no open area cannot be engaged; the stage check reports `TARGET_COVERED`. Partly covered targets get an info line with the open share.
- USPSA 4.2.1.1: a half-size target stacked with a full-size no-shoot is a rule finding; a partly covered half-size target gets a reminder that half its lower A-zone must stay visible (A-zone positions are not in the app, so this is not measured).
- PCSL: Practical and Competition full-size targets on one stage (9.2.2.1), K-Zone with Practical (9.2.1.1), and K-Zone level limits (9.2.1.4) are now checked.
- The open share is what milestone C will use for expected hits on partial faces.

## Drawn

2D (on the target's face diagram, with paint), 3D and EYE (paint on both sides of the face, layers rolled), and face-on in the layers panel (`stackArtSvg` in `src/stage/targetArt.ts`).
