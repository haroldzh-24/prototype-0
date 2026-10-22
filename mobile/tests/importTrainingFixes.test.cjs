// Regression tests for RC2 diagram-import, camera and training data fixes (audit 2026-10-22).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { base64ToBytes, pcm16ToFloat32 } = require('../src/utils/base64.ts');
const { unreferencedPaths, takeDerivatives, recordDerivative, DOCUMENT_PATH } = require('../src/diagramImport/sessionFiles.ts');
const { Repository } = require('../src/storage/repository.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan } = require('../src/planning/model.ts');
const O = require('../src/training/observations.ts');
const { fullCrop, fullQuad } = require('../src/diagramImport/model.ts');

function open() {
  const db = new DatabaseSync(':memory:');
  return { db, repo: new Repository({
    execAsync: async sql => db.exec(sql), runAsync: async (sql, ...a) => db.prepare(sql).run(...a),
    getAllAsync: async (sql, ...a) => db.prepare(sql).all(...a), getFirstAsync: async (sql, ...a) => db.prepare(sql).get(...a) ?? null,
  }, randomUUID) };
}
/** Load a TS module with selected dependencies replaced (same approach as deviceHardening tests). */
function loadWith(relative, mocks) {
  const filename = path.resolve(__dirname, relative);
  const module = new (require('node:module'))(filename);
  module.require = id => (id in mocks ? mocks[id] : id.startsWith('.') ? require(path.resolve(path.dirname(filename), id)) : require(id));
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return module.exports;
}
const draft = (id, source, extra = {}) => ({ version: 1, id, source: { path: source, name: 'Diagram.png', mime: 'image/png', size: 10 }, sourceKind: 'image',
  alignment: { corners: fullQuad(), rotation: 0, crop: fullCrop() }, projection: 'unknown', origin: { x: 0, y: 0 }, proposals: [], ...extra });

test('base64 decoding matches Node for every padding length and rejects malformed input', () => {
  for (let n = 0; n < 40; n++) {
    const bytes = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255));
    assert.deepEqual(Buffer.from(base64ToBytes(bytes.toString('base64'))), bytes, `length ${n}`);
  }
  for (const bad of ['abc', 'ab=c', '!!!!', 'a===']) assert.throws(() => base64ToBytes(bad), /Invalid base64/);
});

test('16-bit PCM decodes to floats in [-1, 1] with sign and scale preserved', () => {
  const values = [0, 32767, -32767, 16384, -1, -32768];
  const buf = Buffer.alloc(values.length * 2); values.forEach((v, i) => buf.writeInt16LE(v, i * 2));
  const out = pcm16ToFloat32(buf.toString('base64'));
  assert.equal(out.length, values.length);
  values.forEach((v, i) => assert.ok(Math.abs(out[i] - v / 32767) < 1e-6, `${v}`));
  assert.equal(pcm16ToFloat32('').length, 0);
  assert.throws(() => pcm16ToFloat32(Buffer.from([1, 2, 3]).toString('base64')), /odd byte count/);
});

test('audio adapter accepts compact PCM, the older number array, and empty no-audio results', () => {
  const { nativeAudioToAnalysis } = loadWith('../src/training/extractAnalysisAudio.ts', {
    'expo-modules-core': { requireOptionalNativeModule: () => null }, './videoAssets': { playbackUri: () => '' },
  });
  const base = { sampleRate: 16000, offsetMs: 0, durationMs: 100, warnings: [] };
  const buf = Buffer.alloc(4); buf.writeInt16LE(32767, 0); buf.writeInt16LE(-32767, 2);
  const compact = nativeAudioToAnalysis({ ...base, pcm16: buf.toString('base64') });
  assert.ok(compact.samples instanceof Float32Array); assert.deepEqual(Array.from(compact.samples), [1, -1]);
  assert.equal('pcm16' in compact, false);
  assert.deepEqual(nativeAudioToAnalysis({ ...base, samples: [0.5, -0.25] }).samples, [0.5, -0.25]);
  assert.equal(nativeAudioToAnalysis({ ...base, pcm16: '', noAudio: true }).samples.length, 0);
});

