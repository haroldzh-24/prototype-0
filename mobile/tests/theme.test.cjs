// Day / night theme: palettes, contrast, live switching, and that the plan canvas follows the theme.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const T = require('../src/ui/tokens.ts');
const theme = require('../src/ui/theme.ts');
const src = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

// WCAG 2.x relative luminance and contrast ratio.
const luminance = (hex) => {
  const v = hex.replace('#', ''), n = v.length === 3 ? v.split('').map(c => c + c).join('') : v.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const palettes = { day: T.dayPalette, night: T.nightPalette };

test('day and night palettes define the same colours, all as hex', () => {
  assert.deepEqual(Object.keys(T.nightPalette).sort(), Object.keys(T.dayPalette).sort());
  for (const [name, p] of Object.entries(palettes)) for (const [key, value] of Object.entries(p)) assert.match(value, /^#[0-9A-Fa-f]{6}$/, `${name}.${key}`);
});

test('text meets 4.5:1 on every surface it is used on, in both modes', () => {
  for (const [name, p] of Object.entries(palettes)) {
    for (const surface of ['background', 'panel', 'secondary']) for (const ink of ['text', 'muted', 'subdued', 'accent', 'danger', 'warning', 'movement']) {
      assert.ok(contrast(p[ink], p[surface]) >= 4.5, `${name}: ${ink} on ${surface} is ${contrast(p[ink], p[surface]).toFixed(2)}`);
    }
    for (const [fg, bg] of [['onPrimary', 'primary'], ['onAccent', 'accent'], ['onDanger', 'danger'], ['onCaution', 'caution'], ['text', 'selected'], ['background', 'text']]) {
      assert.ok(contrast(p[fg], p[bg]) >= 4.5, `${name}: ${fg} on ${bg} is ${contrast(p[fg], p[bg]).toFixed(2)}`);
    }
  }
});

test('plan materials stand out from the canvas (3:1 for graphics) in both modes', () => {
  for (const [name, p] of Object.entries(palettes)) {
    for (const mark of ['ink', 'wall', 'faultLine', 'handle', 'accent', 'movement', 'grid']) {
      const need = mark === 'grid' ? 1.5 : 3; // the grid is deliberately quiet
      assert.ok(contrast(p[mark], p.canvas) >= need, `${name}: ${mark} on canvas is ${contrast(p[mark], p.canvas).toFixed(2)}`);
    }
    for (const face of ['cardboard', 'steel', 'noShoot', 'noShootRed']) {
      const seen = Math.max(contrast(p[face], p.canvas), contrast(p.faceEdge, p.canvas));
      assert.ok(seen >= 3, `${name}: a ${face} face is set off from the canvas by its fill or its outline`);
    }
    assert.ok(contrast(p.port, p.wall) >= 3, `${name}: a port reads as an opening in its wall`);
    assert.ok(contrast(p.ink, p.offStage) >= 3, `${name}: the bay outline is visible against the area around it`);
    assert.ok(contrast(p.faceEdge, p.noShoot) >= 3, `${name}: a no-shoot face keeps its outline`);
  }
  assert.ok(contrast(T.dayPalette.faceEdge, T.dayPalette.canvas) >= 3, 'day: a white no-shoot is outlined on the white canvas');
});

test('the preference resolves against the system appearance and `colors` follows it live', () => {
  assert.equal(theme.resolveMode('system', 'night'), 'night');
  assert.equal(theme.resolveMode('day', 'night'), 'day');
  assert.equal(theme.resolveMode('night', 'day'), 'night');
  let calls = 0; const off = theme.onThemeChange(() => { calls++; });
  try {
    theme.setSystemMode('day'); theme.setThemePreference('system');
    const before = calls;
    theme.setThemePreference('night');
    assert.equal(theme.themeMode(), 'night'); assert.equal(T.colors.background, T.nightPalette.background); assert.equal(T.palette(), T.nightPalette);
    theme.setThemePreference('system'); theme.setSystemMode('night');
    assert.equal(theme.themeMode(), 'night', 'following a dark system');
    theme.setSystemMode('day');
    assert.equal(theme.themeMode(), 'day'); assert.equal(T.colors.text, T.dayPalette.text);
    assert.ok(calls - before >= 3, 'every change notifies subscribers');
    theme.setThemePreference('system');
    const settled = calls; theme.setThemePreference('system'); theme.setSystemMode('day');
    assert.equal(calls, settled, 'no notification when nothing changes');
  } finally { off(); }
  const after = calls; theme.setThemePreference('night'); theme.setThemePreference('system');
  assert.equal(calls, after, 'unsubscribed listeners are not called');
  assert.deepEqual(Object.keys({ ...T.colors }).sort(), Object.keys(T.dayPalette).sort(), 'colors can be spread like a plain object');
});

test('themed styles are rebuilt for the active palette and cached per palette', () => {
  let builds = 0;
  const styles = T.themed(c => { builds++; return { box: { backgroundColor: c.panel, borderColor: c.border } }; });
  theme.setThemePreference('day');
  assert.equal(styles.box.backgroundColor, T.dayPalette.panel);
  theme.setThemePreference('night');
  assert.equal(styles.box.backgroundColor, T.nightPalette.panel);
  assert.equal(styles.box.borderColor, T.nightPalette.border);
  theme.setThemePreference('day'); void styles.box; theme.setThemePreference('night'); void styles.box;
  assert.equal(builds, 2, 'one build per palette');
  assert.deepEqual(Object.keys(styles), ['box']);
  theme.setThemePreference('system');
});

test('the plan canvas, target faces and handles take their colours from the theme', () => {
  for (const file of ['editor/DraggableObject.tsx', 'editor/TargetFace.tsx', 'editor/GeometryControls.tsx', 'editor/AutoPositionOverlay.tsx', 'editor/StageViewport.tsx', 'editor/StageGrid.tsx', 'editor/RouteOverlay.tsx', 'editor/EngagementOverlay.tsx', 'editor/ManualReviewOverlay.tsx']) {
    const code = src(file).replace(/stroke="#262626"/g, ''); // the no-shoot cross is printed black on every no-shoot
    assert.doesNotMatch(code, /['"`]#[0-9A-Fa-f]{3,8}['"`]/, file + ' has no fixed colours');
  }
  const editor = ['editor/StageBuilder.tsx', 'editor/StageViewport.tsx', 'editor/DraggableObject.tsx', 'editor/StageGrid.tsx', 'editor/ObjectInspector.tsx', 'editor/WallPortsInspector.tsx', 'editor/SnapControls.tsx', 'editor/SnapGuides.tsx', 'editor/EditorSheet.tsx', 'ui/ToolIcon.tsx', 'ui/kit.tsx'];
  for (const file of editor) assert.doesNotMatch(src(file), /StyleSheet\.create\(/, file + ' uses theme-aware styles');
  assert.match(src('editor/StageGrid.tsx'), /useThemeMode\(\)/, 'the memoized grid re-renders itself on a theme switch');
  assert.match(src('editor/StageViewport.tsx'), /backgroundColor: c\.canvas/);
  assert.match(src('editor/StageViewport.tsx'), /<StageGrid[^\n]*\n[^\n]*\n\s*<View pointerEvents="none" style=\{\[styles\.bay/, 'the bay outline is drawn over the grid');
  assert.match(src('editor/DraggableObject.tsx'), /wall: \{ backgroundColor: c\.wall/);
});

test('every screen re-renders on a theme switch and the choice is saved', () => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'src', 'app')).filter(f => f.endsWith('.tsx') && f !== '_layout.tsx')) {
    const code = src('app/' + file);
    assert.ok(/useThemeMode\(\)/.test(code) || /<Screen\b/.test(code) || /<StageBuilder\b|<Redirect\b/.test(code), 'app/' + file + ' follows the theme');
  }
  const layout = src('app/_layout.tsx');
  assert.match(layout, /setThemePreference\(loadThemePreference\(\)\)/); assert.match(layout, /saveThemePreference\(themePreference\(\)\)/);
  assert.match(src('ui/themeStore.ts'), /getItemSync\(KEY\)/, 'native reads the choice synchronously, before the first render');
  assert.doesNotMatch(src('ui/themeStore.web.ts'), /expo-sqlite/, 'web does not open a second SQLite database next to the app one');
  for (const weight of ['barlow/500Medium', 'barlow/600SemiBold', 'barlow/700Bold', 'barlow-condensed/700Bold', 'barlow-condensed/800ExtraBold']) assert.match(layout, new RegExp(`'@expo-google-fonts/${weight}'`), 'only the weights in use are bundled');
  assert.doesNotMatch(layout, /from '@expo-google-fonts\/barlow(-condensed)?'/, 'the package index would bundle every weight');
  assert.match(layout, /useColorScheme\(\)/, 'follows the phone appearance when set to System');
  assert.match(src('app/account.tsx'), /setThemePreference/);
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  assert.equal(app.expo.userInterfaceStyle, 'automatic', 'iOS reports the dark appearance to the app');
});

test('the React Compiler stays off, so a theme switch reaches every component', () => {
  // The compiler caches rendered elements on props and state only. Colours come from the live palette, so with it on a
  // screen kept showing its old colours after a switch (found in the web build: the Profile screen stayed white).
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  assert.equal(app.expo.experiments.reactCompiler, false);
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const file of walk(path.join(__dirname, '..', 'src')).filter(f => /\.tsx?$/.test(f))) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /['"]use memo['"]/, file);
});
