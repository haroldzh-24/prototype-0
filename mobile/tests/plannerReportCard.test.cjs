// The planner report card: AUTO-PLAN (Route Planner V2) on the Area 4 2026 sample stages (src/samples/area4.ts).
// Every plan must be legal, deterministic and within its budget; coverage may not fall below today's counts.
// Today's uncovered targets are listed in docs/planner-report-card.md with why (mostly the sample files' walls).
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
const { AREA4_2026, buildSample } = require('../src/samples/area4.ts');
const { gradeStage, cardLine } = require('../src/samples/reportCard.ts');
const { savedDocumentProblem } = require('../src/storage/repository.ts');
const { isStageRoute } = require('../src/planning/route.ts');

// Targets covered per stage on 2026-11-09 (planner 2.1.0). Raise these when coverage improves; never lower them silently.
const BASELINE = { 2: 14, 3: 13, 4: 17, 7: 18, 8: 11, 9: 13, 10: 15, 11: 10, 12: 4 };

test('sample stages are valid stage files with shooting areas, a start and the briefing\'s steel', () => {
  for (const spec of AREA4_2026) {
    const s = buildSample(spec);
    assert.equal(savedDocumentProblem(s.document), null, spec.id);
    assert.ok(isStageRoute(s.plan.route), spec.id + ' route');
    assert.ok(s.firingAreas.length >= 1 && s.document.objects.some(o => o.type === 'start'), spec.id);
    const steel = s.document.objects.filter(o => o.type === 'steelPopper').length;
    assert.ok(steel <= spec.briefing.miniPoppers + spec.briefing.poppers, spec.id + ' steel');
    assert.equal(s.document.objects.filter(o => o.type === 'cardboardTarget').length + (spec.hidden ?? 0) >= spec.briefing.paper - 0, true);
    // Everything stands on the stage.
    for (const o of s.document.objects) assert.ok(o.position.x >= 0 && o.position.y >= 0 && o.position.x <= s.document.stage.width && o.position.y <= s.document.stage.depth, `${spec.id} ${o.id}`);
  }
});

test('AUTO-PLAN on every sample stage: legal, deterministic, within budget, and no worse than the baseline', () => {
  const cards = AREA4_2026.map(spec => gradeStage(spec));
  for (const c of cards) {
    const line = cardLine(c);
    assert.notEqual(c.status, 'invalid-input', line);
    assert.ok(c.legal.insideAreas, line); assert.ok(c.legal.steelDistance, line); assert.ok(c.legal.analyzeAgrees, line + ' ' + c.legal.notes.join(' '));
    assert.ok(c.deterministic, line);
    assert.notEqual(c.stoppedBy, 'time', line);
    assert.ok(c.covered >= BASELINE[c.stage], `${line} (baseline ${BASELINE[c.stage]})`);
    assert.ok(c.uncovered.every(u => u.reasons.length > 0), line + ' gives a reason for every uncovered target');
    assert.ok(c.rounds.planned <= c.rounds.briefing, line + ' plans no more rounds than the briefing');
  }
});
