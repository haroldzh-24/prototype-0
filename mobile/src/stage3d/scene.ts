import type { StageDocument, StageObject } from '../stage/model';
import { objectSurfaces, wallSurfaces } from '../stage/projection';
import { isTarget } from '../stage/targetPlacement';
import type { Palette } from '../ui/tokens';
import { normalize, rayTriangle, toWorld, triangulate } from './math';
import type { Ray, Vec3 } from './math';

/**
 * Turns a stage document into flat vertex arrays for the 3D view, plus what the view needs around them: pick triangles
 * (which object a tap hit), label anchors and bounds. Pure: no GL, so it is unit-tested. Geometry comes from the same
 * surfaces as the old 2.5D preview (walls split around ports, target outlines and face cuts), so 2D and 3D agree.
 *
 * Each object's geometry is cached by the object itself (edits replace objects, never mutate them), so dragging one
 * object rebuilds only that object.
 */
export type ScenePoint = { x: number; y: number };
export type SceneOptions = {
  selectedId?: string | null;
  /** Object id → colour mixed into its faces (the eye view marks what can be engaged). */
  tints?: Readonly<Record<string, string>>;
  /** Planned route on the ground: the walking path, moving-engagement windows along it, and the stops. */
  route?: { path: readonly ScenePoint[]; windows?: readonly (readonly ScenePoint[])[]; stops?: readonly { id: string; label: string; point: ScenePoint }[] };
  grid?: boolean;
};
export type SceneLabel = { id: string; text: string; at: Vec3; kind: 'target' | 'noShoot' | 'start' | 'stop' };
export type PickTriangle = { objectId: string; a: Vec3; b: Vec3; c: Vec3 };
export type Scene = {
  triangles: { positions: Float32Array; normals: Float32Array; colors: Float32Array; count: number };
  lines: { positions: Float32Array; colors: Float32Array; count: number };
  pick: PickTriangle[];
  labels: SceneLabel[];
  bounds: { min: Vec3; max: Vec3; center: Vec3; radius: number };
};

type RGB = [number, number, number];
export function rgb(hex: string): RGB {
  const v = hex.replace('#', ''), n = v.length === 3 ? v.split('').map(c => c + c).join('') : v.slice(0, 6);
  return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255) as RGB;
}
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Short plan labels, as on a stage diagram: T1, NS1, S1, PP1. */
export function shortTargetLabel(stage: StageDocument, object: StageObject): string {
  const prefix = object.type === 'cardboardTarget' ? 'T' : object.type === 'noShootTarget' ? 'NS' : object.type === 'steelPlate' ? 'S' : 'PP';
  return prefix + (stage.objects.filter(o => o.type === object.type).findIndex(o => o.id === object.id) + 1);
}

const GRID_INCHES = 36, MAJOR_EVERY = 5;
const LIFT = { grid: 0.05, outline: 0.1, start: 0.2, fault: 0.3, path: 0.4, window: 0.5, stop: 0.6 };

/** Geometry for one part of the scene, in typed arrays so assembling the scene is plain copies. */
type Chunk = { tri: Float32Array; nor: Float32Array; col: Float32Array; lin: Float32Array; lcol: Float32Array; pick: PickTriangle[]; labels: SceneLabel[]; top: number };

