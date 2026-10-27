// A drill run's video times itself (roadmap T2, src/training/videoTiming.ts): the beep and the drill's shots from the audio, saved with the run.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const D = require('../src/training/audioDetection.ts');
const T = require('../src/training/videoTiming.ts');
const L = require('../src/training/drillLibrary.ts');
const Days = require('../src/training/drillDays.ts');
const { Repository } = require('../src/storage/repository.ts');

const sound = (type, ms, peak = 0.8, durationMs = 100) => ({ type, timestampMs: ms, confidence: 'HIGH', metadata: { durationMs, peak, rise: 10, toneRatio: 0.1, toneHz: 2300 } });
const audio = candidates => ({ candidates, warnings: ['Audio cannot identify the shooter. Review nearby shooters, echoes and impacts before confirming.', 'Multiple possible stimuli: choose the correct beep for this drill.'] });
const bill = L.libraryDrill('bill');

test('the beep starts the run; the drill’s shots are the loudest sounds after it; quieter ones are listed, not used', () => {
  const shots = [2420, 2680, 2930, 3170, 3420, 3660];
  const r = T.timeDrillFromAudio(audio([sound('STIMULUS', 1000, 0.4, 200), ...shots.map(ms => sound('SHOT', ms)), sound('SHOT', 2560, 0.2), sound('SHOT', 4500, 0.15)]), bill);
  assert.equal(r.problem, null); assert.equal(r.runs.length, 1);
  const run = r.runs[0];
  assert.deepEqual(run.shotTimes, [1.42, 1.68, 1.93, 2.17, 2.42, 2.66]); assert.equal(run.complete, true);
  assert.deepEqual(run.ignoredMs, [2560, 4500]);
  assert.deepEqual(T.timingNotes(run, bill), ['2 other sounds were ignored (quieter, or more than the drill\'s shots). Play the video to check.']);
  assert.deepEqual(r.warnings, ['Audio cannot identify the shooter. Review nearby shooters, echoes and impacts before confirming.'], 'the beep question is answered here');
  // Saved as a run, the proposal passes the run's own checks.
  assert.equal(L.libraryRunProblem({ id: 'x', drillId: 'bill', recordedAt: '2026-10-26T12:00:00Z', choices: { distance: '7' }, shotTimes: run.shotTimes, totalTime: 2.66, family: 'USPSA', notes: '' }), null);
});

test('more loud sounds than shots keeps the drill’s count; too few says how many; no beep or no shots says to type the times', () => {
  const loud = [1500, 1700, 1900, 2100, 2300, 2500, 2700].map((ms, i) => sound('SHOT', ms, i === 6 ? 0.5 : 0.8));
  const r = T.timeDrillFromAudio(audio([sound('STIMULUS', 1000), ...loud]), bill).runs[0];
  assert.equal(r.shotMs.length, 6); assert.deepEqual(r.ignoredMs, [2700], 'the quietest of the loud ones');
  const few = T.timeDrillFromAudio(audio([sound('STIMULUS', 1000), sound('SHOT', 1500), sound('SHOT', 1750)]), bill).runs[0];
  assert.equal(few.complete, false); assert.match(T.timingNotes(few, bill)[0], /^Found 2 of the 6 shots Bill Drill has/);
  assert.match(T.timeDrillFromAudio(audio([sound('SHOT', 1500)]), bill).problem, /^No timer beep found/);
  assert.match(T.timeDrillFromAudio(audio([sound('STIMULUS', 1000)]), bill).problem, /^The beep was found but no shots after it/);
});

test('several beeps in one video are several runs; steel keeps makeups', () => {
  const two = T.timeDrillFromAudio(audio([sound('STIMULUS', 1000), ...[2000, 2250, 2500, 2750, 3000, 3250].map(ms => sound('SHOT', ms)),
    sound('STIMULUS', 9000), ...[10100, 10330, 10560, 10790, 11020, 11250].map(ms => sound('SHOT', ms))]), bill);
  assert.equal(two.runs.length, 2); assert.equal(two.runs[1].shotTimes[0], 1.1); assert.ok(two.runs.every(r => r.complete));
  const steel = L.libraryDrill('steel');
  const s = T.timeDrillFromAudio(audio([sound('STIMULUS', 500), ...[1800, 2300, 2800, 3200, 3700, 4100].map(ms => sound('SHOT', ms))]), steel).runs[0];
  assert.equal(s.shotMs.length, 6); assert.equal(s.complete, true); assert.deepEqual(T.timingNotes(s, steel), ['1 extra shot counted as makeups.']);
});

test('end to end on synthetic sound: a 2.3 kHz beep and six shots come back as the timer would list them', async () => {
  const a = { samples: new Float32Array(6000 * 16), sampleRate: 16000, durationMs: 6000, offsetMs: 0, warnings: [] };
  for (let i = 1000 * 16; i < 1200 * 16; i++) a.samples[i] = 0.4 * Math.sin(2 * Math.PI * 2300 * i / 16000);
  const shots = [2420, 2680, 2930, 3170, 3420, 3660];
  for (const ms of shots) a.samples[ms * 16] = 0.9;
  a.samples[4800 * 16] = 0.2; // a quieter sound later (another bay)
  const run = await D.detectAudio(a, undefined, '2026-10-26T12:00:00.000Z');
  const r = T.timeDrillFromAudio(run, bill).runs[0];
  assert.equal(r.shotTimes.length, 6);
  r.shotTimes.forEach((t, i) => assert.ok(Math.abs(t - (shots[i] - 1000) / 1000) <= 0.01, `shot ${i + 1}: ${t}`));
});

