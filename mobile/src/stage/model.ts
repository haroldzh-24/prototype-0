import type { StagePosition } from './coordinates';

type ObjectBase = { id: string; position: StagePosition };

export type StageObject =
  | (ObjectBase & { type: 'target' })
  | (ObjectBase & { type: 'wall' })
  | (ObjectBase & { type: 'start' });

export type StageDocument = {
  schemaVersion: 1;
  coordinateSystem: 'legacy-layout';
  /** Drawing order, back to front. */
  objects: StageObject[];
};