test('session derivative tracking returns each path once and filters in-use files', () => {
  takeDerivatives();
  recordDerivative('diagram-imports/a.png'); recordDerivative('diagram-imports/b.png'); recordDerivative('diagram-imports/a.png');
  const taken = takeDerivatives();
  assert.deepEqual(taken.sort(), ['diagram-imports/a.png', 'diagram-imports/b.png']);
  assert.deepEqual(takeDerivatives(), []);
  assert.deepEqual(unreferencedPaths(taken, new Set(['diagram-imports/a.png'])), ['diagram-imports/b.png']);
  assert.ok(DOCUMENT_PATH.test('diagram-imports/3f2a-11.png'));
  for (const bad of ['../diagram-imports/x.png', 'diagram-imports/../x.png', 'training-videos/x.mp4', 'diagram-imports/x']) assert.ok(!DOCUMENT_PATH.test(bad), bad);
});

test('native document deletion removes only unreferenced app-owned files', async () => {
  const files = new Set(['file:///docs/diagram-imports/keep.png', 'file:///docs/diagram-imports/drop.png', 'file:///docs/other/x.png']);
  class File {
    constructor(...parts) { this.uri = parts.map(p => typeof p === 'string' ? p : p.uri).map((p, i) => i ? p.replace(/^\/+/, '') : p.replace(/\/+$/, '')).join('/'); }
    get exists() { return files.has(this.uri); }
    delete() { files.delete(this.uri); }
  }
  const assets = loadWith('../src/diagramImport/assets.ts', {
    'expo-file-system': { File, Directory: class {}, Paths: { document: { uri: 'file:///docs/' }, cache: { uri: 'file:///cache/' } } },
    'expo-document-picker': {}, 'expo-modules-core': { uuid: { v4: () => 'u' }, requireOptionalNativeModule: () => null },
  });
  const removed = await assets.deleteDocumentFiles(['diagram-imports/keep.png', 'diagram-imports/drop.png', '../other/x.png'], new Set(['diagram-imports/keep.png']));
  assert.equal(removed, 1);
  assert.deepEqual([...files].sort(), ['file:///docs/diagram-imports/keep.png', 'file:///docs/other/x.png']);
});

test('a damaged import draft no longer hides the stage\'s other references, and can be removed', async () => {
  const { db, repo } = open();
  await repo.initialize();
  const match = await repo.createMatch('M', 'USPSA');
  const stageId = await repo.createStage('S', createDefaultStage(), createPlan(), match);
  await repo.saveDiagramImport(stageId, draft('good', 'diagram-imports/good.png'));
  db.prepare('INSERT INTO diagram_imports (stageId, id, payload) VALUES (?, ?, ?)').run(stageId, 'bad', '{"version":1,"source":{"path":"diagram-imports/bad.png"}');
  const report = await repo.loadDiagramImportsReport(stageId);
  assert.deepEqual(report.drafts.map(d => d.id), ['good']);
  assert.deepEqual(report.damagedIds, ['bad']);
  assert.deepEqual((await repo.loadDiagramImports(stageId)).map(d => d.id), ['good']);
  await repo.deleteDiagramImport(stageId, 'bad');
  assert.deepEqual((await repo.loadDiagramImportsReport(stageId)).damagedIds, []);
});

test('files shared by duplicated stages stay in use until no draft references them', async () => {
  const { db, repo } = open();
  await repo.initialize();
  const match = await repo.createMatch('M', 'USPSA');
  const stageId = await repo.createStage('S', createDefaultStage(), createPlan(), match);
  const page = { asset: { path: 'diagram-imports/page.png', name: 'Page.png', mime: 'image/png', size: 5 }, width: 100, height: 100, page: 1, pageCount: 1 };
  await repo.saveDiagramImport(stageId, draft('d1', 'diagram-imports/orig.jpg', { page }));
  const copyId = await repo.duplicateStage(stageId);
  db.prepare('INSERT INTO diagram_imports (stageId, id, payload) VALUES (?, ?, ?)').run(copyId, 'broken', 'not json diagram-imports/kept-by-damaged.png');
  let inUse = await repo.diagramAssetPathsInUse();
  for (const p of ['diagram-imports/orig.jpg', 'diagram-imports/page.png', 'diagram-imports/kept-by-damaged.png']) assert.ok(inUse.has(p), p);
  await repo.deleteDiagramImport(stageId, 'd1');
  inUse = await repo.diagramAssetPathsInUse();
  assert.ok(inUse.has('diagram-imports/orig.jpg'), 'the duplicated stage still references the original');
});

