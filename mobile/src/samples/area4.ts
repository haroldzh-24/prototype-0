/**
 * Sample stages from the Area 4 USPSA Championship 2026 match book (Ben Stoeger Pro Shop Area 4, ETTS, October 2026).
 * Used two ways: as the planner's test set (tests/plannerReportCard.test.cjs) and as SAMPLE STAGES a tester can add to
 * a match to try AUTO-PLAN without building a stage by hand.
 *
 * Positions were read off each stage's drawing after READ 3D DRAWING straightened it: yards from the bay's back-left
 * corner, x to the right, y toward the shooter. They are approximate (about half a yard). Only what the drawing shows
 * is here: where the briefing lists more targets than the drawing shows, `hidden` says how many are missing, and no
 * positions were made up for them. Barrels are left out (the app has no barrel object yet). Stages 1, 5, 6 and 13
 * are not included: their drawings did not straighten automatically or show too little of the bay.
 * Stage designs belong to their designers (named per stage); get the match's permission before shipping these in
 * the App Store build.
 */
import type { StageDocument, StageObject } from '../stage/model';
import type { StagePlan } from '../planning/model';
import { createPlan } from '../planning/model';
import { createObject } from '../stage/defaults';
import { targetPreset } from '../stage/targetPresets';
import { defaultEngagementRules } from '../planning/engagements';
import type { FiringArea } from '../planning/engagements';
import { createRoute } from '../planning/route';

type Yd = [number, number];
export type SampleSpec = {
  id: string; stage: number; name: string; designer: string; page: number;
  /** Bay as drawn: width across, depth from the back berm to the front of the view, yards. */
  bay: Yd;
  /** Where the shooter figure stands in the drawing (the start position). */
  start: Yd;
  briefing: { paper: number; miniPoppers: number; poppers: number; rounds: number; bestHits: number; note?: string };
  paper: Yd[]; miniPoppers: Yd[]; poppers?: Yd[];
  areas: Yd[][]; walls: [Yd, Yd][];
  /** Windows the drawing shows: wall index, width in yards (centred on the wall). */
  ports?: [number, number][];
  /** Targets the briefing lists that the drawing doesn't show (hidden behind walls or out of view). */
  hidden?: number;
};

