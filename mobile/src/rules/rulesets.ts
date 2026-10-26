import type { TargetFamily } from '../stage/targetFamily';

/**
 * IDPA rules are on hold (owner decision, 2026-10-26). IDPA targets stay available in the stage builder, but no IDPA
 * rule is applied: new matches are USPSA or PCSL, and an existing IDPA match is planned and checked with USPSA rules.
 * The IDPA rule code is kept; set this to true to bring it back.
 */
export const IDPA_RULES_ENABLED = false;

/** Match types offered when creating a match. */
export const matchFamilies: readonly TargetFamily[] = IDPA_RULES_ENABLED ? ['USPSA', 'PCSL', 'IDPA'] : ['USPSA', 'PCSL'];

/** The rules actually applied for a match family or a route's ruleset. */
export function activeRuleset<R extends TargetFamily | undefined>(ruleset: R): R | 'USPSA' {
  return ruleset === 'IDPA' && !IDPA_RULES_ENABLED ? 'USPSA' : ruleset;
}

/** True when a match or route asks for IDPA rules that are on hold. */
export const idpaOnHold = (ruleset: TargetFamily | undefined) => ruleset === 'IDPA' && !IDPA_RULES_ENABLED;

export const IDPA_ON_HOLD_NOTE = 'IDPA rules are on hold: this match is planned and checked with USPSA rules.';
