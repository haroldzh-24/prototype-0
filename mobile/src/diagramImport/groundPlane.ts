/**
 * Straightening the ground of a 3D stage drawing (match book pages made in Practisim Designer and similar programs).
 *
 * The drawing shows the bay floor in perspective, covered by a square grid. Grid lines that run away from the camera
 * meet at one vanishing point; lines across the bay meet at another (often far away, nearly parallel). Those two points
 * give the horizon, which undoes the perspective. The grid's spacing in each direction then fixes the remaining shear
 * and stretch, so one grid square becomes one square unit. The result is a homography from image pixels to "grid
 * cells" on the ground: x across the bay (right), y toward the camera (down the page, so the back of the bay is up,
 * which is the app's default downrange).
 *
 * Pure functions on an RGBA raster; no React, no native code. Thresholds are tuned on the 13 stages of the Area 4
 * Championship 2026 match book (see docs/practisim-reader.md) and checked on synthetic renders in tests.
 */
import type { Raster } from './recognition';

export type Vec2 = { x: number; y: number };
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
export type Rgb = readonly [number, number, number];
export type Line = { a: number; b: number; c: number; length: number; x1: number; y1: number; x2: number; y2: number };

export function apply(h: Mat3, p: Vec2): Vec2 | null {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  const x = (h[0] * p.x + h[1] * p.y + h[2]) / w, y = (h[3] * p.x + h[4] * p.y + h[5]) / w;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
export function multiply(a: Mat3, b: Mat3): Mat3 {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return r as unknown as Mat3;
}
export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-15) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
/** The homography taking four points to four others (direct linear solve with h33 = 1). */
export function fromPoints(from: readonly Vec2[], to: readonly Vec2[]): Mat3 | null {
  if (from.length !== 4 || to.length !== 4) return null;
  const m: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const { x, y } = from[k], { x: u, y: v } = to[k];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 8; r++) if (r !== col) { const f = m[r][col] / m[col][col]; for (let c = col; c < 9; c++) m[r][c] -= f * m[col][c]; }
  }
  const h = m.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// ---------------------------------------------------------------------------------------------------------------
// Colours

const at = (r: Raster, x: number, y: number): Rgb => { const i = (y * r.width + x) * 4; return [r.rgba[i], r.rgba[i + 1], r.rgba[i + 2]]; };
/** Green, the way every floor in the sample books is painted: green clearly above red and blue. */
const greenish = (c: Rgb) => c[1] > c[0] + 12 && c[1] > c[2] + 12;
/**
 * The floor's colour: the most common greenish colour in the lower middle of the drawing, where the bay floor is in
 * every view. Colours are binned to 8 levels per channel, then averaged within the winning bin.
 */
export function floorColour(r: Raster): Rgb | null {
  const bins = new Map<number, { n: number; s: [number, number, number] }>();
  for (let y = Math.floor(r.height * 0.55); y < Math.floor(r.height * 0.97); y += 2)
    for (let x = Math.floor(r.width * 0.2); x < Math.floor(r.width * 0.8); x += 2) {
      const c = at(r, x, y);
      if (!greenish(c)) continue;
      const k = (c[0] >> 5) * 64 + (c[1] >> 5) * 8 + (c[2] >> 5), bin = bins.get(k) ?? { n: 0, s: [0, 0, 0] };
      bin.n++; bin.s[0] += c[0]; bin.s[1] += c[1]; bin.s[2] += c[2]; bins.set(k, bin);
    }
  let best: { n: number; s: [number, number, number] } | null = null;
  for (const b of bins.values()) if (!best || b.n > best.n) best = b;
  return best && best.n > 50 ? [best.s[0] / best.n, best.s[1] / best.n, best.s[2] / best.n] : null;
}
export type PixelKind = 0 | 1 | 2 | 3; // other, floor, grid line, shadow
export const OTHER = 0, FLOOR = 1, GRID = 2, SHADOW = 3;
/**
 * Floor: close to the floor colour. Shadow: the floor colour darkened (same proportions, 45–92 % as bright). Grid line:
 * the floor colour mixed toward white (every channel moves the same fraction of the way to 255).
 */
