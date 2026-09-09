import type { StagePosition, StageSize } from './coordinates';

/** Local rectangular ground footprint and vertical extent, all in inches. */
export type ObjectGeometry = Readonly<{ width: number; depth: number; height: number }>;
export type WallGeometry = Readonly<{ length: number; thickness: number; height: number }>;
/** A ground marking, not an occluding wall or volume. */
export type FaultLineGeometry = Readonly<{ length: number }>;

type ObjectBase = {
  id: string;
  /** Center of ground footprint; Z is the bottom elevation, not the vertical center. */
  position: StagePosition;
  /** Clockwise in the X-right/Y-down top-down view, normalized to [0, 360). */
  rotation: number;
};
export type StageObject =
  | (ObjectBase & { type: 'target'; geometry: ObjectGeometry })
  | (ObjectBase & { type: 'wall'; geometry: WallGeometry })
  | (ObjectBase & { type: 'faultLine'; geometry: FaultLineGeometry })
  | (ObjectBase & { type: 'start'; geometry: ObjectGeometry });
export type StageDocument = {
  schemaVersion: 3;
  coordinateSystem: 'inches';
  stage: StageSize;
  /** Drawing order, back to front. */
  objects: StageObject[];
};
