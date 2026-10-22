// Regression tests for the independent review of Route Planner V2 (docs/route-planner-v2.md, "Review fixes").
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const { planRoute, planRouteAsync, planToStageRoute, snapshotFromPlan, optionsFromPlan } = require('../src/planning/v2/index.ts');
const { minimumCover, shortestCoveringWalk, orderedAdvance } = require('../src/planning/v2/optimizeRoute.ts');
const { normalizeStage } = require('../src/planning/v2/normalizeStage.ts');
const { strictlyInside, inside } = require('../src/planning/routeSolver/traversability.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { addSegment } = require('../src/stage/segments.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
const { analyzeEngagements, defaultEngagementRules } = require('../src/planning/engagements.ts');
const p = (x, y) => ({ x, y }), at = (x, y, z = 0) => ({ space: 'stage', x, y, z });
const box = (id, x, y, w, h) => ({ id, vertices: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] });

function blankStage(objects = [], size = { width: 600, depth: 480 }) {
  const stage = createDefaultStage(undefined, { size });
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
const order = r => r.positions.map(pos => pos.engagements.map(e => e.targetId));
const segDist = (q, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l)) : 0; return Math.hypot(q.x - a.x - dx * t, q.y - a.y - dy * t); };
const edgeClearance = (q, areas) => Math.max(-1, ...areas.filter(a => strictlyInside(q, a.vertices)).map(a => Math.min(...a.vertices.map((v, i) => segDist(q, v, a.vertices[(i + 1) % a.vertices.length])))));
function routePlan(stage, rules) {
  const current = createPlan(); current.route = createRoute('r');
  current.route.engagementRules = { ...defaultEngagementRules(stage), ...rules };
  return current;
}

