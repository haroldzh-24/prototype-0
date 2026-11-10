/**
 * READ 3D DRAWING: turns a match book page with a 3D stage view (Practisim Designer and similar) into an import draft:
 * the floor straightened into a top-down picture to trace over, the scale from the floor grid, and draft elements
 * (shooting-area edges as fault lines, targets, walls) for review. Nothing reaches the stage until it is accepted.
 *
 * The pure parts (drawing box, top-down picture, drafts) are tested on synthetic renders; `readThreeDDrawing` wires
 * them to the phone's image and text functions, which are passed in so tests can stand in for them.
 */
import type { Raster } from './recognition';
import type { DocumentAsset, PageImage, Point, Proposal, Reconstruction } from './model';
import { fullQuad, validateReconstruction, validProposal } from './model';
import type { GroundResult, Mat3, Vec2 } from './groundPlane';
import { apply, straightenGround } from './groundPlane';
import type { Bay, Detected, Reading } from './practisimReader';
import { READER_ID, readDrawing } from './practisimReader';
import type { Briefing, Label, TextBox } from './briefing';
import { assignLabels, briefingSummary, briefingTargets, parseBriefing, parseLabels } from './briefing';
import { encodePng } from './png';
import type { TargetFamily } from '../stage/targetFamily';
import type { StageDocument } from '../stage/model';
import { presetsForFamily } from '../stage/targetPresets';

/** One grid square in the sample books is a yard (Stage 12 of the Area 4 2026 book labels 44 ft over 14.8 squares). */
export const GRID_SQUARE_INCHES = 36;

/** The drawing on a page: the rows and columns where at least 15 % of the pixels are green floor or grass. */
export function drawingBox(r: Raster): { x: number; y: number; width: number; height: number } | null {
  const green = (i: number) => r.rgba[i + 1] > r.rgba[i] + 12 && r.rgba[i + 1] > r.rgba[i + 2] + 12;
  const rows: number[] = [], cols = new Uint32Array(r.width);
  for (let y = 0; y < r.height; y++) {
    let n = 0;
    for (let x = 0; x < r.width; x++) if (green((y * r.width + x) * 4)) { n++; cols[x]++; }
    if (n >= r.width * 0.15) rows.push(y);
  }
  if (rows.length < r.height * 0.1) return null;
  const y0 = rows[0], y1 = rows[rows.length - 1], span = y1 - y0 + 1;
  let x0 = -1, x1 = -1;
  for (let x = 0; x < r.width; x++) if (cols[x] >= span * 0.15) { if (x0 < 0) x0 = x; x1 = x; }
  if (x0 < 0 || x1 - x0 < r.width * 0.1) return null;
  return { x: x0 / r.width, y: y0 / r.height, width: (x1 - x0 + 1) / r.width, height: span / r.height };
}

export type Extent = { x0: number; y0: number; x1: number; y1: number; pxPerCell: number };
/** The ground area the top-down picture shows: the bay plus a cell around it (no more than 80 cells a side). */
export function extentOf(bay: Bay, maxSide = 1024): Extent {
  const x0 = bay.left - 1, x1 = Math.min(bay.right + 1, x0 + 80), y0 = bay.back - 1.5, y1 = Math.min(bay.front, y0 + 80);
  const pxPerCell = Math.max(6, Math.min(24, Math.floor(maxSide / Math.max(x1 - x0, y1 - y0))));
  return { x0, y0, x1, y1, pxPerCell };
}
/** The straightened floor: each output pixel samples the drawing where that ground point appears (bilinear). */
export function renderTopDown(r: Raster, toImage: Mat3, e: Extent): Raster {
  const width = Math.round((e.x1 - e.x0) * e.pxPerCell), height = Math.round((e.y1 - e.y0) * e.pxPerCell);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, p = apply(toImage, { x: e.x0 + (x + 0.5) / e.pxPerCell, y: e.y0 + (y + 0.5) / e.pxPerCell });
    if (!p || p.x < 0 || p.y < 0 || p.x > r.width - 1 || p.y > r.height - 1) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; continue; }
    const ix = Math.min(r.width - 2, Math.floor(p.x)), iy = Math.min(r.height - 2, Math.floor(p.y)), fx = p.x - ix, fy = p.y - iy;
    for (let c = 0; c < 3; c++) {
      const at = (xx: number, yy: number) => r.rgba[(yy * r.width + xx) * 4 + c];
      out[o + c] = (1 - fy) * ((1 - fx) * at(ix, iy) + fx * at(ix + 1, iy)) + fy * ((1 - fx) * at(ix, iy + 1) + fx * at(ix + 1, iy + 1));
    }
    out[o + 3] = 255;
  }
  return { width, height, rgba: out };
}

