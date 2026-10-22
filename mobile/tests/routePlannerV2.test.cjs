// Route Planner V2 tests (docs/route-planner-v2.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const { planRoute, planToStageRoute, snapshotFromPlan } = require('../src/planning/v2/index.ts');
const { minimumCover, shortestCoveringWalk, representatives } = require('../src/planning/v2/optimizeRoute.ts');
const { strictlyInside } = require('../src/planning/routeSolver/traversability.ts');
const { normalizeStage } = require('../src/planning/v2/normalizeStage.ts');
const { checkEngagement, headingDelta, headingTo } = require('../src/planning/v2/coverage.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { addSegment } = require('../src/stage/segments.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute, isStageRoute, evaluateRoute } = require('../src/planning/route.ts');
const { analyzeEngagements, defaultEngagementRules } = require('../src/planning/engagements.ts');
const p = (x, y) => ({ x, y }), at = (x, y, z = 0) => ({ space: 'stage', x, y, z });
const box = (id, x, y, w, h) => ({ id, vertices: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] });

/** 600 x 480 in stage, downrange up the screen, start near the bottom-left. */
function blankStage(objects = []) {
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 100, 440), ...objects];
  return stage;
}
const target = (id, x, y, rotation = 0) => ({ ...createObject('cardboardTarget', id, x, y), rotation });
const wall = (stage, id, a, b, patch = {}) => {
  const r = addSegment(stage, 'wall', id, at(a.x, a.y), at(b.x, b.y));
  assert.ok(!r.error, r.error);
  const w = r.stage.objects.find(o => o.id === id), { geometry, ...rest } = patch;
  Object.assign(w, rest); if (geometry) w.geometry = { ...w.geometry, ...geometry };
  return r.stage;
};
const plan = (stage, areas, options = {}, extra = {}) => planRoute({ stage, firingAreas: areas, ...extra }, { candidateSpacingInches: 12, ...options });

test('one target, one area: one legal stop strictly inside the area', () => {
  const stage = blankStage([target('T1', 300, 60)]);
  const result = plan(stage, [box('A', 200, 300, 200, 120)]);
  assert.equal(result.status, 'complete');
  assert.equal(result.positions.length, 1);
  assert.ok(strictlyInside(result.positions[0].point, box('A', 200, 300, 200, 120).vertices));
  assert.deepEqual(result.positions[0].engagements.map(e => e.targetId), ['T1']);
  assert.equal(result.targets[0].status, 'covered');
  assert.ok(result.movementInches > 0);
  assert.ok(result.safety.checked.length && result.safety.notChecked.length, 'checked and not-checked lists are always reported');
});

test('a start inside the firing area with a clear view needs no movement', () => {
  const stage = blankStage([target('T1', 100, 60)]);
  const result = plan(stage, [box('A', 0, 380, 300, 100)]);
  assert.equal(result.status, 'complete');
  assert.equal(result.movementInches, 0);
  assert.deepEqual(result.positions[0].point, { x: 100, y: 440 });
});

test('safe angle covers the whole face: a centre inside the arc with an edge outside is not legal', () => {
  // A target turned edge-on (rotation 90) straddles the 90-degree line seen from the far left.
  const stage = blankStage([target('T1', 560, 400, 90)]);
  const { stage: normalized } = normalizeStage({ stage, firingAreas: [box('A', 20, 380, 40, 40)] }, {});
  const shooter = p(40, 401.5), face = normalized.targets[0];
  const centreDelta = headingDelta(headingTo(shooter, face.center), 270);
  assert.ok(centreDelta < 90, 'the centre alone would pass: ' + centreDelta);
  const check = checkEngagement(shooter, face, normalized, 90, 'occlude');
  assert.equal(check.legal, false); assert.equal(check.failure, 'OUTSIDE_SAFE_ANGLE');
  // The whole stage plan reports the reason when no stop can see the full face inside the arc.
  const sideways = plan(blankStage([target('T1', 560, 400, 0)]), [box('A', 20, 390, 40, 8)], { candidateSpacingInches: 2 });
  assert.equal(sideways.status, 'infeasible'); assert.deepEqual(sideways.targets[0].reasons, ['OUTSIDE_SAFE_ANGLE']);
});

