const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { Repository } = require('../src/storage/repository.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { objectPalette } = require('../src/editor/objectActions.ts');
const { createPlan } = require('../src/planning/model.ts');
const { startingTypes } = require('../src/training/model.ts');
const { createRoute } = require('../src/planning/route.ts');
function open(file = ':memory:') {
  const db = new DatabaseSync(file);
  return { db, repo: new Repository({
    execAsync: async sql => { db.exec(sql); },
    runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
  }, randomUUID) };
}
function fixture() {
  const document = createDefaultStage();
  document.stage = { width: 720, depth: 600 };
  for (const { type } of objectPalette) {
    const object = createObject(type, type, 200, 210);
    object.rotation = 35;
    if (object.faceCut) object.faceCut.preset = 'left';
    if (object.ports) object.ports = [{ id: 'port-unique', offset: 12, width: 20, height: 30, sill: 24 }];
    document.objects.push(object);
  }
  const plan = { loadout: { chamberLoaded: true, startingMagazineId: 'mag', magazines: [{ id: 'mag', capacity: 20, startingRounds: 13 }] }, engagements: { cardboardTarget: 3, steelPlate: 1, steelPopper: 2 } };
  return { document, plan };
}
test('complete stage and ammunition survive database close/reopen; source and duplicate stay independent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-storage-'));
  const file = path.join(dir, 'test.db');
  let connection = open(file);
  try {
    await connection.repo.initialize();
    const { document, plan } = fixture();
    const id = await connection.repo.createStage("Match 'A'; DROP TABLE stages;", document, plan);
    connection.db.close(); connection = open(file); await connection.repo.initialize();
    const reopened = await connection.repo.loadStage(id);
    assert.deepEqual(reopened.document, document); assert.deepEqual(reopened.plan, plan);
    await connection.repo.renameStage(id, 'Renamed');
    assert.equal((await connection.repo.loadStage(id)).name, 'Renamed');
    const copyId = await connection.repo.duplicateStage(id);
    assert.notEqual(copyId, id);
    const copy = await connection.repo.loadStage(copyId);
    assert.deepEqual(copy.document, document); assert.deepEqual(copy.plan, plan);
    document.objects[0].position.x = 222;
    await connection.repo.saveStage(id, 'Edited', document, createPlan());
    assert.deepEqual((await connection.repo.loadStage(copyId)).document, copy.document);
    assert.deepEqual((await connection.repo.loadStage(copyId)).plan, plan);
    await connection.repo.deleteStage(id);
    await assert.rejects(connection.repo.loadStage(id), /no longer exists/);
    assert.deepEqual((await connection.repo.loadStage(copyId)).document, copy.document);
    assert.equal((await connection.repo.listStages()).length, 1);
    await assert.rejects(connection.repo.saveStage(id, 'Deleted', document, plan));
    assert.equal((await connection.repo.listStages()).length, 1);
  } finally { connection.db.close(); fs.rmSync(dir, { recursive: true }); }
});
test('names and unsupported payloads reject without altering another stage', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize(); const { document, plan } = fixture();
    await assert.rejects(repo.createStage('   ', document, plan));
    const id = await repo.createStage('Valid', document, plan);
    await assert.rejects(repo.renameStage(id, ''));
    assert.equal((await repo.loadStage(id)).name, 'Valid');
    db.prepare('UPDATE stages SET payload = ? WHERE id = ?').run(JSON.stringify({ version: 999 }), id);
    await assert.rejects(repo.loadStage(id), /Unsupported or damaged/);
    assert.equal((await repo.listStages()).length, 1);
  } finally { db.close(); }
});
test('training start types, segments and local profile persist independently of stages', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize();
    for (const startingType of Object.keys(startingTypes)) {
      const record = { id: startingType, userId: 'local', drillId: null, drillName: '', occurredAt: new Date().toISOString(), startingType, totalTime: 2.5, notes: 'Practice', segments: [{ id: 'split-1', label: 'Split', seconds: 0.25 }] };
      await repo.saveTraining(record);
      assert.deepEqual((await repo.listTraining('local')).find(r => r.id === record.id), record);
      await assert.rejects(repo.saveTraining({ ...record, startingType: 'arbitrary' }));
    }
    assert.equal((await repo.listTraining('local')).length, 6);
    assert.deepEqual(await repo.listTraining('someone-else'), []);
    const profile = await repo.loadProfile(); profile.performance.drawTime = 1.2;
    await repo.saveProfile(profile); await repo.initialize();
    assert.deepEqual(await repo.loadProfile(), profile);
    assert.equal((await repo.listStages()).length, 0);
  } finally { db.close(); }
});

