// Route Planner V2: engaging on the move (docs/route-planner-v2.md, "Engaging on the move").
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const { planRoute, planToStageRoute, snapshotFromPlan, optionsFromPlan } = require('../src/planning/v2/index.ts');
const { legalIntervals, scheduleOnPath, pointAlong } = require('../src/planning/v2/routePlanner.ts');
const { normalizeStage } = require('../src/planning/v2/normalizeStage.ts');
const { checkEngagement } = require('../src/planning/v2/coverage.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { addSegment } = require('../src/stage/segments.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute, isStageRoute } = require('../src/planning/route.ts');
const { analyzeEngagements, defaultEngagementRules } = require('../src/planning/engagements.ts');
const p = (x, y) => ({ x, y }), at = (x, y) => ({ space: 'stage', x, y, z: 0 });
const box = (id, x, y, w, h) => ({ id, vertices: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] });
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Three targets in separate bays, each seen only through its own gap: standing, every target needs its own stop. */
function gallery() {
  let stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 100, 440), createObject('cardboardTarget', 'L', 100, 60), createObject('cardboardTarget', 'M', 300, 60), createObject('cardboardTarget', 'R', 500, 60)];
  // A front wall with a 40 in gap in front of each target, and side walls between the bays so no line crosses bays.
  for (const [id, a, b] of [['w1', p(0, 200), p(80, 200)], ['w2', p(120, 200), p(280, 200)], ['w3', p(320, 200), p(480, 200)], ['w4', p(520, 200), p(600, 200)], ['v1', p(200, 10), p(200, 196)], ['v2', p(400, 10), p(400, 196)]]) {
    const r = addSegment(stage, 'wall', id, at(a.x, a.y), at(b.x, b.y)); assert.ok(!r.error, r.error); stage = r.stage;
    stage.objects.find(o => o.id === id).geometry.height = 72;
  }
  const plan = createPlan(); plan.route = createRoute('r');
  plan.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [box('A', 20, 300, 560, 160)] };
  return { stage, plan };
}
const run = (stage, plan, extra = {}) => planRoute(snapshotFromPlan(stage, plan), { ...optionsFromPlan(plan), candidateSpacingInches: 12, ...extra });
const names = list => list.map(e => e.targetId);

test('standing only, each gap needs its own stop; on the move, targets are taken on the walk and stops disappear', () => {
  const { stage, plan } = gallery();
  const standing = run(stage, plan);
  assert.equal(standing.status, 'complete');
  assert.equal(standing.positions.length, 3);
  assert.ok(standing.positions.every(pos => pos.movingEngagements.length === 0));
  const moving = run(stage, plan, { moving: true });
  assert.equal(moving.status, 'complete');
  assert.equal(moving.positions.length, 1, JSON.stringify(moving.positions.map(pos => [names(pos.movingEngagements), names(pos.engagements)])));
  assert.deepEqual(names(moving.positions[0].movingEngagements), ['L', 'M'], 'shot in walking order');
  assert.deepEqual(names(moving.positions[0].engagements), ['R']);
  assert.equal(moving.diagnostics.movingStopsRemoved, 2);
  assert.equal(moving.diagnostics.exactPositions, false, 'the minimum proof is for standing plans');
  assert.ok(moving.warnings.some(w => /replaced by engaging on the move/.test(w)));
  assert.ok(moving.assumptions.some(a => /36 in of legal walking/.test(a)));
  assert.deepEqual(moving.targets.map(t => t.mode), ['moving', 'moving', 'standing']);
  assert.ok(moving.movementInches <= standing.movementInches + 1e-6);
  // Every moving engagement has its full stretch of legal walking, in order along the leg.
  const { stage: normalized } = normalizeStage(snapshotFromPlan(stage, plan), optionsFromPlan(plan));
  const face = id => normalized.targets.find(t => t.id === id);
  let cursor = 0;
  for (const e of moving.positions[0].movingEngagements) {
    assert.ok(e.moving.endInches - e.moving.startInches >= 36 - 1e-9);
    assert.ok(e.moving.startInches >= cursor - 1e-9); cursor = e.moving.endInches;
    for (let s = e.moving.startInches; s <= e.moving.endInches; s += 2)
      assert.ok(checkEngagement(pointAlong(moving.legs[0], s), face(e.targetId), normalized, 90, 'occlude').legal, `${e.targetId} at ${s}`);
  }
});

