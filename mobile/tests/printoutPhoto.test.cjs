// READ 3D DRAWING on a photo of the printed page: light evened out, the paper flattened by its corners first,
// black-and-white prints and glare explained. The synthetic Practisim-like drawing is placed on a white page and lit
// like a phone photo (dim warm light, a gradient, a hard shadow across the floor).
const { test } = require('node:test'), assert = require('node:assert/strict');
const { W, H, CAM, TARGETS, WALLS, render } = require('./fixtures/practisimScene.cjs');
const g = require('../src/diagramImport/groundPlane.ts'), rd = require('../src/diagramImport/practisimReader.ts');
const t3 = require('../src/diagramImport/threeD.ts'), L = require('../src/diagramImport/photoLight.ts');

const scene = render(), MARGIN = 60;
/** The drawing on white paper, photographed: `light(u, v)` scales each pixel (u, v from 0 to 1 across the page). */
function photograph(light, cast = [1, 0.95, 0.82], glare = null) {
  const PW = W + 2 * MARGIN, PH = H + 2 * MARGIN, rgba = new Uint8ClampedArray(PW * PH * 4);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const sx = x - MARGIN, sy = y - MARGIN, inside = sx >= 0 && sy >= 0 && sx < W && sy < H, s = (sy * W + sx) * 4;
    const c = inside ? [scene.rgba[s], scene.rgba[s + 1], scene.rgba[s + 2]] : [250, 250, 247], l = light(x / PW, y / PH), i = (y * PW + x) * 4;
    for (let k = 0; k < 3; k++) rgba[i + k] = c[k] * l * cast[k];
    if (glare && Math.hypot(x - glare.x * PW, y - glare.y * PH) < glare.r) rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }
  return { width: PW, height: PH, rgba };
}
const shadowed = (u, v) => 0.8 * (1 - 0.15 * u) * (u + 0.6 * v < 0.55 ? 0.55 : 1);
const crop = (r, b) => { const x0 = Math.round(b.x * r.width), y0 = Math.round(b.y * r.height), w = Math.round(b.width * r.width), h = Math.round(b.height * r.height), out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(r.rgba.subarray(((y0 + y) * r.width + x0) * 4, ((y0 + y) * r.width + x0 + w) * 4), y * w * 4); return { width: w, height: h, rgba: out }; };
/** What the reader finds, and how many of the drawn targets it finds where they stand. */
function readOf(raster) {
  const { result } = g.straightenGround(raster);
  if (!result) return null;
  const reading = rd.readDrawing(raster, result), targets = reading.objects.filter(o => o.kind === 'target');
  // Ground cells of the true targets in this reading's grid (the lattice may sit at any whole-cell offset).
  const toCells = p => { const q = g.apply(result.toGround, { x: g.apply(CAM, p).x + (raster.offset?.x ?? 0), y: g.apply(CAM, p).y + (raster.offset?.y ?? 0) }); return q; };
  const found = TARGETS.filter(t => { const q = toCells(t); return targets.some(o => Math.hypot(o.at.x - q.x, o.at.y - q.y) < 0.6); }).length;
  return { found, targets: targets.length, walls: reading.objects.filter(o => o.kind === 'wall').length, areas: reading.objects.filter(o => o.kind === 'shootingArea').length };
}
const page = (width, height) => ({ asset: { path: 'diagram-imports/page.png', name: 'Photo.jpg', mime: 'image/jpeg', size: 10 }, width, height, page: 1, pageCount: 1 });
const draftOf = (p, corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]) => ({ version: 1, id: 'photo', source: p.asset, sourceKind: 'paper-photo', page: p, alignment: { corners, rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } }, projection: 'top-down', origin: { x: 0, y: 0 }, proposals: [] });

test('a clean render is left exactly as it is, so PDFs and screenshots read as before', () => {
  const result = L.evenLight(scene);
  assert.equal(result.evened, false); assert.equal(result.raster, scene);
  assert.equal(L.looksGreyscale(scene), false);
  assert.equal(L.photoTips(result), '', 'no photo tips for a render');
});

test('a shadow across the floor and a warm, dim light: evening the light recovers what the render shows', () => {
  const photo = photograph(shadowed), box = t3.drawingBox(photo);
  const full = L.evenLight(photo);
  assert.ok(full.evened && full.spread > 1.4, 'the light is uneven: ' + full.spread);
  const evenBox = t3.drawingBox(full.raster);
  assert.ok(evenBox, 'the drawing is found on the evened page');
  const evened = L.evenLight(crop(photo, evenBox), full.reference).raster;
  evened.offset = { x: -Math.round(evenBox.x * photo.width) + MARGIN, y: -Math.round(evenBox.y * photo.height) + MARGIN };
  const after = readOf(evened);
  assert.ok(after, 'the floor straightens');
  assert.equal(after.found, TARGETS.length, 'every target, where it stands');
  assert.equal(after.areas, 1); assert.ok(after.walls <= WALLS.length + 1, 'walls ' + after.walls);
  // The same photo read as it is finds less, or false walls along the shadow's edge.
  const raw = crop(photo, box); raw.offset = { x: -Math.round(box.x * photo.width) + MARGIN, y: -Math.round(box.y * photo.height) + MARGIN };
  const before = readOf(raw);
  assert.ok(!before || before.found < after.found || before.walls > after.walls, JSON.stringify({ before, after }));
  // The paper comes out white and the warm cast is gone.
  const i = (10 * full.raster.width + 10) * 4, paper = [...full.raster.rgba.slice(i, i + 3)];
  assert.ok(paper.every(v => Math.abs(v - L.PAPER_WHITE) < 8), 'paper ' + paper);
});

