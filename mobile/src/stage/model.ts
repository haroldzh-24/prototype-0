import type { StagePosition, StageSize } from './coordinates';

/** Local rectangular ground footprint and vertical extent, all in inches. */
export type ObjectGeometry = Readonly<{ width: number; depth: number; height: number }>;
/** Rectangular through-opening; offset is its center along local X, sill is above wall bottom. Inches. */
export type FiringPort = Readonly<{ id: string; offset: number; width: number; height: number; sill: number }>;
export type WallGeometry = Readonly<{ length: number; thickness: number; height: number }>;
/** A ground marking, not an occluding wall or volume. */
export type FaultLineGeometry = Readonly<{ length: number }>;

/** Upright face dimensions in inches; no stand or ground-depth envelope. */
export type TargetGeometry = Readonly<{ faceWidth: number; faceHeight: number }>;
export const objectLabel = (type: StageObject['type']): string => ({ cardboardTarget: 'Cardboard target', noShootTarget: 'No-shoot target', steelPlate: 'Steel plate', steelPopper: 'Steel popper', wall: 'Wall', faultLine: 'Fault line', start: 'Start Position' })[type];

type ObjectBase = {
  id: string;
  /** Center of ground footprint; Z is the bottom elevation, not the vertical center. */
  position: StagePosition;
  /** Clockwise in the X-right/Y-down top-down view, normalized to [0, 360). */
  rotation: number;
};
export type StageObject =
  | (ObjectBase & { type: 'cardboardTarget'; geometry: TargetGeometry })
  | (ObjectBase & { type: 'noShootTarget'; geometry: TargetGeometry })
  | (ObjectBase & { type: 'steelPlate'; geometry: TargetGeometry })
  | (ObjectBase & { type: 'steelPopper'; geometry: TargetGeometry })
  | (ObjectBase & { type: 'wall'; geometry: WallGeometry; ports: readonly FiringPort[] })
  | (ObjectBase & { type: 'faultLine'; geometry: FaultLineGeometry })
  | (ObjectBase & { type: 'start'; geometry: ObjectGeometry });
export type StageDocument = {
  schemaVersion: 6;
  coordinateSystem: 'inches';
  stage: StageSize;
  /** Drawing order, back to front. */
  objects: StageObject[];
};