test('adopted moving plans are ordinary routes and the legality analysis covers the same targets', () => {
  const { stage, plan } = gallery();
  const result = run(stage, plan, { moving: true });
  const route = planToStageRoute(result, stage, plan);
  assert.ok(isStageRoute(route));
  assert.deepEqual(route.positions[0].movingTargetIds, ['L', 'M']);
  assert.deepEqual(route.positions[0].engagedTargetIds, ['L', 'M', 'R'], 'moving engagements come first');
  const analysis = analyzeEngagements(stage, route);
  assert.deepEqual([...analysis.coveredTargetIds].sort(), ['L', 'M', 'R'], analysis.warnings.join(' | '));
  assert.ok(analysis.nodes.some(n => n.kind === 'moving' && n.targets.some(t => t.targetId === 'M')));
});

test('stationary-only targets, IDPA, a long stretch requirement and the standing default keep their stops', () => {
  const { stage, plan } = gallery();
  plan.route.engagementRules.targetProcedures = { M: { stationaryOnly: true } };
  const held = run(stage, plan, { moving: true });
  assert.equal(held.positions.length, 2);
  assert.ok(held.positions.some(pos => names(pos.engagements).includes('M')), 'M is still shot standing');
  assert.ok(!held.positions.some(pos => names(pos.movingEngagements).includes('M')));
  plan.route.engagementRules.targetProcedures = {};
  assert.equal(run(stage, plan, { moving: true, minMovingWindowInches: 400 }).positions.length, 3, 'no stretch is 400 in long');
  assert.equal(run(stage, plan).positions.length, 3, 'standing unless asked');
  const idpa = gallery();
  idpa.plan.route.engagementRules = { ...idpa.plan.route.engagementRules, ruleset: 'IDPA', targetProcedures: { L: { areaIds: ['A'] }, M: { areaIds: ['A'] }, R: { areaIds: ['A'] } } };
  const idpaPlan = run(idpa.stage, idpa.plan, { moving: true });
  assert.equal(idpaPlan.positions.length, 3);
  assert.ok(idpaPlan.warnings.some(w => /not planned for IDPA/.test(w)));
});

test('"engage after" is kept on the move: a target that must follow another is never scheduled before it', () => {
  const { stage, plan } = gallery();
  plan.route.engagementRules.targetProcedures = { L: { afterTargetIds: ['M'] } };
  const result = run(stage, plan, { moving: true });
  assert.equal(result.status, 'complete');
  const order = result.positions.flatMap(pos => [...names(pos.movingEngagements), ...names(pos.engagements)]);
  assert.ok(order.indexOf('M') < order.indexOf('L'), order.join(','));
  const analysis = analyzeEngagements(stage, planToStageRoute(result, stage, plan));
  assert.deepEqual([...analysis.coveredTargetIds].sort(), ['L', 'M', 'R'], analysis.warnings.join(' | '));
});

test('standing engagements report how far out they could already be started on the move', () => {
  // X is open to the whole area; T is in a bay seen only from the right. The walk to the one stop crosses X's view.
  let stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 100, 440), createObject('cardboardTarget', 'T', 500, 60), createObject('cardboardTarget', 'X', 300, 250)];
  for (const [id, a, b] of [['f1', p(400, 200), p(480, 200)], ['f2', p(520, 200), p(600, 200)], ['v', p(400, 10), p(400, 196)]]) {
    const r = addSegment(stage, 'wall', id, at(a.x, a.y), at(b.x, b.y)); assert.ok(!r.error, r.error); stage = r.stage;
    stage.objects.find(o => o.id === id).geometry.height = 72;
  }
  const plan = createPlan(); plan.route = createRoute('r');
  plan.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [box('A', 20, 300, 560, 160)] };
  const result = run(stage, plan, { moving: true });
  assert.equal(result.positions.length, 1, 'the last stop always stays');
  const byId = Object.fromEntries(result.positions[0].engagements.map(e => [e.targetId, e]));
  assert.ok(byId.X.approachInches >= 200, JSON.stringify(byId.X));
  assert.equal(byId.T.approachInches, undefined, 'T only comes into view at the stop');
  assert.equal(run(stage, plan).positions[0].engagements.find(e => e.targetId === 'X').approachInches, undefined, 'only when planning on the move');
});

