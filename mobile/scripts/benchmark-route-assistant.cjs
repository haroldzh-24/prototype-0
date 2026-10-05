const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const A=require('../src/planning/routeAssistant/index.ts');
const {addSegment}=require('../src/stage/segments.ts');
const {createPlan}=require('../src/planning/model.ts');
const {createRoute}=require('../src/planning/route.ts');
const {defaultEngagementRules}=require('../src/planning/engagements.ts');
const physical=(x,y)=>({space:'stage',x,y,z:0});
function context(large){
  let stage={schemaVersion:7,coordinateSystem:'inches',stage:{width:600,depth:480},objects:[{id:'start',type:'start',position:physical(40,240),rotation:0,geometry:{width:12,depth:12,height:0}}]};
  const walls=large?[[220,120,300],[400,180,400]]:[[280,120,360]];
  walls.forEach(([x,a,b],i)=>stage=addSegment(stage,'wall',`wall-${i}`,physical(x,a),physical(x,b)).stage);
  const plan=createPlan();plan.route=createRoute('r');plan.route.positions=[{id:'W1',label:'W1',position:physical(520,240),visibleTargetIds:[],engagedTargetIds:[]}];
  plan.route.engagementRules=defaultEngagementRules();
  plan.route.engagementRules.firingAreas=(large?Array.from({length:10},(_,i)=>[60+i*48,60+(i%2)*300]):[[520,228]]).map(([x,y],i)=>({id:`area-${i}`,vertices:[{x,y},{x:x+24,y},{x:x+24,y:y+24},{x,y:y+24}]}));
  return A.createRouteAssistantContext(stage,plan);
}
const rows=[];
for(const large of [false,true])for(const type of ['MOVE_WAYPOINT','DELETE_WAYPOINT','REPLAN','REPLAN_AVOIDING_AREA']){
  const c=context(large),command={type,sourceRevision:c.revision,...(type==='MOVE_WAYPOINT'?{waypointId:'W1',destination:{kind:'delta',deltaXInches:-12,deltaYInches:0}}:type==='DELETE_WAYPOINT'?{waypointId:'W1'}:type==='REPLAN_AVOIDING_AREA'?{area:{id:'avoid',polygon:[{x:300,y:100},{x:320,y:100},{x:320,y:200},{x:300,y:200}]}}:{})};
  A.executeRouteAssistantCommand(c,command);const times=[];let result;
  for(let i=0;i<10;i++){result=A.executeRouteAssistantCommand(c,command);times.push(result.durationMs);}
  times.sort((a,b)=>a-b);rows.push({stage:large?'tenRegions':'detour',command:type,kind:result.kind,medianMs:+times[5].toFixed(2),maxMs:+times[9].toFixed(2)});
}
console.log(JSON.stringify({runtime:process.version,samplesPerCommand:10,rows},null,2));
