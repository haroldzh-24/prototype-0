/**
 * Where a press landed inside the target diagram. Native press events carry locationX/Y; the web's is a DOM mouse or
 * pointer event, which has offsetX/Y instead (relative to the same element, since the image ignores touches).
 */
export function pressPoint(event: { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number }): { x: number; y: number } | null {
  const x = Number.isFinite(event.locationX) ? event.locationX! : event.offsetX, y = Number.isFinite(event.locationY) ? event.locationY! : event.offsetY;
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x!, y: y! } : null;
}