test('legalIntervals and scheduleOnPath', () => {
  const path = [p(0, 0), p(100, 0), p(100, 100)];
  const legal = q => (q.x >= 20 && q.x <= 60 && q.y === 0) || (q.x === 100 && q.y >= 30 && q.y <= 90);
  const w = legalIntervals(path, legal);
  assert.equal(w.length, 2);
  assert.ok(Math.abs(w[0].start - 20) < 0.01 && Math.abs(w[0].end - 60) < 0.01);
  assert.ok(Math.abs(w[1].start - 130) < 0.01 && Math.abs(w[1].end - 190) < 0.01);
  const legalFor = (q, id) => id === 'a' ? q.x >= 20 && q.x <= 60 && q.y === 0 : q.x === 100 && q.y >= 30 && q.y <= 90;
  const slots = scheduleOnPath(path, ['b', 'a'], new Set(), 30, legalFor, () => []);
  assert.deepEqual(slots.map(s => s.targetId), ['a', 'b']);
  assert.ok(Math.abs(slots[0].start - 20) < 0.01 && Math.abs(slots[1].start - 130) < 0.01);
  assert.equal(scheduleOnPath(path, ['a'], new Set(), 50, legalFor, () => []), null, 'a 40 in window cannot hold 50 in');
  assert.equal(scheduleOnPath(path, ['a', 'b'], new Set(), 30, legalFor, id => id === 'a' ? ['b'] : []), null, 'a must follow b, but its window comes first');
});

test('planner and analysis agree on random stages with engaging on the move', () => {
  const rand = rng(77); let checked = 0, withMoving = 0;
  for (let trial = 0; trial < 40; trial++) {
    // Random bays: 2-4 bays across the top, each with a gap in the front wall and 1-2 targets behind it.
    let stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
    stage.objects = [createObject('start', 'start', 40 + rand() * 520, 440)];
    const bays = 2 + Math.floor(rand() * 3), width = 600 / bays, walls = [];
    for (let b = 0; b < bays; b++) {
      const x0 = b * width, gap = x0 + 20 + rand() * (width - 70), gapWidth = 30 + rand() * 30, front = 160 + rand() * 60;
      walls.push([p(x0, front), p(gap, front)], [p(Math.min(x0 + width, gap + gapWidth), front), p(x0 + width, front)]);
      if (b > 0) walls.push([p(x0, 10), p(x0, front - 4)]);
      for (let t = 0; t < 1 + Math.floor(rand() * 2); t++) stage.objects.push({ ...createObject('cardboardTarget', `T${b}${t}`, x0 + 30 + rand() * (width - 60), 40 + rand() * 60), rotation: Math.floor(rand() * 3) * 22.5 - 22.5 });
    }
    walls.forEach(([a, b], i) => {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
      const r = addSegment(stage, 'wall', 'W' + i, at(a.x, a.y), at(b.x, b.y));
      if (!r.error) { stage = r.stage; stage.objects.find(o => o.id === 'W' + i).geometry.height = 72; }
    });
    const plan = createPlan(); plan.route = createRoute('r');
    plan.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [box('A', 20, 290, 560, 170)] };
    // A short stretch per target makes moving engagements common, which is what this test is about.
    const result = planRoute(snapshotFromPlan(stage, plan), { ...optionsFromPlan(plan), candidateSpacingInches: 24, moving: true, minMovingWindowInches: 12 });
    if (!result.positions.length) continue;
    checked++; if (result.positions.some(pos => pos.movingEngagements.length)) withMoving++;
    const analysis = analyzeEngagements(stage, planToStageRoute(result, stage, plan));
    const planned = result.targets.filter(t => t.status === 'covered').map(t => t.targetId).sort();
    assert.deepEqual([...analysis.coveredTargetIds].sort(), planned, `trial ${trial}: ${analysis.warnings.join(' | ')}`);
  }
  assert.ok(checked >= 25 && withMoving >= 8, `checked ${checked}, with moving ${withMoving}`);
  console.log(`# random moving agreement: ${checked} plans, ${withMoving} with moving engagements`);
});
