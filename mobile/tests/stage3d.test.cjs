// 3D stage view and eye-level walk: math, scene building, picking, cameras, and the route walk.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const M = require('../src/stage3d/math.ts');
const { buildScene, pickObject, shortTargetLabel } = require('../src/stage3d/scene.ts');
const C = require('../src/stage3d/camera.ts');
const W = require('../src/stage3d/walk.ts');
const { dayPalette, nightPalette } = require('../src/ui/tokens.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { addSegment } = require('../src/stage/segments.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute } = require('../src/planning/route.ts');
const { defaultEngagementRules } = require('../src/planning/engagements.ts');
const { planRoute, planToStageRoute, snapshotFromPlan, optionsFromPlan } = require('../src/planning/v2/index.ts');
const p = (x, y) => ({ x, y }), at = (x, y) => ({ space: 'stage', x, y, z: 0 });
const box = (id, x, y, w, h) => ({ id, vertices: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] });
const near = (a, b, e = 1e-6, m = '') => assert.ok(Math.abs(a - b) < e, `${m} ${a} != ${b}`);
const polyArea = pts => pts.reduce((s, [x1, y1], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x1 * y2 - x2 * y1; }, 0) / 2;
const triArea = (pts, tris) => tris.reduce((s, [a, b, c]) => s + Math.abs(polyArea([pts[a], pts[b], pts[c]])), 0);

test('matrices: inverse, projection to the screen and rays back through it agree', () => {
  const proj = M.perspective(50, 0.75, 1, 5000), view = M.lookAt([100, -300, 200], [50, -100, 0], [0, 0, 1]);
  const vp = M.multiply(proj, view), inv = M.invert(vp);
  const id = M.multiply(inv, vp);
  for (let i = 0; i < 16; i++) near(id[i], i % 5 === 0 ? 1 : 0, 5e-3, 'identity ' + i); // float32
  const target = M.projectToScreen(vp, [50, -100, 0], 300, 400);
  near(target.x, 150, 1e-3); near(target.y, 200, 1e-3);
  const hit = M.rayPlaneZ(M.screenRay(inv, 150, 200, 300, 400), 0);
  near(hit[0], 50, 1e-2); near(hit[1], -100, 1e-2);
  assert.equal(M.projectToScreen(vp, [100, -600, 400], 300, 400), null, 'behind the camera');
  assert.equal(M.rayPlaneZ({ origin: [0, 0, 10], dir: [1, 0, 0] }, 0), null, 'parallel');
});

test('ray-triangle hits inside, misses outside, counts both sides', () => {
  const a = [0, 0, 0], b = [10, 0, 0], c = [0, 10, 0];
  near(M.rayTriangle({ origin: [2, 2, 5], dir: [0, 0, -1] }, a, b, c), 5);
  near(M.rayTriangle({ origin: [2, 2, -5], dir: [0, 0, 1] }, a, b, c), 5);
  assert.equal(M.rayTriangle({ origin: [8, 8, 5], dir: [0, 0, -1] }, a, b, c), null);
  assert.equal(M.rayTriangle({ origin: [2, 2, 5], dir: [0, 0, 1] }, a, b, c), null, 'pointing away');
});

test('triangulation covers concave outlines exactly, in either winding, with collinear points', () => {
  const L = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]];
  for (const shape of [L, [...L].reverse(), [[0, 0], [2, 0], [4, 0], [4, 4], [0, 4]]]) {
    const tris = M.triangulate(shape);
    near(triArea(shape, tris), Math.abs(polyArea(shape)), 1e-9, JSON.stringify(shape));
  }
  // Popper contour from the stage projection (not convex).
  const popper = [[-0.25, 0], [0.25, 0], [0.12, 0.48], [0.4, 0.62], [0.5, 0.78], [0.35, 0.94], [0, 1], [-0.35, 0.94], [-0.5, 0.78], [-0.4, 0.62], [-0.12, 0.48]];
  near(triArea(popper, M.triangulate(popper)), Math.abs(polyArea(popper)), 1e-9, 'popper');
  assert.deepEqual(M.triangulate([[0, 0], [1, 1]]), []);
});

