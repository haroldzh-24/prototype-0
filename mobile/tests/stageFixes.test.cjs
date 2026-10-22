// Regression tests for the RC2 stage/editor fixes (audit 2026-10-22).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { createDefaultStage, createObject, DEFAULT_STAGE_SIZE } = require('../src/stage/defaults.ts');
const { applyObjectAction, applyInspectorEdit } = require('../src/editor/objectActions.ts');
const { stageDownrange, setStageDownrange, DEFAULT_DOWNRANGE_DEGREES, downrangeLabel, nearestCardinal } = require('../src/stage/orientation.ts');
const { addSegment, endpoints, snapEndpoint } = require('../src/stage/segments.ts');
const { placeTarget } = require('../src/stage/targetPlacement.ts');
const { DEFAULT_SNAPPING } = require('../src/stage/snapping.ts');
const { constrainPosition } = require('../src/stage/geometry.ts');
const { defaultTargetPreset } = require('../src/stage/targetPresets.ts');
const { gridLabelStepInches, isGridLabel, gridLabel } = require('../src/stage/grid.ts');
const { Repository, savedDocumentProblem } = require('../src/storage/repository.ts');
const { createPlan } = require('../src/planning/model.ts');
const point = (x, y, z = 0) => ({ space: 'stage', x, y, z });
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const blank = () => ({ ...createDefaultStage(), objects: [] });
function open() {
  const db = new DatabaseSync(':memory:');
  return { db, repo: new Repository({
    execAsync: async sql => { db.exec(sql); },
    runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
  }, randomUUID) };
}

test('new stages default to downrange up the screen with the start uprange of every target', () => {
  const stage = createDefaultStage('USPSA');
  assert.equal(stage.downrangeDegrees, 270);
  assert.equal(stageDownrange(stage), DEFAULT_DOWNRANGE_DEGREES);
  const start = stage.objects.find(o => o.type === 'start');
  const targets = stage.objects.filter(o => o.type === 'cardboardTarget');
  assert.equal(targets.length, 3);
  // Up the screen is -Y, so the start must sit below (greater Y than) every target, in the lower part of the stage.
  for (const t of targets) assert.ok(start.position.y > t.position.y, `start y ${start.position.y} should exceed target y ${t.position.y}`);
  assert.ok(start.position.y > stage.stage.depth / 2);
});

test('default layout follows each cardinal downrange and every object fits the stage', () => {
  for (const downrangeDegrees of [0, 90, 180, 270]) {
    const stage = createDefaultStage('IDPA', { downrangeDegrees });
    const start = stage.objects.find(o => o.type === 'start');
    const along = p => { const a = downrangeDegrees * Math.PI / 180; return p.x * Math.cos(a) + p.y * Math.sin(a); };
    for (const t of stage.objects.filter(o => o.type === 'cardboardTarget')) assert.ok(along(t.position) > along(start.position), `downrange ${downrangeDegrees}`);
    for (const o of stage.objects) assert.deepEqual(constrainPosition(o, o.position, stage.stage), o.position);
  }
});

test('default targets use the match family preset; no family keeps the generic target', () => {
  for (const family of ['USPSA', 'PCSL', 'IDPA']) {
    const preset = defaultTargetPreset(family);
    for (const t of createDefaultStage(family).objects.filter(o => o.type === 'cardboardTarget')) {
      assert.deepEqual(t.geometry, { faceWidth: preset.width, faceHeight: preset.height });
      assert.equal(t.presetId, preset.id); assert.equal(t.targetFamily, family);
    }
  }
  for (const t of createDefaultStage().objects.filter(o => o.type === 'cardboardTarget')) assert.deepEqual(t.geometry, { faceWidth: 18, faceHeight: 30 });
});

test('default objects fit a slightly smaller stage and small stages keep only what fits plus the start', () => {
  const stage = createDefaultStage();
  for (const o of stage.objects) assert.deepEqual(constrainPosition(o, o.position, { width: 450, depth: 350 }), o.position);
  const tiny = createDefaultStage('USPSA', { size: { width: 60, depth: 60 } });
  assert.ok(tiny.objects.some(o => o.type === 'start'));
  assert.ok(!tiny.objects.some(o => o.type === 'wall'), 'a 96 in wall cannot fit a 60 in stage');
});

