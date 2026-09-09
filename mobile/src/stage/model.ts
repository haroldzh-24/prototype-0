import type { StagePosition, StageSize } from './coordinates';

/** Local rectangular ground footprint and vertical extent, all in inches. */
export type ObjectGeometry = Readonly<{ width: number; depth: number; height: number }>;
type ObjectBase = {
  id: string;
  /** Center of ground footprint; Z is the bottom elevation, not the vertical center. */
  position: StagePosition;
  /** Clockwise in the X-right/Y-down top-down view, normalized to [0, 360). */
  rotation: number;
  geometry: ObjectGeometry;
};
export type StageObject =
  | (ObjectBase & { type: 'target' })
  | (ObjectBase & { type: 'wall' })
  | (ObjectBase & { type: 'start' });
export type StageDocument = {
  schemaVersion: 2;
  coordinateSystem: 'inches';
  stage: StageSize;
  /** Drawing order, back to front. */
  objects: StageObject[];
};
