import type { StagePosition } from '../stage/coordinates';
import type { StageDocument, StageObject } from '../stage/model';
import { footprint, footprintCenterOffset, segmentRectangleInterval, stageToObjectLocal } from '../stage/geometry';
import { isEngageable } from './model';
import type { StageRoute, ShootingPosition } from './route';
import { connectionPoints } from './routeGeometry';
import { hasLineOfSight, isPointInsideAllowedArea } from './positionDiscovery';
import { formatYardsFixed } from '../stage/measurements';
import { strictlyInside } from './routeSolver/traversability';
import { stageDownrange } from '../stage/orientation';

export type RouteWaypoint = Pick<ShootingPosition, 'id' | 'label' | 'position'>;
export type FiringArea = { id: string; vertices: { x: number; y: number }[] };
/** Explicit stage-brief inputs for recreational airsoft. No rulebook or body/cover inference. */
export type EngagementRules = {
  version: 1; ruleset: 'USPSA' | 'PCSL' | 'IDPA'; sampleSpacingInches: number;
  firingAreas: FiringArea[]; allowOutsideTravel: boolean; allowMoving: boolean;
  safeDirectionDegrees: number; safeHalfAngleDegrees: number;
  targetProcedures: Record<string, { stationaryOnly?: boolean; areaIds?: string[]; afterTargetIds?: string[] }>;
};
export type EngagementWindow = {
  targetId: string; routeSegmentId: string; startDistanceAlongSegment: number; endDistanceAlongSegment: number;
  startPosition: StagePosition; endPosition: StagePosition; preferredEngagementPosition: StagePosition; legalWhileMoving: true;
};
export type EngagementNode = { id: string; waypointId: string; kind: 'moving' | 'stationary'; position: StagePosition;
  targets: { targetId: string; orderLabel: string; reason: string; window?: EngagementWindow }[] };
export type EngagementAnalysis = { windows: EngagementWindow[]; nodes: EngagementNode[];
  segments: { id: string; from: StagePosition; to: StagePosition; distance: number; traversable: boolean;
    noFiringIntervals: { start: number; end: number }[] }[];
  alternatives: { targetId: string; stationaryWaypointIds: string[]; movingSegmentIds: string[] }[];
  coveredTargetIds: string[]; warnings: string[]; complete: boolean; truncated: boolean };
