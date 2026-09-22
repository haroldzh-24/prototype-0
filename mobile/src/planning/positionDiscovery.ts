import type { StagePosition, StageSize } from '../stage/coordinates';
import type { StageDocument, StageObject } from '../stage/model';
import { footprint, footprintCenterOffset, segmentRectangleInterval, stageToObjectLocal } from '../stage/geometry';
import { validFaceCut } from '../stage/targetFace';
import { isEngageable } from './model';
import type { ShootingPosition } from './route';
import { shootingDifficulty } from './shootingDifficulty';

type Wall = Extract<StageObject, { type: 'wall' }>;
export const DISCOVERY_CONFIG = Object.freeze({
  gridSpacingInches: 36, deduplicationRadiusInches: 48, difficultyTolerance: 0.5,
  maxSampledPoints: 2048, maxDiscoveredPositions: 64, maxLOSChecks: 32768,
  maxTargets: 64, maxObjects: 512, maxPortsPerWall: 32,
});
export type DiscoveryConfig = { -readonly [K in keyof typeof DISCOVERY_CONFIG]: number };
export type TargetVisibility = {
  visibleTargetIds: string[]; visibleScoringTargetCount: number; coverageRatio: number;
  coveragePercentage: number;
  targets: { targetId: string; distanceInches: number; shootingDifficulty: number }[];
  minimumTargetDistance: number | null; averageTargetDistance: number | null; maximumTargetDistance: number | null;
  totalShootingDifficulty: number; averageShootingDifficulty: number | null;
};
export type DiscoveredPosition = TargetVisibility & {
  id: string; position: StagePosition; source: 'AUTO_DISCOVERED';
  distanceFromStart: number | null; reachability: 'NOT_EVALUATED';
};
export type DiscoveryResult = {
  candidates: DiscoveredPosition[];
  warnings: { code: 'MODELED_GEOMETRY_ONLY' | 'PROJECTED_PORTS' | 'INVALID_GEOMETRY' | 'SEARCH_LIMIT' | 'NO_TARGETS' | 'NO_USEFUL_POSITIONS'; message: string }[];
  search: { sampledPoints: number; losChecks: number; consideredTargets: number; totalScoringTargets: number; truncated: boolean };
};
const positive = (n: number) => Number.isFinite(n) && n > 0;
const finitePoint = (p: StagePosition) => !!p && p.space === 'stage' && [p.x, p.y, p.z].every(Number.isFinite);
const distance = (a: StagePosition, b: StagePosition) => Math.hypot(a.x - b.x, a.y - b.y);

/** Bounds are the only explicit area in schema 7. Fault lines do not define a polygon. */
export function isPointInsideAllowedArea(point: StagePosition, size: StageSize): boolean {
  return finitePoint(point) && !!size && positive(size.width) && positive(size.depth)
    && point.z === 0 && point.x >= 0 && point.y >= 0 && point.x <= size.width && point.y <= size.depth;
}
export function isPointInsideWall(point: StagePosition, wall: Wall): boolean {
  const local = stageToObjectLocal(point, wall), size = footprint(wall);
  return Math.abs(local.x) <= size.width / 2 + 1e-9 && Math.abs(local.y) <= size.depth / 2 + 1e-9;
}

/** Projected 2D ports only: the whole segment within wall thickness must fit an opening.
 * No muzzle height exists, so vertical clearance and actual firing feasibility are unknown.
 * Standing collision always uses the whole wall footprint, including below a port.
 * Helpers accept validated geometry; discoverCandidatePositions validates at its boundary.
 */
export function hasLineOfSight(from: StagePosition, to: StagePosition, walls: readonly Wall[]): boolean {
  if (!finitePoint(from) || !finitePoint(to)) return false;
  return walls.every(wall => {
    const a = stageToObjectLocal(from, wall), b = stageToObjectLocal(to, wall), size = footprint(wall);
    const interval = segmentRectangleInterval(a, b, size.width / 2, size.depth / 2);
    if (!interval) return true;
    const xs = interval.map(t => a.x + (b.x - a.x) * t);
    const low = Math.min(...xs), high = Math.max(...xs);
    // Each port must work on its own; combining different elevations would invent an opening.
    return wall.ports.some(p => low > p.offset - p.width / 2 + 1e-9 && high < p.offset + p.width / 2 - 1e-9);
  });
}

/** All scoring objects are required, matching the existing route planner. No-shoots are excluded.
 * LOS uses the active face center; difficulty retains the existing reference-position model.
 */
