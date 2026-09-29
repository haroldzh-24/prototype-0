const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { Repository } = require('../src/storage/repository.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { applyObjectAction } = require('../src/editor/objectActions.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute } = require('../src/planning/route.ts');

function open(file = ':memory:', beforeWrite = () => {}) {
  const db = new DatabaseSync(file);
  const adapter = {
    execAsync: async sql => { beforeWrite(sql); db.exec(sql); },
    runAsync: async (sql, ...params) => { beforeWrite(sql); return db.prepare(sql).run(...params); },
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
  };
  return { db, repo: new Repository(adapter, randomUUID) };
}
const payloadOf = (db, id) => db.prepare('SELECT payload FROM stages WHERE id = ?').get(id).payload;
function legacyPayload() {
  const document = createDefaultStage(), plan = createPlan();
  document.stage = { width: 480.125, depth: 360.375 };
  document.objects.find(o => o.type === 'wall').ports = [{ id: 'port-original', offset: 0, width: 24.25, height: 24, sill: 36 }];
  plan.loadout.magazines = [{ id: 'magazine-original', capacity: 20, startingRounds: 15 }];
  plan.loadout.startingMagazineId = 'magazine-original';
  plan.engagements = { 'target-1': 3 };
  plan.route = createRoute('route-original');
  plan.route.positions.push({ id: 'position-original', label: 'P1', position: { space: 'stage', x: 123.125, y: 230, z: 0 }, visibleTargetIds: ['target-1'], engagedTargetIds: ['target-1'] });
  plan.route.reloads.push({ positionId: 'position-original', magazineId: 'magazine-original' });
  return JSON.stringify({ version: 1, document, plan, extraSavedReference: { id: 'keep-exactly' } }, null, 2);
}
function seedLegacy(db) {
  db.exec('CREATE TABLE stages (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, payload TEXT NOT NULL); PRAGMA user_version = 1;');
  const payload = legacyPayload();
  for (const id of ['legacy-a', 'legacy-b']) db.prepare('INSERT INTO stages VALUES (?, ?, ?, ?, ?)').run(id, 'Old stage', '2026-09-01', '2026-09-02', payload);
  return payload;
}

test('multiple matches own independent stages, allow the same names and report stage counts', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize(); assert.deepEqual(await repo.listMatches(), []);
    const a = await repo.createMatch(' Match A ', 'USPSA'), b = await repo.createMatch('Match B', 'PCSL');
    const stageA = await repo.createStage('Stage 1', createDefaultStage(), createPlan(), a);
    const stageB = await repo.createStage('Stage 1', createDefaultStage(), createPlan(), b);
    assert.notEqual(a, b); assert.notEqual(stageA, stageB);
    assert.deepEqual((await repo.listStages(a)).map(s => s.id), [stageA]);
    assert.deepEqual((await repo.listStages(b)).map(s => s.id), [stageB]);
    assert.equal((await repo.loadStage(stageA)).matchId, a);
    assert.equal((await repo.loadStage(stageB)).matchId, b);
    const matches = await repo.listMatches();
    assert.equal(matches.length, 2); assert.ok(matches.every(m => m.stageCount === 1));
    assert.equal((await repo.loadMatch(a)).name, 'Match A');
    assert.deepEqual(Object.keys(await repo.loadMatch(a)).sort(), ['createdAt', 'id', 'name', 'targetFamily', 'updatedAt']);
    await assert.rejects(repo.createStage('Orphan', createDefaultStage(), createPlan(), 'missing'), /Match no longer/);
    assert.throws(() => db.prepare('UPDATE stages SET matchId = NULL WHERE id = ?').run(stageA), /existing match/);
  } finally { db.close(); }
});

test('match rename and family changes persist without changing any placed targets or stage payloads', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize(); const match = await repo.createMatch('A', 'USPSA');
    const original = createDefaultStage('USPSA');
    const id = await repo.createStage('Stage', original, createPlan(), match), bytes = payloadOf(db, id);
    for (const family of ['PCSL', 'IDPA']) {
      await repo.updateMatch(match, 'Renamed ' + family, family);
      assert.equal((await repo.loadMatch(match)).targetFamily, family);
      assert.equal(payloadOf(db, id), bytes);
      const action = applyObjectAction(original, null, { kind: 'create', type: 'cardboardTarget', targetFamily: family }, randomUUID);
      const target = action.stage.objects.find(o => o.id === action.selectedId);
      assert.equal(target.targetFamily, family);
      assert.deepEqual(target.geometry, original.objects.find(o => o.type === 'cardboardTarget').geometry);
      assert.deepEqual(action.stage.objects.filter(o => o.id !== action.selectedId), original.objects);
      const copy = applyObjectAction(action.stage, target.id, { kind: 'duplicate' }, randomUUID);
      assert.equal(copy.stage.objects.find(o => o.id === copy.selectedId).targetFamily, family);
    }
    await assert.rejects(repo.createMatch('', 'USPSA'), /match name/);
    await assert.rejects(repo.updateMatch(match, 'Bad', 'OTHER'), /Choose/);
    assert.equal((await repo.loadMatch(match)).name, 'Renamed IDPA');
  } finally { db.close(); }
});