test('the 3D world matches the plan: seen from above, right is right and down the plan is down the screen', () => {
  const cam = { kind: 'orbit', target: M.toWorld({ x: 300, y: 200 }), yaw: -90, pitch: 89, distance: 800 };
  // yaw -90 puts the camera on the plan's bottom side looking up the plan, i.e. the 2D editor's view.
  const { viewProj } = C.cameraMatrices(cam, 1, 400);
  const c = M.projectToScreen(viewProj, M.toWorld({ x: 300, y: 200 }), 400, 400);
  const right = M.projectToScreen(viewProj, M.toWorld({ x: 400, y: 200 }), 400, 400);
  const down = M.projectToScreen(viewProj, M.toWorld({ x: 300, y: 300 }), 400, 400);
  assert.ok(right.x > c.x + 10 && Math.abs(right.y - c.y) < 10, 'stage +x is screen right');
  assert.ok(down.y > c.y + 10 && Math.abs(down.x - c.x) < 10, 'stage +y is screen down');
  assert.deepEqual(M.toStage(M.toWorld({ x: 3, y: 4, z: 5 })), { x: 3, y: 4, z: 5 });
});

function portStage() {
  let stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 300, 440), createObject('cardboardTarget', 'T', 300, 60), createObject('noShootTarget', 'N', 200, 60), createObject('steelPopper', 'S', 450, 80)];
  const r = addSegment(stage, 'wall', 'w', at(200, 240), at(400, 240)); assert.ok(!r.error); stage = r.stage;
  const wall = stage.objects.find(o => o.id === 'w');
  wall.geometry.height = 72; wall.ports = [{ id: 'port', offset: 0, width: 24, height: 24, sill: 36 }];
  return stage;
}

test('scene: every wall and target is pickable, ports are real openings, labels and colours follow the theme', () => {
  const stage = portStage();
  const scene = buildScene(stage, dayPalette);
  assert.ok(scene.triangles.count > 0 && scene.triangles.count % 3 === 0);
  assert.equal(scene.triangles.positions.length, scene.triangles.colors.length);
  assert.equal(scene.lines.count % 2, 0);
  assert.deepEqual([...new Set(scene.pick.map(t => t.objectId))].sort(), ['N', 'S', 'T', 'start', 'w']);
  // A horizontal ray through the middle of the port passes through the wall; just below it hits the wall.
  const through = { origin: M.toWorld({ x: 300, y: 300, z: 48 }), dir: [0, 1, 0] };
  assert.equal(pickObject({ pick: scene.pick.filter(t => t.objectId === 'w') }, through), null, 'port is open');
  const below = { origin: M.toWorld({ x: 300, y: 300, z: 20 }), dir: [0, 1, 0] };
  assert.equal(pickObject(scene, below).objectId, 'w');
  // World -y is down the plan (stage +y): from above the target row that ray meets the target face first.
  assert.equal(pickObject(scene, { origin: M.toWorld({ x: 300, y: 0, z: 30 }), dir: [0, 1, 0] }), null, 'looking up the plan, out of the bay');
  assert.equal(pickObject(scene, { origin: M.toWorld({ x: 300, y: 30, z: 63 }), dir: [0, -1, 0] }).objectId, 'T', 'face (48–78 in) is hit from in front');
  assert.equal(pickObject(scene, { origin: M.toWorld({ x: 300, y: 30, z: 30 }), dir: [0, -1, 0] }).objectId, 'w', 'under the raised face the ray reaches the wall');
  assert.deepEqual(scene.labels.filter(l => l.kind !== 'start').map(l => l.text).sort(), ['NS1', 'PP1', 'T1']);
  assert.equal(shortTargetLabel(stage, stage.objects.find(o => o.id === 'S')), 'PP1');
  // Selection and tints change colours; night uses the night palette.
  const selected = buildScene(stage, dayPalette, { selectedId: 'w' }), night = buildScene(stage, nightPalette);
  assert.notDeepEqual([...selected.triangles.colors], [...scene.triangles.colors]);
  assert.notDeepEqual([...night.triangles.colors], [...scene.triangles.colors]);
  assert.ok(scene.bounds.max[2] >= 72);
  // Route ribbons and stop labels.
  const routed = buildScene(stage, dayPalette, { route: { path: [p(300, 440), p(300, 300)], windows: [[p(300, 420), p(300, 380)]], stops: [{ id: 'P1', label: 'P1', point: p(300, 300) }] } });
  assert.ok(routed.triangles.count > scene.triangles.count);
  assert.ok(routed.labels.some(l => l.text === 'P1' && l.kind === 'stop'));
});

