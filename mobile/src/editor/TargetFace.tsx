import { Image } from 'expo-image';
import { colors } from '../ui/tokens';
import { activeFaceExtent } from '../stage/targetFace';
import type { TargetObject } from '../stage/targetPlacement';
import { targetScreenSize } from '../stage/targetPlacement';
import { coverPolygons, faceOutline, isPaper } from '../stage/targetLayers';
export default function TargetFace({ item, scale }: { item: TargetObject; scale: number }) {
  const { width, height } = targetScreenSize(item, scale), w = item.geometry.faceWidth, h = item.geometry.faceHeight;
  const f = item.type === 'cardboardTarget' || item.type === 'noShootTarget' ? activeFaceExtent(item) : { left: -w/2, right: w/2, bottom: 0, top: h };
  const outline = item.outline ?? { kind: 'rectangle' };
  const shape = outline.kind === 'polygon' ? '<polygon points="' + outline.points.map(([x,y]) => `${x*w},${y*h}`).join(' ') + '"/>' : outline.kind === 'ellipse' ? `<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}"/>` : `<rect width="${w}" height="${h}"/>`;
  const fill = item.type === 'noShootTarget' ? item.targetFamily === 'PCSL' ? colors.noShootRed : colors.noShoot : item.type === 'cardboardTarget' ? colors.cardboard : colors.steel;
  // The outline keeps a white no-shoot visible on the white day canvas and separates overlapping faces.
  const edge = `stroke="${colors.faceEdge}" stroke-width="${Math.max(w, h) * 0.03}" stroke-linejoin="round"`;
  // Painted hard cover: black over the painted part of the face (face coordinates are y-up from the centre).
  const outlinePoints = isPaper(item) && item.hardCover?.length ? faceOutline(item) : [];
  const paint = isPaper(item) ? (item.hardCover ?? []).flatMap(c => coverPolygons(c, outlinePoints))
    .map(poly => `<polygon points="${poly.map(p => `${(p.x + w / 2).toFixed(3)},${(h / 2 - p.y).toFixed(3)}`).join(' ')}" fill="${colors.hardCover}" stroke="none"/>`).join('') : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><clipPath id="cut"><rect x="${f.left+w/2}" y="${h-f.top}" width="${f.right-f.left}" height="${f.top-f.bottom}"/></clipPath></defs><g fill="${fill}" ${edge} clip-path="url(#cut)">${shape}${item.type === 'noShootTarget' ? `<path d="M ${w*.3} ${h*.3} L ${w*.7} ${h*.7} M ${w*.7} ${h*.3} L ${w*.3} ${h*.7}" stroke="#262626" stroke-width="${w*.05}" fill="none"/>` : ''}</g>${paint}</svg>`;
  return <Image pointerEvents="none" source={{ uri: 'data:image/svg+xml;base64,' + btoa(svg) }} style={{ width, height }} contentFit="fill" cachePolicy="none" />;
}
