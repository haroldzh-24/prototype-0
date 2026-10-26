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
