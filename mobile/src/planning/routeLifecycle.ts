/**
 * Route lifecycle for PLAN (UI cohesion plan, phase 3).
 * - Opening PLAN shows an empty draft route without putting it in the plan; the route is created by the first edit,
 *   so opening PLAN no longer marks the stage unsaved.
 * - Reset route clears the route but keeps the shooting areas and the other route rules.
 */
import { createRoute } from './route';
import type { StageRoute } from './route';
import type { StagePlan } from './model';

/** Nothing the user made: no positions, reloads, drawn path, arrows or route rules. */
export const isUntouchedRoute = (route: StageRoute) => !route.positions.length && !route.reloads.length && !route.connections?.length
  && !route.manualEngagements?.length && !route.engagementRules;

/** The route PLAN shows: the saved one, or an empty draft (not part of the plan until `commitRoute` gets an edit). */
export function routeForPlan(plan: Pick<StagePlan, 'route'>, draftId: string): StageRoute {
  return plan.route ?? createRoute(draftId);
}

/**
 * Puts an edited route into the plan. While the plan has no route, a route that is still untouched (an empty draft, or
 * an edit that changed nothing) leaves the plan as it is, so nothing is marked unsaved; the first real edit creates it.
 * A saved route is always replaced, even by an empty one (deleting the last position is an edit).
 */
export function commitRoute(plan: StagePlan, route: StageRoute): StagePlan {
  if (!plan.route && isUntouchedRoute(route)) return plan;
  return plan.route === route ? plan : { ...plan, route };
}

/**
 * Reset route: a new empty route that keeps the route rules (shooting areas, safe direction, ruleset, procedures).
 * Positions, reloads, the drawn path and any saved arrows go; undo brings them back.
 */
export function resetRouteKeepingAreas(route: StageRoute | undefined, id: string): StageRoute {
  const fresh = createRoute(id);
  return route?.engagementRules ? { ...fresh, engagementRules: JSON.parse(JSON.stringify(route.engagementRules)) } : fresh;
}
