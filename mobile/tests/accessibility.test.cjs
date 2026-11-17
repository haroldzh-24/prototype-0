// Accessibility and screens (2026-11-17): large-text caps, Bold Text, live regions on iPhone, high contrast,
// VoiceOver actions and words, day/night on Home, iPad, the Target logo, icons and the launch animation.
// Device behaviour (real Dynamic Type, VoiceOver focus, Smart Invert) still needs the phone check.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const root = path.join(__dirname, '..');
const src = file => fs.readFileSync(path.join(root, 'src', file), 'utf8');
const files = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(d => d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []);

/** Load a .tsx module's exports with stubbed React Native; '@/' and relative .ts imports are the real modules. */
function loadTsx(file, stubs = {}) {
  const full = path.join(root, 'src', file);
  const out = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  const req = id => {
    if (id in stubs) return stubs[id];
    if (id === 'react') return { useRef: v => ({ current: v }), useState: v => [v, () => {}], useEffect() {}, useMemo: f => f(), forwardRef: f => f };
    if (id === 'react/jsx-runtime') return { jsx() {}, jsxs() {}, Fragment: 'Fragment' };
    if (id === 'react-native') return { View: 'View', Pressable: 'Pressable', Image: 'Image', StyleSheet: { create: s => s, flatten: s => s }, PanResponder: { create: () => ({ panHandlers: {} }) }, Platform: { OS: 'ios' } };
    const target = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(full), id);
    if (fs.existsSync(target + '.ts')) return require(target + '.ts');
    if (fs.existsSync(target + '.tsx')) return { __esModule: true, default: path.basename(target) };
    return require(id);
  };
  new Function('require', 'module', 'exports', out)(req, m, m.exports);
  return m.exports;
}

test('every screen uses the app’s Text and TextInput, so large text is capped everywhere', () => {
  const offenders = files('src').filter(f => !f.endsWith(path.join('ui', 'text.tsx'))).filter(f => {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    return [...code.matchAll(/import \{([^}]*)\} from 'react-native'/g)].some(m => /\b(Text|TextInput)\b(?! as)/.test(m[1].replace(/\b\w+Props\b|\bTextStyle\b/g, '')))
      || /import \{[^}]*\bText as \w+[^}]*\} from 'react-native'/.test(code);
  });
  assert.deepEqual(offenders, []);
  const text = src('ui/text.tsx');
  assert.match(text, /TEXT_SCALE = \{ reading: 2, bar: 1\.35, number: 1\.5 \}/);
  assert.match(text, /maxFontSizeMultiplier=\{cap\}/, 'Text and TextInput always pass a cap');
  // Bars, badges and stage labels use the bar cap.
  for (const f of ['ui/kit.tsx', 'editor/StageGrid.tsx', 'editor/DraggableObject.tsx', 'editor/RouteOverlay.tsx', 'editor/ModeChip.tsx', 'planning/PlanChecklist.tsx', 'stage3d/EyeLevelView.tsx'])
    assert.match(src(f), /maxFontSizeMultiplier=\{TEXT_SCALE\.bar\}/, f);
});