// Fix 1: the planner honours the route's own settings.
test('route settings reach the planner: half angle, travel limit and safe direction (with a mismatch warning)', () => {
  const stage = blankStage([target('T1', 560, 320, 0)]);
  const areas = [box('A', 20, 360, 40, 40)];
  const wide = routePlan(stage, { firingAreas: areas });
  assert.equal(planRoute(snapshotFromPlan(stage, wide), optionsFromPlan(wide)).status, 'complete');
  const narrow = routePlan(stage, { firingAreas: areas, safeHalfAngleDegrees: 60 });
  const narrowed = planRoute(snapshotFromPlan(stage, narrow), optionsFromPlan(narrow));
  assert.equal(narrowed.status, 'infeasible'); assert.deepEqual(narrowed.targets[0].reasons, ['OUTSIDE_SAFE_ANGLE']);
  assert.equal(narrowed.safety.safeHalfAngleDegrees, 60);

  const screened = wall(blankStage([target('T1', 500, 60)]), 'screen', p(20, 380), p(300, 380), { geometry: { height: 72 } });
  const split = [box('START', 40, 400, 120, 70), box('FAR', 420, 200, 120, 100)];
  const limited = routePlan(screened, { firingAreas: split, allowOutsideTravel: false });
  assert.deepEqual(optionsFromPlan(limited).travel, 'within-areas');
  assert.deepEqual(planRoute(snapshotFromPlan(screened, limited), optionsFromPlan(limited)).targets[0].reasons, ['UNREACHABLE']);

  const sideways = routePlan(stage, { firingAreas: [box('A', 20, 300, 200, 160)], safeDirectionDegrees: 0 });
  const turned = planRoute(snapshotFromPlan(stage, sideways), optionsFromPlan(sideways));
  assert.equal(turned.safety.downrangeDegrees, 0);
  assert.ok(turned.warnings.some(w => /differs from the stage's downrange/.test(w)), turned.warnings.join(' | '));
  assert.ok(!planRoute(snapshotFromPlan(stage, wide), optionsFromPlan(wide)).warnings.some(w => /differs/.test(w)));
});

test('"engage after" orders targets at one stop, and the adopted route passes the legality analysis', () => {
  const stage = blankStage([target('FAR_RIGHT', 450, 40), target('NEAR_LEFT', 200, 200), target('MID', 320, 120)]);
  const current = routePlan(stage, { firingAreas: [box('A', 250, 380, 100, 80)], targetProcedures: { NEAR_LEFT: { afterTargetIds: ['FAR_RIGHT'] } } });
  const result = planRoute(snapshotFromPlan(stage, current), optionsFromPlan(current));
  assert.equal(result.status, 'complete');
  assert.deepEqual(order(result), [['MID', 'FAR_RIGHT', 'NEAR_LEFT']]);
  const analysis = analyzeEngagements(stage, planToStageRoute(result, stage, current));
  assert.deepEqual(analysis.coveredTargetIds.sort(), ['FAR_RIGHT', 'MID', 'NEAR_LEFT']);
});

test('"engage after" across stops changes the visiting order, or adds a return visit, and the minimum stays proven', () => {
  let stage = blankStage([target('L', 120, 60), target('L2', 160, 60), target('R', 480, 60)]);
  stage = wall(stage, 'mid', p(300, 20), p(300, 400), { geometry: { height: 72 } });
  const areas = [box('LA', 40, 340, 200, 120), box('RA', 360, 340, 200, 120)];
  assert.deepEqual(order(plan(stage, areas)), [['L', 'L2'], ['R']], 'nearest area first without procedures');
  const flipped = plan(stage, areas, {}, { targetProcedures: { L: { afterTargetIds: ['R'] }, L2: { afterTargetIds: ['R'] } } });
  assert.equal(flipped.status, 'complete');
  assert.deepEqual(order(flipped), [['R'], ['L', 'L2']]);
  assert.ok(flipped.diagnostics.exactPositions); assert.equal(flipped.diagnostics.minimumPositions, 2);
  // L, then R, then L2: two areas but three stops are needed, and that minimum is proven.
  const back = plan(stage, areas, {}, { targetProcedures: { R: { afterTargetIds: ['L'] }, L2: { afterTargetIds: ['R'] } } });
  assert.equal(back.status, 'complete');
  assert.deepEqual(order(back), [['L'], ['R'], ['L2']]);
  assert.equal(back.diagnostics.minimumPositions, 3); assert.ok(back.diagnostics.exactPositions);
  const current = routePlan(stage, { firingAreas: areas, targetProcedures: { R: { afterTargetIds: ['L'] }, L2: { afterTargetIds: ['R'] } } });
  const adopted = planToStageRoute(planRoute(snapshotFromPlan(stage, current), optionsFromPlan(current)), stage, current);
  assert.deepEqual(analyzeEngagements(stage, adopted).coveredTargetIds.sort(), ['L', 'L2', 'R']);
});

test('impossible "engage after" procedures are reported, never planned out of order', () => {
  let stage = blankStage([target('A', 250, 60), target('B', 350, 60), target('HIDDEN', 100, 60), target('AFTER_HIDDEN', 300, 100)]);
  stage = wall(stage, 'box', p(20, 120), p(200, 120), { geometry: { height: 72 } });
  const areas = [box('Z', 250, 300, 100, 100)];
  const cycle = plan(stage, areas, {}, { targetProcedures: { A: { afterTargetIds: ['B'] }, B: { afterTargetIds: ['A'] } } });
  const byId = r => Object.fromEntries(r.targets.map(t => [t.targetId, t]));
  assert.equal(cycle.status, 'partial');
  assert.deepEqual(byId(cycle).A.reasons, ['PROCEDURE_ORDER']); assert.deepEqual(byId(cycle).B.reasons, ['PROCEDURE_ORDER']);
  assert.ok(cycle.warnings.some(w => /cycle/.test(w)), cycle.warnings.join(' | '));
  const ghost = plan(stage, areas, {}, { targetProcedures: { A: { afterTargetIds: ['GHOST'] } } });
  assert.deepEqual(byId(ghost).A.reasons, ['PROCEDURE_ORDER']);
  assert.ok(ghost.warnings.some(w => /GHOST is not an engageable target/.test(w)));
  const hidden = plan(stage, areas, {}, { targetProcedures: { AFTER_HIDDEN: { afterTargetIds: ['HIDDEN'] } } });
  assert.deepEqual(byId(hidden).HIDDEN.reasons, ['OCCLUDED']);
  assert.deepEqual(byId(hidden).AFTER_HIDDEN.reasons, ['PROCEDURE_ORDER']);
  assert.equal(byId(hidden).A.status, 'covered');
  assert.notEqual(hidden.status, 'complete');
});

test('precedence-aware walk search matches brute force on random instances', () => {
  let seed = 23; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (let trial = 0; trial < 40; trial++) {
    const targets = 2 + Math.floor(rand() * 3), count = 3 + Math.floor(rand() * 3), start = p(0, 0);
    const pool = Array.from({ length: count }, (_, i) => ({ id: 'c' + i, point: p(rand() * 400, rand() * 400), mask: BigInt(1 + Math.floor(rand() * ((1 << targets) - 1))) }));
    const required = pool.reduce((a, c) => a | c.mask, 0n);
    const pre = new Map();
    for (let i = 0; i < targets; i++) { let m = 0n; for (let j = 0; j < i; j++) if (rand() < 0.4 && (required >> BigInt(j)) & 1n) m |= 1n << BigInt(j); if ((required >> BigInt(i)) & 1n) pre.set(1n << BigInt(i), m); }
    const advance = orderedAdvance(pre);
    // Brute force: sequences (stops may repeat) where each stop engages something new; fewest stops, then shortest.
    let bestLen = Infinity, bestDist = Infinity;
    const walk = (at, engaged, len, dist) => {
      if (engaged === required) { if (len < bestLen || (len === bestLen && dist < bestDist - 1e-9)) { bestLen = len; bestDist = dist; } return; }
      if (len >= targets) return;
      for (const c of pool) { const next = advance(engaged, c.mask); if (next !== engaged) walk(c.point, next, len + 1, dist + d(at, c.point)); }
    };
    walk(start, 0n, 0, 0);
    let found = null;
    for (let k = minimumCover(pool.map(c => c.mask), required, { nodes: 0, limit: 1e6 }); k <= targets && !found; k++) {
      const r = shortestCoveringWalk(start, pool, required, k, d, 1e7, advance);
      assert.ok(r.complete);
      if (r.order.length) found = r;
    }
    assert.ok(found, `trial ${trial}`);
    assert.equal(found.order.length, bestLen, `trial ${trial}`);
    assert.ok(Math.abs(found.distance - bestDist) < 1e-9, `trial ${trial}: ${found.distance} vs ${bestDist}`);
  }
});

// Fix 2: one legality kernel for the planner and the analysis.
test('IDPA without positions of cover is reported the same way by the planner and the analysis', () => {
  const stage = blankStage([target('T1', 300, 60)]);
  const current = routePlan(stage, { ruleset: 'IDPA', firingAreas: [box('A', 200, 300, 200, 120)] });
  const result = planRoute(snapshotFromPlan(stage, current), optionsFromPlan(current));
  assert.equal(result.status, 'infeasible'); assert.deepEqual(result.targets[0].reasons, ['IDPA_AREAS_REQUIRED']);
  current.route.positions = [{ id: 'w', label: 'W', position: at(300, 360), visibleTargetIds: [], engagedTargetIds: ['T1'] }];
  assert.deepEqual(analyzeEngagements(stage, current.route).coveredTargetIds, []);
  current.route.engagementRules.targetProcedures = { T1: { areaIds: ['A'] } };
  assert.deepEqual(analyzeEngagements(stage, current.route).coveredTargetIds, ['T1']);
  assert.equal(planRoute(snapshotFromPlan(stage, current), optionsFromPlan(current)).status, 'complete');
});

function randomStage(rand) {
  let stage = blankStage([]);
  const n = 2 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) stage.objects.push(target('T' + i, 40 + rand() * 520, 30 + rand() * 200, Math.floor(rand() * 8) * 22.5));
  if (rand() < 0.5) { const ns = { ...createObject('noShootTarget', 'NS', 100 + rand() * 400, 120 + rand() * 120), rotation: Math.floor(rand() * 4) * 45 }; if (rand() < 0.5) ns.position = { ...ns.position, z: 0 }; stage.objects.push(ns); }
  const walls = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < walls; i++) {
    const x = 60 + rand() * 480, y = 120 + rand() * 200, a = rand() * Math.PI, l = 40 + rand() * 120;
    const r = addSegment(stage, 'wall', 'W' + i, at(x, y), at(Math.min(595, Math.max(5, x + Math.cos(a) * l)), Math.min(475, Math.max(5, y + Math.sin(a) * l))));
    if (!r.error) { stage = r.stage; const w = stage.objects.find(o => o.id === 'W' + i); w.geometry.height = rand() < 0.4 ? 36 : 72; if (rand() < 0.3) w.ports = [{ id: 'p', offset: 0, width: 24, height: 24, sill: 30 }]; }
  }
  const areas = [box('A', 20 + rand() * 100, 300 + rand() * 40, 160 + rand() * 200, 100 + rand() * 30)];
  if (rand() < 0.6) areas.push(box('B', 300 + rand() * 150, 200 + rand() * 150, 80 + rand() * 60, 60 + rand() * 60));
  return { stage, areas };
}

