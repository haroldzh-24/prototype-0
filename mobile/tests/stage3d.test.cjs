// 3D stage view and eye-level walk: math, scene building, picking, cameras, and the route walk.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const M = require('../src/stage3d/math.ts');
const { buildScene: build, pickObject, shortTargetLabel, sceneTotals } = require('../src/stage3d/scene.ts');
// Most checks look at all layers together.
const buildScene = (...args) => { const scene = build(...args); return { ...scene, ...sceneTotals(scene) }; };
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
  // One name per target in every view: scoring targets of every kind are T1, T2… in stage order; no-shoots NS1.
  assert.deepEqual(scene.labels.filter(l => l.kind !== 'start').map(l => l.text).sort(), ['NS1', 'T1', 'T2']);
  assert.equal(shortTargetLabel(stage, stage.objects.find(o => o.id === 'S')), 'T2');
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
    // ON THE MOVE for the whole stretch of legal walking (the plan may take it anywhere in it), DONE after it.
    for (const d of [w.from + 1, (w.from + w.to) / 2, w.to - 1]) {
      const during = W.targetStatuses(stage, plan, walk, W.walkPoint(walk, d), sight).find(s => s.targetId === w.targetId);
      assert.equal(during.state, 'moving', d + ' ' + JSON.stringify(during));
      assert.match(during.detail, /yd of window left/);
    }
    if (w.to + 2 < walk.length) assert.equal(W.targetStatuses(stage, plan, walk, W.walkPoint(walk, w.to + 2), sight).find(s => s.targetId === w.targetId).state, 'done');
    // Stepping a yard at a time along the stretch lands on ON THE MOVE.
    assert.ok(Array.from({ length: Math.floor(walk.length / 36) + 1 }, (_, i) => i * 36).some(d => d >= w.from && d <= w.to));
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

test('walk: a first position on the start box, route order for facing, ruleset and standing-only notes', () => {
  // An open bay: P1 is on the start point (a 0 in leg, so START and P1 share a point), P2 further right.
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 300, 440), createObject('cardboardTarget', 'T', 300, 60), createObject('cardboardTarget', 'U', 500, 60)];
  const stacked = createPlan(); stacked.route = createRoute('r');
  stacked.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [box('A', 20, 300, 560, 160)] };
  stacked.route.positions = [
    { id: 'P1', label: 'P1', position: at(300, 440), visibleTargetIds: ['T'], engagedTargetIds: ['T'] },
    { id: 'P2', label: 'P2', position: at(500, 440), visibleTargetIds: ['U'], engagedTargetIds: ['U'] }];
  const route = stacked.route;
  const walk = W.buildWalk(stage, route), sight = W.sightStage(stage, stacked);
  assert.equal(walk.stops[1].distance, 0);
  assert.deepEqual(walk.standing, { P1: ['T'], P2: ['U'] }, JSON.stringify(walk.analysis.warnings));
  const atP1 = W.walkPoint(walk, 0);
  assert.equal(atP1.stop.label, 'P1', 'the later of two stops at one point by default');
  const here = W.targetStatuses(stage, stacked, walk, atP1, sight);
  assert.equal(here.find(s => s.targetId === 'T').state, 'here');
  assert.notEqual(here.find(s => s.targetId === 'U').state, 'done');
  const atStart = W.walkPoint(walk, 0, 'start');
  assert.equal(atStart.stop.label, 'START', 'chosen explicitly');
  const startStatuses = W.targetStatuses(stage, stacked, walk, atStart, sight);
  assert.ok(startStatuses.every(s => s.state !== 'here' && s.state !== 'done'));
  // Facing from START: P1's target (next in route order), not P2's.
  near(W.suggestedHeading(stage, walk, atStart, startStatuses), -90, 1e-6);
  // At P2, P1's target is done, by order as well as distance.
  assert.equal(W.targetStatuses(stage, stacked, walk, W.walkPoint(walk, walk.length), sight).find(s => s.targetId === 'T').state, 'done');

  // Route order beats distance: a standing stop before a later moving stretch is faced first.
  const synthetic = { legs: [], stops: [{ id: 's', label: 'START', distance: 0, point: p(100, 440) }], length: 100, path: [], analysis: null, standing: {},
    windows: [{ targetId: 'U', waypointId: 'P2', from: 50, to: 90, at: 50, path: [] }], order: [{ targetId: 'T', kind: 'standing', stopIndex: 1 }, { targetId: 'U', kind: 'moving', stopIndex: 2 }] };
  const legal = ['T', 'U'].map(id => ({ targetId: id, state: 'legal' }));
  near(W.suggestedHeading(stage, synthetic, { point: p(100, 440), distance: 0, heading: null, leg: null, stop: synthetic.stops[0] }, legal), Math.atan2(60 - 440, 300 - 100) * 180 / Math.PI, 1e-6);

  // Without route settings, the match's ruleset decides walls and non-threats.
  assert.equal(W.sightStage(stage, createPlan(), 'IDPA').stage.ruleset, 'IDPA');
  assert.equal(W.sightStage(stage, createPlan()).stage.ruleset, 'USPSA');

  // Moving engagement off: mid-leg, a legal target is legal standing there but not on the move.
  const { stage: s2, plan: p2 } = gallery();
  p2.route.engagementRules = { ...p2.route.engagementRules, allowMoving: false };
  const w2 = W.buildWalk(s2, p2.route), mid = W.walkPoint(w2, w2.length / 2);
  const legalMid = W.targetStatuses(s2, p2, w2, mid).filter(s => s.state === 'legal');
  assert.ok(legalMid.every(s => /not on the move \(moving engagement is off/.test(s.detail)), JSON.stringify(legalMid));
});

