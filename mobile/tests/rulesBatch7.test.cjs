// Rulebook research batch: steel distance, drill penalties, stage check (docs/rules/).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const D = require('../src/training/drillLog.ts');
const { planRoute } = require('../src/planning/v2/index.ts');
const { STEEL_MIN_INCHES } = require('../src/planning/v2/normalizeStage.ts');
const { FOOT_REACH_INCHES } = require('../src/planning/v2/coverage.ts');
const { checkStage, minimumRounds, uspsaCourseType } = require('../src/rules/stageCheck.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createRoute } = require('../src/planning/route.ts');
const { analyzeEngagements, defaultEngagementRules } = require('../src/planning/engagements.ts');
const p = (x, y) => ({ x, y }), at = (x, y) => ({ space: 'stage', x, y, z: 0 });
const box = (id, x, y, w, h) => ({ id, vertices: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] });
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const hit = (order, zone, x = 0, y = 0) => ({ id: 'h' + order, order, x: ['M', 'NS', 'NT'].includes(zone) ? null : x, y: ['M', 'NS', 'NT'].includes(zone) ? null : y, zone });

test('USPSA: best hits up to the required count, -10 per missing hit, no-shoot and procedural, never below 0', () => {
  const s = D.scoreRun({ family: 'USPSA', hits: [hit(1, 'A'), hit(2, 'A'), hit(3, 'C'), hit(4, 'M')], totalTime: 2.1 });
  assert.equal(s.points, 13 - 10); near(s.hitFactor, 3 / 2.1);
  assert.equal(D.scoreRun({ family: 'USPSA', powerFactor: 'major', hits: [hit(1, 'A'), hit(2, 'A'), hit(3, 'C'), hit(4, 'M')] }).points, 14 - 10);
  const best = D.scoreRun({ family: 'USPSA', requiredHits: 2, hits: [hit(1, 'A'), hit(2, 'D'), hit(3, 'C')] });
  assert.equal(best.points, 5 + 3); assert.equal(best.misses, 0);
  const floor = D.scoreRun({ family: 'USPSA', requiredHits: 2, procedurals: 1, hits: [hit(1, 'A'), hit(2, 'C'), hit(3, 'NS')], totalTime: 2 });
  assert.equal(floor.points, 0, '8 - 10 - 10 is floored at 0 (9.5.6)'); assert.equal(floor.penalties, 20); assert.equal(floor.hitFactor, 0);
  assert.equal(D.scoreRun({ family: 'USPSA', requiredHits: 2, hits: [hit(1, 'A')] }).misses, 1);
});

test('PCSL: T counts as two A hits, at most 5 points per required hit, no-shoot penalties capped at 2', () => {
  assert.equal(D.scoreRun({ family: 'PCSL', requiredHits: 2, hits: [hit(1, 'T')] }).points, 10);
  const one = D.scoreRun({ family: 'PCSL', requiredHits: 2, hits: [hit(1, 'A')] });
  assert.equal(one.misses, 1); assert.equal(one.points, 0, '5 - 10 floored at 0');
  assert.equal(D.scoreRun({ family: 'PCSL', requiredHits: 2, hits: [hit(1, 'T'), hit(2, 'A')] }).points, 10, 'capped at 2 x 5');
  assert.equal(D.scoreRun({ family: 'PCSL', requiredHits: 3, hits: [hit(1, 'T'), hit(2, 'T')] }).points, 15, 'the second T only has one hit left');
  const ns = D.scoreRun({ family: 'PCSL', requiredHits: 2, hits: [hit(1, 'T'), hit(2, 'NS'), hit(3, 'NS'), hit(4, 'NS')], totalTime: 4 });
  assert.equal(ns.penalties, 20); assert.equal(ns.points, 0); assert.equal(ns.hitFactor, 0);
});

test('IDPA: final time = raw + points down + 5 s per non-threat hit + 3 s per procedural error', () => {
  const s = D.scoreRun({ family: 'IDPA', requiredHits: 2, procedurals: 1, totalTime: 3, hits: [hit(1, '-0'), hit(2, '-1'), hit(3, '-3'), hit(4, 'NT')] });
  assert.equal(s.pointsDown, 1, 'best two hits'); near(s.finalTime, 3 + 1 + 5 + 3);
  assert.equal(D.scoreRun({ family: 'IDPA', requiredHits: 3, hits: [hit(1, '-1')] }).pointsDown, 1 + 10);
  assert.equal(D.scoreRun({ family: 'IDPA', hits: [hit(1, '-0')] }).finalTime, null, 'no time, no final time');
});

