import type { StageRoute } from '../planning/route';

export type RouteLayers = { path: boolean; waypoints: boolean; nodes: boolean; arrows: 'OFF' | 'SELECTED' | 'ALL'; windows: boolean; targetIds: boolean; grid: boolean };
export const defaultRouteLayers: RouteLayers = { path: true, waypoints: true, nodes: true, arrows: 'SELECTED', windows: true, targetIds: false, grid: false };
export const showTargetArrows = (layers: RouteLayers, waypointId: string, selectedId: string | null) =>
  layers.arrows === 'ALL' || layers.arrows === 'SELECTED' && waypointId === selectedId;
/** Rules alone are prerequisites, not a manual path that needs replacement confirmation. */
export const meaningfulRoute = (route?: StageRoute) => !!route && (route.positions.length > 0 || route.reloads.length > 0);
/**
 * Honest target coverage for the route header. "Planned" counts any assignment (waypoint engagements or ENGAGE
 * arrows). "Checked" counts only targets the engagement analysis found a legal engagement for under the configured
 * rules; it is null when no rules are configured, because nothing has been checked.
 */
export function routeTargetCoverage(engageableIds: readonly string[], route: StageRoute | undefined, checkedIds: readonly string[] | undefined) {
  const valid = new Set(engageableIds);
  const planned = new Set([...(route?.positions.flatMap(p => p.engagedTargetIds) ?? []), ...(route?.manualEngagements?.map(e => e.targetId) ?? [])].filter(id => valid.has(id)));
  return { total: valid.size, planned: planned.size, checked: checkedIds ? new Set(checkedIds.filter(id => valid.has(id))).size : null };
}
export const coverageText = (c: ReturnType<typeof routeTargetCoverage>) =>
  `${c.planned}/${c.total} targets planned${c.checked === null ? ' (not checked)' : ` · ${c.checked} pass checks`}`;