test('cameras: fit looks downrange from uprange; pan, zoom and look are bounded and go the right way', () => {
  const stage = portStage(), scene = buildScene(stage, dayPalette);
  const fit = C.fitOrbit(scene.bounds, 270, 0.6); // downrange is up the plan
  const eye = M.toStage(C.cameraEye(fit));
  assert.ok(eye.y > 240, 'camera stands behind the start side (bottom of the plan)');
  assert.ok(eye.z > 0);
  const { viewProj } = C.cameraMatrices(fit, 0.6, scene.bounds.radius);
  for (const [x, y] of [[0, 0], [600, 0], [600, 480], [0, 480]]) {
    const s = M.projectToScreen(viewProj, M.toWorld({ x, y }), 600, 1000);
    assert.ok(s && s.x >= -1 && s.x <= 601 && s.y >= -1 && s.y <= 1001, `corner ${x},${y} is on screen`);
  }
  assert.ok(C.orbitZoom(fit, 1e9).distance >= C.DISTANCE_LIMITS[0]);
  assert.ok(C.orbitRotate(fit, 0, 1e6).pitch <= C.PITCH_LIMITS.orbit[1]);
  const panned = C.orbitPan({ ...fit, yaw: -90, pitch: 89 }, 100, 0, 800);
  assert.ok(M.toStage(panned.target).x < M.toStage(fit.target).x, 'dragging right moves the view target left');
  const look = C.eyeAt(p(300, 440), 63, 270);
  near(M.toStage(look.position).z, 63);
  assert.ok(C.eyeLook(look, 40, 0).heading < 270, 'dragging the scene right turns you left');
  assert.ok(C.eyeLook(look, 0, 1e6).pitch <= C.PITCH_LIMITS.eye[1]);
});

/** The moving-plan gallery: three bays, one gap each, so the plan shoots two targets on the move. */
function gallery() {
  let stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 100, 440), createObject('cardboardTarget', 'L', 100, 60), createObject('cardboardTarget', 'M', 300, 60), createObject('cardboardTarget', 'R', 500, 60)];
  for (const [id, a, b] of [['w1', p(0, 200), p(80, 200)], ['w2', p(120, 200), p(280, 200)], ['w3', p(320, 200), p(480, 200)], ['w4', p(520, 200), p(600, 200)], ['v1', p(200, 10), p(200, 196)], ['v2', p(400, 10), p(400, 196)]]) {
    const r = addSegment(stage, 'wall', id, at(a.x, a.y), at(b.x, b.y)); stage = r.stage;
    stage.objects.find(o => o.id === id).geometry.height = 72;
  }
  const plan = createPlan(); plan.route = createRoute('r');
  plan.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [box('A', 20, 300, 560, 160)] };
  const result = planRoute(snapshotFromPlan(stage, plan), { ...optionsFromPlan(plan), candidateSpacingInches: 12, moving: true });
  plan.route = planToStageRoute(result, stage, plan);
  return { stage, plan };
}