test('penalty tags never move the group and legacy runs still score', () => {
  const g = D.groupStats({ hits: [hit(1, 'A', 1, 1), { ...hit(2, 'NS'), x: 9, y: 9 }], aim: { x: 0, y: 0 }, distanceYards: null });
  assert.equal(g.shots, 1); assert.deepEqual(g.center, { x: 1, y: 1 });
  const legacy = { id: 'r', recordedAt: '2026-10-20T00:00:00Z', targetPresetId: null, family: 'USPSA', faceWidth: 18, faceHeight: 30, distanceYards: null, aim: { x: 0, y: 0 }, hits: [hit(1, 'A')], totalTime: null, splits: [], notes: '' };
  assert.equal(D.drillRunProblem(legacy), null); assert.equal(D.scoreRun(legacy).points, 5);
});

function steelStage(steelY) {
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 600 } });
  stage.objects = [createObject('start', 'start', 300, 580), { ...createObject('steelPlate', 'S1', 300, steelY), rotation: 0 }];
  return stage;
}

test('the planner never engages steel from closer than the ruleset minimum, measured from the feet', () => {
  for (const ruleset of ['USPSA', 'PCSL', 'IDPA']) {
    const min = STEEL_MIN_INCHES[ruleset], edge = 40 + min + FOOT_REACH_INCHES; // a stop must be at least this far down
    const snapshot = firingAreas => ({ stage: steelStage(40), firingAreas, targetProcedures: { S1: { areaIds: ['A'] } } });
    // A narrow area straight in front of the plate whose far edge stops just short of the limit: every spot is too close.
    const close = planRoute(snapshot([box('A', 290, edge - 60, 20, 59)]), { ruleset, candidateSpacingInches: 6 });
    assert.equal(close.status, 'infeasible', ruleset); assert.deepEqual(close.targets[0].reasons, ['STEEL_TOO_CLOSE'], ruleset);
    const far = planRoute(snapshot([box('A', 290, edge - 60, 20, 120)]), { ruleset, candidateSpacingInches: 6 });
    assert.equal(far.status, 'complete', ruleset);
    const stop = far.positions[0].point;
    assert.ok(stop.y - 40 - FOOT_REACH_INCHES >= min - 1e-6, `${ruleset}: stop at ${stop.y}`);
    assert.ok(far.safety.checked.some(c => c.includes(`${min} in`)));
  }
  assert.deepEqual(STEEL_MIN_INCHES, { USPSA: 276, PCSL: 252, IDPA: 360 });
});

test('the engagement analysis ends a moving steel window exactly at the minimum distance', () => {
  const stage = steelStage(40);
  const route = createRoute('r');
  route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [box('A', 0, 0, 600, 600)] };
  route.positions = [{ id: 'w', label: 'W', position: at(300, 100), visibleTargetIds: [], engagedTargetIds: [] }];
  const analysis = analyzeEngagements(stage, route);
  const w = analysis.windows.find(x => x.targetId === 'S1');
  assert.ok(w, 'a window exists while far enough away');
  const end = w.endPosition; // walking up the screen from y=580 toward the plate at y=40
  near(end.y - 40, STEEL_MIN_INCHES.USPSA + FOOT_REACH_INCHES, 0.01);
  assert.equal(w.startDistanceAlongSegment, 0);
});

