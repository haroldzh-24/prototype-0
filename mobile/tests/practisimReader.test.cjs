// READ 3D DRAWING: ground straightening, the drawing reader, briefing/labels, PNG and the import draft.
// A synthetic Practisim-like render with a known camera stands in for match book pages (which are not in the repo).
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), zlib = require('node:zlib'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
const g = require('../src/diagramImport/groundPlane.ts'), rd = require('../src/diagramImport/practisimReader.ts');
const br = require('../src/diagramImport/briefing.ts'), png = require('../src/diagramImport/png.ts'), t3 = require('../src/diagramImport/threeD.ts');
const { validateReconstruction, reconstruct, validProposal } = require('../src/diagramImport/model.ts');

const { W, H, CAM, TARGETS, AREA, WALLS, render } = require('./fixtures/practisimScene.cjs');
const scene = render();

test('straightening recovers the floor grid: cells are square and true distances come back', () => {
  const { result, reason } = g.straightenGround(scene);
  assert.ok(result, reason);
  assert.ok(result.evidence.fit > 0.5, 'fit ' + result.evidence.fit);
  const to = p => g.apply(result.toGround, g.apply(CAM, p));
  // Distances between known ground points (the lattice may sit at any whole-cell offset, so compare differences).
  const a = to({ x: 5, y: 5 }), b = to({ x: 25, y: 5 }), c = to({ x: 5, y: 22 });
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 20) < 0.4, 'across ' + Math.hypot(b.x - a.x, b.y - a.y));
  assert.ok(Math.abs(Math.hypot(c.x - a.x, c.y - a.y) - 17) < 0.4, 'deep ' + Math.hypot(c.x - a.x, c.y - a.y));
  assert.ok(b.x > a.x && c.y > a.y, 'x runs right and y toward the camera');
  // Grid crossings land on whole numbers.
  for (const p of [{ x: 3, y: 4 }, { x: 18, y: 20 }]) { const q = to(p); assert.ok(Math.abs(q.x - Math.round(q.x)) < 0.12 && Math.abs(q.y - Math.round(q.y)) < 0.12, JSON.stringify(q)); }
});

test('a picture with no grid is refused with a reason instead of a guess', () => {
  const flat = { width: 300, height: 200, rgba: new Uint8ClampedArray(300 * 200 * 4).map((_, i) => i % 4 === 1 ? 230 : i % 4 === 3 ? 255 : 40) };
  const { result, reason } = g.straightenGround(flat);
  assert.equal(result, null); assert.match(reason, /grid/i);
});

test('the reader finds the shooting area, the targets where they stand and the walls along the floor', () => {
  const { result } = g.straightenGround(scene), reading = rd.readDrawing(scene, result);
  const shift = (() => { const p = g.apply(result.toGround, g.apply(CAM, { x: 0, y: 0 })); return { x: p.x, y: p.y }; })();
  const truth = p => ({ x: p.x + shift.x, y: p.y + shift.y });
  const area = reading.objects.find(o => o.kind === 'shootingArea');
  assert.ok(area, 'shooting area found');
  for (const corner of AREA.map(truth)) assert.ok(area.outline.some(p => Math.hypot(p.x - corner.x, p.y - corner.y) < 0.6), 'corner ' + JSON.stringify(corner));
  const targets = reading.objects.filter(o => o.kind === 'target');
  for (const t of TARGETS.map(truth)) assert.ok(targets.some(o => Math.hypot(o.at.x - t.x, o.at.y - t.y) < 0.6), 'target near ' + JSON.stringify(t) + ' in ' + JSON.stringify(targets.map(o => o.at)));
  assert.ok(targets.length <= TARGETS.length + 1, 'few false targets: ' + targets.length);
  const walls = reading.objects.filter(o => o.kind === 'wall');
  for (const [p, q] of WALLS.map(([p, q]) => [truth(p), truth(q)])) {
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    assert.ok(walls.some(w => { const m = { x: (w.from.x + w.to.x) / 2, y: (w.from.y + w.to.y) / 2 }; return Math.hypot(m.x - mid.x, m.y - mid.y) < 1.2; }), 'wall near ' + JSON.stringify(mid));
  }
  assert.ok(Math.abs((reading.bay.right - reading.bay.left) - 30) < 1.5, 'bay width ' + (reading.bay.right - reading.bay.left));
});

test('briefing counts and target labels are read from text lines', () => {
  const b = br.parseBriefing(['Scoring:COMSTOCK, Best 2 hits on cardboard.', 'Targets:14 USPSA targets, 3 mini poppers', 'Rounds:31', 'Start Position:']);
  assert.deepEqual([b.paper, b.miniPoppers, b.poppers, b.rounds, b.bestHits], [14, 3, 0, 31, 2]);
  assert.equal(br.briefingTargets(b), 17);
  const c = br.parseBriefing(['Targets:13 USPSA targets, 1 popper, 4 mini poppers', 'Rounds:31']);
  assert.deepEqual([c.paper, c.poppers, c.miniPoppers], [13, 1, 4]);
  assert.equal(br.parseBriefing(['Welcome to the match']), null);
  const labels = br.parseLabels([{ text: 'T10 T11', x: 0.5, y: 0.2, width: 0.1, height: 0.02, confidence: 0.9 }, { text: 'P1P2', x: 0.1, y: 0.1, width: 0.05, height: 0.02, confidence: 0.9 }, { text: 'Setup Notes:', x: 0, y: 0.9, width: 0.2, height: 0.02, confidence: 0.9 }]);
  assert.deepEqual(labels.map(l => l.kind + l.number), ['T10', 'T11', 'P1', 'P2']);
  const faces = [{ x: 0.53, y: 0.25 }, { x: 0.57, y: 0.25 }, { x: 0.9, y: 0.9 }];
  const assigned = br.assignLabels(labels.slice(0, 2), faces, 0.06);
  assert.equal(assigned.get(0).number, 10); assert.equal(assigned.get(1).number, 11); assert.equal(assigned.has(2), false);
});