export type Drafted = { proposals: Proposal[]; summary: string[]; barrels: number };
/**
 * Draft elements from a reading, in the top-down picture's normalized coordinates. Labels (T1, P2…) found by text
 * recognition name targets and order them, so T numbers match the match book; P labels make mini poppers.
 */
export function draftProposals(reading: Reading, e: Extent, family: TargetFamily, image: { path: string; page: number }, labels: Map<number, Label> = new Map()): Drafted {
  const w = e.x1 - e.x0, h = e.y1 - e.y0;
  // Everything stands in the bay: points a little past its sides or back (feet seen against a berm) are moved onto it.
  const b = reading.bay, keep = (p: Vec2): Vec2 => ({ x: Math.max(b.left + 0.05, Math.min(b.right - 0.05, p.x)), y: Math.max(b.back + 0.05, p.y) });
  const norm = (p: Vec2): Point => { const q = keep(p); return { x: (q.x - e.x0) / w, y: (q.y - e.y0) / h }; };
  const inside = (p: Point) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  const paper = presetsForFamily(family).find(p => p.type === 'cardboardTarget');
  const mini = presetsForFamily(family).find(p => p.id === 'uspsa-mini-popper-bst-v1') ?? presetsForFamily(family).find(p => p.type === 'steelPopper');
  const areas = reading.objects.filter((o): o is Extract<Detected, { kind: 'shootingArea' }> => o.kind === 'shootingArea');
  const centroid = (o: Vec2[]) => ({ x: o.reduce((s, p) => s + p.x, 0) / o.length, y: o.reduce((s, p) => s + p.y, 0) / o.length });
  const areaCentres = areas.map(a => centroid(a.outline));
  const recognition = (shape: 'line' | 'symbol', points: Point[]) => {
    const xs = points.map(p => Math.max(0, Math.min(1, p.x))), ys = points.map(p => Math.max(0, Math.min(1, p.y)));
    const x0 = Math.min(0.998, Math.min(...xs)), y0 = Math.min(0.998, Math.min(...ys));
    return { shape, bounds: { x: x0, y: y0, width: Math.min(1 - x0, Math.max(0.001, Math.max(...xs) - x0)), height: Math.min(1 - y0, Math.max(0.001, Math.max(...ys) - y0)) },
      sourceImage: image, scaleStatus: 'calibrated-approximate' as const };
  };
  const proposals: Proposal[] = [], summary: string[] = [];
  const segment = (id: string, type: 'wall' | 'faultLine', a: Vec2, b: Vec2, confidence: number, notes: string) => {
    const p = norm(a), q = norm(b);
    if (!inside(p) || !inside(q) || Math.hypot((q.x - p.x) * w, (q.y - p.y) * h) < 0.5) return;
    proposals.push({ id, type, position: p, end: q, rotation: Math.atan2((q.y - p.y) * h, (q.x - p.x) * w) * 180 / Math.PI, accepted: false, approximate: true,
      notes, source: READER_ID, confidence, recognition: recognition('line', [p, q]) });
  };
  // Targets, in label order (T1, T2… then P1… then unlabelled), so the app's T numbers follow the match book.
  const targets = reading.objects.map((o, i) => ({ o, i })).filter((t): t is { o: Extract<Detected, { kind: 'target' }>; i: number } => t.o.kind === 'target');
  const rank = (i: number) => { const l = labels.get(i); return l ? (l.kind === 'T' ? 0 : l.kind === 'P' ? 1000 : 2000) + l.number : 5000 + i; };
  targets.sort((a, b) => rank(a.i) - rank(b.i));
  let n = 0;
  for (const { o, i } of targets) {
    const p = norm(o.at);
    if (!inside(p)) continue;
    const label = labels.get(i), popper = label?.kind === 'P';
    // Facing: toward the nearest shooting area (where competitors stand), else toward the front of the bay.
    const toward = areaCentres.length ? areaCentres.reduce((best, c) => Math.hypot(c.x - o.at.x, c.y - o.at.y) < Math.hypot(best.x - o.at.x, best.y - o.at.y) ? c : best) : { x: o.at.x, y: e.y1 };
    const facing = Math.atan2(toward.y - o.at.y, toward.x - o.at.x), across = ((facing * 180 / Math.PI + 90) % 360 + 360) % 360;
    const preset = popper ? mini : paper;
    proposals.push({
      id: `t${++n}`, type: popper ? 'steelPopper' : 'cardboardTarget', position: p, rotation: across, accepted: false, approximate: true,
      ...(preset ? { presetId: preset.id } : {}),
      extent: { width: Math.min(1, 0.6 / w), height: Math.min(1, 0.6 / h) },
      notes: [label ? `Labelled ${label.kind}${label.number} on the drawing.` : 'No label read.', 'Placed where its stand meets the floor; facing guessed toward the nearest shooting area. Check both, and add hard cover or no-shoots the drawing shows.'].join(' '),
      source: READER_ID, confidence: o.confidence, recognition: recognition('symbol', [p]),
    });
  }
  areas.forEach((a, k) => a.outline.forEach((p, j) => segment(`a${k + 1}-${j + 1}`, 'faultLine', p, a.outline[(j + 1) % a.outline.length], a.confidence,
    `Edge ${j + 1} of shooting area ${k + 1}. After adding, AREAS → FROM FAULT LINES makes it a shooting area.`)));
  let f = 0, wl = 0;
  for (const o of reading.objects) {
    if (o.kind === 'faultLine') segment(`f${++f}`, 'faultLine', o.from, o.to, o.confidence, 'A red line on the floor that doesn\'t close an area by itself (a wall may close it). AREAS → FROM FAULT LINES uses it.');
    if (o.kind === 'wall') segment(`w${++wl}`, 'wall', o.from, o.to, o.confidence, 'Where the wall meets the floor. Its height comes from the default; the match book treats walls 6 ft or taller as going to infinity.');
  }
  const barrels = reading.objects.filter(o => o.kind === 'barrel').length;
  if (areas.length || f) summary.push(`${areas.length} shooting area${areas.length === 1 ? '' : 's'}${f ? ` and ${f} loose fault line${f === 1 ? '' : 's'}` : ''}`);
  summary.push(`${n} target${n === 1 ? '' : 's'}`, `${wl} wall piece${wl === 1 ? '' : 's'}`);
  return { proposals, summary, barrels };
}

