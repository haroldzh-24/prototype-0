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
    const id=createObjectId('cardboardTarget',randomUUID); assert.ok(!ids.has(id)); ids.add(id);
    stage=addObject(stage,'cardboardTarget',id);
    assert.throws(()=>addObject(stage,'cardboardTarget',id));
    stage=removeLastObject(stage,'cardboardTarget');
  }
  assert.deepEqual(stage,createDefaultStage());
});
test('default/reset factories are independent and all defaults fit',()=>{
  const a=createDefaultStage(),b=createDefaultStage();
  assert.equal(a.schemaVersion,7); assert.equal(a.coordinateSystem,'inches'); assert.deepEqual(a.stage,size);
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
  let stage=addObject(createDefaultStage(),'cardboardTarget','new-target');
  stage=addObject(stage,'wall','new-wall');
  assert.deepEqual(stage.objects.map(o=>o.type),['start','cardboardTarget','cardboardTarget','cardboardTarget','cardboardTarget','wall','wall','wall','wall']);
  stage=removeLastObject(removeLastObject(stage,'cardboardTarget'),'wall');
  assert.deepEqual(stage,createDefaultStage());
  for(let i=0;i<5;i++) stage=removeLastObject(stage,'cardboardTarget');
  assert.equal(stage.objects.filter(o=>o.type==='cardboardTarget').length,0);
  assert.equal(stage.objects[0].type,'start');
});

const { DEFAULT_SNAPPING, resolveMovement, snapToIncrement, snapRotation, alignmentAnchors } = require('../src/stage/snapping.ts');
const { editObject } = require('../src/stage/operations.ts');
const { parseLength, formatLength } = require('../src/stage/measurements.ts');
const { measurementGrid } = require('../src/stage/grid.ts');
const gridOnly = { ...DEFAULT_SNAPPING, objectAlignment: false };

test('physical grid has six-inch minors and one-foot majors without changing the document', () => {
  const stage = createDefaultStage(), before = structuredClone(stage);
  const lines = measurementGrid(stage.stage);
  assert.equal(lines.length, 81 + 61);
  assert.deepEqual(lines.slice(0, 3), [
    {axis:'x',value:0,major:true},{axis:'x',value:6,major:false},{axis:'x',value:12,major:true},
  ]);
  assert.equal(lines.filter(l=>l.axis==='x').at(-1).value,480);
  assert.deepEqual(stage,before);
});
test('12/6/3 inch grid snaps nearest physical center with a deterministic half-step rule',()=>{
  for(const [step,expected] of [[12,120],[6,126],[3,123]]) {
    const stage=createDefaultStage();
    const result=resolveMovement(stage,'target-1',{space:'stage',x:124,y:124,z:48},{...gridOnly,gridIncrement:step});
    assert.equal(result.position.x,expected); assert.equal(result.position.y,expected); assert.equal(result.position.z,48);
  }
  assert.equal(snapToIncrement(3,6),6); assert.equal(snapToIncrement(-3,6),0);
  assert.throws(()=>snapToIncrement(10,0));
});
test('same physical drag destination snaps identically at 50/100/300 percent zoom and nonzero pan',()=>{
  const stage=createDefaultStage(); const origin=stage.objects.find(o=>o.id==='target-1').position;
  const destination={space:'stage',x:124,y:175,z:48};
  for(const increment of [12,6,3]) {
    let expected;
    for(const zoom of [0.5,1,3]) {
      const t=transform(zoom,{x:71,y:-39});
      const from=C.stageToViewport(origin,t), to=C.stageToViewport(destination,t);
      const raw=C.moveByViewportDelta(origin,{x:to.x-from.x,y:to.y-from.y},t);
      const result=resolveMovement(stage,'target-1',raw,{...gridOnly,gridIncrement:increment});
      if(!expected) expected=result.position;
      assert.deepEqual(result.position,expected);
    }
  }
});
test('rotation supports normalized 15-degree, 5-degree, and free absolute edits',()=>{
  assert.equal(snapRotation(17,15),15); assert.equal(snapRotation(17,5),15);
  assert.equal(snapRotation(17.25,null),17.25); assert.equal(snapRotation(-8,15),345);
  assert.equal(snapRotation(359,5),0); assert.equal(snapRotation(720,15),0);
  const stage=createDefaultStage();
  assert.equal(editObject(stage,'wall-1',{rotation:22},5).stage.objects.find(o=>o.id==='wall-1').rotation,20);
  assert.equal(editObject(stage,'wall-1',{rotation:22},null).stage.objects.find(o=>o.id==='wall-1').rotation,22);
});
test('manual X/Y edits use the same clamp as dragging but preserve exact non-grid positions',()=>{
  const stage=createDefaultStage(); const p={space:'stage',x:-999,y:9999,z:48};
  const edited=editObject(stage,'target-1',{position:{x:p.x,y:p.y}});
  assert.equal(edited.error,undefined); assert.deepEqual(edited.stage,moveObject(stage,'target-1',p));
  const exact=editObject(stage,'target-1',{position:{x:123.125,y:144.25}}).stage.objects.find(o=>o.id==='target-1');
  assert.equal(exact.position.x,123.125); assert.equal(exact.position.y,144.25);
});
test('dimension edits move inward and keep all rotated corners inside bounds',()=>{
  let stage=rotateObject(createDefaultStage(),'wall-1',45);
  stage=moveObject(stage,'wall-1',{space:'stage',x:0,y:0,z:0});
  const result=editObject(stage,'wall-1',{geometry:{length:200,thickness:24,height:80},position:{z:2}});
  assert.equal(result.error,undefined);
  const wall=result.stage.objects.find(o=>o.id==='wall-1');
  assert.deepEqual(wall.geometry,{length:200,thickness:24,height:80}); assert.equal(wall.position.z,2);
  for(const x of [-100,100]) for(const y of [-12,12]) {
    const r=Math.PI/4; const cx=wall.position.x+x*Math.cos(r)-y*Math.sin(r),cy=wall.position.y+x*Math.sin(r)+y*Math.cos(r);
    assert.ok(cx>=-1e-8 && cx<=480); assert.ok(cy>=-1e-8 && cy<=360);
  }
  assert.equal(result.stage.objects[0],stage.objects[0]);
});
test('invalid or oversized edits reject atomically and leave original document untouched',()=>{
  const stage=createDefaultStage();
  for(const edit of [{geometry:{width:9999}},{geometry:{depth:0}},{geometry:{height:-1}},
    {position:{z:-1}},{position:{x:NaN}},{rotation:Infinity},{geometry:{width:Infinity}},
    {position:{x:100},geometry:{width:-1}}]) {
    const result=editObject(stage,'target-1',edit); assert.ok(result.error); assert.equal(result.stage,stage);
  }
  assert.ok(editObject(stage,'start-1',{position:{z:1}}).error);
  const large=editObject(stage,'wall-1',{geometry:{length:470,thickness:20}}).stage;
  assert.ok(editObject(large,'wall-1',{rotation:90}).error);
});
test('object centers align by X/Y within physical tolerance and override grid per axis',()=>{
  const stage={...createDefaultStage(),objects:[createObject('cardboardTarget','moving',50,50),createObject('cardboardTarget','other',100,200)]};
  const result=resolveMovement(stage,'moving',{space:'stage',x:98,y:49,z:48},DEFAULT_SNAPPING);
  assert.equal(result.position.x,100); assert.equal(result.position.y,48);
  assert.deepEqual(result.guides,[{axis:'x',value:100,targetId:'other'}]);
  assert.deepEqual(result.gridAxes,['y']);
  const noObjects=resolveMovement(stage,'moving',{space:'stage',x:98,y:49,z:48},{...gridOnly});
  assert.equal(noObjects.position.x,96); assert.equal(noObjects.guides.length,0);
});
test('wall endpoint alignment and rotated anchors use physical geometry',()=>{
  const moving=createObject('wall','moving',100,50), other=createObject('wall','other',246,50);
  const stage={...createDefaultStage(),objects:[moving,other]};
  const result=resolveMovement(stage,'moving',{space:'stage',x:149,y:50,z:0},DEFAULT_SNAPPING);
  assert.equal(result.position.x,150); // right endpoint 198 meets other left endpoint 198.
  assert.ok(result.guides.some(g=>g.axis==='x' && g.value===198));
  const anchors=alignmentAnchors({...other,rotation:90});
  near(anchors[1].x,246); near(anchors[1].y,2);
  near(anchors[2].x,246); near(anchors[2].y,98);
});
test('snapping off preserves raw physical positions while still enforcing bounds',()=>{
  const stage=createDefaultStage(),p={space:'stage',x:123.4,y:175.9,z:48};
  const result=resolveMovement(stage,'target-1',p,{...DEFAULT_SNAPPING,enabled:false});
  assert.deepEqual(result.position,p); assert.deepEqual(result.guides,[]); assert.deepEqual(result.gridAxes,[]);
  const edge=resolveMovement(stage,'target-1',{...p,x:-100},{...DEFAULT_SNAPPING,enabled:false});
  assert.equal(edge.position.x,9);
});
test('bounds take priority and do not falsely report grid alignment',()=>{
  const stage=rotateObject(createDefaultStage(),'wall-1',45);
  const result=resolveMovement(stage,'wall-1',{space:'stage',x:-100,y:-100,z:0},gridOnly);
  assert.equal(result.gridAxes.length,0);
  near(result.position.x,Math.SQRT1_2*50); near(result.position.y,Math.SQRT1_2*50);
});
test('measurement inputs accept inches, feet/inches, fractions and reject malformed/nonfinite values',()=>{
  for(const [text,expected] of [['66',66],["5' 6\"",66],['5 ft 6 in',66],['6 1/2',6.5],['1/4',0.25],['-2',-2],["5'",60],['.5',0.5]]) {
    assert.equal(parseLength(text),expected,text);
  }
  for(const text of ['', 'abc', 'Infinity', '1/0', '5 feet nope', '1.2.3', '1e309']) assert.equal(parseLength(text),null,text);
  assert.equal(formatLength(66.5),'5 ft 6.5 in');
});
test('reset/default schema remains compatible after snapping and numeric edits',()=>{
  const original=createDefaultStage(); const before=structuredClone(original);
  const snap=resolveMovement(original,'target-1',{space:'stage',x:124,y:140,z:48},DEFAULT_SNAPPING);
  const moved=moveObject(original,'target-1',snap.position);
  const edited=editObject(moved,'target-1',{geometry:{faceWidth:30},rotation:20},5);
  assert.equal(edited.error,undefined); assert.deepEqual(original,before);
  assert.deepEqual(createDefaultStage(),before); assert.equal(edited.stage.schemaVersion,7);
  assert.equal(edited.stage.objects.find(o=>o.id==='target-1').id,'target-1');
});