export function computeTargetVisibility(position: StagePosition, targets: readonly StageObject[], walls: readonly Wall[],
  totalScoringTargets = targets.length): TargetVisibility {
  const visible: TargetVisibility['targets'] = [];
  for (const target of targets) {
    if (!isEngageable(target)) continue;
    const offset = footprintCenterOffset(target);
    const center = { ...target.position, x: target.position.x + offset.x, y: target.position.y + offset.y };
    if (!hasLineOfSight(position, center, walls)) continue;
    const difficulty = shootingDifficulty(position, target.position);
    visible.push({ targetId: target.id, distanceInches: difficulty.distanceInches, shootingDifficulty: difficulty.score });
  }
  const distances = visible.map(t => t.distanceInches), total = visible.reduce((sum, t) => sum + t.shootingDifficulty, 0);
  const ratio = totalScoringTargets > 0 ? visible.length / totalScoringTargets : 0;
  return { visibleTargetIds: visible.map(t => t.targetId), visibleScoringTargetCount: visible.length,
    coverageRatio: ratio, coveragePercentage: ratio * 100, targets: visible,
    minimumTargetDistance: visible.length ? Math.min(...distances) : null,
    maximumTargetDistance: visible.length ? Math.max(...distances) : null,
    averageTargetDistance: visible.length ? distances.reduce((sum, d) => sum + d, 0) / visible.length : null,
    totalShootingDifficulty: total, averageShootingDifficulty: visible.length ? total / visible.length : null };
}