const point = (x: number, y: number): StagePosition => ({ space: 'stage', x, y, z: 0 });
const length = (a: StagePosition, b: StagePosition) => Math.hypot(b.x - a.x, b.y - a.y);
const interpolate = (a: StagePosition, b: StagePosition, d: number) => {
  const t = length(a, b) ? d / length(a, b) : 0;
  return point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
};
export function engagementLabel(index: number): string {
  let label = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
  return label;
}
/** Safe direction defaults to the stage's downrange (up the screen when no stage is given). */
export function defaultEngagementRules(stage?: Pick<StageDocument, 'downrangeDegrees'>): EngagementRules {
  return { version: 1, ruleset: 'USPSA', sampleSpacingInches: 2, firingAreas: [], allowOutsideTravel: true,
    allowMoving: true, safeDirectionDegrees: stage ? signedDegrees(stageDownrange(stage)) : -90, safeHalfAngleDegrees: 90, targetProcedures: {} };
}
/** -180..180 form, matching how directions have always been entered (0 right, 90 down, -90 up). */
export const signedDegrees = (degrees: number) => { const n = ((degrees % 360) + 360) % 360; return n > 180 ? n - 360 : n; };
/** True when the configured safe direction differs from the stage's downrange by more than a degree. */
export function safeDirectionMismatch(stage: Pick<StageDocument, 'downrangeDegrees'>, rules: Pick<EngagementRules, 'safeDirectionDegrees'>): boolean {
  const delta = Math.abs(((rules.safeDirectionDegrees - stageDownrange(stage)) % 360 + 540) % 360 - 180);
  return delta > 1;
}
export function validEngagementRules(value: unknown): value is EngagementRules {
  const r = value as EngagementRules;
  return !!r && r.version === 1 && ['USPSA', 'PCSL', 'IDPA'].includes(r.ruleset)
    && Number.isFinite(r.sampleSpacingInches) && r.sampleSpacingInches >= 0.25 && r.sampleSpacingInches <= 24
    && Number.isFinite(r.safeDirectionDegrees) && Number.isFinite(r.safeHalfAngleDegrees) && r.safeHalfAngleDegrees > 0 && r.safeHalfAngleDegrees <= 90
    && typeof r.allowMoving === 'boolean' && typeof r.allowOutsideTravel === 'boolean'
    && Array.isArray(r.firingAreas) && r.firingAreas.length <= 32 && new Set(r.firingAreas.map(a => a?.id)).size === r.firingAreas.length
    && r.firingAreas.every(a => a && typeof a.id === 'string' && a.id.length > 0 && Array.isArray(a.vertices) && a.vertices.length >= 3 && a.vertices.length <= 64
      && a.vertices.every(p => p && [p.x, p.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1e7)))
    && !!r.targetProcedures && typeof r.targetProcedures === 'object' && !Array.isArray(r.targetProcedures) && Object.keys(r.targetProcedures).length <= 64
    && Object.values(r.targetProcedures).every(p => p && (p.stationaryOnly === undefined || typeof p.stationaryOnly === 'boolean')
      && [p.areaIds, p.afterTargetIds].every(ids => ids === undefined || (Array.isArray(ids) && ids.length <= 64 && ids.every(id => typeof id === 'string'))));
}
/** Boundary counts as outside: avoid assigning a shot exactly on a fault line. Shared with the route solver. */
export function insideArea(p: { x: number; y: number }, area: FiringArea): boolean {
  return strictlyInside(p, area.vertices);
}
type Wall = Extract<StageObject, { type: 'wall' }>;
function center(target: StageObject) { const o = footprintCenterOffset(target); return { ...target.position, x: target.position.x + o.x, y: target.position.y + o.y }; }
function canFire(p: StagePosition, target: StageObject, stage: StageDocument, rules: EngagementRules, walls: Wall[], moving: boolean): boolean {
  const procedure = rules.targetProcedures[target.id];
  if (moving && (!rules.allowMoving || procedure?.stationaryOnly)) return false;
  // IDPA requires explicit per-target cover/exposure areas supplied from this stage brief.
  if (rules.ruleset === 'IDPA' && !procedure?.areaIds?.length) return false;
  if (!isPointInsideAllowedArea(p, stage.stage) || !rules.firingAreas.some(a => insideArea(p, a) && (!procedure?.areaIds || procedure.areaIds.includes(a.id)))) return false;
  const t = center(target), angle = Math.atan2(t.y - p.y, t.x - p.x) * 180 / Math.PI;
  const delta = Math.abs(((angle - rules.safeDirectionDegrees) % 360 + 540) % 360 - 180);
  return length(p, t) > 1e-7 && delta < rules.safeHalfAngleDegrees - 1e-7 && hasLineOfSight(p, t, walls);
}
/** Physical regular samples plus exact polygon/safety/LOS event distances avoid skipping narrow openings.
 * Midpoint tests partition linear geometry; bisection retains the legal side of each boundary. */