/** Phone functions the reader needs; tests pass stand-ins. */
export type ThreeDDeps = {
  readRaster(page: PageImage, signal: AbortSignal): Promise<Raster>;
  alignPage(page: PageImage, alignment: Reconstruction['alignment']): Promise<PageImage>;
  storePng(bytes: Uint8Array, name: string): Promise<DocumentAsset>;
  /** Text lines with normalized boxes (top-left origin), or null when the phone can't read text. */
  recognizeText(page: PageImage): Promise<TextBox[] | null>;
};
export type ThreeDResult = { draft: Reconstruction; message: string; ground: GroundResult; briefing: Briefing | null };

/** Reads the 3D drawing on the draft's page and returns the draft ready for the Scale step. Throws with a reason. */
export async function readThreeDDrawing(draft: Reconstruction, family: TargetFamily, deps: ThreeDDeps, signal: AbortSignal): Promise<ThreeDResult> {
  if (!draft.page) throw new Error('Show the page first.');
  const page = draft.page, pageRaster = await deps.readRaster(page, signal);
  const box = drawingBox(pageRaster);
  if (!box) throw new Error('No 3D stage view was found on this page (it needs a green floor). Use NEXT to straighten a top-down plan instead.');
  const alignment = { corners: fullQuad(), rotation: 0 as const, crop: box };
  const cropped = await deps.alignPage(page, alignment);
  if (signal.aborted) throw new Error('Reading cancelled.');
  const raster = await deps.readRaster(cropped, signal);
  const { result: ground, reason } = straightenGround(raster);
  if (!ground) throw new Error(`${reason} Straighten it by hand with NEXT, or try a screenshot of just the drawing.`);
  if (signal.aborted) throw new Error('Reading cancelled.');
  const reading = readDrawing(raster, ground), e = extentOf(reading.bay);
  // Labels over targets and the briefing, when the phone can read text.
  const [labelBoxes, pageBoxes] = await Promise.all([deps.recognizeText(cropped).catch(() => null), deps.recognizeText(page).catch(() => null)]);
  const faces = reading.objects.map(o => o.kind === 'target' ? { x: (o.faceImage.x0 + o.faceImage.x1) / 2, y: o.faceImage.y0 } : { x: -1e9, y: -1e9 });
  const labels = labelBoxes ? assignLabels(parseLabels(labelBoxes.map(b => ({ ...b, x: b.x * raster.width, y: b.y * raster.height, width: b.width * raster.width, height: b.height * raster.height }))), faces, raster.width * 0.06) : new Map<number, Label>();
  const briefing = pageBoxes ? parseBriefing([...pageBoxes].sort((a, b) => a.y - b.y || a.x - b.x).map(b => b.text)) : null;
  const top = renderTopDown(raster, ground.toImage, e);
  const asset = await deps.storePng(encodePng(top.rgba, top.width, top.height), 'Straightened floor.png');
  const aligned: PageImage = { asset, width: top.width, height: top.height, page: page.page, pageCount: page.pageCount };
  const drafted = draftProposals(reading, e, family, { path: asset.path, page: page.page }, labels);
  // Scale: two points ten or more whole grid squares apart along the bottom of the picture.
  const span = Math.max(1, Math.floor(e.x1 - e.x0 - 2)), w = e.x1 - e.x0, h = e.y1 - e.y0;
  const a = { x: 1 / w, y: Math.max(0, (h - 1) / h) }, b = { x: (1 + span) / w, y: a.y };
  const next: Reconstruction = {
    ...draft, alignment, rectified: cropped, aligned, projection: 'top-down',
    calibration: { a, b, inches: span * GRID_SQUARE_INCHES, evidence: 'grid', approximate: true },
    // The bay's back-left corner at the stage's top-left corner.
    origin: { x: (e.x0 - reading.bay.left) * GRID_SQUARE_INCHES, y: (e.y0 - reading.bay.back) * GRID_SQUARE_INCHES },
    proposals: drafted.proposals,
  };
  // A drafted element that fails validation is dropped rather than failing the whole reading.
  next.proposals = next.proposals.filter(validProposal);
  validateReconstruction(next);
  const listed = briefingTargets(briefing), found = drafted.proposals.filter(p => p.type === 'cardboardTarget' || p.type === 'steelPopper').length;
  const bayYards = `${Math.round(reading.bay.right - reading.bay.left)} × ${Math.round(reading.bay.front - reading.bay.back)} yd`;
  const message = [
    `Straightened from the floor grid (match ${Math.round(ground.evidence.fit * 100)} %). One grid square is taken as 1 yd; the bay shows as ${bayYards}. Check the scale against a dimension on the drawing.`,
    `Drafted ${drafted.summary.join(', ')}.` + (drafted.barrels ? ` ${drafted.barrels} barrel${drafted.barrels === 1 ? '' : 's'} seen but not added; add a wall where one blocks shots.` : ''),
    briefing ? `Briefing: ${briefingSummary(briefing)}${listed !== null && listed !== found ? ` (${listed} targets listed, ${found} found)` : ''}.` : '',
    ...reading.warnings,
    'Review every element: nothing is on the stage until you add it.',
  ].filter(Boolean).join(' ');
  return { draft: next, message, ground, briefing };
}

