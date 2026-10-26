import type { StagePosition } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import { stageDownrange } from '../stage/orientation';
import { analyzeEngagements } from '../planning/engagements';
import type { EngagementAnalysis } from '../planning/engagements';
import { isEngageable } from '../planning/model';
import type { StagePlan } from '../planning/model';
import type { StageRoute } from '../planning/route';
import { connectionPoints } from '../planning/routeGeometry';
import { normalizeStage, targetFace } from '../planning/v2/normalizeStage';
import type { NormalizedStage } from '../planning/v2/normalizeStage';
import { checkEngagement, defaultNoShootPolicy, sightLine } from '../planning/v2/coverage';
import { optionsFromPlan, snapshotFromPlan } from '../planning/v2/adopt';
import { shortTargetLabel } from './scene';

/**
 * Walking the planned route at eye level. The walk follows the drawn path (bends included), the same path the
 * engagement analysis and timing use, and reports for any point along it which targets the plan engages there
 * (on the move or at a stop) and what else is legal, visible or hidden from that spot. Pure, so it is unit-tested.
 */
type P = { x: number; y: number };
export type WalkLeg = { waypointId: string; label: string; start: number; length: number; path: P[]; cum: number[] };
export type WalkStop = { id: string; label: string; distance: number; point: P };
export type PlannedWindow = { targetId: string; waypointId: string; from: number; to: number; at: number; path: P[] };
export type Walk = {
  legs: WalkLeg[]; stops: WalkStop[]; length: number; path: P[];
  /** Planned engagements on the move: the stretch of path where each one is legal, and where the plan takes it. */
  windows: PlannedWindow[];
  /** Planned standing engagements by stop id. */
  standing: Record<string, string[]>;
  analysis: EngagementAnalysis | null;
};

const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);
function along(path: P[], cum: number[], s: number): P {
  if (path.length === 1 || s <= 0) return path[0];
  for (let i = 1; i < path.length; i++) if (s <= cum[i] || i === path.length - 1) {
    const span = cum[i] - cum[i - 1], t = span > 0 ? Math.min(1, (s - cum[i - 1]) / span) : 0;
    return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t };
  }
  return path[path.length - 1];
}
/** The part of a path between two distances along it. */
function subPath(path: P[], cum: number[], from: number, to: number): P[] {
  const out = [along(path, cum, from)];
  for (let i = 1; i < path.length - 1; i++) if (cum[i] > from && cum[i] < to) out.push(path[i]);
  out.push(along(path, cum, to));
  return out;
}

export function buildWalk(stage: StageDocument, route: StageRoute | undefined): Walk {
  const start = stage.objects.find(o => o.type === 'start');
  const empty: Walk = { legs: [], stops: [], length: 0, path: [], windows: [], standing: {}, analysis: null };
  if (!start) return empty;
  const origin0 = { x: start.position.x, y: start.position.y };
  const walk: Walk = { ...empty, stops: [{ id: start.id, label: 'START', distance: 0, point: origin0 }], path: [origin0] };
  let origin: StagePosition = start.position, originId = start.id, total = 0;
  for (const waypoint of route?.positions ?? []) {
    const path = connectionPoints(route!, originId, waypoint.id, { space: 'stage', x: origin.x, y: origin.y, z: 0 }, waypoint.position).map(p => ({ x: p.x, y: p.y }));
    const cum = path.reduce<number[]>((acc, p, i) => { acc.push(i ? acc[i - 1] + dist(path[i - 1], p) : 0); return acc; }, []);
    const length = cum[cum.length - 1] ?? 0;
    walk.legs.push({ waypointId: waypoint.id, label: waypoint.label, start: total, length, path, cum });
    walk.path.push(...path.slice(1));
    total += length;
    walk.stops.push({ id: waypoint.id, label: waypoint.label, distance: total, point: { x: waypoint.position.x, y: waypoint.position.y } });
    origin = waypoint.position; originId = waypoint.id;
  }
  walk.length = total;
  if (route?.engagementRules && route.positions.length) {
    const analysis = analyzeEngagements(stage, route);
    walk.analysis = analysis;
    for (const node of analysis.nodes) {
      const leg = walk.legs.find(l => l.waypointId === node.waypointId);
      if (!leg) continue;
      if (node.kind === 'stationary') { walk.standing[node.waypointId] = node.targets.map(t => t.targetId); continue; }
      for (const t of node.targets) if (t.window) {
        const w = t.window, at = Math.max(w.startDistanceAlongSegment, Math.min(w.endDistanceAlongSegment, nearestAlong(leg, node.position)));
        walk.windows.push({ targetId: t.targetId, waypointId: node.waypointId, from: leg.start + w.startDistanceAlongSegment, to: leg.start + w.endDistanceAlongSegment,
          at: leg.start + at, path: subPath(leg.path, leg.cum, w.startDistanceAlongSegment, w.endDistanceAlongSegment) });
      }
    }
  }
  return walk;
}
/** Distance along a leg of the path point closest to p. */
function nearestAlong(leg: WalkLeg, p: P): number {
  let best = 0, bestD = Infinity;
  for (let i = 1; i < leg.path.length; i++) {
    const a = leg.path[i - 1], b = leg.path[i], span = leg.cum[i] - leg.cum[i - 1];
    const t = span > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (span * span))) : 0;
    const d = dist(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (d < bestD) { bestD = d; best = leg.cum[i - 1] + span * t; }
  }
  return best;
}

