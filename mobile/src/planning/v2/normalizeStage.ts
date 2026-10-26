import type { StageDocument, StageObject } from '../../stage/model';
import { exposure, layered, stackOf } from '../../stage/targetLayers';
import { activeFaceExtent } from '../../stage/targetFace';
import { rotatedHalfExtents } from '../../stage/geometry';
import { stageDownrange } from '../../stage/orientation';
import { endpoints } from '../../stage/segments';
import { isEngageable } from '../model';
import type { FiringArea } from '../engagements';
import type { PlanRouteOptions, Point, Ruleset, StageSnapshot } from './types';

export type Wall = Extract<StageObject, { type: 'wall' }>;
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type TargetFace = {
  id: string; kind: 'paper' | 'steel' | 'no-shoot';
  /** Plan-view face line from the left edge to the right edge (as placed). */
  left: Point; right: Point; center: Point;
  /** Interior samples used for line of sight; edges are excluded so grazing contacts do not decide visibility. */
  sightSamples: Point[];
  /** Edges plus interior samples, used for the safe-angle check so the whole face is inside the safe arc. */
  angleSamples: Point[];
  /** Face bottom and top elevation, inches. */
  bottom: number; top: number;
  /**
   * Faces stacked on one target (hostage no-shoots, doubles) share a stack id. They do not block each other's sight
   * lines; how much of each is open is already in its extent (`exposure` in stage/targetLayers.ts).
   */
  stack?: string;
  /** Share of the face that is open scoring area after hard cover and stacked faces (1 when not layered). */
  openFraction?: number;
};
export type NormalizedStage = {
  size: { width: number; depth: number };
  start: Point;
  /** Safe direction actually used (route setting when given). */
  downrangeDegrees: number;
  /** The stage's own downrange, for reporting a mismatch. */
  stageDownrangeDegrees: number;
  ruleset: Ruleset;
  /** Minimum distance from a shooting position to an engaged steel face, inches (ruleset default or override). */
  steelMinInches: number;
  targets: TargetFace[];
  noShoots: TargetFace[];
  walls: Wall[];
  /** Plan-view bounding box of each wall footprint (same order as walls), for fast rejection in sight checks. */
  wallBounds: Bounds[];
  areas: FiringArea[];
  procedures: NonNullable<StageSnapshot['targetProcedures']>;
};

const finite = (...values: number[]) => values.every(Number.isFinite);
/**
 * Closest legal distance for firing at steel, inches, by ruleset (pistol). USPSA 10.5.16: under 23 ft is a DQ;
 * PCSL 1.8.1: 7 yd for pistol calibers; IDPA 2.14: steel closer than 10 yd is a DQ.
 */
export const STEEL_MIN_INCHES: Record<Ruleset, number> = { USPSA: 276, PCSL: 252, IDPA: 360 };
/** Wall footprints are rectangles centred on the wall position (the frame wallEffect tests against). */
function wallBounds(w: Wall): Bounds {
  const half = rotatedHalfExtents(w);
  return { minX: w.position.x - half.x, minY: w.position.y - half.y, maxX: w.position.x + half.x, maxY: w.position.y + half.y };
}
const SIGHT_FRACTIONS = [0.1, 0.3, 0.5, 0.7, 0.9];

/** Plan-view face of a target or no-shoot, or null for other objects. */
export function targetFace(object: StageObject, doc?: StageDocument): TargetFace | null {
  if (object.type !== 'cardboardTarget' && object.type !== 'noShootTarget' && object.type !== 'steelPlate' && object.type !== 'steelPopper') return null;
  // A painted or stacked scoring face is engaged on its open area only (no-shoots keep their whole face as blockers).
  const open = doc && object.type === 'cardboardTarget' && layered(doc, object) ? exposure(doc, object) : null;
  const stack = doc ? stackOf(doc, object) ?? undefined : undefined;
  const extent = open ? open.extent ?? { left: 0, right: 0, bottom: 0, top: 0 }
    : object.type === 'cardboardTarget' || object.type === 'noShootTarget'
    ? activeFaceExtent(object)
    : { left: -object.geometry.faceWidth / 2, right: object.geometry.faceWidth / 2, bottom: 0, top: object.geometry.faceHeight };
  const r = object.rotation * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r);
  const at = (x: number): Point => ({ x: object.position.x + ux * x, y: object.position.y + uy * x });
  const lerp = (t: number) => extent.left + (extent.right - extent.left) * t;
  // A face with no open area has nothing to aim at: no sight samples, so it is never visible.
  const sightSamples = open && !open.extent ? [] : SIGHT_FRACTIONS.map(t => at(lerp(t)));
  const left = at(extent.left), right = at(extent.right);
  return {
    id: object.id, kind: object.type === 'noShootTarget' ? 'no-shoot' : object.type === 'cardboardTarget' ? 'paper' : 'steel',
    left, right, center: at(lerp(0.5)), sightSamples, angleSamples: [left, ...sightSamples, right],
    bottom: object.position.z + extent.bottom, top: object.position.z + extent.top,
    ...(stack ? { stack } : {}), ...(open ? { openFraction: open.fraction } : {}),
  };
}