test('routes survive SQLite reopen and duplication while legacy plans remain unchanged', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-storage-'));
  const file = path.join(dir, 'test.db'); let connection = open(file);
  try {
    await connection.repo.initialize(); const { document, plan } = fixture();
    const legacyId = await connection.repo.createStage('Legacy', document, plan);
    const route = createRoute('route-a');
    route.positions = [{ id: 'A', label: 'A', position: { space: 'stage', x: 50, y: 70, z: 0 }, visibleTargetIds: ['cardboardTarget'], engagedTargetIds: ['cardboardTarget'] }];
    route.reloads = [{ positionId: 'A', magazineId: 'mag' }];
    const id = await connection.repo.createStage('Route', document, { ...plan, route });
    connection.db.close(); connection = open(file); await connection.repo.initialize();
    assert.deepEqual((await connection.repo.loadStage(legacyId)).plan, plan);
    assert.deepEqual((await connection.repo.loadStage(id)).plan.route, route);
    const copyId = await connection.repo.duplicateStage(id);
    await connection.repo.saveStage(id, 'Changed', document, { ...plan, route: { ...route, positions: [] } });
    assert.deepEqual((await connection.repo.loadStage(copyId)).plan.route, route);
    await assert.rejects(connection.repo.saveStage(copyId, 'Bad', document, { ...plan, route: { version: 9 } }), /Invalid route/);
    assert.deepEqual((await connection.repo.loadStage(copyId)).plan.route, route);
  } finally { connection.db.close(); fs.rmSync(dir, { recursive: true }); }
});
test('new-stage payload creates native-safe defaults before builder navigation', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize();
    const document = createDefaultStage();
    const plan = createPlan();
    const id = await repo.createStage('Untitled stage', document, plan);
    assert.match(id, /^[0-9a-f-]{36}$/i);
    const saved = await repo.loadStage(id);
    assert.equal(saved.document.schemaVersion, 7);
    assert.equal(saved.plan.route, undefined);
    assert.equal(JSON.stringify(saved.document).includes('undefined'), false);
  } finally { db.close(); }
});

