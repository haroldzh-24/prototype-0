import type { StageDocument } from './model';

/** Fresh objects on every initialization/reset; never share mutable defaults. */
export function createDefaultStage(): StageDocument {
  return {
    schemaVersion: 1,
    coordinateSystem: 'legacy-layout',
    objects: [
      { id: 'start-1', type: 'start', position: { space: 'stage', x: 25, y: 50 } },
      { id: 'target-1', type: 'target', position: { space: 'stage', x: 250, y: 60 } },
      { id: 'target-2', type: 'target', position: { space: 'stage', x: 260, y: 250 } },
      { id: 'target-3', type: 'target', position: { space: 'stage', x: 150, y: 230 } },
      { id: 'wall-1', type: 'wall', position: { space: 'stage', x: 50, y: 200 } },
      { id: 'wall-2', type: 'wall', position: { space: 'stage', x: 180, y: 40 } },
      { id: 'wall-3', type: 'wall', position: { space: 'stage', x: 220, y: 320 } },
    ],
  };
}
