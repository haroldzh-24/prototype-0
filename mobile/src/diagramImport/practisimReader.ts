/**
 * Reading a 3D stage drawing (a match book page made in Practisim Designer or similar) once its ground is straightened
 * (groundPlane.ts): the bay, shooting areas, targets, walls and barrels, each placed where it touches the ground.
 *
 * Designers choose their own colours (red or yellow shooting areas, white, black or yellow walls, blue or black
 * barrels), so classes come from colour plus shape, and every result is a draft: the import screen shows it for review
 * and nothing reaches the stage until it is accepted. Positions are in grid cells (x right, y toward the camera).
 */
import type { Raster } from './recognition';
import type { GroundResult, Mat3, Rgb, Vec2 } from './groundPlane';
import { apply, FLOOR, GRID, kinds, OTHER, SHADOW } from './groundPlane';

export const READER_ID = 'practisim-3d-v1';

export type Colour = 'red' | 'yellow' | 'tan' | 'orange' | 'blue' | 'black' | 'white' | 'grey' | 'other';
/** Colour family of one pixel. Thresholds from the Area 4 2026 match book renders. */
export function colourOf(r: number, g: number, b: number): Colour {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 75) return 'black';
  if (r > 150 && r - g > 70 && r - b > 70) return 'red';
  if (b > 120 && b > r + 40 && b > g + 10) return 'blue';
  if (min > 175 && max - min < 45) return 'white';
  if (r > 170 && g > 160 && b < 120 && Math.abs(r - g) < 45) return 'yellow';
  if (r > 170 && g > 85 && g < 165 && b < 110 && r - g > 45) return 'orange';
  if (r > 140 && g > 105 && r >= g && g >= b - 10 && r - b > 35 && r - g < 75) return 'tan';
  if (max - min < 30) return 'grey';
  return 'other';
}

export type Bay = { left: number; right: number; back: number; front: number; leftSeen: boolean; rightSeen: boolean; backSeen: boolean };
export type Detected =
  | { kind: 'shootingArea'; outline: Vec2[]; colour: Colour; confidence: number; image: Box }
  | { kind: 'target'; at: Vec2; colour: Colour; small: boolean; confidence: number; image: Box; faceImage: Box }
  | { kind: 'wall'; from: Vec2; to: Vec2; colour: Colour; confidence: number; image: Box }
  | { kind: 'barrel'; at: Vec2; colour: Colour; confidence: number; image: Box }
  | { kind: 'faultLine'; from: Vec2; to: Vec2; colour: Colour; confidence: number; image: Box };
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Reading = { bay: Bay; objects: Detected[]; warnings: string[] };

type Component = { pixels: number[]; box: Box; colours: Record<Colour, number> };

/** Connected components (8-neighbour) of a mask, with each pixel's colour family counted. */
export function components(r: Raster, mask: Uint8Array, minSize = 12): Component[] {
  const w = r.width, h = r.height, label = new Int32Array(w * h).fill(-1), out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = out.length, pixels: number[] = [], box = { x0: w, y0: h, x1: 0, y1: 0 };
    const colours = { red: 0, yellow: 0, tan: 0, orange: 0, blue: 0, black: 0, white: 0, grey: 0, other: 0 };
    label[start] = id; stack.push(start);
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      pixels.push(i);
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      colours[colourOf(r.rgba[i * 4], r.rgba[i * 4 + 1], r.rgba[i * 4 + 2])]++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
    out.push({ pixels, box, colours });
  }
  return out.filter(c => c.pixels.length >= minSize);
}

/** Pixels per grid cell at an image point (how big one cell looks there). */
export function pixelsPerCell(toImage: Mat3, ground: Vec2): number {
  const a = apply(toImage, ground), b = apply(toImage, { x: ground.x + 1, y: ground.y }), c = apply(toImage, { x: ground.x, y: ground.y + 1 });
  if (!a || !b || !c) return 0;
  return Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - a.x, c.y - a.y));
}

/**
 * The bay: the floor region around the bottom middle of the picture, and where its edges meet the berms, in cells.
 * An edge that runs out of the picture instead of meeting a berm is marked as not seen.
 */
