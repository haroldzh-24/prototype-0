const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { runNativeAnalysis } = require('../src/training/nativeAnalysisJob.ts');
const { OperationGate } = require('../src/training/operationGate.ts');
const V = require('../src/training/videoModel.ts');
const A = require('../src/training/videoAnalysis.ts');
const { visionRegion } = require('../src/training/closeUp.ts');
const { containedVideoRect } = require('../src/training/poseModel.ts');
const { Repository } = require('../src/storage/repository.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan } = require('../src/planning/model.ts');
const now = '2026-09-22T12:00:00Z';
const record = () => ({ id: 'record', userId: 'local', drillId: null, drillName: 'Practice', occurredAt: now,
  startingType: 'competitionHolster', totalTime: null, notes: '', segments: [] });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function control() { const calls = []; return { calls, prepare: id => calls.push(['prepare', id]),
  cancel: id => calls.push(['cancel', id]), release: id => calls.push(['release', id]) }; }
function database(runHook) {
  const db = new DatabaseSync(':memory:');
  const repo = new Repository({ execAsync: async sql => db.exec(sql),
    runAsync: async (sql, ...params) => { if (runHook) await runHook(sql); return db.prepare(sql).run(...params); },
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null }, randomUUID);
  return { db, repo };
}
test('cancellation reserves before queued extraction and discards late native results', async () => {
  const native = control(), signal = new AbortController(), work = deferred();
  const pending = runNativeAnalysis(native, 'audio', signal.signal, () => work.promise);
  assert.deepEqual(native.calls, [['prepare', 'audio']]); signal.abort();
  assert.deepEqual(native.calls[1], ['cancel', 'audio']);
  work.resolve({ samples: [1] }); await assert.rejects(pending, /cancelled/);
  assert.deepEqual(native.calls[2], ['release', 'audio']);
});
test('cross-detector run guard remains held until cancelled native work settles', async () => {
  const native = control(), signal = new AbortController(), work = deferred();
  const pending = runNativeAnalysis(native, 'pose', signal.signal, () => work.promise); signal.abort();
  await assert.rejects(runNativeAnalysis(control(), 'close', undefined, async () => 1), /still finishing/);
  work.resolve(1); await assert.rejects(pending, /cancelled/);
  assert.equal(await runNativeAnalysis(control(), 'retry', undefined, async () => 2), 2);
});
test('synchronous extraction failure releases prepared reservation and permits retry', async () => {
  const native = control();
  await assert.rejects(runNativeAnalysis(native, 'bad-uri', undefined, () => { throw new Error('URI failed'); }), /URI failed/);
  assert.deepEqual(native.calls, [['prepare', 'bad-uri'], ['release', 'bad-uri']]);
  assert.equal(await runNativeAnalysis(native, 'retry', undefined, async () => 3), 3);
});
test('abort during prepare releases a job without dispatching extraction', async () => {
  const signal = new AbortController(), native = control(); native.prepare = () => signal.abort();
  await assert.rejects(runNativeAnalysis(native, 'queued', signal.signal, () => { assert.fail('must not extract'); }), /cancelled/);
  assert.deepEqual(native.calls, [['cancel', 'queued'], ['release', 'queued']]);
});
test('old native clients fail recoverably without reserving the shared pipeline', async () => {
  await assert.rejects(runNativeAnalysis({ cancel() {} }, 'old', undefined, async () => 1), /Rebuild/);
  assert.equal(await runNativeAnalysis(control(), 'new', undefined, async () => 2), 2);
});
test('progress is finite and clamped and polling stops after completion', async () => {
  const native = control(), values = [], work = deferred(); native.progress = () => 8;
  const pending = runNativeAnalysis(native, 'progress', undefined, () => work.promise, n => values.push(n));
  await new Promise(resolve => setTimeout(resolve, 520));
  work.resolve(0); await pending; assert.ok(values.length > 0); assert.ok(values.every(n => n === 1));
});
test('same-tick operation guard rejects duplicate writes and stale post-unmount completion', () => {
  const gate = new OperationGate(), first = gate.begin(); assert.notEqual(first, null); assert.equal(gate.begin(), null);
  gate.dispose(); assert.equal(gate.current(first), false); gate.activate();
  const second = gate.begin(); gate.finish(first); assert.equal(gate.current(second), true);
  gate.finish(second); assert.equal(gate.busy, false);
});
test('playback timestamp conversion rejects unavailable times and preserves fractional milliseconds', () => {
  for (const value of [NaN, Infinity, -1, Number.MAX_VALUE]) assert.equal(V.playbackTimeMs(value), null);
  assert.equal(V.playbackTimeMs(1.2345), 1234.5); assert.equal(V.msToSeconds(V.playbackTimeMs(1.2345)), 1.2345);
});
test('Vision rectangles clamp display edge noise and reject NaN or empty off-screen selections', () => {
  assert.deepEqual(visionRegion({ x: .9, y: .8, width: .10000001, height: .20000001 }), { x: .9, y: .8, width: 1 - .9, height: 1 - .8 });
  for (const region of [{ x: NaN, y: 0, width: .1, height: .1 }, { x: 1, y: 0, width: .0000001, height: .1 }, { x: .5, y: 0, width: 1, height: .1 }]) assert.throws(() => visionRegion(region));
});
test('unavailable frame geometry produces an empty overlay rectangle rather than NaN', () => {
  for (const dimension of [0, NaN, Infinity, -1]) assert.deepEqual(containedVideoRect(320, 220, dimension, 1080), { left: 0, top: 0, width: 0, height: 0 });
});
test('oversized and malformed timelines fail before sorting or fusion', () => {
  assert.throws(() => V.sortEvents(Array(V.MAX_TIMELINE_EVENTS + 1).fill(null)), /limit/);
  assert.throws(() => V.sortEvents([{ id: 42 }]), /Invalid/);
  assert.throws(() => V.sortEvents(null), /damaged/);
});
test('one damaged training record does not hide healthy legacy sessions or rewrite saved bytes', async () => {
  const { db, repo } = database();
  try {
    await repo.initialize(); await repo.saveTraining(record());
    db.prepare('INSERT INTO training VALUES (?, ?, ?, ?)').run('broken', 'local', now, '{bad json');
    const rows = await repo.listTraining('local'); assert.deepEqual(rows, [record()]);
    assert.ok(repo.trainingReadWarnings[0].includes('broken'));
    assert.equal(db.prepare('SELECT payload FROM training WHERE id = ?').get('broken').payload, '{bad json');
  } finally { db.close(); }
});
test('damaged stage geometry fails before opening native canvas and retains stored data', async () => {
  const { db, repo } = database();
  try {
    await repo.initialize(); const id = await repo.createStage('stage', createDefaultStage(), createPlan());
    const payload = JSON.parse(db.prepare('SELECT payload FROM stages WHERE id = ?').get(id).payload);
    payload.document.objects[0].geometry = {};
    db.prepare('UPDATE stages SET payload = ? WHERE id = ?').run(JSON.stringify(payload), id);
    await assert.rejects(repo.loadStage(id), /damaged stage/);
  } finally { db.close(); }
});
test('malformed profile is rejected without resetting user data', async () => {
  const { db, repo } = database();
  try {
    await repo.initialize(); db.prepare('UPDATE profiles SET payload = ? WHERE id = ?').run('{"id":"local","performance":null}', 'local');
    await assert.rejects(repo.loadProfile(), /Damaged profile/);
    assert.equal(db.prepare('SELECT payload FROM profiles').get().payload, '{"id":"local","performance":null}');
  } finally { db.close(); }
});
test('stage writes cannot be rolled back by an overlapping failed training transaction', async () => {
  const reached = deferred(), release = deferred();
  const { db, repo } = database(async sql => { if (sql.startsWith('INSERT INTO training')) { reached.resolve(); await release.promise; throw new Error('disk failure'); } });
  try {
    await repo.initialize(); const failed = repo.saveTraining(record());
    const rejection = assert.rejects(failed, /disk failure/); await reached.promise;
    const stage = repo.createStage('survives', createDefaultStage(), createPlan());
    release.resolve(); await rejection; const id = await stage;
    assert.equal((await repo.loadStage(id)).name, 'survives'); assert.equal((await repo.listTraining('local')).length, 0);
  } finally { db.close(); }
});
test('missing media availability failures preserve manual analysis metadata', async () => {
  const session = { id: 'video', trainingSessionId: 'record', drillId: null, asset: { uri: 'training-videos/video.mp4', storage: 'DOCUMENTS', name: 'video.mp4' },
    durationMs: 1000, fps: null, context: 'DRY_FIRE', createdAt: now, importedAt: now, analysisStatus: 'ANNOTATING', analysisVersion: 1 };
  const video = { session, analysis: A.analyzeVideo(session, []), samples: [1, 2, 3] };
  assert.equal(await A.videoAssetAvailable(session, () => { throw new Error('missing file'); }), false);
  const normalized = A.normalizeVideo(video); assert.equal(normalized.samples, undefined); assert.deepEqual(normalized.session, session);
});
function mockedAssets(failMove = false) {
  const paths = { document: { uri: 'file:///docs/' }, cache: { uri: 'file:///cache/' } };
  const files = new Set(['file:///cache/source.mp4']);
  class File {
    constructor(...parts) { this.uri = parts.map(p => typeof p === 'string' ? p : p.uri)
      .map((p, i) => i ? p.replace(/^\/+/, '') : p.replace(/\/+$/, '')).join('/'); }
    get exists() { return files.has(this.uri); }
    delete() { files.delete(this.uri); }
    move(destination) { files.add(destination.uri); if (failMove) throw new Error('storage full'); files.delete(this.uri); }
  }
  class Directory { constructor() {} create() {} }
  const filename = require('node:path').resolve(__dirname, '../src/training/videoAssets.ts');
  const module = new (require('node:module'))(filename);
  module.require = id => id === 'expo-file-system' ? { File, Directory, Paths: paths }
    : id === 'expo-document-picker' ? { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///cache/source.mp4', name: 'source.mp4', size: 10 }] }) } : require(id);
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return { assets: module.exports, files };
}
test('failed video import removes partial destination and app-owned cache copy', async () => {
  const { assets, files } = mockedAssets(true);
  await assert.rejects(assets.importVideoAsset('new-video'), /storage full/);
  assert.equal(files.has('file:///docs/training-videos/new-video.mp4'), false);
  assert.equal(files.has('file:///cache/source.mp4'), false);
});
test('native media rejects browser references and traversal before native playback', async () => {
  const { assets } = mockedAssets();
  assert.throws(() => assets.playbackUri({ storage: 'BROWSER_SESSION', uri: 'blob:old' }), /unavailable/);
  assert.throws(() => assets.playbackUri({ storage: 'DOCUMENTS', uri: '../private.mp4' }), /unavailable/);
  await assert.rejects(assets.importVideoAsset('../outside'), /identifier/);
  assert.equal(assets.playbackUri({ storage: 'DOCUMENTS', uri: 'training-videos/ok.mp4' }), 'file:///docs/training-videos/ok.mp4');
});
test('display-size adapter uses transformed native dimensions and rejects unavailable metadata', async () => {
  const filename = require('node:path').resolve(__dirname, '../src/training/videoDisplaySize.ts');
  const module = new (require('node:module'))(filename);
  let response = { width: 1080, height: 1920 };
  module.require = id => id === 'expo-modules-core' ? { requireOptionalNativeModule: () => ({ displaySize: async () => response }) }
    : id === './videoAssets' ? { playbackUri: () => 'file:///video.mp4' } : require(id);
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
  assert.deepEqual(await module.exports.videoDisplaySize({}), { width: 1080, height: 1920 });
  response = { width: Infinity, height: 0 }; assert.equal(await module.exports.videoDisplaySize({}), null);
});
