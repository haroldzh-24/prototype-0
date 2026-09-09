/** Inches; origin at the stage's upper-left. X right, Y depth/down, Z up. */
export type StagePosition = Readonly<{ space: 'stage'; x: number; y: number; z: number }>;
export type ViewportPosition = Readonly<{ space: 'viewport'; x: number; y: number }>;
export type StageSize = Readonly<{ width: number; depth: number }>;
export type ViewportState = Readonly<{ zoom: number; pan: { x: number; y: number } }>;
export type ViewportTransform = Readonly<{ scale: number; offsetX: number; offsetY: number }>;

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Fit and center the stage, then zoom about viewport center. Pan is in layout units. */
export function createViewportTransform(
  stage: StageSize,
  viewport: { width: number; height: number },
  state: ViewportState,
): ViewportTransform {
  if (![stage.width, stage.depth, viewport.width, viewport.height, state.zoom].every(
    (value) => Number.isFinite(value) && value > 0,
  ) || ![state.pan.x, state.pan.y].every(Number.isFinite)) {
    throw new Error('Stage/viewport dimensions and zoom must be positive; pan must be finite.');
  }
  const scale = Math.min(viewport.width / stage.width, viewport.height / stage.depth) * clampZoom(state.zoom);
  return {
    scale,
    offsetX: (viewport.width - stage.width * scale) / 2 + state.pan.x,
    offsetY: (viewport.height - stage.depth * scale) / 2 + state.pan.y,
  };
}

export function stageToViewport(position: StagePosition, transform: ViewportTransform): ViewportPosition {
  return { space: 'viewport', x: transform.offsetX + position.x * transform.scale,
    y: transform.offsetY + position.y * transform.scale };
}

/** A top-down projection cannot recover Z. Callers supply the object's elevation. */
export function viewportToStage(position: ViewportPosition, transform: ViewportTransform, z = 0): StagePosition {
  return { space: 'stage', x: (position.x - transform.offsetX) / transform.scale,
    y: (position.y - transform.offsetY) / transform.scale, z };
}

export function moveByViewportDelta(
  position: StagePosition, delta: { x: number; y: number }, transform: ViewportTransform,
): StagePosition {
  return { ...position, x: position.x + delta.x / transform.scale, y: position.y + delta.y / transform.scale };
}
