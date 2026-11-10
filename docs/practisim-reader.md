# READ 3D DRAWING: match book stage drawings (2026-11-09)

Match books made with Practisim Designer show each stage as a 3D view on a gridded floor. READ 3D DRAWING (import →
page step) turns that view into a top-down drawing to trace over, with a scale and draft elements to review. Code:
`mobile/src/diagramImport/groundPlane.ts` (straightening), `practisimReader.ts` (what's on the floor),
`briefing.ts` (briefing and labels), `threeD.ts` (the import draft), `png.ts` (the picture). Tests:
`tests/practisimReader.test.cjs` (a synthetic render with a known camera; the match book itself isn't in the repo).

## How it works

1. **Drawing box.** The rows and columns of the page that are at least 15 % green. The box is cut out at the import's
   full resolution, then read at up to 1024 px.
2. **Floor and grid.** The floor colour is the most common green in the lower middle. Grid pixels are thin lines brighter
   than their surroundings (a 9 × 9 local mean, with a threshold set from each drawing's own texture) that keep the
   floor's green tint. White or grey lines are walls, not grid.
3. **Vanishing points.** Grid lines come from a Hough transform, at half size first. Lines running into the bay
   (steep in the picture) meet at one vanishing point and lines across it at another; both are found with a
   deterministic RANSAC over pairs and refined. The line through both is the horizon, which undoes the perspective.
4. **Square cells.** After that step, each family of grid lines is parallel. Their spacing is the gap that puts the
   most lines on a lattice, minus half the empty lattice places. Mapping both spacings to 1 makes one grid square one
   unit.
5. **Polish.** A Nelder–Mead search tweaks the result so grid pixels land on whole numbers and plain floor pixels
   don't. It starts from the found cell size and from half and double it in each direction. The fit score (grid minus
   floor) has to reach 0.4 or the reading stops with a reason. When the half-size pass fits under 0.5, it is repeated
   at full size.
6. **Objects.** The bay is the floor region around the bottom middle, with its edges where berms start. Each colour
   group is read on its own, so a target touching a wall in the picture stays a target:
   - Red ground lines map exactly (they lie on the floor). Pieces hidden by walls are joined within half a cell. Closed
     outlines become shooting areas; open lines become fault-line pieces.
   - Tan, yellow or orange faces with legs below them are targets, placed where the legs meet the floor.
   - Blue blobs are barrels.
   - White, black or grey frames are walls, taken from their lowest edge in the picture.
7. **Text.** The phone's text recognition reads the briefing (targets, poppers, rounds, best hits) and the floating
   T1, P2 labels. Labels set the T numbering, and P labels make mini poppers.
8. **Draft.** The straightened floor becomes the top-down picture (bay plus a yard each side), with the calibration
   "N squares = N yd" and every element unaccepted and marked as a draft. Adding accepted elements grows the stage to
   the bay.

## Scale

The grid square is taken as 1 yd. Stage 12 of the Area 4 2026 book labels 44 ft and 40 ft dimensions, which measure
14.8 and 13.4 squares after straightening (about 3.0 ft a square). Stage 3's barrels (about 0.64 square across)
agree. Other designers may use metres: the Scale step says to check the scale against a dimension on the page.

## Results on the Area 4 2026 match book (13 stage pages, read at 1024 px)

| | Stages |
| --- | --- |
| Floor straightened (grid fit 0.44–0.98) | 2, 3, 4, 7, 8, 9, 10, 11, 12, 13 |
| Refused (faint grid, or the grid didn't fit) | 1, 5, 6 |
| Shooting area found as a closed outline | 2 (both), 8, 9 (all three), 11 |
| Shooting area found as fault-line pieces (a wall closes it) | 3, 7, 10, 12, 13 |

Target drafts typically found 60–90 % of the briefing's targets, plus a few false ones on textured berms. Walls come
out roughly right where frames don't overlap in the picture. Treat every draft as a starting point: the top-down
picture underneath is the dependable part.

Rerun on 2026-11-10 with the same pages and code path (`e735510`): the floor straightened on 12 of 13 pages; 5 and 6
now pass, at fits of 0.44 and 0.40, right at the 0.40 cutoff, so small changes can tip them either way. Stage 1 still
fails.

## Photos of a printout (2026-11-10)

A phone photo of the printed page adds uneven light, a shadow across the page, a colour cast and glare
(`src/diagramImport/photoLight.ts`, `tests/printoutPhoto.test.cjs`):

- **Flatten the paper first.** The page corners found when the photo is prepared (or set in CORNERS) straighten the
  paper before the drawing is looked for; if the drawing isn't inside them, the whole picture is read instead.
- **Even the light.** The floor is one green and the paper one white across the page, so where either looks darker the
  light was dimmer. The floor is measured on its own colour only (its chroma, so grass and berms don't count), a coarse
  map of the light is filled in where neither shows, smoothed, and divided out. The lit paper sets the exposure and the
  colour balance. A clean render comes back untouched: the 13 PDF pages read exactly as before.
- **Black-and-white prints** are refused with what to use instead (colours find the floor, areas and targets).
- **Glare and very uneven light** are named in the message when a photo can't be read.

Simulated photos of the 12 readable Area 4 pages (dim warm light; a gradient; a soft shadow; a hard shadow), scored
against the PDF reading (bay within 2 yd each way, paper targets within 2 or 25 %):

| | Read | Like the PDF |
| --- | --- | --- |
| Read as photographed | 42 of 48 | 6 of 48 |
| Light evened first | 46 of 48 | 22 of 48 |

Not yet tried on real phone photos. The reader itself is sensitive (several PDF pages sit near its cutoffs), so a
photo that reads is still a draft to check.

## Limits

- Designers choose colours: yellow shooting areas (Stage 4) aren't drafted, and black barrels look like walls.
- No-shoots, barrels as obstacles, the start position, movers and activated targets aren't drafted.
- A view that shows only part of the bay (Stage 9, Stage 13) gives only that part.
- Reading runs on the JavaScript thread. It takes about 0.5–2 s in Node, so a few seconds on a phone (unmeasured).