export type WalkPoint = { point: P; distance: number; heading: number | null; leg: WalkLeg | null; stop: WalkStop | null };
/** Where the shooter is after walking `distance` inches, and which way they are walking. */
export function walkPoint(walk: Walk, distance: number): WalkPoint {
  const s = Math.max(0, Math.min(walk.length, distance));
  const stop = walk.stops.find(st => Math.abs(st.distance - s) < 0.5) ?? null;
  const leg = walk.legs.find(l => s >= l.start - 1e-9 && s <= l.start + l.length + 1e-9 && l.length > 0) ?? null;
  if (!leg) return { point: walk.stops[0]?.point ?? { x: 0, y: 0 }, distance: s, heading: null, leg: null, stop };
  const local = s - leg.start, point = along(leg.path, leg.cum, local);
  const ahead = along(leg.path, leg.cum, Math.min(leg.length, local + 6)), behind = along(leg.path, leg.cum, Math.max(0, local - 6));
  const heading = Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180 / Math.PI;
  return { point, distance: s, heading: Number.isFinite(heading) ? heading : null, leg, stop };
}

export type TargetState = 'moving' | 'here' | 'legal' | 'visible' | 'hidden' | 'done';
export type TargetStatus = { targetId: string; label: string; state: TargetState; detail: string; rounds: number; plannedAt?: string };
const STATE_ORDER: TargetState[] = ['moving', 'here', 'legal', 'visible', 'hidden', 'done'];
const REASONS: Record<string, string> = {
  NO_ALLOWED_AREA: 'not from this spot: outside its firing area', OUTSIDE_SAFE_ANGLE: 'outside the safe angle from here',
  STEEL_TOO_CLOSE: 'steel too close from here', OCCLUDED: 'hidden from here', IDPA_AREAS_REQUIRED: 'needs its cover position set in Route settings',
};

/** The normalized stage for sight checks. Without route settings the whole bay counts as one area (visibility only). */
export function sightStage(stage: StageDocument, plan: StagePlan): { stage: NormalizedStage; rules: boolean; halfAngle: number } | null {
  const rules = !!plan.route?.engagementRules?.firingAreas?.length;
  const snapshot = rules ? snapshotFromPlan(stage, plan)
    : { stage, firingAreas: [{ id: '__bay', vertices: [{ x: -1, y: -1 }, { x: stage.stage.width + 1, y: -1 }, { x: stage.stage.width + 1, y: stage.stage.depth + 1 }, { x: -1, y: stage.stage.depth + 1 }] }], targetProcedures: {} };
  const options = rules ? optionsFromPlan(plan) : { downrangeDegrees: stageDownrange(stage), safeHalfAngleDegrees: 90 };
  const normalized = normalizeStage(snapshot, options).stage;
  return normalized ? { stage: normalized, rules, halfAngle: options.safeHalfAngleDegrees ?? 90 } : null;
}

