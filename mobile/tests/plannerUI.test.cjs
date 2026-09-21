const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { generatePlannerCards, mapPlannerResults, copyPlannerRoute } = require('../src/planning/plannerUI.ts');
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
