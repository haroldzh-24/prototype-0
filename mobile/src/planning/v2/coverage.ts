import { footprint, segmentRectangleInterval, stageToObjectLocal } from '../../stage/geometry';
import { strictlyInside } from '../routeSolver/traversability';
import type { NormalizedStage, TargetFace, Wall } from './normalizeStage';
import type { Point, ReasonCode, Ruleset } from './types';

/** USPSA 2.2.3.2 / PCSL 9.1.1.3: barriers this tall or taller extend to infinity; shorter ones only to their height. */
export const LOW_WALL_LIMIT_INCHES = 69;
const EPS = 1e-9;

const stagePoint = (p: Point) => ({ space: 'stage' as const, x: p.x, y: p.y, z: 0 });
/** Smallest absolute difference between two headings, degrees (0..180). */
export const headingDelta = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
export const headingTo = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;

/** True when segments p-q and a-b cross at interior points of both (grazing an endpoint does not count). */
export function segmentsCross(p: Point, q: Point, a: Point, b: Point): boolean {
  const d = (q.x - p.x) * (b.y - a.y) - (q.y - p.y) * (b.x - a.x);
  if (Math.abs(d) < EPS) return false;
  const t = ((a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x)) / d;
  const u = ((a.x - p.x) * (q.y - p.y) - (a.y - p.y) * (q.x - p.x)) / d;
  return t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7;
}

type WallEffect = 'clear' | 'blocked' | 'over-low-wall';
/** How one wall affects a sight line to a target face sample. Walls are assumed to reach the ground (PCSL 9.1.1.2). */
export function wallEffect(p: Point, q: Point, wall: Wall, target: TargetFace, ruleset: Ruleset): WallEffect {
  const a = stageToObjectLocal(stagePoint(p), wall), b = stageToObjectLocal(stagePoint(q), wall), size = footprint(wall);
  const interval = segmentRectangleInterval(a, b, size.width / 2, size.depth / 2);
  if (!interval) return 'clear';
  const xs = interval.map(t => a.x + (b.x - a.x) * t), low = Math.min(...xs), high = Math.max(...xs);
  // A single port must contain the whole crossing (combining openings would invent one). Port height is not checked.
  if (wall.ports.some(port => low > port.offset - port.width / 2 + EPS && high < port.offset + port.width / 2 - EPS)) return 'clear';
  const top = wall.position.z + wall.geometry.height;
  // IDPA simulated walls extend infinitely (4.7.2). USPSA/PCSL low barriers stop at their built height.
  if (ruleset !== 'IDPA' && top < LOW_WALL_LIMIT_INCHES && (target.aimTop ?? target.top) > top + EPS) return 'over-low-wall';
  return 'blocked';
}

/** USPSA 9.1.5 / PCSL 11.5.3: other scoring areas and no-shoots stop bullets; IDPA 4.9: non-threats are not hard cover. */
export const defaultNoShootPolicy = (ruleset: Ruleset): 'occlude' | 'warn' => ruleset === 'IDPA' ? 'warn' : 'occlude';

export type SightResult = { visible: boolean; throughNoShoot: boolean; overLowWall: boolean; passesAboveOrBelow: boolean };
/** Does blocker `a` (its whole face) overlap the part of target `b` that is aimed at? */
const overlapsVertically = (a: TargetFace, b: TargetFace) => a.bottom < (b.aimTop ?? b.top) - EPS && (b.aimBottom ?? b.bottom) < a.top - EPS;

/** Line of sight from a shooting point to one face sample, applying the ruleset's occlusion policy. */
export function sightLine(p: Point, q: Point, target: TargetFace, stage: NormalizedStage, noShootPolicy: 'occlude' | 'warn'): SightResult {
  const blocked: SightResult = { visible: false, throughNoShoot: false, overLowWall: false, passesAboveOrBelow: false };
  let overLowWall = false, throughNoShoot = false, passesAboveOrBelow = false;
  // Stop the sight line just short of the face so a face mounted flush on a wall is not "blocked" by that wall.
  const len = Math.hypot(q.x - p.x, q.y - p.y), trim = Math.min(0.01, len / 2);
  const end = len > 0 ? { x: q.x - (q.x - p.x) / len * trim, y: q.y - (q.y - p.y) / len * trim } : q;
  const minX = Math.min(p.x, end.x) - EPS, maxX = Math.max(p.x, end.x) + EPS, minY = Math.min(p.y, end.y) - EPS, maxY = Math.max(p.y, end.y) + EPS;
  for (let i = 0; i < stage.walls.length; i++) {
    const b = stage.wallBounds[i];
    if (b && (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY)) continue; // cannot touch this sight line
    const effect = wallEffect(p, end, stage.walls[i], target, stage.ruleset);
    if (effect === 'blocked') return blocked;
    if (effect === 'over-low-wall') overLowWall = true;
  }
  // USPSA 9.1.5 / PCSL 11.5.3: scoring areas of other targets are impenetrable (plan view, vertically overlapping faces).
  if (noShootPolicy === 'occlude')
    for (const other of stage.targets) {
      if (other.id === target.id || (target.stack && other.stack === target.stack) || !segmentsCross(p, q, other.left, other.right)) continue;
      if (overlapsVertically(other, target)) return blocked;
      passesAboveOrBelow = true; // crosses in plan view but at a different height: recorded as an assumption
    }
  for (const noShoot of stage.noShoots) {
    // A hostage no-shoot on this target is part of its face: its cover is already taken out of the face's open area.
    if ((target.stack && noShoot.stack === target.stack) || !segmentsCross(p, q, noShoot.left, noShoot.right)) continue;
    if (!overlapsVertically(noShoot, target)) { passesAboveOrBelow = true; continue; }
    if (noShootPolicy === 'occlude') return blocked;
    throughNoShoot = true; // IDPA 4.9: non-threats are not hard cover, but a hit is a penalty.
  }
  return { visible: true, throughNoShoot, overLowWall, passesAboveOrBelow };
}

