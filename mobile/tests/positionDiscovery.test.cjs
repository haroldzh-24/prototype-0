const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const D = require('../src/planning/positionDiscovery.ts');
const { createObject } = require('../src/stage/defaults.ts');
const { shootingDifficulty } = require('../src/planning/shootingDifficulty.ts');
const point = (x, y) => ({ space: 'stage', x, y, z: 0 });
const target = (id = 't', x = 180, y = 180) => createObject('cardboardTarget', id, x, y);
const wall = () => ({ ...createObject('wall', 'w', 100, 100), geometry: { length: 120, thickness: 12, height: 72 } });
const stage = (objects = [], width = 216, depth = 216) => ({ schemaVersion: 7, coordinateSystem: 'inches', stage: { width, depth }, objects });
function candidate(x, y, targets = [target()]) {
  const position = point(x, y);
  return { ...D.computeTargetVisibility(position, targets, []), id: `${x}-${y}`, position,
    source: 'AUTO_DISCOVERED', distanceFromStart: Math.hypot(x, y), reachability: 'NOT_EVALUATED' };
}

test('discovery physical bounds include edges and reject outside/nonfinite coordinates', () => {
  for (const p of [point(0, 0), point(216, 216), point(108, 108)]) assert.equal(D.isPointInsideAllowedArea(p, stage().stage), true);
  for (const p of [point(-1, 1), point(217, 1), point(1, 217), point(NaN, 0), { ...point(1, 1), z: 1 }]) assert.equal(D.isPointInsideAllowedArea(p, stage().stage), false);
});
test('rotated wall uses exact footprint and discovery rejects occupied samples', () => {
  const w = { ...wall(), rotation: 45 };
  assert.equal(D.isPointInsideWall(point(120, 120), w), true);
  assert.equal(D.isPointInsideWall(point(120, 80), w), false);
  const result = D.discoverCandidatePositions(stage([w, target()]));
  assert.ok(result.candidates.length);
  assert.ok(result.candidates.every(c => !D.isPointInsideWall(c.position, w)));
});
test('LOS distinguishes clear, blocked, tangential and same-side segments', () => {
  const w = wall();
  assert.equal(D.hasLineOfSight(point(100, 0), point(100, 200), []), true);
  assert.equal(D.hasLineOfSight(point(100, 0), point(100, 200), [w]), false);
  assert.equal(D.hasLineOfSight(point(40, 0), point(40, 200), [w]), false);
  assert.equal(D.hasLineOfSight(point(0, 0), point(0, 200), [w]), true);
  assert.equal(D.hasLineOfSight(point(100, 0), point(100, 50), [w]), true);
});
test('projected ports pass only segments wholly within opening across wall thickness', () => {
  const w = { ...wall(), ports: [{ id: 'p', offset: 0, width: 20, height: 24, sill: 36 }] };
  assert.equal(D.hasLineOfSight(point(100, 0), point(100, 200), [w]), true);
  assert.equal(D.hasLineOfSight(point(120, 0), point(120, 200), [w]), false);
  assert.equal(D.hasLineOfSight(point(0, 80), point(200, 120), [w]), false);
  assert.equal(D.isPointInsideWall(point(100, 100), w), true);
  const rotated = { ...w, rotation: 90 };
  assert.equal(D.hasLineOfSight(point(0, 100), point(200, 100), [rotated]), true);
  assert.equal(D.hasLineOfSight(point(0, 120), point(200, 120), [rotated]), false);
  assert.ok(D.discoverCandidatePositions(stage([w, target()])).warnings.some(w => w.code === 'PROJECTED_PORTS'));
});
test('partial visibility reports scoring coverage, distance and authoritative difficulty', () => {
  const targets = [target('blocked', 100, 180), target('clear', 0, 180)];
  const p = point(0, 0), result = D.computeTargetVisibility(p, targets, [wall()]);
  assert.deepEqual(result.visibleTargetIds, ['clear']);
  assert.equal(result.visibleScoringTargetCount, 1);
  assert.equal(result.coveragePercentage, 50);
  assert.equal(result.coverageRatio, 0.5);
  assert.equal(result.averageTargetDistance, 180);
  assert.equal(result.minimumTargetDistance, 180);
  assert.equal(result.maximumTargetDistance, 180);
  assert.equal(result.averageShootingDifficulty, shootingDifficulty(p, targets[1].position).score);
  assert.equal(result.totalShootingDifficulty, 5);
});
test('LOS uses rotated active partial face center', () => {
  const t = target('partial', 100, 180);
  t.faceCut.preset = 'right';
  const w = { ...wall(), geometry: { length: 2, thickness: 2, height: 72 } };
  assert.equal(D.hasLineOfSight(point(100, 0), t.position, [w]), false);
  assert.deepEqual(D.computeTargetVisibility(point(100, 0), [t], [w]).visibleTargetIds, ['partial']);
});
test('zero-coverage and wholly occupied stages yield no candidates', () => {
  const w = { ...wall(), position: point(18, 18), geometry: { length: 40, thickness: 40, height: 72 } };
  assert.deepEqual(D.discoverCandidatePositions(stage([w, target('t', 18, 18)], 36, 36)).candidates, []);
  const enclosedTarget = stage([wall(), target('t', 100, 100)]);
  assert.deepEqual(D.discoverCandidatePositions(enclosedTarget).candidates, []);
  assert.deepEqual(D.deduplicateCandidatePositions([candidate(0, 0, [])]), []);
});
test('near duplicates keep stronger representative independent of input order', () => {
  const a = candidate(0, 0), b = candidate(2, 2);
  assert.deepEqual(D.deduplicateCandidatePositions([a, b]).map(c => c.id), [b.id]);
  assert.deepEqual(D.deduplicateCandidatePositions([b, a]).map(c => c.id), [b.id]);
});
test('deduplication preserves distant and distinct-difficulty shooting alternatives', () => {
  assert.equal(D.deduplicateCandidatePositions([candidate(0, 0), candidate(144, 0)]).length, 2);
  assert.equal(D.deduplicateCandidatePositions([candidate(0, 0), candidate(30, 30)]).length, 2);
  assert.equal(D.deduplicateCandidatePositions([candidate(0, 0), candidate(1, 1, [target('other')])]).length, 2);
});
test('bounded coarsened grid spans stage and handles extreme aspect ratios', () => {
  for (const [width, depth] of [[216, 216], [1000000, 1], [1, 1000000]]) {
    const s = stage([target('t', width / 2, depth / 2)], width, depth);
    const r = D.discoverCandidatePositions(s, { maxSampledPoints: 4, deduplicationRadiusInches: 0 });
    assert.ok(r.search.sampledPoints <= 4);
    assert.equal(r.search.truncated, true);
    assert.ok(r.candidates.every(c => D.isPointInsideAllowedArea(c.position, s.stage)));
    assert.ok(r.candidates.some(c => width > depth ? c.position.x > width / 2 : c.position.y > depth / 2));
  }
});
test('LOS limit retains complete visibility from earlier candidates', () => {
  const r = D.discoverCandidatePositions(stage([target('a'), target('b', 100, 100)]), { maxLOSChecks: 3 });
  assert.equal(r.search.losChecks, 2);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].visibleScoringTargetCount, 2);
  assert.equal(r.search.truncated, true);
});
test('target and result caps warn and preserve honest coverage denominator', () => {
  const r = D.discoverCandidatePositions(stage([target('a'), target('b')]), { maxTargets: 1, maxDiscoveredPositions: 1 });
  assert.equal(r.candidates.length, 1);
  assert.equal(r.search.consideredTargets, 1);
  assert.equal(r.candidates[0].coverageRatio, 0.5);
  assert.equal(r.search.truncated, true);
  assert.ok(r.warnings.filter(w => w.code === 'SEARCH_LIMIT').length >= 2);
});
test('empty and malformed documents/configuration do not crash or invent candidates', () => {
  for (const s of [null, {}, stage(), { ...stage(), objects: null }, stage([null]), stage([{ id: 'bad', type: 'wall' }]), stage([target(), target()]), stage([], NaN)]) {
    assert.deepEqual(D.discoverCandidatePositions(s).candidates, []);
  }
  for (const config of [{ gridSpacingInches: 0 }, { maxLOSChecks: Infinity }, { maxSampledPoints: 1e9 }, { difficultyTolerance: NaN }]) {
    assert.ok(D.discoverCandidatePositions(stage([target()]), config).warnings.some(w => w.code === 'INVALID_GEOMETRY'));
  }
});
test('malformed targets remain in denominator and malformed ports remain solid', () => {
  const s = stage([target('good'), { ...target('bad'), geometry: null }]);
  const r = D.discoverCandidatePositions(s);
  assert.ok(r.candidates.length);
  assert.equal(r.candidates[0].coverageRatio, 0.5);
  const w = { ...wall(), ports: [null, { width: 1e9 }] };
  const invalid = D.discoverCandidatePositions(stage([w, target()]));
  const solid = D.discoverCandidatePositions(stage([{ ...w, ports: [] }, target()]));
  assert.deepEqual(invalid.candidates, solid.candidates);
  assert.ok(invalid.warnings.some(w => w.code === 'INVALID_GEOMETRY'));
});
test('object/port budgets fail closed instead of dropping blockers', () => {
  assert.equal(D.discoverCandidatePositions(stage([target(), wall()]), { maxObjects: 1 }).search.truncated, true);
  const w = { ...wall(), ports: Array(33).fill({ id: 'p', offset: 0, width: 12, height: 12, sill: 0 }) };
  const r = D.discoverCandidatePositions(stage([w, target()]));
  assert.deepEqual(r.candidates, []);
  assert.equal(r.search.truncated, true);
});
test('missing start, ground markings and a single useful cell are supported', () => {
  const s = stage([target('t', 18, 18)], 36, 36);
  const r = D.discoverCandidatePositions(s);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].distanceFromStart, null);
  assert.equal(r.candidates[0].reachability, 'NOT_EVALUATED');
  s.objects.push(createObject('faultLine', 'f', 18, 18), createObject('noShootTarget', 'n', 18, 18));
  assert.deepEqual(D.discoverCandidatePositions(s).candidates, r.candidates);
  s.objects.push(createObject('start', 'start', 1, 1));
  const withStart = D.discoverCandidatePositions(s);
  assert.equal(withStart.candidates.length, 1);
  assert.equal(withStart.candidates[0].distanceFromStart, Math.hypot(17, 17));
});
test('discovery is deterministic and conversion does not mutate stage or inferred visibility', () => {
  const s = stage([target(), wall()]), before = JSON.stringify(s);
  const a = D.discoverCandidatePositions(s), b = D.discoverCandidatePositions(s);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(s), before);
  assert.ok(a.candidates.length);
  const converted = D.toShootingPosition(a.candidates[0]);
  assert.deepEqual(converted.engagedTargetIds, []);
  converted.visibleTargetIds.length = 0;
  converted.position.x = -1;
  assert.ok(a.candidates[0].visibleTargetIds.length);
  assert.ok(a.candidates[0].position.x >= 0);
});
