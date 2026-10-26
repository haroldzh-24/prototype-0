// IDPA rules on hold (owner decision 2026-10-26): IDPA targets stay, no IDPA rule is applied.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const R = require('../src/rules/rulesets.ts');
const P = require('../src/stage/targetPresets.ts');

test('IDPA rules are on hold: new matches are USPSA or PCSL, IDPA maps to USPSA rules, IDPA targets stay', () => {
  assert.equal(R.IDPA_RULES_ENABLED, false);
  assert.deepEqual([...R.matchFamilies], ['USPSA', 'PCSL']);
  assert.equal(R.activeRuleset('IDPA'), 'USPSA'); assert.equal(R.activeRuleset('PCSL'), 'PCSL'); assert.equal(R.activeRuleset(undefined), undefined);
  assert.ok(R.idpaOnHold('IDPA')); assert.ok(!R.idpaOnHold('USPSA'));
  assert.ok(P.presetsForFamily('IDPA').length >= 5, 'IDPA targets are still offered in the stage builder');
  // The family picker and the drill logger offer the active families; an existing IDPA match still shows its family.
  const picker = fs.readFileSync(path.join(__dirname, '../src/ui/TargetFamilyPicker.tsx'), 'utf8');
  assert.match(picker, /matchFamilies\.includes\(value\) \? matchFamilies : \[\.\.\.matchFamilies, value\]/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/training/DrillRunEditor.tsx'), 'utf8'), /const families: TargetFamily\[\] = \[\.\.\.matchFamilies\]/);
});

test('drill logger taps: native location, or the web event offset, or nothing', () => {
  const { pressPoint } = require('../src/training/pressPoint.ts');
  assert.deepEqual(pressPoint({ locationX: 12, locationY: 30 }), { x: 12, y: 30 });
  assert.deepEqual(pressPoint({ offsetX: 40, offsetY: 55 }), { x: 40, y: 55 }, 'web mouse/pointer event');
  assert.deepEqual(pressPoint({ locationX: 0, locationY: 0, offsetX: 9, offsetY: 9 }), { x: 0, y: 0 }, 'a native 0 is a real position');
  assert.equal(pressPoint({}), null, 'no coordinates: no hit is recorded (it used to record NaN)');
});
