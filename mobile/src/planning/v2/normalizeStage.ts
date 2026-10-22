import type { StageObject } from '../../stage/model';
import { activeFaceExtent } from '../../stage/targetFace';
import { stageDownrange } from '../../stage/orientation';
import { endpoints } from '../../stage/segments';
import { isEngageable } from '../model';
import type { FiringArea } from '../engagements';
import type { PlanRouteOptions, Point, Ruleset, StageSnapshot } from './types';

export type Wall = Extract<StageObject, { type: 'wall' }>;
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
};
export type NormalizedStage = {
  size: { width: number; depth: number };
  start: Point;
  downrangeDegrees: number;
  ruleset: Ruleset;
  targets: TargetFace[];
  noShoots: TargetFace[];
  walls: Wall[];
  areas: FiringArea[];
  procedures: NonNullable<StageSnapshot['targetProcedures']>;
};

const finite = (...values: number[]) => values.every(Number.isFinite);
const SIGHT_FRACTIONS = [0.1, 0.3, 0.5, 0.7, 0.9];

function face(object: StageObject): TargetFace | null {
  if (object.type !== 'cardboardTarget' && object.type !== 'noShootTarget' && object.type !== 'steelPlate' && object.type !== 'steelPopper') return null;
  const extent = object.type === 'cardboardTarget' || object.type === 'noShootTarget'
    ? activeFaceExtent(object)
    : { left: -object.geometry.faceWidth / 2, right: object.geometry.faceWidth / 2, bottom: 0, top: object.geometry.faceHeight };
  const r = object.rotation * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r);
  const at = (x: number): Point => ({ x: object.position.x + ux * x, y: object.position.y + uy * x });
  const lerp = (t: number) => extent.left + (extent.right - extent.left) * t;
  const sightSamples = SIGHT_FRACTIONS.map(t => at(lerp(t)));
  const left = at(extent.left), right = at(extent.right);
  return {
    id: object.id, kind: object.type === 'noShootTarget' ? 'no-shoot' : object.type === 'cardboardTarget' ? 'paper' : 'steel',
    left, right, center: at(lerp(0.5)), sightSamples, angleSamples: [left, ...sightSamples, right],
    bottom: object.position.z + extent.bottom, top: object.position.z + extent.top,
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
  if (errors.length || !start) return { errors };
  const faces = doc.objects.map(face).filter((f): f is TargetFace => !!f);
  const engageable = new Set(doc.objects.filter(isEngageable).map(o => o.id));
  return {
    errors,
    stage: {
      size: { width: doc.stage.width, depth: doc.stage.depth },
      start: { x: start.position.x, y: start.position.y },
      downrangeDegrees: stageDownrange(doc),
      ruleset: options.ruleset ?? snapshot.ruleset ?? 'USPSA',
      targets: faces.filter(f => engageable.has(f.id)),
      noShoots: faces.filter(f => f.kind === 'no-shoot'),
      walls: doc.objects.filter((o): o is Wall => o.type === 'wall'),
      areas: areas.map(a => ({ id: a.id, vertices: a.vertices.map(p => ({ x: p.x, y: p.y })) })),
      procedures: snapshot.targetProcedures ?? {},
    },
  };
}
