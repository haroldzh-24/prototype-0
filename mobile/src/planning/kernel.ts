/**
 * Shared planning geometry: the one place to import these rules from, so the planner, the legality analysis, the
 * timing evaluator and the route assistant agree.
 *
 * - Shooting-position membership: `strictlyInside` (boundary counts as outside, so a stop never sits on a fault line).
 * - Travel membership: `insideForTravel` (boundary counts as inside).
 * - Walking path of a route leg, bends included: `routeLegPoints`, measured with `pathLength`.
 * - Line of sight: `planLineOfSight` (V2: walls with ports and the 69 in low-wall rule, other target faces and no-shoots
 *   per ruleset). `hasLineOfSight` is the older wall-and-port check to a single point, still used by the manual analysis.
 * - Headings: `headingTo`, `headingDelta` (degrees, stage plane: 0 = +X, 90 = +Y/down the screen).
 */
export { strictlyInside, inside as insideForTravel, nudgeInside } from './routeSolver/traversability';
export { connectionPoints as routeLegPoints, pathLength } from './routeGeometry';
export { hasLineOfSight } from './positionDiscovery';
export { sightLine as planLineOfSight, checkEngagement, headingTo, headingDelta, LOW_WALL_LIMIT_INCHES } from './v2/coverage';
export { stageDownrange } from '../stage/orientation';
