import { validManualEngagements } from './manualEngagements';
import type { ManualEngagement } from './manualEngagements';
import { connectionPoints, pathLength, validConnections, retainConnections } from './routeGeometry';
import type { RouteConnection } from './routeGeometry';
import type { StagePosition, StageSize } from '../stage/coordinates';
import type { StageDocument } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { moveDirection, moveDirectionLabels, predictMove, validMovementModel } from '../profile/movementModel';
import type { MoveDirection } from '../profile/movementModel';
import { stageDownrange } from '../stage/orientation';
import { formatYardsFixed } from '../stage/measurements';
import { isEngageable, targetLabel } from './model';
import type { StagePlan } from './model';
import { analyzeEngagements, validEngagementRules } from './engagements';
import type { EngagementRules, EngagementAnalysis } from './engagements';

export type ShootingPosition = {
  id: string; label: string; position: StagePosition;
  visibleTargetIds: string[]; engagedTargetIds: string[];
  /** Engagements on the incoming segment; these do not add route waypoints. */
  movingTargetIds?: string[];
};
/** Array order is route order. Reloads finish before destination engagement.
 * By default they overlap the incoming segment; stationary explicitly opts out. */
export type StageRoute = {
  version: 1; id: string; name: string; positions: ShootingPosition[];
  connections?: RouteConnection[];
  manualEngagements?: ManualEngagement[];
  engagementRules?: EngagementRules;
  reloads: { positionId: string; magazineId: string; mode?: 'moving' | 'stationary' }[];
};
export type MovementSegment = { fromId: string; toId: string; distance: number; seconds: number | null };
export type AmmoState = { positionId: string; required: number; available: number; remaining: number; magazineId: string | null; sufficient: boolean };
export type ReloadTiming = {
  positionId: string; magazineId: string; mode: 'moving' | 'stationary';
  rawDuration: number; availableMovement: number; overlap: number; additionalPenalty: number;
};
export type PositionTiming = { positionId: string; plannedRounds: number; targetCount: number; engagementSeconds: number };
export type RouteEvaluation = {
  engagementAnalysis?: EngagementAnalysis;
  segments: MovementSegment[]; distance: number; startingRounds: number; ammo: AmmoState[];
  magazineChanges: number; warnings: string[];
  timing: { movement: number; draw: number; splits: number; transitions: number;
    /** Reloads is the additional cost, so existing timing consumers do not double-count. */
    reloads: number; rawReloadDuration: number; reloadMovementAvailable: number; reloadOverlap: number;
    reloadDetails: ReloadTiming[]; positionDetails: PositionTiming[]; total: number } | null;
};
export const createRoute = (id: string): StageRoute => ({ version: 1, id, name: 'Manual route', positions: [], reloads: [] });
/** Validate saved shape without erasing stale target/magazine references; evaluation explains those. */
export function isStageRoute(value: unknown): value is StageRoute {
  if (!value || typeof value !== 'object') return false;
  const r = value as StageRoute;
  const ids = (values: unknown): values is string[] => Array.isArray(values) && values.every(id => typeof id === 'string') && new Set(values).size === values.length;
  return validConnections(r.connections, r.positions) && validManualEngagements(r.manualEngagements, r, true) && (r.engagementRules === undefined || validEngagementRules(r.engagementRules)) && r.version === 1 && typeof r.id === 'string' && !!r.id && typeof r.name === 'string' && Array.isArray(r.positions) &&
    r.positions.every(p => p && typeof p.id === 'string' && !!p.id && typeof p.label === 'string' && p.position?.space === 'stage' && p.position.z === 0 && [p.position.x, p.position.y].every(Number.isFinite) && ids(p.visibleTargetIds) && ids(p.engagedTargetIds)) &&
    r.positions.every(p => p.movingTargetIds === undefined || (ids(p.movingTargetIds) && (!p.movingTargetIds.length || !!r.engagementRules) && p.movingTargetIds.every(id => p.engagedTargetIds.includes(id)))) &&
    new Set(r.positions.map(p => p.id)).size === r.positions.length && Array.isArray(r.reloads) && r.reloads.every(r => r && typeof r.positionId === 'string' && typeof r.magazineId === 'string' && (r.mode === undefined || r.mode === 'moving' || r.mode === 'stationary'));
}
export function movePosition(route: StageRoute, id: string, position: StagePosition, size: StageSize): StageRoute {
  if (![position.x, position.y].every(Number.isFinite)) return route;
  return { ...route, positions: route.positions.map(p => p.id === id ? { ...p, position: { space: 'stage', x: Math.max(0, Math.min(size.width, position.x)), y: Math.max(0, Math.min(size.depth, position.y)), z: 0 } } : p) };
}
export function reorderPosition(route: StageRoute, id: string, direction: -1 | 1): StageRoute {
  const positions = [...route.positions], index = positions.findIndex(p => p.id === id), next = index + direction;
  if (index < 0 || next < 0 || next >= positions.length) return route;
  [positions[index], positions[next]] = [positions[next], positions[index]];
  return retainConnections({ ...route, positions });
}
/** A target can be visible at several positions, but has exactly one intended engagement. */
export function engageAt(route: StageRoute, positionId: string, targetId: string): StageRoute {
  if (!route.positions.some(p => p.id === positionId)) return route;
  return { ...route, positions: route.positions.map(p => ({ ...p,
    ...(p.movingTargetIds ? { movingTargetIds: p.movingTargetIds.filter(id => id !== targetId) } : {}),
    visibleTargetIds: p.id === positionId ? [...new Set([...p.visibleTargetIds, targetId])] : p.visibleTargetIds,
    engagedTargetIds: [...p.engagedTargetIds.filter(id => id !== targetId), ...(p.id === positionId ? [targetId] : [])],
  })) };
}