/** Validates the snapshot and extracts what the planner needs. Returns reasons instead of guessing. */
export function normalizeStage(snapshot: StageSnapshot, options: PlanRouteOptions): { stage?: NormalizedStage; errors: string[] } {
  const errors: string[] = [];
  const doc = snapshot.stage;
  if (!doc || doc.coordinateSystem !== 'inches' || !doc.stage || !finite(doc.stage.width, doc.stage.depth) || doc.stage.width <= 0 || doc.stage.depth <= 0)
    return { errors: ['The stage size is missing or invalid.'] };
  for (const o of doc.objects) {
    if (!o.position || !finite(o.position.x, o.position.y, o.position.z, o.rotation)) errors.push(`Object ${o.id} has a non-finite position or rotation.`);
  }
  const start = doc.objects.find(o => o.type === 'start');
  if (!start) errors.push('The stage has no start position.');
  const areas = (snapshot.firingAreas ?? []).filter(Boolean);
  if (!areas.length) errors.push('No firing areas are configured. Add at least one firing area so legal shooting positions exist.');
  for (const a of areas) {
    if (!a.id || !Array.isArray(a.vertices) || a.vertices.length < 3 || !a.vertices.every(p => p && finite(p.x, p.y)))
      errors.push(`Firing area ${a.id || '(unnamed)'} needs at least three finite vertices.`);
  }
  for (const w of doc.objects.filter((o): o is Wall => o.type === 'wall')) {
    const e = endpoints(w);
    if (!finite(e.start.x, e.start.y, e.end.x, e.end.y, w.geometry.thickness, w.geometry.height) || w.geometry.height <= 0) errors.push(`Wall ${w.id} has invalid geometry.`);
  }
  const spacing = options.candidateSpacingInches ?? 12, half = options.safeHalfAngleDegrees ?? 90;
  if (!(spacing >= 1 && spacing <= 120)) errors.push('Candidate spacing must be between 1 and 120 inches.');
  if (!(half > 0 && half <= 90)) errors.push('The safe half angle must be greater than 0 and at most 90 degrees.');
  if (options.downrangeDegrees !== undefined && !Number.isFinite(options.downrangeDegrees)) errors.push('The safe direction must be a finite angle.');
  if (options.steelMinDistanceInches !== undefined && !(options.steelMinDistanceInches >= 0 && Number.isFinite(options.steelMinDistanceInches))) errors.push('The steel minimum distance must be zero or more inches.');
  if (errors.length || !start) return { errors };
  const faces = doc.objects.map(o => targetFace(o, doc)).filter((f): f is TargetFace => !!f);
  const engageable = new Set(doc.objects.filter(isEngageable).map(o => o.id));
  return {
    errors,
    stage: {
      size: { width: doc.stage.width, depth: doc.stage.depth },
      start: { x: start.position.x, y: start.position.y },
      downrangeDegrees: options.downrangeDegrees !== undefined ? ((options.downrangeDegrees % 360) + 360) % 360 : stageDownrange(doc),
      stageDownrangeDegrees: stageDownrange(doc),
      ruleset: options.ruleset ?? snapshot.ruleset ?? 'USPSA',
      steelMinInches: options.steelMinDistanceInches ?? STEEL_MIN_INCHES[options.ruleset ?? snapshot.ruleset ?? 'USPSA'],
      targets: faces.filter(f => engageable.has(f.id)),
      noShoots: faces.filter(f => f.kind === 'no-shoot'),
      walls: doc.objects.filter((o): o is Wall => o.type === 'wall'),
      wallBounds: doc.objects.filter((o): o is Wall => o.type === 'wall').map(wallBounds),
      areas: areas.map(a => ({ id: a.id, vertices: a.vertices.map(p => ({ x: p.x, y: p.y })) })),
      procedures: snapshot.targetProcedures ?? {},
    },
  };
}
