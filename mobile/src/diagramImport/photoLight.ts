/**
 * Photos of a printed match book page: uneven daylight, a shadow across the page, a colour cast from the light,
 * glare, or a black-and-white print. READ 3D DRAWING's colour rules come from match book renders (PDF pages), so a
 * photo is evened out before it is read:
 *
 * - the floor is one green and the paper one white across the page, so where either looks darker the light there
 *   was dimmer; a coarse map of that light is filled in where neither shows, smoothed, and divided out;
 * - the paper's white sets the exposure and the colour balance (a warm lamp or shade makes white look tinted).
 *
 * A clean render (even light, white paper) comes back unchanged, so PDFs and screenshots read exactly as before.
 * Pure, tested on synthetic shaded photos (`tests/printoutPhoto.test.cjs`).
 */
import type { Raster } from './recognition';

/** The paper's white after evening: a little under 255 so nothing clips. */
export const PAPER_WHITE = 245;
/** Light that varies less than this across the page (brightest ÷ dimmest), with the paper already near white, is left alone. */
export const EVEN_ENOUGH = 1.15;

/** What the full page taught about the light, reused when evening a crop of it (which may show no paper). */
export type LightReference = { floor: number | null; floorChroma: [number, number] | null; balance: [number, number, number] };
export type LightResult = {
  raster: Raster;
  /** True when the picture was changed. */
  evened: boolean;
  /** Brightest light ÷ dimmest light over the page (1 = even). */
  spread: number;
  /** Share of the floor washed out to white (glare). */
  glare: number;
  reference: LightReference;
};

/** Green above red and blue by a share rather than a fixed amount, so it holds in shadow too. */
const greenByShare = (r: number, g: number, b: number) => g > 36 && g > r * 1.15 && g > b * 1.15;
const percentile = (values: number[], p: number) => { if (!values.length) return NaN; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

type CellStats = { floor: number | null; paper: number | null; paperRgb: [number, number, number] | null; blown: number; green: number };
/** Colour without brightness: red and green shares of the sum. Light that only dims leaves it alone. */
const chroma = (r: number, g: number, b: number): [number, number] => { const s = r + g + b || 1; return [r / s, g / s]; };
const CHROMA_TOLERANCE = 0.045;

/**
 * The floor's colour without its brightness: the most common chroma among green pixels. The floor is the largest
 * area of one green on a match book page; grass and berms are other greens, and are not used to measure the light.
 */
export function floorChroma(r: Raster): [number, number] | null {
  const bins = new Map<number, { n: number; r: number; g: number }>();
  for (let i = 0; i < r.rgba.length; i += 4 * 3) {
    const R = r.rgba[i], G = r.rgba[i + 1], B = r.rgba[i + 2];
    if (!greenByShare(R, G, B)) continue;
    const [cr, cg] = chroma(R, G, B), k = Math.round(cr / 0.02) * 100 + Math.round(cg / 0.02), bin = bins.get(k) ?? { n: 0, r: 0, g: 0 };
    bin.n++; bin.r += cr; bin.g += cg; bins.set(k, bin);
  }
  let best: { n: number; r: number; g: number } | null = null;
  for (const b of bins.values()) if (!best || b.n > best.n) best = b;
  return best && best.n > 50 ? [best.r / best.n, best.g / best.n] : null;
}

/** Per-cell estimates of the floor's and the paper's brightness, sampling every other pixel. */
function cellStats(r: Raster, size: number, cols: number, rows: number, floorAt: [number, number] | null): CellStats[] {
  const out: CellStats[] = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const greens: number[] = [], neutrals: number[] = [], rgb: [number, number, number] = [0, 0, 0];
    let n = 0, blown = 0;
    for (let y = cy * size; y < Math.min(r.height, (cy + 1) * size); y += 2) for (let x = cx * size; x < Math.min(r.width, (cx + 1) * size); x += 2) {
      const i = (y * r.width + x) * 4, R = r.rgba[i], G = r.rgba[i + 1], B = r.rgba[i + 2], lum = (R + G + B) / 3;
      n++;
      if (R >= 248 && G >= 248 && B >= 248) blown++;
      if (greenByShare(R, G, B)) { if (floorAt && lum > 25) { const [cr, cg] = chroma(R, G, B); if (Math.hypot(cr - floorAt[0], cg - floorAt[1]) < CHROMA_TOLERANCE) greens.push(lum); } }
      else { const hi = Math.max(R, G, B), lo = Math.min(R, G, B); if (hi > 40 && hi - lo < hi * 0.22 + 8) { neutrals.push(lum); rgb[0] += R; rgb[1] += G; rgb[2] += B; } }
    }
    const floor = greens.length >= n * 0.25 ? percentile(greens, 0.5) : null;
    // Paper: most of the cell neutral and even (white walls or sky inside a drawing are white too, which is fine).
    let paper: number | null = null, paperRgb: [number, number, number] | null = null;
    if (neutrals.length >= n * 0.7) {
      const p10 = percentile(neutrals, 0.1), p90 = percentile(neutrals, 0.9);
      if (p90 - p10 < p90 * 0.15 + 4) { paper = percentile(neutrals, 0.5); paperRgb = [rgb[0] / neutrals.length, rgb[1] / neutrals.length, rgb[2] / neutrals.length]; }
    }
    out.push({ floor, paper, paperRgb, blown: n ? blown / n : 0, green: n ? greens.length / n : 0 });
  }
  return out;
}