test('half-grid destinations and object alignment are stable across noninteger viewport scales',()=>{
  const stage={...createDefaultStage(),objects:[createObject('cardboardTarget','moving',50,50),createObject('cardboardTarget','other',100,200)]};
  for(const zoom of [0.5,1,3]) {
    const t=C.createViewportTransform(size,{width:331,height:427},{zoom,pan:{x:17.3,y:-12.1}});
    for(const [destination,settings,expectedX] of [
      [{space:'stage',x:123,y:51,z:48},gridOnly,126],
      [{space:'stage',x:98,y:49,z:48},DEFAULT_SNAPPING,100],
    ]) {
      const origin=stage.objects[0].position;
      const from=C.stageToViewport(origin,t),to=C.stageToViewport(destination,t);
      const raw=C.moveByViewportDelta(origin,{x:to.x-from.x,y:to.y-from.y},t);
      const result=resolveMovement(stage,'moving',raw,settings);
      near(result.position.x,expectedX);
    }
  }
});
test('alignment beyond tolerance is ignored, self is excluded, and reported guides remain valid at bounds',()=>{
  const stage={...createDefaultStage(),objects:[createObject('cardboardTarget','moving',50,50),createObject('cardboardTarget','other',100,200)]};
  const far=resolveMovement(stage,'moving',{space:'stage',x:95,y:95,z:48},DEFAULT_SNAPPING);
  assert.equal(far.guides.length,0);
  const single={...stage,objects:[stage.objects[0]]};
  assert.equal(resolveMovement(single,'moving',single.objects[0].position,DEFAULT_SNAPPING).guides.length,0);
  for(const x of [-50,2,12,90,480,999]) {
    const result=resolveMovement(stage,'moving',{space:'stage',x,y:198,z:48},DEFAULT_SNAPPING);
    for(const guide of result.guides) {
      const moved={...stage.objects[0],position:result.position};
      assert.ok(alignmentAnchors(moved).some(a=>Math.abs(a[guide.axis]-guide.value)<1e-8));
    }
  }
});

