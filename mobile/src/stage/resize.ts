import type { StageSize } from './coordinates';
import type { StageDocument } from './model';
import { objectLabel } from './model';
import { footprintCenterOffset, rotatedHalfExtents } from './geometry';
import type { StageRoute } from '../planning/route';

export type OutsideItem = { id: string; kind: 'object' | 'position'; label: string };
export function outsideStage(document: StageDocument, size: StageSize, route?: StageRoute): OutsideItem[] {
  const outside = (x: number, y: number, halfX = 0, halfY = 0) =>
    x - halfX < -1e-8 || y - halfY < -1e-8 || x + halfX > size.width + 1e-8 || y + halfY > size.depth + 1e-8;
  const objects: OutsideItem[] = document.objects.filter(object => {
    const half = rotatedHalfExtents(object), offset = footprintCenterOffset(object);
    return outside(object.position.x + offset.x, object.position.y + offset.y, half.x, half.y);
  }).map(object => ({ id: object.id, kind: 'object', label: `${objectLabel(object.type)} / ${object.id}` }));
  return [...objects, ...(route?.positions ?? []).filter(p => outside(p.position.x, p.position.y))
    .map(p => ({ id: p.id, kind: 'position' as const, label: `Shooting position / ${p.label}` }))];
}

/** A boundary-only update. Unconfirmed reductions return the original document. */
export function resizeStage(document: StageDocument, size: StageSize, route?: StageRoute, keepOutside = false) {
  if (![size.width, size.depth].every(n => Number.isFinite(n) && n > 0))
    return { document, outside: [] as OutsideItem[], error: 'Enter a positive width and depth in yards.', needsConfirmation: false };
  const outside = outsideStage(document, size, route);
  const reducing = size.width < document.stage.width || size.depth < document.stage.depth;
  const needsConfirmation = reducing && outside.length > 0 && !keepOutside;
  return { document: needsConfirmation ? document : { ...document, stage: { ...size } }, outside, needsConfirmation };
}