test('mass rounds and direct assignments survive SQLite reopen, overrides and target deletion', async () => {
  const { assignRoundsByType, assignRounds, reconcilePlan } = require('../src/planning/model.ts');
  const { toggleRouteTarget } = require('../src/planning/route.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'target-assignment-'));
  let connection = open(path.join(dir, 'data.db'));
  try {
    await connection.repo.initialize();
    const { document, plan } = fixture();
    let edited = assignRoundsByType(plan, document, 'cardboardTarget', 2).plan;
    edited = assignRounds(edited, document, 'cardboardTarget', 3).plan;
    const route = createRoute('assignment-route');
    route.positions = [{ id: 'A', label: 'Position A', position: { space: 'stage', x: 50, y: 70, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] }];
    edited.route = toggleRouteTarget(route, document, 'A', 'cardboardTarget', 'engaged');
    const id = await connection.repo.createStage('Assignments', document, edited);
    connection.db.close(); connection = open(path.join(dir, 'data.db'));
    await connection.repo.initialize();
    assert.deepEqual((await connection.repo.loadStage(id)).plan, edited);
    document.objects = document.objects.filter(o => o.id !== 'cardboardTarget');
    edited = reconcilePlan(edited, document);
    await connection.repo.saveStage(id, 'Assignments', document, edited);
    const loaded = await connection.repo.loadStage(id);
    assert.deepEqual(loaded.plan.route.positions[0].visibleTargetIds, []);
    assert.deepEqual(loaded.plan.route.positions[0].engagedTargetIds, []);
    assert.equal(loaded.plan.engagements.cardboardTarget, undefined);
  } finally { connection.db.close(); fs.rmSync(dir, { recursive: true }); }
});

const { addMagazineBatch, saveMagazine, ammunitionSummary } = require('../src/planning/model.ts');
test('magazine batches append unique independent magazines and preserve separate chamber setting', () => {
  const { document, plan } = fixture();
  const before = JSON.stringify(plan);
  const added = addMagazineBatch(plan, 4, 17, 17, true, randomUUID).plan;
  assert.equal(added.loadout.magazines.length, plan.loadout.magazines.length + 4);
  assert.deepEqual(added.loadout.magazines[0], plan.loadout.magazines[0]);
  const created = added.loadout.magazines.slice(1);
  assert.equal(new Set(added.loadout.magazines.map(m => m.id)).size, 5);
  assert.ok(created.every(m => m.capacity === 17 && m.startingRounds === 17));
  assert.equal(added.loadout.startingMagazineId, created[0].id);
  assert.equal(added.loadout.chamberLoaded, true);
  assert.equal(ammunitionSummary(added, document).totalAvailable, 82);
  const edited = saveMagazine(added, { ...created[0], capacity: 20, startingRounds: 10 }).plan;
  assert.equal(edited.loadout.magazines[1].startingRounds, 10);
  assert.equal(edited.loadout.magazines[2].startingRounds, 17);
  assert.equal(JSON.stringify(plan), before);
  const preserved = addMagazineBatch(plan, 2, 10, 0, false, randomUUID).plan;
  assert.equal(preserved.loadout.startingMagazineId, plan.loadout.startingMagazineId);
  const empty = addMagazineBatch(createPlan(), 1, 17, 0, false, randomUUID).plan;
  assert.equal(empty.loadout.startingMagazineId, null);
  assert.equal(empty.loadout.chamberLoaded, false);
});
test('invalid magazine batches and duplicate IDs reject atomically', () => {
  const { plan } = fixture();
  for (const [q, capacity, loaded] of [[0,17,17],[-1,17,17],[1.5,17,17],[101,17,17],[NaN,17,17],[2,0,0],[2,17,18],[2,17,-1],[2,17,1.5],[2,NaN,1],[2,17,NaN],[2,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER]]) {
    const result = addMagazineBatch(plan,q,capacity,loaded,true,randomUUID);
    assert.ok(result.error); assert.equal(result.plan, plan);
  }
  const collision = addMagazineBatch(plan, 2, 17, 17, true, () => 'same');
  assert.ok(collision.error); assert.equal(collision.plan, plan);
});
test('batch magazines, inserted designation and independent edits survive SQLite reopen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magazine-batch-'));
  const file = path.join(dir, 'data.db');
  let connection = open(file);
  try {
    await connection.repo.initialize();
    const { document, plan } = fixture();
    let added = addMagazineBatch(plan, 4, 17, 17, true, randomUUID).plan;
    const magazine = added.loadout.magazines[2];
    added = saveMagazine(added, { ...magazine, startingRounds: 12 }).plan;
    const id = await connection.repo.createStage('Batch loadout', document, added);
    connection.db.close(); connection = open(file);
    await connection.repo.initialize();
    const loaded = await connection.repo.loadStage(id);
    assert.deepEqual(loaded.plan, added);
    assert.equal(ammunitionSummary(loaded.plan, document).totalAvailable, 77);
  } finally { connection.db.close(); fs.rmSync(dir, { recursive: true }); }
});
