import type { StageDocument, StageObject } from '../stage/model';
import type { TargetFamily } from '../stage/targetFamily';
import { createObject } from '../stage/defaults';
import { targetPreset } from '../stage/targetPresets';
import { outsideStage } from '../stage/resize';

/** Image coordinates are normalized, X right/Y down. Geometry is never stored here. */
export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL in the upright source image
export type Crop = { x: number; y: number; width: number; height: number };
export type DocumentAsset = { path: string; name: string; mime: string; size: number };
export type PageImage = { asset: DocumentAsset; width: number; height: number; page: number; pageCount: number };
export type Alignment = { corners: Quad; rotation: 0 | 90 | 180 | 270; crop: Crop };
export type Calibration = { a: Point; b: Point; inches: number; evidence: 'grid' | 'labeled-dimension' | 'user'; approximate: boolean };
export type Proposal = {
  id: string; type: StageObject['type'] | 'port' | 'prop' | 'unknown'; position: Point; rotation: number;
  end?: Point; presetId?: string; accepted: boolean; approximate: boolean; notes: string;
  source: 'manual' | string; confidence?: number;
  /** Editable overlay size only; target physical dimensions still come from defaults/presets. */
  extent?: { width: number; height: number };
  /** Immutable detection evidence, independent of subsequent overlay edits and stage geometry. */
  recognition?: {
    shape: 'line' | 'rectangle' | 'circle' | 'symbol'; bounds: Crop;
    sourceImage: { path: string; page: number }; scaleStatus: 'uncalibrated' | 'calibrated-approximate' | 'calibrated';
    groupId?: string; templateId?: string;
  };
};
export type Reconstruction = {
  version: 1; id: string; source: DocumentAsset; sourceKind: 'pdf' | 'image' | 'paper-photo';
  page?: PageImage; rectified?: PageImage; aligned?: PageImage; alignment: Alignment;
  projection: 'unknown' | 'top-down' | 'perspective'; calibration?: Calibration;
  origin: Point; proposals: Proposal[];
};
export const fullQuad = (): Quad => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
export const fullCrop = (): Crop => ({ x: 0, y: 0, width: 1, height: 1 });
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const imagePoint = (p: Point) => !!p && finite(p.x) && finite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
export function validQuad(q: Quad) {
  if (!Array.isArray(q) || q.length !== 4 || !q.every(imagePoint)) return false;
  // Convex clockwise winding in Y-down coordinates; reject crossings/degenerate crops.
  return q.every((a, i) => {
    const b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > .00001;
  });
}
export function validCrop(c: Crop) {
  return !!c && [c.x, c.y, c.width, c.height].every(finite) && c.x >= 0 && c.y >= 0 && c.width > .001 && c.height > .001 && c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001;
}
export function validImageBounds(c: Crop) {
  return !!c && [c.x,c.y,c.width,c.height].every(finite) && c.x>=0 && c.y>=0 && c.width>0 && c.height>0 && c.x+c.width<=1.000001 && c.y+c.height<=1.000001;
}
export function assetValid(a: DocumentAsset) {
  return !!a && /^diagram-imports\/[a-z0-9-]+\.[a-z0-9]{1,8}$/i.test(a.path) && typeof a.name === 'string' && a.name.length <= 300 && typeof a.mime === 'string' && finite(a.size) && a.size >= 0 && a.size <= 50 * 1024 * 1024;
}
const types = ['cardboardTarget', 'noShootTarget', 'steelPlate', 'steelPopper', 'wall', 'faultLine', 'start', 'port', 'prop', 'unknown'];
export function validProposal(p: Proposal) {
  return !!p && typeof p.id === 'string' && /^[a-z0-9-]{1,100}$/i.test(p.id) && types.includes(p.type) && imagePoint(p.position) && finite(p.rotation)
    && (p.end === undefined || imagePoint(p.end)) && (p.presetId === undefined || typeof p.presetId === 'string')
    && typeof p.accepted === 'boolean' && typeof p.approximate === 'boolean' && typeof p.notes === 'string' && p.notes.length <= 2000 && typeof p.source === 'string'
    && (p.confidence === undefined || finite(p.confidence) && p.confidence >= 0 && p.confidence <= 1)
    && (p.extent === undefined || !!p.extent && [p.extent.width, p.extent.height].every(n => finite(n) && n > 0 && n <= 1))
    && (p.recognition === undefined || !!p.recognition && ['line','rectangle','circle','symbol'].includes(p.recognition.shape) && validImageBounds(p.recognition.bounds)
      && !!p.recognition.sourceImage && /^diagram-imports\/[a-z0-9-]+\.[a-z0-9]{1,8}$/i.test(p.recognition.sourceImage.path) && Number.isInteger(p.recognition.sourceImage.page) && p.recognition.sourceImage.page >= 1 && p.recognition.sourceImage.page <= 500
      && ['uncalibrated','calibrated-approximate','calibrated'].includes(p.recognition.scaleStatus)
      && (p.recognition.groupId === undefined || typeof p.recognition.groupId === 'string' && p.recognition.groupId.length <= 100)
      && (p.recognition.templateId === undefined || typeof p.recognition.templateId === 'string' && p.recognition.templateId.length <= 100));
}
export function validateReconstruction(d: Reconstruction): void {
  const pageValid = (p: PageImage | undefined) => p === undefined || assetValid(p.asset) && [p.width, p.height].every(n => finite(n) && n > 0 && n <= 4096) && Number.isInteger(p.page) && Number.isInteger(p.pageCount) && p.page >= 1 && p.page <= p.pageCount && p.pageCount <= 500;
  if (!d || d.version !== 1 || typeof d.id !== 'string' || !/^[a-z0-9-]{1,100}$/i.test(d.id) || !assetValid(d.source) || !['pdf', 'image', 'paper-photo'].includes(d.sourceKind)
    || !pageValid(d.page) || !pageValid(d.rectified) || !pageValid(d.aligned) || !d.alignment || !validQuad(d.alignment.corners) || !validCrop(d.alignment.crop) || ![0, 90, 180, 270].includes(d.alignment.rotation)
    || !['unknown', 'top-down', 'perspective'].includes(d.projection) || !d.origin || ![d.origin.x, d.origin.y].every(n => finite(n) && n >= 0)
    || !Array.isArray(d.proposals) || d.proposals.length > 1000 || !d.proposals.every(validProposal) || new Set(d.proposals.map(p => p.id)).size !== d.proposals.length)
    throw new Error('Invalid or unsupported reconstruction draft. The original has not been changed.');
  const c = d.calibration;
  if (c && (!imagePoint(c.a) || !imagePoint(c.b) || !finite(c.inches) || c.inches <= 0 || !['grid', 'labeled-dimension', 'user'].includes(c.evidence) || typeof c.approximate !== 'boolean' || Math.hypot(c.a.x - c.b.x, c.a.y - c.b.y) < .001)) throw new Error('Choose two distinct calibration points and a positive real distance.');
}
export function inchesPerPixel(d: Reconstruction): number {
  if (!d.aligned || !d.calibration) throw new Error('Align the diagram and confirm its scale first.');
  const c = d.calibration, pixels = Math.hypot((c.b.x - c.a.x) * d.aligned.width, (c.b.y - c.a.y) * d.aligned.height);
  if (pixels < 1) throw new Error('Calibration points must be at least one image pixel apart.');
  return c.inches / pixels;
}
/** Additive and idempotent. No existing object, dimensions, route or assignment is rewritten. */
export function reconstruct(d: Reconstruction, stage: StageDocument, family: TargetFamily): StageDocument {
  validateReconstruction(d);
  if (d.projection !== 'top-down') throw new Error('Only a confirmed top-down diagram can create stage geometry. Perspective/isometric views remain reference-only.');
  const scale = inchesPerPixel(d), image = d.aligned!;
  const position = (p: Point) => ({ space: 'stage' as const, x: d.origin.x + p.x * image.width * scale, y: d.origin.y + p.y * image.height * scale, z: 0 });
  const additions: StageObject[] = [];
  for (const p of d.proposals.filter(p => p.accepted)) {
    const id = `import-${d.id}-${p.id}`;
    if (stage.objects.some(o => o.id === id)) continue;
    if (p.type === 'unknown' || p.type === 'port' || p.type === 'prop') throw new Error('Classify unknown shapes before adding them. Openings and unsupported props need the existing wall/port inspector.');
    let object = createObject(p.type, id, position(p.position).x, position(p.position).y, family);
    object = { ...object, rotation: ((p.rotation % 360) + 360) % 360 };
    if (p.presetId) {
      const preset = targetPreset(p.presetId);
      if (!preset || preset.family !== family || preset.type !== p.type) throw new Error('Choose a target preset matching this type and match family.');
      if ('faceWidth' in object.geometry) object = { ...object, presetId: preset.id, targetFamily: preset.family, outline: JSON.parse(JSON.stringify(preset.outline)), geometry: { faceWidth: preset.width, faceHeight: preset.height } } as StageObject;
    }
    if (object.type === 'wall' || object.type === 'faultLine') {
      if (!p.end) throw new Error('Wall and fault-line proposals need two endpoints.');
      const start = position(p.position), end = position(p.end), length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length < .001) throw new Error('Segment endpoints must be distinct.');
      const common = { position: { ...start, x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, rotation: (Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI + 360) % 360, endpoints: { start, end } };
      object = object.type === 'wall' ? { ...object, ...common, geometry: { ...object.geometry, length } } : { ...object, ...common, geometry: { length } };
    }
    if (object.type === 'start' && [...stage.objects, ...additions].some(o => o.type === 'start')) throw new Error('This stage already has a start. Reject this proposal or explicitly remove the old start in the editor first.');
    if (outsideStage({ ...stage, objects: [object] }, stage.stage).length) throw new Error('Accepted geometry extends outside this stage. Adjust scale/origin or resize the stage explicitly in Stage Settings.');
    additions.push(object);
  }
  if (stage.objects.length + additions.length > 2000) throw new Error('This stage would exceed 2000 objects.');
  return additions.length ? { ...stage, objects: [...stage.objects, ...additions] } : stage;
}