test('reset keeps match family, custom stage size and downrange', () => {
  let stage = createDefaultStage('PCSL', { size: { width: 720, depth: 540 }, downrangeDegrees: 0 });
  stage = applyObjectAction(stage, null, { kind: 'create', type: 'wall' }, randomUUID).stage;
  const reset = applyObjectAction(stage, null, { kind: 'reset', targetFamily: 'PCSL' }, randomUUID);
  assert.deepEqual(reset.stage.stage, { width: 720, depth: 540 });
  assert.equal(reset.stage.downrangeDegrees, 0);
  assert.deepEqual(reset.stage, createDefaultStage('PCSL', { size: { width: 720, depth: 540 }, downrangeDegrees: 0 }));
  assert.ok(reset.stage.objects.filter(o => o.type === 'cardboardTarget').every(t => t.targetFamily === 'PCSL'));
  assert.equal(reset.selectedId, null);
  // Documents saved before downrange existed reset to the default direction.
  const legacy = { ...createDefaultStage() }; delete legacy.downrangeDegrees;
  assert.equal(applyObjectAction(legacy, null, { kind: 'reset' }, randomUUID).stage.downrangeDegrees, 270);
});

test('downrange setter normalizes and rejects non-finite values', () => {
  const stage = createDefaultStage();
  assert.equal(setStageDownrange(stage, -90).stage.downrangeDegrees, 270);
  assert.equal(setStageDownrange(stage, 450).stage.downrangeDegrees, 90);
  for (const bad of [NaN, Infinity]) { const r = setStageDownrange(stage, bad); assert.ok(r.error); assert.equal(r.stage, stage); }
  assert.equal(downrangeLabel(270), 'Up'); assert.equal(downrangeLabel(-90), 'Up'); assert.equal(downrangeLabel(45), '45°');
  assert.equal(nearestCardinal(44), 0); assert.equal(nearestCardinal(46), 90); assert.equal(nearestCardinal(359), 0);
});

test('target rotation snaps to the active increment through the inspector path', () => {
  const stage = placeTarget(blank(), 'uspsa-metric-chl-v1', 't', point(200, 200, 48)).stage;
  assert.equal(applyInspectorEdit(stage, 't', { rotation: 37 }, 15).stage.objects[0].rotation, 30);
  assert.equal(applyInspectorEdit(stage, 't', { rotation: 38 }, 15).stage.objects[0].rotation, 45);
  assert.equal(applyInspectorEdit(stage, 't', { rotation: 37 }, 5).stage.objects[0].rotation, 35);
  assert.equal(applyInspectorEdit(stage, 't', { rotation: 37 }, null).stage.objects[0].rotation, 37);
  const bad = applyInspectorEdit(stage, 't', { rotation: NaN }, 15); assert.ok(bad.error); assert.equal(bad.stage, stage);
});

test('segment angle edits snap; length-only edits keep the existing angle', () => {
  const stage = addSegment(blank(), 'wall', 'w', point(100, 100), point(200, 140)).stage; // ~21.8 degrees
  const angled = applyInspectorEdit(stage, 'w', { rotation: 47 }, 15).stage.objects[0];
  near(angled.rotation, 45);
  const lengthOnly = applyInspectorEdit(stage, 'w', { geometry: { length: 60 } }, 15).stage.objects[0];
  near(lengthOnly.rotation, stage.objects[0].rotation, 1e-9);
});

test('wall length always pivots on the start endpoint, even with height or thickness in the same edit', () => {
  const stage = addSegment(blank(), 'wall', 'w', point(100, 100), point(196, 100)).stage;
  const start = endpoints(stage.objects[0]).start;
  for (const edit of [{ geometry: { length: 48 } }, { geometry: { length: 48, height: 60 } }, { geometry: { length: 48, thickness: 6, height: 60 } }]) {
    const wall = applyInspectorEdit(stage, 'w', edit, 15).stage.objects[0];
    const e = endpoints(wall);
    near(e.start.x, start.x); near(e.start.y, start.y); near(e.end.x, start.x + 48); near(wall.geometry.length, 48);
    if (edit.geometry.height) assert.equal(wall.geometry.height, 60);
    if (edit.geometry.thickness) assert.equal(wall.geometry.thickness, 6);
  }
  // A failing secondary field leaves the original document untouched.
  const failed = applyInspectorEdit(stage, 'w', { geometry: { length: 48, height: -1 } }, 15);
  assert.ok(failed.error); assert.equal(failed.stage, stage);
});