export function pixelKind(c: Rgb, floor: Rgb): PixelKind {
  const d = Math.hypot(c[0] - floor[0], c[1] - floor[1], c[2] - floor[2]);
  if (d < 34) return FLOOR;
  const ts = [0, 1, 2].map(i => floor[i] > 235 ? null : (c[i] - floor[i]) / (255 - floor[i])).filter((t): t is number => t !== null);
  if (ts.length >= 2) {
    const mean = ts.reduce((s, t) => s + t, 0) / ts.length;
    if (mean > 0.1 && mean < 0.95 && ts.every(t => Math.abs(t - mean) < 0.22)) return GRID;
  }
  const sum = c[0] + c[1] + c[2], fsum = floor[0] + floor[1] + floor[2], k = sum / fsum;
  if (k > 0.45 && k < 0.92 && greenish(c)) {
    const mix = Math.hypot(c[0] - floor[0] * k, c[1] - floor[1] * k, c[2] - floor[2] * k);
    if (mix < 30) return SHADOW;
  }
  return OTHER;
}
/** Luminance minus its 9x9 neighbourhood mean: positive on thin bright lines such as the grid. */
export function ridge(r: Raster): Float32Array {
  const w = r.width, h = r.height, lum = new Float32Array(w * h), integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, v = (r.rgba[i] + r.rgba[i + 1] + r.rgba[i + 2]) / 3;
      lum[y * w + x] = v; row += v; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h), R = 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - R), x1 = Math.min(w - 1, x + R), y0 = Math.max(0, y - R), y1 = Math.min(h - 1, y + R);
    const sum = integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
    out[y * w + x] = lum[y * w + x] - sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
  }
  return out;
}
/**
 * Every pixel's kind. Grid: a thin line brighter than its surroundings by more than the floor's own texture (the
 * threshold adapts to each drawing), in the floor's colour or toward white. Floor and shadow as in `pixelKind`.
 */
export function kinds(r: Raster, floor: Rgb): Uint8Array {
  const w = r.width, h = r.height, out = new Uint8Array(w * h), d = ridge(r), sample: number[] = [];
  for (let y = Math.floor(h * 0.55); y < h; y += 2) for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x += 2) if (greenish(at(r, x, y))) sample.push(d[y * w + x]);
  sample.sort((p, q) => p - q);
  const threshold = Math.max(7, (sample[Math.floor(sample.length * 0.97)] ?? 0) * 0.5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(r, x, y), i = y * w + x, kind = pixelKind(c, floor);
    // Grid lines keep the floor's green tint; white or grey lines are walls, not grid.
    out[i] = d[i] > threshold && greenish(c) ? GRID : kind === GRID ? FLOOR : kind;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Grid lines

/**
 * Straight grid lines by a Hough transform over grid pixels, then each peak's supporting pixels are fitted to a segment.
 * Peaks are taken strongest first, removing their pixels, so one painted line gives one result.
 */
export function gridLines(width: number, height: number, mask: Uint8Array, maxLines = 160): Line[] {
  const points: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) points.push(i);
  if (points.length < 50) return [];
  const thetas = 360, diag = Math.ceil(Math.hypot(width, height)), rhos = 2 * diag + 1;
  const cos = new Float64Array(thetas), sin = new Float64Array(thetas);
  for (let t = 0; t < thetas; t++) { cos[t] = Math.cos(t * Math.PI / thetas); sin[t] = Math.sin(t * Math.PI / thetas); }
  const acc = new Int32Array(thetas * rhos), alive = new Uint8Array(points.length).fill(1);
  const vote = (k: number, d: 1 | -1) => {
    const x = points[k] % width, y = Math.floor(points[k] / width);
    for (let t = 0; t < thetas; t++) acc[t * rhos + Math.round(x * cos[t] + y * sin[t]) + diag] += d;
  };
  for (let k = 0; k < points.length; k++) vote(k, 1);
  const lines: Line[] = [], minVotes = Math.max(25, Math.min(width, height) * 0.08);
  for (let n = 0; n < maxLines; n++) {
    let best = -1, bestVotes = minVotes;
    for (let i = 0; i < acc.length; i++) if (acc[i] > bestVotes) { bestVotes = acc[i]; best = i; }
    if (best < 0) break;
    const t = Math.floor(best / rhos), rho = (best % rhos) - diag;
    const members: number[] = [];
    for (let k = 0; k < points.length; k++) {
      if (!alive[k]) continue;
      const x = points[k] % width, y = Math.floor(points[k] / width);
      if (Math.abs(x * cos[t] + y * sin[t] - rho) <= 1.5) members.push(k);
    }
    for (const k of members) { alive[k] = 0; vote(k, -1); }
    const fitted = fitSegment(members.map(k => ({ x: points[k] % width, y: Math.floor(points[k] / width) })));
    if (fitted && fitted.length >= minVotes) lines.push(fitted);
  }
  return lines;
}
/** Grid lines found on a half-size copy of the mask (any pixel of a 2x2 block), then scaled back: four times less work. */
export function halfSizeLines(width: number, height: number, mask: Uint8Array): Line[] {
  const w = Math.floor(width / 2), h = Math.floor(height / 2), small = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 2 * y * width + 2 * x;
    small[y * w + x] = mask[i] | mask[i + 1] | mask[i + width] | mask[i + width + 1];
  }
  return gridLines(w, h, small, 120).map(l => ({ ...l, c: l.c * 2, length: l.length * 2, x1: l.x1 * 2 + 0.5, y1: l.y1 * 2 + 0.5, x2: l.x2 * 2 + 0.5, y2: l.y2 * 2 + 0.5 }));
}
/** Total least squares line through points; the segment spans the projections of the points (gaps ignored). */
export function fitSegment(ps: readonly Vec2[]): Line | null {
  if (ps.length < 2) return null;
  let mx = 0, my = 0;
  for (const p of ps) { mx += p.x; my += p.y; }
  mx /= ps.length; my /= ps.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of ps) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy), dx = Math.cos(angle), dy = Math.sin(angle);
  let lo = Infinity, hi = -Infinity;
  for (const p of ps) { const s = (p.x - mx) * dx + (p.y - my) * dy; lo = Math.min(lo, s); hi = Math.max(hi, s); }
  const a = -dy, b = dx, c = -(a * mx + b * my);
  return { a, b, c, length: hi - lo, x1: mx + lo * dx, y1: my + lo * dy, x2: mx + hi * dx, y2: my + hi * dy };
}
/** Angle of a line from the image's x axis, 0–180 degrees. */
export const lineAngle = (l: Line) => ((Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180 / Math.PI) % 180 + 180) % 180;