test('Bold Text: every app font has a heavier weight, and it is loaded', () => {
  const tokens = src('ui/tokens.ts'), layout = src('app/_layout.tsx'), text = src('ui/text.tsx');
  const fonts = [...tokens.match(/export const fonts = \{([\s\S]*?)\};/)[1].matchAll(/'([A-Za-z_0-9]+)'/g)].map(m => m[1]);
  const map = Object.fromEntries([...text.match(/const HEAVIER[^{]*\{([\s\S]*?)\};/)[1].matchAll(/(\w+): '(\w+)'/g)].map(m => [m[1], m[2]]));
  for (const f of fonts) { assert.ok(map[f], f + ' has a heavier step'); assert.match(layout, new RegExp(`\\b${map[f]}\\b`), map[f] + ' is loaded'); }
});

/** Load a .ts module that imports React Native, with React Native and React stubbed. */
function loadTs(file, rn = {}) {
  const full = path.join(root, 'src', file), m = { exports: {} };
  const out = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', out)(id => id === 'react-native' ? { Platform: { OS: 'ios' }, AccessibilityInfo: {}, ...rn } : id === 'react' ? { useState: v => [v, () => {}], useEffect() {} } : require(path.resolve(path.dirname(full), id)), m, m.exports);
  return m.exports;
}

test('a11y state: subscribers hear changes; announcements stay silent without VoiceOver', () => {
  const spoken = [];
  const a = loadTs('ui/a11y.ts', { AccessibilityInfo: { announceForAccessibility: t => spoken.push(t) } });
  let calls = 0; const off = a.onA11yChange(() => calls++);
  a.setA11y({ reduceMotion: true }); a.setA11y({ reduceMotion: true }); assert.equal(calls, 1, 'only real changes notify');
  assert.equal(a.a11y().reduceMotion, true); off(); a.setA11y({ reduceMotion: false });
  a.announce('Saved'); assert.deepEqual(spoken, [], 'silent without VoiceOver');
  a.setA11y({ screenReader: true }); a.announce('Saved'); assert.deepEqual(spoken, ['Saved']);
  assert.equal(a.spokenText(['P1: ', 2, ' targets', null, { props: { children: ' ok' } }]), 'P1: 2 targets ok');
});

test('live regions are spoken on iPhone (React Native only does it on Android); errors also when they appear', () => {
  const text = src('ui/text.tsx');
  assert.match(text, /Platform\.OS !== 'ios'/); assert.match(text, /live === 'assertive'/);
  assert.match(src('ui/kit.tsx'), /accessibilityLiveRegion=\{tone === 'error' \|\| tone === 'warning' \? 'assertive' : 'polite'\}/);
  assert.match(src('planning/RouteAnalysis.tsx'), /useAnnounce\(`Time /, 'ANALYZE says its answer');
  assert.match(src('planning/v2/RoutePlannerV2Panel.tsx'), /useAnnounce\(running \? 'Planning'/, 'AUTO-PLAN says its outcome');
});

const luminance = hex => { const v = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('high contrast palettes: same colours as the standard ones, grey text at 7:1 or better', () => {
  const T = require('../src/ui/tokens.ts');
  for (const [name, p, base] of [['day', T.dayHighContrastPalette, T.dayPalette], ['night', T.nightHighContrastPalette, T.nightPalette]]) {
    assert.deepEqual(Object.keys(p).sort(), Object.keys(base).sort(), name);
    for (const surface of ['background', 'panel', 'secondary']) for (const ink of ['text', 'muted', 'subdued']) assert.ok(contrast(p[ink], p[surface]) >= 7, `${name}: ${ink} on ${surface} ${contrast(p[ink], p[surface]).toFixed(2)}`);
    for (const ink of ['muted', 'subdued']) assert.ok(contrast(p[ink], p.background) > contrast(base[ink], base.background), `${name}: ${ink} is stronger`);
  }
});

test('high contrast follows iOS Increase Contrast or the Profile choice', () => {
  const theme = require('../src/ui/theme.ts'), T = require('../src/ui/tokens.ts');
  theme.setThemePreference('day'); theme.setHighContrast(true);
  assert.equal(T.palette(), T.dayHighContrastPalette);
  theme.setThemePreference('night'); assert.equal(T.palette(), T.nightHighContrastPalette);
  theme.setHighContrast(false); assert.equal(T.palette(), T.nightPalette);
  theme.setThemePreference('day');
  const c = src('ui/contrast.ts');
  assert.match(c, /setHighContrast\(preference === 'high' \|\| a11y\(\)\.increaseContrast\)/);
  assert.match(src('ui/a11y.ts'), /'darkerSystemColorsChanged', 'isDarkerSystemColorsEnabled'/, 'Increase Contrast is iOS “darker system colors”');
  assert.match(src('app/account.tsx'), /options=\{\['STANDARD', 'HIGH'\]\}/);
});

test('VoiceOver can move and rotate a selected object without dragging; layers move with their target', () => {
  const ops = require('../src/stage/operations.ts');
  const D = loadTsx('editor/DraggableObject.tsx', { './TargetFace': { default: 'TargetFace' }, '@/editor/FieldText': { default: 'Text' } });
  const stage = ops.addObject(require('../src/stage/defaults.ts').createDefaultStage('USPSA'), 'wall', 'wall-a11y');
  const wall = stage.objects.find(o => o.id === 'wall-a11y');
  {
    const moved = D.applyObjectAction(stage, wall, 'left');
    assert.equal(moved.objects.find(o => o.id === wall.id).position.x, wall.position.x - 12);
    const turned = D.applyObjectAction(stage, wall, 'clockwise');
    assert.equal(turned.objects.find(o => o.id === wall.id).rotation, wall.rotation + 15);
    assert.equal(D.applyObjectAction(stage, wall, 'unknown'), stage);
  }
  assert.deepEqual(D.OBJECT_ACTIONS.map(a => a.name), ['left', 'right', 'up', 'down', 'clockwise', 'counterclockwise']);
});

test('the source wires the object actions only on the selected object in BUILD', () => {
  const d = src('editor/DraggableObject.tsx');
  assert.match(d, /accessibilityActions=\{selected && props\.onAccessibilityTap === undefined \?/);
  assert.match(d, /const id = movingId\(item\)/, 'a layered face moves the target it sits on');
});

test('the plan in words for the 3D view', () => {
  const { routeAsWords } = require('../src/planning/routeWords.ts');
  const stage = { objects: [{ id: 'a', type: 'cardboardTarget' }, { id: 'b', type: 'cardboardTarget' }, { id: 'c', type: 'steelPopper' }] };
  const route = { positions: [{ id: 'p1', engagedTargetIds: ['a', 'b'] }, { id: 'p2', engagedTargetIds: ['c'], movingTargetIds: ['b'] }], reloads: [{ positionId: 'p1' }] };
  const words = routeAsWords(stage, route);
  assert.match(words, /^Route, 2 positions\. P1: T1, T2, then reload\. On the way to P2: T2\. P2: /);
  assert.equal(routeAsWords(stage, null), 'No route planned yet.');
  assert.match(src('stage3d/Stage3DView.tsx'), /accessibilityValue=\{props\.spokenRoute/);
});

test('trends: one VoiceOver stop per run; over par in words and with a mark, not colour only', () => {
  const Y = loadTsx('training/YourNumbers.tsx', { '../editor/EditorSheet': { default: 'EditorSheet' } });
  const label = Y.trendRowLabel({ at: '2026-11-14T12:00:00Z', total: 1.52, hitFactor: 6.2 }, 1.3);
  assert.match(label, /1\.52 seconds, over par by 0\.22, hit factor 6\.20$/);
  assert.match(Y.trendRowLabel({ at: '2026-11-14T12:00:00Z', total: 1.2, hitFactor: null }, 1.3), /at or under par$/);
  assert.match(src('training/YourNumbers.tsx'), /' ▲'/);
  assert.match(src('training/DrillSheet.tsx'), /<Segmented tabs options=\{DRILL_TABS\}/, 'LOG · RUNS · HOW TO read as tabs');
  assert.match(src('ui/kit.tsx'), /accessibilityRole=\{tabs \? 'tab' : 'button'\}/);
});

test('day and night are on Home; Profile keeps contrast', () => {
  const home = src('app/index.tsx'), profile = src('app/account.tsx');
  assert.match(home, /THEME_OPTIONS = \['SYSTEM', 'DAY', 'NIGHT'\]/); assert.match(home, /<Segmented options=\{THEME_OPTIONS\}/);
  assert.match(home, /assets\/logo\/mark\.png/, 'the logo on Home');
  assert.doesNotMatch(profile, /'SYSTEM', 'DAY', 'NIGHT'/);
  assert.match(home, /Settings · contrast/);
});

test('iPad: full-screen, portrait, and lists and sheets in one centred column', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  assert.equal(app.ios.supportsTablet, true); assert.equal(app.ios.requireFullScreen, true, 'portrait-only iPad apps must opt out of Split View');
  assert.equal(app.orientation, 'portrait');
  assert.match(src('ui/kit.tsx'), /CONTENT_MAX = 720/); assert.match(src('ui/kit.tsx'), /maxWidth: CONTENT_MAX, alignSelf: 'center'/);
  assert.match(src('editor/EditorSheet.tsx'), /maxWidth: 720, alignSelf: 'center'/);
});

test('the Target logo: icons for light, dark and tinted, 1024 px; the launch screen is the animation’s first frame', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const png = f => { const b = fs.readFileSync(path.join(root, f)); assert.equal(b.toString('ascii', 1, 4), 'PNG', f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };
  for (const k of ['light', 'dark', 'tinted']) { const p = png(app.ios.icon[k]); assert.deepEqual([p.w, p.h], [1024, 1024], k); }
  assert.equal(png(app.ios.icon.light).colorType, 2, 'the App Store icon has no alpha channel');
  assert.equal(png(app.icon).colorType, 2);
  const splash = app.plugins.find(p => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
  const intro = src('ui/LaunchIntro.tsx');
  assert.equal(splash.backgroundColor, intro.match(/INK = '(#[0-9A-F]{6})'/)[1], 'launch screen colour = the animation’s first frame');
  for (const f of ['target.png', 'target@2x.png', 'target@3x.png', 'mark.png', 'mark@2x.png', 'mark@3x.png']) png('assets/logo/' + f);
});

test('launch animation: about 1.6 s, once per launch, skippable, still with Reduce Motion, skipped with VoiceOver', () => {
  const intro = src('ui/LaunchIntro.tsx');
  const timing = Object.fromEntries([...intro.match(/INTRO_TIMING = \{([^}]*)\}/)[1].matchAll(/(\w+): \[(\d+), (\d+)\]/g)].map(m => [m[1], [+m[2], +m[3]]]));
  const built = Math.max(...['turn', 'aZone', 'hit1', 'hit2', 'wordmark'].map(k => timing[k][0] + timing[k][1]));
  assert.ok(built <= 1700, 'built by ' + built + ' ms'); assert.ok(timing.fadeOut[0] + timing.fadeOut[1] <= 2100, 'gone by 2.1 s');
  assert.match(intro, /let played = false/); assert.match(intro, /if \(played\) return;/);
  assert.match(intro, /onPress=\{\(\) => finish\(true\)\}/, 'a tap skips');
  assert.match(intro, /if \(reduceMotion\) \{/); assert.match(intro, /if \(screenReader\) \{ played = true; setDone\(true\); return; \}/);
  assert.match(intro, /accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/);
  assert.match(src('app/_layout.tsx'), /<LaunchIntro \/>/);
});

test('Smart Invert leaves photos, video, the 3D view and target pictures alone', () => {
  for (const f of ['editor/StageBackdrop.tsx', 'diagramImport/DiagramImportScreen.tsx', 'training/DrillVideo.tsx', 'training/VideoAnalysisEditor.tsx', 'stage3d/GLStage.tsx', 'editor/LayerPanel.tsx'])
    assert.match(src(f), /accessibilityIgnoresInvertColors/, f);
});