test('PNG encoder writes a picture zlib and the PNG structure accept', () => {
  const rgba = new Uint8ClampedArray(70000 * 4).map((_, i) => i % 251);
  const bytes = png.encodePng(rgba, 350, 200);
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const idatAt = Buffer.from(bytes).indexOf('IDAT'), length = Buffer.from(bytes).readUInt32BE(idatAt - 4);
  const raw = zlib.inflateSync(Buffer.from(bytes.slice(idatAt + 4, idatAt + 4 + length)));
  assert.equal(raw.length, 200 * (350 * 4 + 1));
  assert.deepEqual([...raw.slice(1, 9)], [...rgba.slice(0, 8)]);
  assert.equal(Buffer.from(bytes).readUInt32BE(idatAt + 4 + length), png.crc32(bytes, idatAt, idatAt + 4 + length));
  assert.throws(() => png.encodePng(rgba, 10, 10), /size/);
});

test('READ 3D DRAWING makes a valid top-down draft whose accepted elements land on a grown stage', async () => {
  const page = { asset: { path: 'diagram-imports/page.png', name: 'Stage.png', mime: 'image/png', size: 10 }, width: W, height: H, page: 1, pageCount: 1 };
  let stored = null;
  const deps = {
    readRaster: async () => scene,
    alignPage: async (p, a) => ({ ...p, asset: { ...p.asset, path: 'diagram-imports/crop.png' } }),
    storePng: async (bytes, name) => { stored = bytes; return { path: 'diagram-imports/top.png', name, mime: 'image/png', size: bytes.length }; },
    recognizeText: async p => p.asset.path.endsWith('crop.png') ? null : [{ text: 'Targets:5 USPSA targets', x: 0.1, y: 0.05, width: 0.3, height: 0.02, confidence: 0.9 }, { text: 'Rounds:10', x: 0.1, y: 0.08, width: 0.2, height: 0.02, confidence: 0.9 }],
  };
  const draft = { version: 1, id: 'read3d', source: page.asset, sourceKind: 'image', page, alignment: { corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } }, projection: 'top-down', origin: { x: 0, y: 0 }, proposals: [] };
  const result = await t3.readThreeDDrawing(draft, 'USPSA', deps, new AbortController().signal);
  validateReconstruction(result.draft);
  assert.ok(stored && stored.length > 1000);
  assert.equal(result.draft.calibration.evidence, 'grid');
  assert.match(result.message, /1 yd/); assert.match(result.message, /Briefing: 5 paper, 10 rounds/);
  assert.ok(result.draft.proposals.every(p => validProposal(p) && !p.accepted && p.approximate));
  assert.ok(result.draft.proposals.filter(p => p.type === 'cardboardTarget').length >= 5);
  assert.ok(result.draft.proposals.filter(p => p.type === 'faultLine').length >= 4);
  // Accept everything and add it to a small stage: the stage grows to the drawing, nothing lands outside.
  const accepted = { ...result.draft, proposals: result.draft.proposals.map(p => ({ ...p, accepted: true, reviewed: true })) };
  const stage = { schemaVersion: 7, coordinateSystem: 'inches', stage: { width: 480, depth: 360 }, objects: [] };
  const fitted = t3.fitStageToDrawing(stage, accepted);
  assert.ok(Math.abs(fitted.stage.width - 30 * 36) < 60 && fitted.stage.depth > 25 * 36, JSON.stringify(fitted.stage));
  const doc = reconstruct(accepted, fitted, 'USPSA');
  assert.equal(doc.objects.length, accepted.proposals.length);
  // Targets carry the USPSA preset, and sit roughly where they stand: T at (6,5) is 6 yd from the left, 5 from the back.
  const near = doc.objects.filter(o => o.type === 'cardboardTarget').some(o => Math.abs(o.position.x - 6 * 36) < 24 && Math.abs(o.position.y - 5 * 36) < 24);
  assert.ok(near, JSON.stringify(doc.objects.filter(o => o.type === 'cardboardTarget').map(o => [Math.round(o.position.x / 36 * 10) / 10, Math.round(o.position.y / 36 * 10) / 10])));
  assert.ok(doc.objects.filter(o => o.type === 'cardboardTarget').every(o => o.presetId === 'uspsa-metric-chl-v1'));
  // Untouched drawings and other imports leave the stage alone.
  assert.equal(t3.fitStageToDrawing(stage, result.draft), stage);
});

test('a page with no 3D view says so', async () => {
  const white = { width: 200, height: 200, rgba: new Uint8ClampedArray(200 * 200 * 4).fill(255) };
  const page = { asset: { path: 'diagram-imports/page.png', name: 'p.png', mime: 'image/png', size: 10 }, width: 200, height: 200, page: 1, pageCount: 1 };
  const draft = { version: 1, id: 'none', source: page.asset, sourceKind: 'image', page, alignment: { corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } }, projection: 'top-down', origin: { x: 0, y: 0 }, proposals: [] };
  await assert.rejects(t3.readThreeDDrawing(draft, 'USPSA', { readRaster: async () => white, alignPage: async p => p, storePng: async () => null, recognizeText: async () => null }, new AbortController().signal), /No 3D stage view/);
});
