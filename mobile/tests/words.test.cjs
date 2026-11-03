// The word list (src/ui/words.ts): user-facing text in these folders must not use the retired words.
// Code identifiers (firingAreas, waypointId, 'waypoint' kinds, WAYPOINT_NOT_FOUND codes) are not user-facing and are skipped.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/** Folders and files whose user-facing text is checked. Add yours here when your area adopts the word list. */
const SCOPE = [
  'src/editor', 'src/planning', 'src/stage3d', 'src/stage', 'src/ui', 'src/rules',
  'src/app/match.tsx', 'src/app/planner.tsx', 'src/app/builder.tsx', 'src/app/_layout.tsx',
];
/** Strings that are never shown to the user, with the reason. */
const ALLOW = [
  { file: 'src/planning/routeAI/types.ts', declaration: 'instructions', why: 'the on-device model prompt; its field names say waypoint' },
];

const root = path.join(__dirname, '..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { RETIRED_WORDS } = require('../src/ui/words.ts');

const files = entry => {
  const full = path.join(root, entry);
  if (fs.statSync(full).isFile()) return [entry];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(d => files(path.join(entry, d.name))).filter(f => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'));
};
/** Properties whose string values are codes (discriminators, ids), not text. */
const CODE_KEYS = new Set(['type', 'kind', 'code', 'intent', 'severity', 'status', 'id', 'preset', 'key', 'mode', 'style', 'section', 'routeStyle', 'verification', 'lifecycle', 'testID', 'accessibilityRole']);
const looksLikeCode = text => /^[a-z0-9]+(?:[A-Z][a-z0-9]*)*$/.test(text) || /^[a-z0-9]+(?:[-_.][a-z0-9]+)*[-_]?$/i.test(text) && !/\s/.test(text) && /[-_.]/.test(text)
  || /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(text);

/** Every string the user could read: JSX text and string literals, minus imports, types, keys, comparisons and codes. */
function userFacingStrings(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const allow = ALLOW.filter(a => a.file === file.replace(/\\/g, '/'));
  const out = [];
  const codeContext = node => {
    let p = node.parent, child = node;
    while (p && (ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) && p.condition !== child || ts.isBinaryExpression(p) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(p.operatorToken.kind))) { child = p; p = p.parent; }
    if (!p) return false;
    if (ts.isPropertyAssignment(p)) return p.name === child || CODE_KEYS.has(p.name.getText(sf));
    const attribute = ts.isJsxAttribute(p) ? p : ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent) ? p.parent : null;
    if (attribute) return CODE_KEYS.has(attribute.name.getText(sf));
    if (ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return true;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'require') return true;
    // A list the code matches input against (['that waypoint', …].includes(text)) is parser vocabulary, not output.
    if (ts.isArrayLiteralExpression(p) && ts.isPropertyAccessExpression(p.parent) && ['includes', 'indexOf'].includes(p.parent.name.text)) return true;
    return false;
  };
  const allowed = node => allow.some(a => { for (let p = node.parent; p; p = p.parent) if (ts.isVariableDeclaration(p) && p.name.getText(sf) === a.declaration) return true; return false; });
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isLiteralTypeNode(node)) return;
    const text = ts.isJsxText(node) ? node.getText(sf).trim()
      : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.text : null;
    if (text && /[A-Za-z]/.test(text) && (ts.isJsxText(node) || !looksLikeCode(text) && !codeContext(node)) && !allowed(node))
      out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
const retired = strings => strings.flatMap(s => RETIRED_WORDS.filter(w => w.pattern.test(s.text)).map(w => `${s.file}:${s.line}: "${s.text.slice(0, 90)}" (use ${w.use})`));

test('user-facing text in the editor, planner, 3D and match screens uses the word list, not the retired words', () => {
  const scanned = SCOPE.flatMap(files);
  assert.ok(scanned.length > 50, 'the scope was found');
  const problems = scanned.flatMap(file => retired(userFacingStrings(file, fs.readFileSync(path.join(root, file), 'utf8'))));
  assert.deepEqual(problems, [], 'retired words in user-facing text:\n' + problems.join('\n'));
});

test('the scan finds retired words in text and leaves code identifiers alone', () => {
  const sample = `
    import { x } from './waypoint';
    type Mode = 'waypoint' | 'topDown';
    const a = { kind: 'waypoint', code: 'WAYPOINT_NOT_FOUND', id: 'solver-waypoint-1' };
    if (anchor.kind === 'waypoint') run();
    const accepted = ['that waypoint'].includes(input);
    const view = <Button title="Open Stage Designer" />;
    const t = <Text>WAYPOINT {n}</Text>;
    const label = 'Waypoint ' + (i + 1);
    const tip = \`Add firing areas in Route settings to check \${n}\`;
    const eye = <Button title="Eye-level view" />;
    const old = 'Cardboard 1';
  `;
  const found = retired(userFacingStrings('sample.tsx', sample)).map(p => p.split(': ')[1].split(' (use')[0]);
  assert.deepEqual(found, ['"Open Stage Designer"', '"WAYPOINT"', '"Waypoint "', '"Add firing areas in Route settings to check "', '"Add firing areas in Route settings to check "', '"Eye-level view"', '"Cardboard 1"']);
});
