// Saved ENGAGE arrows (the older engagement model) still load, validate and fold into position engagements; their
// stretch helpers (routeSections, resolveAnchor, projectToSection) also serve the drag that engages a target
// (editor/assignGesture.ts, UI cohesion phase 3). Nothing creates or edits arrows any more.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createRoute, movePosition, isStageRoute } = require('../src/planning/route.ts');
const { createPlan, reconcilePlan } = require('../src/planning/model.ts');
const { setConnection } = require('../src/planning/routeGeometry.ts');
const M = require('../src/planning/manualEngagements.ts');
const { routeSectionId, routeSections, pointAlong, projectToSection, resolveAnchor } = M;
const { beginAssignGesture, moveAssignGesture, finishAssignGesture, targetAt } = require('../src/editor/assignGesture.ts');
const point = (x,y) => ({space:'stage',x,y,z:0});
function fixture() {
  const stage = createDefaultStage(); stage.stage = { width: 400, depth: 400 };
  stage.objects = [createObject('start','start',20,300),createObject('cardboardTarget','t1',150,70),createObject('steelPlate','t2',300,70),createObject('noShootTarget','ns',50,70),createObject('wall','wall',70,150)];
  const route = createRoute('r'); route.positions = ['w1','w2','w3'].map((id,i)=>({id,label:id,position:point(100+i*100,300),visibleTargetIds:[],engagedTargetIds:[]}));
  return {stage,route};
}
const waypoint = waypointId => ({kind:'waypoint',waypointId});
const section = (a,b,fraction) => ({kind:'section',sectionId:routeSectionId(a,b),fraction});
const arrow = (id,anchor,targetId='t1') => ({id,anchor,targetId,direction:-Math.PI/2});