test('READ 3D DRAWING on a photo: flattened by the page corners first, light evened, the message says so', async () => {
  const photo = photograph(shadowed), p = page(photo.width, photo.height), calls = [];
  const corners = [{ x: 0.01, y: 0.01 }, { x: 0.99, y: 0.01 }, { x: 0.99, y: 0.99 }, { x: 0.01, y: 0.99 }];
  const deps = {
    // Stand-ins: the flattened page is the photo itself; a crop is cut from it.
    readRaster: async pg => pg.crop ? crop(photo, pg.crop) : photo,
    alignPage: async (pg, a) => { calls.push(a); const full = a.crop.width === 1 && a.crop.height === 1; return { ...pg, asset: { ...pg.asset, path: full ? 'diagram-imports/flat.png' : 'diagram-imports/crop.png' }, ...(full ? {} : { crop: a.crop }) }; },
    storePng: async (bytes, name) => ({ path: 'diagram-imports/top.png', name, mime: 'image/png', size: bytes.length }),
    recognizeText: async () => null,
  };
  const result = await t3.readThreeDDrawing(draftOf(p, corners), 'USPSA', deps, new AbortController().signal);
  assert.deepEqual(calls[0], { corners, rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } }, 'the paper is flattened first');
  assert.deepEqual(result.draft.alignment.corners, corners, 'the crop is taken on the flattened paper');
  assert.match(result.message, /light was evened out/);
  assert.ok(result.draft.proposals.filter(q => q.type === 'cardboardTarget').length >= TARGETS.length);
});

test('corners found on something else: the whole picture is read instead', async () => {
  const photo = photograph(shadowed), p = page(photo.width, photo.height), white = { width: 200, height: 200, rgba: new Uint8ClampedArray(200 * 200 * 4).fill(250) };
  const corners = [{ x: 0.6, y: 0.05 }, { x: 0.9, y: 0.05 }, { x: 0.9, y: 0.2 }, { x: 0.6, y: 0.2 }];
  const deps = {
    readRaster: async pg => pg.asset.path.endsWith('flat.png') ? white : pg.crop ? crop(photo, pg.crop) : photo,
    alignPage: async (pg, a) => { const full = a.crop.width === 1 && a.crop.height === 1; return { ...pg, asset: { ...pg.asset, path: full ? 'diagram-imports/flat.png' : 'diagram-imports/crop.png' }, ...(full ? {} : { crop: a.crop }) }; },
    storePng: async (bytes, name) => ({ path: 'diagram-imports/top.png', name, mime: 'image/png', size: bytes.length }), recognizeText: async () => null,
  };
  const result = await t3.readThreeDDrawing(draftOf(p, corners), 'USPSA', deps, new AbortController().signal);
  assert.deepEqual(result.draft.alignment.corners, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
});

test('a black-and-white print is refused with what to use instead; glare is named when a photo fails', async () => {
  const photo = photograph(shadowed), grey = { ...photo, rgba: photo.rgba.map((v, i) => i % 4 === 3 ? 255 : 0) };
  for (let i = 0; i < photo.rgba.length; i += 4) { const l = (photo.rgba[i] + photo.rgba[i + 1] + photo.rgba[i + 2]) / 3; grey.rgba[i] = grey.rgba[i + 1] = grey.rgba[i + 2] = l; }
  assert.equal(L.looksGreyscale(grey), true);
  const p = page(grey.width, grey.height), deps = { readRaster: async () => grey, alignPage: async pg => pg, storePng: async () => null, recognizeText: async () => null };
  await assert.rejects(t3.readThreeDDrawing(draftOf(p), 'USPSA', deps, new AbortController().signal), /No 3D stage view.*black and white.*colour print, the PDF or a screenshot/);
  const glary = L.evenLight(photograph(shadowed, undefined, { x: 0.55, y: 0.7, r: 40 }));
  assert.ok(glary.glare > 0.004, 'glare ' + glary.glare);
  assert.match(L.photoTips(glary), /glare/);
});

test('the import screen tells photo users how to take the picture (not PDF users)', () => {
  const screen = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/diagramImport/DiagramImportScreen.tsx'), 'utf8');
  assert.match(screen, /draft\.sourceKind !== 'pdf' && <Copy>A photo of a printout: lay the page flat, fill the frame with it, and keep glare off it\./);
});