test('walk aim: one target at a time in plan order, turning to the next before arriving', () => {
  const { stage, plan } = gallery();
  const walk = W.buildWalk(stage, plan.route), sight = W.sightStage(stage, plan);
  const aimAt = (d, pick = 0) => { const wp = W.walkPoint(walk, d); return { wp, aim: W.aimAt(stage, walk, wp, W.targetStatuses(stage, plan, walk, wp, sight), 63, pick) }; };
  const bearing = (wp, id) => { const t = stage.objects.find(o => o.id === id).position; return Math.atan2(t.y - wp.point.y, t.x - wp.point.x) * 180 / Math.PI; };
  // Inside L's stretch: aims at L, not at the middle of everything planned.
  const L = walk.windows.find(w => w.targetId === 'L'), { wp: inL, aim: onL } = aimAt((L.from + L.to) / 2);
  assert.equal(onL.mode, 'engage'); assert.ok(onL.queue.includes('L'));
  near(onL.heading, bearing(inL, onL.targetId), 1e-6);
  // Two stretches open at once: ‹ › steps through them in plan order and wraps.
  const both = Array.from({ length: Math.ceil(walk.length) }, (_, i) => i).find(d => aimAt(d).aim.queue.length > 1);
  if (both !== undefined) {
    const first = aimAt(both).aim, second = aimAt(both, 1).aim, wrapped = aimAt(both, 2).aim, back = aimAt(both, -1).aim;
    assert.deepEqual(first.queue, ['L', 'M'].filter(id => first.queue.includes(id)));
    assert.equal(second.targetId, first.queue[1]); assert.equal(wrapped.targetId, first.queue[0]); assert.equal(back.targetId, first.queue[first.queue.length - 1]);
  }
  // At P1: R, looking down toward the middle of its face from 63 in.
  const end = aimAt(walk.length);
  assert.equal(end.aim.targetId, 'R'); assert.equal(end.aim.mode, 'engage');
  const face = stage.objects.find(o => o.id === 'R'), zs = require('../src/stage/projection.ts').objectSurfaces(face).flatMap(s => s.points.map(p => p.z));
  const expectPitch = Math.atan2((Math.min(...zs) + Math.max(...zs)) / 2 - 63, Math.hypot(face.position.x - end.wp.point.x, face.position.y - end.wp.point.y)) * 180 / Math.PI;
  near(end.aim.pitch, expectPitch, 1e-6);
  // Past every stretch and still walking: the way you walk, then turning to R over the last 1.5 yd.
  const lastWindow = Math.max(...walk.windows.map(w => w.to));
  if (walk.length - lastWindow > W.AIM_BLEND_INCHES + 12) {
    const far = aimAt(lastWindow + 6);
    assert.equal(far.aim.mode, 'walk'); assert.equal(far.aim.targetId, null); near(far.aim.heading, far.wp.heading, 1e-6);
    const close = aimAt(walk.length - W.AIM_BLEND_INCHES / 2);
    assert.equal(close.aim.mode, 'next'); assert.equal(close.aim.targetId, 'R');
    near(close.aim.heading, W.blendHeading(close.wp.heading, bearing(close.wp, 'R'), 0.5), 1e-6);
  }
});