/** Collects triangles and lines for one chunk. */
function builder() {
  const tri: number[] = [], nor: number[] = [], col: number[] = [], lin: number[] = [], lcol: number[] = [];
  const pick: PickTriangle[] = [], labels: SceneLabel[] = [];
  let top = 0;
  /** Fills a planar polygon. `lit` faces are shaded by the light; ground markings are not. */
  const polygon = (points: Vec3[], color: RGB, objectId: string | null, lit: boolean) => {
    if (points.length < 3) return;
    // Newell normal; triangles and quads are convex, longer outlines are ear-clipped in their plane.
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const n = lit ? normalize([x, y, z]) : [0, 0, 0];
    const emit = (i: number, j: number, k: number) => {
      for (const v of [points[i], points[j], points[k]]) { tri.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); col.push(color[0], color[1], color[2]); }
      if (objectId) pick.push({ objectId, a: points[i], b: points[j], c: points[k] });
    };
    if (points.length === 3) { emit(0, 1, 2); return; }
    if (points.length === 4) { emit(0, 1, 2); emit(0, 2, 3); return; }
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z), axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const flat = points.map(p => (axis === 0 ? [p[1], p[2]] : axis === 1 ? [p[0], p[2]] : [p[0], p[1]]) as [number, number]);
    for (const [i, j, k] of triangulate(flat)) emit(i, j, k);
  };
  const line = (a: Vec3, b: Vec3, color: RGB) => { lin.push(a[0], a[1], a[2], b[0], b[1], b[2]); lcol.push(color[0], color[1], color[2], color[0], color[1], color[2]); };
  const loop = (points: Vec3[], color: RGB) => points.forEach((p, i) => line(p, points[(i + 1) % points.length], color));
  const lifted = (points: { x: number; y: number }[], z: number) => points.map(p => toWorld({ x: p.x, y: p.y, z }));
  const done = (): Chunk => ({ tri: new Float32Array(tri), nor: new Float32Array(nor), col: new Float32Array(col), lin: new Float32Array(lin), lcol: new Float32Array(lcol), pick, labels, top });
  return { polygon, line, loop, lifted, labels, raise: (z: number) => { top = Math.max(top, z); }, done };
}

/** Ground, apron, grid and bay outline. */
function groundChunk(stage: StageDocument, palette: Palette, grid: boolean): Chunk {
  const b = builder(), W = stage.stage.width, D = stage.stage.depth, apron = Math.max(360, Math.max(W, D));
  // The apron gives the eye view a horizon.
  b.polygon(b.lifted([{ x: -apron, y: -apron }, { x: W + apron, y: -apron }, { x: W + apron, y: D + apron }, { x: -apron, y: D + apron }], -0.3),
    mix(rgb(palette.ground3d), rgb(palette.sky), 0.45), null, false);
  b.polygon(b.lifted([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }], 0), rgb(palette.ground3d), null, false);
  if (grid) {
    const minor = rgb(palette.gridMinor), major = rgb(palette.grid);
    for (let i = 1; i * GRID_INCHES < W; i++) b.line(toWorld({ x: i * GRID_INCHES, y: 0, z: LIFT.grid }), toWorld({ x: i * GRID_INCHES, y: D, z: LIFT.grid }), i % MAJOR_EVERY ? minor : major);
    for (let i = 1; i * GRID_INCHES < D; i++) b.line(toWorld({ x: 0, y: i * GRID_INCHES, z: LIFT.grid }), toWorld({ x: W, y: i * GRID_INCHES, z: LIFT.grid }), i % MAJOR_EVERY ? minor : major);
  }
  b.loop(b.lifted([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }], LIFT.outline), rgb(palette.ink));
  return b.done();
}