test('planner and legality analysis agree on every adopted plan (random stages)', () => {
  let seed = 41; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let checked = 0;
  for (let trial = 0; trial < 30; trial++) {
    const { stage, areas } = randomStage(rand);
    const current = routePlan(stage, { firingAreas: areas });
    const result = planRoute(snapshotFromPlan(stage, current), { ...optionsFromPlan(current), candidateSpacingInches: 24 });
    if (!result.positions.length) continue;
    checked++;
    const analysis = analyzeEngagements(stage, planToStageRoute(result, stage, current));
    const planned = result.targets.filter(t => t.status === 'covered').map(t => t.targetId).sort();
    assert.deepEqual([...analysis.coveredTargetIds].sort(), planned, `trial ${trial}: ${analysis.warnings.join(' | ')}`);
    assert.ok(analysis.segments.every(s => s.traversable), `trial ${trial}: an adopted leg is blocked`);
  }
  assert.ok(checked >= 20, 'enough random stages produced plans: ' + checked);
});

test('a saved stationary order skips an illegal target instead of dropping the rest', () => {
  const stage = createDefaultStage(); stage.stage = { width: 400, depth: 400 };
  stage.objects = [createObject('start', 'start', 20, 300), createObject('cardboardTarget', 't1', 200, 100), createObject('cardboardTarget', 'behind', 380, 380)];
  const route = createRoute('route'); route.engagementRules = { ...defaultEngagementRules(), firingAreas: [box('a', 0, 0, 400, 400)] };
  route.positions = [{ id: 'w1', label: 'End', position: at(380, 300), visibleTargetIds: [], engagedTargetIds: ['behind', 't1'] }];
  const result = analyzeEngagements(stage, route);
  assert.deepEqual(result.coveredTargetIds, ['t1']);
  assert.ok(result.warnings.some(w => /behind cannot be engaged here/.test(w)), result.warnings.join(' | '));
});