test('engagements near the safe-angle limit are flagged with their margin', () => {
  const stage = blankStage([target('T1', 560, 320, 0)]);
  const result = plan(stage, [box('A', 20, 360, 40, 40)], { nearSafeAngleMarginDegrees: 30 });
  assert.equal(result.status, 'complete');
  const e = result.positions[0].engagements[0];
  assert.ok(e.safeMarginDegrees > 0 && e.safeMarginDegrees < 30 && e.nearSafeAngle, JSON.stringify(e));
  assert.equal(result.safety.nearSafeAngle.length, 1);
});

test('a tall wall blocks line of sight; a low wall under USPSA is seen over, but not under IDPA', () => {
  const tall = wall(blankStage([target('T1', 300, 60)]), 'W', p(150, 250), p(450, 250), { geometry: { height: 72 } });
  const tallResult = plan(tall, [box('A', 200, 300, 200, 120)]);
  assert.equal(tallResult.status, 'infeasible'); assert.deepEqual(tallResult.targets[0].reasons, ['OCCLUDED']);
  const low = wall(blankStage([target('T1', 300, 60)]), 'W', p(150, 250), p(450, 250), { geometry: { height: 36 } });
  const lowUSPSA = plan(low, [box('A', 200, 300, 200, 120)], { ruleset: 'USPSA' });
  assert.equal(lowUSPSA.status, 'complete');
  assert.ok(lowUSPSA.positions[0].engagements[0].overLowWall);
  assert.ok(lowUSPSA.assumptions.some(a => /lower than 69 in/.test(a)));
  const lowIDPA = plan(low, [box('A', 200, 300, 200, 120)], { ruleset: 'IDPA' });
  assert.equal(lowIDPA.status, 'infeasible', 'IDPA simulated walls extend infinitely');
});

test('a port lets the shot through a tall wall only within its opening', () => {
  let stage = wall(blankStage([target('T1', 300, 60)]), 'W', p(100, 250), p(500, 250), { geometry: { height: 72 } });
  const w = stage.objects.find(o => o.id === 'W');
  w.ports = [{ id: 'port', offset: 0, width: 24, height: 24, sill: 36 }];
  const result = plan(stage, [box('A', 200, 300, 200, 120)]);
  assert.equal(result.status, 'complete');
  const pos = result.positions[0].point;
  assert.ok(Math.abs(pos.x - 300) < 60, 'the stop lines up with the port: ' + JSON.stringify(pos));
});

test('no-shoots occlude under USPSA and only warn under IDPA', () => {
  const ns = { ...createObject('noShootTarget', 'NS', 300, 200), rotation: 0 };
  ns.geometry = { faceWidth: 120, faceHeight: 30 }; ns.position = { ...ns.position, z: 48 };
  const stage = blankStage([target('T1', 300, 60), ns]);
  const area = box('A', 260, 300, 80, 60);
  const uspsa = plan(stage, [area], { ruleset: 'USPSA' });
  assert.equal(uspsa.status, 'infeasible'); assert.deepEqual(uspsa.targets[0].reasons, ['OCCLUDED']);
  const idpa = plan(stage, [area], { ruleset: 'IDPA' });
  assert.equal(idpa.status, 'complete');
  assert.ok(idpa.positions[0].engagements[0].throughNoShoot);
  assert.ok(idpa.warnings.some(w => /non-threat/.test(w)));
});

test('a target restricted to one area is engaged from that area only', () => {
  const stage = blankStage([target('T1', 300, 60)]);
  const near = box('NEAR', 60, 380, 100, 80), far = box('FAR', 400, 300, 120, 80);
  const result = plan(stage, [near, far], {}, { targetProcedures: { T1: { areaIds: ['FAR'] } } });
  assert.equal(result.status, 'complete');
  assert.ok(strictlyInside(result.positions[0].point, far.vertices));
});

