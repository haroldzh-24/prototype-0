import type { FacePoint, HardCover, StageDocument, StageObject, TargetAttachment } from './model';
import { activeFaceExtent } from './targetFace';
import { stageDownrange } from './orientation';
import { presetFacePoints } from './presetFace';

/**
 * Target layers: hard cover painted on a face, and paper targets or no-shoots placed on top of (or behind) another
 * paper target (hostages and overlapping "doubles"). Pure functions; face coordinates are described on `FacePoint`.
 *
 * A layered target is a normal stage object with an `attachment`, so round counts, labels, the planner, the 3D view
 * and the stage check all see it as a target. Its position and facing are derived from its parent by `syncLayers`.
 */
export type Paper = Extract<StageObject, { type: 'cardboardTarget' | 'noShootTarget' }>;
export const isPaper = (o: StageObject | undefined): o is Paper => !!o && (o.type === 'cardboardTarget' || o.type === 'noShootTarget');

/** Slide step and rotate step for layers. */
export const SLIDE_STEP = 1, ROLL_STEP = 5;
/** A layered face sits this far in front of (or behind) its parent, so the two never fight for the same pixels. */
export const LAYER_GAP = 0.5;

const rad = (deg: number) => deg * Math.PI / 180;
/** Rotate a face point clockwise (as the shooter sees it) by `deg` about the origin. */
export function rollPoint(p: FacePoint, deg: number): FacePoint {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return { x: p.x * c + p.y * s, y: -p.x * s + p.y * c };
}
/** A point on a child face, in its parent's face coordinates, and back. */
export const childToParent = (a: TargetAttachment, p: FacePoint): FacePoint => { const r = rollPoint(p, a.roll); return { x: a.offset.x + r.x, y: a.offset.y + r.y }; };
export const parentToChild = (a: TargetAttachment, p: FacePoint): FacePoint => rollPoint({ x: p.x - a.offset.x, y: p.y - a.offset.y }, -a.roll);

/** Landmarks on a USPSA/IPSC-style torso, as heights from the face centre (fractions of the saved outline). */
export function faceLandmarks(w: number, h: number) {
  return { neck: 0.3 * h, shoulders: 0.15 * h, centre: 0, headHalfWidth: 0.17 * w, top: h / 2, bottom: -h / 2, left: -w / 2, right: w / 2 };
}

// ---- Hard cover --------------------------------------------------------------------------------------------