const { footprint, FAULT_LINE_WIDTH } = require('../src/stage/geometry.ts');
test('walls have authoritative length/thickness/height with the same default physical footprint',()=>{
  const wall=createObject('wall','wall',120,180);
  assert.deepEqual(wall.geometry,{length:96,thickness:4,height:72});
  assert.deepEqual(footprint(wall),{width:96,depth:4});
  const stage={...createDefaultStage(),objects:[wall]};
  const edited=editObject(stage,wall.id,{geometry:{length:120,thickness:6,height:84}});
  assert.equal(edited.error,undefined);
  assert.deepEqual(edited.stage.objects[0].geometry,{length:120,thickness:6,height:84});
  assert.ok(editObject(stage,wall.id,{geometry:{width:120}}).error);
});
test('fault lines are separate ground objects with stable unique IDs and no height',()=>{
  const id=createObjectId('faultLine',randomUUID);
  const otherId=createObjectId('faultLine',randomUUID); assert.notEqual(id,otherId);
  const stage=addObject(createDefaultStage(),'faultLine',id);
  const line=stage.objects.find(o=>o.id===id);
  assert.equal(line.type,'faultLine'); assert.deepEqual(line.geometry,{length:96});
  assert.equal(line.position.z,0); assert.equal(line.rotation,0);
  assert.deepEqual(footprint(line),{width:96,depth:FAULT_LINE_WIDTH});
  assert.ok(!('height' in line.geometry));
  assert.ok(editObject(stage,id,{geometry:{height:72}}).error);
  assert.ok(editObject(stage,id,{geometry:{thickness:4}}).error);
  assert.ok(editObject(stage,id,{position:{z:1}}).error);
});
test('fault line movement and inspector edits isolate the object and keep rotated geometry in bounds',()=>{
  const stage=addObject(createDefaultStage(),'faultLine','line');
  const moved=moveObject(stage,'line',{space:'stage',x:-99,y:999,z:0});
  let line=moved.objects.find(o=>o.id==='line');
  assert.equal(line.position.x,48); assert.equal(line.position.y,359);
  assert.equal(moved.objects[0],stage.objects[0]);
  const edit=editObject(moved,'line',{position:{x:0,y:0},geometry:{length:120},rotation:90},15);
  assert.equal(edit.error,undefined); line=edit.stage.objects.find(o=>o.id==='line');
  assert.equal(line.geometry.length,120); assert.equal(line.rotation,90);
  near(line.position.x,1); near(line.position.y,60);
  for(const angle of [0,15,45,90,270,345]) {
    const rotated=rotateObject(edit.stage,'line',angle-90);
    const bounded=moveObject(rotated,'line',{space:'stage',x:999,y:-999,z:0}).objects.find(o=>o.id==='line');
    const r=bounded.rotation*Math.PI/180;
    for(const x of [-60,60]) for(const y of [-1,1]) {
      const cx=bounded.position.x+x*Math.cos(r)-y*Math.sin(r),cy=bounded.position.y+x*Math.sin(r)+y*Math.cos(r);
      assert.ok(cx>=-1e-8 && cx<=480+1e-8); assert.ok(cy>=-1e-8 && cy<=360+1e-8);
    }
  }
  for(const length of [0,-1,Infinity,9999]) {
    const rejected=editObject(stage,'line',{geometry:{length}}); assert.ok(rejected.error); assert.equal(rejected.stage,stage);
  }
});
test('fault line center/endpoints align with walls and grid snapping is zoom-independent',()=>{
  const line=createObject('faultLine','line',100,50),wall=createObject('wall','wall',246,50);
  const stage={...createDefaultStage(),objects:[line,wall]};
  const aligned=resolveMovement(stage,'line',{space:'stage',x:149,y:50,z:0},DEFAULT_SNAPPING);
  assert.equal(aligned.position.x,150); assert.ok(aligned.guides.some(g=>g.axis==='x' && g.value===198));
  const anchors=alignmentAnchors({...line,rotation:90}); assert.equal(anchors.length,3);
  near(anchors[1].x,100); near(anchors[1].y,2); near(anchors[2].y,98);
  for(const zoom of [0.5,1,3]) for(const increment of [12,6,3]) {
    const t=transform(zoom),to={space:'stage',x:124,y:124,z:0};
    const a=C.stageToViewport(line.position,t),b=C.stageToViewport(to,t);
    const raw=C.moveByViewportDelta(line.position,{x:b.x-a.x,y:b.y-a.y},t);
    const snapped=resolveMovement(stage,'line',raw,{...gridOnly,gridIncrement:increment});
    assert.equal(snapped.position.x,snapToIncrement(124,increment)); assert.equal(snapped.position.z,0);
    const free=resolveMovement(stage,'line',raw,{...gridOnly,enabled:false}); near(free.position.x,124);
  }
});
test('fault line add/remove keeps layer order and Reset restores unchanged default layout',()=>{
  const original=createDefaultStage();
  let stage=addObject(original,'faultLine','line-1'); stage=addObject(stage,'faultLine','line-2');
  stage=addObject(stage,'cardboardTarget','new-target'); stage=addObject(stage,'wall','new-wall');
  const types=stage.objects.map(o=>o.type);
  assert.ok(types.lastIndexOf('cardboardTarget')<types.indexOf('faultLine'));
  assert.ok(types.lastIndexOf('faultLine')<types.indexOf('wall'));
  stage=removeLastObject(stage,'faultLine'); assert.ok(stage.objects.some(o=>o.id==='line-1'));
  assert.ok(!stage.objects.some(o=>o.id==='line-2'));
  stage=removeLastObject(stage,'faultLine'); assert.equal(stage.objects.filter(o=>o.type==='faultLine').length,0);
  assert.deepEqual(createDefaultStage(),original); assert.equal(original.objects.length,7);
  assert.deepEqual(removeLastObject(original,'faultLine'),original);
});


