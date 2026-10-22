/**
 * Shared planning geometry: the one place to import these rules from, so the planner, the legality analysis, the
 * timing evaluator and the route assistant agree.
 *
 * - Shooting-position membership: `strictlyInside` (boundary counts as outside, so a stop never sits on a fault line).
 * - Travel membership: `insideForTravel` (boundary counts as inside).
 * - Walking path of a route leg, bends included: `routeLegPoints`, measured with `pathLength`.
 * - Legality of one engagement: `checkEngagement` (allowed area, whole sampled face inside the safe arc, line of sight).
 *   Used by Route Planner V2 and by the manual engagement analysis.
 * - Line of sight: `planLineOfSight` (walls with ports and the 69 in low-wall rule, other target faces and no-shoots
 *   per ruleset). `hasLineOfSight` is the older wall-and-port check to a single point, kept for position discovery.
 * - Headings: `headingTo`, `headingDelta` (degrees, stage plane: 0 = +X, 90 = +Y/down the screen).
 */
export { strictlyInside, inside as insideForTravel, nudgeInside } from './routeSolver/traversability';
export { connectionPoints as routeLegPoints, pathLength } from './routeGeometry';
export { hasLineOfSight } from './positionDiscovery';
export { sightLine as planLineOfSight, checkEngagement, headingTo, headingDelta, LOW_WALL_LIMIT_INCHES } from './v2/coverage';
export { stageDownrange } from '../stage/orientation';