/**
 * The rules measure steel distance from the target face to the nearest part of the shooter's body touching the ground
 * (USPSA 10.5.16). A stop is the body centre, so feet are allowed this far from it.
 */
export const FOOT_REACH_INCHES = 6;
/** Distance from p to the segment a-b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  const ex = p.x - (a.x + dx * t), ey = p.y - (a.y + dy * t);
  return Math.sqrt(ex * ex + ey * ey);
}
/** True when a shooter standing at p would be closer to this steel face than the ruleset allows. */
export function steelTooClose(p: Point, target: TargetFace, stage: NormalizedStage): boolean {
  return target.kind === 'steel' && stage.steelMinInches > 0 && distanceToSegment(p, target.left, target.right) - FOOT_REACH_INCHES < stage.steelMinInches;
}

export type EngagementCheck = {
  legal: boolean;
  failure?: ReasonCode;
  visibleFraction: number;
  safeMarginDegrees: number;
  throughNoShoot: boolean;
  overLowWall: boolean;
  /** Visible only along lines that pass above or below another target or no-shoot (plan-view assumption). */
  passesAboveOrBelow: boolean;
};

/**
 * Can a shooter standing at p legally engage the target?
 * 1. p is strictly inside a firing area the target's procedure allows; for steel, at least the ruleset's steel
 *    minimum distance away, feet included.
 * 2. Every sampled point of the face (edges included) lies inside the safe arc around downrange.
 * 3. At least one interior face sample is visible. Flags record when visibility depends on a low wall or a no-shoot.
 */
export function checkEngagement(p: Point, target: TargetFace, stage: NormalizedStage, safeHalfAngle: number, noShootPolicy: 'occlude' | 'warn'): EngagementCheck {
  const none = { visibleFraction: 0, safeMarginDegrees: 0, throughNoShoot: false, overLowWall: false, passesAboveOrBelow: false };
  const allowed = stage.procedures[target.id]?.areaIds;
  // IDPA requires the brief's position(s) of cover per target, the same rule the manual engagement analysis applies.
  if (stage.ruleset === 'IDPA' && !allowed?.length) return { legal: false, failure: 'IDPA_AREAS_REQUIRED', ...none };
  if (!stage.areas.some(a => (!allowed || allowed.includes(a.id)) && strictlyInside(p, a.vertices))) return { legal: false, failure: 'NO_ALLOWED_AREA', ...none };
  if (steelTooClose(p, target, stage)) return { legal: false, failure: 'STEEL_TOO_CLOSE', ...none };
  let worst = 0;
  for (const q of target.angleSamples) {
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) return { legal: false, failure: 'OUTSIDE_SAFE_ANGLE', ...none };
    worst = Math.max(worst, headingDelta(headingTo(p, q), stage.downrangeDegrees));
  }
  const margin = safeHalfAngle - worst;
  if (margin <= 1e-7) return { legal: false, failure: 'OUTSIDE_SAFE_ANGLE', ...none, safeMarginDegrees: margin };
  let visible = 0, cleanOfNoShoot = 0, cleanOfLowWall = 0, cleanOfHeight = 0;
  for (const q of target.sightSamples) {
    const s = sightLine(p, q, target, stage, noShootPolicy);
    if (!s.visible) continue;
    visible++;
    if (!s.throughNoShoot) cleanOfNoShoot++;
    if (!s.overLowWall) cleanOfLowWall++;
    if (!s.passesAboveOrBelow) cleanOfHeight++;
  }
  if (!visible) return { legal: false, failure: 'OCCLUDED', ...none, safeMarginDegrees: margin };
  return { legal: true, visibleFraction: visible / target.sightSamples.length, safeMarginDegrees: margin,
    throughNoShoot: cleanOfNoShoot === 0, overLowWall: cleanOfLowWall === 0, passesAboveOrBelow: cleanOfHeight === 0 };
}
