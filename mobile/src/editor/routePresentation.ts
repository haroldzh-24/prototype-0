import type { StageRoute } from '../planning/route';

export type RouteLayers = { path: boolean; waypoints: boolean; nodes: boolean; arrows: 'OFF' | 'SELECTED' | 'ALL'; windows: boolean; targetIds: boolean; grid: boolean };
export const defaultRouteLayers: RouteLayers = { path: true, waypoints: true, nodes: true, arrows: 'SELECTED', windows: true, targetIds: false, grid: false };
export const showTargetArrows = (layers: RouteLayers, waypointId: string, selectedId: string | null) =>
  layers.arrows === 'ALL' || layers.arrows === 'SELECTED' && waypointId === selectedId;
/** Rules alone are prerequisites, not a manual path that needs replacement confirmation. */
export const meaningfulRoute = (route?: StageRoute) => !!route && (route.positions.length > 0 || route.reloads.length > 0);