// ---------------------------------------------------------------------------------------------------------------
// Vanishing points (unit 3-vectors, so a point at infinity is fine)

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: V3): V3 => { const n = Math.hypot(v[0], v[1], v[2]); return n ? [v[0] / n, v[1] / n, v[2] / n] : v; };
/**
 * Angle (degrees) between a segment's direction and the direction from its midpoint toward the vanishing point.
 * Works for points at infinity (third coordinate 0).
 */
export function vpError(l: Line, vp: V3, scale: number): number {
  const mx = (l.x1 + l.x2) / 2 / scale, my = (l.y1 + l.y2) / 2 / scale;
  const dx = vp[0] - mx * vp[2], dy = vp[1] - my * vp[2];
  if (Math.hypot(dx, dy) < 1e-12) return 90;
  const sx = l.x2 - l.x1, sy = l.y2 - l.y1;
  const cos = Math.abs(dx * sx + dy * sy) / (Math.hypot(dx, dy) * Math.hypot(sx, sy));
  return Math.acos(Math.min(1, cos)) * 180 / Math.PI;
}
/**
 * The vanishing point most of the lines agree with: deterministic RANSAC over pairs (longest lines first), refined as
 * the length-weighted least-squares point of the inliers. Coordinates are divided by `scale` to keep numbers small.
 */