export function findBay(r: Raster, kindOf: Uint8Array, ground: GroundResult): { bay: Bay; floorMask: Uint8Array } | null {
  const w = r.width, h = r.height, floorish = (i: number) => kindOf[i] === FLOOR || kindOf[i] === GRID || kindOf[i] === SHADOW;
  // The floor: everything floor-coloured connected to the bottom middle, then each row filled between its outermost
  // floor pixels (objects standing on the floor are holes in it). Berms stop the fill.
  const reach = new Uint8Array(w * h), stack: number[] = [];
  for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x++) { const i = (h - 1) * w + x; if (floorish(i) && !reach[i]) { reach[i] = 1; stack.push(i); } }
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i - x) / w;
    if (x > 0 && !reach[i - 1] && floorish(i - 1)) { reach[i - 1] = 1; stack.push(i - 1); }
    if (x < w - 1 && !reach[i + 1] && floorish(i + 1)) { reach[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !reach[i - w] && floorish(i - w)) { reach[i - w] = 1; stack.push(i - w); }
    if (y < h - 1 && !reach[i + w] && floorish(i + w)) { reach[i + w] = 1; stack.push(i + w); }
  }
  const lefts: { x: number; y: number; edge: boolean }[] = [], rights: typeof lefts = [];
  const floorMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let left = -1, right = -1;
    for (let x = 0; x < w; x++) if (reach[y * w + x]) { if (left < 0) left = x; right = x; }
    if (left < 0) continue;
    // Ignore thin specks of floor colour on a berm: the row must be mostly floor between its ends.
    let n = 0;
    for (let x = left; x <= right; x++) if (reach[y * w + x]) n++;
    if (n < (right - left + 1) * 0.5) continue;
    for (let x = left; x <= right; x++) floorMask[y * w + x] = 1;
    lefts.push({ x: left, y, edge: left === 0 }); rights.push({ x: right, y, edge: right === w - 1 });
  }
  if (lefts.length < h * 0.2) return null;
  const toCells = (p: { x: number; y: number }) => apply(ground.toGround, p);
  const median = (vs: number[]) => { const s = [...vs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const lowerHalf = (ps: typeof lefts) => ps.filter(p => p.y > h * 0.3);
  const leftCells = lowerHalf(lefts).filter(p => !p.edge).map(toCells).filter((p): p is Vec2 => !!p).map(p => p.x);
  const rightCells = lowerHalf(rights).filter(p => !p.edge).map(toCells).filter((p): p is Vec2 => !!p).map(p => p.x);
  // Back: the topmost floor row around the middle; front: the bottom row.
  let backRow = h - 1;
  for (let y = 0; y < h; y++) if (floorMask[y * w + Math.floor(w / 2)]) { backRow = y; break; }
  const backs: number[] = [];
  for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x += 4) {
    for (let y = 0; y < h; y++) if (floorMask[y * w + x]) { const p = toCells({ x, y }); if (p) backs.push(p.y); break; }
  }
  const front = Math.max(...[0, w / 2, w - 1].map(x => toCells({ x, y: h - 1 })?.y ?? -Infinity));
  const allX = [...lefts, ...rights].map(toCells).filter((p): p is Vec2 => !!p).map(p => p.x);
  const bay: Bay = {
    left: leftCells.length > 10 ? median(leftCells) : Math.min(...allX), right: rightCells.length > 10 ? median(rightCells) : Math.max(...allX),
    back: backs.length ? median(backs) : (toCells({ x: w / 2, y: backRow })?.y ?? 0), front,
    leftSeen: leftCells.length > 10, rightSeen: rightCells.length > 10, backSeen: backRow > 2,
  };
  return [bay.left, bay.right, bay.back, bay.front].every(Number.isFinite) && bay.right > bay.left && bay.front > bay.back ? { bay, floorMask } : null;
}