/**
 * The stage grown (never shrunk) to the bay of a drawing read from a 3D view, and so every accepted element fits with
 * a foot of room. Other drawings, and stages already big enough, come back unchanged.
 */
export function fitStageToDrawing(stage: StageDocument, draft: Reconstruction): StageDocument {
  if (!draft.aligned || !draft.calibration || !draft.proposals.some(p => p.accepted && p.source === READER_ID)) return stage;
  const ipp = draft.calibration.inches / Math.hypot((draft.calibration.b.x - draft.calibration.a.x) * draft.aligned.width, (draft.calibration.b.y - draft.calibration.a.y) * draft.aligned.height);
  if (!Number.isFinite(ipp) || ipp <= 0) return stage;
  // The bay itself: the picture shows a yard past each side, and runs to the front edge of the view.
  let width = Math.max(stage.stage.width, draft.origin.x + draft.aligned.width * ipp - GRID_SQUARE_INCHES);
  let depth = Math.max(stage.stage.depth, draft.origin.y + draft.aligned.height * ipp);
  for (const p of draft.proposals.filter(q => q.accepted)) for (const q of [p.position, ...(p.end ? [p.end] : [])]) {
    width = Math.max(width, draft.origin.x + q.x * draft.aligned.width * ipp + 12);
    depth = Math.max(depth, draft.origin.y + q.y * draft.aligned.height * ipp + 12);
  }
  width = Math.ceil(width); depth = Math.ceil(depth);
  return width === stage.stage.width && depth === stage.stage.depth ? stage : { ...stage, stage: { ...stage.stage, width, depth } };
}