test('stage check: round count and course type, steel distance from firing areas, and freestyle limits', () => {
  const stage = createDefaultStage('USPSA');
  const counts = minimumRounds(stage);
  assert.equal(counts.rounds, counts.paper * 2 + counts.steel);
  assert.deepEqual([1, 12, 13, 20, 21].map(uspsaCourseType), ['short', 'short', 'medium', 'medium', 'long']);
  const info = checkStage(stage, undefined, 'USPSA');
  assert.ok(info.some(f => f.code === 'ROUNDS' && /course/.test(f.message)));
  assert.ok(info.some(f => f.code === 'NO_AREAS'));

  const steel = steelStage(40);
  const rules = (firingAreas, ruleset = 'USPSA', targetProcedures = {}) => ({ ...defaultEngagementRules(steel), ruleset, firingAreas, targetProcedures });
  const tooClose = checkStage(steel, rules([box('A', 0, 300, 600, 300)]), 'USPSA');
  assert.ok(tooClose.some(f => f.severity === 'safety' && f.code === 'STEEL_DISTANCE' && f.objectIds[0] === 'S1'), 'area 260 in from the plate');
  const between = checkStage(steel, rules([box('A', 0, 330, 600, 270)]), 'USPSA');
  assert.ok(between.some(f => f.code === 'STEEL_FAULT_LINE'), '290 in: legal to fire, but fault lines must be 26 ft away');
  assert.ok(!between.some(f => f.severity === 'safety'));
  assert.ok(!checkStage(steel, rules([box('A', 0, 360, 600, 240)]), 'USPSA').some(f => f.code.startsWith('STEEL')), '320 in is fine');
  assert.ok(checkStage(steel, rules([box('A', 0, 300, 600, 300)], 'PCSL'), 'PCSL').every(f => f.code !== 'STEEL_DISTANCE'), 'PCSL pistol minimum is 7 yd');
  assert.ok(checkStage(steel, rules([box('A', 0, 300, 600, 300)], 'IDPA'), 'IDPA').some(f => f.code === 'STEEL_DISTANCE'), 'IDPA minimum is 10 yd');

  // A long USPSA course (21+ rounds) may not dictate where or when targets are engaged.
  const long = createDefaultStage(undefined, { size: { width: 1200, depth: 600 } });
  long.objects = [createObject('start', 'start', 50, 580), ...Array.from({ length: 11 }, (_, i) => createObject('cardboardTarget', 'T' + i, 60 + i * 100, 40))];
  const procs = rules([box('A', 0, 300, 1200, 300)], 'USPSA', { T0: { afterTargetIds: ['T1'] } });
  assert.ok(checkStage(long, procs, 'USPSA').some(f => f.code === 'USPSA_FREESTYLE'));
  assert.ok(!checkStage(long, rules([box('A', 0, 300, 1200, 300)]), 'USPSA').some(f => f.code === 'USPSA_FREESTYLE'));
});

test('stage check: IDPA rules on hold (USPSA checks and a note); PCSL maximum distance', () => {
  const stage = createDefaultStage(undefined, { size: { width: 2400, depth: 2200 } });
  stage.objects = [createObject('start', 'start', 50, 2150), ...Array.from({ length: 10 }, (_, i) => createObject('cardboardTarget', 'T' + i, 100 + i * 200, 40)),
    ...Array.from({ length: 6 }, (_, i) => createObject('noShootTarget', 'N' + i, 150 + i * 200, 60))];
  const area = [box('A', 0, 2000, 2400, 200)];
  // IDPA rules are on hold: an IDPA match gets a note and USPSA checks, no IDPA findings.
  const idpa = checkStage(stage, { ...defaultEngagementRules(stage), ruleset: 'IDPA', firingAreas: area }, 'IDPA');
  assert.ok(idpa.some(f => f.code === 'IDPA_RULES_ON_HOLD'));
  assert.ok(!idpa.some(f => f.code.startsWith('IDPA_') && f.code !== 'IDPA_RULES_ON_HOLD'), 'no IDPA rule findings');
  assert.ok(idpa.some(f => f.code === 'ROUNDS' && /USPSA/.test(f.rule)), 'checked with USPSA rules');
  const pcsl = checkStage(stage, { ...defaultEngagementRules(stage), ruleset: 'PCSL', firingAreas: area }, 'PCSL');
  assert.ok(pcsl.some(f => f.code === 'PCSL_MAX_DISTANCE'), 'targets about 54 yd away');
  const steelHeavy = createDefaultStage(undefined, { size: { width: 600, depth: 600 } });
  steelHeavy.objects = [createObject('start', 'start', 50, 580), createObject('cardboardTarget', 'T', 100, 40), createObject('steelPlate', 'S1', 300, 40), createObject('steelPlate', 'S2', 400, 40)];
  assert.ok(!checkStage(steelHeavy, undefined, 'IDPA').some(f => f.code === 'IDPA_STEEL_SHARE'), 'IDPA steel share is on hold');
  assert.ok(!checkStage(steelHeavy, undefined, 'USPSA').some(f => f.code === 'IDPA_RULES_ON_HOLD'));
});