const { inspectorValues, inspectorFields, parseInspectorEdit } = require('../src/editor/inspectorFields.ts');
for (const type of ['cardboardTarget', 'noShootTarget']) {
  test(type + ' creates an upright physical face, without the old ground envelope', () => {
    const object = createObject(type, 'face', 100, 120);
    assert.equal(object.type, type);
    assert.deepEqual(object.geometry, { faceWidth: 18, faceHeight: 30 });
    assert.deepEqual(object.position, { space: 'stage', x: 100, y: 120, z: 48 });
    assert.equal(object.rotation, 0);
    assert.deepEqual(footprint(object), { width: 18, depth: 0 });
    const stage = { ...createDefaultStage(), objects: [object] };
    const edited = editObject(stage, 'face', { geometry: { faceHeight: 60 }, position: { z: 12 } });
    assert.equal(edited.error, undefined);
    assert.deepEqual(footprint(edited.stage.objects[0]), footprint(object));
  });
  test(type + ' movement and resize keep rotated face endpoints inside all boundaries', () => {
    const original = addObject(createDefaultStage(), type, 'face');
    const before = structuredClone(original);
    for (const angle of [0, 15, 45, 90, 135, 270, 359]) {
      const resized = editObject(original, 'face', { geometry: { faceWidth: 42, faceHeight: 36 }, rotation: angle, position: { z: 24 } });
      assert.equal(resized.error, undefined);
      for (const x of [-999, 999]) for (const y of [-999, 999]) {
        const moved = moveObject(resized.stage, 'face', { space: 'stage', x, y, z: 24 });
        const face = moved.objects.find(o => o.id === 'face');
        for (const end of [-21, 21]) {
          const r = angle * Math.PI / 180;
          const px = face.position.x + end * Math.cos(r), py = face.position.y + end * Math.sin(r);
          assert.ok(px >= -1e-8 && px <= 480 + 1e-8);
          assert.ok(py >= -1e-8 && py <= 360 + 1e-8);
        }
        assert.equal(face.position.z, 24);
        assert.equal(moved.objects[0], original.objects[0]);
      }
    }
    assert.deepEqual(original, before);
    for (const [angle, step, expected] of [[-8, 15, 345], [22, 5, 20], [721.25, null, 1.25]]) {
      const face = editObject(original, 'face', { rotation: angle }, step).stage.objects.find(o => o.id === 'face');
      assert.equal(face.rotation, expected);
    }
  });
  test(type + ' rejects invalid dimensions, elevation and legacy geometry atomically', () => {
    const stage = addObject(createDefaultStage(), type, 'face');
    for (const key of ['faceWidth', 'faceHeight']) for (const value of [0, -1, NaN, Infinity]) {
      const result = editObject(stage, 'face', { geometry: { [key]: value }, position: { x: 200 } });
      assert.ok(result.error); assert.equal(result.stage, stage);
    }
    for (const edit of [{ geometry: { faceWidth: 9999 } }, { geometry: { depth: 24 } },
      { geometry: { width: 24 } }, { geometry: { height: 30 } }, { position: { z: -1 } },
      { position: { z: Infinity } }, { rotation: NaN }]) {
      const result = editObject(stage, 'face', edit);
      assert.ok(result.error); assert.equal(result.stage, stage);
    }
    const wide = editObject(stage, 'face', { geometry: { faceWidth: 470 } }).stage;
    assert.ok(editObject(wide, 'face', { rotation: 90 }).error);
    assert.equal(editObject(stage, 'face', { position: { z: 0 } }).error, undefined);
  });
  test(type + ' inspector parses face dimensions and elevation and preserves exact position edits', () => {
    const stage = addObject(createDefaultStage(), type, 'face');
    const object = stage.objects.find(o => o.id === 'face');
    assert.deepEqual(inspectorFields(object).map(f => f.key), ['x', 'y', 'rotation', 'faceWidth', 'faceHeight', 'z']);
    assert.deepEqual(parseInspectorEdit(object, inspectorValues(object)), { edit: {} });
    const draft = { ...inspectorValues(object), x: '123.125', y: '144.25', rotation: '22',
      faceWidth: '1 ft 8 in', faceHeight: '36 1/2', z: '2 ft' };
    const parsed = parseInspectorEdit(object, draft);
    assert.equal(parsed.error, undefined);
    const result = editObject(stage, 'face', parsed.edit, 5);
    assert.equal(result.error, undefined);
    const face = result.stage.objects.find(o => o.id === 'face');
    assert.deepEqual(face.geometry, { faceWidth: 20, faceHeight: 36.5 });
    assert.deepEqual(face.position, { space: 'stage', x: 123.125, y: 144.25, z: 24 });
    assert.equal(face.rotation, 20);
    for (const key of ['x', 'rotation', 'faceWidth', 'faceHeight', 'z']) {
      assert.ok(parseInspectorEdit(object, { ...draft, [key]: '' }).error);
      assert.ok(parseInspectorEdit(object, { ...draft, [key]: '1/0' }).error);
    }
  });
  test(type + ' snaps centers/endpoints, independent of elevation, face height and zoom', () => {
    const face = createObject(type, 'face', 50, 50);
    const other = createObject('noShootTarget', 'other', 100, 200);
    const stage = { ...createDefaultStage(), objects: [face, other] };
    const anchors = alignmentAnchors({ ...face, rotation: 90 });
    assert.equal(anchors.length, 3); near(anchors[1].y, 41); near(anchors[2].y, 59);
    const aligned = resolveMovement(stage, 'face', { ...face.position, x: 80, y: 49 }, DEFAULT_SNAPPING);
    assert.equal(aligned.position.x, 82);
    assert.ok(aligned.guides.some(g => g.axis === 'x' && g.value === 91));
    for (const zoom of [0.5, 1, 3]) for (const increment of [12, 6, 3]) {
      const t = transform(zoom, { x: 17, y: -39 });
      const a = C.stageToViewport(face.position, t), b = C.stageToViewport({ ...face.position, x: 124, y: 124 }, t);
      const raw = C.moveByViewportDelta(face.position, { x: b.x-a.x, y: b.y-a.y }, t);
      const snap = resolveMovement(stage, 'face', raw, { ...gridOnly, gridIncrement: increment });
      assert.equal(snap.position.x, snapToIncrement(124, increment));
      assert.equal(snap.position.z, 48);
      near(resolveMovement(stage, 'face', raw, { ...gridOnly, enabled: false }).position.x, 124);
    }
    const rotated = { ...stage, objects: [{ ...face, rotation: 45 }] };
    const edge = resolveMovement(rotated, 'face', { ...face.position, x: -100, y: -100 }, gridOnly);
    near(edge.position.x, 9 * Math.SQRT1_2); near(edge.position.y, 9 * Math.SQRT1_2);
    assert.deepEqual(edge.gridAxes, []);
  });
}
test('both target kinds retain unique IDs, independent removal, layers and fresh Reset defaults', () => {
  const original = createDefaultStage(), before = structuredClone(original), ids = new Set();
  let stage = original;
  for (let i = 0; i < 100; i++) for (const type of ['cardboardTarget', 'noShootTarget']) {
    const id = createObjectId(type, randomUUID);
    assert.ok(!ids.has(id)); ids.add(id);
    stage = addObject(stage, type, id);
    assert.throws(() => addObject(stage, type, id));
    stage = removeLastObject(stage, type);
  }
  assert.deepEqual(stage, original);
  stage = addObject(addObject(stage, 'noShootTarget', 'ns-1'), 'noShootTarget', 'ns-2');
  stage = addObject(stage, 'cardboardTarget', 'c-1');
  stage = removeLastObject(stage, 'noShootTarget');
  assert.ok(stage.objects.some(o => o.id === 'ns-1'));
  assert.ok(!stage.objects.some(o => o.id === 'ns-2'));
  assert.ok(stage.objects.some(o => o.id === 'c-1'));
  assert.ok(stage.objects.findIndex(o => o.id === 'c-1') < stage.objects.findIndex(o => o.type === 'wall'));
  stage = editObject(stage, 'target-1', { rotation: 45, geometry: { faceWidth: 24, faceHeight: 48 }, position: { z: 0 } }).stage;
  stage = removeLastObject(stage, 'cardboardTarget');
  stage = removeLastObject(stage, 'cardboardTarget');
  assert.deepEqual(createDefaultStage(), before);
  assert.deepEqual(original, before);
  assert.equal(before.objects.filter(o => o.type === 'cardboardTarget').length, 3);
  assert.equal(before.objects.filter(o => o.type === 'noShootTarget').length, 0);
  assert.notDeepEqual(stage, before);
});