/** One object's faces, edges, pick triangles and label. */
function objectChunk(object: StageObject, palette: Palette, label: string, selected: boolean, tint: string | undefined): Chunk {
  const b = builder(), accent = rgb(palette.accent), ink = rgb(palette.ink), edge = rgb(palette.faceEdge);
  const tinted = (base: RGB): RGB => {
    let c = base;
    if (tint) c = mix(c, rgb(tint), 0.55);
    if (selected) c = mix(c, accent, 0.45);
    return c;
  };
  if (object.type === 'wall') {
    const color = tinted(rgb(palette.wall3d)), outline = selected ? accent : edge;
    for (const s of wallSurfaces(object)) b.polygon(s.points.map(toWorld), color, object.id, true);
    // Edges: the wall box and each port's opening, not the cells the surfaces are split into.
    const { length: L, thickness: T, height: H } = object.geometry, r = object.rotation * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    const at = (x: number, y: number, z: number) => toWorld({ x: object.position.x + x * cos - y * sin, y: object.position.y + x * sin + y * cos, z: object.position.z + z });
    const box = (x0: number, x1: number, z0: number, z1: number, c: RGB) => {
      for (const y of [-T / 2, T / 2]) b.loop([at(x0, y, z0), at(x1, y, z0), at(x1, y, z1), at(x0, y, z1)], c);
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) b.line(at(x, -T / 2, z), at(x, T / 2, z), c);
    };
    box(-L / 2, L / 2, 0, H, outline);
    for (const port of object.ports) box(port.offset - port.width / 2, port.offset + port.width / 2, port.sill, port.sill + port.height, rgb(palette.port));
    b.raise(object.position.z + H);
    return b.done();
  }
  if (object.type === 'start' || object.type === 'faultLine') {
    const start = object.type === 'start';
    for (const s of objectSurfaces(object)) {
      const points = s.points.map(p => toWorld({ ...p, z: start ? LIFT.start : LIFT.fault }));
      b.polygon(points, tinted(rgb(start ? palette.startFill : palette.faultLine)), object.id, false);
      b.loop(points, selected ? accent : ink);
    }
    if (start) b.labels.push({ id: object.id, text: 'START', at: toWorld({ x: object.position.x, y: object.position.y, z: 6 }), kind: 'start' });
    return b.done();
  }
  if (!isTarget(object)) return b.done();
  const base = object.type === 'cardboardTarget' ? palette.cardboard : object.type === 'noShootTarget'
    ? (object.targetFamily === 'PCSL' ? palette.noShootRed : palette.noShoot) : palette.steel;
  const color = tinted(rgb(base)), outline = selected ? accent : edge, r = object.rotation * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const along = (u: number, z: number) => toWorld({ x: object.position.x + u * cos, y: object.position.y + u * sin, z });
  for (const s of objectSurfaces(object)) {
    const points = s.points.map(toWorld);
    b.polygon(points, color, object.id, true);
    b.loop(points, outline);
    let bottom = Infinity, high = -Infinity;
    for (const p of s.points) { bottom = Math.min(bottom, p.z); high = Math.max(high, p.z); }
    b.raise(high);
    // Two stand posts down to the ground when the face is raised.
    if (bottom > 0.5) for (const u of [-0.3, 0.3]) b.line(along(u * object.geometry.faceWidth, 0), along(u * object.geometry.faceWidth, bottom), rgb(palette.subdued));
    if (object.type === 'noShootTarget') {
      // The X printed on a no-shoot, across the middle of the face.
      const w = object.geometry.faceWidth * 0.2, mid = (bottom + high) / 2, h = (high - bottom) * 0.2;
      b.line(along(-w, mid - h), along(w, mid + h), ink); b.line(along(w, mid - h), along(-w, mid + h), ink);
    }
    b.labels.push({ id: object.id, text: label, at: toWorld({ x: object.position.x, y: object.position.y, z: high + 8 }), kind: object.type === 'noShootTarget' ? 'noShoot' : 'target' });
  }
  return b.done();
}

/** Route on the ground: path, moving windows (wider, on top), stops. Not cached: it is small and changes with the plan. */
function routeChunk(route: NonNullable<SceneOptions['route']>, palette: Palette): Chunk {
  const b = builder(), accent = rgb(palette.accent);
  const ribbon = (path: readonly ScenePoint[], width: number, z: number, color: RGB) => {
    for (let i = 1; i < path.length; i++) {
      const p = path[i - 1], q = path[i], len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1e-6) continue;
      const nx = -(q.y - p.y) / len * width / 2, ny = (q.x - p.x) / len * width / 2;
      b.polygon(b.lifted([{ x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }, { x: q.x - nx, y: q.y - ny }, { x: p.x - nx, y: p.y - ny }], z), color, null, false);
    }
  };
  ribbon(route.path, 5, LIFT.path, accent);
  for (const w of route.windows ?? []) ribbon(w, 10, LIFT.window, rgb(palette.movement));
  for (const stop of route.stops ?? []) {
    const { x, y } = stop.point, s = 7;
    b.polygon(b.lifted([{ x: x - s, y: y - s }, { x: x + s, y: y - s }, { x: x + s, y: y + s }, { x: x - s, y: y + s }], LIFT.stop), accent, null, false);
    b.labels.push({ id: stop.id, text: stop.label, at: toWorld({ x, y, z: 10 }), kind: 'stop' });
  }
  return b.done();
}

