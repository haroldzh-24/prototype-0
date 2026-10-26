import type { TargetPreset } from './targetPresets';
import { projectPoint } from './projection';

/**
 * Pictures of targets, drawn from the same preset data the stage uses: the radial add menu's icons, dimensioned
 * front views for the target info card, and a small 3D view. Outlines only: scoring zones are not drawn until
 * their dimensions are verified (docs/target-preset-sources.md). Colours follow each rulebook's colour rules.
 */
export type TargetRole = 'scoring' | 'noShoot';
type Point = [number, number];

const INK = '#0A0A0A';
/** Colours by ruleset and role, with the rule that sets them (shown on the info card). */
export function targetColours(preset: Pick<TargetPreset, 'family' | 'type'>, role: TargetRole): { face: string; edge: string; note: string } {
  const steel = preset.type !== 'cardboardTarget';
  if (steel) {
    if (role === 'noShoot') return preset.family === 'PCSL'
      ? { face: '#D7262E', edge: INK, note: 'PCSL steel no-shoots are solid red (10.8.1).' }
      : { face: '#D7262E', edge: INK, note: 'Metal no-shoots use one colour unique to no-shoots.' };
    return preset.family === 'PCSL' ? { face: '#2F6FD6', edge: INK, note: 'PCSL handgun steel is blue (10.6).' }
      : preset.family === 'USPSA' ? { face: '#F7F7F5', edge: INK, note: 'USPSA steel is one colour, preferably white (4.1.3).' }
      : { face: '#F7F7F5', edge: INK, note: 'Shown white; colour is set by the match.' };
  }
  if (role === 'noShoot') return preset.family === 'PCSL' ? { face: '#D7262E', edge: INK, note: 'PCSL paper no-shoots are solid red with a black X (10.3.1).' }
    : preset.family === 'IDPA' ? { face: '#C9A266', edge: INK, note: 'IDPA non-threats carry a pair of open hands in a contrasting colour (4.8.1).' }
    : { face: '#F2F2EE', edge: INK, note: 'USPSA no-shoots use one colour unique to no-shoots, usually white (4.1.2).' };
  return { face: preset.family === 'PCSL' ? '#B98A55' : '#C9A266', edge: INK,
    note: preset.family === 'PCSL' ? 'PCSL handgun targets use the brown side (10.2.2).' : 'Cardboard scoring area is brown or tan.' };
}

/** The preset's outline in inches: x across the face (centred), y up from the bottom edge. */
export function outlinePoints(preset: Pick<TargetPreset, 'width' | 'height' | 'outline'>): Point[] {
  const w = preset.width, h = preset.height, o = preset.outline;
  const unit: readonly (readonly [number, number])[] = o.kind === 'polygon' ? o.points
    : o.kind === 'ellipse' ? Array.from({ length: 48 }, (_, i) => [0.5 + Math.cos(i * Math.PI / 24) / 2, 0.5 + Math.sin(i * Math.PI / 24) / 2] as const)
    : [[0, 0], [1, 0], [1, 1], [0, 1]];
  return unit.map(([x, y]) => [(x - 0.5) * w, (1 - y) * h]);
}

const n = (v: number) => Number(v.toFixed(2));
const inches = (v: number) => `${Number(v.toFixed(2))} in`;
const cm = (v: number) => `${(v * 2.54).toFixed(1)} cm`;