for (const type of ['steelPlate', 'steelPopper']) {
  test(type + ' creates authoritative physical geometry and independent stable IDs', () => {
    const face = createObject(type, 'steel', 100, 120);
    assert.equal(face.type, type);
    assert.deepEqual(face.geometry, { faceWidth: 12, faceHeight: type === 'steelPlate' ? 12 : 42 });
    assert.deepEqual(face.position, { space: 'stage', x: 100, y: 120, z: type === 'steelPlate' ? 48 : 0 });
    assert.equal(face.rotation, 0);
    assert.deepEqual(footprint(face), { width: 12, depth: 0 });
    let stage = createDefaultStage();
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      const id = createObjectId(type, randomUUID);
      assert.ok(!ids.has(id)); ids.add(id);
      stage = addObject(stage, type, id);
      assert.throws(() => addObject(stage, type, id));
      stage = removeLastObject(stage, type);
    }
    assert.deepEqual(stage, createDefaultStage());
  });
  test(type + ' moves and rotates within physical endpoint bounds after resizing', () => {
    const original = addObject(createDefaultStage(), type, 'steel'), before = structuredClone(original);
    for (const angle of [0, 15, 45, 90, 135, 270, 359]) {
      const result = editObject(original, 'steel', { geometry: { faceWidth: 24, faceHeight: 48 }, position: { z: 18 }, rotation: angle });
      assert.equal(result.error, undefined);
      for (const x of [-999, 999]) for (const y of [-999, 999]) {
        const moved = moveObject(result.stage, 'steel', { space: 'stage', x, y, z: 18 });
        const face = moved.objects.find(o => o.id === 'steel');
        assert.deepEqual(face.geometry, { faceWidth: 24, faceHeight: 48 });
        assert.equal(face.position.z, 18); assert.equal(face.rotation, angle);
        assert.equal(moved.objects[0], original.objects[0]);
        for (const endpoint of alignmentAnchors(face)) {
          assert.ok(endpoint.x >= -1e-8 && endpoint.x <= 480 + 1e-8);
          assert.ok(endpoint.y >= -1e-8 && endpoint.y <= 360 + 1e-8);
        }
        const r = angle * Math.PI / 180;
        near(face.position.x, x < 0 ? 12 * Math.abs(Math.cos(r)) : 480 - 12 * Math.abs(Math.cos(r)));
        near(face.position.y, y < 0 ? 12 * Math.abs(Math.sin(r)) : 360 - 12 * Math.abs(Math.sin(r)));
      }
    }
    for (const [delta, step, expected] of [[-8, 15, 345], [22, 5, 20], [721.25, null, 1.25]]) {
      assert.equal(rotateObject(original, 'steel', delta, step).objects.find(o => o.id === 'steel').rotation, expected);
    }
    assert.deepEqual(original, before);
  });
  test(type + ' inspector supports exact positions, dimensions and bottom elevation with atomic validation', () => {
    const stage = addObject(createDefaultStage(), type, 'steel');
    const face = stage.objects.find(o => o.id === 'steel');
    const fields = inspectorFields(face);
    assert.deepEqual(fields.map(f => f.key), ['x', 'y', 'rotation', 'faceWidth', 'faceHeight', 'z']);
    assert.equal(fields.find(f => f.key === 'faceHeight').label, type === 'steelPopper' ? 'Overall height' : 'Face height');
    assert.deepEqual(parseInspectorEdit(face, inspectorValues(face)), { edit: {} });
    const draft = { ...inspectorValues(face), x: '123.125', y: '144.25', rotation: '22', faceWidth: '1 ft 6 in', faceHeight: '36 1/2', z: '2 ft' };
    const parsed = parseInspectorEdit(face, draft);
    assert.equal(parsed.error, undefined);
    const result = editObject(stage, 'steel', parsed.edit, 5);
    assert.equal(result.error, undefined);
    const edited = result.stage.objects.find(o => o.id === 'steel');
    assert.deepEqual(edited.geometry, { faceWidth: 18, faceHeight: 36.5 });
    assert.deepEqual(edited.position, { space: 'stage', x: 123.125, y: 144.25, z: 24 });
    assert.equal(edited.rotation, 20);
    for (const key of ['x', 'y', 'rotation', 'faceWidth', 'faceHeight', 'z']) {
      for (const invalid of ['', '1/0', 'Infinity']) assert.ok(parseInspectorEdit(face, { ...draft, [key]: invalid }).error);
    }
    for (const key of ['faceWidth', 'faceHeight']) for (const value of [0, -1, NaN, Infinity]) {
      const rejected = editObject(stage, 'steel', { geometry: { [key]: value }, position: { x: 200 } });
      assert.ok(rejected.error); assert.equal(rejected.stage, stage);
    }
    for (const edit of [{ position: { z: -1 } }, { position: { z: NaN } }, { rotation: Infinity },
      { geometry: { width: 20 } }, { geometry: { height: 20 } }, { geometry: { depth: 1 } },
      { geometry: { faceWidth: 9999 } }]) {
      const rejected = editObject(stage, 'steel', edit);
      assert.ok(rejected.error); assert.equal(rejected.stage, stage);
    }
    const wide = editObject(stage, 'steel', { geometry: { faceWidth: 470 } }).stage;
    assert.ok(editObject(wide, 'steel', { rotation: 90 }).error);
    const vertical = editObject(stage, 'steel', { geometry: { faceHeight: 100 }, position: { z: 0 } });
    assert.equal(vertical.error, undefined);
    assert.deepEqual(footprint(vertical.stage.objects.find(o => o.id === 'steel')), footprint(face));
  });
  test(type + ' snaps centers and rotated endpoints using physical geometry at every zoom', () => {
    const face = createObject(type, 'steel', 50, 50), other = createObject('wall', 'wall', 150, 200);
    const stage = { ...createDefaultStage(), objects: [face, other] };
    const anchors = alignmentAnchors({ ...face, rotation: 90 });
    assert.equal(anchors.length, 3); near(anchors[1].y, 44); near(anchors[2].y, 56);
    const aligned = resolveMovement(stage, 'steel', { ...face.position, x: 95, y: 49 }, DEFAULT_SNAPPING);
    assert.equal(aligned.position.x, 96);
    assert.ok(aligned.guides.some(g => g.axis === 'x' && g.value === 102));
    const centered = resolveMovement(stage, 'steel', { ...face.position, x: 149, y: 49 }, DEFAULT_SNAPPING);
    assert.equal(centered.position.x, 150);
    for (const zoom of [0.5, 1, 3]) for (const increment of [12, 6, 3]) {
      const t = transform(zoom, { x: 17, y: -39 });
      const a = C.stageToViewport(face.position, t), b = C.stageToViewport({ ...face.position, x: 124, y: 124 }, t);
      const raw = C.moveByViewportDelta(face.position, { x: b.x-a.x, y: b.y-a.y }, t);
      const snap = resolveMovement(stage, 'steel', raw, { ...gridOnly, gridIncrement: increment });
      assert.equal(snap.position.x, snapToIncrement(124, increment)); assert.equal(snap.position.z, face.position.z);
      near(resolveMovement(stage, 'steel', raw, { ...gridOnly, enabled: false }).position.x, 124);
    }
    const rotated = { ...stage, objects: [{ ...face, rotation: 45 }] };
    const edge = resolveMovement(rotated, 'steel', { ...face.position, x: -100, y: -100 }, gridOnly);
    near(edge.position.x, 6 * Math.SQRT1_2); near(edge.position.y, 6 * Math.SQRT1_2);
    assert.deepEqual(edge.gridAxes, []);
  });
}
test('steel removal is per type and Reset restores the existing seven-object layout', () => {
  const original = createDefaultStage(), before = structuredClone(original);
  let stage = addObject(addObject(original, 'steelPlate', 'plate-1'), 'steelPlate', 'plate-2');
  stage = addObject(addObject(stage, 'steelPopper', 'popper-1'), 'steelPopper', 'popper-2');
  stage = addObject(stage, 'faultLine', 'line');
  stage = removeLastObject(stage, 'steelPlate');
  assert.ok(!stage.objects.some(o => o.id === 'plate-2'));
  assert.ok(stage.objects.some(o => o.id === 'plate-1'));
  assert.ok(stage.objects.some(o => o.id === 'popper-2'));
  stage = removeLastObject(stage, 'steelPopper');
  assert.ok(!stage.objects.some(o => o.id === 'popper-2'));
  assert.ok(stage.objects.some(o => o.id === 'popper-1'));
  assert.ok(stage.objects.findIndex(o => o.id === 'popper-1') < stage.objects.findIndex(o => o.id === 'line'));
  stage = editObject(stage, 'popper-1', { geometry: { faceHeight: 60 }, position: { z: 12 }, rotation: 45 }).stage;
  stage = removeLastObject(stage, 'cardboardTarget');
  assert.notDeepEqual(stage, before);
  assert.deepEqual(createDefaultStage(), before); assert.deepEqual(original, before);
  assert.equal(before.schemaVersion, 7); assert.equal(before.objects.length, 7);
  assert.ok(before.objects.every(o => o.type !== 'steelPlate' && o.type !== 'steelPopper'));
});


