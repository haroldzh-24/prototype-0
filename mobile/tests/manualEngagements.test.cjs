const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createRoute, movePosition, reorderPosition, isStageRoute } = require('../src/planning/route.ts');
const { createPlan, reconcilePlan } = require('../src/planning/model.ts');
const { setConnection, retainConnections } = require('../src/planning/routeGeometry.ts');
const { routeSectionId, routeSections, pointAlong, projectToSection, resolveAnchor, manualEngagementLabel, addManualEngagement, editManualEngagement, deleteManualEngagement, reorderManualEngagement, reconcileManualEngagements } = require('../src/planning/manualEngagements.ts');
const { beginEngagementGesture, moveEngagementGesture, finishEngagementGesture, targetAt } = require('../src/editor/manualEngagementGestures.ts');
const point = (x,y) => ({space:'stage',x,y,z:0});
function fixture() {
  const stage = createDefaultStage(); stage.stage = { width: 400, depth: 400 };
  stage.objects = [createObject('start','start',20,300),createObject('cardboardTarget','t1',150,70),createObject('steelPlate','t2',300,70),createObject('noShootTarget','ns',50,70),createObject('wall','wall',70,150)];
  const route = createRoute('r'); route.positions = ['w1','w2','w3'].map((id,i)=>({id,label:id,position:point(100+i*100,300),visibleTargetIds:[],engagedTargetIds:[]}));
  return {stage,route};
}
const waypoint = waypointId => ({kind:'waypoint',waypointId});
const section = (a,b,fraction) => ({kind:'section',sectionId:routeSectionId(a,b),fraction});
const add = (stage,route,id,anchor,targetId='t1') => addManualEngagement(stage,route,{id,anchor,targetId,direction:-Math.PI/2});
test('each waypoint letters independently, uses array order, and supports AA beyond Z; route entries are unlettered',()=>{
  const {stage,route}=fixture(); let r=route;
  for(let i=0;i<28;i++) {r=add(stage,r,'a'+i,waypoint('w1'));if(i<3)r=add(stage,r,'b'+i,waypoint('w2'));}
  r=add(stage,r,'travel',section('w1','w2',.5));
  const labels=id=>r.manualEngagements.filter(e=>e.anchor.waypointId===id).map(e=>manualEngagementLabel(r,e));
  assert.deepEqual(labels('w1').slice(0,4),['A','B','C','D']); assert.deepEqual(labels('w2'),['A','B','C']); assert.deepEqual(labels('w1').slice(-3),['Z','AA','AB']);
  assert.equal(manualEngagementLabel(r,r.manualEngagements.at(-1)),'');
  r=reorderManualEngagement(r,'b2',-1);assert.equal(manualEngagementLabel(r,r.manualEngagements.find(e=>e.id==='b2')),'B');
  r=deleteManualEngagement(r,'b0');assert.equal(manualEngagementLabel(r,r.manualEngagements.find(e=>e.id==='b2')),'A');assert.equal(labels('w1')[0],'A');
  assert.ok(isStageRoute(r));assert.equal(route.manualEngagements,undefined);
});
test('anchors resolve by actual straight/rounded arc length and follow waypoint, bend, and style edits',()=>{
  const {stage,route}=fixture(), anchor=section('w1','w2',.5);
  assert.deepEqual(resolveAnchor(stage,route,anchor),point(150,300));
  let r=setConnection(route,{fromId:'w1',toId:'w2',style:'ROUNDED',bends:[{id:'bend',position:point(100,200)}]});
  r=add(stage,r,'e',anchor);r=add(stage,r,'at-waypoint',waypoint('w1'));
  const before=resolveAnchor(stage,r,anchor), s=routeSections(stage,r).find(s=>s.fromId==='w1');
  assert.deepEqual(before,pointAlong(s.points,.5));assert.notEqual(before.y,300);
  const projected=projectToSection(s,before);assert.ok(projected.distance<1e-8);assert.ok(Math.abs(projected.fraction-.5)<1e-8);
  const moved=movePosition(r,'w1',point(80,280),stage.stage);assert.deepEqual(resolveAnchor(stage,moved,waypoint('w1')),point(80,280));assert.notDeepEqual(resolveAnchor(stage,moved,anchor),before);
  const bent=setConnection(r,{...r.connections[0],bends:[{id:'bend',position:point(170,180)}]});assert.notDeepEqual(resolveAnchor(stage,bent,anchor),before);assert.deepEqual(bent.manualEngagements,r.manualEngagements);
  const straight=setConnection(r,{...r.connections[0],style:'STRAIGHT'});assert.deepEqual(straight.positions,r.positions);assert.deepEqual(straight.manualEngagements,r.manualEngagements);
  const corner=section('w1','w2',100/(100+Math.hypot(100,100))); const curved=resolveAnchor(stage,r,corner), authored=resolveAnchor(stage,straight,corner);
  assert.notDeepEqual(curved,authored);assert.ok(curved.x>=100&&curved.x<=200&&curved.y>=200&&curved.y<=300);
});
test('split and merge retain stable engagement/target IDs; deletion and reorder never leave orphan anchors',()=>{
  const {stage,route}=fixture();let r=add(stage,route,'travel',section('w1','w2',.75));r=add(stage,r,'stop',waypoint('w2'));
  const inserted={...r.positions[0],id:'split',position:point(150,300)};
  let split=reconcileManualEngagements(stage,{...r,positions:[r.positions[0],inserted,...r.positions.slice(1)]},r);
  assert.equal(split.manualEngagements[0].id,'travel');assert.equal(split.manualEngagements[0].targetId,'t1');assert.equal(split.manualEngagements[0].anchor.sectionId,routeSectionId('split','w2'));assert.ok(Math.abs(split.manualEngagements[0].anchor.fraction-.5)<1e-9);assert.ok(isStageRoute(split));
  let merged=reconcileManualEngagements(stage,retainConnections({...split,positions:split.positions.filter(p=>p.id!=='split')}),split);
  assert.deepEqual(merged.manualEngagements,r.manualEngagements);
  const deleted=reconcileManualEngagements(stage,retainConnections({...r,positions:r.positions.filter(p=>p.id!=='w2')}),r);
  assert.equal(deleted.manualEngagements.length,1);assert.equal(deleted.manualEngagements[0].anchor.sectionId,routeSectionId('w1','w3'));assert.ok(isStageRoute(deleted));
  const reordered=reconcileManualEngagements(stage,reorderPosition(r,'w2',-1),r);
  assert.deepEqual(reordered.manualEngagements.map(e=>e.id),['stop']);assert.ok(isStageRoute(reordered));
});
test('reassignment and direction edits preserve identity and anchors; target deletion reconciles annotations atomically',()=>{
  const {stage,route}=fixture();const r=add(stage,route,'e',waypoint('w1'));
  const updated=editManualEngagement(stage,r,'e',{targetId:'t2',direction:0});
  assert.deepEqual(updated.manualEngagements[0],{...r.manualEngagements[0],targetId:'t2',direction:0});
  for(const targetId of ['missing','wall','ns']) {assert.equal(editManualEngagement(stage,r,'e',{targetId}),r);assert.equal(add(stage,route,'invalid',waypoint('w1'),targetId),route);}
  assert.equal(editManualEngagement(stage,r,'e',{direction:NaN}),r);
  const document={...stage,objects:stage.objects.filter(o=>o.id!=='t2')}, plan={...createPlan(),route:updated};
  assert.deepEqual(reconcilePlan(plan,document).route.manualEngagements,[]);assert.equal(updated.manualEngagements.length,1);
});
test('stored validation rejects duplicate IDs, invalid anchors and nonfinite geometry while older stages remain valid',()=>{
 const {stage,route}=fixture(), r=add(stage,route,'e',waypoint('w1')),e=r.manualEngagements[0];assert.ok(isStageRoute(route));assert.ok(isStageRoute(r));
 for(const entries of [[e,e],[{...e,direction:NaN}],[{...e,anchor:section('w1','w2',1.1)}],[{...e,anchor:{kind:'section',sectionId:'bad',fraction:.5}}]]) assert.equal(isStageRoute({...r,manualEngagements:entries}),false);
 assert.ok(isStageRoute({...r,manualEngagements:[{...e,anchor:waypoint('missing')}]}));
 assert.ok(isStageRoute({...r,manualEngagements:[{...e,anchor:section('w1','w3',.5)}]}));
});
test('gesture selection uses viewport scale, curved geometry and scoring targets; invalid releases cancel',()=>{
  const {stage,route}=fixture(), transform={scale:1,offsetX:0,offsetY:0};
  let g=beginEngagementGesture(stage,route,transform,{x:100,y:300});assert.deepEqual(g.anchor,waypoint('w1'));
  assert.equal(finishEngagementGesture(g,true),null);
  g=moveEngagementGesture(g,stage,transform,{x:150,y:70},1);assert.equal(g.targetId,'t1');assert.equal(finishEngagementGesture(g,true).kind,'create');assert.equal(finishEngagementGesture(g,false),null);
  for(const cursor of [{x:50,y:70},{x:70,y:150},{x:380,y:380}]) assert.equal(finishEngagementGesture(moveEngagementGesture(g,stage,transform,cursor,1),true),null);
  assert.equal(beginEngagementGesture(stage,route,transform,{x:380,y:380}),null);
  assert.equal(targetAt(stage,transform,{x:171,y:70}),'t1');assert.equal(targetAt(stage,transform,{x:173,y:70}),null);
  const shaped=setConnection(route,{fromId:'w1',toId:'w2',style:'ROUNDED',bends:[{id:'b',position:point(100,200)}]});
  const midpoint=resolveAnchor(stage,shaped,section('w1','w2',.5));assert.equal(beginEngagementGesture(stage,shaped,transform,midpoint).anchor.kind,'section');
  const zoom={scale:3,offsetX:55,offsetY:-22};g=beginEngagementGesture(stage,route,zoom,{x:355,y:878});assert.equal(g.anchor.waypointId,'w1');
});
test('second finger permanently cancels creation; arrow drags edit only direction and waypoint centers can create again',()=>{
 const {stage,route}=fixture(), t={scale:1,offsetX:0,offsetY:0};
 const r=add(stage,route,'e',waypoint('w1'));
 let g=beginEngagementGesture(stage,r,t,{x:100,y:262});assert.equal(g.editingId,'e');
 g=moveEngagementGesture(g,stage,t,{x:200,y:200},1);assert.equal(finishEngagementGesture(g,true).kind,'direction');
 assert.equal(beginEngagementGesture(stage,r,t,{x:100,y:300}).editingId,undefined);
 g=moveEngagementGesture(g,stage,t,{x:150,y:70},2);assert.ok(g.cancelled);g=moveEngagementGesture(g,stage,t,{x:150,y:70},1);assert.equal(finishEngagementGesture(g,true),null);
 assert.deepEqual(r.positions,route.positions);assert.equal(route.manualEngagements,undefined);
});
test('engagement additions, reorders, target changes and deletion undo/redo without touching PATH',()=>{
 const {history,record,undo,redo}=require('../src/editor/history.ts');const {stage,route}=fixture();
 let h=history(route);h=record(h,add(stage,h.present,'one',waypoint('w1')));h=record(h,add(stage,h.present,'two',waypoint('w1')));h=record(h,reorderManualEngagement(h.present,'two',-1));
 h=record(h,editManualEngagement(stage,h.present,'two',{targetId:'t2'}));const assigned=h.present;h=record(h,deleteManualEngagement(h.present,'two'));
 h=undo(h);assert.deepEqual(h.present,assigned);h=redo(h);assert.equal(h.present.manualEngagements.length,1);assert.deepEqual(h.present.positions,route.positions);
});

test('overlapping REVIEW targets cycle deterministically without changing ENGAGE nearest-target priority',()=>{
 const {stage}=fixture(),transform={scale:1,offsetX:0,offsetY:0};stage.objects.find(o=>o.id==='t2').position=point(150,70);
 assert.equal(targetAt(stage,transform,{x:150,y:70}),'t1');assert.equal(targetAt(stage,transform,{x:150,y:70},'t1'),'t2');assert.equal(targetAt(stage,transform,{x:150,y:70},'t2'),'t1');assert.equal(targetAt(stage,transform,{x:390,y:390},'t1'),null);
});
