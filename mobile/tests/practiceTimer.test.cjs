// Practice timer and buzz tests (haptic start signal): patterns, delays, par, the reaction and pocket experiments,
// results report and saved results.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const P = require('../src/training/practiceTimer.ts');

test('patterns: a tap is one heavy knock, a burst five within 0.2 s, par is the start pattern twice, the end is three bursts', () => {
  assert.deepEqual(P.startPattern('TAP'), [{ atMs: 0, style: 'heavy' }]);
  const burst = P.startPattern('BURST');
  assert.equal(burst.length, 5); assert.ok(burst.every(p => p.style === 'heavy')); assert.equal(burst.at(-1).atMs, 160);
  const par = P.parPattern('BURST');
  assert.equal(par.length, 10); assert.ok(par[5].atMs - par[4].atMs >= 150, 'a clear gap between the two groups');
  assert.equal(P.parPattern('TAP').length, 2);
  assert.equal(P.END_PATTERN.length, 15); assert.ok(P.END_PATTERN.every(p => p.style === 'heavy'));
  assert.deepEqual(P.ARMED_PATTERN, [{ atMs: 0, style: 'light' }]);
});

test('start delay stays within the rulebooks’ 1–4 s, whatever the random source returns', () => {
  assert.equal(P.randomDelay(() => 0), 1000);
  assert.equal(P.randomDelay(() => 0.5), 2500);
  for (const r of [0.99999, 1, 7, -3, NaN, Infinity]) { const d = P.randomDelay(() => r); assert.ok(d >= 1000 && d <= 4000 && Number.isInteger(d), String(r)); }
  assert.equal(P.randomDelay(() => 0.5, 1500, 4000), 2750);
});

test('par is a time in seconds up to 600; commas work as decimal points; anything else is no par', () => {
  assert.equal(P.parseParSeconds('2'), 2); assert.equal(P.parseParSeconds(' 2,5 '), 2.5); assert.equal(P.parseParSeconds('600'), 600);
  for (const bad of ['', '  ', '0', '-1', '601', 'abc', '1.2.3']) assert.equal(P.parseParSeconds(bad), null, bad);
});

test('timer plan: start after the delay, par after the start, done 1.5 s later; no par runs as a capped stopwatch', () => {
  assert.deepEqual(P.timerPlan(2300, 2), [{ atMs: 2300, kind: 'start' }, { atMs: 4300, kind: 'par' }, { atMs: 5800, kind: 'done' }]);
  assert.deepEqual(P.timerPlan(1000, null), [{ atMs: 1000, kind: 'start' }, { atMs: 1000 + P.STOPWATCH_CAP_MS, kind: 'done' }]);
  assert.deepEqual(P.timerPlan(1000, 0), P.timerPlan(1000, null), 'a zero par is no par');
});

test('pocket test: 4–8 buzzes, one per slot, at least 4 s apart, all inside the minute', () => {
  assert.equal(P.pocketCount(() => 0), 4); assert.equal(P.pocketCount(() => 0.9999), 8); assert.equal(P.pocketCount(() => 1), 8); assert.equal(P.pocketCount(() => NaN), 4);
  let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 200; k++) {
    const n = P.pocketCount(rng), times = P.pocketPlan(n, rng);
    assert.equal(times.length, n);
    times.forEach((t, i) => { assert.ok(t >= 0 && t <= P.POCKET_WINDOW_MS); if (i) assert.ok(t - times[i - 1] >= P.POCKET_MIN_GAP_MS, `gap ${t - times[i - 1]}`); });
  }
  for (const r of [0, 1]) { const t = P.pocketPlan(8, () => r); t.forEach((x, i) => { if (i) assert.ok(x - t[i - 1] >= P.POCKET_MIN_GAP_MS); }); }
  assert.throws(() => P.pocketPlan(20, () => 0.5), /Too many/);
});

test('a trial is early before the signal or under 100 ms, missed after 1.5 s, otherwise a reaction in whole ms', () => {
  assert.deepEqual(P.judgeTrial(null, 5000), { outcome: 'EARLY', reactionMs: null });
  assert.deepEqual(P.judgeTrial(1000, null), { outcome: 'MISSED', reactionMs: null });
  assert.deepEqual(P.judgeTrial(1000, 1099.9), { outcome: 'EARLY', reactionMs: null });
  assert.deepEqual(P.judgeTrial(1000, 1100), { outcome: 'REACTED', reactionMs: 100 });
  assert.deepEqual(P.judgeTrial(1000, 1251.6), { outcome: 'REACTED', reactionMs: 252 });
  assert.deepEqual(P.judgeTrial(1000, 2500), { outcome: 'REACTED', reactionMs: 1500 });
  assert.deepEqual(P.judgeTrial(1000, 2501), { outcome: 'MISSED', reactionMs: null });
});

test('the tap time uses the touch event’s own clock only when it is plausibly the same clock', () => {
  assert.equal(P.tapTime(9990, 10000), 9990);
  assert.equal(P.tapTime(10010, 10000), 10000, 'from the future: other clock');
  assert.equal(P.tapTime(1, 10000), 10000, 'far in the past: other clock');
  assert.equal(P.tapTime(undefined, 10000), 10000); assert.equal(P.tapTime(NaN, 10000), 10000);
});

const trial = (cue, strength, outcome, ms = null) => ({ cue, strength, outcome, reactionMs: outcome === 'REACTED' ? ms : null, at: '2026-10-27T20:00:00.000Z' });

