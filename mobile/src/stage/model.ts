import type { StagePosition, StageSize } from './coordinates';
import type { TargetFamily } from './targetFamily';
import type { TargetOutline } from './targetShape';
export type SegmentEndpoints = Readonly<{ start: StagePosition; end: StagePosition }>;
type TargetMetadata = { targetFamily?: TargetFamily; presetId?: string; outline?: TargetOutline };
/**
 * Face coordinates (layers): inches, origin at the face centre, x to the shooter's right, y up, as the shooter sees the
 * face. Angles are degrees, positive clockwise as the shooter sees it.
 */
export type FacePoint = Readonly<{ x: number; y: number }>;
/**
 * A paper target or no-shoot placed on top of (or behind) another paper target: a hostage no-shoot or an overlapping
 * "double". Its position and facing follow the parent; `offset` is its face centre from the parent's face centre.
 */
export type TargetAttachment = Readonly<{ parentId: string; offset: FacePoint; roll: number; front: boolean }>;
/**
 * Hard cover painted on a face (black, non-scoring, stops bullets). `edge`: everything on one side of a line through
 * `at` at `angle` is painted (angle 0 paints below the line; the painted side is to the right of the line's direction).
 * `strip`: everything outside a band `width` wide through `at` is painted (angle 0 = an upright band).
 */
export type HardCover = Readonly<{ id: string; kind: 'edge' | 'strip'; at: FacePoint; angle: number; width?: number; preset?: string }>;
type PaperLayers = { attachment?: TargetAttachment; hardCover?: readonly HardCover[] };

/** Local rectangular ground footprint and vertical extent, all in inches. */
export type ObjectGeometry = Readonly<{ width: number; depth: number; height: number }>;
/** Rectangular through-opening; offset is its center along local X, sill is above wall bottom. Inches. */
export type FiringPort = Readonly<{ id: string; offset: number; width: number; height: number; sill: number }>;
export type WallGeometry = Readonly<{ length: number; thickness: number; height: number }>;
/** A ground marking, not an occluding wall or volume. */
export type FaultLineGeometry = Readonly<{ length: number }>;

/** Upright face dimensions in inches; no stand or ground-depth envelope. */
export type FacePreset = 'full' | 'upper' | 'lower' | 'left' | 'right';
export type FaceCut = Readonly<{ kind: 'preset'; preset: FacePreset }>;
export type TargetGeometry = Readonly<{ faceWidth: number; faceHeight: number }>;
export const objectLabel = (type: StageObject['type']): string => ({ cardboardTarget: 'Cardboard target', noShootTarget: 'No-shoot target', steelPlate: 'Steel plate', steelPopper: 'Steel popper', wall: 'Wall', faultLine: 'Fault line', start: 'Start Position' })[type];

type ObjectBase = {
  id: string;
  /** Center of ground footprint; for cut paper targets, the uncut face reference center. Z is the uncut bottom reference, not the vertical center. */
  position: StagePosition;
  /** Clockwise in the X-right/Y-down top-down view, normalized to [0, 360). */
  rotation: number;
};
export type StageObject =
  | (ObjectBase & TargetMetadata & PaperLayers & { type: 'cardboardTarget'; geometry: TargetGeometry; faceCut: FaceCut })
  | (ObjectBase & TargetMetadata & PaperLayers & { type: 'noShootTarget'; geometry: TargetGeometry; faceCut: FaceCut })
  | (ObjectBase & TargetMetadata & { type: 'steelPlate'; geometry: TargetGeometry })
  | (ObjectBase & TargetMetadata & { type: 'steelPopper'; geometry: TargetGeometry })
  | (ObjectBase & { type: 'wall'; geometry: WallGeometry; ports: readonly FiringPort[]; endpoints?: SegmentEndpoints })
  | (ObjectBase & { type: 'faultLine'; geometry: FaultLineGeometry; endpoints?: SegmentEndpoints })
  | (ObjectBase & { type: 'start'; geometry: ObjectGeometry });
export type StageDocument = {
  schemaVersion: 7;
  coordinateSystem: 'inches';
  stage: StageSize;
  /**
   * Heading of the backstop in stage-plane degrees (0 = +X/right, 90 = +Y/down the screen, 270 = up the screen).
   * Optional so documents saved before it existed still load; read it through `stageDownrange()`.
   */
  downrangeDegrees?: number;
  /** Drawing order, back to front. */
  objects: StageObject[];
};