// Fix 3: refinement never trades safety margin for distance.
test('refinement keeps stops off the fault line and never loosens a safety margin (random stages)', () => {
  const stage = blankStage([target('T1', 300, 60)]);
  stage.objects[0].position = { ...stage.objects[0].position, x: 100, y: 440 };
  const areas = [box('A', 200, 300, 200, 120)];
  const refined = plan(stage, areas), raw = plan(stage, areas, { refine: false });
  assert.ok(refined.movementInches < raw.movementInches, 'refinement still shortens the walk');
  assert.ok(edgeClearance(refined.positions[0].point, areas) >= 3 - 1e-6, 'at least 3 in inside the area: ' + JSON.stringify(refined.positions[0].point));
  let seed = 5; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let trial = 0; trial < 25; trial++) {
    const s = randomStage(rand);
    const a = plan(s.stage, s.areas, { candidateSpacingInches: 24 }), b = plan(s.stage, s.areas, { candidateSpacingInches: 24, refine: false });
    assert.equal(a.positions.length, b.positions.length);
    assert.ok(a.movementInches <= b.movementInches + 1e-9, `trial ${trial}`);
    a.positions.forEach((pos, i) => {
      const before = b.positions[i];
      assert.ok(edgeClearance(pos.point, s.areas) >= Math.min(3, edgeClearance(before.point, s.areas)) - 1e-6, `trial ${trial}: area margin`);
      for (const e of pos.engagements) {
        const was = before.engagements.find(x => x.targetId === e.targetId);
        assert.ok(was, `trial ${trial}: same assignment`);
        assert.ok(e.safeMarginDegrees >= Math.min(was.safeMarginDegrees, 10) - 1e-9, `trial ${trial}: safe margin ${e.safeMarginDegrees} < ${was.safeMarginDegrees}`);
        assert.ok(e.visibleFraction >= was.visibleFraction - 1e-9, `trial ${trial}: visibility`);
        assert.ok(was.throughNoShoot || !e.throughNoShoot); assert.ok(was.overLowWall || !e.overLowWall);
      }
    });
  }
});