test('a firing area walled off from the start is reported as unreachable', () => {
  let stage = blankStage([target('T1', 300, 60)]);
  // Low walls (36 in) stop movement but, under USPSA, the target can still be seen over them.
  for (const [id, a, b] of [['w1', p(380, 280), p(560, 280)], ['w2', p(560, 280), p(560, 440)], ['w3', p(560, 440), p(380, 440)], ['w4', p(380, 440), p(380, 280)]])
    stage = wall(stage, id, a, b, { geometry: { height: 36 } });
  const result = plan(stage, [box('A', 410, 310, 120, 100)]);
  assert.equal(result.status, 'infeasible');
  assert.deepEqual(result.targets[0].reasons, ['UNREACHABLE']);
  assert.ok(result.targets[0].legalCandidateCount > 0);
});

test('walls that split the view force two positions, and the minimum is proven', () => {
  let stage = blankStage([target('L', 120, 60), target('R', 480, 60)]);
  // A long central wall: from the left area only L is visible, from the right area only R.
  stage = wall(stage, 'mid', p(300, 20), p(300, 400), { geometry: { height: 72 } });
  const result = plan(stage, [box('LA', 40, 340, 200, 120), box('RA', 360, 340, 200, 120)]);
  assert.equal(result.status, 'complete');
  assert.equal(result.positions.length, 2);
  assert.equal(result.diagnostics.minimumPositions, 2);
  assert.ok(result.diagnostics.exactPositions);
  assert.deepEqual(result.positions.map(pos => pos.engagements.map(e => e.targetId)), [['L'], ['R']], 'nearest area first');
});

test('partial plans list exactly which targets are uncovered and why', () => {
  let stage = blankStage([target('OK', 300, 60), target('HIDDEN', 100, 60)]);
  stage = wall(stage, 'box', p(20, 120), p(220, 120), { geometry: { height: 72 } });
  const result = plan(stage, [box('A', 250, 300, 100, 100)]);
  assert.equal(result.status, 'partial');
  const byId = Object.fromEntries(result.targets.map(t => [t.targetId, t]));
  assert.equal(byId.OK.status, 'covered');
  assert.equal(byId.HIDDEN.status, 'uncovered');
  assert.ok(byId.HIDDEN.reasons.length === 1);
});

test('invalid input explains itself instead of guessing', () => {
  const noAreas = plan(blankStage([target('T1', 300, 60)]), []);
  assert.equal(noAreas.status, 'invalid-input'); assert.match(noAreas.errors.join(' '), /No firing areas/);
  const noStart = blankStage([target('T1', 300, 60)]); noStart.objects = noStart.objects.filter(o => o.type !== 'start');
  assert.match(plan(noStart, [box('A', 0, 0, 100, 100)]).errors.join(' '), /no start/);
  assert.equal(plan(blankStage([]), [box('A', 0, 300, 600, 180)]).status, 'no-targets');
});

test('the planner is deterministic', () => {
  const stage = createDefaultStage('USPSA');
  const areas = [box('all', 0, 0, 480, 360)];
  const a = plan(stage, areas), b = plan(stage, areas);
  const strip = r => JSON.stringify({ ...r, diagnostics: { ...r.diagnostics, durationMs: 0 } });
  assert.equal(strip(a), strip(b));
});

test('minimumCover matches brute force on random instances', () => {
  let seed = 7; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let trial = 0; trial < 60; trial++) {
    const targets = 2 + Math.floor(rand() * 6), count = 3 + Math.floor(rand() * 7);
    const masks = Array.from({ length: count }, () => BigInt(1 + Math.floor(rand() * ((1 << targets) - 1))));
    const required = masks.reduce((a, m) => a | m, 0n);
    let best = Infinity;
    for (let s = 1; s < (1 << count); s++) {
      let u = 0n, n = 0; for (let i = 0; i < count; i++) if (s & (1 << i)) { u |= masks[i]; n++; }
      if (u === required) best = Math.min(best, n);
    }
    assert.equal(minimumCover(masks, required, { nodes: 0, limit: 1e6 }), best, `trial ${trial}`);
  }
  assert.equal(minimumCover([1n], 3n, { nodes: 0, limit: 1e6 }), Infinity);
});