export function vanishingPoint(lines: readonly Line[], scale: number, toleranceDegrees = 1.2): { vp: V3; inliers: Line[] } | null {
  if (lines.length < 2) return null;
  const sorted = [...lines].sort((p, q) => q.length - p.length).slice(0, 60);
  const homog = (l: Line): V3 => unit([l.a, l.b, l.c / scale]);
  let best: { vp: V3; inliers: Line[]; score: number } | null = null;
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const vp = unit(cross(homog(sorted[i]), homog(sorted[j])));
    if (!vp.every(Number.isFinite) || Math.hypot(...vp) < 0.5) continue;
    const inliers = lines.filter(l => vpError(l, vp, scale) < toleranceDegrees);
    const score = inliers.reduce((s, l) => s + l.length, 0);
    if (!best || score > best.score) best = { vp, inliers, score };
  }
  if (!best || best.inliers.length < 2) return null;
  // Refine: the smallest eigenvector of sum(w * l l^T) over inlier lines.
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const l of best.inliers) { const h = homog(l), w = l.length; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r * 3 + c] += w * h[r] * h[c]; }
  const vp = smallestEigenvector(m) ?? best.vp;
  return { vp, inliers: lines.filter(l => vpError(l, vp, scale) < toleranceDegrees) };
}
/** Smallest eigenvector of a symmetric 3x3 matrix by inverse power iteration on a shifted matrix. */
function smallestEigenvector(m: number[]): V3 | null {
  const trace = m[0] + m[4] + m[8];
  // Largest eigenvalue <= trace for a PSD matrix; iterate on (trace*I - m), whose largest eigenvector is m's smallest.
  const s = [trace - m[0], -m[1], -m[2], -m[3], trace - m[4], -m[5], -m[6], -m[7], trace - m[8]];
  let v: V3 = unit([1, 0.7, 0.3]);
  for (let k = 0; k < 200; k++) {
    const next = unit([s[0] * v[0] + s[1] * v[1] + s[2] * v[2], s[3] * v[0] + s[4] * v[1] + s[5] * v[2], s[6] * v[0] + s[7] * v[1] + s[8] * v[2]]);
    if (!next.every(Number.isFinite)) return null;
    v = next;
  }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------
// Grid spacing

/**
 * The spacing of a set of parallel grid lines from their offsets. Each gap between neighbouring lines is a candidate.
 * For each, near-duplicate lines (a thick line found twice) are merged, and the candidate is scored by how many lines
 * sit on its lattice minus half the lattice places inside the grid that have no line. Lines that aren't grid (wall
 * edges) sit off the lattice; a spacing half the true one leaves every other place empty. `coherence` is the share of
 * merged lines on the lattice.
 */
export function latticeSpacing(offsets: readonly number[]): { spacing: number; phase: number; coherence: number } | null {
  const sorted = [...offsets].sort((p, q) => p - q);
  if (sorted.length < 4) return null;
  const span = sorted[sorted.length - 1] - sorted[0];
  if (!(span > 0)) return null;
  const merge = (gap: number) => {
    const out: number[] = [];
    let group: number[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - group[group.length - 1] < gap) group.push(sorted[i]);
      else { out.push(group.reduce((s, v) => s + v, 0) / group.length); group = [sorted[i]]; }
    }
    out.push(group.reduce((s, v) => s + v, 0) / group.length);
    return out;
  };
  const candidates: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > span * 0.01 && !candidates.some(c => Math.abs(c - g) < 0.04 * c)) candidates.push(g);
  }
  let best: { spacing: number; phase: number; coherence: number; score: number } | null = null;
  for (const c of candidates) {
    const lines = merge(c * 0.3);
    if (lines.length < 3) continue;
    // Phase from the lines themselves, then which lines sit on the lattice.
    let re = 0, im = 0;
    for (const o of lines) { const a = 2 * Math.PI * o / c; re += Math.cos(a); im += Math.sin(a); }
    const phase = Math.atan2(im, re), base = phase / (2 * Math.PI) * c;
    const index = (o: number) => (o - base) / c;
    const on = lines.filter(o => Math.abs(index(o) - Math.round(index(o))) <= 0.12);
    if (on.length < 3) continue;
    const places = new Set(on.map(o => Math.round(index(o))));
    const first = Math.min(...places), last = Math.max(...places), holes = last - first + 1 - places.size;
    // Least-squares spacing and offset through the on-lattice lines.
    const n = on.length, ks = on.map(o => Math.round(index(o)));
    const mk = ks.reduce((s, k) => s + k, 0) / n, mo = on.reduce((s, o) => s + o, 0) / n;
    let num = 0, den = 0;
    on.forEach((o, i) => { num += (ks[i] - mk) * (o - mo); den += (ks[i] - mk) ** 2; });
    const spacing = den > 0 ? num / den : c;
    const score = on.length - 0.5 * holes;
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && spacing > best.spacing)) {
      const offset = mo - mk * spacing;
      best = { spacing, phase: 2 * Math.PI * offset / spacing, coherence: on.length / lines.length, score };
    }
  }
  return best ? { spacing: best.spacing, phase: best.phase, coherence: best.coherence } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Checking and refining against the drawn grid

