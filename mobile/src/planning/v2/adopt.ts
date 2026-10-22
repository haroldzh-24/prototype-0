import type { StageDocument } from '../../stage/model';
import type { StagePlan } from '../model';
import type { StageRoute } from '../route';
import type { RouteConnection } from '../routeGeometry';
import type { RoutePlan, StageSnapshot } from './types';

/** Snapshot of the current stage and route settings for planRoute. */
export function snapshotFromPlan(stage: StageDocument, plan: StagePlan): StageSnapshot {
  const rules = plan.route?.engagementRules;
  return { stage, firingAreas: rules?.firingAreas ?? [], targetProcedures: rules?.targetProcedures ?? {}, ruleset: rules?.ruleset };
}

/**
 * Turns a plan into an ordinary editable route. Each stop becomes a waypoint with its assigned engagements in order;
 * walking detours around walls become bends, so the evaluator and engagement analysis follow the same path.
 * Engagement rules are carried over so the existing legality analysis can re-check the result.
 */
export function planToStageRoute(plan: RoutePlan, stage: StageDocument, current: StagePlan): StageRoute {
  const startId = stage.objects.find(o => o.type === 'start')?.id ?? 'start';
  const positions = plan.positions.map((p, i) => ({
    id: p.id, label: `P${i + 1}`, position: { space: 'stage' as const, x: p.point.x, y: p.point.y, z: 0 },
    visibleTargetIds: [...p.engageableTargetIds], engagedTargetIds: p.engagements.map(e => e.targetId),
  }));
  const connections: RouteConnection[] = plan.legs.flatMap((leg, i) => leg.length > 2 ? [{
    fromId: i === 0 ? startId : positions[i - 1].id, toId: positions[i].id, style: 'STRAIGHT' as const,
    bends: leg.slice(1, -1).map((b, j) => ({ id: `${positions[i].id}-bend-${j + 1}`, position: { space: 'stage' as const, x: b.x, y: b.y, z: 0 } })),
  }] : []);
  return {
    version: 1, id: 'route-v2', name: 'Planned route', positions, reloads: [],
    ...(connections.length ? { connections } : {}),
    ...(current.route?.engagementRules ? { engagementRules: JSON.parse(JSON.stringify(current.route.engagementRules)) } : {}),
  };
}
