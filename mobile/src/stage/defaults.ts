import type { StageDocument, StageObject } from './model';

/** Provisional rectangular proxies, not competition specifications or target-face profiles. */
export function createObject(type: StageObject['type'], id: string, x: number, y: number): StageObject {
  const base = { id, position: { space: 'stage' as const, x, y, z: type === 'target' ? 48 : 0 }, rotation: 0 };
  switch (type) {
    case 'target': return { ...base, type, geometry: { width: 24, depth: 24, height: 30 } };
    case 'wall': return { ...base, type, geometry: { length: 96, thickness: 4, height: 72 } };
    case 'faultLine': return { ...base, type, geometry: { length: 96 } };
    case 'start': return { ...base, type, geometry: { width: 48, depth: 36, height: 0 } };
  }
}

/** Fresh workspace, 40 ft x 30 ft provisionally; not a USPSA standard. */
export function createDefaultStage(): StageDocument {
  return {
    schemaVersion: 3,
    coordinateSystem: 'inches',
    stage: { width: 480, depth: 360 },
    objects: [
      createObject('start', 'start-1', 60, 60),
      createObject('target', 'target-1', 360, 60),
      createObject('target', 'target-2', 384, 240),
      createObject('target', 'target-3', 216, 216),
      createObject('wall', 'wall-1', 120, 180),
      createObject('wall', 'wall-2', 288, 36),
      createObject('wall', 'wall-3', 336, 300),
    ],
  };
}
