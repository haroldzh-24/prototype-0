import type { StageDocument, StageObject } from '../stage/model';

export type Magazine = Readonly<{ id: string; label?: string; capacity: number; startingRounds: number }>;
/** Shooter-specific initial conditions, not physical stage data or a runtime magazine simulation. */
export type StagePlan = {
  loadout: { chamberLoaded: boolean; startingMagazineId: string | null; magazines: readonly Magazine[] };
  engagements: Readonly<Record<string, number>>;
};
export const createPlan = (): StagePlan => ({ loadout: { chamberLoaded: false, startingMagazineId: null, magazines: [] }, engagements: {} });
export const createMagazineId = (randomUUID: () => string) => 'magazine-' + randomUUID();
export const isEngageable = (object: StageObject) => ['cardboardTarget', 'steelPlate', 'steelPopper'].includes(object.type);
export type PlanResult = { plan: StagePlan; error?: string };
const count = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** All magazines are carried; startingMagazineId identifies the one initially inserted. */
export function saveMagazine(plan: StagePlan, magazine: Magazine, creating = false): PlanResult {
  const exists = plan.loadout.magazines.some(m => m.id === magazine.id);
  if (!magazine.id.trim() || (creating ? exists : !exists)) return { plan, error: 'Magazine ID must identify the intended magazine uniquely.' };
  if (!count(magazine.capacity) || magazine.capacity === 0 || !count(magazine.startingRounds) || magazine.startingRounds > magazine.capacity)
    return { plan, error: 'Use whole rounds: capacity must be positive and loaded rounds between zero and capacity.' };
  const magazines = creating ? [...plan.loadout.magazines, { ...magazine }] : plan.loadout.magazines.map(m => m.id === magazine.id ? { ...magazine } : m);
  if (!Number.isSafeInteger(magazines.reduce((n,m) => n+m.startingRounds,1))) return { plan, error: 'Ammunition total is too large.' };
  return { plan: { ...plan, loadout: { ...plan.loadout, magazines } } };
}
export function deleteMagazine(plan: StagePlan, id: string): StagePlan {
  return { ...plan, loadout: { ...plan.loadout, magazines: plan.loadout.magazines.filter(m => m.id !== id),
    startingMagazineId: plan.loadout.startingMagazineId === id ? null : plan.loadout.startingMagazineId } };
}
export function designateMagazine(plan: StagePlan, id: string | null): PlanResult {
  if (id !== null && !plan.loadout.magazines.some(m => m.id === id)) return { plan, error: 'Starting magazine does not exist.' };
  return { plan: { ...plan, loadout: { ...plan.loadout, startingMagazineId: id } } };
}
export function setChamber(plan: StagePlan, chamberLoaded: boolean): StagePlan {
  return { ...plan, loadout: { ...plan.loadout, chamberLoaded } };
}
export function assignRounds(plan: StagePlan, stage: StageDocument, id: string, rounds: number): PlanResult {
  const object = stage.objects.find(o => o.id === id);
  if (!object || !isEngageable(object)) return { plan, error: 'Choose an existing scoring target or steel object.' };
  if (!count(rounds)) return { plan, error: 'Planned rounds must be a nonnegative whole number.' };
  const engagements = { ...plan.engagements, [id]: rounds };
  if (!Number.isSafeInteger(Object.values(engagements).reduce((n,r) => n+r,0))) return { plan, error: 'Planned total is too large.' };
  return { plan: { ...plan, engagements } };
}
/** Deleted/unsupported references cannot consume ammunition or reappear after Reset. */
export function reconcilePlan(plan: StagePlan, stage: StageDocument): StagePlan {
  const valid = new Set(stage.objects.filter(isEngageable).map(o => o.id));
  const entries = Object.entries(plan.engagements).filter(([id]) => valid.has(id));
  return entries.length === Object.keys(plan.engagements).length ? plan : { ...plan, engagements: Object.fromEntries(entries) };
}
export function ammunitionSummary(plan: StagePlan, stage: StageDocument) {
  const totalAvailable = plan.loadout.magazines.reduce((n,m) => n+m.startingRounds, plan.loadout.chamberLoaded ? 1 : 0);
  const totalPlanned = Object.values(reconcilePlan(plan,stage).engagements).reduce((n,r) => n+r,0);
  return { totalAvailable, totalPlanned, reserve: totalAvailable-totalPlanned, insufficient: totalPlanned > totalAvailable };
}