function breaks(a: StagePosition, b: StagePosition, rules: EngagementRules, target?: StageObject, walls: Wall[] = []): number[] {
  const d = length(a, b), values = [0, d];
  if (!d) return values;
  const cross = (x: number, y: number, u: number, v: number) => x * v - y * u;
  const intersect = (p: { x: number; y: number }, q: { x: number; y: number }, ray = false) => {
    const dx = b.x - a.x, dy = b.y - a.y, ex = q.x - p.x, ey = q.y - p.y, det = cross(dx, dy, ex, ey);
    if (Math.abs(det) < 1e-12) return;
    const t = cross(p.x - a.x, p.y - a.y, ex, ey) / det;
    const u = cross(p.x - a.x, p.y - a.y, dx, dy) / det;
    if (t > 0 && t < 1 && (ray || (u >= 0 && u <= 1))) values.push(t * d);
  };
  for (let n = rules.sampleSpacingInches; n < d; n += rules.sampleSpacingInches) values.push(n);
  for (const area of rules.firingAreas) area.vertices.forEach((p, i) => intersect(p, area.vertices[(i + 1) % area.vertices.length]));
  if (target) {
    const t = center(target);
    for (const angle of [rules.safeDirectionDegrees - rules.safeHalfAngleDegrees, rules.safeDirectionDegrees + rules.safeHalfAngleDegrees]) {
      const rad = angle * Math.PI / 180; intersect(t, { x: t.x + Math.cos(rad), y: t.y + Math.sin(rad) }, true);
    }
    for (const wall of walls) {
      const size = footprint(wall), rad = wall.rotation * Math.PI / 180;
      const xs = [-size.width / 2, size.width / 2, ...wall.ports.flatMap(p => [p.offset - p.width / 2, p.offset + p.width / 2])];
      for (const x of xs) for (const y of [-size.depth / 2, size.depth / 2]) {
        const corner = { x: wall.position.x + x * Math.cos(rad) - y * Math.sin(rad), y: wall.position.y + x * Math.sin(rad) + y * Math.cos(rad) };
        intersect(t, corner, true);
      }
    }
  }
  return [...new Set(values)].sort((x, y) => x - y);
}
/** Breaks along a polyline path: each straight piece's breaks offset by the distance walked before it, plus the bends. */
function pathBreaks(path: StagePosition[], cum: number[], rules: EngagementRules, target?: StageObject, walls: Wall[] = []): number[] {
  const values = [...cum];
  for (let i = 1; i < path.length; i++) for (const d of breaks(path[i - 1], path[i], rules, target, walls)) values.push(cum[i - 1] + d);
  return [...new Set(values)].sort((x, y) => x - y);
}
/** Point at distance s along a polyline (clamped to its ends). */
function along(path: StagePosition[], cum: number[], s: number): StagePosition {
  if (s <= 0 || path.length < 2) return point(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) if (s <= cum[i] + 1e-12) return interpolate(path[i - 1], path[i], s - cum[i - 1]);
  const last = path[path.length - 1]; return point(last.x, last.y);
}
function intervals(cuts: number[], legal: (d: number) => boolean): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const low = cuts[i - 1], high = cuts[i], mid = (low + high) / 2;
    if (high - low < 1e-8 || !legal(mid)) continue;
    const refine = (edge: number) => {
      if (legal(edge)) return edge;
      let yes = mid, no = edge;
      for (let n = 0; n < 30; n++) { const m = (yes + no) / 2; if (legal(m)) yes = m; else no = m; }
      return yes;
    };
    const start = refine(low), end = refine(high), previous = result[result.length - 1];
    if (previous && Math.abs(previous.end - start) < 1e-6 && legal(low)) previous.end = end;
    else result.push({ start, end });
  }
  return result;
}

