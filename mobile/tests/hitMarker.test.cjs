// Marking hits on a drill-library run's target (src/training/HitMarker.tsx).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);

function render(props) {
  const slots = []; let cursor = 0, changed = false, tree, serial = 0;
  const react = { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], next => { const v = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(v, slots[i])) { slots[i] = v; changed = true; } }]; } };
  const jsx = (type, p, key) => ({ type, props: p ?? {}, key });
  const file = path.resolve(__dirname, '../src/training/HitMarker.tsx');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const kit = { Action: 'Action', Copy: 'Copy', DataRow: 'DataRow', Notice: 'Notice', Panel: 'Panel', Segmented: 'Segmented' };
  const req = id => id === 'react' ? react : id === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'Fragment' }
    : id === 'react-native' ? { Pressable: 'Pressable', View: 'View' } : id === 'expo-image' ? { Image: 'Image' }
    : id === 'expo-modules-core' ? { uuid: { v4: () => 'id-' + (++serial) } } : id === '../ui/kit' ? kit : require(path.resolve(path.dirname(file), id + '.ts'));
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(req, module, module.exports);
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const doRender = () => { for (let pass = 0; pass < 10; pass++) { cursor = 0; changed = false; tree = module.exports.default(props); if (!changed) break; } };
  doRender();
  return { render: doRender, nodes: () => nodes(tree), find: pred => { const r = nodes(tree).find(pred); assert.ok(r, 'Missing UI node'); return r; },
    press(title) { const n = nodes(tree).find(x => x.props?.title === title); assert.ok(n && !n.props.disabled, title); n.props.onPress(); doRender(); } };
}

test('tap a spot, pick its zone; misses have no spot; undo; untagged hits are pointed out; group size from the marks', () => {
  const preset = require('../src/stage/targetPresets.ts').presetsForFamily('USPSA').find(p => p.id === 'uspsa-metric-chl-v1');
  const props = { family: 'USPSA', preset, distanceYards: 7, disabled: false,
    target: { presetId: preset.id, faceWidth: preset.width, faceHeight: preset.height, aim: { x: 0, y: 0 }, hits: [] } };
  props.onChange = t => { props.target = t; };
  const h = render(props);
  const face = () => h.find(n => n.props?.accessibilityLabel === 'Target: tap where a shot hit');
  // The diagram is 280 wide: the centre of the face, then 1/4 of the width to the right.
  face().props.onPress({ nativeEvent: { locationX: 140, locationY: 140 * preset.height / preset.width } }); h.render();
  assert.equal(props.target.hits.length, 1); assert.equal(props.target.hits[0].zone, null);
  assert.ok(Math.abs(props.target.hits[0].x) < 1e-9 && Math.abs(props.target.hits[0].y) < 1e-9);
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /^1 hit has no zone yet/.test(n.props.children)));
  const zones = h.find(n => n.type === 'Segmented');
  assert.deepEqual(zones.props.options, ['A', 'C', 'D'], 'only zones on this face');
  zones.props.onChange('A'); h.render();
  assert.equal(props.target.hits[0].zone, 'A');
  assert.ok(!h.nodes().some(n => n.type === 'Notice'));
  face().props.onPress({ nativeEvent: { locationX: 210, locationY: 140 * preset.height / preset.width } }); h.render();
  h.find(n => n.type === 'Segmented').props.onChange('C'); h.render();
  near(props.target.hits[1].x, preset.width / 4);
  h.press('MISS');
  assert.deepEqual(props.target.hits.map(x => [x.order, x.zone, x.x === null]), [[1, 'A', false], [2, 'C', false], [3, 'M', true]]);
  assert.equal(h.find(n => n.type === 'DataRow' && n.props.label === 'Marked').props.value, '2 on the target · 1 miss');
  assert.equal(h.find(n => n.type === 'DataRow' && n.props.label === 'Mean radius').props.value, (preset.width / 8).toFixed(1) + ' in');
  h.press('UNDO LAST');
  assert.equal(props.target.hits.length, 2);
  h.press('SET AIM POINT');
  face().props.onPress({ nativeEvent: { locationX: 210, locationY: 140 * preset.height / preset.width } }); h.render();
  assert.equal(props.target.hits.length, 2, 'the aim tap adds no hit'); near(props.target.aim.x, preset.width / 4);
});
function near(a, b, e = 1e-9) { assert.ok(Math.abs(a - b) < e, `${a} != ${b}`); }