// Fix 4: long searches yield, respect a time limit, and cancel promptly.
function bigStage() {
  let seed = 3; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const W = 1800, D = 1200;
  let stage = createDefaultStage(undefined, { size: { width: W, depth: D } });
  stage.objects = [createObject('start', 'start', 100, D - 40)];
  for (let i = 0; i < 40; i++) stage.objects.push(target('T' + i, 50 + rand() * (W - 100), 30 + rand() * (D * 0.45), Math.floor(rand() * 8) * 22.5));
  for (let i = 0; i < 40; i++) {
    const x = 60 + rand() * (W - 120), y = 120 + rand() * (D - 240), a = rand() * Math.PI, l = 60 + rand() * 120;
    const r = addSegment(stage, 'wall', 'W' + i, at(x, y), at(Math.min(W - 5, Math.max(5, x + Math.cos(a) * l)), Math.min(D - 5, Math.max(5, y + Math.sin(a) * l))));
    if (!r.error) stage = r.stage;
  }
  return { stage, firingAreas: [box('A', 20, D * 0.55, W - 40, D * 0.45 - 20), box('B', 20, D * 0.3, 300, 200), box('C', W - 320, D * 0.3, 300, 200)] };
}
test('a 40-target, 40-wall stage plans in slices, stops at its time limit, and cancels promptly', async () => {
  const snapshot = bigStage();
  let last = Date.now(), worst = 0;
  const timer = setInterval(() => { const now = Date.now(); worst = Math.max(worst, now - last); last = now; }, 1);
  const started = Date.now();
  const result = await planRouteAsync(snapshot, { maxSearchMs: 1 });
  clearInterval(timer);
  assert.ok(result.positions.length > 0);
  assert.equal(result.diagnostics.stoppedBy, 'time');
  assert.ok(result.warnings.some(w => /time limit/.test(w)));
  assert.ok(worst < 1000, `the event loop was blocked for ${worst} ms`);
  assert.ok(Date.now() - started < 20000);
  const controller = new AbortController();
  const pending = planRouteAsync(snapshot, {}, controller.signal);
  await new Promise(r => setTimeout(r, 100));
  const aborted = Date.now(); controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.ok(Date.now() - aborted < 1000, `cancel took ${Date.now() - aborted} ms`);
});