test('shortestCoveringWalk matches brute force over orderings on random instances', () => {
  let seed = 11; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (let trial = 0; trial < 40; trial++) {
    const targets = 2 + Math.floor(rand() * 4), count = 3 + Math.floor(rand() * 4);
    const pool = Array.from({ length: count }, (_, i) => ({ id: 'c' + i, point: p(rand() * 500, rand() * 500), mask: BigInt(1 + Math.floor(rand() * ((1 << targets) - 1))) }));
    const required = pool.reduce((a, c) => a | c.mask, 0n), start = p(0, 0);
    const k = minimumCover(pool.map(c => c.mask), required, { nodes: 0, limit: 1e6 });
    // Brute force: every ordered selection of k distinct candidates that covers everything.
    let best = Infinity;
    const permute = (chosen, covered, dist) => {
      if (chosen.length === k) { if (covered === required) best = Math.min(best, dist); return; }
      for (const c of pool) if (!chosen.includes(c)) permute([...chosen, c], covered | c.mask, dist + d(chosen.length ? chosen.at(-1).point : start, c.point));
    };
    permute([], 0n, 0);
    const result = shortestCoveringWalk(start, pool, required, k, d, 1e7);
    assert.ok(result.complete);
    assert.ok(Math.abs(result.distance - best) < 1e-9, `trial ${trial}: ${result.distance} vs ${best}`);
    assert.equal(result.order.length, k);
  }
});

test('representatives keep the point nearest the start for every coverage set', () => {
  const start = p(0, 0);
  const cands = [0, 10, 20, 30, 40, 50].map((x, i) => ({ id: 'c' + i, point: p(x + 5, 0), mask: 1n }));
  const { pool, reduced } = representatives(cands, start, 3);
  assert.ok(reduced); assert.equal(pool.length, 3);
  assert.ok(pool.some(c => c.id === 'c0'));
});

test('adopted plans are ordinary routes; detours become bends and the existing legality analysis agrees', () => {
  let stage = blankStage([target('T1', 480, 60)]);
  // A wall between the start and the firing area forces a detour.
  stage = wall(stage, 'block', p(20, 360), p(330, 360), { geometry: { height: 72 } });
  const area = box('A', 400, 150, 150, 120);
  const current = createPlan(); current.route = createRoute('r');
  current.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [area] };
  const result = planRoute(snapshotFromPlan(stage, current));
  assert.equal(result.status, 'complete');
  assert.ok(result.legs[0].length > 2, 'the walk bends around the wall');
  const route = planToStageRoute(result, stage, current);
  assert.ok(isStageRoute(route));
  assert.equal(route.connections.length, 1);
  assert.equal(route.connections[0].fromId, 'start');
  const analysis = analyzeEngagements(stage, route);
  assert.deepEqual(analysis.coveredTargetIds, ['T1']);
  assert.ok(analysis.segments.every(s => s.traversable), 'the analysis follows the bends instead of walking through the wall');
  const evaluation = evaluateRoute(stage, { ...current, route }, route, null);
  assert.ok(Math.abs(evaluation.distance - result.movementInches) < 1e-6, `${evaluation.distance} vs ${result.movementInches}`);
});

test('the default stage plans quickly', () => {
  const stage = createDefaultStage('USPSA');
  const started = Date.now();
  const result = plan(stage, [box('all', 0, 0, 480, 360)]);
  assert.equal(result.status, 'complete');
  assert.ok(Date.now() - started < 5000, 'took ' + (Date.now() - started) + ' ms');
});

