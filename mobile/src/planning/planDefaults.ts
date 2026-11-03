/**
 * Planning defaults (UI cohesion plan, phase 3), so ANALYZE works before the target rounds and loadout sheets are
 * opened. Your own values always win; a default is never written into the plan by reading it, so opening PLAN or
 * ANALYZE does not change the stage.
 *
 * - Rounds: the rule's required hits per target type (rules/stageCheck.ts minimumRounds uses the same numbers).
 * - Loadout: a default loadout read from the profile's magazine fields (capacity, rounds loaded, chamber). Nothing in
 *   the app sets those fields yet (they are always createLocalProfile's 15 / 15 / empty), so the note calls it the
 *   default loadout, not "your profile"; a future Profile setting changes the numbers without changing this code.
 * - AUTO-PLAN: standing only, because ANALYZE cannot time shots on the move yet.
 */
import type { StageDocument, StageObject } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import { isEngageable } from './model';
import type { Magazine, StagePlan } from './model';
import type { StageRoute } from './route';

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

/** Rounds each position fires, each target counted once where the route first engages it (as evaluateRoute counts). */
export function roundsByPosition(stage: Pick<StageDocument, 'objects'>, plan: Pick<StagePlan, 'engagements'>, route: Pick<StageRoute, 'positions'>): number[] {
  const valid = new Set(stage.objects.filter(isEngageable).map(o => o.id)), seen = new Set<string>();
  return route.positions.map(p => p.engagedTargetIds.reduce((sum, id) => {
    if (!valid.has(id) || seen.has(id)) return sum;
    seen.add(id); const r = plan.engagements[id];
    return Number.isSafeInteger(r) && r > 0 ? sum + r : sum;
  }, 0));
}
/**
 * What one position needs from the magazines: its rounds, and whether PLAN RELOADS may add a reload into it ('free'),
 * never does ('moving': it is shot on the move), or the route already has one there ('planned').
 */
export type PositionNeed = { rounds: number; reload: 'free' | 'moving' | 'planned' };
export function positionNeeds(stage: Pick<StageDocument, 'objects'>, plan: Pick<StagePlan, 'engagements'>, route: Pick<StageRoute, 'positions' | 'reloads'>): PositionNeed[] {
  const rounds = roundsByPosition(stage, plan, route);
  return route.positions.map((p, i) => ({ rounds: rounds[i],
    reload: route.reloads.some(r => r.positionId === p.id) ? 'planned' : p.movingTargetIds?.length ? 'moving' : 'free' }));
}
/**
 * The fewest spare magazines, each loaded with `loaded` rounds, that carry the route by the evaluator's ammunition rules
 * (route.ts evaluateRoute, the rules reloadPlan.ts planReloads searches with): at most one reload per position, done
 * before it fires; a reload drops what is left in the magazine but keeps one round chambered; no reload is added at a
 * position shot on the move; a reload already planned uses a spare. Null when no number of spares can (a position needs
 * more rounds than one magazine and the chamber hold).
 */
export function sparesNeeded(needs: readonly PositionNeed[], loaded: number, chamberLoaded: boolean): number | null {
  const memo = new Map<string, number>();
  const solve = (i: number, left: number, chamber: number): number => {
    if (i === needs.length) return 0;
    const key = `${i}|${left}|${chamber}`, known = memo.get(key);
    if (known !== undefined) return known;
    const need = needs[i];
    const fire = (available: number, reloads: number) => {
      if (need.rounds > available) return Infinity;
      const remaining = available - need.rounds, chambered = Math.min(1, remaining);
      return reloads + solve(i + 1, remaining - chambered, chambered);
    };
    // A reload keeps a chambered round when there was one, or when the dropped magazine still had rounds.
    const reloaded = loaded + (chamber || left > 0 ? 1 : 0);
    const best = need.reload === 'planned' ? fire(reloaded, 1)
      : Math.min(fire(left + chamber, 0), need.reload === 'free' ? fire(reloaded, 1) : Infinity);
    memo.set(key, best);
    return best;
  };
  const best = solve(0, loaded, chamberLoaded ? 1 : 0);
  return Number.isFinite(best) ? best : null;
}
/**
 * The default loadout, from the magazine fields in the profile: the first magazine in the gun, plus as many spares
 * loaded the same way as the stage needs. With the route's positions (`needs`), that is the fewest spares PLAN RELOADS
 * can carry every position with (rounds left in a dropped magazine are lost; one reload per position); never fewer
 * than the planned total needs. When no number of spares can carry a position (it needs more than one magazine), one
 * spare per position, and PLAN RELOADS names the position to split. Null when the profile has no usable numbers.
 */
