/** Legacy layout units, top-left origin, X right and Y down. No physical scale. */
export type StagePosition = Readonly<{ space: 'stage'; x: number; y: number }>;

/** Stage-local viewport offsets used by React Native left/top and gestures. */
export type ViewportPosition = Readonly<{ space: 'viewport'; x: number; y: number }>;

export function stageToViewport(position: StagePosition): ViewportPosition {
  return { space: 'viewport', x: position.x, y: position.y };
}

export function viewportToStage(position: ViewportPosition): StagePosition {
  return { space: 'stage', x: position.x, y: position.y };
}