test('walk: follows the route, and says what to engage on the move, at the stop, and what is done', () => {
  const { stage, plan } = gallery();
  const walk = W.buildWalk(stage, plan.route);
  assert.deepEqual(walk.stops.map(s => s.label), ['START', 'P1']);
  near(walk.length, walk.legs.reduce((s, l) => s + l.length, 0));
  assert.deepEqual(walk.windows.map(w => w.targetId), ['L', 'M']);
  assert.deepEqual(walk.standing[plan.route.positions[0].id], ['R']);
  const sight = W.sightStage(stage, plan);
  for (const w of walk.windows) {
    assert.ok(w.from <= w.at && w.at <= w.to && w.to <= walk.length + 1e-6);
    const during = W.targetStatuses(stage, plan, walk, W.walkPoint(walk, (w.from + w.at) / 2), sight).find(s => s.targetId === w.targetId);
    assert.equal(during.state, 'moving', JSON.stringify(during));
    assert.match(during.detail, /yd of window left/);
    const after = W.targetStatuses(stage, plan, walk, W.walkPoint(walk, Math.min(walk.length - 1, w.at + 2)), sight).find(s => s.targetId === w.targetId);
    assert.equal(after.state, 'done');
  }
  const end = W.walkPoint(walk, walk.length);
  assert.equal(end.stop.label, 'P1');
  const atStop = W.targetStatuses(stage, plan, walk, end, sight);
  assert.equal(atStop.find(s => s.targetId === 'R').state, 'here');
  assert.deepEqual(atStop.filter(s => s.state === 'done').map(s => s.targetId).sort(), ['L', 'M']);
  // At the start: a window that is already open says so; every other target is legal, visible or hidden, with a reason.
  const atStart = W.targetStatuses(stage, plan, walk, W.walkPoint(walk, 0), sight);
  for (const s of atStart) {
    const open = walk.windows.some(w => w.targetId === s.targetId && w.from <= 0.5);
    assert.ok(open ? s.state === 'moving' : ['legal', 'visible', 'hidden'].includes(s.state), JSON.stringify(s));
    assert.ok(s.detail);
  }
  assert.ok(atStart.every(s => s.plannedAt), 'each says where the plan takes it');
  assert.equal(atStart.find(s => s.targetId === 'R').rounds, 2);
  // Facing: at a moving window, toward the target being engaged.
  const w = walk.windows[0], wp = W.walkPoint(walk, (w.from + w.at) / 2);
  const heading = W.suggestedHeading(stage, walk, wp, W.targetStatuses(stage, plan, walk, wp, sight));
  const target = stage.objects.find(o => o.id === w.targetId).position;
  near(heading, Math.atan2(target.y - wp.point.y, target.x - wp.point.x) * 180 / Math.PI, 1e-6);
});

test('walk without a route or route settings: just the start, visibility only', () => {
  const stage = portStage(), plan = createPlan();
  const walk = W.buildWalk(stage, undefined);
  assert.equal(walk.length, 0); assert.deepEqual(walk.stops.map(s => s.label), ['START']);
  const statuses = W.targetStatuses(stage, plan, walk, W.walkPoint(walk, 0));
  assert.deepEqual(statuses.map(s => s.targetId).sort(), ['S', 'T'], 'no-shoots are not engageable');
  assert.ok(statuses.every(s => s.state === 'visible' || s.state === 'hidden'), 'no legality without firing areas');
  // T sits behind the 72 in wall (port at 36–60 in is centred on it): seen through the port.
  const t = statuses.find(s => s.targetId === 'T');
  assert.equal(t.state, 'visible', JSON.stringify(t));
  assert.equal(W.buildWalk({ ...stage, objects: stage.objects.filter(o => o.type !== 'start') }, undefined).stops.length, 0);
});

test('scene cache: unchanged objects are reused, edits and selection never show stale geometry', () => {
  const { moveObject } = require('../src/stage/operations.ts');
  const stage = portStage(), fresh = s => buildScene(JSON.parse(JSON.stringify(s)), dayPalette, { selectedId: 'w' });
  const same = (a, b) => ['positions', 'normals', 'colors'].every(k => a.triangles[k].length === b.triangles[k].length && a.triangles[k].every((v, i) => v === b.triangles[k][i]))
    && a.lines.positions.every((v, i) => v === b.lines.positions[i]) && JSON.stringify(a.labels) === JSON.stringify(b.labels);
  const first = buildScene(stage, dayPalette, { selectedId: 'w' });
  assert.ok(same(first, fresh(stage)));
  const moved = moveObject(stage, 'w', { space: 'stage', x: 330, y: 250, z: 0 });
  const after = buildScene(moved, dayPalette, { selectedId: 'w' });
  assert.ok(same(after, fresh(moved)), 'a moved wall is rebuilt');
  assert.ok(!same(after, first));
  assert.ok(after.pick.filter(t => t.objectId === 'T').every((t, i) => t === first.pick.filter(p => p.objectId === 'T')[i]), 'the untouched target is reused');
  assert.ok(same(buildScene(moved, dayPalette, { selectedId: 'T' }), buildScene(JSON.parse(JSON.stringify(moved)), dayPalette, { selectedId: 'T' })), 'selection change');
  assert.ok(same(buildScene(moved, nightPalette, {}), buildScene(JSON.parse(JSON.stringify(moved)), nightPalette, {})), 'theme change');
});
