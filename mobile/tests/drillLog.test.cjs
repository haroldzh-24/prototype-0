// Drill logger: hit coordinates, group statistics, zone scoring and persistence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const D = require('../src/training/drillLog.ts');
const { drillKey } = require('../src/training/model.ts');
const { Repository } = require('../src/storage/repository.ts');
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const hit = (order, x, y, zone = null) => ({ id: 'h' + order, order, x, y, zone });
const run = (hits, patch = {}) => ({ id: 'r1', recordedAt: '2026-10-22T12:00:00Z', targetPresetId: 'uspsa-metric-chl-v1', family: 'USPSA',
  faceWidth: 18.12, faceHeight: 29.93, distanceYards: 10, aim: { x: 0, y: 0 }, hits, totalTime: 2.5, splits: [0.25, 0.3], notes: '', ...patch });
function open() {
  const db = new DatabaseSync(':memory:');
  return { db, repo: new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...a) => db.prepare(sql).run(...a),
    getAllAsync: async (sql, ...a) => db.prepare(sql).all(...a), getFirstAsync: async (sql, ...a) => db.prepare(sql).get(...a) ?? null }, randomUUID) };
}

test('USPSA scoring uses Appendix B1 values; B scores as C; each missing hit costs 10 (9.4)', () => {
  const hits = [hit(1, 0, 0, 'A'), hit(2, 1, 1, 'B'), hit(3, 2, 2, 'C'), hit(4, 3, 3, 'D'), hit(5, null, null, 'M'), hit(6, 4, 4, null)];
  const minor = D.scoreRun({ hits, family: 'USPSA' }, 'minor');
  assert.equal(minor.points, 5 + 3 + 3 + 1 - 10); assert.equal(minor.misses, 1); assert.equal(minor.untagged, 1);
  assert.equal(D.scoreRun({ hits, family: 'USPSA' }, 'major').points, 5 + 4 + 4 + 2 - 10);
});

test('PCSL scoring counts a T as two A hits against the required count; IDPA counts points down with -5 per miss', () => {
  // Five shots logged, five hits required: the T covers two of them, so the tagged miss is not a missing hit (11.3.4).
  const pcsl = D.scoreRun({ family: 'PCSL', hits: [hit(1, 0, 0, 'T'), hit(2, 0, 1, 'A'), hit(3, 0, 2, 'C'), hit(4, 0, 3, 'D'), hit(5, null, null, 'M')] });
  assert.equal(pcsl.points, 10 + 5 + 3 + 1); assert.equal(pcsl.misses, 0);
  const idpa = D.scoreRun({ family: 'IDPA', hits: [hit(1, 0, 0, '-0'), hit(2, 0, 1, '-1'), hit(3, 0, 2, '-3'), hit(4, null, null, 'M')] });
  assert.equal(idpa.pointsDown, 0 + 1 + 3 + 5); assert.equal(idpa.points, null);
  assert.equal(D.scoreRun({ family: null, hits: [] }).method, 'Untagged');
  assert.deepEqual(D.zoneChoices.USPSA, ['A', 'C', 'D', 'M', 'NS']);
});

test('group statistics come from coordinates only: centre, offset, spread, mean radius, SD and MOA', () => {
  const g = D.groupStats(run([hit(1, -1, 1), hit(2, 1, 1), hit(3, 1, -1), hit(4, -1, -1), hit(5, null, null, 'M')], { aim: { x: 0, y: 1 } }));
  assert.equal(g.shots, 4); assert.equal(g.misses, 1);
  assert.deepEqual(g.center, { x: 0, y: 0 });
  assert.deepEqual(g.offset, { x: 0, y: -1 }, 'one inch low of the aim point');
  near(g.extremeSpread, Math.hypot(2, 2)); near(g.meanRadius, Math.SQRT2);
  near(g.sdX, Math.sqrt(4 / 3)); near(g.sdY, Math.sqrt(4 / 3));
  near(g.meanRadiusMoa, Math.SQRT2 / (1.047 * 10 / 100));
  assert.equal(D.offsetText(g.offset), '1.0 in low');
  assert.equal(D.offsetText({ x: 0.5, y: 1.25 }), '1.3 in high, 0.5 in right');
  assert.equal(D.offsetText({ x: 0.01, y: -0.02 }), 'Centred on the aim point');
  const empty = D.groupStats(run([hit(1, null, null, 'M')]));
  assert.equal(empty.center, null); assert.equal(empty.misses, 1);
  const single = D.groupStats(run([hit(1, 2, 3)], { distanceYards: null }));
  assert.equal(single.extremeSpread, null); assert.equal(single.sdX, null); assert.equal(single.meanRadiusMoa, null);
});

