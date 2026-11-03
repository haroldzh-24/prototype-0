/**
 * Planning defaults (UI cohesion plan, phase 3), so ANALYZE works before the target rounds and loadout sheets are
 * opened. Your own values always win; a default is never written into the plan by reading it, so opening PLAN or
 * ANALYZE does not change the stage.
 *
 * - Rounds: the rule's required hits per target type (rules/stageCheck.ts minimumRounds uses the same numbers).
 * - Loadout: the magazine fields stored in your profile (capacity, rounds loaded, chamber).
 * - AUTO-PLAN: standing only, because ANALYZE cannot time shots on the move yet.
 */
import type { StageDocument, StageObject } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { isEngageable } from './model';
import type { Magazine, StagePlan } from './model';

/**
 * Hits required per target unless the stage brief says otherwise: paper 2, steel 1 (USPSA 9.5.1, PCSL 11.3.1;
 * docs/rules/uspsa.md, docs/rules/pcsl.md). IDPA rules are on hold and its matches use USPSA's. No-shoots take none.
 */
export const REQUIRED_HITS = { cardboardTarget: 2, steelPlate: 1, steelPopper: 1 } as const;
export const REQUIRED_HITS_SOURCE = 'USPSA 9.5.1, PCSL 11.3.1';
export function defaultRounds(type: StageObject['type']): number {
  return (REQUIRED_HITS as Record<string, number>)[type] ?? 0;
}
/** True when you set this target's rounds yourself (0 included). */
export const ownRounds = (plan: Pick<StagePlan, 'engagements'>, id: string) => Object.hasOwn(plan.engagements, id) && Number.isSafeInteger(plan.engagements[id]);
/** Rounds planned for a target and where the number comes from. */
export function plannedRounds(plan: Pick<StagePlan, 'engagements'>, target: Pick<StageObject, 'id' | 'type'>): { rounds: number; source: 'yours' | 'rule' } {
  return ownRounds(plan, target.id) ? { rounds: plan.engagements[target.id], source: 'yours' } : { rounds: defaultRounds(target.type), source: 'rule' };
}
/** "2 rounds · rule default (2 hits per paper target, USPSA 9.5.1, PCSL 11.3.1)" or "3 rounds · yours". */
export function roundsSourceText(plan: Pick<StagePlan, 'engagements'>, target: Pick<StageObject, 'id' | 'type'>): string {
  const { rounds, source } = plannedRounds(plan, target), steel = target.type !== 'cardboardTarget';
  return `${rounds} round${rounds === 1 ? '' : 's'} · ` + (source === 'yours' ? 'your number'
    : `rule default (${defaultRounds(target.type)} hit${steel ? '' : 's'} per ${steel ? 'steel target' : 'paper target'}, ${REQUIRED_HITS_SOURCE})`);
}
/** The plan with every target's rounds filled in: yours where set, the rule default elsewhere. */
export function withRoundDefaults(plan: StagePlan, stage: Pick<StageDocument, 'objects'>): StagePlan {
  const missing = stage.objects.filter(o => isEngageable(o) && !ownRounds(plan, o.id));
  return missing.length ? { ...plan, engagements: { ...plan.engagements, ...Object.fromEntries(missing.map(o => [o.id, defaultRounds(o.type)])) } } : plan;
}

/** Ids of the magazines a profile loadout makes; stable, so a reload planned against them still points at them. */
export const profileMagazineId = (n: number) => `magazine-profile-${n}`;
/**
 * A loadout from the magazine fields in your profile: the first magazine in the gun, plus as many spares loaded the
 * same way as the stage's planned rounds need (none when the first holds them). Null when the profile has no usable
 * magazine numbers.
 */
export function profileLoadout(profile: Pick<ShooterPerformanceProfile, 'magazineCapacity' | 'startingRounds' | 'chamberedRound'> | null, plannedTotal: number, chamberLoaded = false): { loadout: StagePlan['loadout']; note: string } | null {
  if (!profile) return null;
  const { magazineCapacity: capacity, startingRounds: loaded } = profile;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || !Number.isSafeInteger(loaded) || loaded < 1 || loaded > capacity || capacity > 1000) return null;
  const chamber = chamberLoaded || profile.chamberedRound === true;
  const spares = Math.min(99, Math.max(0, Math.ceil((Math.max(0, plannedTotal) - loaded - (chamber ? 1 : 0)) / loaded)));
  const magazines: Magazine[] = Array.from({ length: spares + 1 }, (_, i) => ({ id: profileMagazineId(i + 1), capacity, startingRounds: loaded }));
  const note = `Loadout from your profile: ${capacity}-round magazines loaded with ${loaded}, chamber ${chamber ? 'loaded' : 'empty'}; `
    + (spares ? `${spares} spare${spares === 1 ? '' : 's'}, enough for the ${plannedTotal} planned rounds.` : 'no spares needed.')
    + ' Set your own in Loadout.';
  return { loadout: { chamberLoaded: chamber, startingMagazineId: magazines[0].id, magazines }, note };
}

export type PlanWithDefaults = {
  /** The plan ANALYZE, the checklist and the target sheet read. */
  plan: StagePlan;
  /** Targets whose rounds are the rule default. */
  defaultRoundIds: string[];
  /** Set when the loadout comes from the profile (no magazines of your own yet): where it came from. */
  loadoutNote: string | null;
};
/** Fills what you have not set: rounds by target type, and the loadout from your profile when you have no magazines. */
export function withPlanDefaults(stage: Pick<StageDocument, 'objects'>, plan: StagePlan, profile: Pick<ShooterPerformanceProfile, 'magazineCapacity' | 'startingRounds' | 'chamberedRound'> | null): PlanWithDefaults {
  const defaultRoundIds = stage.objects.filter(o => isEngageable(o) && !ownRounds(plan, o.id)).map(o => o.id);
  let next = withRoundDefaults(plan, stage), loadoutNote: string | null = null;
  if (!plan.loadout.magazines.length) {
    const total = stage.objects.filter(isEngageable).reduce((sum, o) => sum + Math.max(0, next.engagements[o.id] ?? 0), 0);
    const profiled = profileLoadout(profile, total, plan.loadout.chamberLoaded);
    if (profiled) { next = { ...next, loadout: profiled.loadout }; loadoutNote = profiled.note; }
  }
  return { plan: next, defaultRoundIds, loadoutNote };
}

/**
 * Whether ANALYZE can time shots on the move. It cannot: evaluateRoute gives no timing for a route with any engagement
 * on the move (its "geometry-only" warning), whatever the profile holds. Shoot on the move runs are logged (YOUR
 * NUMBERS) but kept out of the planning numbers (training/observations.ts generalSample) and no moving-split model
 * exists. So AUTO-PLAN starts on STANDING ONLY. tests/planningPhase3.test.cjs fails if evaluateRoute starts timing
 * moving routes, as a reminder to revisit this.
 */
export const MOVING_SHOTS_TIMED = false;
export type AutoPlanMode = 'STANDING ONLY' | 'ON THE MOVE';
export const autoPlanDefault = (): AutoPlanMode => MOVING_SHOTS_TIMED ? 'ON THE MOVE' : 'STANDING ONLY';
/** What choosing ON THE MOVE costs, as the code behaves today. */
export const ON_THE_MOVE_COST = 'ON THE MOVE can need fewer positions, but ANALYZE can\'t time shots on the move yet: '
  + 'a route with them gets no total time and no hit factor. PLAN RELOADS won\'t put a reload on a leg you shoot on the move.';