/** Douglas–Peucker simplification of an open or closed polyline. */
export function simplify(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length < 3) return [...points];
  const distance = (p: Vec2, a: Vec2, b: Vec2) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
  };
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1, index = -1;
    for (let i = s + 1; i < e; i++) { const d = distance(points[i], points[s], points[e]); if (d > worst) { worst = d; index = i; } }
    if (worst > tolerance && index > 0) { keep[index] = 1; stack.push([s, index], [index, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * The outline of a shooting area drawn as lines on the ground. Its pixels are on the ground, so they map exactly:
 * rasterise them in cells at `res` cells per pixel, fill everything the outside can't reach, then trace the region's
 * boundary and simplify it to corners.
 */
export function outlineOnGround(points: readonly Vec2[], res = 0.1, close = 3): Vec2[] | null {
  if (points.length < 10) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = close + 2, W = Math.ceil((x1 - x0) / res) + 2 * pad + 1, H = Math.ceil((y1 - y0) / res) + 2 * pad + 1;
  if (W * H > 4_000_000 || W < 4 || H < 4) return null;
  const line = new Uint8Array(W * H);
  for (const p of points) line[(Math.round((p.y - y0) / res) + pad) * W + Math.round((p.x - x0) / res) + pad] = 1;
  // Close gaps where a wall hides part of the line: thicken by `close` cells, fill, then thin back by the same.
  const grow = (src: Uint8Array, radius: number, value: 0 | 1) => {
    const out = new Uint8Array(src);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (src[y * W + x] !== value) continue;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny * W + nx] = value;
      }
    }
    return out;
  };
  const thick = grow(line, close, 1);
  // Outside = reachable from the border without crossing the line.
  const outside = new Uint8Array(W * H), stack = [0];
  outside[0] = 1;
  while (stack.length) {
    const i = stack.pop()!, x = i % W, y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || outside[j] || thick[j]) continue;
      outside[j] = 1; stack.push(j);
    }
  }
  let inside = 0;
  for (let i = 0; i < thick.length; i++) if (!outside[i] && !thick[i]) inside++;
  if (inside * res * res < 0.5) return null; // an open line, not an area
  // Region = not outside, thinned back by the closing radius (to the middle of the drawn line).
  const filled = new Uint8Array(W * H);
  for (let i = 0; i < filled.length; i++) filled[i] = outside[i] ? 0 : 1;
  const region = grow(filled, close, 0);
  const inRegion = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && region[y * W + x] === 1;
  let start = -1;
  for (let i = 0; i < region.length && start < 0; i++) if (region[i]) start = i;
  if (start < 0) return null;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const contour: Vec2[] = [];
  let cx = start % W, cy = (start - cx) / W, dir = 6;
  for (let steps = 0; steps < 200000; steps++) {
    contour.push({ x: x0 + (cx - pad) * res, y: y0 + (cy - pad) * res });
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8, nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (inRegion(nx, ny)) { cx = nx; cy = ny; dir = d; moved = true; break; }
    }
    if (!moved || (cy * W + cx === start && contour.length > 2)) break;
  }
  if (contour.length < 4) return null;
  // Simplify the closed loop: split at the point farthest from the start, simplify both halves.
  let far = 0, farD = -1;
  contour.forEach((p, i) => { const d = Math.hypot(p.x - contour[0].x, p.y - contour[0].y); if (d > farD) { farD = d; far = i; } });
  const a = simplify(contour.slice(0, far + 1), 0.35), b = simplify([...contour.slice(far), contour[0]], 0.35);
  const outline = [...a, ...b.slice(1, -1)];
  return outline.length >= 3 ? outline : null;
}

/**
 * Straight pieces in a cloud of points along drawn lines: repeatedly the line through the most points (within
 * `tolerance`), cut to its densely covered stretch, until no piece of at least `minLength` is left. Deterministic:
 * candidate lines go through pairs of points taken at fixed strides.
 */