/** Lexicographic quality: coverage, difficulty, then start proximity; never route ranking. */
function compareQuality(a: DiscoveredPosition, b: DiscoveredPosition): number {
  return b.visibleScoringTargetCount - a.visibleScoringTargetCount
    || (a.averageShootingDifficulty ?? Infinity) - (b.averageShootingDifficulty ?? Infinity)
    || (a.distanceFromStart ?? 0) - (b.distanceFromStart ?? 0)
    || a.position.y - b.position.y || a.position.x - b.position.x;
}
export function deduplicateCandidatePositions(candidates: readonly DiscoveredPosition[],
  config: Pick<DiscoveryConfig, 'deduplicationRadiusInches' | 'difficultyTolerance'> = DISCOVERY_CONFIG): DiscoveredPosition[] {
  const kept: DiscoveredPosition[] = [];
  for (const candidate of [...candidates].sort(compareQuality)) {
    if (!candidate.visibleScoringTargetCount) continue;
    const duplicate = kept.some(other => distance(candidate.position, other.position) <= config.deduplicationRadiusInches
      && candidate.targets.length === other.targets.length
      && candidate.targets.every(t => other.targets.some(o => o.targetId === t.targetId
        && Math.abs(o.shootingDifficulty - t.shootingDifficulty) <= config.difficultyTolerance)));
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}

/** Fresh manual-compatible value; no engagements, order, reloads or persistence assigned. */
export function toShootingPosition(candidate: DiscoveredPosition): ShootingPosition {
  return { id: candidate.id, label: 'Auto position', position: { ...candidate.position },
    visibleTargetIds: [...candidate.visibleTargetIds], engagedTargetIds: [] };
}

export function discoverCandidatePositions(stage: StageDocument, requested: Partial<DiscoveryConfig> = {}): DiscoveryResult {
  const result: DiscoveryResult = { candidates: [], warnings: [], search: {
    sampledPoints: 0, losChecks: 0, consideredTargets: 0, totalScoringTargets: 0, truncated: false } };
  const warn = (code: DiscoveryResult['warnings'][number]['code'], message: string) => {
    if (!result.warnings.some(w => w.code === code && w.message === message)) result.warnings.push({ code, message });
  };
  const limited = (message: string) => { result.search.truncated = true; warn('SEARCH_LIMIT', message); };
  warn('MODELED_GEOMETRY_ONLY', 'Bounds and wall footprints only; legal shooting areas, body clearance and movement reachability are not modeled. Fault lines are markings.');
  const config = { ...DISCOVERY_CONFIG } as DiscoveryConfig;
  for (const key of Object.keys(config) as (keyof DiscoveryConfig)[]) {
    const value = requested[key];
    if (value === undefined) continue;
    const isLimit = key.startsWith('max');
    if (!Number.isFinite(value) || value < (isLimit ? 1 : 0) || (isLimit && (!Number.isSafeInteger(value) || value > DISCOVERY_CONFIG[key]))
      || (key === 'gridSpacingInches' && value < 1)) {
      warn('INVALID_GEOMETRY', `Invalid discovery configuration: ${key}.`); return result;
    }
    config[key] = value;
  }
  // A finite practical magnitude also prevents overflow in distances and grid dimensions.
  if (!stage || stage.coordinateSystem !== 'inches' || !stage.stage
    || ![stage.stage.width, stage.stage.depth].every(n => positive(n) && n <= 1e7) || !Array.isArray(stage.objects)) {
    warn('INVALID_GEOMETRY', 'Missing or invalid physical stage bounds/objects.'); return result;
  }
  if (stage.objects.length > config.maxObjects) {
    limited('Object limit exceeded; discovery stopped rather than omitting possible blocking walls.'); return result;
  }
  const walls: Wall[] = [], targets: StageObject[] = [], ids = new Set<string>();
  let start: StagePosition | null = null;
  for (const object of stage.objects) {
    if (!object || typeof object.id !== 'string' || !object.id || ids.has(object.id)) {
      warn('INVALID_GEOMETRY', 'Missing or duplicate object identity; discovery stopped.'); return result;
    }
    ids.add(object.id);
    if (object.type === 'faultLine' || object.type === 'noShootTarget') continue;
    const validBase = finitePoint(object.position) && Number.isFinite(object.rotation)
      && [object.position.x, object.position.y, object.position.z].every(n => Math.abs(n) <= 1e7);
    if (object.type === 'start') {
      if (validBase && isPointInsideAllowedArea(object.position, stage.stage)) start ??= object.position;
      else warn('INVALID_GEOMETRY', 'Invalid Start Position ignored.');
      continue;
    }
    if (object.type === 'wall') {
      if (!validBase || !object.geometry || ![object.geometry.length, object.geometry.thickness, object.geometry.height].every(n => positive(n) && n <= 1e7)) {
        warn('INVALID_GEOMETRY', 'Invalid wall geometry; discovery stopped rather than ignoring an obstacle.'); return result;
      }
      if (Array.isArray(object.ports) && object.ports.length > config.maxPortsPerWall) {
        limited('Port limit exceeded; discovery stopped rather than omitting wall data.'); return result;
      }
      const ports = Array.isArray(object.ports) ? object.ports.filter(p => p && Number.isFinite(p.offset)
        && positive(p.width) && positive(p.height) && Number.isFinite(p.sill) && p.sill >= 0
        && Math.abs(p.offset) + p.width / 2 <= object.geometry.length / 2
        && p.sill + p.height <= object.geometry.height) : [];
      if (!Array.isArray(object.ports) || ports.length !== object.ports.length) warn('INVALID_GEOMETRY', 'Invalid/missing ports treated as solid wall.');
      if (ports.length) warn('PROJECTED_PORTS', 'Port horizontal openings are projected into 2D; sill, height and muzzle elevation cannot establish actual firing clearance.');
      walls.push({ ...object, ports });
    } else if (isEngageable(object)) {
      result.search.totalScoringTargets++;
      if (!validBase || !object.geometry || !('faceWidth' in object.geometry)
        || ![object.geometry.faceWidth, object.geometry.faceHeight].every(n => positive(n) && n <= 1e7)
        || (object.type === 'cardboardTarget' && !validFaceCut(object.faceCut))
        || object.position.x < 0 || object.position.y < 0 || object.position.x > stage.stage.width || object.position.y > stage.stage.depth) {
        warn('INVALID_GEOMETRY', 'Malformed scoring target skipped; coverage denominator still includes it.'); continue;
      }
      targets.push(object);
    } else { warn('INVALID_GEOMETRY', 'Unsupported object type; discovery stopped.'); return result; }
  }
  targets.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (targets.length > config.maxTargets) { targets.length = config.maxTargets; limited('Target limit reached; coverage uses all scoring targets, including unexamined ones.'); }
  result.search.consideredTargets = targets.length;
  if (!targets.length) { warn('NO_TARGETS', 'No usable scoring targets.'); return result; }
  // Cell centers cover the full stage. Coarsen uniformly when the requested grid is too large.
  let columns = Math.max(1, Math.ceil(stage.stage.width / config.gridSpacingInches));
  let rows = Math.max(1, Math.ceil(stage.stage.depth / config.gridSpacingInches));
  if (columns * rows > config.maxSampledPoints) {
    const factor = Math.sqrt(columns * rows / config.maxSampledPoints);
    columns = Math.max(1, Math.floor(columns / factor)); rows = Math.max(1, Math.floor(rows / factor));
    if (columns * rows > config.maxSampledPoints) {
      if (columns >= rows) columns = Math.max(1, Math.floor(config.maxSampledPoints / rows));
      else rows = Math.max(1, Math.floor(config.maxSampledPoints / columns));
    }
    limited('Sample limit reached; grid coarsened across the full physical stage.');
  }
  const found: DiscoveredPosition[] = [];
  sampling: for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const position: StagePosition = { space: 'stage', x: (column + 0.5) * stage.stage.width / columns,
      y: (row + 0.5) * stage.stage.depth / rows, z: 0 };
    result.search.sampledPoints++;
    if (!isPointInsideAllowedArea(position, stage.stage) || walls.some(w => isPointInsideWall(position, w))) continue;
    // Reserve a whole visibility pass so truncated candidates never report partial visibility as complete.
    if (result.search.losChecks + targets.length > config.maxLOSChecks) { limited('LOS limit reached; retained completed candidates.'); break sampling; }
    result.search.losChecks += targets.length;
    const visibility = computeTargetVisibility(position, targets, walls, result.search.totalScoringTargets);
    if (!visibility.visibleScoringTargetCount) continue;
    found.push({ ...visibility, id: `auto-position-${row}-${column}`, position, source: 'AUTO_DISCOVERED',
      distanceFromStart: start ? distance(start, position) : null, reachability: 'NOT_EVALUATED' });
  }
  result.candidates = deduplicateCandidatePositions(found, config);
  if (result.candidates.length > config.maxDiscoveredPositions) {
    result.candidates.length = config.maxDiscoveredPositions; limited('Discovered-position limit reached; retained strongest representatives.');
  }
  if (!result.candidates.length) warn('NO_USEFUL_POSITIONS', 'No sampled position saw a usable scoring target. Sampling is not exhaustive.');
  return result;
}
