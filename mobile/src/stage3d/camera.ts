import { invert, lookAt, multiply, perspective, toWorld, transformPoint } from './math';
import type { Mat4, Vec3 } from './math';

/**
 * Cameras for the 3D view. Orbit circles a point on the ground (editing); eye stands at a point on the stage at eye
 * height and looks around (walking the route). Headings are stage degrees, the same as rotation and downrange:
 * 0 = +X (right on the plan), 90 = +Y (down the plan).
 */
export type OrbitCamera = { kind: 'orbit'; target: Vec3; yaw: number; pitch: number; distance: number };
export type EyeCamera = { kind: 'eye'; position: Vec3; heading: number; pitch: number };
export type Camera = OrbitCamera | EyeCamera;

export const ORBIT_FOV = 50, EYE_FOV = 70;
export const PITCH_LIMITS = { orbit: [8, 89] as const, eye: [-45, 45] as const };
export const DISTANCE_LIMITS = [48, 30000] as const;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const rad = (d: number) => d * Math.PI / 180;

/** Stage heading → world direction on the ground. */
export const headingVector = (heading: number): Vec3 => [Math.cos(rad(heading)), -Math.sin(rad(heading)), 0];

/**
 * Uprange of the stage, looking downrange from 50° up, as close as possible with every corner of the stage and the
 * tallest object on screen (a small margin kept).
 */
export function fitOrbit(bounds: { min: Vec3; max: Vec3; center: Vec3; radius: number }, downrangeDegrees: number, aspect = 0.75): OrbitCamera {
  const target: Vec3 = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, bounds.max[2] * 0.25];
  const base: OrbitCamera = { kind: 'orbit', target, yaw: 180 - downrangeDegrees, pitch: 50, distance: DISTANCE_LIMITS[1] };
  const corners: Vec3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [0, bounds.max[2]]) corners.push([x, y, z]);
  const fits = (distance: number) => {
    const { viewProj } = cameraMatrices({ ...base, distance }, aspect, bounds.radius);
    return corners.every(c => { const p = transformPoint(viewProj, c); return p.w > 0 && Math.abs(p.x) <= 0.92 && Math.abs(p.y) <= 0.92; });
  };
  let lo: number = DISTANCE_LIMITS[0], hi: number = Math.max(lo, Math.min(DISTANCE_LIMITS[1], bounds.radius * 8 + 240));
  if (!fits(hi)) return { ...base, distance: hi };
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return { ...base, distance: hi };
}

export function eyeAt(point: { x: number; y: number }, eyeHeight: number, heading: number, pitch = -4): EyeCamera {
  return { kind: 'eye', position: toWorld({ x: point.x, y: point.y, z: eyeHeight }), heading, pitch };
}

export function cameraEye(camera: Camera): Vec3 {
  if (camera.kind === 'eye') return camera.position;
  const p = rad(camera.pitch), y = rad(camera.yaw);
  return [camera.target[0] + camera.distance * Math.cos(p) * Math.cos(y), camera.target[1] + camera.distance * Math.cos(p) * Math.sin(y), camera.target[2] + camera.distance * Math.sin(p)];
}

export function cameraMatrices(camera: Camera, aspect: number, sceneRadius: number): { view: Mat4; projection: Mat4; viewProj: Mat4; inverse: Mat4 | null } {
  const eye = cameraEye(camera);
  let target: Vec3, near: number, far: number, fov: number;
  if (camera.kind === 'orbit') {
    target = camera.target; fov = ORBIT_FOV;
    near = Math.max(1, camera.distance * 0.02); far = camera.distance + sceneRadius * 6 + 2000;
  } else {
    const p = rad(camera.pitch), d = headingVector(camera.heading);
    target = [eye[0] + d[0] * Math.cos(p), eye[1] + d[1] * Math.cos(p), eye[2] + Math.sin(p)];
    // A 6 in near plane keeps depth precision on phones with a 16-bit depth buffer.
    fov = EYE_FOV; near = 6; far = sceneRadius * 8 + 4000;
  }
  const view = lookAt(eye, target, [0, 0, 1]), projection = perspective(fov, aspect, near, far);
  const viewProj = multiply(projection, view);
  return { view, projection, viewProj, inverse: invert(viewProj) };
}

/** One-finger drag: horizontal turns around the target, vertical tilts. */
export function orbitRotate(camera: OrbitCamera, dx: number, dy: number): OrbitCamera {
  return { ...camera, yaw: ((camera.yaw - dx * 0.35) % 360 + 360) % 360, pitch: clamp(camera.pitch + dy * 0.3, PITCH_LIMITS.orbit) };
}
export function orbitZoom(camera: OrbitCamera, factor: number): OrbitCamera {
  return { ...camera, distance: clamp(camera.distance / factor, DISTANCE_LIMITS) };
}
/** Two-finger drag: slides the target along the ground so the stage follows the fingers. */
export function orbitPan(camera: OrbitCamera, dx: number, dy: number, viewportHeight: number): OrbitCamera {
  const perPixel = 2 * camera.distance * Math.tan(rad(ORBIT_FOV / 2)) / Math.max(1, viewportHeight);
  const y = rad(camera.yaw);
  // Camera right and forward, flattened onto the ground.
  const right: Vec3 = [-Math.sin(y), Math.cos(y), 0], forward: Vec3 = [-Math.cos(y), -Math.sin(y), 0];
  const along = 1 / Math.max(0.2, Math.sin(rad(camera.pitch)));
  return { ...camera, target: [camera.target[0] - right[0] * dx * perPixel + forward[0] * dy * perPixel * along,
    camera.target[1] - right[1] * dx * perPixel + forward[1] * dy * perPixel * along, camera.target[2]] };
}
/** Drag to look around: left/right turns, up/down tilts (as if dragging the scene). */
export function eyeLook(camera: EyeCamera, dx: number, dy: number): EyeCamera {
  // Heading grows clockwise on the plan (turning right); dragging the scene right turns you left.
  return { ...camera, heading: ((camera.heading - dx * 0.25) % 360 + 360) % 360, pitch: clamp(camera.pitch + dy * 0.2, PITCH_LIMITS.eye) };
}
