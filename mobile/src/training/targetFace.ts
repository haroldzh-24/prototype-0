/** Drawing and tapping a paper target face: shared by the drill logger and drill-library runs. */
import type { TargetPreset } from '../stage/targetPresets';

/** SVG data URI of the preset's outline (illustrative contour, not scoring zones). */
export function outlineUri(preset: Pick<TargetPreset, 'width' | 'height' | 'outline'>): string {
  const w = preset.width, h = preset.height, o = preset.outline;
  const shape = o.kind === 'polygon' ? `<polygon points="${o.points.map(([x, y]) => `${x * w},${y * h}`).join(' ')}"/>`
    : o.kind === 'ellipse' ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"/>` : `<rect width="${w}" height="${h}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><g fill="#b69964" stroke="#5c4a2b" stroke-width="${w * 0.01}">${shape}</g></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}
/** Tap position in the diagram (pixels) to face inches (+x right, +y up, origin at the face centre). */
export function tapToFace(lx: number, ly: number, width: number, height: number, faceWidth: number, faceHeight: number) {
  return { x: (lx / width - 0.5) * faceWidth, y: (0.5 - ly / height) * faceHeight };
}