/** Markings that tell a no-shoot apart: PCSL's black X, IDPA's open hands. */
function markings(preset: Pick<TargetPreset, 'family' | 'type' | 'width' | 'height'>, role: TargetRole, toX: (x: number) => number, toY: (y: number) => number, scale: number): string {
  if (role !== 'noShoot') return '';
  const w = preset.width, h = preset.height, cx = 0, cy = h * 0.55;
  if (preset.family === 'PCSL') {
    const s = Math.min(w, h) * 0.28;
    return `<path d="M${n(toX(cx - s))} ${n(toY(cy + s))}L${n(toX(cx + s))} ${n(toY(cy - s))}M${n(toX(cx + s))} ${n(toY(cy + s))}L${n(toX(cx - s))} ${n(toY(cy - s))}" stroke="${INK}" stroke-width="${n(Math.max(2, w * 0.06 * scale))}" stroke-linecap="round"/>`;
  }
  if (preset.family === 'IDPA') {
    // A simple open hand: palm and four fingers, mirrored for the pair.
    const hand = (side: 1 | -1) => {
      const px = cx + side * w * 0.2, py = cy, r = w * 0.11;
      const fingers = [-1.5, -0.5, 0.5, 1.5].map(i => `<rect x="${n(toX(px + i * r * 0.55) - r * 0.22 * scale)}" y="${n(toY(py + r * 2.4))}" width="${n(r * 0.44 * scale)}" height="${n(r * 1.5 * scale)}" rx="${n(r * 0.22 * scale)}"/>`).join('');
      return `<g fill="#FFFFFF" stroke="${INK}" stroke-width="${n(Math.max(1, scale * 0.35))}"><rect x="${n(toX(px - r))}" y="${n(toY(py + r))}" width="${n(2 * r * scale)}" height="${n(2 * r * scale)}" rx="${n(r * 0.5 * scale)}"/>${fingers}</g>`;
    };
    return hand(-1) + hand(1);
  }
  return '';
}

/**
 * SVGs are ASCII only (non-ASCII text as XML character references), so a plain base64 data URI decodes them.
 *
 * Front view. `size` is the longer side in px. With `dimensions`, width and height are drawn as dimension lines in
 * inches and centimetres (the info card); without, it is an icon.
 */
export function targetArtSvg(preset: TargetPreset, role: TargetRole = 'scoring', options: { size?: number; dimensions?: boolean } = {}): string {
  const size = options.size ?? 96, dims = !!options.dimensions;
  const pad = dims ? size * 0.34 : size * 0.06;
  const scale = (size - 2 * (dims ? size * 0.12 : pad)) / Math.max(preset.width, preset.height);
  const faceW = preset.width * scale, faceH = preset.height * scale;
  const W = dims ? faceW + pad * 2.4 : size, H = dims ? faceH + pad * 2.1 : size;
  const ox = dims ? pad * 0.8 : (W - faceW) / 2, oy = dims ? pad * 0.6 : (H - faceH) / 2;
  const toX = (x: number) => ox + (x + preset.width / 2) * scale, toY = (y: number) => oy + (preset.height - y) * scale;
  const { face, edge } = targetColours(preset, role);
  const points = outlinePoints(preset).map(([x, y]) => `${n(toX(x))},${n(toY(y))}`).join(' ');
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}" width="${n(W)}" height="${n(H)}">`;
  svg += `<polygon points="${points}" fill="${face}" stroke="${edge}" stroke-width="${n(Math.max(1.5, size / 48))}" stroke-linejoin="round"/>`;
  svg += markings(preset, role, toX, toY, scale);
  if (dims) {
    const font = `font-family="Barlow Condensed, Arial, sans-serif" font-weight="700" font-size="${n(size / 16)}" fill="${INK}"`;
    const y0 = oy + faceH + pad * 0.45, x0 = ox + faceW + pad * 0.45, t = size / 60;
    // Width: extension lines, dimension line with ticks, label below.
    svg += `<g stroke="${INK}" stroke-width="${n(t)}"><path d="M${n(ox)} ${n(oy + faceH + t * 2)}V${n(y0 + t * 4)}M${n(ox + faceW)} ${n(oy + faceH + t * 2)}V${n(y0 + t * 4)}M${n(ox)} ${n(y0)}H${n(ox + faceW)}M${n(ox - t * 3)} ${n(y0 + t * 3)}L${n(ox + t * 3)} ${n(y0 - t * 3)}M${n(ox + faceW - t * 3)} ${n(y0 + t * 3)}L${n(ox + faceW + t * 3)} ${n(y0 - t * 3)}"/>`;
    svg += `<path d="M${n(ox + faceW + t * 2)} ${n(oy)}H${n(x0 + t * 4)}M${n(ox + faceW + t * 2)} ${n(oy + faceH)}H${n(x0 + t * 4)}M${n(x0)} ${n(oy)}V${n(oy + faceH)}M${n(x0 - t * 3)} ${n(oy + t * 3)}L${n(x0 + t * 3)} ${n(oy - t * 3)}M${n(x0 - t * 3)} ${n(oy + faceH + t * 3)}L${n(x0 + t * 3)} ${n(oy + faceH - t * 3)}"/></g>`;
    // Labels sit clear of the ticks: below the width line, beside the height line.
    svg += `<text x="${n(ox + faceW / 2)}" y="${n(y0 + size * 0.11)}" text-anchor="middle" ${font}>${inches(preset.width)} &#183; ${cm(preset.width)}</text>`;
    svg += `<text x="${n(x0 + size * 0.075)}" y="${n(oy + faceH / 2)}" text-anchor="middle" ${font} transform="rotate(90 ${n(x0 + size * 0.075)} ${n(oy + faceH / 2)})">${inches(preset.height)} &#183; ${cm(preset.height)}</text>`;
  }
  return svg + '</svg>';
}