export type HardCoverPreset = 'headOnly' | 'topOpen' | 'diagonalTopLeft' | 'diagonalTopRight' | 'centreStrip';
export const hardCoverPresets: readonly { preset: HardCoverPreset; label: string; detail: string }[] = [
  { preset: 'headOnly', label: 'HEAD ONLY', detail: 'Body painted; only the head is open.' },
  { preset: 'topOpen', label: 'TOP OPEN', detail: 'Lower half painted.' },
  { preset: 'diagonalTopLeft', label: 'OPEN TOP LEFT', detail: 'Painted below a diagonal from the right shoulder to the bottom-left corner.' },
  { preset: 'diagonalTopRight', label: 'OPEN TOP RIGHT', detail: 'Painted below a diagonal from the left shoulder to the bottom-right corner.' },
  { preset: 'centreStrip', label: 'CENTRE STRIP', detail: 'Both sides painted; a head-wide strip is open from top to bottom.' },
];
/** The five painted versions, as clean lines on the face's own landmarks (no vendor's split lines). */
export function hardCoverFromPreset(preset: HardCoverPreset, w: number, h: number, id: string): HardCover {
  const m = faceLandmarks(w, h), deg = (dx: number, dy: number) => Math.atan2(dy, dx) * 180 / Math.PI;
  switch (preset) {
    case 'headOnly': return { id, kind: 'edge', at: { x: 0, y: m.neck }, angle: 0, preset };
    case 'topOpen': return { id, kind: 'edge', at: { x: 0, y: 0 }, angle: 0, preset };
    // Direction from the bottom-left corner up to the right shoulder: the painted side (right of it) is lower right.
    case 'diagonalTopLeft': return { id, kind: 'edge', at: { x: m.left, y: m.bottom }, angle: -deg(w, m.shoulders - m.bottom), preset };
    // Direction from the left shoulder down to the bottom-right corner: the painted side is lower left.
    case 'diagonalTopRight': return { id, kind: 'edge', at: { x: m.left, y: m.shoulders }, angle: -deg(w, m.bottom - m.shoulders), preset };
    case 'centreStrip': return { id, kind: 'strip', at: { x: 0, y: 0 }, angle: 0, width: 2 * m.headHalfWidth, preset };
  }
}
/** Unit direction of a cover's line (angles are clockwise, so y is negated). */
const direction = (c: HardCover) => ({ x: Math.cos(rad(c.angle)), y: -Math.sin(rad(c.angle)) });
/** True when the face point is painted by this cover. */
export function painted(c: HardCover, p: FacePoint): boolean {
  const d = direction(c), vx = p.x - c.at.x, vy = p.y - c.at.y;
  if (c.kind === 'edge') return d.x * vy - d.y * vx < 0;
  // A strip's band runs at right angles to the line direction (upright at angle 0); painted beyond half its width.
  return Math.abs(vx * d.x + vy * d.y) > (c.width ?? 0) / 2;
}
/** Move a cover's line toward the open side (positive) or the painted side (negative); a strip moves to the right. */
export function slideCover(c: HardCover, by: number): HardCover {
  const d = direction(c);
  const n = c.kind === 'edge' ? { x: -d.y, y: d.x } : d;
  return { ...c, at: { x: c.at.x + n.x * by, y: c.at.y + n.y * by } };
}
/** Polygons of the painted area within an outline (outline points in face coordinates). */
export function coverPolygons(c: HardCover, outline: readonly FacePoint[]): FacePoint[][] {
  const d = direction(c);
  // Keep the part of `poly` where dot(normal, p - origin) <= 0.
  const clip = (poly: readonly FacePoint[], origin: FacePoint, normal: FacePoint) => {
    const out: FacePoint[] = [], side = (p: FacePoint) => (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
      if (sa <= 0) out.push(a);
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) { const t = sa / (sa - sb); out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }); }
    }
    return out;
  };
  if (c.kind === 'edge') { const up = { x: -d.y, y: d.x }; return [clip(outline, c.at, up)].filter(p => p.length >= 3); }
  const half = (c.width ?? 0) / 2;
  const right = { x: c.at.x + d.x * half, y: c.at.y + d.y * half }, left = { x: c.at.x - d.x * half, y: c.at.y - d.y * half };
  return [clip(outline, right, { x: -d.x, y: -d.y }), clip(outline, left, d)].filter(p => p.length >= 3);
}

// ---- Outlines and poses -------------------------------------------------------------------------------------

