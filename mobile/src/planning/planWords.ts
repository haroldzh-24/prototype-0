import { SEP } from '../ui/words';

/**
 * PLAN's words added in UI cohesion phase 3 (kept here until they move into ui/words.ts). A .ts file, so StageBuilder
 * can use the same labels for the ••• entries that open these panels.
 */
export const planWords = {
  /** The older movement optimizer (AutoPlannerPanel), under PLAN's •••. */
  olderOptimizer: `Older optimizer${SEP}an alternative to AUTO-PLAN`,
  /** Ask (RouteAISheet), under PLAN's •••. */
  ask: `Ask${SEP}an alternative to AUTO-PLAN: ask about the route or propose a change, and the app computes it`,
  /** PLAN's checklist lines. */
  checklist: { areas: 'Shooting areas', route: 'Route', targets: 'Targets and reloads' },
  /** "Engaged from" in the target sheet. */
  engagedFrom: 'Engaged from', notEngaged: 'Not engaged',
  /** Above Ask and the older optimizer in PLAN's •••. */
  alternatives: 'Alternatives to AUTO-PLAN',
  /** ROUTE's way to draw the route yourself (the PATH tool). */
  drawByHand: 'DRAW BY HAND',
  /** The undo bar after Reset route ("Route reset · UNDO"). */
  routeReset: 'Route reset',
} as const;