test('the arrow editing functions are gone; only reading, validating and the stretch helpers remain', () => {
  for (const gone of ['addManualEngagement', 'editManualEngagement', 'deleteManualEngagement', 'reorderManualEngagement', 'manualEngagementLabel', 'reconcileManualEngagements']) assert.equal(M[gone], undefined, gone);
  assert.equal(fs.existsSync(require('node:path').join(__dirname, '../src/editor/manualEngagementGestures.ts')), false);
});
test('anchors resolve by actual straight/rounded arc length and follow position, bend, and style edits',()=>{
  const {stage,route}=fixture(), anchor=section('w1','w2',.5);
  assert.deepEqual(resolveAnchor(stage,route,anchor),point(150,300));
  const r=setConnection(route,{fromId:'w1',toId:'w2',style:'ROUNDED',bends:[{id:'bend',position:point(100,200)}]});
  const before=resolveAnchor(stage,r,anchor), s=routeSections(stage,r).find(s=>s.fromId==='w1');
  assert.deepEqual(before,pointAlong(s.points,.5));assert.notEqual(before.y,300);
  const projected=projectToSection(s,before);assert.ok(projected.distance<1e-8);assert.ok(Math.abs(projected.fraction-.5)<1e-8);
  const moved=movePosition(r,'w1',point(80,280),stage.stage);assert.deepEqual(resolveAnchor(stage,moved,waypoint('w1')),point(80,280));assert.notDeepEqual(resolveAnchor(stage,moved,anchor),before);
  const bent=setConnection(r,{...r.connections[0],bends:[{id:'bend',position:point(170,180)}]});assert.notDeepEqual(resolveAnchor(stage,bent,anchor),before);
  const straight=setConnection(r,{...r.connections[0],style:'STRAIGHT'});assert.deepEqual(straight.positions,r.positions);
  const corner=section('w1','w2',100/(100+Math.hypot(100,100))); const curved=resolveAnchor(stage,r,corner), authored=resolveAnchor(stage,straight,corner);
  assert.notDeepEqual(curved,authored);assert.ok(curved.x>=100&&curved.x<=200&&curved.y>=200&&curved.y<=300);
});
test('stored validation rejects duplicate IDs, invalid anchors and nonfinite geometry while older stages remain valid',()=>{
 const {route}=fixture(), e=arrow('e',waypoint('w1')), r={...route,manualEngagements:[e]};assert.ok(isStageRoute(route));assert.ok(isStageRoute(r));
 for(const entries of [[e,e],[{...e,direction:NaN}],[{...e,anchor:section('w1','w2',1.1)}],[{...e,anchor:{kind:'section',sectionId:'bad',fraction:.5}}]]) assert.equal(isStageRoute({...r,manualEngagements:entries}),false);
 assert.ok(isStageRoute({...r,manualEngagements:[{...e,anchor:waypoint('missing')}]}));
 assert.ok(isStageRoute({...r,manualEngagements:[{...e,anchor:section('w1','w3',.5)}]}));
});
test('load folds arrows into position engagements: invalid references are dropped, valid ones engage; deleting a target clears it',()=>{
 const {stage,route}=fixture();route.manualEngagements=[arrow('bad',waypoint('w1'),'missing'),arrow('orphan',waypoint('missing')),arrow('good',waypoint('w1'),'t2')];const plan={...createPlan(),route};
 assert.ok(isStageRoute(route),'old saved data still loads');
 const loaded=reconcilePlan(plan,stage);assert.equal(loaded.route.manualEngagements,undefined);assert.deepEqual(loaded.route.positions.map(p=>p.engagedTargetIds),[['t2'],[],[]]);
 const changed={...stage,objects:stage.objects.filter(o=>o.id!=='t2')};assert.deepEqual(reconcilePlan(loaded,changed).route.positions.map(p=>p.engagedTargetIds),[[],[],[]]);
 // An arrow to a target deleted before the stage was reopened is dropped too.
 assert.ok(reconcilePlan({...createPlan(),route:{...route,manualEngagements:[arrow('e',waypoint('w1'),'t2')]}},changed).route.positions.every(p=>!p.engagedTargetIds.includes('t2')));
});
test('the drag starts on a position or on the path, uses viewport scale and curved geometry, and ends on a scoring target',()=>{
  const {stage,route}=fixture(), transform={scale:1,offsetX:0,offsetY:0};
  let g=beginAssignGesture(stage,route,transform,{x:100,y:300});assert.deepEqual(g.anchor,waypoint('w1'));assert.deepEqual(g.point,point(100,300));
  assert.equal(finishAssignGesture(g,true),null,'no drag yet');
  g=moveAssignGesture(g,stage,transform,{x:150,y:70},1);assert.equal(g.targetId,'t1');
  assert.deepEqual(finishAssignGesture(g,true),{anchor:waypoint('w1'),point:point(100,300),targetId:'t1'});assert.equal(finishAssignGesture(g,false),null,'released outside the canvas');
  for(const cursor of [{x:50,y:70},{x:70,y:150},{x:380,y:380}]) assert.equal(finishAssignGesture(moveAssignGesture(g,stage,transform,cursor,1),true),null,'a no-shoot, a wall or the ground is no target');
  assert.equal(beginAssignGesture(stage,route,transform,{x:380,y:380}),null,'away from the route the drag pans');
  // On the path: the stretch it starts on and the point on it, where a new position goes.
  const path=beginAssignGesture(stage,route,transform,{x:152,y:310});assert.equal(path.anchor.kind,'section');assert.equal(path.anchor.sectionId,routeSectionId('w1','w2'));assert.deepEqual(path.point,point(152,300));
  assert.equal(targetAt(stage,transform,{x:171,y:70}),'t1');assert.equal(targetAt(stage,transform,{x:173,y:70}),null);
  const shaped=setConnection(route,{fromId:'w1',toId:'w2',style:'ROUNDED',bends:[{id:'b',position:point(100,200)}]});
  const midpoint=resolveAnchor(stage,shaped,section('w1','w2',.5));assert.equal(beginAssignGesture(stage,shaped,transform,midpoint).anchor.kind,'section');
  const zoom={scale:3,offsetX:55,offsetY:-22};g=beginAssignGesture(stage,route,zoom,{x:355,y:878});assert.equal(g.anchor.waypointId,'w1');
});
test('a second finger cancels the drag for good; the drag never changes the route itself',()=>{
 const {stage,route}=fixture(), t={scale:1,offsetX:0,offsetY:0};
 let g=beginAssignGesture(stage,route,t,{x:100,y:300});
 g=moveAssignGesture(g,stage,t,{x:150,y:70},2);assert.ok(g.cancelled);g=moveAssignGesture(g,stage,t,{x:150,y:70},1);assert.equal(finishAssignGesture(g,true),null);
 assert.equal(route.positions.every(p=>!p.engagedTargetIds.length),true);
});
test('overlapping targets cycle deterministically on repeated taps; the nearest wins first',()=>{
 const {stage}=fixture(),transform={scale:1,offsetX:0,offsetY:0};stage.objects.find(o=>o.id==='t2').position=point(150,70);
 assert.equal(targetAt(stage,transform,{x:150,y:70}),'t1');assert.equal(targetAt(stage,transform,{x:150,y:70},'t1'),'t2');assert.equal(targetAt(stage,transform,{x:150,y:70},'t2'),'t1');assert.equal(targetAt(stage,transform,{x:390,y:390},'t1'),null);
});
