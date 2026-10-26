// Target pictures (radial menu icons, dimensioned drawings, 3D views) and the radial menu's layout helpers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const A = require('../src/stage/targetArt.ts');
const P = require('../src/stage/targetPresets.ts');
// The menu's helpers live in a .tsx file; load just them by transpiling with JSX and stubbing React Native.
const radialSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/editor/RadialAddMenu.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const R = { exports: {} };
new Function('require', 'module', 'exports', radialSource)(id => id === 'react' ? { useState() {}, useEffect() {}, useMemo() {} } : id === 'react/jsx-runtime' ? { jsx() {}, jsxs() {} }
  : id === 'react-native' ? {} : id === 'expo-image' ? {} : require(path.resolve(__dirname, '../src/editor', id) + '.ts'), R, R.exports);
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('every preset has a picture: outline at its real size, valid SVG, as icon, dimensioned drawing and 3D view', () => {
  for (const preset of P.targetPresets) {
    const pts = A.outlinePoints(preset), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    near(Math.max(...xs) - Math.min(...xs), preset.width, 1e-6); near(Math.max(...ys) - Math.min(...ys), preset.height, 1e-6);
    near(Math.min(...ys), 0, 1e-9);
    for (const role of ['scoring', 'noShoot']) {
      const icon = A.targetArtSvg(preset, role, { size: 48 });
      assert.match(icon, /^<svg [^>]*viewBox="0 0 48 48"/); assert.match(icon, /<\/svg>$/);
      assert.doesNotMatch(icon, /NaN|undefined|Infinity/, preset.id);
      const iso = A.targetIsoSvg(preset, role, { size: 120 });
      assert.doesNotMatch(iso, /NaN|undefined|Infinity/, preset.id);
    }
    const drawing = A.targetArtSvg(preset, 'scoring', { size: 200, dimensions: true });
    assert.ok(drawing.includes(`${Number(preset.width.toFixed(2))} in &#183; ${(preset.width * 2.54).toFixed(1)} cm`), preset.id + ' width label');
    for (const svg of [drawing, A.targetIsoSvg(preset), A.targetArtSvg(preset, 'noShoot')]) assert.match(svg, /^[\x20-\x7E]*$/, preset.id + ': ASCII only, so a base64 data URI decodes it');
    assert.ok(drawing.includes(`${Number(preset.height.toFixed(2))} in &#183; ${(preset.height * 2.54).toFixed(1)} cm`), preset.id + ' height label');
  }
});

test('colours follow each rulebook: USPSA white no-shoots, PCSL red with an X, IDPA open hands, PCSL blue steel', () => {
  const by = id => P.targetPreset(id);
  assert.equal(A.targetColours(by('uspsa-metric-chl-v1'), 'noShoot').face, '#F2F2EE');
  assert.equal(A.targetColours(by('pcsl-practical-2025-v1'), 'noShoot').face, '#D7262E');
  assert.match(A.targetArtSvg(by('pcsl-practical-2025-v1'), 'noShoot'), /<path d="M[^"]+" stroke="#0A0A0A"/, 'PCSL no-shoot X');
  assert.doesNotMatch(A.targetArtSvg(by('uspsa-metric-chl-v1'), 'noShoot'), /<path/, 'no X on a USPSA no-shoot');
  assert.match(A.targetArtSvg(by('idpa-standard-2026-v1'), 'noShoot'), /fill="#FFFFFF"/, 'IDPA open hands');
  assert.equal(A.targetColours(by('pcsl-round-8-v1'), 'scoring').face, '#2F6FD6');
  assert.equal(A.targetColours(by('uspsa-popper-42-ss-v1'), 'scoring').face, '#F7F7F5');
  for (const preset of P.targetPresets) assert.ok(A.targetColours(preset, 'scoring').note.length > 10);
});

test('short menu names drop the family and the vendor', () => {
  assert.equal(P.shortPresetName(P.targetPreset('uspsa-metric-chl-v1')), 'Metric');
  assert.equal(P.shortPresetName(P.targetPreset('pcsl-k-zone-legacy-v1')), 'K-Zone');
  assert.equal(P.shortPresetName(P.targetPreset('idpa-square-6-v1')), '6 in square');
  assert.equal(P.shortPresetName(P.targetPreset('uspsa-mini-popper-bst-v1')), 'Mini popper');
});

test('radial layout: items evenly round the centre, first at the top, menu kept inside the canvas', () => {
  const ring = R.exports.ringPositions(4, 100);
  near(ring[0].x, 0); near(ring[0].y, -100); near(ring[1].x, 100); near(ring[2].y, 100);
  for (const p of R.exports.ringPositions(7, 118)) near(Math.hypot(p.x, p.y), 118);
  assert.deepEqual(R.exports.clampCenter({ x: 5, y: 5 }, { width: 400, height: 600 }, 150), { x: 150, y: 194 });
  assert.deepEqual(R.exports.clampCenter({ x: 200, y: 300 }, { width: 400, height: 600 }, 150), { x: 200, y: 300 });
  assert.deepEqual(R.exports.clampCenter({ x: 0, y: 0 }, { width: 200, height: 200 }, 150), { x: 100, y: 122 }, 'a too-small canvas splits the difference');
  // Each family's categories hold the right kinds of target.
  for (const family of ['USPSA', 'PCSL', 'IDPA']) {
    assert.ok(R.exports.presetsIn(family, 'paper').length > 0 && R.exports.presetsIn(family, 'paper').every(p => p.type === 'cardboardTarget'));
    assert.ok(R.exports.presetsIn(family, 'plate').every(p => p.type === 'steelPlate'));
    assert.ok(R.exports.presetsIn(family, 'steel').every(p => p.type === 'steelPopper'));
  }
});