const { createPort, validatePorts, parsePortDraft, portValues } = require('../src/stage/ports.ts');
const { createPortId } = require('../src/stage/ids.ts');
test('ports belong to walls, support multiple stable IDs, and never enter StageObjects', () => {
  const original = createDefaultStage(), wall = original.objects.find(o => o.id === 'wall-1');
  assert.deepEqual(wall.ports, []);
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    const id = createPortId(randomUUID); assert.ok(!ids.has(id)); ids.add(id);
  }
  const ports = [createPort(wall.geometry, [...ids][0]), { ...createPort(wall.geometry, [...ids][1]), offset: 30 }];
  assert.deepEqual(ports[0], { id: ports[0].id, offset: 0, width: 24, height: 24, sill: 36 });
  const result = editObject(original, wall.id, { ports });
  assert.equal(result.error, undefined); assert.equal(result.stage.objects.length, original.objects.length);
  assert.deepEqual(result.stage.objects.find(o => o.id === wall.id).ports, ports);
  assert.deepEqual(wall.ports, []);
  assert.ok(editObject(result.stage, 'wall-2', { ports: [ports[0]] }).error);
  assert.ok(editObject(original, 'target-1', { ports: [] }).error);
  assert.ok(editObject(original, wall.id, { ports: [ports[0], ports[0]] }).error);
  assert.ok(editObject(original, wall.id, { ports: [{ ...ports[0], id: '' }] }).error);
});
test('port inspector edits offset, dimensions and local sill atomically with stable identity', () => {
  const original = createDefaultStage(), wall = original.objects.find(o => o.id === 'wall-1');
  const port = createPort(wall.geometry, 'port-1'), other = { ...port, id: 'port-2', offset: -30 };
  let stage = editObject(original, wall.id, { ports: [port, other] }).stage;
  const parsed = parsePortDraft(port, { offset: '1 ft', width: '18 1/2', height: '2 ft', sill: '3 ft' });
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.port, { id: port.id, offset: 12, width: 18.5, height: 24, sill: 36 });
  const result = editObject(stage, wall.id, { ports: [parsed.port, other] });
  assert.equal(result.error, undefined);
  const updated = result.stage.objects.find(o => o.id === wall.id);
  assert.deepEqual(updated.ports[0], parsed.port); assert.equal(updated.ports[1], other);
  for (const field of ['offset', 'width', 'height', 'sill']) for (const value of ['', 'Infinity', '1/0']) {
    assert.ok(parsePortDraft(port, { ...portValues(port), [field]: value }).error);
  }
  stage = editObject(result.stage, wall.id, { ports: [other] }).stage;
  assert.deepEqual(stage.objects.find(o => o.id === wall.id).ports, [other]);
});
test('invalid port geometry and wall resizes cannot partially mutate the document', () => {
  const original = createDefaultStage(), wall = original.objects.find(o => o.id === 'wall-1');
  const port = createPort(wall.geometry, 'port-1');
  const stage = editObject(original, wall.id, { ports: [port] }).stage, before = structuredClone(stage);
  for (const edit of [{ width: 0 }, { width: -1 }, { height: 0 }, { height: -1 },
    { width: Infinity }, { height: NaN }, { offset: Infinity }, { sill: NaN }, { sill: -1 },
    { offset: 37 }, { offset: -37 }, { width: 97 }, { sill: 49 }, { height: 37 }]) {
    const result = editObject(stage, wall.id, { position: { x: 200 }, geometry: { thickness: 8 }, ports: [{ ...port, ...edit }] });
    assert.ok(result.error, JSON.stringify(edit)); assert.equal(result.stage, stage);
  }
  for (const geometry of [{ length: 23 }, { height: 59 }]) {
    const result = editObject(stage, wall.id, { position: { x: 200 }, geometry });
    assert.ok(result.error); assert.equal(result.stage, stage);
  }
  // Validation also permits an atomic wall-and-port resize that leaves both valid.
  const resized = editObject(stage, wall.id, { geometry: { length: 12, height: 12 }, ports: [{ ...port, width: 12, height: 12, sill: 0 }] });
  assert.equal(resized.error, undefined);
  assert.deepEqual(stage, before);
  for (const offset of [-36, 36]) assert.equal(validatePorts(wall.geometry, [{ ...port, offset, sill: 48 }]), null);
  const small = { length: 4, thickness: 1, height: 3 };
  assert.equal(validatePorts(small, [createPort(small, 'small')]), null);
});
test('wall translation, elevation and rotation preserve port local geometry and IDs', () => {
  const original = createDefaultStage(), wall = original.objects.find(o => o.id === 'wall-1');
  const ports = [{ ...createPort(wall.geometry, 'port'), offset: 18 }];
  const stage = editObject(original, wall.id, { ports }).stage;
  const moved = moveObject(stage, wall.id, { space: 'stage', x: 200, y: 200, z: 12 });
  const translated = moved.objects.find(o => o.id === wall.id);
  assert.equal(translated.ports, ports); assert.equal(translated.position.z + ports[0].sill, 48);
  for (const angle of [15, 90, 180, 270, 359]) {
    const rotated = rotateObject(moved, wall.id, angle).objects.find(o => o.id === wall.id);
    assert.equal(rotated.ports, ports); assert.equal(rotated.ports[0].offset, 18);
    assert.equal(rotated.rotation, angle);
  }
  assert.deepEqual(stage.objects.find(o => o.id === wall.id).position, wall.position);
});
test('Reset restores empty wall ports and removing walls removes their owned ports', () => {
  const original = createDefaultStage(), before = structuredClone(original);
  const wall = original.objects.find(o => o.id === 'wall-3');
  let stage = editObject(original, wall.id, { ports: [createPort(wall.geometry, 'port')] }).stage;
  assert.equal(stage.objects.find(o => o.id === wall.id).ports.length, 1);
  stage = removeLastObject(stage, 'wall');
  assert.ok(!stage.objects.some(o => o.id === wall.id));
  assert.deepEqual(createDefaultStage(), before); assert.deepEqual(original, before);
  assert.equal(before.schemaVersion, 7);
  const fresh = createDefaultStage();
  for (const w of fresh.objects.filter(o => o.type === 'wall')) {
    assert.deepEqual(w.ports, []); assert.notEqual(w.ports, before.objects.find(o => o.id === w.id).ports);
  }
});