const objectCache = new WeakMap<StageObject, Map<string, Chunk>>();
const groundCache = new Map<string, Chunk>();
const paletteIds = new WeakMap<Palette, number>();
const paletteId = (p: Palette) => { let id = paletteIds.get(p); if (id === undefined) { id = Math.random(); paletteIds.set(p, id); } return id; };

export function buildScene(stage: StageDocument, palette: Palette, options: SceneOptions = {}): Scene {
  const pid = paletteId(palette), grid = options.grid !== false;
  const groundKey = `${stage.stage.width}x${stage.stage.depth}|${pid}|${grid}`;
  let ground = groundCache.get(groundKey);
  if (!ground) { if (groundCache.size > 8) groundCache.clear(); ground = groundChunk(stage, palette, grid); groundCache.set(groundKey, ground); }
  const chunks: Chunk[] = [ground];
  for (const object of stage.objects) {
    const label = isTarget(object) ? shortTargetLabel(stage, object) : '', selected = options.selectedId === object.id, tint = options.tints?.[object.id];
    const key = `${pid}|${selected ? 1 : 0}|${tint ?? ''}|${label}`;
    let byKey = objectCache.get(object);
    if (!byKey) { byKey = new Map(); objectCache.set(object, byKey); }
    let chunk = byKey.get(key);
    if (!chunk) { if (byKey.size > 6) byKey.clear(); chunk = objectChunk(object, palette, label, selected, tint); byKey.set(key, chunk); }
    chunks.push(chunk);
  }
  if (options.route) chunks.push(routeChunk(options.route, palette));

  const total = (k: 'tri' | 'lin') => chunks.reduce((n, c) => n + c[k].length, 0);
  const triLength = total('tri'), linLength = total('lin');
  const positions = new Float32Array(triLength), normals = new Float32Array(triLength), colors = new Float32Array(triLength);
  const linePositions = new Float32Array(linLength), lineColors = new Float32Array(linLength);
  let t = 0, l = 0, top = 0;
  const pick: PickTriangle[] = [], labels: SceneLabel[] = [];
  for (const c of chunks) {
    positions.set(c.tri, t); normals.set(c.nor, t); colors.set(c.col, t); t += c.tri.length;
    linePositions.set(c.lin, l); lineColors.set(c.lcol, l); l += c.lin.length;
    for (const p of c.pick) pick.push(p);
    for (const label of c.labels) labels.push(label);
    top = Math.max(top, c.top);
  }
  const W = stage.stage.width, D = stage.stage.depth;
  const min: Vec3 = [0, -D, 0], max: Vec3 = [W, 0, Math.max(top, 1)];
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, 0];
  return {
    triangles: { positions, normals, colors, count: triLength / 3 },
    lines: { positions: linePositions, colors: lineColors, count: linLength / 3 },
    pick, labels, bounds: { min, max, center, radius: Math.hypot(W, D, max[2]) / 2 },
  };
}

/** The object whose surface a ray hits first, or null. */
export function pickObject(scene: Pick<Scene, 'pick'>, ray: Ray): { objectId: string; distance: number } | null {
  let best: { objectId: string; distance: number } | null = null;
  for (const t of scene.pick) {
    const d = rayTriangle(ray, t.a, t.b, t.c);
    if (d !== null && (!best || d < best.distance)) best = { objectId: t.objectId, distance: d };
  }
  return best;
}
