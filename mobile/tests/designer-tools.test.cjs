const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module,file) => module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,file);
const { targetPresets, targetPreset, presetsForFamily, defaultTargetPreset } = require('../src/stage/targetPresets.ts');
const { placeTarget, rotateTarget, angularDelta, targetScreenSize } = require('../src/stage/targetPlacement.ts');
const { validOutline } = require('../src/stage/targetShape.ts');
const { presetFacePoints } = require('../src/stage/presetFace.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { addSegment, setEndpoints, endpoints, editSegmentMetrics, snapEndpoint, validSavedEndpoints } = require('../src/stage/segments.ts');
const { moveObject, duplicateObject, deleteObject } = require('../src/stage/operations.ts');
const { DEFAULT_SNAPPING } = require('../src/stage/snapping.ts');
const { createViewportTransform, stageToViewport, viewportToStage } = require('../src/stage/coordinates.ts');
const { startTap, trackTap, deliberateTap } = require('../src/editor/designerTools.ts');
const { history, record, begin, end, undo, redo } = require('../src/editor/history.ts');
const { Repository } = require('../src/storage/repository.ts');
const { createPlan } = require('../src/planning/model.ts');
const point=(x,y,z=0)=>({space:'stage',x,y,z});
const blank=()=>({...createDefaultStage(),objects:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
const preset='pcsl-mini-practical-2025-v1';
const placed=()=>placeTarget(blank(),preset,'t',point(100.125,120.375)).stage;

test('preset IDs are unique, stable lookups have finite physical sizes and provenance',()=>{
 assert.equal(new Set(targetPresets.map(p=>p.id)).size,targetPresets.length);
 for(const p of targetPresets){assert.equal(targetPreset(p.id),p);assert.ok(p.width>0&&p.height>0);assert.ok(validOutline(p.outline));assert.match(p.source,/^https:/);assert.ok(p.reference);assert.ok(['verified','approximate','unverified'].includes(p.verification));}
 assert.equal(targetPreset('unknown'),undefined);
});
for(const family of ['USPSA','PCSL','IDPA'])test(family+' defaults to its own paper preset with multiple variants',()=>{
 const items=presetsForFamily(family);assert.ok(items.length>=3);assert.ok(items.every(p=>p.family===family));assert.equal(defaultTargetPreset(family),items[0]);assert.equal(items[0].type,'cardboardTarget');
});
test('published dimensions remain fractional inches; half-scale PCSL is physically half',()=>{
 assert.deepEqual([targetPreset('uspsa-metric-chl-v1').width,targetPreset('uspsa-metric-chl-v1').height],[18.12,29.93]);
 assert.deepEqual([targetPreset('idpa-standard-2026-v1').width,targetPreset('idpa-standard-2026-v1').height],[18.125,30.75]);
 const mini=targetPreset(preset),full=targetPreset('pcsl-practical-2025-v1');assert.equal(mini.width*2,full.width);assert.equal(mini.height*2,full.height);
});
test('each deliberate placement appends a fresh target with an independent saved snapshot',()=>{
 let stage=blank();for(let i=0;i<4;i++)stage=placeTarget(stage,preset,'t'+i,point(50+i*20.125,90)).stage;
 assert.equal(stage.objects.length,4);for(const t of stage.objects){assert.equal(t.presetId,preset);assert.deepEqual(t.geometry,{faceWidth:9,faceHeight:12});assert.equal(t.targetFamily,'PCSL');assert.notEqual(t.outline,targetPreset(preset).outline);}
 assert.notEqual(stage.objects[0].outline,stage.objects[1].outline);assert.equal(stage.objects[1].position.x,70.125);
});
test('placement rejects duplicate IDs, unknown presets, nonfinite and outside coordinates atomically',()=>{
 const s=placed();for(const [p,id,pos] of [[preset,'t',point(10,10)],['unknown','new',point(10,10)],[preset,'new',point(NaN,10)],[preset,'new',point(-1,10)]]){const r=placeTarget(s,p,id,pos);assert.ok(r.error);assert.equal(r.stage,s);}
});
test('paper no-shoot retains same preset and dimensions; steel does not become paper',()=>{
 const ns=placeTarget(blank(),preset,'ns',point(20,30),true).stage.objects[0];assert.equal(ns.type,'noShootTarget');assert.equal(ns.presetId,preset);assert.equal(ns.geometry.faceHeight,12);
 const steel=placeTarget(blank(),'idpa-round-8-v1','s',point(20,30),true).stage.objects[0];assert.equal(steel.type,'steelPlate');
});
test('target rendering scales both face dimensions without a visible minimum size',()=>{
 const t=placed().objects[0];assert.deepEqual(targetScreenSize(t,.1),{width:.9,height:1.2000000000000002});assert.deepEqual(targetScreenSize(t,2),{width:18,height:24});
});
test('pan/zoom and inverse transforms never change saved geometry',()=>{
 const s=placed(),snapshot=JSON.stringify(s),pos=s.objects[0].position;
 for(const zoom of [.5,1,3])for(const pan of [{x:0,y:0},{x:67.5,y:-29}]){const t=createViewportTransform(s.stage,{width:390,height:500},{zoom,pan});const result=viewportToStage(stageToViewport(pos,t),t,pos.z);near(result.x,pos.x);near(result.y,pos.y);assert.equal(JSON.stringify(s),snapshot);near(targetScreenSize(s.objects[0],t.scale).width,9*t.scale);}
});
test('only short unmoved single-touch gestures are deliberate target taps',()=>{
 assert.equal(deliberateTap(startTap(1,100),200),true);assert.equal(deliberateTap(startTap(1,100),601),false);
 let intent=trackTap(startTap(1,100),1,20,0);intent=trackTap(intent,1,0,0);assert.equal(deliberateTap(intent,200),false);
 intent=trackTap(startTap(1,100),2,0,0);intent=trackTap(intent,1,0,0);assert.equal(deliberateTap(intent,200),false);assert.equal(deliberateTap(startTap(2,100),200),false);
});
test('target rotation normalizes positive and negative angles and preserves the exact anchor at an edge',()=>{
 const s=placeTarget(blank(),preset,'t',point(.125,.375)).stage;
 for(const [input,expected] of [[360,0],[721.5,1.5],[-1,359]]){const r=rotateTarget(s,'t',input);assert.equal(r.stage.objects[0].rotation,expected);assert.deepEqual(r.stage.objects[0].position,s.objects[0].position);}
 for(const value of [NaN,Infinity])assert.equal(rotateTarget(s,'t',value).stage,s);
});
test('rotation wheel crosses 359/0 smoothly in both directions',()=>{
 assert.equal(angularDelta(359,1),2);assert.equal(angularDelta(1,359),-2);assert.equal(angularDelta(-179,179),-2);
 let s=rotateTarget(placed(),'t',359).stage;s=rotateTarget(s,'t',s.objects[0].rotation+angularDelta(359,1)).stage;assert.equal(s.objects[0].rotation,1);
});
for(const type of ['wall','faultLine'])test(type+' stores precise physical endpoints and length',()=>{
 const r=addSegment(blank(),type,'s',point(10.125,20.25),point(40.125,60.25));assert.equal(r.error,undefined);const o=r.stage.objects[0];assert.equal(o.geometry.length,50);assert.equal(o.type,type);assert.deepEqual(endpoints(o),{start:point(10.125,20.25),end:point(40.125,60.25)});assert.ok(validSavedEndpoints(o));
 if(type==='faultLine')assert.deepEqual(Object.keys(o.geometry),['length']);
});
for(const [name,input,expected] of [['horizontal',point(110,51),point(110,50)],['vertical',point(51,110),point(50,110)],['diagonal',point(110,109),point(109.5,109.5)]])test(name+' uses strong angle snapping before grid',()=>{
 const r=snapEndpoint(blank(),input,point(50,50),DEFAULT_SNAPPING);near(r.point.x,expected.x);near(r.point.y,expected.y);assert.match(r.rule,/Angle/);
});
test('nearby existing endpoints win over angle and grid',()=>{
 const s=addSegment(blank(),'wall','w',point(101.25,51.75),point(140,80)).stage;
 const r=snapEndpoint(s,point(101,51),point(50,50),DEFAULT_SNAPPING);assert.equal(r.rule,'Endpoint');assert.deepEqual(r.point,point(101.25,51.75));
});
test('grid is physical, and disabled snapping preserves all fractions',()=>{
 const r=snapEndpoint(blank(),point(20.125,31.875),null,DEFAULT_SNAPPING);assert.deepEqual(r.point,point(18,30));
 const p=point(20.125,31.875);assert.equal(snapEndpoint(blank(),p,point(10,10),{...DEFAULT_SNAPPING,enabled:false}).point,p);
});
test('endpoint edit holds the opposite endpoint fixed and recomputes midpoint/angle',()=>{
 let s=addSegment(blank(),'wall','w',point(10,10),point(100,10)).stage;s=setEndpoints(s,s.objects[0],point(10,10),point(10,100.25)).stage;
 const o=s.objects[0];assert.equal(o.geometry.length,90.25);assert.equal(o.rotation,90);assert.deepEqual(o.position,point(10,55.125));assert.ok(validSavedEndpoints(o));
});
test('numeric length and angle keep start fixed and update endpoint',()=>{
 const s=addSegment(blank(),'faultLine','f',point(30.125,30.375),point(120,30.375)).stage;
 const r=editSegmentMetrics(s,s.objects[0],72.25,90);assert.equal(r.error,undefined);const e=endpoints(r.stage.objects[0]);assert.deepEqual(e.start,point(30.125,30.375));near(e.end.x,30.125);near(e.end.y,102.625);assert.ok(validSavedEndpoints(r.stage.objects[0]));
});
test('invalid, zero, nonfinite and out-of-bound segments are rejected',()=>{
 const s=blank();for(const end of [point(10,10),point(NaN,10),point(Infinity,20),point(-1,20),point(10000,20),point(20,20,1)]){const r=addSegment(s,'wall','x',point(10,10),end);assert.ok(r.error);assert.equal(r.stage,s);}
 const valid=addSegment(s,'wall','x',point(10,10),point(100,10)).stage;for(const [l,a] of [[0,10],[Infinity,10],[20,NaN]]){const r=editSegmentMetrics(valid,valid.objects[0],l,a);assert.ok(r.error);assert.equal(r.stage,valid);}
});
test('endpoint edits reject a length that no longer contains wall firing ports',()=>{
 let s=addSegment(blank(),'wall','w',point(10,10),point(110,10)).stage;s.objects[0].ports=[{id:'p',offset:0,width:30,height:20,sill:30}];
 const r=editSegmentMetrics(s,s.objects[0],10,0);assert.ok(r.error);assert.equal(r.stage,s);
});
test('move and duplicate synchronize saved endpoints without aliasing',()=>{
 let s=addSegment(blank(),'wall','w',point(50,50),point(150,50)).stage;s=moveObject(s,'w',point(200,200));assert.ok(validSavedEndpoints(s.objects[0]));
 s=duplicateObject(s,'w','copy').stage;assert.ok(validSavedEndpoints(s.objects[1]));assert.notEqual(s.objects[0].endpoints,s.objects[1].endpoints);assert.notDeepEqual(s.objects[0].endpoints,s.objects[1].endpoints);
});
test('undo/redo restores target placement, movement, rotation, and deletion',()=>{
 let h=history(blank());h=record(h,placed());const placedSnapshot=h.present;h=record(h,moveObject(h.present,'t',point(200,200,48)));h=record(h,rotateTarget(h.present,'t',359).stage);const rotated=h.present;h=record(h,deleteObject(h.present,'t'));h=undo(h);assert.deepEqual(h.present,rotated);h=undo(undo(h));assert.deepEqual(h.present,placedSnapshot);h=undo(h);assert.equal(h.present.objects.length,0);h=redo(redo(redo(h)));assert.deepEqual(h.present,rotated);
});
test('one drag is one undo entry; viewport-only groups are no-ops and retain redo',()=>{
 let h=history(placed());h=begin(h);for(let i=0;i<20;i++)h=record(h,rotateTarget(h.present,'t',i).stage);h=end(h);assert.equal(h.past.length,1);h=undo(h);assert.equal(h.present.objects[0].rotation,0);const previous=h;h=end(begin(h));assert.deepEqual(h,previous);h=redo(h);assert.equal(h.present.objects[0].rotation,19);
});
test('segment creation, endpoint edits and deletion undo/redo without viewport state',()=>{
 let h=history(blank());h=record(h,addSegment(h.present,'wall','w',point(10,10),point(100,10)).stage);const original=h.present;h=record(h,editSegmentMetrics(h.present,h.present.objects[0],72,90).stage);const edited=h.present;h=record(h,deleteObject(h.present,'w'));assert.deepEqual(undo(h).present,edited);assert.deepEqual(undo(undo(h)).present,original);assert.deepEqual(redo(undo(h)).present,h.present);assert.ok(!('viewport' in h.present));
});
test('a new document edit after undo discards redo; no-op edits do not',()=>{
 let h=record(history(blank()),placed());h=undo(h);assert.equal(record(h,{...h.present}).future.length,1);h=record(h,addSegment(h.present,'faultLine','f',point(10,10),point(20,20)).stage);assert.equal(h.future.length,0);
});
test('saved outlines drive 2.5D face geometry and clipping without changing dimensions',()=>{
 const s=placed(),t=s.objects[0],before=JSON.stringify(t);const points=presetFacePoints(t);assert.equal(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),9);assert.equal(Math.max(...points.map(p=>p[1])),12);assert.equal(JSON.stringify(t),before);
 t.faceCut={kind:'preset',preset:'upper'};assert.ok(presetFacePoints(t).every(p=>p[1]>=6));
});
function open(file){const db=new DatabaseSync(file);return {db,repo:new Repository({execAsync:async sql=>db.exec(sql),runAsync:async(sql,...args)=>db.prepare(sql).run(...args),getAllAsync:async(sql,...args)=>db.prepare(sql).all(...args),getFirstAsync:async(sql,...args)=>db.prepare(sql).get(...args)??null},randomUUID)};}
test('SQLite reopen retains presets, fractional dimensions, rotation and endpoints across family changes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'designer-')),file=path.join(dir,'db.sqlite');let opened=open(file);
 try{let {repo}=opened;await repo.initialize();const match=await repo.createMatch('Match','PCSL');let stage=placeTarget(createDefaultStage(), 'uspsa-metric-chl-v1','exact',point(100.125,80.375)).stage;stage=rotateTarget(stage,'exact',721.125).stage;stage=addSegment(stage,'faultLine','drawn',point(20.125,30.375),point(120.25,140.5)).stage;const id=await repo.createStage('Stage',stage,createPlan(),match);await repo.saveStage(id,'Stage',stage,createPlan());await repo.updateMatch(match,'Match','IDPA');assert.equal(defaultTargetPreset((await repo.loadMatch(match)).targetFamily).family,'IDPA');assert.deepEqual((await repo.loadStage(id)).document,stage);opened.db.close();opened=open(file);await opened.repo.initialize();assert.deepEqual((await opened.repo.loadStage(id)).document,stage);const copy=await opened.repo.duplicateStage(id);assert.deepEqual((await opened.repo.loadStage(copy)).document,stage);
 }finally{opened.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('repository rejects damaged saved contours/endpoints without rewriting the saved record',async()=>{
 const {db,repo}=open(':memory:');try{await repo.initialize();const match=await repo.createMatch('M','USPSA');let stage=placeTarget(createDefaultStage(),preset,'new',point(50,50)).stage;stage=addSegment(stage,'wall','draw',point(20,20),point(100,20)).stage;const id=await repo.createStage('S',stage,createPlan(),match);const raw=db.prepare('SELECT payload FROM stages WHERE id=?').get(id).payload;
 for(const corrupt of [d=>{d.objects.find(o=>o.id==='new').outline={kind:'polygon',points:[[0,0],[2,1],[0,1]]};},d=>{d.objects.find(o=>o.id==='draw').endpoints.end.x=50;}]){const data=JSON.parse(raw);corrupt(data.document);const payload=JSON.stringify(data);db.prepare('UPDATE stages SET payload=? WHERE id=?').run(payload,id);await assert.rejects(repo.loadStage(id),/damaged/);assert.equal(db.prepare('SELECT payload FROM stages WHERE id=?').get(id).payload,payload);}
 }finally{db.close();}
});