test('deleting one match removes only its stages and preserves other matches and their data', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize();
    const a = await repo.createMatch('A', 'USPSA'), b = await repo.createMatch('B', 'IDPA');
    const sa = await repo.createStage('Same', createDefaultStage(), createPlan(), a);
    const sb = await repo.createStage('Same', createDefaultStage(), createPlan(), b);
    const other = await repo.loadMatch(b), saved = await repo.loadStage(sb);
    await repo.deleteMatch(a);
    await assert.rejects(repo.loadMatch(a)); await assert.rejects(repo.loadStage(sa));
    assert.deepEqual(await repo.loadMatch(b), other); assert.deepEqual(await repo.loadStage(sb), saved);
    assert.equal((await repo.listMatches()).length, 1);
  } finally { db.close(); }
});

test('stage rename/duplicate/delete stay in the parent; match duplication copies payloads with fresh row IDs', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize(); const match = await repo.createMatch('Original', 'PCSL');
    const stage = await repo.createStage('Stage', createDefaultStage('PCSL'), createPlan(), match);
    await repo.renameStage(stage, 'Renamed'); const stageCopy = await repo.duplicateStage(stage);
    assert.equal((await repo.loadStage(stageCopy)).matchId, match);
    assert.equal((await repo.loadStage(stageCopy)).name, 'Renamed (copy)');
    const copy = await repo.duplicateMatch(match);
    assert.notEqual(copy, match); assert.equal((await repo.loadMatch(copy)).targetFamily, 'PCSL');
    const originals = await repo.listStages(match), copies = await repo.listStages(copy);
    assert.equal(copies.length, 2);
    for (const row of copies) {
      assert.ok(originals.every(s => s.id !== row.id));
      assert.equal(payloadOf(db, row.id), payloadOf(db, originals.find(s => s.name === row.name).id));
    }
    await repo.deleteStage(stageCopy); assert.equal((await repo.listStages(match)).length, 1);
    assert.equal((await repo.listStages(copy)).length, 2);
    await repo.deleteMatch(copy); assert.equal((await repo.loadStage(stage)).name, 'Renamed');
  } finally { db.close(); }
});

test('standalone migration preserves row IDs, exact payload bytes, routes, ammo and references', async () => {
  const { db, repo } = open();
  try {
    const payload = seedLegacy(db), before = db.prepare('SELECT * FROM stages ORDER BY id').all();
    await repo.initialize();
    const matches = await repo.listMatches();
    assert.equal(matches.length, 1); assert.equal(matches[0].name, 'Imported Stages');
    assert.equal(matches[0].targetFamily, 'USPSA'); assert.equal(matches[0].stageCount, 2);
    const after = db.prepare('SELECT * FROM stages ORDER BY id').all();
    for (let i = 0; i < before.length; i++) {
      const { matchId, ...row } = after[i]; assert.equal(matchId, matches[0].id); assert.deepEqual(row, { ...before[i] });
      assert.equal(payloadOf(db, row.id), payload);
      assert.deepEqual((await repo.loadStage(row.id)).plan, JSON.parse(payload).plan);
    }
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  } finally { db.close(); }
});

test('migration remains idempotent across repeated initialize and database reopen, including renamed import match', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'match-migration-')), file = path.join(dir, 'test.db');
  let connection = open(file);
  try {
    seedLegacy(connection.db); await connection.repo.initialize();
    const match = (await connection.repo.listMatches())[0];
    await connection.repo.updateMatch(match.id, 'My old match', 'IDPA');
    const before = connection.db.prepare('SELECT * FROM stages ORDER BY id').all();
    for (let i = 0; i < 3; i++) await connection.repo.initialize();
    connection.db.close(); connection = open(file); await connection.repo.initialize();
    assert.deepEqual(connection.db.prepare('SELECT * FROM stages ORDER BY id').all(), before);
    assert.equal((await connection.repo.listMatches()).length, 1);
    assert.equal((await connection.repo.loadMatch(match.id)).name, 'My old match');
    assert.equal((await connection.repo.loadMatch(match.id)).targetFamily, 'IDPA');
    await connection.repo.deleteMatch(match.id); await connection.repo.initialize();
    assert.deepEqual(await connection.repo.listMatches(), []);
  } finally { connection.db.close(); fs.rmSync(dir, { recursive: true }); }
});

