import type { StageDocument } from '../stage/model';
import { isEngageable } from './model';
import type { PlannerContext } from './planner';
import { PLANNER_SEARCH_LIMITS } from './candidateGeneration';
import { createRoute } from './route';
import type { ShootingPosition } from './route';
import { toShootingPosition, isPointInsideAllowedArea } from './positionDiscovery';
import type { DiscoveryResult, DiscoveredPosition } from './positionDiscovery';

export type PositionSource = 'MANUAL' | 'AUTO' | 'COMBINED';
export type DiscoverySession = { geometryKey: string; result: DiscoveryResult };
export type PositionMetadata = { source: 'MANUAL' | 'AUTO_DISCOVERED'; discovery?: DiscoveredPosition };
// Excludes viewport, plan and preferences. Geometry edits invalidate synchronously.
export const discoveryGeometryKey = (stage: StageDocument) => JSON.stringify({ coordinateSystem: stage.coordinateSystem, stage: stage.stage, objects: stage.objects });
export const currentDiscovery = (stage: StageDocument, session: DiscoverySession | null) =>
  session?.geometryKey === discoveryGeometryKey(stage) ? session.result : null;

export function preparePositionSource(context: PlannerContext, mode: PositionSource, session: DiscoverySession | null) {
  const { stage, plan } = context, result = currentDiscovery(stage, session);
  const targets = stage.objects.filter(isEngageable), targetIds = new Set(targets.map(t => t.id));
  const manual = plan.route?.positions ?? [], metadata: Record<string, PositionMetadata> = {};
  const warnings: string[] = [];
  const positions: ShootingPosition[] = mode === 'AUTO' ? [] : [...manual];
  positions.forEach(p => { metadata[p.id] = { source: 'MANUAL' }; });
  const auto = mode === 'MANUAL' ? [] : (result?.candidates ?? []).filter(p =>
    isPointInsideAllowedArea(p.position, stage.stage) && p.visibleTargetIds.some(id => targetIds.has(id)));
  const coveredIds = (pool: ShootingPosition[]) => new Set(pool.flatMap(p => p.visibleTargetIds.filter(id => targetIds.has(id))));
  if (mode !== 'MANUAL') {
    if (!result) warnings.push(session ? 'Discovery is stale. Discover positions again; manual positions remain available.' : 'Discover positions to include automatic candidates.');
    else {
      warnings.push('Coarse discovery: bounded grid sampling may miss useful positions.', ...result.warnings.map(w => w.message));
      if (!auto.length) warnings.push('No useful auto positions found. Combined mode can still search manual positions.');
    }
    const ids = new Set(manual.map(p => p.id));
    const remaining = auto.filter(p => !positions.some(m => {
      const a = new Set(m.visibleTargetIds.filter(id => targetIds.has(id))), b = new Set(p.visibleTargetIds.filter(id => targetIds.has(id)));
      return Math.hypot(m.position.x - p.position.x, m.position.y - p.position.y) <= 6
        && a.size === b.size && [...a].every(id => b.has(id));
    }));
    // Reserve manual positions, then greedily add new coverage. Discovery order breaks ties.
    while (remaining.length && positions.filter(p => p.visibleTargetIds.some(id => targetIds.has(id))).length < PLANNER_SEARCH_LIMITS.maxPositions) {
      const covered = coveredIds(positions);
      remaining.sort((a, b) => b.visibleTargetIds.filter(id => targetIds.has(id) && !covered.has(id)).length
        - a.visibleTargetIds.filter(id => targetIds.has(id) && !covered.has(id)).length);
      const candidate = remaining.shift()!, adapted = toShootingPosition(candidate);
      while (ids.has(adapted.id)) adapted.id = 'auto-' + adapted.id;
      ids.add(adapted.id); positions.push(adapted);
      metadata[adapted.id] = { source: 'AUTO_DISCOVERED', discovery: candidate };
    }
    if (remaining.length) warnings.push('Limited search pool: auto positions were reduced to fit the 12-position limit; manual positions were retained.');
  }
  // Mirror the existing generator's effective pool for accurate readiness only.
  const start = stage.objects.find(o => o.type === 'start')?.position;
  const searchPositions = positions.filter(p => p.visibleTargetIds.some(id => targetIds.has(id))).slice().sort((a, b) =>
    new Set(b.visibleTargetIds.filter(id => targetIds.has(id))).size - new Set(a.visibleTargetIds.filter(id => targetIds.has(id))).size
    || (start ? Math.hypot(a.position.x - start.x, a.position.y - start.y) - Math.hypot(b.position.x - start.x, b.position.y - start.y) : 0)).slice(0, PLANNER_SEARCH_LIMITS.maxPositions);
  const covered = coveredIds(searchPositions).size;
  if (positions.length > PLANNER_SEARCH_LIMITS.maxPositions) warnings.push('Limited search: only 12 positions can be searched. All manual positions remain in your route.');
  if (!targets.length) warnings.push('No scoring targets. Add scoring targets before generating routes.');
  else if (covered < targets.length) warnings.push(`Incomplete coverage: selected search positions cover ${covered} / ${targets.length} scoring targets.`);
  return { context: mode === 'MANUAL' ? context : { ...context, plan: { ...plan, route: { ...createRoute('planner-position-pool'), positions } } },
    metadata, warnings, manualCount: manual.length, autoCount: mode === 'MANUAL' ? (result?.candidates.length ?? 0) : auto.length,
    searchCount: searchPositions.length, covered, targetCount: targets.length, discovery: result };
}