const { activeFaceExtent, facePresets } = require('../src/stage/targetFace.ts');
for (const type of ['cardboardTarget', 'noShootTarget']) {
  test(type + ' physical presets preserve identity/reference while changing actual face geometry', () => {
    const object = { ...createObject(type, 'cut', 120, 120), rotation: 35 };
    const stage = { ...createDefaultStage(), objects: [object] };
    const expected = {
      full: [-9, 9, 0, 30], upper: [-9, 9, 15, 30], lower: [-9, 9, 0, 15],
      left: [-9, 0, 0, 30], right: [0, 9, 0, 30],
    };
    for (const { preset } of facePresets) {
      const result = editObject(stage, 'cut', { faceCut: { kind: 'preset', preset } });
      assert.equal(result.error, undefined);
      const face = result.stage.objects[0], ext = activeFaceExtent(face);
      assert.deepEqual([ext.left, ext.right, ext.bottom, ext.top], expected[preset]);
      assert.equal(face.id, object.id); assert.equal(face.type, type);
      assert.equal(face.rotation, object.rotation); assert.deepEqual(face.position, object.position);
      assert.deepEqual(face.geometry, object.geometry);
      assert.equal((ext.right-ext.left)*(ext.top-ext.bottom), preset === 'full' ? 540 : 270);
      assert.equal(footprint(face).width, preset === 'left' || preset === 'right' ? 9 : 18);
    }
    assert.deepEqual(object.faceCut, { kind: 'preset', preset: 'full' });
  });
  test(type + ' rotated asymmetric material stays inside stage boundaries and snapping uses active anchors', () => {
    for (const { preset } of facePresets) for (const angle of [0, 45, 90, 180, 270, 359]) {
      const face = { ...createObject(type, 'cut', 120, 120), faceCut: { kind: 'preset', preset }, rotation: angle };
      const stage = { ...createDefaultStage(), objects: [face] };
      const ext = activeFaceExtent(face), r = angle * Math.PI / 180;
      const anchors = alignmentAnchors(face);
      assert.equal(anchors.length, 3);
      for (const [i, x] of [[0, (ext.left+ext.right)/2], [1, ext.left], [2, ext.right]]) {
        near(anchors[i].x, 120+x*Math.cos(r)); near(anchors[i].y,120+x*Math.sin(r));
      }
      for (const x of [-999, 999]) for (const y of [-999, 999]) {
        const snap = resolveMovement(stage, 'cut', { ...face.position, x, y }, gridOnly);
        const moved = moveObject(stage, 'cut', snap.position).objects[0];
        for (const local of [ext.left, ext.right]) {
          const px=moved.position.x+local*Math.cos(r), py=moved.position.y+local*Math.sin(r);
          assert.ok(px>=-1e-8 && px<=480+1e-8); assert.ok(py>=-1e-8 && py<=360+1e-8);
        }
        assert.deepEqual(moved.faceCut, face.faceCut); assert.equal(moved.position.z,face.position.z);
      }
      assert.deepEqual(rotateObject(stage, 'cut', 15).objects[0].faceCut, face.faceCut);
    }
    const moving = { ...createObject(type, 'cut', 50, 50), faceCut: { kind: 'preset', preset: 'right' } };
    const wall = createObject('wall', 'wall', 150, 200);
    const stage = { ...createDefaultStage(), objects: [moving, wall] };
    const snapped = resolveMovement(stage, 'cut', { ...moving.position, x: 92, y: 50 }, DEFAULT_SNAPPING);
    near(snapped.position.x, 93);
    assert.ok(snapped.guides.some(g => g.axis === 'x' && g.value === 102));
  });
  test(type + ' rejects invalid presets and out-of-bounds restoration without moving the reference', () => {
    const face = { ...createObject(type, 'cut', 0, 120), faceCut: { kind: 'preset', preset: 'right' } };
    const stage = { ...createDefaultStage(), objects: [face] }, before = structuredClone(stage);
    for (const faceCut of [null, 'Upper Portion', { kind: 'preset', preset: 'bad' }, { kind: 'polygon', preset: 'full' },
      { kind: 'preset', preset: 'full', occluded: true }, { kind: 'preset', preset: 'full' }]) {
      const result = editObject(stage, 'cut', { faceCut });
      assert.ok(result.error); assert.equal(result.stage, stage);
    }
    for (const geometry of [{ faceWidth: 0 }, { faceHeight: -1 }, { faceWidth: Infinity }]) {
      const result = editObject(stage, 'cut', { geometry, faceCut: { kind: 'preset', preset: 'right' } });
      assert.ok(result.error); assert.equal(result.stage, stage);
    }
    const inside = moveObject(stage, 'cut', { ...face.position, x: 120 });
    assert.equal(editObject(inside, 'cut', { faceCut: { kind: 'preset', preset: 'full' } }).error, undefined);
    assert.deepEqual(stage, before);
  });
}
test('cut geometry is exclusive to paper roles and Reset returns fresh full faces', () => {
  const original = createDefaultStage(), before = structuredClone(original);
  for (const type of ['steelPlate', 'steelPopper', 'wall', 'faultLine', 'start']) {
    const stage = { ...original, objects: [createObject(type, 'other', 120, 120)] };
    assert.ok(editObject(stage, 'other', { faceCut: { kind: 'preset', preset: 'left' } }).error);
  }
  let changed = editObject(original, 'target-1', { faceCut: { kind: 'preset', preset: 'upper' } }).stage;
  changed = addObject(changed, 'noShootTarget', 'ns');
  changed = editObject(changed, 'ns', { faceCut: { kind: 'preset', preset: 'lower' } }).stage;
  assert.notDeepEqual(changed, original);
  assert.deepEqual(createDefaultStage(), before); assert.deepEqual(original, before);
  assert.equal(before.schemaVersion, 7);
});


