const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createRoute, isStageRoute } = require('../src/planning/route.ts');
const { reviewManualRoute } = require('../src/planning/manualRouteReview.ts');
const { addManualEngagement, editManualEngagement, deleteManualEngagement, routeSectionId, reconcileManualEngagements } = require('../src/planning/manualEngagements.ts');
const { createPlan, reconcilePlan } = require('../src/planning/model.ts');
const point = (x,y) => ({space:'stage',x,y,z:0});
function fixture() {
 const stage=createDefaultStage();stage.objects=[createObject('start','start',0,300),createObject('cardboardTarget','a',100,50),createObject('steelPlate','b',200,50),createObject('steelPopper','c',300,50),createObject('noShootTarget','ns',50,50),createObject('wall','wall',50,100)];
 const route=createRoute('r');route.positions=['w1','w2'].map((id,i)=>({id,label:id,position:point(100+i*100,300),visibleTargetIds:[],engagedTargetIds:[]}));
 return {stage,route};
}
const e = (id,targetId,anchor={kind:'waypoint',waypointId:'w1'})=>({id,targetId,anchor,direction:0});
test('coverage counts distinct eligible saved target IDs, never arrow direction or old assignment metadata',()=>{
 const {stage,route}=fixture();route.manualEngagements=[e('1','a'),e('2','a'),e('3','b')];route.positions[1].engagedTargetIds=['c'];
 const result=reviewManualRoute(stage,route);assert.equal(result.totalTargets,3);assert.equal(result.assignedTargets,2);assert.equal(result.unassignedTargets,1);assert.equal(result.targets.find(t=>t.target.id==='a').engagements.length,2);assert.equal(result.targets.find(t=>t.target.id==='c').assigned,false);assert.equal(result.invalid.length,0);
 assert.deepEqual(result.targets.map(t=>t.target.id),['a','b','c']);assert.equal(route.manualEngagements[0].direction,0);
});
test('sources retain independent waypoint letters and never letter route-attached annotations',()=>{
 const {stage,route}=fixture();route.manualEngagements=[e('1','a'),e('2','b'),e('3','a',{kind:'waypoint',waypointId:'w2'}),e('4','a',{kind:'section',sectionId:routeSectionId('w1','w2'),fraction:.5})];
 const r=reviewManualRoute(stage,route);assert.deepEqual(r.engagements.slice(0,3).map(e=>e.source),['Waypoint 1 / A','Waypoint 1 / B','Waypoint 2 / A']);assert.equal(r.engagements[3].source,'Route engagement (50% along section)');assert.deepEqual(r.engagements[3].position,point(150,300));assert.equal(r.waypointEngagements,3);assert.equal(r.routeEngagements,1);
});
test('missing targets, non-engagement objects and missing anchors are inspectable and excluded',()=>{
 const {stage,route}=fixture();route.manualEngagements=[e('missing','gone'),e('prop','wall'),e('noshoot','ns'),e('anchor','b',{kind:'waypoint',waypointId:'gone'}),e('section','c',{kind:'section',sectionId:routeSectionId('gone','w2'),fraction:.5}),e('valid','a')];
 const r=reviewManualRoute(stage,route);assert.equal(r.assignedTargets,1);assert.equal(r.invalid.length,5);assert.equal(r.targets.find(t=>t.target.id==='b').engagements.length,1);assert.equal(r.targets.find(t=>t.target.id==='b').assigned,false);assert.equal(r.invalid.find(e=>e.engagement.id==='anchor').position,null);assert.match(r.invalid[0].issues.join(),/Missing target/);assert.ok(isStageRoute(route));
 const bad={...route,manualEngagements:[e('nan','a',{kind:'section',sectionId:routeSectionId('w1','w2'),fraction:NaN})]};assert.equal(reviewManualRoute(stage,bad).assignedTargets,0);assert.equal(reviewManualRoute(stage,{...route,manualEngagements:[{...e('null','a'),anchor:null}]}).invalid.length,1);
});
test('reassignment, deletion and restoration derive current coverage without persistent counts',()=>{
 const {stage,route}=fixture();let r=addManualEngagement(stage,route,e('1','a'));r=addManualEngagement(stage,r,e('2','a'));assert.equal(reviewManualRoute(stage,r).assignedTargets,1);
 r=editManualEngagement(stage,r,'2',{targetId:'b'});assert.equal(reviewManualRoute(stage,r).assignedTargets,2);r=deleteManualEngagement(r,'1');assert.equal(reviewManualRoute(stage,r).assignedTargets,1);
 const changed={...stage,objects:stage.objects.filter(o=>o.id!=='b')};const removed=reviewManualRoute(changed,r);assert.equal(removed.assignedTargets,0);assert.equal(removed.invalid.length,1);assert.equal(removed.totalTargets,2);assert.equal(reviewManualRoute(stage,r).assignedTargets,1);assert.equal('coverage' in r,false);
});
test('undo and redo of assignments and target deletion update derived coverage',()=>{
 const {history,record,undo,redo}=require('../src/editor/history.ts'),{stage,route}=fixture();let h=history({stage,route});h=record(h,{stage,route:addManualEngagement(stage,route,e('1','a'))});assert.equal(reviewManualRoute(h.present.stage,h.present.route).assignedTargets,1);h=undo(h);assert.equal(reviewManualRoute(h.present.stage,h.present.route).assignedTargets,0);h=redo(h);assert.equal(reviewManualRoute(h.present.stage,h.present.route).assignedTargets,1);
 h=record(h,{...h.present,stage:{...stage,objects:stage.objects.filter(o=>o.id!=='a')}});assert.equal(reviewManualRoute(h.present.stage,h.present.route).invalid.length,1);h=undo(h);assert.equal(reviewManualRoute(h.present.stage,h.present.route).invalid.length,0);
});
test('review distance includes rendered bends and bounded rounding, and is independent of viewport',()=>{
 const {stage,route}=fixture();assert.equal(reviewManualRoute(stage,route).distance,200);
 route.connections=[{fromId:'w1',toId:'w2',style:'STRAIGHT',bends:[{id:'b',position:point(100,200)}]}];const straight=reviewManualRoute(stage,route).distance;assert.ok(Math.abs(straight-(200+Math.hypot(100,100)))<1e-8);
 route.connections[0].style='ROUNDED';const rounded=reviewManualRoute(stage,route);assert.ok(rounded.distance>300&&rounded.distance<straight);assert.equal(rounded.waypoints,2);assert.deepEqual(reviewManualRoute(stage,route),rounded);
});
test('older stages, empty stages and stages without manual engagements review safely',()=>{
 const {stage,route}=fixture();route.positions[0].engagedTargetIds=['a'];assert.equal(reviewManualRoute(stage,route).assignedTargets,0);assert.equal(reviewManualRoute(stage).unassignedTargets,3);
 const empty=reviewManualRoute({...stage,objects:[]});assert.equal(empty.totalTargets,0);assert.equal(empty.distance,0);assert.equal(empty.waypoints,0);assert.deepEqual(empty.invalid,[]);
});
test('load preserves pre-existing invalid references; deliberate deletion still cleans valid references',()=>{
 const {stage,route}=fixture();route.manualEngagements=[e('bad','missing'),e('orphan','a',{kind:'waypoint',waypointId:'missing'}),e('good','b')];const plan={...createPlan(),route};
 const loaded=reconcilePlan(plan,stage,{stage,route});assert.deepEqual(loaded.route.manualEngagements,route.manualEngagements);
 const changed={...stage,objects:stage.objects.filter(o=>o.id!=='b')};const deleted=reconcilePlan(loaded,changed,{stage,route});assert.deepEqual(deleted.route.manualEngagements.map(e=>e.id),['bad','orphan']);
 assert.equal(reviewManualRoute(changed,deleted.route).invalid.length,2);
 const modified={...route,name:'Renamed'};assert.equal(reconcileManualEngagements(stage,modified,route).manualEngagements.length,3);
 assert.equal(addManualEngagement(stage,route,e('new','a')).manualEngagements.length,4);
});