/** Sampled pixel positions of a kind, at most `limit`, spread evenly over the picture. */
export function samplePixels(kindsOf: Uint8Array, width: number, kind: number, limit: number): Vec2[] {
  let n = 0;
  for (let i = 0; i < kindsOf.length; i++) if (kindsOf[i] === kind) n++;
  const step = Math.max(1, Math.floor(n / limit)), out: Vec2[] = [];
  let seen = 0;
  for (let i = 0; i < kindsOf.length; i++) if (kindsOf[i] === kind && seen++ % step === 0) out.push({ x: i % width, y: Math.floor(i / width) });
  return out;
}
const bump = (v: number) => { const d = Math.abs(v - Math.round(v)); return Math.exp(-((d / 0.07) ** 2)); };
/**
 * How well a straightening matches the drawn grid: grid pixels should land on whole-number lines and plain floor pixels
 * should not. About 0.6 or more is a clear match; near 0 is no match. A grid half the real size scores lower because
 * its extra lines fall on bare floor.
 */
export function gridFit(h: Mat3, grid: readonly Vec2[], floor: readonly Vec2[]): number {
  const mean = (ps: readonly Vec2[]) => {
    let s = 0, n = 0;
    for (const p of ps) { const q = apply(h, p); if (!q || Math.abs(q.x) > 500 || Math.abs(q.y) > 500) continue; s += Math.max(bump(q.x), bump(q.y)); n++; }
    return n ? s / n : 0;
  };
  return mean(grid) - mean(floor);
}
/** Nelder–Mead minimisation; small, deterministic, enough for 8 parameters. */
export function nelderMead(f: (x: number[]) => number, start: number[], steps: number[], iterations = 400): { x: number[]; value: number } {
  const n = start.length;
  let simplex = [start, ...start.map((_, i) => start.map((v, j) => j === i ? v + steps[i] : v))].map(x => ({ x, v: f(x) }));
  for (let it = 0; it < iterations; it++) {
    simplex.sort((a, b) => a.v - b.v);
    const best = simplex[0], worst = simplex[n], second = simplex[n - 1];
    if (Math.abs(worst.v - best.v) < 1e-7) break;
    const centroid = start.map((_, j) => simplex.slice(0, n).reduce((s, p) => s + p.x[j], 0) / n);
    const along = (t: number) => centroid.map((c, j) => c + t * (worst.x[j] - c));
    const r = along(-1), rv = f(r);
    if (rv < best.v) { const e = along(-2), ev = f(e); simplex[n] = ev < rv ? { x: e, v: ev } : { x: r, v: rv }; }
    else if (rv < second.v) simplex[n] = { x: r, v: rv };
    else {
      const c = along(rv < worst.v ? -0.5 : 0.5), cv = f(c);
      if (cv < Math.min(rv, worst.v)) simplex[n] = { x: c, v: cv };
      else simplex = simplex.map((p, i) => i === 0 ? p : (() => { const x = p.x.map((v, j) => best.x[j] + 0.5 * (v - best.x[j])); return { x, v: f(x) }; })());
    }
  }
  simplex.sort((a, b) => a.v - b.v);
  return { x: simplex[0].x, value: simplex[0].v };
}
/** A small change of the ground coordinates: scale/shear/shift and a little perspective. */
const tweak = (t: number[]): Mat3 => [1 + t[0], t[1], t[2], t[3], 1 + t[4], t[5], t[6] * 0.01, t[7] * 0.01, 1];
/**
 * Polishes a straightening so the drawn grid lands on whole numbers, trying the found cell size and half and double it
 * in each direction (the spacing estimate can pick a multiple). Returns the best and its fit.
 */