test('the 20-reference limit message says how to proceed', async () => {
  const { repo } = open();
  await repo.initialize();
  const match = await repo.createMatch('M', 'USPSA');
  const stageId = await repo.createStage('S', createDefaultStage(), createPlan(), match);
  for (let i = 0; i < 20; i++) await repo.saveDiagramImport(stageId, draft('d' + i, `diagram-imports/f${i}.png`));
  await assert.rejects(() => repo.saveDiagramImport(stageId, draft('d20', 'diagram-imports/f20.png')), /Delete one to save another/);
});

test('deleting a training session withdraws only its profile measurements', async () => {
  const { db, repo } = open();
  await repo.initialize();
  const record = id => ({ id, userId: 'local', drillId: null, drillName: id, occurredAt: '2026-10-01T12:00:00Z', startingType: 'competitionHolster', totalTime: null, notes: '', segments: [] });
  await repo.saveTraining(record('keep')); await repo.saveTraining(record('drop'));
  const obs = (id, session) => ({ id, factor: 'reloadTime', value: 2, context: 'LIVE_FIRE', measuredAt: '2026-10-01T12:00:00Z', source: 'STRUCTURED_TRAINING', trainingSessionId: session });
  const profile = await repo.loadProfile();
  await repo.persistProfile(O.withPerformanceObservations(profile, [obs('o1', 'keep'), obs('o2', 'drop'), obs('o3', 'drop')]));
  await repo.deleteTraining('drop');
  assert.deepEqual((await repo.listTraining('local')).map(r => r.id), ['keep']);
  assert.deepEqual((await repo.loadProfile()).performanceObservations.map(o => o.id), ['o1']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM training WHERE id = 'drop'").get().n, 0);
  await repo.deleteTraining('missing'); // deleting an unknown session is a no-op
  assert.deepEqual((await repo.listTraining('local')).map(r => r.id), ['keep']);
});

test('Photos video import explains when the rebuilt app is needed, and adopts picked files into app storage', async () => {
  const files = new Set(['file:///tmp/picked-1.mov']);
  class File {
    constructor(...parts) { this.uri = parts.map(p => typeof p === 'string' ? p : p.uri).map((p, i) => i ? p.replace(/^\/+/, '') : p.replace(/\/+$/, '')).join('/'); }
    get exists() { return files.has(this.uri); } get size() { return 42; }
    delete() { files.delete(this.uri); }
    move(destination) { files.add(destination.uri); files.delete(this.uri); }
  }
  const fsMock = { File, Directory: class { create() {} }, Paths: { document: { uri: 'file:///docs/' }, cache: { uri: 'file:///cache/' } } };
  const missing = loadWith('../src/training/videoAssets.ts', { 'expo-file-system': fsMock, 'expo-document-picker': {}, 'expo-modules-core': { requireOptionalNativeModule: () => null } });
  await assert.rejects(missing.importVideoAsset('v1', 'photos'), /rebuilt iPhone app/);
  const picker = loadWith('../src/training/videoAssets.ts', { 'expo-file-system': fsMock, 'expo-document-picker': {},
    'expo-modules-core': { requireOptionalNativeModule: () => ({ pickVideo: async () => ({ uri: 'file:///tmp/picked-1.mov', name: 'Clip.mov', size: 42 }) }) } });
  const asset = await picker.importVideoAsset('v1', 'photos');
  assert.deepEqual(asset, { uri: 'training-videos/v1.mov', name: 'Clip.mov', storage: 'DOCUMENTS', size: 42 });
  assert.ok(files.has('file:///docs/training-videos/v1.mov')); assert.ok(!files.has('file:///tmp/picked-1.mov'));
  const cancelled = loadWith('../src/training/videoAssets.ts', { 'expo-file-system': fsMock, 'expo-document-picker': {},
    'expo-modules-core': { requireOptionalNativeModule: () => ({ pickVideo: async () => null }) } });
  assert.equal(await cancelled.importVideoAsset('v2', 'photos'), null);
});
