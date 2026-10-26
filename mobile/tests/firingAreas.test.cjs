// Drawing firing areas on the plan: geometry helpers (src/planning/firingAreaEditing.ts).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const A = require('../src/planning/firingAreaEditing.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { defaultEngagementRules } = require('../src/planning/engagements.ts');
const square = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];

test('an area needs 3+ corners, a real size and edges that do not cross', () => {
  assert.match(A.areaProblem(square(0, 0, 100).slice(0, 2)), /at least 3/);
  assert.match(A.areaProblem(square(0, 0, 10)), /too small/, '10 x 10 in is under a square foot');
  assert.equal(A.areaProblem(square(0, 0, 12)), null);
  const bowTie = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
  assert.ok(A.selfIntersects(bowTie)); assert.match(A.areaProblem(bowTie), /edges cross/);
  const l = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 200 }, { x: 0, y: 200 }];
  assert.equal(A.areaProblem(l), null, 'an L-shaped area is fine'); assert.equal(Math.abs(A.polygonArea(l)), 200 * 60 + 60 * 140);
  assert.match(A.areaProblem([{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 0, y: 50 }]), /not a valid point/);
});

test('tapping picks the area under the finger, the last drawn on top', () => {
  const areas = [{ id: 'a', vertices: square(0, 0, 100) }, { id: 'b', vertices: square(50, 50, 100) }];
  assert.equal(A.areaAt(areas, { x: 25, y: 25 }), 'a'); assert.equal(A.areaAt(areas, { x: 75, y: 75 }), 'b');
  assert.equal(A.areaAt(areas, { x: 200, y: 200 }), null);
  const c = A.centroid(square(0, 0, 100)); assert.equal(c.x, 50); assert.equal(c.y, 50);
});

test('corners snap to other corners and to wall and fault-line ends, otherwise whole inches, inside the bay', () => {
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 400 } });
  stage.objects = [createObject('faultLine', 'F1', 300, 300)];
  const fault = require('../src/stage/segments.ts').endpoints(stage.objects[0]);
  const areas = [{ id: 'a', vertices: square(10, 10, 100) }];
  assert.deepEqual(A.snapCorner({ x: fault.start.x + 3, y: fault.start.y - 2 }, stage, areas, 6), { x: fault.start.x, y: fault.start.y }, 'fault line end');
  assert.deepEqual(A.snapCorner({ x: 112, y: 108 }, stage, areas, 6), { x: 110, y: 110 }, 'corner of the other area');
  assert.deepEqual(A.snapCorner({ x: 250.4, y: 200.6 }, stage, areas, 6), { x: 250, y: 201 });
  assert.deepEqual(A.snapCorner({ x: -30, y: 900 }, stage, areas, 6), { x: 0, y: 400 }, 'kept in the bay');
});

test('moving a corner stays valid; deleting an area clears target procedures that used it; whole bay; ids', () => {
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 400 } });
  const area = { id: 'area-1', vertices: square(100, 100, 100) };
  assert.deepEqual(A.moveCorner(area, 2, { x: 250, y: 260 }, stage).vertices[2], { x: 250, y: 260 });
  assert.equal(A.moveCorner(area, 2, { x: 50, y: 150 }, stage), null, 'would cross an edge');
  assert.deepEqual(A.moveCorner(area, 1, { x: 900, y: 100 }, stage).vertices[1], { x: 600, y: 100 }, 'clamped to the bay');
  assert.equal(A.moveCorner(area, 9, { x: 1, y: 1 }, stage), null);
  const rules = { ...defaultEngagementRules(stage, 'IDPA'), firingAreas: [area, { id: 'area-2', vertices: square(300, 100, 50) }],
    targetProcedures: { T1: { areaIds: ['area-1'] }, T2: { areaIds: ['area-1', 'area-2'], stationaryOnly: true }, T3: { stationaryOnly: true } } };
  assert.equal(rules.ruleset, 'IDPA');
  const next = A.removeArea(rules, 'area-1');
  assert.deepEqual(next.firingAreas.map(a => a.id), ['area-2']);
  assert.deepEqual(next.targetProcedures, { T1: {}, T2: { areaIds: ['area-2'], stationaryOnly: true }, T3: { stationaryOnly: true } });
  assert.deepEqual(A.wholeBayArea(stage, 'x').vertices, square(0, 0, 600).map(p => ({ x: p.x, y: Math.min(p.y, 400) })));
  assert.equal(A.nextAreaId(rules.firingAreas), 'area-3'); assert.equal(A.nextAreaId(next.firingAreas), 'area-1');
});

test('a draft shooting area from the fault lines: the bay minus what lies downrange of them', () => {
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 400 } });
  const fault = (id, x1, y1, x2, y2) => { const o = createObject('faultLine', id, (x1 + x2) / 2, (y1 + y2) / 2); return { ...o, endpoints: { start: { space: 'stage', x: x1, y: y1, z: 0 }, end: { space: 'stage', x: x2, y: y2, z: 0 } } }; };
  // Downrange is up the screen (270): a fault line across the middle cuts off what lies above it.
  stage.objects = [fault('F1', 100, 250, 500, 250)];
  let area = A.areaFromFaultLines(stage, 270, 'a');
  assert.equal(A.areaProblem(area.vertices), null); assert.equal(Math.abs(A.polygonArea(area.vertices)), 600 * 400 - 400 * 250);
  assert.ok(A.pointInPolygon({ x: 300, y: 300 }, area.vertices) && !A.pointInPolygon({ x: 300, y: 100 }, area.vertices) && A.pointInPolygon({ x: 50, y: 100 }, area.vertices));
  // Two fault lines at different depths and a slanted one: the nearest one ahead of you is the limit.
  stage.objects = [fault('F1', 100, 250, 500, 250), fault('F2', 300, 320, 600, 320), fault('S', 0, 200, 100, 150)];
  area = A.areaFromFaultLines(stage, 270, 'a');
  assert.equal(A.areaProblem(area.vertices), null);
  assert.ok(!A.pointInPolygon({ x: 400, y: 300 }, area.vertices), 'beyond the nearer line F2');
  assert.ok(A.pointInPolygon({ x: 200, y: 300 }, area.vertices), 'F2 does not reach x=200; F1 at 250 does not limit y=300');
  assert.ok(!A.pointInPolygon({ x: 50, y: 160 }, area.vertices) && A.pointInPolygon({ x: 50, y: 190 }, area.vertices), 'the slanted line at x=50 is at y=175');
  // A line running downrange is ignored; without limiting fault lines the draft is the whole bay.
  stage.objects = [fault('Side', 200, 50, 200, 350)];
  assert.equal(Math.abs(A.polygonArea(A.areaFromFaultLines(stage, 270, 'a').vertices)), 600 * 400);
  // Downrange to the right (0 degrees): a fault line running up and down limits how far right you may stand.
  stage.objects = [fault('F', 400, 0, 400, 400)];
  area = A.areaFromFaultLines(stage, 0, 'a');
  assert.equal(Math.abs(A.polygonArea(area.vertices)), 400 * 400);
  assert.ok(A.pointInPolygon({ x: 350, y: 200 }, area.vertices) && !A.pointInPolygon({ x: 450, y: 200 }, area.vertices));
});