export const AREA4_2026: readonly SampleSpec[] = [
  { id: 'a4-s2', start: [11.5, 26.8], stage: 2, name: 'Area 4 2026 · Stage 2', designer: 'Dazhi Zhang', page: 17, bay: [30.3, 32.3],
    briefing: { paper: 15, miniPoppers: 2, poppers: 0, rounds: 32, bestHits: 2, note: 'Start outside the shooting area, feet touching marks.' },
    paper: [[3.4, 25.0], [1.4, 21.3], [1.0, 18.6], [1.4, 16.0], [1.6, 14.4], [10.3, 21.5], [12.4, 19.3], [16.0, 7.7], [18.0, 9.8], [21.6, 12.5], [29.6, 14.7], [27.0, 21.3], [29.3, 23.3], [17.4, 22.2], [18.4, 22.8]],
    miniPoppers: [[2.0, 1.5], [14.0, 0.8]],
    areas: [[[6.6, 22.1], [9.2, 22.1], [9.4, 26.3], [7.3, 26.0]], [[21.1, 23.0], [23.2, 27.9], [14.1, 30.8], [13.6, 29.4], [20.2, 26.9], [19.3, 23.5]]],
    ports: [[1, 0.6]],
    walls: [[[13.9, 9.8], [14.1, 12.6]], [[14.1, 12.6], [16.0, 13.6]], [[16.0, 13.6], [18.7, 12.2]], [[18.7, 12.2], [21.0, 13.6]], [[1.1, 15.1], [5.4, 20.2]], [[0.9, 18.8], [5.4, 23.4]], [[2.9, 23.2], [7.0, 27.0]],
      [[8.9, 19.3], [10.1, 21.7]], [[10.4, 21.5], [12.2, 23.3]], [[12.8, 17.9], [13.2, 23.4]], [[13.5, 18.2], [14.9, 20.9]], [[10.5, 17.5], [17.5, 17.5]], [[16.3, 24.3], [17.0, 23.1]], [[17.0, 23.1], [19.4, 20.9]], [[24.5, 23.4], [28.1, 18.6]], [[26.0, 25.3], [30.2, 21.9]]] },
  { id: 'a4-s3', start: [10.0, 25.5], stage: 3, name: 'Area 4 2026 · Stage 3', designer: 'Justin Sonan', page: 19, bay: [25.9, 28.4],
    briefing: { paper: 11, miniPoppers: 4, poppers: 0, rounds: 26, bestHits: 2, note: 'Start standing inside the shooting area, palms on the X marks.' },
    paper: [[15.2, 0.4], [9.0, 7.8], [4.5, 10.3], [19.0, 12.6], [7.4, 19.2], [22.0, 21.4], [25.0, 23.6], [0.4, 23.5], [0.5, 16.6]], hidden: 2,
    miniPoppers: [[11.8, 8.3], [13.4, 8.6], [22.2, 10.3], [24.0, 10.3]],
    areas: [[[4.2, 19.6], [7.0, 19.6], [8.6, 24.2], [12.9, 24.2], [12.9, 22.3], [16.5, 22.3], [18.3, 24.6], [19.4, 27.1], [7.0, 27.1]]],
    walls: [[[5.0, 16.8], [8.4, 23.9]], [[8.4, 23.9], [13.0, 23.9]], [[13.0, 23.9], [13.0, 20.5]], [[13.3, 20.5], [16.5, 20.5]], [[16.5, 20.5], [19.0, 18.5]], [[16.8, 21.2], [18.9, 24.0]]] },
  { id: 'a4-s4', start: [14.9, 14.9], stage: 4, name: 'Area 4 2026 · Stage 4', designer: 'Jeff Lynch', page: 21, bay: [30.5, 21.5],
    briefing: { paper: 15, miniPoppers: 2, poppers: 0, rounds: 32, bestHits: 2, note: 'Stay inside the shooting area at all times (rule 1.1.5.5).' },
    paper: [[3.5, 10.8], [4.4, 0.3], [5.2, 0.3], [8.8, 16.6], [9.3, 16.6], [13.0, 2.0], [13.8, 2.0], [17.9, 2.2], [18.6, 16.4], [20.0, 3.2], [21.3, 4.6], [23.6, 11.6], [24.4, 11.4], [26.2, 7.1], [26.6, 6.8]],
    miniPoppers: [[2.8, 2.4], [3.4, 2.4]],
    areas: [[[10.5, 8.7], [12.2, 8.7], [12.2, 14.0], [13.8, 14.0], [13.8, 10.0], [15.3, 10.0], [15.3, 15.5], [16.0, 15.5], [16.0, 19.8], [14.8, 19.8], [14.8, 16.5], [10.3, 16.5]]],
    walls: [[[6.5, 9.0], [9.6, 7.5]], [[17.8, 10.3], [21.0, 7.8]], [[21.5, 12.5], [23.3, 10.0]], [[8.0, 16.5], [10.0, 17.8]], [[17.0, 17.5], [19.0, 14.0]], [[3.0, 11.5], [5.3, 13.5]]] },
  { id: 'a4-s7', start: [15.5, 35.5], stage: 7, name: 'Area 4 2026 · Stage 7', designer: 'Michael Moreno', page: 25, bay: [31.0, 42.7],
    briefing: { paper: 13, miniPoppers: 4, poppers: 1, rounds: 31, bestHits: 2, note: 'Steel must fall to score.' },
    paper: [[15.0, 15.3], [21.8, 15.7], [23.3, 16.9], [11.0, 20.8], [8.6, 23.2], [6.7, 27.5], [0.5, 29.8], [4.7, 32.4], [27.5, 24.0], [29.3, 28.5], [30.4, 21.5], [28.6, 35.2], [30.3, 35.5]],
    miniPoppers: [[17.4, 12.0], [18.3, 11.6], [3.8, 20.0], [30.0, 14.0]], poppers: [[9.5, 1.5]],
    areas: [[[15.5, 27.0], [22.5, 41.8], [20.0, 41.8], [18.0, 38.0], [15.5, 41.0], [13.0, 38.0], [11.7, 41.7], [9.0, 41.7]]],
    walls: [[[10.0, 23.0], [13.0, 24.5]], [[10.0, 23.5], [10.0, 29.0]], [[5.5, 28.0], [5.5, 33.5]], [[5.5, 30.5], [8.8, 30.5]], [[12.3, 33.0], [13.4, 30.5]], [[16.4, 26.0], [18.2, 30.4]], [[16.6, 33.0], [17.9, 34.8]],
      [[10.5, 38.0], [11.5, 35.5]], [[19.5, 25.0], [22.0, 26.5]], [[22.0, 26.5], [25.0, 26.5]], [[24.5, 31.0], [27.5, 31.0]], [[27.5, 31.0], [27.5, 28.0]], [[26.5, 37.0], [28.5, 35.0]]] },
  { id: 'a4-s8', start: [11.3, 26.0], stage: 8, name: 'Area 4 2026 · Stage 8', designer: 'Dazhi Zhang', page: 27, bay: [30.8, 26.7],
    briefing: { paper: 11, miniPoppers: 2, poppers: 0, rounds: 24, bestHits: 2, note: 'Stomp pad activates swinger S1 (the app shows it as a still target).' },
    paper: [[5.6, 0.7], [19.5, 1.3], [11.8, 11.2], [2.3, 18.5], [1.3, 15.7], [9.3, 17.2], [17.5, 16.2], [24.6, 14.9], [29.8, 15.0], [29.8, 18.7], [26.8, 21.5]],
    miniPoppers: [[12.1, 0.3], [13.7, 0.3]],
    areas: [[[7.8, 21.1], [9.0, 21.1], [11.8, 25.2], [15.3, 25.2], [19.3, 21.4], [20.6, 21.9], [15.8, 26.6], [11.1, 26.6]]],
    ports: [[1, 0.8]],
    walls: [[[3.3, 12.7], [11.0, 19.3]], [[11.0, 19.5], [14.8, 20.2]], [[14.8, 20.2], [18.3, 15.7]], [[11.0, 19.7], [9.6, 22.6]], [[0.3, 15.2], [6.3, 19.2]], [[23.3, 17.2], [25.3, 11.7]], [[23.8, 18.2], [27.3, 19.2]], [[27.3, 19.2], [24.8, 22.2]], [[18.0, 3.0], [20.6, 3.0]]] },
  { id: 'a4-s9', start: [16.5, 9.8], stage: 9, name: 'Area 4 2026 · Stage 9', designer: 'Erwin Perera', page: 29, bay: [26.5, 15.0],
    briefing: { paper: 11, miniPoppers: 4, poppers: 0, rounds: 26, bestHits: 2, note: 'The drawing cuts off the left of the bay; positions start at the left edge of the view.' },
    paper: [[10.6, 3.0], [11.3, 3.5], [13.6, 6.0], [15.0, 4.2], [16.3, 3.0], [17.2, 3.0], [18.8, 2.5], [20.0, 2.5], [21.0, 8.0], [24.5, 10.2], [25.2, 10.5]],
    miniPoppers: [[1.3, 3.0], [2.3, 2.5], [3.5, 1.8], [4.6, 1.3]],
    areas: [[[11.6, 9.3], [14.1, 9.3], [14.1, 10.8], [11.6, 10.8]], [[14.7, 5.0], [16.0, 5.0], [16.0, 7.8], [14.7, 7.8]], [[18.0, 11.0], [20.6, 11.0], [20.6, 12.6], [18.0, 12.6]]],
    walls: [[[11.0, 2.5], [11.0, 8.3]], [[11.0, 8.3], [12.8, 8.3]], [[14.3, 4.0], [16.6, 4.0]], [[17.0, 3.8], [19.8, 3.8]], [[17.8, 9.5], [20.3, 9.5]], [[20.3, 9.5], [21.5, 8.0]]] },
  { id: 'a4-s10', start: [14.8, 17.3], stage: 10, name: 'Area 4 2026 · Stage 10', designer: 'ETTS Design Team', page: 31, bay: [26.0, 20.0],
    briefing: { paper: 14, miniPoppers: 2, poppers: 0, rounds: 30, bestHits: 2, note: 'Start with the handgun on the barrel, trigger guard over the X.' },
    paper: [[2.0, 2.2], [2.4, 4.9], [4.2, 10.8], [3.6, 11.4], [3.0, 12.3], [1.8, 16.0], [7.4, 2.3], [10.6, 3.3], [20.6, 4.4], [21.6, 1.0], [25.8, 11.0], [22.6, 15.2], [13.6, 13.0], [23.0, 1.2]],
    miniPoppers: [[14.9, 0.5], [15.5, 0.5]],
    areas: [[[10.5, 14.0], [15.8, 14.0], [15.8, 16.8], [10.5, 16.8]]],
    walls: [[[10.2, 13.9], [10.2, 9.6]], [[10.2, 9.6], [13.5, 9.6]], [[13.5, 13.9], [16.5, 13.9]], [[16.5, 13.9], [16.5, 6.0]], [[14.5, 6.0], [16.5, 6.0]], [[8.5, 5.5], [10.8, 3.0]], [[3.8, 6.8], [5.6, 11.8]], [[23.0, 10.0], [25.8, 8.1]], [[20.0, 3.0], [21.0, 0.5]]] },
  { id: 'a4-s11', start: [10.8, 19.3], stage: 11, name: 'Area 4 2026 · Stage 11', designer: 'Justin Sonan', page: 33, bay: [20.5, 21.0],
    briefing: { paper: 6, miniPoppers: 6, poppers: 0, rounds: 12, bestHits: 1, note: 'Best 1 hit on paper. Start with the handgun unloaded.' },
    paper: [[18.6, 0.9], [4.5, 6.5], [8.7, 9.9], [2.9, 10.2], [2.9, 12.5], [19.6, 13.7]],
    miniPoppers: [[5.5, 1.8], [14.7, 1.6], [15.8, 4.5], [3.8, 5.2]], hidden: 2,
    areas: [[[6.6, 15.8], [14.8, 15.8], [14.8, 18.6], [6.6, 18.6]]],
    walls: [[[9.5, 11.3], [12.5, 11.3]], [[6.2, 14.2], [9.3, 14.2]], [[12.4, 14.2], [15.2, 14.2]]] },
  { id: 'a4-s12', start: [12.5, 16.2], stage: 12, name: 'Area 4 2026 · Stage 12', designer: 'Terrence Tsang', page: 35, bay: [25.0, 18.0],
    briefing: { paper: 5, miniPoppers: 2, poppers: 0, rounds: 12, bestHits: 2, note: 'P2 activates swinger S1 (the app shows it as a still target).' },
    paper: [[9.5, 8.6], [11.6, 6.2], [13.0, 2.6], [17.6, 1.5], [14.0, 0.7]],
    miniPoppers: [[6.4, 2.3], [6.9, 2.3]],
    areas: [[[13.3, 7.5], [14.4, 7.5], [14.4, 16.8], [10.5, 16.8], [10.5, 15.6], [13.3, 15.6]]],
    walls: [[[13.2, 4.0], [13.2, 10.2]], [[9.0, 9.8], [13.2, 9.8]], [[16.0, 0.5], [18.0, 4.0]], [[11.5, 15.0], [13.0, 15.0]]] },
];