export function refineGround(start: Mat3, grid: readonly Vec2[], floor: readonly Vec2[]): { toGround: Mat3; fit: number } {
  const starts: { h: Mat3; fit: number }[] = [];
  for (const sx of [1, 2, 0.5]) for (const sy of [1, 2, 0.5]) {
    const h = multiply([sx, 0, 0, 0, sy, 0, 0, 0, 1], start);
    // A quick polish of the shift alone (where the lattice sits) before comparing sizes.
    const shift = nelderMead(t => -gridFit(multiply([1, 0, t[0], 0, 1, t[1], 0, 0, 1], h), grid, floor), [0, 0], [0.25, 0.25], 40);
    starts.push({ h: multiply([1, 0, shift.x[0], 0, 1, shift.x[1], 0, 0, 1], h), fit: -shift.value });
  }
  starts.sort((a, b) => b.fit - a.fit);
  let best = { toGround: starts[0].h, fit: starts[0].fit };
  for (const s of starts.slice(0, 3)) {
    const f = (t: number[]) => -gridFit(multiply(tweak(t), s.h), grid, floor);
    const result = nelderMead(f, [0, 0, 0, 0, 0, 0, 0, 0], [0.02, 0.02, 0.25, 0.02, 0.02, 0.25, 0.02, 0.02], 250);
    if (-result.value > best.fit) best = { toGround: multiply(tweak(result.x), s.h), fit: -result.value };
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// The whole straightening

/** Below this grid fit the straightening is not trusted. */
export const MIN_FIT = 0.4;
export type GroundResult = {
  /** Image pixels -> grid cells on the ground (x right, y toward the camera). */
  toGround: Mat3;
  /** Grid cells -> image pixels. */
  toImage: Mat3;
  /** How many grid lines agree with each vanishing point, and how well the spacing fits (0–1). */
  evidence: { depthLines: number; crossLines: number; depthCoherence: number; crossCoherence: number; fit: number };
  floor: Rgb;
  lines: Line[];
};
/**
 * Finds the ground homography of a 3D drawing, or explains why it can't. `width`/`height` are the raster's.
 * Returns null with a reason when the grid isn't clear enough; the user then straightens it by hand.
 */
export function straightenGround(r: Raster): { result: GroundResult | null; reason?: string } {
  const first = straightenWith(r, true);
  if (r.width <= 640 || (first.result && first.result.evidence.fit >= 0.5)) return first;
  // Half-size lines can miss a nearly parallel vanishing point; the full picture is slower but sharper.
  const second = straightenWith(r, false);
  if (!first.result) return second;
  return second.result && second.result.evidence.fit > first.result.evidence.fit ? second : first;
}
function straightenWith(r: Raster, half: boolean): { result: GroundResult | null; reason?: string } {
  const floor = floorColour(r);
  if (!floor) return { result: null, reason: 'No green floor was found in the lower half of the picture.' };
  const k = kinds(r, floor), mask = new Uint8Array(k.length);
  for (let i = 0; i < k.length; i++) mask[i] = k[i] === GRID ? 1 : 0;
  const lines = half && r.width > 640 ? halfSizeLines(r.width, r.height, mask) : gridLines(r.width, r.height, mask);
  if (lines.length < 6) return { result: null, reason: 'The floor grid is too faint to straighten the drawing automatically.' };
  const scale = Math.max(r.width, r.height);
  // Lines into the depth of the bay are steep in the picture; lines across it are shallow.
  const steep = lines.filter(l => { const a = lineAngle(l); return a > 20 && a < 160; });
  const shallow = lines.filter(l => { const a = lineAngle(l); return a <= 20 || a >= 160; });
  const depth = vanishingPoint(steep, scale), across = vanishingPoint(shallow, scale, 0.8);
  if (!depth || depth.inliers.length < 3) return { result: null, reason: 'The grid lines running away from the camera don\'t meet at one point.' };
  if (!across || across.inliers.length < 3) return { result: null, reason: 'Not enough grid lines run across the bay.' };
  // Horizon through both vanishing points (in scaled coordinates), then back to pixels.
  const horizon = cross(depth.vp, across.vp);
  const hz: V3 = [horizon[0] / scale, horizon[1] / scale, horizon[2]];
  if (Math.abs(hz[2]) < 1e-12) return { result: null, reason: 'The horizon passes through the picture; the view is too flat.' };
  const affine: Mat3 = [1, 0, 0, 0, 1, 0, hz[0] / hz[2], hz[1] / hz[2], 1];
  // Every floor point must stay on one side of the horizon.
  const corner = (x: number, y: number) => hz[0] * x + hz[1] * y + hz[2];
  const sign = Math.sign(corner(r.width / 2, r.height - 1));
  // After undoing perspective, directions and offsets of both families.
  const mapped = (l: Line) => { const p = apply(affine, { x: l.x1, y: l.y1 }), q = apply(affine, { x: l.x2, y: l.y2 }); return p && q ? { p, q, w: l.length } : null; };
  const family = (ls: Line[]) => ls.map(mapped).filter((m): m is NonNullable<ReturnType<typeof mapped>> => !!m
    && Math.sign(corner(m.p.x, m.p.y)) !== -sign);
  const depthLines = family(depth.inliers.filter(l => Math.sign(corner((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2)) === sign));
  const crossLines = family(across.inliers.filter(l => Math.sign(corner((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2)) === sign));
  if (depthLines.length < 3 || crossLines.length < 3) return { result: null, reason: 'Too few grid lines lie on the floor.' };
  const direction = (ms: typeof depthLines) => {
    let sx = 0, sy = 0;
    for (const m of ms) { let dx = m.q.x - m.p.x, dy = m.q.y - m.p.y; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      // Average axial directions via the doubled angle.
      const a = 2 * Math.atan2(dy, dx); sx += m.w * Math.cos(a); sy += m.w * Math.sin(a); }
    const a = Math.atan2(sy, sx) / 2; return { x: Math.cos(a), y: Math.sin(a) };
  };
  const dDepth = direction(depthLines), dCross = direction(crossLines);
  const nDepth = { x: -dDepth.y, y: dDepth.x }, nCross = { x: -dCross.y, y: dCross.x };
  const offsets = (ms: typeof depthLines, n: Vec2) => ms.map(m => ((m.p.x + m.q.x) / 2) * n.x + ((m.p.y + m.q.y) / 2) * n.y);
  const oDepth = offsets(depthLines, nDepth), oCross = offsets(crossLines, nCross);
  const sDepth = latticeSpacing(oDepth), sCross = latticeSpacing(oCross);
  if (!sDepth || !sCross) return { result: null, reason: 'The grid spacing could not be measured.' };
  // Cell coordinates: across the bay = offset along the depth lines' normal / spacing, and so on.
  // Orient: x increases to the right of the picture, y increases toward the bottom of the picture.
  let ax = { x: nDepth.x / sDepth.spacing, y: nDepth.y / sDepth.spacing }, ay = { x: nCross.x / sCross.spacing, y: nCross.y / sCross.spacing };
  const ref = apply(affine, { x: r.width / 2, y: r.height * 0.75 })!, right = apply(affine, { x: r.width / 2 + 10, y: r.height * 0.75 })!, down = apply(affine, { x: r.width / 2, y: r.height * 0.75 + 10 })!;
  if ((right.x - ref.x) * ax.x + (right.y - ref.y) * ax.y < 0) ax = { x: -ax.x, y: -ax.y };
  if ((down.x - ref.x) * ay.x + (down.y - ref.y) * ay.y < 0) ay = { x: -ay.x, y: -ay.y };
  // Origin at a grid crossing, so whole numbers are grid lines.
  const phaseX = sDepth.phase / (2 * Math.PI) * Math.sign(ax.x * nDepth.x + ax.y * nDepth.y), phaseY = sCross.phase / (2 * Math.PI) * Math.sign(ay.x * nCross.x + ay.y * nCross.y);
  const metric: Mat3 = [ax.x, ax.y, -phaseX, ay.x, ay.y, -phaseY, 0, 0, 1];
  const gridPixels = samplePixels(k, r.width, GRID, 2000), floorPixels = samplePixels(k, r.width, FLOOR, 2000);
  const refined = refineGround(multiply(metric, affine), gridPixels, floorPixels);
  const toGround = refined.toGround, toImage = invert(toGround);
  if (!toImage) return { result: null, reason: 'The straightening could not be inverted.' };
  const evidence = { depthLines: depthLines.length, crossLines: crossLines.length, depthCoherence: sDepth.coherence, crossCoherence: sCross.coherence, fit: refined.fit };
  if (refined.fit < MIN_FIT) return { result: null, reason: 'The straightened floor doesn\'t line up with the drawn grid.' };
  return { result: { toGround, toImage, floor, lines, evidence } };
}