test('validation rejects malformed runs and accepts real ones', () => {
  assert.equal(D.drillRunProblem(run([hit(1, 0, 0, 'A'), hit(2, null, null, 'M')])), null);
  assert.match(D.drillRunProblem(run([hit(1, null, 2)])), /both coordinates/);
  assert.match(D.drillRunProblem(run([hit(1, null, null, 'A')])), /Only misses/);
  assert.equal(D.drillRunProblem(run([hit(1, null, null, 'NS'), hit(2, null, null, 'NT')])), null, 'penalty hits need no coordinates');
  assert.match(D.drillRunProblem(run([], { requiredHits: -1 })), /required hits/);
  assert.match(D.drillRunProblem(run([], { procedurals: 1.5 })), /procedurals/);
  assert.match(D.drillRunProblem(run([], { powerFactor: 'heavy' })), /power factor/);
  assert.match(D.drillRunProblem(run([hit(1, 100, 0)])), /outside/);
  assert.match(D.drillRunProblem(run([hit(1, 0, 0), { ...hit(2, 0, 0), id: 'h1' }])), /Invalid hit/);
  assert.match(D.drillRunProblem(run([], { distanceYards: -3 })), /distance/);
  assert.match(D.drillRunProblem(run([], { splits: [NaN] })), /splits/);
  assert.match(D.drillRunProblem(run([], { faceWidth: 0 })), /face size/);
});

test('trend rows are ordered oldest first and drill keys link repeated sessions', () => {
  const rows = D.drillTrend([
    { ...run([hit(1, 1, 0)], { id: 'b', recordedAt: '2026-10-20T00:00:00Z' }), sessionName: 'B' },
    { ...run([hit(1, 3, 0), hit(2, -3, 0)], { id: 'a', recordedAt: '2026-10-10T00:00:00Z' }), sessionName: 'A' }]);
  assert.deepEqual(rows.map(r => r.id), ['a', 'b']);
  near(rows[0].meanRadius, 3); near(rows[1].meanRadius, 0);
  assert.equal(drillKey({ id: 's1', drillId: null }), 'drill-s1');
  assert.equal(drillKey({ id: 's2', drillId: 'drill-s1' }), 'drill-s1');
});

test('runs persist with their hit coordinates; invalid runs are refused; sessions without runs still load', async () => {
  const { repo } = open();
  await repo.initialize();
  const base = { id: 's1', userId: 'local', drillId: null, drillName: 'Bill drill', occurredAt: '2026-10-22T12:00:00Z', startingType: 'competitionHolster', totalTime: null, notes: '', segments: [] };
  await repo.saveTraining(base);
  const saved = run([hit(1, -0.75, 2.125, 'A'), hit(2, null, null, 'M')]);
  await repo.saveTraining({ ...base, runs: [saved] });
  const loaded = (await repo.listTraining('local'))[0];
  assert.deepEqual(loaded.runs, [saved]);
  await assert.rejects(() => repo.saveTraining({ ...base, runs: [run([hit(1, 999, 0)])] }), /outside/);
  await assert.rejects(() => repo.saveTraining({ ...base, runs: [saved, saved] }), /Duplicate/);
  assert.deepEqual((await repo.listTraining('local'))[0].runs, [saved], 'refused writes leave the saved copy intact');
});

test('the target face maps taps to face inches (+y up), used by MARK ON TARGET', () => {
  // The drill logger's own editor (DrillRunEditor) was never shown and is removed; its runs still load (above).
  const { tapToFace } = require('../src/training/targetFace.ts');
  const p = tapToFace(140, 0, 280, 462.5, 18.12, 29.93);
  near(p.x, 0); near(p.y, 29.93 / 2);
  const q = tapToFace(0, 462.5, 280, 462.5, 18.12, 29.93);
  near(q.x, -18.12 / 2); near(q.y, -29.93 / 2);
  assert.ok(!fs.existsSync(require('node:path').resolve(__dirname, '../src/training/DrillRunEditor.tsx')), 'the unused editor is gone');
});
