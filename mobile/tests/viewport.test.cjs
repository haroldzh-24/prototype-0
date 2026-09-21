const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(
  fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, file);
const { advanceViewport, fitViewport, sampleTouches, zoomViewport } = require('../src/editor/viewportGestures.ts');
const C = require('../src/stage/coordinates.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
const size = { width: 390, height: 550 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('pinch and pan preserve frozen physical document, plan, and route evaluation', () => {
  const stage = createDefaultStage(), plan = createPlan(), route = createRoute('route');
  route.positions.push({ id: 'p1', label: 'P1', position: { space: 'stage', x: 240, y: 180, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] });
  plan.route = route;
  const freeze = o => { Object.freeze(o); Object.values(o).forEach(v => { if (v && typeof v === 'object') freeze(v); }); };
  freeze(stage); freeze(plan);
  const before = JSON.stringify({ stage, plan }), evaluation = evaluateRoute(stage, plan, route, null);
  let state = fitViewport();
  state = advanceViewport(state, sampleTouches([{ x: 50, y: 100 }]), sampleTouches([{ x: 90, y: 140 }]), size);
  state = advanceViewport(state, sampleTouches([{ x: 50, y: 100 }, { x: 150, y: 100 }]), sampleTouches([{ x: 20, y: 130 }, { x: 220, y: 130 }]), size);
  assert.equal(state.zoom, 2);
  assert.equal(JSON.stringify({ stage, plan }), before);
  assert.deepEqual(evaluateRoute(stage, plan, route, null), evaluation);
});

test('pinch keeps the physical point beneath its moving midpoint', () => {
  const stage = createDefaultStage(), state = { zoom: 1.25, pan: { x: 31, y: -17 } };
  const previous = sampleTouches([{ x: 80, y: 90 }, { x: 180, y: 90 }]);
  const next = sampleTouches([{ x: 50, y: 150 }, { x: 250, y: 150 }]);
  const physical = C.viewportToStage({ space: 'viewport', ...previous.center }, C.createViewportTransform(stage.stage, size, state), 48);
  const changed = advanceViewport(state, previous, next, size);
  const screen = C.stageToViewport(physical, C.createViewportTransform(stage.stage, size, changed));
  near(screen.x, next.center.x); near(screen.y, next.center.y);
});

test('Fit returns a fresh centered viewport valid at phone and landscape sizes', () => {
  assert.notEqual(fitViewport().pan, fitViewport().pan);
  for (const viewport of [size, { width: 844, height: 240 }, { width: 320, height: 300 }]) {
    const stage = createDefaultStage().stage, transform = C.createViewportTransform(stage, viewport, fitViewport());
    assert.ok(transform.scale > 0 && Number.isFinite(transform.scale));
    assert.ok(transform.offsetX >= 0 && transform.offsetY >= 0);
    assert.ok(stage.width * transform.scale <= viewport.width + 1e-8);
    assert.ok(stage.depth * transform.scale <= viewport.height + 1e-8);
  }
});

test('zoom clamps at 50–300 percent while maintaining the anchor', () => {
  for (const requested of [0.01, 10]) {
    const state = { zoom: 1, pan: { x: 30, y: 20 } }, anchor = { x: 75, y: 130 };
    const stage = createDefaultStage().stage;
    const physical = C.viewportToStage({ space: 'viewport', ...anchor }, C.createViewportTransform(stage, size, state));
    const next = zoomViewport(state, requested, anchor, size);
    assert.equal(next.zoom, requested < 1 ? 0.5 : 3);
    const result = C.stageToViewport(physical, C.createViewportTransform(stage, size, next));
    near(result.x, anchor.x); near(result.y, anchor.y);
  }
});

test('adding or releasing a finger rebases without jumps; remaining finger pans', () => {
  const one = sampleTouches([{ x: 40, y: 60 }]), two = sampleTouches([{ x: 40, y: 60 }, { x: 160, y: 200 }]);
  const state = fitViewport();
  assert.deepEqual(advanceViewport(state, one, two, size), state);
  assert.deepEqual(advanceViewport(state, two, one, size), state);
  const result = advanceViewport(state, one, sampleTouches([{ x: 70, y: 45 }]), size);
  assert.deepEqual(result, { zoom: 1, pan: { x: 30, y: -15 } });
  assert.deepEqual(advanceViewport(result, one, sampleTouches([]), size), result);
});

test('coincident fingers do not produce invalid zoom or offsets', () => {
  const same = sampleTouches([{ x: 10, y: 20 }, { x: 10, y: 20 }]);
  const result = advanceViewport(fitViewport(), same, sampleTouches([{ x: 20, y: 40 }, { x: 40, y: 40 }]), size);
  assert.ok([result.zoom, result.pan.x, result.pan.y].every(Number.isFinite));
});

test('object delta inversion stays exact after viewport gestures', () => {
  const stage = createDefaultStage(), item = stage.objects[0];
  const state = advanceViewport(fitViewport(), sampleTouches([{ x: 50, y: 50 }, { x: 150, y: 50 }]), sampleTouches([{ x: 80, y: 30 }, { x: 280, y: 30 }]), size);
  const transform = C.createViewportTransform(stage.stage, size, state);
  const a = C.stageToViewport(item.position, transform);
  const moved = C.moveByViewportDelta(item.position, { x: 26, y: -13 }, transform);
  const b = C.stageToViewport(moved, transform);
  near(b.x - a.x, 26); near(b.y - a.y, -13); assert.equal(moved.z, item.position.z);
});