// Fix 5: travel limited to firing areas can turn the inside corner of an L-shaped area.
test('travel within an L-shaped firing area goes round its inside corner', () => {
  const stage = blankStage([target('T1', 90, 20)]);
  stage.objects[0].position = { ...stage.objects[0].position, x: 500, y: 440 };
  const L = { id: 'L', vertices: [p(40, 100), p(140, 100), p(140, 360), p(560, 360), p(560, 460), p(40, 460)] };
  const top = box('TOP', 50, 110, 80, 60);
  const result = plan(stage, [L, top], { travel: 'within-areas' }, { targetProcedures: { T1: { areaIds: ['TOP'] } } });
  assert.equal(result.status, 'complete', JSON.stringify(result.targets));
  const leg = result.legs[0];
  assert.ok(leg.length > 2, 'the walk bends at the corner');
  for (let i = 1; i < leg.length; i++) for (const t of [0.25, 0.5, 0.75]) {
    const q = p(leg[i - 1].x + (leg[i].x - leg[i - 1].x) * t, leg[i - 1].y + (leg[i].y - leg[i - 1].y) * t);
    assert.ok(inside(q, L.vertices), 'the walk stays inside the area: ' + JSON.stringify(q));
  }
});

// Minor findings.
test('a target mounted flush on a wall is visible from the front', () => {
  let stage = blankStage([target('T1', 300, 102)]);
  stage = wall(stage, 'backer', p(200, 100), p(400, 100), { geometry: { height: 96, thickness: 4 } });
  const result = plan(stage, [box('A', 200, 300, 200, 120)]);
  assert.equal(result.status, 'complete', JSON.stringify(result.targets));
});

test('a sight line that crosses a lower no-shoot in plan view is allowed but recorded as an assumption', () => {
  const ns = { ...createObject('noShootTarget', 'NS', 300, 200), rotation: 0 };
  ns.geometry = { faceWidth: 120, faceHeight: 30 }; ns.position = { ...ns.position, z: 0 };
  const stage = blankStage([target('T1', 300, 60), ns]);
  const { stage: normalized } = normalizeStage({ stage, firingAreas: [box('A', 260, 300, 80, 60)] }, {});
  assert.ok(normalized.noShoots[0].top < normalized.targets[0].bottom, 'faces do not overlap vertically');
  const result = plan(stage, [box('A', 260, 300, 80, 60)], { ruleset: 'USPSA' });
  assert.equal(result.status, 'complete');
  assert.ok(result.assumptions.some(a => /passing above or below/.test(a)), result.assumptions.join(' | '));
});

test('a start inside the body clearance of a wall walks from the nearest clear point', () => {
  let stage = blankStage([target('T1', 300, 60)]);
  stage = wall(stage, 'rail', p(40, 445), p(160, 445), { geometry: { height: 36, thickness: 4 } });
  const result = plan(stage, [box('A', 200, 300, 200, 120)]);
  assert.equal(result.status, 'complete', result.errors.join(' '));
  assert.deepEqual(result.legs[0][0], { x: 100, y: 440 }, 'the walk is drawn from the real start');
  assert.ok(result.warnings.some(w => /nearest clear point/.test(w)));
  const current = routePlan(stage, { firingAreas: [box('A', 200, 300, 200, 120)] });
  const adopted = planToStageRoute(planRoute(snapshotFromPlan(stage, current), optionsFromPlan(current)), stage, current);
  const evaluation = evaluateRoute(stage, { ...current, route: adopted }, adopted, null);
  assert.ok(Math.abs(evaluation.distance - result.movementInches) < 1e-6, `${evaluation.distance} vs ${result.movementInches}`);
});

test('the assistant explains a leg along its drawn bends, not the straight line', () => {
  const A = require('../src/planning/routeAssistant/index.ts');
  let stage = blankStage([target('T1', 480, 60)]);
  stage = wall(stage, 'block', p(20, 360), p(330, 360), { geometry: { height: 72 } });
  const current = routePlan(stage, { firingAreas: [box('A', 400, 150, 150, 120)] });
  const result = planRoute(snapshotFromPlan(stage, current), optionsFromPlan(current));
  current.route = planToStageRoute(result, stage, current);
  const context = A.createRouteAssistantContext(stage, current);
  const facts = A.explainRouteSegment(context, 'START', current.route.positions[0].id);
  assert.ok(facts.bendCount > 0);
  assert.ok(Math.abs(facts.distanceInches - result.movementInches) < 1e-6, `${facts.distanceInches} vs ${result.movementInches}`);
  assert.ok(!facts.stageObjectIds.includes('block'), 'the drawn path goes round the wall');
});