export function lineSegments(points: readonly Vec2[], tolerance: number, minLength: number): { from: Vec2; to: Vec2 }[] {
  let left = [...points];
  const out: { from: Vec2; to: Vec2 }[] = [];
  for (let round = 0; round < 12 && left.length > 10; round++) {
    let best: { inliers: Vec2[]; dir: Vec2; origin: Vec2 } | null = null;
    const stride = Math.max(1, Math.floor(left.length / 40));
    for (let i = 0; i < left.length; i += stride) for (let j = i + stride; j < left.length; j += stride) {
      const a = left[i], b = left[j], len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < minLength * 0.5) continue;
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const inliers = left.filter(p => Math.abs((p.x - a.x) * dir.y - (p.y - a.y) * dir.x) <= tolerance);
      if (!best || inliers.length > best.inliers.length) best = { inliers, dir, origin: a };
    }
    if (!best || best.inliers.length < 10) break;
    // The longest stretch along the line without gaps over 0.6 cells.
    const ts = best.inliers.map(p => (p.x - best!.origin.x) * best!.dir.x + (p.y - best!.origin.y) * best!.dir.y).sort((a, b) => a - b);
    let runStart = 0, bestRun = [0, 0];
    for (let k = 1; k <= ts.length; k++) {
      if (k === ts.length || ts[k] - ts[k - 1] > 0.6) { if (ts[k - 1] - ts[runStart] > ts[bestRun[1]] - ts[bestRun[0]]) bestRun = [runStart, k - 1]; runStart = k; }
    }
    const t0 = ts[bestRun[0]], t1 = ts[bestRun[1]];
    const used = new Set(best.inliers.filter(p => { const t = (p.x - best!.origin.x) * best!.dir.x + (p.y - best!.origin.y) * best!.dir.y; return t >= t0 - 0.01 && t <= t1 + 0.01; }));
    left = left.filter(p => !used.has(p));
    if (t1 - t0 < minLength) continue;
    const at = (t: number) => ({ x: best!.origin.x + best!.dir.x * t, y: best!.origin.y + best!.dir.y * t });
    out.push({ from: at(t0), to: at(t1) });
  }
  return out;
}

/** Groups ground points that lie within `gap` cells of each other (one shooting area hidden in places by walls). */
export function clusterPoints(points: readonly Vec2[], gap: number): Vec2[][] {
  const key = (p: Vec2) => `${Math.floor(p.x / gap)},${Math.floor(p.y / gap)}`;
  const cells = new Map<string, number[]>();
  points.forEach((p, i) => { const k = key(p); const list = cells.get(k); if (list) list.push(i); else cells.set(k, [i]); });
  const parent = new Map<string, string>();
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(k, r); return r; };
  for (const k of cells.keys()) parent.set(k, k);
  for (const k of cells.keys()) {
    const [cx, cy] = k.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = `${cx + dx},${cy + dy}`; if (cells.has(n)) parent.set(find(n), find(k)); }
  }
  const groups = new Map<string, Vec2[]>();
  for (const [k, list] of cells) { const r = find(k); const g = groups.get(r) ?? []; for (const i of list) g.push(points[i]); groups.set(r, g); }
  return [...groups.values()];
}

/**
 * Ground point under a target face: below the face's lowest row, the stand's legs continue down in the picture until
 * the floor shows through for a few rows; the foot is the last non-floor row there. Without visible legs the foot is
 * the face's own bottom.
 */
function footBelow(c: Component, w: number, h: number, kindOf: Uint8Array): { x: number; y: number; legs: boolean } {
  const { x0, x1, y1 } = c.box, cx = Math.round((x0 + x1) / 2), half = Math.max(2, Math.round((x1 - x0) * 0.6));
  let foot = y1, gap = 0, thin = 0, wide = 0;
  for (let y = y1 + 1; y < h && y < y1 + (x1 - x0 + 1) * 4 + 6; y++) {
    let n = 0;
    for (let x = Math.max(0, cx - half); x <= Math.min(w - 1, cx + half); x++) if (kindOf[y * w + x] === OTHER) n++;
    if (n) { foot = y; gap = 0; if (n <= Math.max(2, (2 * half + 1) * 0.45)) thin++; else wide++; } else if (++gap >= 4) break;
  }
  // Legs: mostly thin rows under the face, or the face sits right on the floor.
  return { x: cx, y: foot, legs: foot === y1 || thin >= 2 && thin >= wide };
}

const boxOf = (ps: readonly Vec2[]): Box => ({ x0: Math.min(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)), x1: Math.max(...ps.map(p => p.x)), y1: Math.max(...ps.map(p => p.y)) });

/** Colour groups read separately, so a target touching a wall in the picture stays a target. */
const GROUPS: Record<'red' | 'face' | 'blue' | 'frame', readonly Colour[]> = {
  red: ['red'], face: ['tan', 'yellow', 'orange'], blue: ['blue'], frame: ['white', 'black', 'grey'],
};

/**
 * Reads the objects on a straightened drawing. `ground` comes from straightenGround on the same raster.
 */
