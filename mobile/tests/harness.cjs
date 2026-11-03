// The component harness from ui-reorganization.test.cjs, shared so new test files need not grow that file.
// Executes real component callbacks with lightweight host components; device layout and gestures need phone review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness(entry, props = {}, overrides = {}, exportName) {
  const slots = [], cache = new Map(); let cursor = 0, changed = false, tree, guard;
  const effects = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; changed = true; } }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
      slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useMemo(fn) { cursor++; return fn(); }, useCallback(fn, deps) { const i=cursor++, old=slots[i]; if(!old || deps.some((v,j)=>!Object.is(v,old.deps[j]))) slots[i]={deps,fn}; return slots[i].fn; },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const repo = { trainingReadWarnings: [], loadProfile: async () => ({ performance: null }), saveStage: async (...args) => saved.push(args), ...overrides.repo };
  const saved = [], pushes = [];
  const defaultExport = value => ({ __esModule: true, default: value });
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} }; cache.set(file, module.exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const requireLocal = id => {
      if (id in overrides) return overrides[id];
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', Modal: 'Modal', ScrollView: 'ScrollView', Platform: { OS: 'ios' }, StyleSheet: { create: s => s, hairlineWidth: 1 }, AppState: { addEventListener: () => ({ remove() {} }) }, BackHandler: { addEventListener: () => ({ remove() {} }) } };
      if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (id === 'expo-router') return { router: { push: v => pushes.push(v), dismissTo: v => pushes.push(v) }, useNavigation: () => navigation, useFocusEffect: fn => react.useEffect(fn, [fn]), useLocalSearchParams: () => ({ id: 'match' }) };
      if (id === 'expo-router/react-navigation') return { usePreventRemove: (enabled, callback) => { guard = { enabled, callback }; } };
      if (id === 'expo-modules-core') return { requireOptionalNativeModule: () => null, uuid: { v4: () => 'new-' + (++serial) } };
      if (id.endsWith('StorageProvider')) return { useRepository: () => repo };
      if (id.endsWith('ui/kit') || id === './kit') return { Input: load(path.resolve(__dirname, '../src/ui/kit.tsx')).Input, DeleteConfirmation: load(path.resolve(__dirname, '../src/ui/kit.tsx')).DeleteConfirmation, ErrorState: 'ErrorState', ScreenHeader: 'ScreenHeader', MenuRow: 'MenuRow', StatusBadge: 'StatusBadge', Action: 'Action', Copy: 'Copy', Panel: 'Panel', Screen: 'Screen', DataRow: 'DataRow', Stat: 'Stat', Segmented: 'Segmented', EmptyState: 'EmptyState', Loading: 'Loading', Notice: 'Notice', Section: 'Section', ui: {}, colors: {} };
      let target = id.startsWith('@/') ? path.resolve(__dirname, '../src', id.slice(2)) : path.resolve(path.dirname(file), id);
      if (fs.existsSync(target + '.tsx')) return defaultExport(path.basename(target));
      if (fs.existsSync(target + '.ts')) return load(target + '.ts');
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(requireLocal, module, module.exports);
    cache.set(file, module.exports); return module.exports;
  }
  let serial = 0; const navigation = { dispatch() {} };
  const exports = load(path.resolve(__dirname, '../src', entry));
  const component = exportName ? exports[exportName] : exports.default ?? exports.VideoAnalysisEditor;
  function render() { for (let pass = 0; pass < 15; pass++) { cursor = 0; changed = false; tree = component(props); if (tree && typeof tree.type === 'function' && tree.type.name === 'MatchStages') tree = tree.type(tree.props); effects.splice(0).forEach(fn => fn()); if (!changed) break; } return tree; }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(n => nodes(n));
    if (typeof node.type === 'function' && ['Input', 'DeleteConfirmation'].includes(node.type.name)) return nodes(node.type(node.props));
    if (node.props?.visible === false || node.props?.style?.some?.(s => s?.display === 'none')) return [];
    return [node, ...nodes(node.props?.header), ...nodes(node.props?.action), ...nodes(node.props?.children)];
  }
  const find = predicate => { const result = nodes(tree).find(predicate); assert.ok(result, 'Missing UI node'); return result; };
  render();
  return { render, nodes: () => nodes(tree), find, saved, pushes, repo, get guard() { return guard; },
    press(title) { const node = find(n => typeof n.props.onPress === 'function' && (n.props.title === title || n.props.accessibilityLabel === title || n.props.label === title)); assert.ok(!node.props.disabled, title + ' is disabled'); node.props.onPress(); render(); },
    child(name) { return find(n => n.type === name).props; },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
  };
}
module.exports = { harness };