test('walk aim: from the start, the first planned target; without a plan, the targets as a whole', () => {
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 300, 440), createObject('cardboardTarget', 'T', 300, 60), createObject('cardboardTarget', 'U', 500, 60)];
  const plan = createPlan(); plan.route = createRoute('r');
  plan.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [box('A', 20, 300, 560, 160)] };
  plan.route.positions = [
    { id: 'P1', label: 'P1', position: at(100, 400), visibleTargetIds: ['T'], engagedTargetIds: ['T'] },
    { id: 'P2', label: 'P2', position: at(500, 400), visibleTargetIds: ['U'], engagedTargetIds: ['U'] }];
  const walk = W.buildWalk(stage, plan.route), sight = W.sightStage(stage, plan);
  const start = W.walkPoint(walk, 0), aim = W.aimAt(stage, walk, start, W.targetStatuses(stage, plan, walk, start, sight), 63);
  assert.equal(aim.mode, 'next'); assert.equal(aim.targetId, 'T');
  near(aim.heading, -90, 1e-6);
  // At P2, P1's target is done: U is the one.
  const p2 = W.walkPoint(walk, walk.length);
  assert.equal(W.aimAt(stage, walk, p2, W.targetStatuses(stage, plan, walk, p2, sight), 63).targetId, 'U');
  // No route: the old overview heading, level.
  const none = W.buildWalk(stage, undefined), here = W.walkPoint(none, 0), statuses = W.targetStatuses(stage, createPlan(), none, here);
  const overview = W.aimAt(stage, none, here, statuses, 63);
  assert.equal(overview.mode, 'overview'); assert.equal(overview.targetId, null); assert.equal(overview.pitch, W.LEVEL_PITCH);
  near(overview.heading, W.suggestedHeading(stage, none, here, statuses), 1e-9);
});

test('walk aim helpers: short turns, smooth easing, and scrubbing that lands on stops', () => {
  near(W.turnBetween(170, -170), 20); near(W.turnBetween(-170, 170), -20); near(W.turnBetween(10, 10), 0);
  near(W.blendHeading(170, -170, 0.5), 180); near(W.blendHeading(0, 90, 2), 90, 1e-9, 'clamped');
  // Easing closes the gap the short way, never overshoots, and lands exactly.
  let h = 170; for (let i = 0; i < 5; i++) { const next = W.easeHeading(h, -170, 16); assert.ok(W.turnBetween(next, -170) >= 0 && W.turnBetween(next, -170) < W.turnBetween(h, -170) + 1e-9); h = next; }
  let settled = 0; for (let i = 0; i < 200; i++) settled = W.easeHeading(settled, 45, 16);
  assert.equal(settled, 45);
  assert.equal(W.easeHeading(10, 30, 0), 10, 'no time, no turn');
  const walk = { stops: [{ id: 's', label: 'START', distance: 0 }, { id: 'P1', label: 'P1', distance: 200 }, { id: 'P2', label: 'P2', distance: 420 }] };
  assert.equal(W.snapToStop(walk, 192, 12), 200); assert.equal(W.snapToStop(walk, 180, 12), 180);
  assert.equal(W.snapToStop(walk, 5, 12), 0); assert.equal(W.snapToStop(walk, 412, 12), 420);
});
