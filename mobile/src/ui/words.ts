import type { StageDocument, StageObject } from '../stage/model';

/**
 * The words the app shows (owner-approved word list, UI cohesion plan, 2026-11-02). Use these for labels instead of
 * typing the words again, so one object has one name everywhere. Code identifiers (firingAreas, waypoint, node) keep
 * their names; only what the user reads changes. tests/words.test.cjs fails on the retired words in RETIRED_WORDS.
 *
 * Casing: buttons ALL CAPS, everything else sentence case, never Title Case. One separator: SEP (" · ").
 */
export const SEP = ' · ';

export const words = {
  /** The screen where a stage is built, planned and walked. Not "Stage builder" or "Stage Designer". */
  editor: 'Stage editor',
  openEditor: 'OPEN STAGE EDITOR',
  steps: { build: 'BUILD', plan: 'PLAN', walk: 'WALK' },
  /** View switch on the canvas: the plan view (button "2D") and 3D. Eye level is WALK, not a third view. */
  views: { plan: 'Plan view', planButton: '2D', threeD: '3D view', threeDButton: '3D' },
  /** Where you shoot from (P1, P2…). Not "waypoint", "stop" or "node". */
  position: 'Position', positions: 'Positions',
  /** A point the route only passes (a position with nothing engaged). */
  pathPoint: 'Path point',
  /** Where competitors may shoot from (USPSA / PCSL rulebook term). Not "firing area" or "required area". */
  shootingArea: 'Shooting area', shootingAreas: 'Shooting areas',
  /** Which plans a logged run counts toward. Not "calibration context" or "Active context". */
  practiceType: 'Practice type',
  /** Leaves a mode. Sheet headers say "Done" instead (EditorSheet). */
  done: 'DONE', sheetDone: 'Done',
  stageSize: 'Stage size', stageSizeButton: 'STAGE SIZE',
} as const;

/** "P3": the short name of the position at this index in the route. */
export const positionName = (index: number) => `P${index + 1}`;
/** "Position 3": the long name, for sheet titles and lists. */
export const positionTitle = (index: number) => `${words.position} ${index + 1}`;
/** Shooting areas are numbered in drawing order: "Shooting area 2". */
export const shootingAreaTitle = (index: number) => `${words.shootingArea} ${index + 1}`;
/** Engagement order within a position: 1, 2, 3 (not A, B, C). */
export const engagementOrder = (index: number) => String(index + 1);
/** Join label parts with the one separator, skipping empty parts. */
export const joinLabel = (...parts: (string | number | null | undefined | false)[]) => parts.filter(p => p !== null && p !== undefined && p !== false && p !== '').join(SEP);

const SCORING = ['cardboardTarget', 'steelPlate', 'steelPopper'];
/** The target type shown under (or after) a target's name. */
export function targetTypeName(type: StageObject['type']): string {
  return ({ cardboardTarget: 'Paper', steelPlate: 'Plate', steelPopper: 'Popper', noShootTarget: 'No-shoot', wall: 'Wall', faultLine: 'Fault line', start: 'Start' } as const)[type];
}
/**
 * A target's name, the same in 2D, 3D, PLAN, WALK and ANALYZE: scoring targets (paper, plates and poppers) are
 * T1, T2… in stage order; no-shoots are NS1, NS2…
 */
export function targetName(stage: Pick<StageDocument, 'objects'>, object: Pick<StageObject, 'id' | 'type'>): string {
  if (object.type === 'noShootTarget') return 'NS' + (stage.objects.filter(o => o.type === 'noShootTarget').findIndex(o => o.id === object.id) + 1);
  if (!SCORING.includes(object.type)) return '';
  return 'T' + (stage.objects.filter(o => SCORING.includes(o.type)).findIndex(o => o.id === object.id) + 1);
}
/** "T3 · Paper", where there is room for the type. */
export function targetNameWithType(stage: Pick<StageDocument, 'objects'>, id: string): string {
  const object = stage.objects.find(o => o.id === id);
  return object && targetName(stage, object) ? joinLabel(targetName(stage, object), targetTypeName(object.type)) : 'Missing target';
}

/** What the WALK status words mean (the legend on the walk view). */
export const walkStatusWords = {
  moving: { word: 'ON THE MOVE', meaning: 'The plan engages it while walking this stretch.' },
  here: { word: 'FROM HERE', meaning: 'The plan engages it from this position.' },
  legal: { word: 'LEGAL', meaning: 'Allowed from this spot (shooting area, safe angle, steel distance), but planned elsewhere.' },
  visible: { word: 'VISIBLE', meaning: 'You can see it from here, but it is not legal to engage from this spot.' },
  hidden: { word: 'HIDDEN', meaning: 'Walls, other targets or no-shoots block it from here.' },
  done: { word: 'DONE', meaning: 'Already engaged earlier in the run.' },
} as const;

/**
 * Retired words: user-facing text must not contain these (tests/words.test.cjs). Each entry names the word to use
 * instead. Code identifiers are not checked.
 */
export const RETIRED_WORDS: readonly { pattern: RegExp; use: string }[] = [
  { pattern: /stage\s*builder|stage\s*designer/i, use: words.editor },
  { pattern: /top[\s-]*down/i, use: words.views.plan },
  { pattern: /eye[\s-]*level view|^EYE$|^Eye level$/i, use: 'WALK' },
  { pattern: /firing area|required area/i, use: words.shootingArea },
  { pattern: /way\s*points?\b/i, use: `${words.position} (P1, P2…) or ${words.pathPoint}` },
  { pattern: /(firing|shooting) areas?\b[^.]*\bin Route settings|Route settings[^.]*\b(firing|shooting) areas?/i, use: 'PLAN → AREAS' },
  { pattern: /\bCardboard \d/, use: 'T1, T2…' },
  { pattern: /calibration context|active context/i, use: words.practiceType },
];