export function profileLoadout(profile: Pick<ShooterPerformanceProfile, 'magazineCapacity' | 'startingRounds' | 'chamberedRound'> | null, plannedTotal: number, chamberLoaded = false,
  needs?: readonly PositionNeed[]): { loadout: StagePlan['loadout']; note: string } | null {
  if (!profile) return null;
  const { magazineCapacity: capacity, startingRounds: loaded } = profile;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || !Number.isSafeInteger(loaded) || loaded < 1 || loaded > capacity || capacity > 1000) return null;
  const chamber = chamberLoaded || profile.chamberedRound === true;
  const byTotal = Math.max(0, Math.ceil((Math.max(0, plannedTotal) - loaded - (chamber ? 1 : 0)) / loaded));
  const byRoute = needs?.length ? sparesNeeded(needs, loaded, chamber) ?? needs.length : 0;
  const spares = Math.min(99, Math.max(byTotal, byRoute));
  const magazines: Magazine[] = Array.from({ length: spares + 1 }, (_, i) => ({ id: profileMagazineId(i + 1), capacity, startingRounds: loaded }));
  // Rule 7: the numbers say where they come from. They are a default (nothing sets the profile fields yet), not yours.
  const note = `Default loadout: ${capacity}-round magazines, ${loaded} to start, chamber ${chamber ? 'loaded' : 'empty'}, `
    + (spares ? `${spares} spare${spares === 1 ? '' : 's'}.` : 'no spares.') + ` Add your magazines in ${LOADOUT_PATH}.`;
  return { loadout: { chamberLoaded: chamber, startingMagazineId: magazines[0].id, magazines }, note };
}
/** Where your own magazines are added: PLAN's ••• (Plan settings) → LOADOUT. */
export const LOADOUT_PATH = 'PLAN ••• → LOADOUT';

export type PlanWithDefaults = {
  /** The plan ANALYZE, the checklist and the target sheet read. */
  plan: StagePlan;
  /** Targets whose rounds are the rule default. */
  defaultRoundIds: string[];
  /** Set when the loadout is the default (no magazines of your own yet): what it is and where to add your own. */
  loadoutNote: string | null;
};
/**
 * Fills what you have not set: rounds by target type, and the default loadout when you have no magazines (with spares
 * for the plan's route, so PLAN RELOADS can carry it).
 */
export function withPlanDefaults(stage: Pick<StageDocument, 'objects'>, plan: StagePlan, profile: Pick<ShooterPerformanceProfile, 'magazineCapacity' | 'startingRounds' | 'chamberedRound'> | null): PlanWithDefaults {
  const defaultRoundIds = stage.objects.filter(o => isEngageable(o) && !ownRounds(plan, o.id)).map(o => o.id);
  let next = withRoundDefaults(plan, stage), loadoutNote: string | null = null;
  if (!plan.loadout.magazines.length) {
    const total = stage.objects.filter(isEngageable).reduce((sum, o) => sum + Math.max(0, next.engagements[o.id] ?? 0), 0);
    const needs = plan.route?.positions.length ? positionNeeds(stage, next, plan.route) : undefined;
    const profiled = profileLoadout(profile, total, plan.loadout.chamberLoaded, needs);
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