const YD = 36;
const at = (p: Yd) => ({ x: p[0] * YD, y: p[1] * YD });
/** Target facing: across the direction to the nearest shooting area's middle, so the face looks at the shooter. */
function facing(p: Yd, areas: readonly Yd[][]): number {
  const centres = areas.map(a => [a.reduce((s, q) => s + q[0], 0) / a.length, a.reduce((s, q) => s + q[1], 0) / a.length] as Yd);
  const c = centres.reduce((best, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(best[0] - p[0], best[1] - p[1]) ? q : best, centres[0] ?? [p[0], p[1] + 10]);
  const toward = Math.atan2(c[1] - p[1], c[0] - p[0]) * 180 / Math.PI;
  return ((toward + 90) % 360 + 360) % 360;
}
/** A sample's stage document and plan (shooting areas in the route's rules, as AREAS draws them). */
export function buildSample(spec: SampleSpec): { name: string; document: StageDocument; plan: StagePlan; firingAreas: FiringArea[] } {
  const objects: StageObject[] = [];
  const target = (id: string, p: Yd, presetId: string, type: 'cardboardTarget' | 'steelPopper') => {
    const preset = targetPreset(presetId)!, base = createObject(type, id, at(p).x, at(p).y, 'USPSA');
    objects.push({ ...base, rotation: facing(p, spec.areas), presetId: preset.id, targetFamily: 'USPSA', outline: JSON.parse(JSON.stringify(preset.outline)), geometry: { faceWidth: preset.width, faceHeight: preset.height } } as StageObject);
  };
  spec.paper.forEach((p, i) => target(`${spec.id}-t${i + 1}`, p, 'uspsa-metric-chl-v1', 'cardboardTarget'));
  (spec.poppers ?? []).forEach((p, i) => target(`${spec.id}-p${i + 1}`, p, 'uspsa-popper-42-ss-v1', 'steelPopper'));
  spec.miniPoppers.forEach((p, i) => target(`${spec.id}-m${i + 1}`, p, 'uspsa-mini-popper-bst-v1', 'steelPopper'));
  spec.walls.forEach(([a, b], i) => {
    const s = { space: 'stage' as const, ...at(a), z: 0 }, e = { space: 'stage' as const, ...at(b), z: 0 }, length = Math.hypot(e.x - s.x, e.y - s.y);
    const wall = createObject('wall', `${spec.id}-w${i + 1}`, (s.x + e.x) / 2, (s.y + e.y) / 2);
    const ports = (spec.ports ?? []).filter(([index]) => index === i).map(([, width], k) => ({ id: `${spec.id}-w${i + 1}-port${k + 1}`, offset: 0, width: width * YD, height: 24, sill: 30 }));
    if (wall.type === 'wall') objects.push({ ...wall, rotation: ((Math.atan2(e.y - s.y, e.x - s.x) * 180 / Math.PI) + 360) % 360, endpoints: { start: s, end: e }, geometry: { ...wall.geometry, length }, ports });
  });
  const start = createObject('start', `${spec.id}-start`, at(spec.start).x, at(spec.start).y);
  objects.unshift(start);
  const document: StageDocument = { schemaVersion: 7, coordinateSystem: 'inches', stage: { width: Math.round(spec.bay[0] * YD), depth: Math.round(spec.bay[1] * YD) }, downrangeDegrees: 270, objects };
  const firingAreas: FiringArea[] = spec.areas.map((a, i) => ({ id: `area-${i + 1}`, vertices: a.map(at) }));
  const rules = { ...defaultEngagementRules(document, 'USPSA'), firingAreas };
  const plan: StagePlan = { ...createPlan(), route: { ...createRoute(`${spec.id}-route`), name: 'Sample route', engagementRules: rules } };
  return { name: spec.name, document, plan, firingAreas };
}
