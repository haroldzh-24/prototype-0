/**
 * Small vector and matrix helpers for the 3D stage view. Matrices are column-major Float32Array(16), the layout WebGL
 * expects. World space is right-handed with Z up: world = (stage x, -stage y, stage z), so the plan seen from above
 * matches the 2D editor (stage Y runs down the screen). Units are inches throughout.
 */
export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;
export type Ray = { origin: Vec3; dir: Vec3 };

export const toWorld = (p: { x: number; y: number; z?: number }): Vec3 => [p.x, -p.y, p.z ?? 0];
export const toStage = (w: Vec3) => ({ x: w[0], y: -w[1], z: w[2] });

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => { const l = length(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; };

export function perspective(fovYDegrees: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovYDegrees * Math.PI / 360), nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
  return m;
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, target));
  let x = normalize(cross(up, z));
  if (length(x) < 1e-9) x = normalize(cross([0, 1, 0], z)); // looking straight along `up`
  const y = cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[12] = -dot(x, eye);
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[13] = -dot(y, eye);
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[14] = -dot(z, eye);
  m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    m[c * 4 + r] = s;
  }
  return m;
}

export function invert(m: Mat4): Mat4 | null {
  const inv = new Float32Array(16);
  inv[0] = m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
  inv[3] = -m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-20) return null;
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}

/** Applies a 4x4 matrix to a point (w = 1) and divides by w. */
export function transformPoint(m: Mat4, p: Vec3): { x: number; y: number; z: number; w: number } {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return { x: x / w, y: y / w, z: z / w, w };
}

/** Screen position (pixels, origin top-left) of a world point, or null when it is behind the camera. */
export function projectToScreen(viewProj: Mat4, p: Vec3, width: number, height: number): { x: number; y: number; depth: number } | null {
  const c = transformPoint(viewProj, p);
  if (c.w <= 1e-6) return null;
  return { x: (c.x + 1) / 2 * width, y: (1 - c.y) / 2 * height, depth: c.z };
}

/** The ray from the camera through a screen pixel. */
export function screenRay(inverseViewProj: Mat4, x: number, y: number, width: number, height: number): Ray {
  const nx = x / width * 2 - 1, ny = 1 - y / height * 2;
  const near = transformPoint(inverseViewProj, [nx, ny, -1]), far = transformPoint(inverseViewProj, [nx, ny, 1]);
  const origin: Vec3 = [near.x, near.y, near.z];
  return { origin, dir: normalize(sub([far.x, far.y, far.z], origin)) };
}

/** Where a ray meets the horizontal plane z = height, or null when it runs parallel or away from it. */
export function rayPlaneZ(ray: Ray, height = 0): Vec3 | null {
  if (Math.abs(ray.dir[2]) < 1e-9) return null;
  const t = (height - ray.origin[2]) / ray.dir[2];
  return t > 0 ? add(ray.origin, scale(ray.dir, t)) : null;
}

/** Möller–Trumbore: distance along the ray to the triangle, or null. Both sides count. */
export function rayTriangle(ray: Ray, a: Vec3, b: Vec3, c: Vec3): number | null {
  const e1 = sub(b, a), e2 = sub(c, a), p = cross(ray.dir, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det, s = sub(ray.origin, a), u = dot(s, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1), v = dot(ray.dir, q) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, q) * inv;
  return t > 1e-6 ? t : null;
}

/**
 * Ear-clipping triangulation of a simple polygon given in 2D (either winding). Returns index triples.
 * Target outlines (poppers, IDPA heads) are not convex, so a fan would cover the gaps.
 */
export function triangulate(points: readonly (readonly [number, number])[]): [number, number, number][] {
  const n = points.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const ccw = area > 0, idx = Array.from({ length: n }, (_, i) => i), out: [number, number, number][] = [];
  const cross2 = (o: readonly [number, number], a: readonly [number, number], b: readonly [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inside = (p: readonly [number, number], a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]) => {
    const d1 = cross2(a, b, p), d2 = cross2(b, c, p), d3 = cross2(c, a, p);
    return ccw ? d1 >= -1e-12 && d2 >= -1e-12 && d3 >= -1e-12 : d1 <= 1e-12 && d2 <= 1e-12 && d3 <= 1e-12;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = points[ia], b = points[ib], c = points[ic], turn = cross2(a, b, c);
      if (Math.abs(turn) <= 1e-12) { idx.splice(i, 1); clipped = true; break; } // collinear: drop the vertex
      if (ccw ? turn < 0 : turn > 0) continue; // reflex
      if (idx.some(j => j !== ia && j !== ib && j !== ic && inside(points[j], a, b, c))) continue;
      out.push([ia, ib, ic]); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break; // self-intersecting input: stop rather than loop
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
