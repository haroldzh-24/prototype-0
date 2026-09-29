import type { StageDocument, StageObject } from './model';
import type { TargetFamily } from './targetFamily';

/** Editable physical defaults, not certified competition specifications. */
export function createObject(type: StageObject['type'], id: string, x: number, y: number, targetFamily?: TargetFamily): StageObject {
  const base = { id, position: { space: 'stage' as const, x, y, z: (type === 'cardboardTarget' || type === 'noShootTarget' || type === 'steelPlate') ? 48 : 0 }, rotation: 0,
    ...(targetFamily && ['cardboardTarget', 'noShootTarget', 'steelPlate', 'steelPopper'].includes(type) ? { targetFamily } : {}) };
  switch (type) {
    case 'cardboardTarget': return { ...base, type, faceCut: { kind: 'preset', preset: 'full' }, geometry: { faceWidth: 18, faceHeight: 30 } };
    case 'noShootTarget': return { ...base, type, faceCut: { kind: 'preset', preset: 'full' }, geometry: { faceWidth: 18, faceHeight: 30 } };
    case 'steelPlate': return { ...base, type, geometry: { faceWidth: 12, faceHeight: 12 } };
    case 'steelPopper': return { ...base, type, geometry: { faceWidth: 12, faceHeight: 42 } };
    case 'wall': return { ...base, type, ports: [], geometry: { length: 96, thickness: 4, height: 72 } };
    case 'faultLine': return { ...base, type, geometry: { length: 96 } };
    case 'start': return { ...base, type, geometry: { width: 48, depth: 36, height: 0 } };
  }
}

/** Fresh workspace, 40 ft x 30 ft provisionally; not a USPSA standard. */
export function createDefaultStage(targetFamily?: TargetFamily): StageDocument {
  return {
    schemaVersion: 7,
    coordinateSystem: 'inches',
    stage: { width: 480, depth: 360 },
    objects: [
      createObject('start', 'start-1', 60, 60),
      createObject('cardboardTarget', 'target-1', 360, 60, targetFamily),
      createObject('cardboardTarget', 'target-2', 384, 240, targetFamily),
      createObject('cardboardTarget', 'target-3', 216, 216, targetFamily),
      createObject('wall', 'wall-1', 120, 180),
      createObject('wall', 'wall-2', 288, 36),
      createObject('wall', 'wall-3', 336, 300),
    ],
  };
}