/** Derived only: samples/arrows are never StageDocument objects or saved geometry. */
export function analyzeEngagements(stage: StageDocument, route: StageRoute, suggest = false): EngagementAnalysis {
  const result: EngagementAnalysis = { windows: [], nodes: [], segments: [], alternatives: [], coveredTargetIds: [], warnings: [], complete: false, truncated: false };
  const rules = route.engagementRules, targets = stage.objects.filter(isEngageable), walls = stage.objects.filter((o): o is Wall => o.type === 'wall');
  const start = stage.objects.find(o => o.type === 'start');
  if (!rules || !validEngagementRules(rules) || !start) { result.warnings.push('Configure firing areas, safe direction and stage procedures before analyzing engagements.'); return result; }
  if (targets.length > 64 || walls.length > 128 || walls.some(w => w.ports.length > 32) || route.positions.length > 64) {
    result.truncated = true; result.warnings.push('Engagement analysis limit exceeded.'); return result;
  }
  if (!rules.firingAreas.length) result.warnings.push('No legal firing areas configured.');
  if (rules.ruleset === 'IDPA' && targets.some(t => !rules.targetProcedures[t.id]?.areaIds?.length)) result.warnings.push('IDPA needs explicit cover/exposure area assignments for every target.');
  const completed = new Set<string>();
  const futureWindows = suggest ? analyzeEngagements(stage, { ...route, positions: route.positions.map(p => ({ ...p, engagedTargetIds: [], movingTargetIds: [] })) }).windows : [];
  const alternatives = targets.map(t => ({ targetId: t.id, stationaryWaypointIds: [] as string[], movingSegmentIds: [] as string[] }));
  let origin = start.position, originId = start.id, budget = 0, geometryWork = 0, reachable = true;
  for (const waypoint of route.positions) {
    // Follow the drawn path (bends included), the same path the timing evaluator measures.
    const from = point(origin.x, origin.y), to = waypoint.position;
    const path = connectionPoints(route, originId, waypoint.id, from, to).map(p => point(p.x, p.y));
    const cum = path.reduce<number[]>((acc, p, i) => { acc.push(i ? acc[i - 1] + length(path[i - 1], p) : 0); return acc; }, []);
    const d = cum[cum.length - 1];
    const at = (s: number) => along(path, cum, s);
    origin = to; originId = waypoint.id;
    if (!Number.isFinite(d) || d / rules.sampleSpacingInches > 20000 || (budget += Math.ceil(d / rules.sampleSpacingInches) * Math.max(1, targets.length)) > 250000) {
      result.truncated = true; result.warnings.push('Engagement sample budget reached; remaining route is unverified.'); break;
    }
    const cuts = pathBreaks(path, cum, rules);
    const inArea = (s: number) => rules.firingAreas.some(a => insideArea(at(s), a));
    const noFiringIntervals = intervals(cuts, s => !inArea(s));
    const wallCollision = walls.some(w => { const size = footprint(w); return path.slice(1).some((p, i) => !!segmentRectangleInterval(stageToObjectLocal(path[i], w), stageToObjectLocal(p, w), size.width / 2, size.depth / 2)); });
    const traversable = path.every(p => isPointInsideAllowedArea(p, stage.stage)) && !wallCollision
      && (rules.allowOutsideTravel || (!noFiringIntervals.length && inArea(0) && inArea(d)));
    reachable &&= traversable;
    result.segments.push({ id: waypoint.id, from, to, distance: d, traversable, noFiringIntervals });
    if (!reachable) { result.warnings.push(`${waypoint.label}: movement path is blocked or outside permitted travel.`); continue; }
    const local: EngagementWindow[] = [];
    for (const target of targets) {
      const alternative = alternatives.find(a => a.targetId === target.id)!;
      if (canFire(to, target, stage, rules, walls, false)) alternative.stationaryWaypointIds.push(waypoint.id);
      if (d > 1e-7 && !route.reloads.some(r => r.positionId === waypoint.id)) {
        const targetCuts = pathBreaks(path, cum, rules, target, walls);
        geometryWork += targetCuts.length * Math.max(1, walls.length);
        if (geometryWork > 1000000) { result.truncated = true; result.warnings.push('Geometry work budget reached; remaining engagements are unverified.'); return result; }
        const windows = intervals(targetCuts, s => canFire(at(s), target, stage, rules, walls, true));
        if (windows.length) alternative.movingSegmentIds.push(waypoint.id);
        if (!completed.has(target.id)) for (const w of windows) local.push({ targetId: target.id, routeSegmentId: waypoint.id,
          startDistanceAlongSegment: w.start, endDistanceAlongSegment: w.end, startPosition: at(w.start), endPosition: at(w.end),
          preferredEngagementPosition: at((w.start + w.end) / 2), legalWhileMoving: true });
      }
    }
    result.windows.push(...local);
    const ids = suggest ? targets.map(t => t.id).filter(id => !completed.has(id)) : waypoint.engagedTargetIds;
    if (!suggest && ids.some((id, i) => waypoint.movingTargetIds?.includes(id) && ids.slice(0, i).some(previous => !waypoint.movingTargetIds?.includes(previous)))) {
      result.warnings.push(`${waypoint.label}: moving engagements must precede stationary arrival engagements.`); continue;
    }
    let cursor = 0, lastAngle = Math.atan2(path[1 % path.length].y - from.y, path[1 % path.length].x - from.x);
    const pending = [...ids];
    let movingIndex = 0;
    while (pending.length) {
      const options = pending.flatMap(id => {
        if (completed.has(id) || (rules.targetProcedures[id]?.afterTargetIds ?? []).some(required => !completed.has(required))) return [];
        if (!suggest && !waypoint.movingTargetIds?.includes(id)) return [];
        return local.filter(w => w.targetId === id && w.endDistanceAlongSegment >= cursor).map(w => {
          const distance = Math.max(cursor, w.startDistanceAlongSegment + Math.min(0.01, (w.endDistanceAlongSegment - w.startDistanceAlongSegment) / 2));
          const position = at(distance), target = targets.find(t => t.id === id)!;
          const angle = Math.atan2(target.position.y - position.y, target.position.x - position.x);
          return { w, distance, position, angle, turn: Math.abs(Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle))) };
        });
      });
      if (!suggest) options.sort((a, b) => pending.indexOf(a.w.targetId) - pending.indexOf(b.w.targetId) || a.w.endDistanceAlongSegment - b.w.endDistanceAlongSegment);
      else options.sort((a, b) => a.w.endDistanceAlongSegment - b.w.endDistanceAlongSegment || a.w.startDistanceAlongSegment - b.w.startDistanceAlongSegment || a.turn - b.turn || a.w.targetId.localeCompare(b.w.targetId));
      const next = options[0]; if (!next) break;
      // Saved moving order is authoritative; reject an infeasible edit rather than silently reorder it.
      if (!suggest && pending.filter(id => waypoint.movingTargetIds?.includes(id))[0] !== next.w.targetId) break;
      cursor = next.distance; lastAngle = next.angle;
      const same = result.nodes.find(n => n.kind === 'moving' && n.waypointId === waypoint.id && length(n.position, next.position) < 1e-6);
      const earliest = options.every(o => o.w.endDistanceAlongSegment >= next.w.endDistanceAlongSegment);
      const entry = { targetId: next.w.targetId, orderLabel: engagementLabel(movingIndex++),
        reason: `${earliest ? 'Earliest closing eligible visibility window' : 'Saved engagement order'}; window closes ${formatYardsFixed(next.w.endDistanceAlongSegment)} along this segment.`, window: next.w };
      if (same) same.targets.push(entry);
      else result.nodes.push({ id: `moving-${waypoint.id}-${next.w.targetId}`, waypointId: waypoint.id, kind: 'moving', position: next.position, targets: [entry] });
      completed.add(next.w.targetId); pending.splice(pending.indexOf(next.w.targetId), 1);
    }
    const stationary: EngagementNode['targets'] = [];
    const stationaryPending = pending.filter(id => !waypoint.movingTargetIds?.includes(id) || suggest);
    while (stationaryPending.length) {
      const eligible = (id: string) => {
        const target = targets.find(t => t.id === id);
        return target && !completed.has(id) && !(rules.targetProcedures[id]?.afterTargetIds ?? []).some(required => !completed.has(required))
          && !(suggest && futureWindows.some(w => w.targetId === id && route.positions.findIndex(p => p.id === w.routeSegmentId) > route.positions.indexOf(waypoint)))
          && canFire(to, target, stage, rules, walls, false);
      };
      const id = suggest ? stationaryPending.find(eligible) : eligible(stationaryPending[0]) ? stationaryPending[0] : undefined;
      if (!id) break;
      stationary.push({ targetId: id, orderLabel: engagementLabel(stationary.length), reason: 'Legal stationary engagement at this waypoint.' }); completed.add(id);
      stationaryPending.splice(stationaryPending.indexOf(id), 1);
    }
    if (stationary.length) result.nodes.push({ id: `stationary-${waypoint.id}`, waypointId: waypoint.id, kind: 'stationary', position: to, targets: stationary });
  }
  result.alternatives = alternatives; result.coveredTargetIds = [...completed];
  result.complete = completed.size === targets.length && result.segments.length === route.positions.length && result.segments.every(s => s.traversable) && !result.truncated;
  if (completed.size < targets.length) result.warnings.push(`${targets.length - completed.size} target(s) lack a legal engagement in this route/order.`);
  if (route.reloads.length) result.warnings.push('Reload segments retain stationary engagements; simultaneous reload and firing is not scheduled.');
  return result;
}

