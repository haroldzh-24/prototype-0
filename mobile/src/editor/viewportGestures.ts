import { clampZoom } from '../stage/coordinates';
import type { ViewportState } from '../stage/coordinates';

type Point = { x: number; y: number };
export type TouchSample = { center: Point; distance: number; count: number };
export function sampleTouches(touches: readonly Point[]): TouchSample {
  const a = touches[0] ?? { x: 0, y: 0 }, b = touches[1] ?? a;
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.hypot(a.x - b.x, a.y - b.y), count: Math.min(2, touches.length) };
}
export function fitViewport(): ViewportState { return { zoom: 1, pan: { x: 0, y: 0 } }; }
/** Anchor-preserving zoom. Only layout units enter or leave this helper. */
export function zoomViewport(state: ViewportState, zoom: number, anchor: Point, size: { width: number; height: number }): ViewportState {
  const next = clampZoom(zoom), ratio = next / state.zoom;
  return { zoom: next, pan: {
    x: anchor.x - size.width / 2 - (anchor.x - size.width / 2 - state.pan.x) * ratio,
    y: anchor.y - size.height / 2 - (anchor.y - size.height / 2 - state.pan.y) * ratio,
  } };
}
export function advanceViewport(state: ViewportState, previous: TouchSample, next: TouchSample, size: { width: number; height: number }): ViewportState {
  // Rebase when fingers enter/leave: never jump from object drag to pinch or back.
  if (!next.count || next.count !== previous.count) return state;
  const zoomed = next.count === 2 && previous.distance > 0 && next.distance > 0
    ? zoomViewport(state, state.zoom * next.distance / previous.distance, previous.center, size) : state;
  return { zoom: zoomed.zoom, pan: {
    x: zoomed.pan.x + next.center.x - previous.center.x,
    y: zoomed.pan.y + next.center.y - previous.center.y,
  } };
}