test('grid snapping near the far edge stays inside a stage that is not a grid multiple', () => {
  // 104 / 12 = 8.67, so a point at 103 rounds to the 108 grid line, outside the stage, without the clamp.
  const stage = { ...blank(), stage: { width: 104, depth: 104 } };
  const snapped = snapEndpoint(stage, point(103, 103), null, { ...DEFAULT_SNAPPING, gridIncrement: 12 });
  assert.equal(snapped.rule, 'Grid');
  assert.deepEqual([snapped.point.x, snapped.point.y], [104, 104]);
  assert.ok(!addSegment(stage, 'wall', 'w', point(10, 10), snapped.point).error);
  const low = snapEndpoint(stage, point(0.4, 0.4), null, { ...DEFAULT_SNAPPING, gridIncrement: 12 });
  assert.deepEqual([low.point.x, low.point.y], [0, 0]);
});

test('grid labels fall on whole yards and thin out when zoomed out', () => {
  assert.equal(gridLabelStepInches(2, 24), 36);       // 72 px per yard: label every yard
  assert.equal(gridLabelStepInches(0.5, 24), 72);     // 18 px per yard: every 2 yd
  assert.equal(gridLabelStepInches(0.1, 64), 36 * 18);
  assert.ok(isGridLabel(72, 36)); assert.ok(!isGridLabel(60, 36)); assert.ok(!isGridLabel(0, 36));
  assert.equal(gridLabel(72), '2 yd'); assert.equal(gridLabel(54), '1.5 yd');
});

test('saved-document checks reject zero sizes, duplicate IDs, bad ports and non-finite downrange', () => {
  assert.equal(savedDocumentProblem(createDefaultStage('USPSA')), null);
  const legacy = createDefaultStage(); delete legacy.downrangeDegrees; assert.equal(savedDocumentProblem(legacy), null);
  const zero = createDefaultStage(); zero.objects[1] = { ...zero.objects[1], geometry: { faceWidth: 0, faceHeight: 30 } };
  assert.match(savedDocumentProblem(zero), /dimension/);
  const dup = createDefaultStage(); dup.objects.push({ ...dup.objects[1] });
  assert.match(savedDocumentProblem(dup), /unique/);
  const wall = createObject('wall', 'w', 200, 200);
  const ports = createDefaultStage(); ports.objects.push({ ...wall, ports: [{ id: 'p', offset: 0, width: 12, height: 12, sill: 12 }] },
    { ...createObject('wall', 'w2', 200, 100), ports: [{ id: 'p', offset: 0, width: 12, height: 12, sill: 12 }] });
  assert.match(savedDocumentProblem(ports), /Port IDs/);
  const closed = createDefaultStage(); closed.objects.push({ ...wall, ports: [{ id: 'p', offset: 0, width: 0, height: 12, sill: 12 }] });
  assert.match(savedDocumentProblem(closed), /Port openings/);
  assert.match(savedDocumentProblem({ ...createDefaultStage(), downrangeDegrees: Infinity }), /Downrange/);
  // start height 0 is legitimate
  assert.equal(createDefaultStage().objects.find(o => o.type === 'start').geometry.height, 0);
});

test('repository refuses to save a document it could not reopen, and round-trips downrange', async () => {
  const { repo } = open();
  await repo.initialize();
  const match = await repo.createMatch('M', 'USPSA');
  const zero = createDefaultStage(); zero.objects[1] = { ...zero.objects[1], geometry: { faceWidth: 0, faceHeight: 30 } };
  await assert.rejects(() => repo.createStage('bad', zero, createPlan(), match), /dimension/);
  const good = createDefaultStage('USPSA', { downrangeDegrees: 90 });
  const id = await repo.createStage('good', good, createPlan(), match);
  const loaded = await repo.loadStage(id);
  assert.equal(loaded.document.downrangeDegrees, 90);
  assert.deepEqual(loaded.document, good);
});

test('legacy saved stages without downrange still load and read as up the screen', async () => {
  const { db, repo } = open();
  await repo.initialize();
  const match = await repo.createMatch('M', 'USPSA');
  const legacy = createDefaultStage(); delete legacy.downrangeDegrees;
  const id = await repo.createStage('legacy', legacy, createPlan(), match);
  const row = db.prepare('SELECT payload FROM stages WHERE id = ?').get(id);
  assert.ok(!JSON.parse(row.payload).document.downrangeDegrees);
  const loaded = await repo.loadStage(id);
  assert.equal(stageDownrange(loaded.document), 270);
});

test('DEFAULT_STAGE_SIZE is frozen and copied, never shared', () => {
  assert.ok(Object.isFrozen(DEFAULT_STAGE_SIZE));
  const a = createDefaultStage(); a.stage.width = 1;
  assert.equal(createDefaultStage().stage.width, 480);
});