export function targetStatuses(stage: StageDocument, plan: StagePlan, walk: Walk, at: WalkPoint, sight = sightStage(stage, plan)): TargetStatus[] {
  const targets = stage.objects.filter(isEngageable);
  const stopIndex = (id: string) => walk.stops.findIndex(s => s.id === id);
  const out = targets.map((t): TargetStatus => {
    const rounds = plan.engagements[t.id] ?? (t.type === 'cardboardTarget' ? 2 : 1), label = shortTargetLabel(stage, t);
    const window = walk.windows.find(w => w.targetId === t.id);
    const standingAt = Object.entries(walk.standing).find(([, ids]) => ids.includes(t.id))?.[0];
    const plannedAt = window ? `on the way to ${walk.stops[stopIndex(window.waypointId)]?.label}` : standingAt ? `at ${walk.stops[stopIndex(standingAt)]?.label}` : undefined;
    // The plan takes a moving target somewhere inside its window; from the window opening up to that point it is "now".
    if (window && at.distance >= window.from - 0.5 && at.distance <= window.at + 0.5)
      return { targetId: t.id, label, state: 'moving', rounds, plannedAt,
        detail: `engage on the move · ${Math.max(0, (window.to - at.distance) / 36).toFixed(1)} yd of window left` };
    if (standingAt && at.stop?.id === standingAt) return { targetId: t.id, label, state: 'here', rounds, plannedAt, detail: 'engage from this position' };
    const doneDistance = window ? window.at : standingAt ? walk.stops[stopIndex(standingAt)]?.distance : undefined;
    if (doneDistance !== undefined && at.distance > doneDistance + 0.5) return { targetId: t.id, label, state: 'done', rounds, plannedAt, detail: 'already engaged' };
    const face = targetFace(t);
    if (!sight || !face) return { targetId: t.id, label, state: 'hidden', rounds, plannedAt, detail: 'cannot check from here' };
    const check = checkEngagement(at.point, face, sight.stage, sight.halfAngle, defaultNoShootPolicy(sight.stage.ruleset));
    const notes = [check.overLowWall && 'seen over a low wall (assumed)', check.throughNoShoot && 'past a no-shoot', check.passesAboveOrBelow && 'past another target (assumed)'].filter(Boolean).join(', ');
    if (check.legal) {
      const visible = `${Math.round(check.visibleFraction * 100)}% of the face visible`;
      return { targetId: t.id, label, state: sight.rules ? 'legal' : 'visible', rounds, plannedAt, detail: [sight.rules ? 'legal from here' : 'visible', visible, notes].filter(Boolean).join(' · ') };
    }
    // Not legal: say whether it can at least be seen (sight lines alone, ignoring areas and angles).
    const seen = face.sightSamples.some(q => sightLine(at.point, q, face, sight.stage, defaultNoShootPolicy(sight.stage.ruleset)).visible);
    return { targetId: t.id, label, state: seen ? 'visible' : 'hidden', rounds, plannedAt,
      detail: seen ? `visible, ${REASONS[check.failure ?? ''] ?? 'not legal from here'}` : 'hidden from here' };
  });
  return out.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/**
 * Which way to face: the targets the plan engages here or on the move now, else the next planned one, else the
 * direction of travel, else downrange.
 */
export function suggestedHeading(stage: StageDocument, walk: Walk, at: WalkPoint, statuses: TargetStatus[]): number {
  const focus = statuses.filter(s => s.state === 'moving' || s.state === 'here');
  const pick = focus.length ? focus : (() => {
    const next = walk.windows.filter(w => w.at > at.distance).sort((a, b) => a.at - b.at)[0]?.targetId
      ?? Object.entries(walk.standing).map(([id, ids]) => ({ d: walk.stops.find(s => s.id === id)?.distance ?? -1, ids })).filter(e => e.d > at.distance).sort((a, b) => a.d - b.d)[0]?.ids[0];
    return next ? statuses.filter(s => s.targetId === next) : [];
  })();
  // With nothing planned (no route yet), face the targets as a whole, as a shooter does at the start.
  const chosen = pick.length ? pick : walk.length === 0 ? statuses : [];
  const points = chosen.map(s => stage.objects.find(o => o.id === s.targetId)!).filter(Boolean).map(o => o.position);
  if (points.length) {
    const c = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });
    if (dist(c, at.point) > 1) return Math.atan2(c.y - at.point.y, c.x - at.point.x) * 180 / Math.PI;
  }
  return at.heading ?? stageDownrange(stage);
}