test('the run’s video is saved in the same record, its marks follow the saved times, and removing the run removes it', async () => {
  const day = Days.newDrillDay('d1', '2026-10-26', 'LIVE_FIRE', '2026-10-26T15:00:00.000Z');
  const run = { id: 'r1', drillId: 'bill', recordedAt: '2026-10-26T15:00:00.000Z', choices: { distance: '7' }, shotTimes: [1.42, 1.68, 1.93, 2.17, 2.42, 2.66], totalTime: 2.66, family: 'USPSA', notes: '', zones: { A: 6 } };
  const video = { id: 'v1', asset: { uri: 'training-videos/v1.mov', name: 'IMG_1.MOV', storage: 'DOCUMENTS' }, durationMs: 3500, timing: { beepMs: 1000 } };
  const saved = Days.addRun(day, run, video, '2026-10-26T15:01:00.000Z');
  assert.equal(saved.libraryRuns[0].videoId, 'v1');
  const clip = saved.videos[0];
  assert.deepEqual([clip.session.trainingSessionId, clip.session.drillId, clip.session.context], ['d1', null, 'LIVE_FIRE']);
  const marks = clip.analysis.events.map(e => [e.type, Math.round(e.timestampMs)]);
  assert.deepEqual(marks, [['STIMULUS', 1000], ['SHOT', 2420], ['SHOT', 2680], ['SHOT', 2930], ['SHOT', 3170], ['SHOT', 3420], ['SHOT', 3660]].filter(([, ms]) => ms <= 3500), 'marks past the end are left out');
  assert.ok(Days.runVideoIds(saved).has('v1'));
  // The repository accepts it, and the profile gets the run's measurements once (the video adds none of its own).
  const db = new DatabaseSync(':memory:');
  const repo = new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...a) => db.prepare(sql).run(...a),
    getAllAsync: async (sql, ...a) => db.prepare(sql).all(...a), getFirstAsync: async (sql, ...a) => db.prepare(sql).get(...a) ?? null }, randomUUID);
  await repo.initialize(); await repo.saveTraining(saved);
  const [loaded] = await repo.listTraining('local');
  assert.equal(loaded.videos.length, 1); assert.equal(loaded.libraryRuns[0].videoId, 'v1');
  const profile = await repo.loadProfile();
  const draws = (profile.performanceObservations ?? []).filter(o => o.factor === 'drawTime');
  assert.equal(draws.length, 1); assert.equal(draws[0].source, 'STRUCTURED_TRAINING');
  const { record, discard } = Days.removeRun(loaded, 'r1');
  assert.deepEqual([record.libraryRuns.length, record.videos.length, discard.map(a => a.uri)], [0, 0, ['training-videos/v1.mov']]);
  assert.equal(L.libraryRunProblem({ ...run, videoId: '../x' }), 'Invalid video link.');
  // No beep found: the video is kept with the run but has no marks.
  assert.deepEqual(Days.addRun(day, run, { ...video, timing: null }).videos[0].analysis.events, []);
});

test('a shot’s loudness is measured over its first 40 ms, so a soft onset (a compressed recording) does not hide it', async () => {
  const a = { samples: new Float32Array(6000 * 16), sampleRate: 16000, durationMs: 6000, offsetMs: 0, warnings: [] };
  for (let i = 1000 * 16; i < 1200 * 16; i++) a.samples[i] = 0.4 * Math.sin(2 * Math.PI * 2300 * i / 16000);
  const shots = [2420, 2680, 2930, 3170, 3420, 3660];
  let seed = 1; const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  shots.forEach((ms, n) => {
    // Two shots start softly: a small lead-in 5 ms before the full sound, as a compressed recording smears it.
    if (n === 2 || n === 3) for (let k = 0; k < 5 * 16; k++) a.samples[(ms - 5) * 16 + k] = noise() * 0.12;
    for (let k = 0; k < 20 * 16; k++) a.samples[ms * 16 + k] = noise() * 0.9 * Math.exp(-k / 16);
  });
  assert.equal(T.timeDrillFromAudio(await D.detectAudio(a), bill).runs[0].shotMs.length, 4, 'judged by the onset frame alone, the two soft starts look quiet');
  const r = await T.timeDrillFromSound(a, bill);
  assert.equal(r.runs[0].shotMs.length, 6, JSON.stringify(r.runs[0]));
  r.runs[0].shotTimes.forEach((t, i) => assert.ok(Math.abs(t - (shots[i] - 1000) / 1000) <= 0.012, `shot ${i + 1}: ${t}`));
  assert.ok(r.warnings.includes('Sound can’t tell whose shot it is: check the times against the video.'));
});
