import type { StageDocument, StageObject } from '../stage/model';
import type { StageRoute } from './route';

export type Magazine = Readonly<{ id: string; label?: string; capacity: number; startingRounds: number }>;
/** Shooter-specific loadout, target round counts and optional manual route; separate from physical geometry. */
export type StagePlan = {
  route?: StageRoute;
  loadout: { chamberLoaded: boolean; startingMagazineId: string | null; magazines: readonly Magazine[] };
  engagements: Readonly<Record<string, number>>;
};
export const createPlan = (): StagePlan => ({ loadout: { chamberLoaded: false, startingMagazineId: null, magazines: [] }, engagements: {} });
export const createMagazineId = (randomUUID: () => string) => 'magazine-' + randomUUID();
export const isEngageable = (object: StageObject) => ['cardboardTarget', 'steelPlate', 'steelPopper'].includes(object.type);
export const scoringTypes = ['cardboardTarget', 'steelPlate', 'steelPopper'] as const;
export type ScoringType = typeof scoringTypes[number];
export const targetTypeLabel = (type: ScoringType) => ({ cardboardTarget: 'Cardboard', steelPlate: 'Steel', steelPopper: 'Popper' })[type];
export function targetLabel(stage: StageDocument, id: string): string {
  const target = stage.objects.find(o => o.id === id);
  if (!target || !isEngageable(target)) return 'Missing scoring target';
  return `${targetTypeLabel(target.type as ScoringType)} ${stage.objects.filter(o => o.type === target.type).findIndex(o => o.id === id) + 1}`;
}
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
/** Append ordinary magazines atomically; the batch creates no lasting relationship. */
export function addMagazineBatch(plan: StagePlan, quantity: number, capacity: number, startingRounds: number, startInserted: boolean, randomUUID: () => string): PlanResult {
  if (!count(quantity) || quantity < 1 || quantity > 100) return { plan, error: 'Quantity must be a whole number from 1 to 100.' };
  let next = plan;
  let firstId = '';
  for (let index = 0; index < quantity; index++) {
    const id = createMagazineId(randomUUID);
    const result = saveMagazine(next, { id, capacity, startingRounds }, true);
    if (result.error) return { plan, error: result.error };
    next = result.plan;
    if (index === 0) firstId = id;
  }
  return startInserted ? designateMagazine(next, firstId) : { plan: next };
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
  const staleRoute = plan.route?.positions.some(p => [...p.visibleTargetIds, ...p.engagedTargetIds].some(id => !valid.has(id)));
  if (entries.length === Object.keys(plan.engagements).length && !staleRoute) return plan;
  return { ...plan, engagements: Object.fromEntries(entries), ...(staleRoute && plan.route ? { route: { ...plan.route, positions: plan.route.positions.map(p => ({ ...p, visibleTargetIds: p.visibleTargetIds.filter(id => valid.has(id)), engagedTargetIds: p.engagedTargetIds.filter(id => valid.has(id)) })) } } : {}) };
}
/** One-time atomic batch; individual assignments remain independent. */
export function assignRoundsByType(plan: StagePlan, stage: StageDocument, type: ScoringType, rounds: number): PlanResult {
  if (!scoringTypes.includes(type) || !count(rounds)) return { plan, error: 'Choose a scoring type and nonnegative whole rounds.' };
  const engagements = { ...plan.engagements };
  for (const target of stage.objects.filter(o => o.type === type && isEngageable(o))) engagements[target.id] = rounds;
  if (!Number.isSafeInteger(Object.values(engagements).reduce((n, r) => n + r, 0))) return { plan, error: 'Planned total is too large.' };
  return { plan: { ...plan, engagements } };
}
export function ammunitionSummary(plan: StagePlan, stage: StageDocument) {
  const totalAvailable = plan.loadout.magazines.reduce((n,m) => n+m.startingRounds, plan.loadout.chamberLoaded ? 1 : 0);
  const totalPlanned = Object.values(reconcilePlan(plan,stage).engagements).reduce((n,r) => n+r,0);
  return { totalAvailable, totalPlanned, reserve: totalAvailable-totalPlanned, insufficient: totalPlanned > totalAvailable };
}