export function readDrawing(r: Raster, ground: GroundResult): Reading {
  const warnings: string[] = [], w = r.width, h = r.height;
  const kindOf = kinds(r, ground.floor);
  // Thin light lines that don't fall on the straightened grid are walls seen against the floor, not grid.
  for (let i = 0; i < kindOf.length; i++) {
    if (kindOf[i] !== GRID) continue;
    const p = apply(ground.toGround, { x: i % w, y: Math.floor(i / w) });
    if (p && Math.min(Math.abs(p.x - Math.round(p.x)), Math.abs(p.y - Math.round(p.y))) > 0.12) kindOf[i] = OTHER;
  }
  const found = findBay(r, kindOf, ground);
  if (!found) return { bay: { left: 0, right: 0, back: 0, front: 0, leftSeen: false, rightSeen: false, backSeen: false }, objects: [], warnings: ['The bay floor could not be found.'] };
  const { bay, floorMask } = found;
  // Object pixels: not floor, inside the floor's outline or standing on it (up to a body height above it).
  const region = new Uint8Array(w * h), columnTop = new Int32Array(w).fill(h);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (floorMask[y * w + x]) { columnTop[x] = y; break; }
  // The back berm's colour, from just above the floor's top edge; berm texture there is not an object.
  const bermSamples: Rgb[] = [];
  for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x += 3) {
    const y = columnTop[x] - 8;
    if (y > 0 && y < h && kindOf[y * w + x] === OTHER) bermSamples.push([r.rgba[(y * w + x) * 4], r.rgba[(y * w + x) * 4 + 1], r.rgba[(y * w + x) * 4 + 2]]);
  }
  const berm: Rgb | null = bermSamples.length > 10 ? [0, 1, 2].map(k => bermSamples.map(c => c[k]).sort((a, b) => a - b)[Math.floor(bermSamples.length / 2)]) as unknown as Rgb : null;
  const colourMap: Colour[] = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (kindOf[i] !== OTHER) continue;
    const c: Rgb = [r.rgba[i * 4], r.rgba[i * 4 + 1], r.rgba[i * 4 + 2]];
    if (!floorMask[i] && berm && Math.hypot(c[0] - berm[0], c[1] - berm[1], c[2] - berm[2]) < 45) { kindOf[i] = SHADOW; continue; }
    if (floorMask[i] || (y < columnTop[x] && y > columnTop[x] - h * 0.12)) { region[i] = 1; colourMap[i] = colourOf(c[0], c[1], c[2]); }
  }
  const group = (cs: readonly Colour[]) => { const m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) if (region[i] && cs.includes(colourMap[i])) m[i] = 1; return m; };
  const objects: Detected[] = [];
  const toCells = (p: { x: number; y: number }) => apply(ground.toGround, p);
  const inBay = (p: Vec2) => p.x >= bay.left - 1 && p.x <= bay.right + 1 && p.y >= bay.back - 1.5 && p.y <= bay.front + 1;
  // Something standing on the floor has floor right below its foot (berm texture doesn't).
  const onFloor = (p: { x: number; y: number }) => { for (let y = p.y + 1; y <= Math.min(h - 1, p.y + 4); y++) for (let x = Math.max(0, p.x - 3); x <= Math.min(w - 1, p.x + 3); x++) if (floorMask[y * w + x]) return true; return false; };
  const sizeOf = (c: Component, at: Vec2) => { const ppc = pixelsPerCell(ground.toImage, at); return ppc > 0 ? Math.max(c.box.x1 - c.box.x0 + 1, c.box.y1 - c.box.y0 + 1) / ppc : Infinity; };
  const fillOf = (c: Component) => c.pixels.length / ((c.box.x1 - c.box.x0 + 1) * (c.box.y1 - c.box.y0 + 1));
  // Shooting areas: red outlines on the ground. Their pixels are on the ground, so they map exactly; pieces hidden by
  // walls are joined by grouping red ground points within half a cell.
  const redMask = group(GROUPS.red), redPoints: Vec2[] = [];
  for (const c of components(r, redMask, 6)) {
    if (fillOf(c) > 0.6 && c.pixels.length > 200) continue; // a solid red prop, not a line
    for (const i of c.pixels) { const p = toCells({ x: i % w, y: Math.floor(i / w) }); if (p && inBay(p)) redPoints.push(p); }
  }
  for (const cluster of clusterPoints(redPoints, 0.5)) {
    if (cluster.length < 30) continue;
    const outline = outlineOnGround(cluster);
    if (outline) objects.push({ kind: 'shootingArea', outline, colour: 'red', confidence: 0.8, image: boxOf(cluster.map(p => apply(ground.toImage, p)).filter((q): q is Vec2 => !!q)) });
    else {
      // An open red line (part of the area's edge is a wall, or a fault line): straight pieces as fault lines.
      const segs = lineSegments(cluster, 0.15, 0.8);
      for (const seg of segs) objects.push({ kind: 'faultLine', ...seg, colour: 'red', confidence: 0.6, image: boxOf([seg.from, seg.to].map(p => apply(ground.toImage, p)).filter((q): q is Vec2 => !!q)) });
      if (segs.length) warnings.push('Some red lines don\'t close into an area. They are fault lines; use AREAS → FROM FAULT LINES to make the shooting area.');
    }
  }
  // Targets: compact tan, yellow or orange faces about half a yard wide, standing on legs.
  for (const c of components(r, group(GROUPS.face), 6)) {
    const foot = footBelow(c, w, h, kindOf), at = toCells(foot);
    if (!at || !inBay(at) || !onFloor(foot) || !foot.legs) continue;
    const size = sizeOf(c, at), ppc = pixelsPerCell(ground.toImage, at);
    // A face is at least a third of a yard wide-ish: specks of berm texture are far smaller.
    if (size > 1.6 || fillOf(c) < 0.3 || c.pixels.length < Math.max(12, 0.05 * ppc * ppc)) continue;
    const top = (Object.keys(c.colours) as Colour[]).sort((a, b) => c.colours[b] - c.colours[a])[0];
    objects.push({ kind: 'target', at, colour: top, small: size < 0.35, confidence: 0.5, image: c.box, faceImage: c.box });
  }
  // Barrels: solid blue blobs (Practisim's default barrel colour). Stacked barrels are one blob.
  for (const c of components(r, group(GROUPS.blue), 20)) {
    if (fillOf(c) < 0.35) continue;
    const foot = { x: Math.round((c.box.x0 + c.box.x1) / 2), y: c.box.y1 }, at = toCells(foot);
    if (at && inBay(at) && onFloor(foot)) objects.push({ kind: 'barrel', at, colour: 'blue', confidence: 0.6, image: c.box });
  }
  // Walls: long thin frames (white, black or grey lines).
  for (const c of components(r, group(GROUPS.frame), 25)) {
    const foot = toCells({ x: Math.round((c.box.x0 + c.box.x1) / 2), y: c.box.y1 });
    if (!foot || !inBay(foot) || fillOf(c) > 0.5 || sizeOf(c, foot) < 1) continue;
    const top = (Object.keys(c.colours) as Colour[]).sort((a, b) => c.colours[b] - c.colours[a])[0];
    for (const seg of wallSegments(c, w, toCells)) if (inBay(seg.from) && inBay(seg.to)) objects.push({ kind: 'wall', ...seg, colour: top, confidence: 0.4, image: c.box });
  }
  if (!bay.leftSeen || !bay.rightSeen) warnings.push('A side of the bay runs out of the picture; its width is what the drawing shows.');
  return { bay, objects, warnings };
}

/**
 * A wall's footprint from its lowest outline: for each picture column the lowest pixel is where the panel meets the
 * ground (the top edge is always higher in the picture). Those points, mapped to the ground and simplified, are the
 * wall's segments; pieces under 0.8 cells are dropped.
 */
export function wallSegments(c: Component, w: number, toCells: (p: { x: number; y: number }) => Vec2 | null): { from: Vec2; to: Vec2 }[] {
  const lowest = new Map<number, number>();
  for (const i of c.pixels) { const x = i % w, y = (i - x) / w; if ((lowest.get(x) ?? -1) < y) lowest.set(x, y); }
  const xs = [...lowest.keys()].sort((a, b) => a - b);
  const pts = xs.map(x => toCells({ x, y: lowest.get(x)! })).filter((p): p is Vec2 => !!p);
  if (pts.length < 3) return [];
  const corners = simplify(pts, 0.3), out: { from: Vec2; to: Vec2 }[] = [];
  for (let i = 1; i < corners.length; i++) if (Math.hypot(corners[i].x - corners[i - 1].x, corners[i].y - corners[i - 1].y) >= 0.8) out.push({ from: corners[i - 1], to: corners[i] });
  return out;
}
