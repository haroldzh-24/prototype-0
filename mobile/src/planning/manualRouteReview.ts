import type { StageDocument, StageObject } from '../stage/model';
import type { StagePosition } from '../stage/coordinates';
import type { StageRoute } from './route';
import type { ManualEngagement } from './manualEngagements';
import { manualEngagementLabel, resolveAnchor, routeSections } from './manualEngagements';
import { pathLength } from './routeGeometry';
import { isEngageable } from './model';

export type ReviewedEngagement = { engagement: ManualEngagement; position: StagePosition | null; source: string; issues: string[] };
export type ReviewedTarget = { target: StageObject; assigned: boolean; engagements: ReviewedEngagement[] };
export type ManualRouteReview = {
  targets: ReviewedTarget[]; engagements: ReviewedEngagement[]; invalid: ReviewedEngagement[];
  totalTargets: number; assignedTargets: number; unassignedTargets: number;
  waypoints: number; distance: number; waypointEngagements: number; routeEngagements: number;
};
/** Inspection of saved manual references only. Coverage is neither visibility nor feasibility. */
export function reviewManualRoute(stage: StageDocument, route?: StageRoute): ManualRouteReview {
  const objects = new Map(stage.objects.map(o => [o.id, o]));
  const targets: ReviewedTarget[] = [...objects.values()].filter(isEngageable).map(target => ({ target, assigned: false, engagements: [] }));
  const byId = new Map(targets.map(t => [t.target.id, t]));
  const sections = route ? routeSections(stage, route) : [];
  const engagements = (route?.manualEngagements ?? []).map(engagement => {
    const target = objects.get(engagement.targetId), issues: string[] = [];
    if (!target) issues.push('Missing target');
    else if (!isEngageable(target)) issues.push('Non-engagement target or prop');
    const position = route ? resolveAnchor(stage, route, engagement.anchor, sections) : null;
    if (!position || ![position.x, position.y].every(Number.isFinite)) issues.push('Missing or invalid route anchor');
    const anchor = engagement.anchor;
    const index = anchor?.kind === 'waypoint' ? route?.positions.findIndex(p => p.id === anchor.waypointId) ?? -1 : -1;
    const source = anchor?.kind === 'waypoint'
      ? index >= 0 ? `Waypoint ${index + 1} / ${manualEngagementLabel(route!, engagement)}` : `Missing waypoint ${anchor.waypointId}`
      : anchor?.kind === 'section' ? `Route engagement (${Math.round(anchor.fraction * 100)}% along section)` : 'Missing route anchor';
    const entry = { engagement, position: issues.includes('Missing or invalid route anchor') ? null : position, source, issues };
    const reviewedTarget = byId.get(engagement.targetId);
    if (reviewedTarget) { reviewedTarget.engagements.push(entry); if (!issues.length) reviewedTarget.assigned = true; }
    return entry;
  });
  const assignedTargets = targets.filter(t => t.assigned).length;
  return { targets, engagements, invalid: engagements.filter(e => e.issues.length), totalTargets: targets.length, assignedTargets,
    unassignedTargets: targets.length - assignedTargets, waypoints: route?.positions.length ?? 0,
    distance: sections.reduce((sum, s) => sum + pathLength(s.points), 0),
    waypointEngagements: engagements.filter(e => e.engagement.anchor?.kind === 'waypoint').length,
    routeEngagements: engagements.filter(e => e.engagement.anchor?.kind === 'section').length };
}