/**
 * Evens the light across a photographed page. `reference` (from evening the whole page) keeps a crop of it on the
 * same exposure and colour balance when the crop shows no paper.
 */
export function evenLight(r: Raster, reference?: LightReference, cellsAcross = 24): LightResult {
  const size = Math.max(8, Math.ceil(Math.max(r.width, r.height) / cellsAcross)), cols = Math.ceil(r.width / size), rows = Math.ceil(r.height / size);
  const floorAt = reference?.floorChroma ?? floorChroma(r);
  const cells = cellStats(r, size, cols, rows, floorAt);
  const floors = cells.flatMap(c => c.floor === null ? [] : [c.floor]), papers = cells.flatMap(c => c.paper === null ? [] : [c.paper]);
  // The lit floor and the lit paper: most of the page is in the light, and a shadow only darkens.
  const litPaper = papers.length >= 3 ? percentile(papers, 0.85) : null;
  // Paper darker than 45 % of the lit paper is grey ink, not white paper in shadow.
  const paperCells = cells.map(c => c.paper !== null && litPaper !== null && c.paper >= litPaper * 0.45 ? c.paper : null);
  const litRgb = (() => {
    const lit = cells.filter((c, i) => paperCells[i] !== null && c.paper! >= litPaper! * 0.9 && c.paperRgb);
    if (!lit.length) return null;
    const s = lit.reduce((a, c) => [a[0] + c.paperRgb![0], a[1] + c.paperRgb![1], a[2] + c.paperRgb![2]], [0, 0, 0]);
    return [s[0] / lit.length, s[1] / lit.length, s[2] / lit.length];
  })();
  const exposure = litPaper ? PAPER_WHITE / litPaper : 1;
  // Colour balance from the paper: each channel scaled so white comes out white (only a clear cast is corrected).
  let balance: [number, number, number] = reference?.balance ?? [1, 1, 1];
  if (!reference && litRgb) {
    const mean = (litRgb[0] + litRgb[1] + litRgb[2]) / 3, b: [number, number, number] = [mean / litRgb[0], mean / litRgb[1], mean / litRgb[2]];
    if (b.some(v => Math.abs(v - 1) > 0.05)) balance = b;
  }
  // The lit floor, after exposure: what every floor cell is evened to.
  const floorTarget = reference?.floor ?? (floors.length ? percentile(floors, 0.85) * exposure : null);
  const gains = cells.map((c, i) => {
    if (c.floor !== null && floorTarget !== null) return floorTarget / c.floor;
    if (paperCells[i] !== null) return PAPER_WHITE / paperCells[i]!;
    return NaN;
  });
  const known = gains.filter(Number.isFinite);
  const spread = known.length ? percentile(known, 0.9) / Math.max(1e-6, percentile(known, 0.1)) : 1;
  const glareCells = cells.filter(c => c.green >= 0.15);
  const glare = glareCells.length ? glareCells.reduce((s, c) => s + c.blown, 0) / glareCells.length : 0;
  const nextReference: LightReference = { floor: floorTarget, floorChroma: floorAt, balance };
  const balanced = balance.some(v => Math.abs(v - 1) > 1e-9);
  if (!known.length || (spread < EVEN_ENOUGH && Math.abs(percentile(known, 0.5) - 1) < 0.12 && !balanced))
    return { raster: r, evened: false, spread, glare, reference: nextReference };

  // Fill cells with neither floor nor paper from their neighbours, then smooth, in logs (light multiplies).
  let logs = gains.map(g => Number.isFinite(g) ? Math.log(g) : NaN);
  for (let pass = 0; pass < cols + rows && logs.some(v => !Number.isFinite(v)); pass++) {
    logs = logs.map((v, i) => {
      if (Number.isFinite(v)) return v;
      const cx = i % cols, cy = Math.floor(i / cols); let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const u = logs[y * cols + x]; if (Number.isFinite(u)) { s += u; n++; }
      }
      return n ? s / n : NaN;
    });
  }
  for (let pass = 0; pass < 2; pass++) logs = logs.map((_, i) => {
    const cx = i % cols, cy = Math.floor(i / cols); let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < cols && y < rows) { s += logs[y * cols + x]; n++; } }
    return s / n;
  });
  const gainAt = (x: number, y: number) => {
    // Bilinear between cell centres.
    const fx = Math.max(0, Math.min(cols - 1, (x + 0.5) / size - 0.5)), fy = Math.max(0, Math.min(rows - 1, (y + 0.5) / size - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const v = (1 - ty) * ((1 - tx) * logs[y0 * cols + x0] + tx * logs[y0 * cols + x1]) + ty * ((1 - tx) * logs[y1 * cols + x0] + tx * logs[y1 * cols + x1]);
    return Math.exp(v);
  };
  const out = new Uint8ClampedArray(r.rgba.length);
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const i = (y * r.width + x) * 4, g = gainAt(x, y);
    out[i] = r.rgba[i] * g * balance[0]; out[i + 1] = r.rgba[i + 1] * g * balance[1]; out[i + 2] = r.rgba[i + 2] * g * balance[2]; out[i + 3] = 255;
  }
  return { raster: { width: r.width, height: r.height, rgba: out }, evened: true, spread, glare, reference: nextReference };
}

/** A black-and-white print (or a grey photo of one): almost no pixel has any colour. */
export function looksGreyscale(r: Raster): boolean {
  let n = 0, coloured = 0;
  for (let i = 0; i < r.rgba.length; i += 4 * 3) {
    const R = r.rgba[i], G = r.rgba[i + 1], B = r.rgba[i + 2];
    n++; if (Math.max(R, G, B) - Math.min(R, G, B) > 30) coloured++;
  }
  return n > 0 && coloured / n < 0.015;
}

/** Tips when a photo couldn't be read, from what the photo shows. */
export function photoTips(light: Pick<LightResult, 'evened' | 'spread' | 'glare'>): string {
  // A clean render (a PDF or a screenshot) has white walls on the floor, not glare.
  if (!light.evened) return '';
  const tips = [
    light.glare > 0.004 ? 'part of the floor is washed out by glare: tilt the page or move out of the reflection' : '',
    light.evened && light.spread > 1.8 ? 'the light is very uneven: move the page fully into shade or fully into light' : '',
  ].filter(Boolean);
  return tips.length ? `From the photo: ${tips.join('; ')}.` : '';
}