/** The face's material outline (preset contour, cut by the physical face cut) in face coordinates, before roll. */
export function faceOutline(o: Paper): FacePoint[] {
  const h = o.geometry.faceHeight;
  return presetFacePoints({ ...o, attachment: undefined }).map(([x, z]) => ({ x, y: z - h / 2 }));
}
export function insidePolygon(p: FacePoint, poly: readonly FacePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Which way face x (the shooter's right) runs along a face line drawn at `rotation`: +1 along the rotation direction,
 * -1 against it. Faces have no front of their own, so the shooter is taken to look downrange at them.
 */
export function shooterSign(stage: Pick<StageDocument, 'downrangeDegrees'>, rotation: number): 1 | -1 {
  const r = rad(rotation), d = rad(stageDownrange(stage));
  return Math.cos(r) * -Math.sin(d) + Math.sin(r) * Math.cos(d) >= -1e-9 ? 1 : -1;
}

const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const facePoint = (p: unknown) => !!p && fin((p as FacePoint).x) && fin((p as FacePoint).y);
/** Saved-data checks: a damaged layer or paint entry must not load (it would break drawing and planning). */
export const validAttachment = (a: unknown): a is TargetAttachment => {
  const v = a as TargetAttachment | undefined;
  return !!v && typeof v.parentId === 'string' && !!v.parentId.trim() && facePoint(v.offset) && fin(v.roll) && typeof v.front === 'boolean';
};
export const validHardCovers = (c: unknown): c is HardCover[] => Array.isArray(c) && c.length <= 8 && c.every((v: HardCover) =>
  !!v && typeof v.id === 'string' && (v.kind === 'edge' || v.kind === 'strip') && facePoint(v.at) && fin(v.angle) && (v.kind === 'edge' || (fin(v.width) && v.width! >= 0)));

/** Paint keeps its place on the face when the face is resized (a stretched edge keeps meeting the same landmarks). */
export function scaleCovers(covers: readonly HardCover[], sx: number, sy: number): HardCover[] {
  return covers.map(c => {
    const d = { x: Math.cos(rad(c.angle)) * sx, y: -Math.sin(rad(c.angle)) * sy };
    const angle = Math.abs(d.x) < 1e-12 && Math.abs(d.y) < 1e-12 ? c.angle : -Math.atan2(d.y, d.x) * 180 / Math.PI;
    return { ...c, at: { x: c.at.x * sx, y: c.at.y * sy }, angle: Math.abs(angle) < 1e-9 ? 0 : angle, ...(c.width !== undefined ? { width: c.width * Math.hypot(Math.cos(rad(c.angle)) * sx, Math.sin(rad(c.angle)) * sy) } : {}) };
  });
}

/** Where a layered face stands: along the parent's face line, a little in front of or behind it, at its offset height. */
export function attachedPose(stage: Pick<StageDocument, 'downrangeDegrees'>, parent: Paper, child: Paper, a: TargetAttachment) {
  const r = rad(parent.rotation), sign = shooterSign(stage, parent.rotation), u = { x: Math.cos(r) * sign, y: Math.sin(r) * sign };
  const down = rad(stageDownrange(stage)), toward = { x: -Math.cos(down), y: -Math.sin(down) };
  // The face normal that points back uprange, toward the shooter.
  let n = { x: -u.y, y: u.x }; if (n.x * toward.x + n.y * toward.y < 0) n = { x: -n.x, y: -n.y };
  const depth = a.front ? LAYER_GAP : -LAYER_GAP;
  const z = parent.position.z + parent.geometry.faceHeight / 2 + a.offset.y - child.geometry.faceHeight / 2;
  return { position: { ...parent.position, x: parent.position.x + u.x * a.offset.x + n.x * depth, y: parent.position.y + u.y * a.offset.x + n.y * depth, z },
    rotation: parent.rotation };
}

/** The objects layered on a target, in stage order. */
export const layersOf = (stage: StageDocument, parentId: string): Paper[] =>
  stage.objects.filter((o): o is Paper => isPaper(o) && o.attachment?.parentId === parentId);

/**
 * Keep every layered target on its parent: recompute its position and facing, and drop layers whose parent is gone
 * or is itself a layer (one level only). Returns the same document when nothing changes.
 */
export function syncLayers(stage: StageDocument): StageDocument {
  if (!stage.objects.some(o => isPaper(o) && o.attachment)) return stage;
  const byId = new Map(stage.objects.map(o => [o.id, o]));
  let changed = false;
  const objects: StageObject[] = [];
  for (const o of stage.objects) {
    if (!isPaper(o) || !o.attachment) { objects.push(o); continue; }
    // A damaged attachment leaves the face standing on its own rather than breaking the stage.
    if (!validAttachment(o.attachment)) { const { attachment: _drop, ...rest } = o; objects.push(rest as Paper); changed = true; continue; }
    const parent = byId.get(o.attachment.parentId);
    if (!isPaper(parent) || parent.attachment || parent.id === o.id) { changed = true; continue; }
    const pose = attachedPose(stage, parent, o, o.attachment);
    const same = Math.abs(pose.position.x - o.position.x) < 1e-9 && Math.abs(pose.position.y - o.position.y) < 1e-9
      && Math.abs(pose.position.z - o.position.z) < 1e-9 && pose.rotation === o.rotation;
    if (same) objects.push(o); else { changed = true; objects.push({ ...o, position: pose.position, rotation: pose.rotation }); }
  }
  return changed ? { ...stage, objects } : stage;
}

// ---- Exposure ------------------------------------------------------------------------------------------------

/** Below this share of open area a face counts as fully covered (planner and stage check agree). */
export const OPEN_MIN = 0.02;

export type FaceBox = { left: number; right: number; bottom: number; top: number };
export type Exposure = {
  /** Share of the face's material that is open scoring area (not painted, not behind another face in its stack). */
  fraction: number;
  /** Open area as the face stands (rolled), in face terms: across (shooter's right +) and up from the face bottom. */
  extent: FaceBox | null;
  /** Across positions (face terms, as it stands) of the columns that have open area: where to aim through. */
  columns: number[];
  /** The face's material as it stands (rolled): what it blocks. */
  material: FaceBox;
};

/** True when a target is part of a stack or painted, so its open area differs from its outline. */
export function layered(stage: StageDocument, o: StageObject): o is Paper {
  return isPaper(o) && (!!o.attachment || !!o.hardCover?.length || stage.objects.some(c => isPaper(c) && c.attachment?.parentId === o.id));
}

/** The stack a face belongs to (its parent's id, or its own when it carries layers); null when it is on its own. */
export function stackOf(stage: StageDocument, o: StageObject): string | null {
  if (!isPaper(o)) return null;
  if (o.attachment) return o.attachment.parentId;
  return stage.objects.some(c => isPaper(c) && c.attachment?.parentId === o.id) ? o.id : null;
}

/** A stack from back to front: layers behind (stage order), the target, layers in front (stage order). */
export function stackOrder(stage: StageDocument, rootId: string): Paper[] {
  const root = stage.objects.find(o => o.id === rootId), layers = layersOf(stage, rootId);
  return isPaper(root) ? [...layers.filter(c => !c.attachment!.front), root, ...layers.filter(c => c.attachment!.front)] : [];
}

/** A face's own point in its stack's parent face coordinates, and a parent point in a face's own coordinates. */
const toStack = (o: Paper, p: FacePoint) => o.attachment ? childToParent(o.attachment, p) : p;
const fromStack = (o: Paper, p: FacePoint) => o.attachment ? parentToChild(o.attachment, p) : p;

/**
 * How much of a paper face is open scoring area, sampled on a fine grid (about 60 samples across the larger side).
 * Covered: its own paint, and every face of its stack drawn in front of it.
 */
export function exposure(stage: StageDocument, o: Paper): Exposure {
  const w = o.geometry.faceWidth, h = o.geometry.faceHeight, step = Math.max(0.25, Math.max(w, h) / 60);
  const outline = faceOutline(o), covers = validHardCovers(o.hardCover) ? o.hardCover : [], roll = o.attachment && validAttachment(o.attachment) ? o.attachment.roll : 0;
  const stand = (p: FacePoint) => roll ? rollPoint(p, roll) : p;
  const rolled = outline.map(stand);
  const material = { left: Math.min(...rolled.map(p => p.x)), right: Math.max(...rolled.map(p => p.x)), bottom: Math.min(...rolled.map(p => p.y)) + h / 2, top: Math.max(...rolled.map(p => p.y)) + h / 2 };
  const root = stackOf(stage, o), order = root ? stackOrder(stage, root) : [o], at = order.findIndex(f => f.id === o.id);
  const front = order.slice(at + 1).filter(f => f.attachment === undefined || validAttachment(f.attachment)).map(f => ({ face: f, outline: faceOutline(f) }));
  let total = 0, open = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const columns = new Set<number>();
  for (let y = -h / 2 + step / 2; y < h / 2; y += step) for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
    const p = { x, y };
    if (!insidePolygon(p, outline)) continue;
    total++;
    if (covers.some(c => painted(c, p))) continue;
    if (front.length && (o.attachment === undefined || validAttachment(o.attachment))) {
      const q = toStack(o, p);
      if (front.some(f => insidePolygon(fromStack(f.face, q), f.outline))) continue;
    }
    open++;
    // A rolled layer's open area is measured as it stands, since that is what the shooter sees.
    const seen = stand(p);
    minX = Math.min(minX, seen.x - step / 2); maxX = Math.max(maxX, seen.x + step / 2);
    minY = Math.min(minY, seen.y - step / 2); maxY = Math.max(maxY, seen.y + step / 2);
    columns.add(Math.round(seen.x / step) * step);
  }
  const fraction = total ? open / total : 0;
  if (fraction < OPEN_MIN) return { fraction, extent: null, columns: [], material };
  return { fraction, extent: { left: minX, right: maxX, bottom: minY + h / 2, top: maxY + h / 2 }, columns: [...columns].sort((a, b) => a - b), material };
}

// ---- Editing -------------------------------------------------------------------------------------------------

/** Snap a slide: to whole steps, or to a landmark when within `tolerance`. */
export function snapTo(value: number, marks: readonly number[], step = SLIDE_STEP, tolerance = 0.75): number {
  let best = Math.round(value / step) * step, bestDistance = Infinity;
  for (const m of marks) { const d = Math.abs(m - value); if (d <= tolerance && d < bestDistance) { best = m; bestDistance = d; } }
  return Math.abs(best) < 1e-9 ? 0 : best;
}

/**
 * Slide a layered face by (dx, dy) inches. Snaps so its top edge meets the parent's neck, shoulders, centre or top,
 * its side edges meet the parent's head edges, centre line or sides, or its centre lines up with the parent's.
 */
export function slideLayer(parent: Paper, child: Paper, a: TargetAttachment, dx: number, dy: number): TargetAttachment {
  const m = faceLandmarks(parent.geometry.faceWidth, parent.geometry.faceHeight), hw = child.geometry.faceWidth / 2, hh = child.geometry.faceHeight / 2;
  const x = a.offset.x + dx, y = a.offset.y + dy;
  const xs = [0, ...[m.left, -m.headHalfWidth, 0, m.headHalfWidth, m.right].flatMap(edge => [edge - hw, edge + hw])];
  const ys = [0, ...[m.top, m.neck, m.shoulders, 0].map(line => line - hh), m.bottom + hh];
  return { ...a, offset: { x: dx ? snapTo(x, xs) : a.offset.x, y: dy ? snapTo(y, ys) : a.offset.y } };
}
/** Roll in 5 degree steps, kept within -180..180. */
export const rollLayer = (a: TargetAttachment, by: number): TargetAttachment => {
  let roll = Math.round((a.roll + by) / ROLL_STEP) * ROLL_STEP; roll = ((roll + 180) % 360 + 360) % 360 - 180;
  return { ...a, roll: roll === -180 ? 180 : roll };
};

/** Default placement for a new layer: a hostage no-shoot over the lower left, a second target to the right. */
export function defaultAttachment(parent: Paper, kind: 'noShoot' | 'target'): TargetAttachment {
  const w = parent.geometry.faceWidth, h = parent.geometry.faceHeight;
  return kind === 'noShoot'
    ? { parentId: parent.id, offset: { x: -0.55 * w, y: -0.15 * h }, roll: 0, front: true }
    : { parentId: parent.id, offset: { x: 0.6 * w, y: 0 }, roll: 0, front: false };
}

/**
 * Add a no-shoot or a second target as a layer on `parentId`, copying the parent's preset, size and outline.
 * Placed right after the parent in stage order when in front (drawn over it), right before it when behind.
 */
export function addLayer(stage: StageDocument, parentId: string, kind: 'noShoot' | 'target', id: string): { stage: StageDocument; error?: string } {
  const parent = stage.objects.find(o => o.id === parentId);
  if (!isPaper(parent)) return { stage, error: 'Layers go on paper targets.' };
  if (parent.attachment) return { stage, error: 'Add layers to the target underneath, not to another layer.' };
  if (stage.objects.some(o => o.id === id)) return { stage, error: 'That id is taken.' };
  if (layersOf(stage, parentId).length >= 4) return { stage, error: 'A target can carry at most 4 layered targets.' };
  const a = defaultAttachment(parent, kind);
  const { attachment: _a, hardCover: _h, ...base } = parent;
  const child = { ...base, id, type: kind === 'noShoot' ? 'noShootTarget' as const : 'cardboardTarget' as const, faceCut: { kind: 'preset' as const, preset: 'full' as const }, attachment: a } as Paper;
  return { stage: placeInOrder(syncLayers({ ...stage, objects: [...stage.objects, child] }), id) };
}

/** Change a layer's attachment (slide, roll, front/behind); keeps stage order matching front/behind. */
export function updateAttachment(stage: StageDocument, id: string, change: (a: TargetAttachment) => TargetAttachment): StageDocument {
  const child = stage.objects.find(o => o.id === id);
  if (!isPaper(child) || !child.attachment) return stage;
  const next = change(child.attachment);
  const updated = syncLayers({ ...stage, objects: stage.objects.map(o => o.id === id ? { ...child, attachment: next } : o) });
  return next.front !== child.attachment.front ? placeInOrder(updated, id) : updated;
}

/** Move a layer next to its parent in stage order: after it when in front, before it when behind. */
function placeInOrder(stage: StageDocument, id: string): StageDocument {
  const child = stage.objects.find(o => o.id === id);
  if (!isPaper(child) || !child.attachment) return stage;
  const rest = stage.objects.filter(o => o.id !== id), at = rest.findIndex(o => o.id === child.attachment!.parentId);
  if (at < 0) return stage;
  const index = child.attachment.front ? at + 1 : at;
  return { ...stage, objects: [...rest.slice(0, index), child, ...rest.slice(index)] };
}

export function setHardCover(stage: StageDocument, targetId: string, change: (covers: readonly HardCover[]) => readonly HardCover[]): StageDocument {
  return { ...stage, objects: stage.objects.map(o => {
    if (o.id !== targetId || !isPaper(o)) return o;
    const hardCover = change(o.hardCover ?? []);
    if (hardCover.length) return { ...o, hardCover };
    const { hardCover: _drop, ...rest } = o; return rest as Paper;
  }) };
}

/** Readable summary of a layer's place on its parent ("2 in up · 3 in left · 15°"). */
export function attachmentText(a: TargetAttachment): string {
  const f = (v: number) => `${Number(Math.abs(v).toFixed(1))} in`;
  const parts = [a.offset.y ? `${f(a.offset.y)} ${a.offset.y > 0 ? 'up' : 'down'}` : 'centred', a.offset.x ? `${f(a.offset.x)} ${a.offset.x > 0 ? 'right' : 'left'}` : 'centred'];
  return [...new Set(parts)].join(' · ') + (a.roll ? ` · ${a.roll}°` : '') + (a.front ? ' · in front' : ' · behind');
}

/** Slide a cover's line one step; level lines snap to the neck, shoulders or centre, an upright strip to the centre. */
export function slideCoverSnapped(c: HardCover, by: number, w: number, h: number): HardCover {
  const moved = slideCover(c, by), m = faceLandmarks(w, h);
  if (c.angle === 0 && c.kind === 'edge') return { ...moved, at: { x: moved.at.x, y: Math.max(m.bottom, Math.min(m.top, snapTo(moved.at.y, [m.neck, m.shoulders, 0]))) } };
  if (c.angle === 0 && c.kind === 'strip') return { ...moved, at: { x: Math.max(m.left, Math.min(m.right, snapTo(moved.at.x, [0]))), y: moved.at.y } };
  return moved;
}
/** Turn a cover's line in 5 degree steps (the preset name no longer applies once it is moved). */
export const rollCover = (c: HardCover, by: number): HardCover => {
  let angle = Math.round((c.angle + by) / ROLL_STEP) * ROLL_STEP; angle = ((angle + 180) % 360 + 360) % 360 - 180;
  return { ...c, angle: angle === -180 ? 180 : angle };
};
export const coverLabel = (c: HardCover) => hardCoverPresets.find(p => p.preset === c.preset)?.label ?? (c.kind === 'strip' ? 'STRIP' : 'EDGE');