export type TargetAssignmentMode = 'visible' | 'engaged';
export function toggleRouteTarget(route: StageRoute, stage: StageDocument, positionId: string, targetId: string, mode: TargetAssignmentMode): StageRoute {
  const selected = route.positions.find(p => p.id === positionId);
  if (!selected || !stage.objects.some(o => o.id === targetId && isEngageable(o))) return route;
  if (mode === 'engaged' && !selected.engagedTargetIds.includes(targetId)) return engageAt(route, positionId, targetId);
  return { ...route, positions: route.positions.map(p => p.id !== positionId ? p : {
    ...p,
    ...(p.movingTargetIds ? { movingTargetIds: p.movingTargetIds.filter(id => id !== targetId) } : {}),
    visibleTargetIds: mode === 'visible' ? (p.visibleTargetIds.includes(targetId) ? p.visibleTargetIds.filter(id => id !== targetId) : [...p.visibleTargetIds, targetId]) : p.visibleTargetIds,
    engagedTargetIds: p.engagedTargetIds.filter(id => id !== targetId),
  }) };
}

/** Derived on every edit/load; cached ammo or timings would become stale when geometry/profile changes. */
export function evaluateRoute(stage: StageDocument, plan: StagePlan, route: StageRoute, profile: ShooterPerformanceProfile | null): RouteEvaluation {
  const warnings: string[] = [], segments: MovementSegment[] = [], ammo: AmmoState[] = [];
  const reloadDetails: ReloadTiming[] = [];
  const positionDetails: PositionTiming[] = [];
  const targets = new Map(stage.objects.filter(isEngageable).map(t => [t.id, t]));
  const magazines = new Map(plan.loadout.magazines.map(m => [m.id, m.startingRounds]));
  let magazineId = plan.loadout.startingMagazineId;
  let chamber = plan.loadout.chamberLoaded ? 1 : 0;
  const previous = stage.objects.find(o => o.type === 'start');
  let origin = previous?.position, fromId = previous?.id ?? 'start';
  let magazineChanges = 0, splits = 0, transitions = 0, targetCount = 0;
  const used = new Set<string>(), engaged = new Set<string>();
  if (!origin) warnings.push('Start Position is missing.');
  if (magazineId && !magazines.has(magazineId)) warnings.push('Starting magazine is missing.');
  if (magazineId) used.add(magazineId);
  const startingRounds = (magazines.get(magazineId ?? '') ?? 0) + chamber;
  const validProfile = profile && [profile.drawTime, profile.reloadTime, profile.averageSplitTime, profile.transitionTime].every(v => Number.isFinite(v) && v >= 0) && Number.isFinite(profile.movementSpeed) && profile.movementSpeed > 0;
  if (!validProfile) warnings.push('Timing unavailable: load a valid shooter performance profile.');
  // Your fitted sprint/shuffle model times each leg by its direction to downrange; otherwise the average speed.
  const movementModel = validProfile ? validMovementModel(profile.movementModel) : undefined, downrange = stageDownrange(stage);
  const moveNotes = new Set<string>();
  const legSeconds = (points: readonly StagePosition[], distance: number, label: string) => {
    if (!movementModel) return distance / profile!.movementSpeed;
    // A leg routed around a wall can turn: it is timed as the direction it covers the most ground in.
    const ground = new Map<MoveDirection, number>();
    for (let i = 1; i < points.length; i++) {
      const d = moveDirection(points[i - 1], points[i], downrange);
      if (d) ground.set(d, (ground.get(d) ?? 0) + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    const direction = [...ground].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const prediction = predictMove(movementModel, direction, distance);
    if (!prediction) return distance / profile!.movementSpeed;
    const kind = prediction.direction === 'all' ? '' : moveDirectionLabels[prediction.direction].toLowerCase() + ' ';
    if (prediction.beyondData) moveNotes.add(`${label}: the ${formatYardsFixed(distance, 1)} move is longer than your longest measured ${kind}move (${formatYardsFixed(prediction.fit.maxInches, 1)}); its time extends your fit.`);
    if (direction && prediction.direction === 'all') moveNotes.add(`No ${moveDirectionLabels[direction].toLowerCase()} moves measured yet: those legs use your fit across all directions.`);
    return prediction.seconds;
  };
  for (const reload of route.reloads) if (!route.positions.some(p => p.id === reload.positionId)) warnings.push('Reload references a deleted shooting position.');
  for (const p of route.positions) {
    let incomingSeconds = 0;
    if (origin) {
      const points = connectionPoints(route, fromId, p.id, origin, p.position), distance = pathLength(points);
      segments.push({ fromId, toId: p.id, distance, seconds: validProfile ? legSeconds(points, distance, p.label) : null });
      incomingSeconds = segments[segments.length - 1].seconds ?? 0;
    }
    origin = p.position; fromId = p.id;
    if (p.position.x < 0 || p.position.x > stage.stage.width || p.position.y < 0 || p.position.y > stage.stage.depth) warnings.push(`${p.label}: position is outside the stage.`);
    for (const id of new Set([...p.visibleTargetIds, ...p.engagedTargetIds])) if (!targets.has(id)) warnings.push(`${p.label}: deleted or non-shootable target ${id}.`);
    const reloads = route.reloads.filter(r => r.positionId === p.id);
    if (reloads.length > 1) warnings.push(`${p.label}: multiple reloads at one position are unsupported.`);
    const reload = reloads[0];
    if (reload) {
      if (!magazines.has(reload.magazineId) || used.has(reload.magazineId)) warnings.push(`${p.label}: reload magazine is missing or already used.`);
      else {
        // Preserve at most one chambered round when replacing a nonempty inserted magazine.
        if (!chamber && (magazines.get(magazineId ?? '') ?? 0) > 0) chamber = 1;
        magazineId = reload.magazineId; used.add(magazineId); magazineChanges++;
        if (validProfile) {
          const mode = reload.mode ?? 'moving';
          const availableMovement = mode === 'moving' ? incomingSeconds : 0;
          const rawDuration = profile.reloadTime;
          reloadDetails.push({ positionId: p.id, magazineId, mode, rawDuration, availableMovement,
            overlap: Math.min(rawDuration, availableMovement),
            additionalPenalty: Math.max(0, rawDuration - availableMovement) });
        }
      }
    }
    let required = 0, count = 0, positionSplits = 0;
    for (const id of p.engagedTargetIds) {
      if (!targets.has(id)) continue;
      if (engaged.has(id)) { warnings.push(`${p.label}: ${targetLabel(stage, id)} is engaged more than once.`); continue; }
      engaged.add(id);
      if (!p.visibleTargetIds.includes(id)) warnings.push(`${p.label}: engaged ${targetLabel(stage, id)} is not marked visible.`);
      const rounds = plan.engagements[id];
      if (!Number.isSafeInteger(rounds) || rounds <= 0) { warnings.push(`${p.label}: set planned rounds for ${targetLabel(stage, id)} in Loadout / Planning.`); continue; }
      required += rounds; splits += rounds - 1; positionSplits += rounds - 1; count++;
    }
    targetCount += count; transitions += Math.max(0, count - 1);
    if (validProfile) positionDetails.push({ positionId: p.id, plannedRounds: required, targetCount: count,
      engagementSeconds: positionSplits * profile.averageSplitTime + Math.max(0, count - 1) * profile.transitionTime });
    const available = (magazines.get(magazineId ?? '') ?? 0) + chamber;
    const sufficient = required <= available;
    if (!sufficient) warnings.push(`${p.label}: requires ${required} rounds; only ${available} available. Magazine plan cannot complete this engagement.`);
    const remaining = Math.max(0, available - required);
    // Fire available rounds only; never manufacture ammunition or carry a negative balance.
    chamber = Math.min(1, remaining);
    if (magazineId) magazines.set(magazineId, remaining - chamber);
    ammo.push({ positionId: p.id, required, available, remaining, magazineId, sufficient });
  }
  for (const id of targets.keys()) if (!engaged.has(id)) warnings.push(`${targetLabel(stage, id)} has no route engagement.`);
  const distance = segments.reduce((n, s) => n + s.distance, 0);
  const engagementAnalysis = route.engagementRules ? analyzeEngagements(stage, route) : undefined;
  if (engagementAnalysis) warnings.push(...engagementAnalysis.warnings);
  const moving = route.positions.some(p => p.movingTargetIds?.length);
  if (moving) warnings.push('Moving engagement is geometry-only; performance timing is unavailable until movement/firing overlap is calibrated.');
  warnings.push(...moveNotes);
  // Without a fitted model keep the original single division, so stored comparisons re-evaluate to the same digits.
  const timing = validProfile && !moving ? { movement: movementModel ? segments.reduce((n, s) => n + (s.seconds ?? 0), 0) : distance / profile.movementSpeed, draw: targetCount ? profile.drawTime : 0,
    splits: splits * profile.averageSplitTime, transitions: transitions * profile.transitionTime,
    reloads: reloadDetails.reduce((sum, r) => sum + r.additionalPenalty, 0),
    rawReloadDuration: reloadDetails.reduce((sum, r) => sum + r.rawDuration, 0),
    reloadMovementAvailable: reloadDetails.reduce((sum, r) => sum + r.availableMovement, 0),
    reloadOverlap: reloadDetails.reduce((sum, r) => sum + r.overlap, 0), reloadDetails, positionDetails, total: 0 } : null;
  if (timing) timing.total = timing.movement + timing.draw + timing.splits + timing.transitions + timing.reloads;
  return { segments, distance, startingRounds, ammo, magazineChanges, warnings, timing, ...(engagementAnalysis ? { engagementAnalysis } : {}) };
}