test('stage check: USPSA and IPSC cardboard are never mixed in a stage (4.2.1); plates are never the only targets (4.3.1.4)', () => {
  const { placeTarget } = require('../src/stage/targetPlacement.ts');
  const build = placements => placements.reduce((stage, [preset, id, x, noShoot]) => { const r = placeTarget(stage, preset, id, { x, y: 200, z: 0, space: 'stage' }, noShoot); assert.ok(!r.error, r.error); return r.stage; },
    { ...createDefaultStage('USPSA'), objects: [createObject('start', 'start', 300, 580)] });
  const codes = stage => checkStage(stage, undefined, 'USPSA').map(f => f.code);
  // Full and half-size USPSA targets go together; an IPSC no-shoot among them does not.
  assert.ok(!codes(build([['uspsa-metric-chl-v1', 'T1', 100], ['uspsa-half-chl-v1', 'T2', 200]])).includes('USPSA_TARGET_MIX'));
  const mixed = checkStage(build([['uspsa-metric-chl-v1', 'T1', 100], ['uspsa-metric-chl-v1', 'T2', 200], ['uspsa-classic-chl-v1', 'N1', 300, true]]), undefined, 'USPSA');
  const mix = mixed.find(f => f.code === 'USPSA_TARGET_MIX');
  assert.ok(mix, 'IPSC no-shoot with USPSA targets'); assert.deepEqual(mix.objectIds, ['N1'], 'the odd one out is highlighted'); assert.equal(mix.rule, 'USPSA 4.2.1');
  // Other rulesets have no such rule.
  assert.ok(!checkStage(build([['uspsa-metric-chl-v1', 'T1', 100], ['uspsa-classic-chl-v1', 'T2', 300]]), undefined, 'PCSL').some(f => f.code === 'USPSA_TARGET_MIX'));
  // Plates: Level I and II only; with no cardboard or popper they cannot be the whole stage.
  const plates = codes(build([['uspsa-round-12-v1', 'P1', 100], ['uspsa-hex-8-v1', 'P2', 200]]));
  assert.ok(plates.includes('USPSA_PLATES_ONLY') && plates.includes('USPSA_PLATE_LEVEL'));
  const withPopper = codes(build([['uspsa-round-12-v1', 'P1', 100], ['uspsa-popper-42-ss-v1', 'S1', 300]]));
  assert.ok(!withPopper.includes('USPSA_PLATES_ONLY') && withPopper.includes('USPSA_PLATE_LEVEL'));
  assert.ok(!codes(build([['uspsa-metric-chl-v1', 'T1', 100]])).includes('USPSA_PLATE_LEVEL'));
});

test('USPSA catalog: rulebook names, half-size target, B3 plates within the limits, practice target retired', () => {
  const P = require('../src/stage/targetPresets.ts');
  assert.equal(P.targetPreset('uspsa-metric-chl-v1').name, 'USPSA Target (CHL)');
  assert.equal(P.targetPreset('uspsa-classic-chl-v1').name, 'IPSC Target (CHL)');
  const half = P.targetPreset('uspsa-half-chl-v1');
  assert.deepEqual([half.width, half.height, half.cardboardType], [9.26, 15.16, 'USPSA']);
  const offered = P.presetsForFamily('USPSA').map(p => p.id);
  assert.ok(!offered.includes('uspsa-reduced-at-v1') && P.targetPreset('uspsa-reduced-at-v1'), 'retired but still opens');
  for (const p of P.presetsForFamily('USPSA').filter(p => p.type === 'steelPlate')) {
    // B3: round 8-12 in, square 6-12 in a side, polygons 6-12 in flat to flat (the hexagon's height).
    assert.equal(p.verification, 'verified', p.id); assert.match(p.source, /appendix\/B3|USPSA-Competition-Rules/);
    const across = p.outline.kind === 'polygon' ? p.height : Math.min(p.width, p.height);
    const [lo, hi] = p.outline.kind === 'ellipse' ? [8, 12] : [6, 12];
    assert.ok(across >= lo && across <= hi && Math.max(p.width, p.height) <= (p.outline.kind === 'polygon' ? 12 / Math.cos(Math.PI / 6) : 12), p.id);
  }
  const hex = P.targetPreset('uspsa-hex-8-v1');
  assert.ok(Math.abs(hex.width - 9.2376) < 1e-3 && hex.height === 8);
  assert.equal(P.targetPreset('uspsa-mini-popper-bst-v1').height, 28);
});
