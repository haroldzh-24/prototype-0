const {performance}=require('node:perf_hooks');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {solveRoute}=require('../src/planning/routeSolver/solveRoute.ts');
const {addSegment}=require('../src/stage/segments.ts');
const point=(x,y)=>({space:'stage',x,y,z:0});
const area=(id,x,y)=>({id,polygon:[{x,y},{x:x+24,y},{x:x+24,y:y+24},{x,y:y+24}]});
function stage(areas,walls=[]) {let document={schemaVersion:7,coordinateSystem:'inches',stage:{width:600,depth:480},objects:[]};walls.forEach(([x,y1,y2],i)=>document=addSegment(document,'wall',`wall-${i}`,point(x,y1),point(x,y2)).stage);return {stage:document,start:{x:40,y:240},requiredAreas:areas,options:{maxAlternatives:2}};}
const samples={clear:stage([area('goal',520,228)]),detour:stage([area('goal',520,228)],[[280,120,360]]),fourRegions:stage([area('a',100,40),area('b',260,410),area('c',410,60),area('d',540,400)],[[180,120,340],[340,200,440],[460,0,200]]),tenRegions:stage(Array.from({length:10},(_,i)=>area(`area-${i}`,60+i*48,60+(i%2)*300)),[[220,120,300],[400,180,400]])};
const rows=[];
for(const [name,input] of Object.entries(samples)){solveRoute(input);const times=[];let result;for(let i=0;i<10;i++){const before=performance.now();result=solveRoute(input);times.push(performance.now()-before);}times.sort((a,b)=>a-b);rows.push({name,status:result.status,medianMs:+times[5].toFixed(2),maxMs:+times[9].toFixed(2),nodes:result.diagnostics.graphNodeCount,edges:result.diagnostics.graphEdgeCount,iterations:result.diagnostics.searchIterations,distanceInches:result.bestRoute?.totalDistanceInches,alternatives:result.alternatives.length});}
console.log(JSON.stringify({runtime:process.version,samplesPerStage:10,rows},null,2));
