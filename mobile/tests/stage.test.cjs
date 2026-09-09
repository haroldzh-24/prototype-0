const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const ts = require('typescript');
// Compile only the pure stage modules with the existing TypeScript dependency.
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(
  fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, file);
const C = require('../src/stage/coordinates.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { normalizeRotation, constrainPosition } = require('../src/stage/geometry.ts');
const { createObjectId } = require('../src/stage/ids.ts');
const { addObject, removeLastObject, moveObject, rotateObject } = require('../src/stage/operations.ts');
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-8, a + ' != ' + b);
const position = { space: 'stage', x: 120, y: 90, z: 48 };
const size = { width: 480, depth: 360 };
const transform = (zoom = 1, pan = { x: 0, y: 0 }) => C.createViewportTransform(size,
  { width: 960, height: 800 }, { zoom, pan });

test('fit transform has known scale, letterbox offsets, and forward/inverse coordinates', () => {
  assert.deepEqual(transform(), { scale: 2, offsetX: 0, offsetY: 40 });
  assert.deepEqual(C.stageToViewport(position, transform()), { space: 'viewport', x: 240, y: 220 });
  assert.deepEqual(C.viewportToStage({space:'viewport',x:240,y:220},transform(),48),position);
});
test('round trips at multiple zooms, pans, and viewport aspect ratios preserve supplied elevation', () => {
  for(const zoom of [0.5,1,1.25,3]) for(const pan of [{x:0,y:0},{x:73,y:-29}]) {
    for(const viewport of [{width:960,height:800},{width:300,height:430}]) {
      const t=C.createViewportTransform(size,viewport,{zoom,pan});
      const p=C.viewportToStage(C.stageToViewport(position,t),t,position.z);
      near(p.x,position.x); near(p.y,position.y); near(p.z,position.z);
    }
  }
});
test('zoom centers the stage and pan adds viewport offsets',()=>{
  const t=transform(2,{x:25,y:-10});
  assert.deepEqual(t,{scale:4,offsetX:-455,offsetY:-330});
  assert.deepEqual(C.stageToViewport({space:'stage',x:240,y:180,z:0},t),{space:'viewport',x:505,y:390});
});
test('gesture distance converts to physical distance at different zooms without changing Z',()=>{
  for(const zoom of [0.5,1,2,3]) {
    const t=transform(zoom,{x:31,y:12});
    const moved=C.moveByViewportDelta(position,{x:60,y:-12},t);
    near(moved.x,120+60/(2*zoom)); near(moved.y,90-12/(2*zoom)); assert.equal(moved.z,48);
  }
});
test('zoom limits and invalid viewport inputs',()=>{
  assert.equal(C.clampZoom(0.01),0.5); assert.equal(C.clampZoom(99),3);
  assert.throws(()=>C.createViewportTransform(size,{width:0,height:430},{zoom:1,pan:{x:0,y:0}}));
});
test('rotated rectangle corners stay within all four physical boundaries',()=>{
  for(const angle of [0,15,45,90,135,270,359]) for(const x of [-999,999]) for(const y of [-999,999]) {
    const wall={...createObject('wall','test',240,180),rotation:angle};
    const p=constrainPosition(wall,{space:'stage',x,y,z:0},size);
    const r=angle*Math.PI/180;
    for(const lx of [-48,48]) for(const ly of [-2,2]) {
      const cx=p.x+lx*Math.cos(r)-ly*Math.sin(r), cy=p.y+lx*Math.sin(r)+ly*Math.cos(r);
      assert.ok(cx>=-1e-8 && cx<=480+1e-8); assert.ok(cy>=-1e-8 && cy<=360+1e-8);
    }
  }
});
test('oversized objects stay centered and intersect the workspace',()=>{
  const wall=createObject('wall','test',0,0);
  const p=constrainPosition(wall,wall.position,{width:20,depth:2});
  assert.equal(p.x,10); assert.equal(p.y,1);
});
test('rotation normalization and rotation near edges',()=>{
  for(const [input,expected] of [[-15,345],[360,0],[735,15],[-720,0]]) assert.equal(normalizeRotation(input),expected);
  assert.throws(()=>normalizeRotation(Infinity));
  const stage=createDefaultStage();
  const moved=moveObject(stage,'wall-1',{space:'stage',x:48,y:2,z:0});
  const rotated=rotateObject(moved,'wall-1',90);
  const wall=rotated.objects.find(o=>o.id==='wall-1');
  assert.equal(wall.rotation,90); near(wall.position.y,48);
  assert.equal(rotated.objects[0],stage.objects[0]);
});
test('UUID IDs remain unique across add/remove cycles and duplicate insertion is rejected',()=>{
  const ids=new Set(); let stage=createDefaultStage();
  for(let i=0;i<1000;i++) {
    const id=createObjectId('target',randomUUID); assert.ok(!ids.has(id)); ids.add(id);
    stage=addObject(stage,'target',id);
    assert.throws(()=>addObject(stage,'target',id));
    stage=removeLastObject(stage,'target');
  }
  assert.deepEqual(stage,createDefaultStage());
});
test('default/reset factories are independent and all defaults fit',()=>{
  const a=createDefaultStage(),b=createDefaultStage();
  assert.equal(a.schemaVersion,2); assert.equal(a.coordinateSystem,'inches'); assert.deepEqual(a.stage,size);
  assert.deepEqual(a,b); assert.notEqual(a.objects[0].geometry,b.objects[0].geometry);
  a.objects[0].position={...a.objects[0].position,x:999}; assert.equal(b.objects[0].position.x,60);
  for(const o of b.objects) assert.deepEqual(constrainPosition(o,o.position,b.stage),o.position);
});
test('movement updates only the requested ID without mutating input',()=>{
  const stage=createDefaultStage(); const before=structuredClone(stage);
  const moved=moveObject(stage,'target-1',{space:'stage',x:200,y:150,z:48});
  assert.deepEqual(stage,before);
  for(const o of stage.objects) if(o.id!=='target-1') assert.equal(moved.objects.find(n=>n.id===o.id),o);
  assert.equal(moved.objects.find(o=>o.id==='target-1').position.x,200);
  assert.deepEqual(moveObject(stage,'missing',position),stage);
});
test('add/remove retains start-target-wall order and last-of-type removal',()=>{
  let stage=addObject(createDefaultStage(),'target','new-target');
  stage=addObject(stage,'wall','new-wall');
  assert.deepEqual(stage.objects.map(o=>o.type),['start','target','target','target','target','wall','wall','wall','wall']);
  stage=removeLastObject(removeLastObject(stage,'target'),'wall');
  assert.deepEqual(stage,createDefaultStage());
  for(let i=0;i<5;i++) stage=removeLastObject(stage,'target');
  assert.equal(stage.objects.filter(o=>o.type==='target').length,0);
  assert.equal(stage.objects[0].type,'start');
});