test('a block ends after 10 reacted-or-missed trials; early taps are redone, up to 20 attempts', () => {
  const ten = Array.from({ length: 9 }, () => trial('BUZZ', 'BURST', 'REACTED', 250));
  assert.equal(P.blockDone(ten), false);
  assert.equal(P.blockDone([...ten, trial('BUZZ', 'BURST', 'EARLY')]), false, 'an early tap does not count');
  assert.equal(P.blockDone([...ten, trial('BUZZ', 'BURST', 'MISSED')]), true, 'a miss counts');
  assert.equal(P.blockDone(Array.from({ length: 20 }, () => trial('BUZZ', 'TAP', 'EARLY'))), true);
});

test('reaction results are grouped by signal and buzz strength, with median, mean, sample SD and counts', () => {
  const trials = [...[200, 240, 260, 300].map(ms => trial('BUZZ', 'BURST', 'REACTED', ms)), trial('BUZZ', 'BURST', 'EARLY'), trial('BUZZ', 'BURST', 'MISSED'),
    trial('SCREEN', 'TAP', 'REACTED', 280), trial('SCREEN', 'BURST', 'REACTED', 300), trial('BOTH', 'TAP', 'REACTED', 210)];
  const stats = P.reactionStats(trials);
  assert.deepEqual(stats.map(s => P.groupLabel(s)), ['Buzz only (burst)', 'Buzz + screen (tap)', 'Screen only']);
  const b = stats[0];
  assert.equal(b.reacted, 4); assert.equal(b.early, 1); assert.equal(b.missed, 1);
  assert.equal(b.medianMs, 250); assert.equal(b.meanMs, 250); assert.equal(b.fastestMs, 200); assert.equal(b.slowestMs, 300);
  assert.ok(Math.abs(b.sdMs - Math.sqrt((50 ** 2 + 10 ** 2 + 10 ** 2 + 50 ** 2) / 3)) < 1e-9);
  assert.equal(stats[2].reacted, 2, 'screen-only ignores the buzz strength'); assert.equal(stats[2].sdMs, Math.sqrt(200));
  assert.equal(stats[1].sdMs, null, 'one reaction has no spread');
  assert.match(P.statsLine(b), /^Buzz only \(burst\): median 250 ms, mean 250 ± 42 ms, fastest 200 ms · 4 reacted, 1 early, 1 missed$/);
  assert.match(P.statsLine(P.reactionStats([trial('BUZZ', 'TAP', 'MISSED')])[0]), /no reactions yet \(0 early, 1 missed\)/);
});

test('pocket results add up per place and strength; a count above what was sent is capped', () => {
  const p = P.pocketStats([{ strength: 'BURST', place: 'FRONT_POCKET', sent: 6, felt: 6, at: '' }, { strength: 'BURST', place: 'FRONT_POCKET', sent: 5, felt: 4, at: '' },
    { strength: 'TAP', place: 'FRONT_POCKET', sent: 7, felt: 9, at: '' }]);
  assert.deepEqual(p, [{ strength: 'BURST', place: 'FRONT_POCKET', tests: 2, sent: 11, felt: 10 }, { strength: 'TAP', place: 'FRONT_POCKET', tests: 1, sent: 7, felt: 7 }]);
  assert.equal(P.pocketLine(p[0]), 'Front pocket, burst: felt 10 of 11 (91%) over 2 tests');
});

test('the shared report carries only measured numbers, with the phone model and OS', () => {
  const text = P.resultsReport([trial('BUZZ', 'BURST', 'REACTED', 240), trial('SCREEN', 'BURST', 'REACTED', 260)],
    [{ strength: 'TAP', place: 'BACK_POCKET', sent: 5, felt: 2, at: '' }], { model: 'iPhone 15 Pro', os: 'iOS 26.0' }, new Date('2026-10-27T20:00:00Z'));
  assert.match(text, /^PSP buzz test · 2026-10-27 · iPhone 15 Pro · iOS 26\.0/);
  assert.match(text, /- Buzz only \(burst\): median 240 ms/); assert.match(text, /- Screen only: median 260 ms/);
  assert.match(text, /- Back pocket, tap: felt 2 of 5 \(40%\) over 1 test/);
  assert.match(P.resultsReport([], [], { model: null, os: null }), /No results yet/);
});

test('saved results: junk, other versions and malformed entries are dropped, the rest kept and capped', () => {
  assert.deepEqual(P.parseResults(null), { version: 1, reaction: [], pocket: [] });
  assert.deepEqual(P.parseResults('{oops'), { version: 1, reaction: [], pocket: [] });
  assert.deepEqual(P.parseResults(JSON.stringify({ version: 2, reaction: [trial('BUZZ', 'TAP', 'REACTED', 200)] })).reaction, []);
  const good = trial('BUZZ', 'TAP', 'REACTED', 200);
  const parsed = P.parseResults(JSON.stringify({ version: 1, reaction: [good, { ...good, cue: 'SMELL' }, { ...good, reactionMs: null }, { ...good, outcome: 'EARLY' }, null, trial('BOTH', 'BURST', 'MISSED')],
    pocket: [{ strength: 'BURST', place: 'JACKET', sent: 5, felt: 3, at: '' }, { strength: 'BURST', place: 'JACKET', sent: 0, felt: 0, at: '' }, { strength: 'BURST', place: 'HAT', sent: 5, felt: 1, at: '' }] }));
  assert.equal(parsed.reaction.length, 2); assert.equal(parsed.pocket.length, 1);
  const many = { version: 1, reaction: Array.from({ length: P.RESULTS_CAP + 5 }, () => good), pocket: [] };
  assert.equal(JSON.parse(P.serializeResults(many)).reaction.length, P.RESULTS_CAP);
  assert.equal(P.parseResults(JSON.stringify(many)).reaction.length, P.RESULTS_CAP);
});
