import { Image } from 'expo-image';
import { activeFaceExtent } from '../stage/targetFace';
import type { TargetObject } from '../stage/targetPlacement';
import { targetScreenSize } from '../stage/targetPlacement';
export default function TargetFace({ item, scale }: { item: TargetObject; scale: number }) {
  const { width, height } = targetScreenSize(item, scale), w = item.geometry.faceWidth, h = item.geometry.faceHeight;
  const f = item.type === 'cardboardTarget' || item.type === 'noShootTarget' ? activeFaceExtent(item) : { left: -w/2, right: w/2, bottom: 0, top: h };
  const outline = item.outline ?? { kind: 'rectangle' };
  const shape = outline.kind === 'polygon' ? '<polygon points="' + outline.points.map(([x,y]) => `${x*w},${y*h}`).join(' ') + '"/>' : outline.kind === 'ellipse' ? `<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}"/>` : `<rect width="${w}" height="${h}"/>`;
  const fill = item.type === 'noShootTarget' ? item.targetFamily === 'PCSL' ? '#e65959' : '#e5e7df' : item.type === 'cardboardTarget' ? '#b69964' : '#829b9b';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><clipPath id="cut"><rect x="${f.left+w/2}" y="${h-f.top}" width="${f.right-f.left}" height="${f.top-f.bottom}"/></clipPath></defs><g fill="${fill}" clip-path="url(#cut)">${shape}${item.type === 'noShootTarget' ? `<path d="M ${w*.3} ${h*.3} L ${w*.7} ${h*.7} M ${w*.7} ${h*.3} L ${w*.3} ${h*.7}" stroke="#262626" stroke-width="${w*.05}"/>` : ''}</g></svg>`;
  return <Image pointerEvents="none" source={{ uri: 'data:image/svg+xml;base64,' + btoa(svg) }} style={{ width, height }} contentFit="fill" cachePolicy="none" />;
}