export function suggestEngagements(stage: StageDocument, route: StageRoute): StageRoute {
  const analysis = analyzeEngagements(stage, route, true);
  return { ...route, positions: route.positions.map(p => {
    const nodes = analysis.nodes.filter(n => n.waypointId === p.id), ids = nodes.flatMap(n => n.targets.map(t => t.targetId));
    return { ...p, engagedTargetIds: ids, visibleTargetIds: [...new Set([...p.visibleTargetIds, ...ids])], movingTargetIds: nodes.filter(n => n.kind === 'moving').flatMap(n => n.targets.map(t => t.targetId)) };
  }) };
}
export function reorderEngagement(stage: StageDocument, route: StageRoute, waypointId: string, targetId: string, direction: -1 | 1): { route: StageRoute; error?: string } {
  const p = route.positions.find(p => p.id === waypointId); if (!p) return { route };
  const ids = [...p.engagedTargetIds], i = ids.indexOf(targetId), j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return { route };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const next = { ...route, positions: route.positions.map(p => p.id === waypointId ? { ...p, engagedTargetIds: ids } : p) };
  if (route.engagementRules && analyzeEngagements(stage, next).coveredTargetIds.length < analyzeEngagements(stage, route).coveredTargetIds.length)
    return { route, error: 'That order misses a visibility window or violates a stage procedure.' };
  return { route: next };
}