const { deleteObject, duplicateObject } = require('../src/stage/operations.ts');
const { applyObjectAction, validSelection, objectPalette } = require('../src/editor/objectActions.ts');
for (const { type } of objectPalette) {
  test(type + ' palette create/select, duplicate physical properties, and selected delete', () => {
    const original = createDefaultStage(), before = structuredClone(original);
    const created = applyObjectAction(original, 'start-1', { kind: 'create', type }, randomUUID);
    const id = created.selectedId;
    assert.ok(id); assert.equal(validSelection(created.stage, id), id);
    let object = created.stage.objects.find(o => o.id === id);
    assert.equal(object.type, type); assert.equal(object.position.x, 240); assert.equal(object.position.y, 180);
    const edits = { rotation: 35, position: { z: type === 'faultLine' ? 0 : 12 } };
    if (type === 'cardboardTarget' || type === 'noShootTarget') edits.faceCut = { kind: 'preset', preset: 'right' };
    if (type === 'wall') edits.ports = [{ id: 'child-a', offset: -18, width: 12, height: 12, sill: 24 }, { id: 'child-b', offset: 18, width: 12, height: 24, sill: 36 }];
    const edited = editObject(created.stage, id, edits);
    assert.equal(edited.error, undefined); object = edited.stage.objects.find(o => o.id === id);
    const duplicate = applyObjectAction(edited.stage, id, { kind: 'duplicate' }, randomUUID);
    assert.equal(duplicate.error, undefined);
    const copy = duplicate.stage.objects.find(o => o.id === duplicate.selectedId);
    assert.notEqual(copy.id, id); assert.equal(copy.type, type); assert.equal(copy.rotation, 35);
    assert.equal(copy.position.z, object.position.z); assert.deepEqual(copy.geometry, object.geometry);
    assert.notEqual(copy.geometry, object.geometry); assert.notEqual(copy.position, object.position);
    near(copy.position.x, object.position.x + 12); near(copy.position.y, object.position.y + 12);
    if (object.faceCut) { assert.deepEqual(copy.faceCut, object.faceCut); assert.notEqual(copy.faceCut, object.faceCut); }
    if (object.ports) {
      assert.equal(copy.ports.length, 2);
      assert.equal(new Set([...copy.ports, ...object.ports].map(p => p.id)).size, 4);
      copy.ports.forEach((p, i) => {
        assert.deepEqual({ ...p, id: object.ports[i].id }, object.ports[i]); assert.notEqual(p, object.ports[i]);
      });
    }
    // Delete the source, which is not the most recently added object of its type.
    const deleted = applyObjectAction(duplicate.stage, id, { kind: 'delete' }, randomUUID);
    assert.equal(deleted.selectedId, null); assert.ok(!deleted.stage.objects.some(o => o.id === id));
    assert.ok(deleted.stage.objects.some(o => o.id === copy.id));
    assert.equal(validSelection(deleted.stage, id), null); assert.deepEqual(original, before);
    assert.ok(!('selectedId' in deleted.stage));
    const edge = moveObject(edited.stage, id, { ...object.position, x: 999, y: 999 });
    const bounded = applyObjectAction(edge, id, { kind: 'duplicate' }, randomUUID);
    const boundedCopy = bounded.stage.objects.find(o => o.id === bounded.selectedId);
    assert.deepEqual(constrainPosition(boundedCopy, boundedCopy.position, bounded.stage.stage), boundedCopy.position);
    assert.notDeepEqual(boundedCopy.position, edge.objects.find(o => o.id === id).position);
  });
}
test('required start and stale selections are protected; duplicate IDs are rejected atomically', () => {
  const stage = createDefaultStage();
  assert.equal(deleteObject(stage, 'start-1'), stage); assert.equal(deleteObject(stage, 'missing'), stage);
  for (const kind of ['delete', 'duplicate']) {
    const start = applyObjectAction(stage, 'start-1', { kind }, randomUUID);
    assert.equal(start.stage, stage); assert.equal(start.selectedId, 'start-1');
    const missing = applyObjectAction(stage, 'missing', { kind }, randomUUID);
    assert.equal(missing.stage, stage); assert.equal(missing.selectedId, null);
  }
  assert.ok(duplicateObject(stage, 'start-1', 'copy').error);
  assert.ok(duplicateObject(stage, 'wall-1', 'wall-2').error);
  const withPort = editObject(stage, 'wall-1', { ports: [{ id: 'child', offset: 0, width: 12, height: 12, sill: 0 }] }).stage;
  for (const [id, ports] of [['new', []], ['new', ['child']], ['new', ['new']], ['', ['fresh']]]) {
    const result = duplicateObject(withPort, 'wall-1', id, ports); assert.ok(result.error); assert.equal(result.stage, withPort);
  }
});
test('repeated palette create/duplicate/delete keeps IDs, starts, bounds and selection valid; Reset clears selection', () => {
  let state = { stage: createDefaultStage(), selectedId: null };
  for (let i = 0; i < 20; i++) for (const { type } of objectPalette) {
    state = applyObjectAction(state.stage, state.selectedId, { kind: 'create', type }, randomUUID);
    const source = state.selectedId;
    state = applyObjectAction(state.stage, source, { kind: 'duplicate' }, randomUUID);
    assert.equal(validSelection(state.stage, state.selectedId), state.selectedId);
    const ids = state.stage.objects.map(o => o.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(state.stage.objects.filter(o => o.type === 'start').length, 1);
    for (const object of state.stage.objects) assert.deepEqual(constrainPosition(object, object.position, state.stage.stage), object.position);
    state = applyObjectAction(state.stage, state.selectedId, { kind: 'delete' }, randomUUID);
    state = applyObjectAction(state.stage, source, { kind: 'delete' }, randomUUID);
  }
  assert.deepEqual(state.stage, createDefaultStage()); assert.equal(state.selectedId, null);
  state = applyObjectAction(state.stage, null, { kind: 'create', type: 'wall' }, randomUUID);
  state = applyObjectAction(state.stage, state.selectedId, { kind: 'reset' }, randomUUID);
  assert.deepEqual(state, { stage: createDefaultStage(), selectedId: null });
});


const { projectPoint, localToWorld, objectSurfaces, wallSurfaces, stageSurfaces, stageSvg } = require('../src/stage/projection.ts');
test('2.5D projection maps ground axes and elevation consistently across camera rotation', () => {
  assert.deepEqual(projectPoint({x:0,y:0,z:0},0), {x:0,y:0,depth:0});
  near(projectPoint({x:12,y:0,z:0},0).x,12);
  near(projectPoint({x:0,y:12,z:0},0).y,6);
  const low=projectPoint({x:120,y:60,z:0}), high=projectPoint({x:120,y:60,z:48});
  near(high.x,low.x); near(high.y,low.y-48*Math.sqrt(3)/2);
  near(projectPoint({x:12,y:0,z:0},90).y,6);
});
test('2.5D wall local endpoints and port openings follow wall rotation and elevation', () => {
  const wall={...createObject('wall','wall',100,120),rotation:90,position:{space:'stage',x:100,y:120,z:12},
    ports:[{id:'port',offset:12,width:24,height:24,sill:24}]};
  const left=localToWorld(wall,-48,0,0), right=localToWorld(wall,48,0,72);
  near(left.x,100); near(left.y,72); near(left.z,12);
  near(right.x,100); near(right.y,168); near(right.z,84);
  const portBottom=localToWorld(wall,12,0,24);
  near(portBottom.x,100); near(portBottom.y,132); near(portBottom.z,36);
  assert.equal(wallSurfaces(wall).some(face=>face.points.some(p=>p.z===36)),true);
  assert.deepEqual(wall.ports,[{id:'port',offset:12,width:24,height:24,sill:24}]);
});
test('2.5D walls have actual empty port area, exposed reveals and overlapping-port union', () => {
  const wall={...createObject('wall','wall',0,0),ports:[{id:'a',offset:0,width:24,height:24,sill:24}]};
  const surfaces=wallSurfaces(wall);
  const front=surfaces.filter(s=>s.points.every(p=>p.y===-2));
  const area=front.reduce((sum,s)=>sum+(Math.max(...s.points.map(p=>p.x))-Math.min(...s.points.map(p=>p.x)))*
    (Math.max(...s.points.map(p=>p.z))-Math.min(...s.points.map(p=>p.z))),0);
  near(area,96*72-24*24);
  assert.ok(front.every(s=> {
    const x=s.points.reduce((n,p)=>n+p.x,0)/4,z=s.points.reduce((n,p)=>n+p.z,0)/4;
    return !(x>-12 && x<12 && z>24 && z<48);
  }));
  assert.ok(surfaces.some(s=>s.points.every(p=>p.z===24) && s.points.some(p=>p.y===2) && s.points.some(p=>p.y===-2)));
  const overlapping={...wall,ports:[...wall.ports,{id:'b',offset:12,width:24,height:24,sill:24}]};
  const overlappingArea=wallSurfaces(overlapping).filter(s=>s.points.every(p=>p.y===-2)).reduce((sum,s)=>
    sum+(Math.max(...s.points.map(p=>p.x))-Math.min(...s.points.map(p=>p.x)))*
    (Math.max(...s.points.map(p=>p.z))-Math.min(...s.points.map(p=>p.z))),0);
  near(overlappingArea,96*72-36*24);
});
test('2.5D paper target projection uses every physical cut and bottom reference for both roles', () => {
  for(const type of ['cardboardTarget','noShootTarget']) for(const {preset} of facePresets) {
    const object={...createObject(type,'face',120,140),rotation:90,faceCut:{kind:'preset',preset}};
    const f=activeFaceExtent(object), points=objectSurfaces(object)[0].points;
    assert.equal(points.length,4);
    near(Math.min(...points.map(p=>p.z)),48+f.bottom); near(Math.max(...points.map(p=>p.z)),48+f.top);
    near(Math.min(...points.map(p=>p.y)),140+f.left); near(Math.max(...points.map(p=>p.y)),140+f.right);
    assert.ok(points.every(p=>Math.abs(p.x-120)<1e-8));
    const projected=points.map(p=>projectPoint(p,30)); assert.ok(projected.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  }
});
test('2.5D renders every kind, physical ground size, steel extents and selection without mutating stage', () => {
  let stage=createDefaultStage();
  for(const type of ['steelPlate','steelPopper','faultLine','noShootTarget']) stage=addObject(stage,type,type);
  const before=structuredClone(stage);
  const ground=stageSurfaces(stage)[0];
  assert.deepEqual(ground.points[2],{x:480,y:360,z:0});
  for(const object of stage.objects) {
    const surfaces=objectSurfaces(object); assert.ok(surfaces.length>0);
    if(object.type==='steelPlate'||object.type==='steelPopper') {
      const points=surfaces.flatMap(s=>s.points);
      near(Math.max(...points.map(p=>p.z))-Math.min(...points.map(p=>p.z)),object.geometry.faceHeight);
      near(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),object.geometry.faceWidth);
    }
  }
  for(const yaw of [0,45,90,180,270]) {
    const svg=stageSvg(stage,yaw,1,'wall-1');
    assert.ok(svg.includes('<polygon')); assert.ok(svg.includes('#007aff')); assert.ok(svg.includes('START'));
    assert.ok(!svg.includes('NaN')); assert.ok(!svg.includes('Infinity'));
  }
  assert.deepEqual(stage,before);
});