test('migration associates only unowned stages and preserves even unreadable payloads', async () => {
  const { db, repo } = open();
  try {
    seedLegacy(db);
    db.exec("CREATE TABLE matches (id TEXT PRIMARY KEY, name TEXT NOT NULL, targetFamily TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL); ALTER TABLE stages ADD COLUMN matchId TEXT; INSERT INTO matches VALUES ('existing', 'Existing', 'PCSL', '2026-09-01', '2026-09-02'); UPDATE stages SET matchId = 'existing' WHERE id = 'legacy-a'; UPDATE stages SET payload = '{unreadable' WHERE id = 'legacy-b';");
    const owned = db.prepare("SELECT * FROM stages WHERE id = 'legacy-a'").get();
    await repo.initialize(); await repo.initialize();
    assert.deepEqual(db.prepare("SELECT * FROM stages WHERE id = 'legacy-a'").get(), owned);
    assert.equal(payloadOf(db, 'legacy-b'), '{unreadable');
    assert.equal((await repo.listStages('existing')).length, 1);
    assert.equal((await repo.listStages('imported-stages')).length, 1);
    assert.equal((await repo.listMatches()).length, 2);
  } finally { db.close(); }
});

test('migration rollback leaves standalone data and schema intact and retry imports exactly once', async () => {
  let fail = true;
  const { db, repo } = open(':memory:', sql => { if (fail && sql.startsWith('UPDATE stages SET matchId')) throw new Error('migration interrupted'); });
  try {
    const payload = seedLegacy(db);
    await assert.rejects(repo.initialize(), /migration interrupted/);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
    assert.ok(!db.prepare('PRAGMA table_info(stages)').all().some(c => c.name === 'matchId'));
    assert.equal(payloadOf(db, 'legacy-a'), payload);
    fail = false; await repo.initialize(); await repo.initialize();
    assert.equal((await repo.listMatches()).length, 1); assert.equal((await repo.listStages()).length, 2);
  } finally { db.close(); }
});

test('failed match duplication and deletion roll back atomically', async () => {
  let fail = '';
  const { db, repo } = open(':memory:', sql => { if (fail && sql.startsWith(fail)) throw new Error('disk failure'); });
  try {
    await repo.initialize(); const match = await repo.createMatch('Keep', 'USPSA');
    const stage = await repo.createStage('Stage', createDefaultStage(), createPlan(), match);
    fail = 'INSERT INTO stages'; await assert.rejects(repo.duplicateMatch(match), /disk failure/);
    assert.equal((await repo.listMatches()).length, 1);
    fail = 'DELETE FROM matches'; await assert.rejects(repo.deleteMatch(match), /disk failure/);
    assert.equal((await repo.loadStage(stage)).matchId, match);
    fail = ''; await repo.deleteMatch(match); assert.deepEqual(await repo.listMatches(), []);
  } finally { db.close(); }
});

test('matches, families, stage membership and fractional stage geometry persist across save/reopen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'match-save-')), file = path.join(dir, 'test.db');
  let connection = open(file);
  try {
    await connection.repo.initialize();
    const expected = [];
    for (const family of ['USPSA', 'PCSL', 'IDPA']) {
      const matchId = await connection.repo.createMatch(family, family);
      const doc = createDefaultStage(family); doc.stage.width = 456.125;
      const stageId = await connection.repo.createStage('Stage 1', doc, createPlan(), matchId);
      doc.objects[1].position.x = 220.375;
      await connection.repo.saveStage(stageId, 'Stage 1', doc, createPlan());
      expected.push({ match: await connection.repo.loadMatch(matchId), stage: await connection.repo.loadStage(stageId) });
    }
    connection.db.close(); connection = open(file); await connection.repo.initialize();
    for (const { match, stage } of expected) {
      assert.deepEqual(await connection.repo.loadMatch(match.id), match);
      assert.deepEqual(await connection.repo.loadStage(stage.id), stage);
      assert.equal((await connection.repo.listStages(match.id)).length, 1);
    }
  } finally { connection.db.close(); fs.rmSync(dir, { recursive: true }); }
});
