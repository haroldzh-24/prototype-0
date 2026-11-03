import { objectLabel } from '../stage/model';
import type { Calibration, Proposal, Reconstruction } from './model';
import { backdropOf } from './model';

/** The import screen's three steps, its words, and what closing it does. No React here, so it is unit-tested directly. */
export type ImportStep = 'photo' | 'corners' | 'scale';
export const STEP_ORDER: readonly ImportStep[] = ['photo', 'corners', 'scale'];
export const STEP_NAMES: Record<ImportStep, string> = { photo: 'Photo', corners: 'Corners', scale: 'Scale' };

/** Which steps have their result: a page image, an aligned layout, a confirmed scale. */
export const stepsDone = (d: Reconstruction | null): [boolean, boolean, boolean] => [!!d?.page, !!d?.aligned, !!d?.calibration];

/** "1 PHOTO ✓ · 2 CORNERS · 3 SCALE" as parts, so the current one can be emphasised. */
export const stepParts = (done: readonly boolean[]) => STEP_ORDER.map((s, i) => `${i + 1} ${STEP_NAMES[s].toUpperCase()}${done[i] ? ' ✓' : ''}`);

const sentence = (s: string) => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
export function proposalTypeLabel(type: Proposal['type']): string {
  if (type === 'unknown') return 'Unclassified shape';
  if (type === 'port') return 'Port';
  if (type === 'prop') return 'Prop';
  return sentence(objectLabel(type));
}

/** A proposal nobody has accepted or rejected yet is "Not reviewed", never "Rejected". */
export type ReviewStatus = 'Accepted' | 'Rejected' | 'Not reviewed';
export const reviewStatus = (p: Pick<Proposal, 'accepted' | 'reviewed'>): ReviewStatus => p.accepted ? 'Accepted' : p.reviewed ? 'Rejected' : 'Not reviewed';
export const unclassified = (p: Pick<Proposal, 'type'>) => p.type === 'unknown' || p.type === 'prop' || p.type === 'port';

export const EVIDENCE: readonly Calibration['evidence'][] = ['grid', 'labeled-dimension', 'user'];
export const evidenceLabels: Record<Calibration['evidence'], string> = { grid: 'Grid', 'labeled-dimension': 'Labelled dimension', user: 'Your measurement' };
export const scaleStatusLabels: Record<NonNullable<Proposal['recognition']>['scaleStatus'], string> = { uncalibrated: 'not set', 'calibrated-approximate': 'approximate', calibrated: 'confirmed' };
export const shapeLabels: Record<NonNullable<Proposal['recognition']>['shape'], string> = { line: 'line', rectangle: 'rectangle', circle: 'circle', symbol: 'symbol' };
export const sourceKindLabels: Record<Reconstruction['sourceKind'], string> = { pdf: 'PDF', image: 'Image', 'paper-photo': 'Paper photo' };

/** Element types for the type picker, in the words of the editor's ADD menu. */
export const TYPE_CHOICES = [
  ['cardboardTarget', 'PAPER'], ['noShootTarget', 'NO-SHOOT'], ['steelPlate', 'PLATE'], ['steelPopper', 'POPPER'],
  ['wall', 'WALL'], ['faultLine', 'FAULT LINE'], ['start', 'START'],
] as const;
export type ElementType = typeof TYPE_CHOICES[number][0];

const count = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** How far a saved reference got, and its elements: "Scale confirmed · 2 of 3 elements accepted". */
export function referenceSummary(d: Reconstruction): string {
  const stage = !d.page ? 'Page not ready' : !d.aligned ? 'Corners not set' : d.projection === 'perspective' ? 'Reference only'
    : !d.calibration ? 'Scale not confirmed' : 'Scale confirmed';
  const accepted = d.proposals.filter(p => p.accepted).length;
  return d.proposals.length ? stage + ' · ' + accepted + ' of ' + count(d.proposals.length, 'element') + ' accepted' : stage;
}

/** "3 elements · 1 accepted · 1 rejected · 1 not reviewed" */
export function reviewSummary(proposals: readonly Proposal[]): string {
  const by = (s: ReviewStatus) => proposals.filter(p => reviewStatus(p) === s).length;
  return [count(proposals.length, 'element'), by('Accepted') + ' accepted', by('Rejected') + ' rejected', by('Not reviewed') + ' not reviewed'].join(' · ');
}

/** What a draft still needs before it can go under the stage as the drawing to trace over. */
export function drawingNeeds(d: Reconstruction): string[] {
  return [
    !d.aligned && 'aligned corners',
    d.projection !== 'top-down' && 'Top-down plan picked',
    !d.calibration && 'a confirmed scale',
  ].filter((s): s is string => !!s);
}

/** What ADD ACCEPTED ELEMENTS TO STAGE still needs (shown before the button, not as an error after the tap). */
export function addNeeds(d: Reconstruction): string[] {
  return [
    d.projection !== 'top-down' && 'pick Top-down plan',
    !d.calibration && 'confirm the scale',
    !d.proposals.some(p => p.accepted) && 'accept at least one element',
  ].filter((s): s is string => !!s);
}

/**
 * What closing the import does. Nothing changed since the last save: close. Changes that can become the drawing under
 * the stage (aligned, Top-down plan, confirmed scale): save them and close. Any other unsaved change: ask first.
 */
export function closeDecision(draft: Reconstruction | null, savedJson: string | null): 'close' | 'save' | 'ask' {
  if (!draft || JSON.stringify(draft) === savedJson) return 'close';
  return backdropOf(draft) ? 'save' : 'ask';
}

/** Error text for people: the message without an "Error:" prefix. */
export const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** One-time notice after the first automatic save (device preference key). */
export const AUTO_SAVE_HINT_KEY = 'psp.importAutoSaveHint';
export const AUTO_SAVE_NOTICE = 'Saved. The drawing appears under the stage.';