test('engagements at a stop run left to right across downrange (IDPA: near to far)', () => {
  const stage = blankStage([target('FAR_RIGHT', 450, 40), target('NEAR_LEFT', 200, 200), target('MID', 320, 120)]);
  const area = [box('A', 250, 380, 100, 80)];
  const uspsa = plan(stage, area, { ruleset: 'USPSA' });
  assert.equal(uspsa.positions.length, 1);
  assert.deepEqual(uspsa.positions[0].engagements.map(e => e.targetId), ['NEAR_LEFT', 'MID', 'FAR_RIGHT']);
  const idpa = plan(stage, area, { ruleset: 'IDPA' });
  const order = idpa.positions[0].engagements.map(e => e.targetId);
  assert.equal(order[0], 'NEAR_LEFT'); assert.equal(order.at(-1), 'FAR_RIGHT');
  assert.ok(idpa.safety.notChecked.some(n => /IDPA cover/.test(n)), 'IDPA limits are reported');
});

test('travel limited to firing areas cannot cross a gap between areas', () => {
  // The wall hides T1 from the start area; it is only visible from FAR, reachable by walking around the wall.
  const stage = wall(blankStage([target('T1', 500, 60)]), 'screen', p(20, 380), p(300, 380), { geometry: { height: 72 } });
  const areas = [box('START', 40, 400, 120, 70), box('FAR', 420, 200, 120, 100)];
  assert.equal(plan(stage, areas, { travel: 'anywhere' }).status, 'complete');
  const limited = plan(stage, areas, { travel: 'within-areas' });
  assert.equal(limited.status, 'infeasible');
  assert.deepEqual(limited.targets[0].reasons, ['UNREACHABLE']);
});

test('Route AI QUERY_PLAN resolves to computed V2 facts, never model arithmetic', () => {
  const A = require('../src/planning/routeAssistant/index.ts');
  const { resolveDecision, validateDecision } = require('../src/planning/routeAI/resolve.ts');
  const { intents } = require('../src/planning/routeAI/types.ts');
  assert.ok(intents.includes('QUERY_PLAN'));
  const stage = blankStage([target('SEEN', 300, 60), target('HIDDEN', 100, 60)]);
  const walled = wall(stage, 'screen', p(20, 120), p(220, 120), { geometry: { height: 72 } });
  const current = createPlan(); current.route = createRoute('r');
  current.route.engagementRules = { ...defaultEngagementRules(walled), firingAreas: [box('A', 250, 300, 100, 100)] };
  const context = A.createRouteAssistantContext(walled, current);
  const decision = { intent: 'QUERY_PLAN' };
  assert.ok(validateDecision(decision) !== false);
  const resolution = resolveDecision(context, decision, 'new-id');
  assert.deepEqual(resolution.command, { type: 'ANSWER_ONLY', query: { type: 'PLAN_DIAGNOSTICS' } });
  const result = A.executeRouteAssistantCommand(context, resolution.command);
  assert.equal(result.kind, 'answer');
  assert.equal(result.data.source, 'Route Planner V2 (computed)');
  assert.equal(result.data.status, 'partial');
  assert.deepEqual(result.data.uncovered.map(u => u.reasons), [['OCCLUDED']]);
  assert.equal(result.data.positions.length, 1);
});

test('the async planner returns the same plan in slices and can be cancelled', async () => {
  const { planRouteAsync } = require('../src/planning/v2/index.ts');
  const stage = createDefaultStage('USPSA'), areas = [box('all', 0, 0, 480, 360)];
  const strip = r => JSON.stringify({ ...r, diagnostics: { ...r.diagnostics, durationMs: 0 } });
  const sync = plan(stage, areas);
  let ticks = 0; const timer = setInterval(() => ticks++, 0);
  const sliced = await planRouteAsync({ stage, firingAreas: areas }, { candidateSpacingInches: 12 }, undefined, 1);
  clearInterval(timer);
  assert.equal(strip(sliced), strip(sync));
  assert.ok(ticks > 0, 'the event loop ran while planning');
  const controller = new AbortController();
  const pending = planRouteAsync({ stage, firingAreas: areas }, { candidateSpacingInches: 12 }, controller.signal, 1);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});