/** Default bottom-edge height for the 3D picture: paper on stands, plates on a post, poppers on the ground. */
export const artElevation = (preset: Pick<TargetPreset, 'type'>) => preset.type === 'cardboardTarget' ? 36 : preset.type === 'steelPlate' ? 30 : 0;

/** A small 3D picture: the face upright at its real size and elevation, with a generic stand (not to a rule). */
export function targetIsoSvg(preset: TargetPreset, role: TargetRole = 'scoring', options: { size?: number } = {}): string {
  const size = options.size ?? 160, z0 = artElevation(preset), thick = preset.type === 'cardboardTarget' ? 0 : 0.375, yaw = 35;
  const outline = outlinePoints(preset);
  const at = (x: number, y: number, z: number) => projectPoint({ x, y, z }, yaw);
  const front = outline.map(([x, z]) => at(x, 0, z0 + z)), back = outline.map(([x, z]) => at(x, thick, z0 + z));
  const lines: [ReturnType<typeof at>, ReturnType<typeof at>][] = [];
  if (preset.type === 'cardboardTarget') for (const u of [-0.3, 0.3]) lines.push([at(u * preset.width, 0.5, 0), at(u * preset.width, 0.5, z0 + preset.height * 0.1)]);
  if (preset.type === 'steelPlate') lines.push([at(0, 1, 0), at(0, 1, z0 + preset.height * 0.3)]);
  // Popper base: a flat plate under the face (illustrative size).
  const base = preset.type === 'steelPopper' ? [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]].map(([x, y]) => at(x * preset.width, y * preset.width, 0)) : [];
  const all = [...front, ...back, ...lines.flat(), ...base, at(-preset.width, -preset.width, 0), at(preset.width, preset.width, 0)];
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x)), minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  const s = (size * 0.86) / Math.max(maxX - minX, maxY - minY), ox = (size - (maxX - minX) * s) / 2, oy = (size - (maxY - minY) * s) / 2;
  const xy = (p: { x: number; y: number }) => `${n(ox + (p.x - minX) * s)},${n(oy + (p.y - minY) * s)}`;
  const { face, edge } = targetColours(preset, role);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
  // Ground shadow.
  const g = [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]].map(([x, y]) => at(x * preset.width, y * preset.width, 0));
  svg += `<polygon points="${g.map(xy).join(' ')}" fill="#00000014"/>`;
  if (base.length) svg += `<polygon points="${base.map(xy).join(' ')}" fill="#8A929C" stroke="${edge}" stroke-width="1"/>`;
  for (const [a, b] of lines) svg += `<polyline points="${xy(a)} ${xy(b)}" stroke="#6B5A43" stroke-width="${n(Math.max(2, s * 1.2))}" stroke-linecap="round"/>`;
  if (thick) svg += `<polygon points="${back.map(xy).join(' ')}" fill="${edge}" opacity="0.55"/>`;
  svg += `<polygon points="${front.map(xy).join(' ')}" fill="${face}" stroke="${edge}" stroke-width="1.5" stroke-linejoin="round"/>`;
  return svg + '</svg>';
}
