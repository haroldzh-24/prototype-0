const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { generatePlannerCards, mapPlannerResults, copyPlannerRoute } = require('../src/planning/plannerUI.ts');
const { plannerPreviewRoute, plannerDetails, plannerSearchWarning, rulesets, rulesetMetadata } = require('../src/planning/plannerUI.ts');
const P = require('../src/planning/planner.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan, isEngageable } = require('../src/planning/model.ts');
const { createRoute, isStageRoute } = require('../src/planning/route.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
function fixture() {
  const stage = createDefaultStage(), plan = createPlan();
  const ids = stage.objects.filter(isEngageable).map(t => t.id);
  plan.engagements = Object.fromEntries(ids.map(id => [id, 2]));
  plan.loadout = { chamberLoaded: false, startingMagazineId: 'a', magazines: [
    { id: 'a', capacity: 20, startingRounds: 1 }, { id: 'b', capacity: 20, startingRounds: 20 },
  ] };
  plan.route = createRoute('manual');
  plan.route.positions = [{ id: 'p', label: 'P1', position: { space: 'stage', x: 100, y: 100, z: 0 }, visibleTargetIds: ids, engagedTargetIds: [] }];
  return { stage, plan, profile: createLocalProfile().performance };
}
test('generated result cards map authoritative metrics, cap at three and report fallback without altering inputs', () => {
  const context = fixture(), before = JSON.stringify(context);
  const config = { ...P.createRoutePlannerConfig(), style: 'PERSONALIZED' };
  const generated = P.generateCandidates(context, config);
  const ranked = P.rankCandidates(generated.candidates.map(c => P.evaluateCandidate(context, c)), config, { maxResults: 3 });
  const { cards } = generatePlannerCards(context, config);
  assert.ok(cards.length > 0 && cards.length <= 3);
  cards.forEach((card, i) => {
    const m = ranked.candidates[i].metrics;
    assert.deepEqual([card.estimatedTime, card.movementDistance, card.positions, card.reloads, card.roundsRemaining],
      [m.estimatedTotalTime, m.movementDistance, m.positionsUsed, m.reloadCount, m.roundsRemaining]);
    assert.equal(card.routeStyle, 'BALANCED'); assert.equal(card.personalizedFallback, true);
  });
  assert.equal(mapPlannerResults({ ...ranked, candidates: Array(5).fill(ranked.candidates[0]) }).length, 3);
  assert.equal(generatePlannerCards({ ...context, profile: null }, config).cards[0].estimatedTime, null);
  assert.equal(JSON.stringify(context), before);
});
test('USE THIS ROUTE copies a generated route into independent editable manual data', () => {
  const context = fixture();
  const card = generatePlannerCards(context, P.createRoutePlannerConfig()).cards[0];
  const before = JSON.stringify(card.route);
  const next = copyPlannerRoute(context.plan, card.route, true);
  assert.ok(isStageRoute(next.route)); assert.deepEqual(next.route, card.route);
  assert.equal(next.loadout, context.plan.loadout); assert.equal(next.engagements, context.plan.engagements);
  assert.ok(next.route.reloads.length > 0);
  next.route.positions[0].position.x++;
  next.route.positions[0].visibleTargetIds.length = 0;
  next.route.positions[0].engagedTargetIds.length = 0;
  next.route.reloads[0].magazineId = 'changed';
  assert.equal(JSON.stringify(card.route), before);
});
test('existing route requires explicit overwrite confirmation, including an empty manual route', () => {
  const { plan } = fixture(), route = createRoute('candidate'), before = JSON.stringify(plan);
  assert.equal(copyPlannerRoute(plan, route), null);
  assert.equal(copyPlannerRoute(plan, route, false), null);
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(copyPlannerRoute(plan, route, true).route, route);
  assert.equal(copyPlannerRoute({ ...plan, route: createRoute('empty') }, route), null);
  assert.deepEqual(copyPlannerRoute({ ...plan, route: undefined }, route).route, route);
});

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
test('preview, return and switching candidates preserve the frozen original manual route', () => {
  const context = fixture();
  const cards = generatePlannerCards(context, P.createRoutePlannerConfig()).cards;
  const a = cards[0], b = { ...a, id: 'other', route: { ...a.route, positions: [...a.route.positions].reverse(), reloads: [] } };
  const before = JSON.stringify(context.plan);
  freeze(context.plan); freeze(a); freeze(b);
  for (const card of [a, null, b, null, a]) {
    assert.equal(plannerPreviewRoute(context.plan, card), card ? card.route : context.plan.route);
    assert.equal(JSON.stringify(context.plan), before);
  }
});
test('preview then explicit use preserves assignments, order and reloads in an editable copy', () => {
  const context = fixture(), card = generatePlannerCards(context, { ...P.createRoutePlannerConfig(), style: 'PERSONALIZED' }).cards[0];
  const original = JSON.stringify(context.plan);
  const preview = plannerPreviewRoute(context.plan, freeze(card));
  assert.equal(copyPlannerRoute(context.plan, preview), null);
  const applied = copyPlannerRoute(context.plan, preview, true);
  assert.deepEqual(applied.route, card.route);
  assert.notEqual(applied.route.positions[0], card.route.positions[0]);
  applied.route.positions[0].engagedTargetIds.push('editable');
  assert.equal(JSON.stringify(context.plan), original);
  assert.equal(card.personalizedFallback, true);
});
test('WHY THIS ROUTE uses only ranking messages and supports absent metadata', () => {
  const context = fixture(), config = P.createRoutePlannerConfig();
  const generated = P.generateCandidates(context, config);
  const result = P.rankCandidates(generated.candidates.map(c => P.evaluateCandidate(context, c)), config);
  assert.deepEqual(mapPlannerResults(result)[0].reasons, result.candidates[0].reasons.map(r => r.message));
  const candidate = result.candidates[0];
  assert.deepEqual(mapPlannerResults({ ...result, candidates: [{ ...candidate, reasons: [] }] })[0].reasons, []);
  assert.deepEqual(mapPlannerResults({ ...result, candidates: [{ ...candidate, reasons: [{ code: 'NEW_REASON', message: 'Backend wording', contribution: 2 }] }] })[0].reasons, ['Backend wording']);
});
test('advanced metrics format backend values with units and preserve unavailable timing', () => {
  const context = fixture(), config = P.createRoutePlannerConfig();
  const c = P.generateCandidates(context, config).candidates[0];
  const m = P.evaluateCandidate(context, c).metrics;
  const rows = Object.fromEntries(plannerDetails({ ...m, backwardDistance: 30, backwardSegmentCount: 2, rawReloadDuration: 2, reloadOverlap: 1.5, reloadTime: 0.5 }).map(r => [r.label, r.value]));
  assert.equal(rows['Backward movement (estimate)'], '2.5 ft / 2 segments');
  assert.equal(rows['Reload overlap with movement'], '1.50 s');
  assert.equal(rows['Additional reload time'], '0.50 s');
  assert.equal(rows['Total shooting difficulty'], m.totalShootingDifficulty.toFixed(1));
  assert.equal(rows['Average shooting difficulty'], m.averageShootingDifficulty.toFixed(1));
  assert.equal(rows['Maximum target difficulty'], m.maximumSingleTargetDifficulty.toFixed(1));
  assert.equal(rows['Minimum ammo margin'], `${m.ammoMargin} rounds`);
  const missing = plannerDetails(P.evaluateCandidate({ ...context, profile: null }, c).metrics);
  assert.equal(missing.find(r => r.label === 'Reload overlap with movement').value, 'Unavailable');
});
test('limited-search warning propagates only the generator warning, including empty results', () => {
  const context = fixture(), config = P.createRoutePlannerConfig();
  const limited = P.generateCandidates(context, config, { maxEvaluations: 1 });
  assert.equal(limited.search.truncated, true);
  assert.equal(plannerSearchWarning(limited.warnings), limited.warnings.find(w => w.code === 'SEARCH_LIMIT'));
  assert.equal(plannerSearchWarning([]), null);
  assert.equal(plannerSearchWarning([{ code: 'NO_VALID_ROUTE', message: 'No route' }]), null);
  assert.equal(generatePlannerCards(context, config).searchWarning, null);
});
test('ruleset choices retain typed identity and explicitly declare shared neutral constraints', () => {
  assert.deepEqual(rulesets, ['USPSA', 'IDPA', 'PCSL', 'CUSTOM']);
  const context = fixture(), before = JSON.stringify(context);
  for (const choice of [...rulesets, 'IDPA', 'CUSTOM']) {
    const state = rulesetMetadata(choice);
    assert.equal(state.choice, choice);
    assert.deepEqual(state.constraints, {});
    assert.match(state.description, /not modeled/);
    assert.match(state.description, /behave identically/);
  }
  assert.equal(rulesetMetadata('CUSTOM').label, 'Custom / Vanilla');
  assert.equal(JSON.stringify(context), before);
});
