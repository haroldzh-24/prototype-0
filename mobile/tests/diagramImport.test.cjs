const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {fullQuad,fullCrop,validQuad,validCrop,validateReconstruction,inchesPerPixel,reconstruct}=require('../src/diagramImport/model.ts');
const {quadMapping}=require('../src/diagramImport/warp.ts');
const {propose,recognizers}=require('../src/diagramImport/recognition.ts');
const {createDefaultStage}=require('../src/stage/defaults.ts');
const {targetPreset}=require('../src/stage/targetPresets.ts');
function fixture(){
 const asset={path:'diagram-imports/original.pdf',name:'Briefing.pdf',mime:'application/pdf',size:100};
 const page={asset:{...asset,path:'diagram-imports/page.png',mime:'image/png'},width:1000,height:500,page:2,pageCount:3};
 const draft={version:1,id:'source',source:asset,sourceKind:'pdf',page,rectified:page,aligned:page,alignment:{corners:fullQuad(),rotation:0,crop:fullCrop()},projection:'top-down',origin:{x:20,y:20},calibration:{a:{x:0,y:0},b:{x:1,y:0},inches:400,evidence:'grid',approximate:true},proposals:[{id:'paper',type:'cardboardTarget',position:{x:.25,y:.5},rotation:-90,accepted:true,approximate:true,notes:'Default size, not printed symbol size.',source:'manual'}]};
 const stage=createDefaultStage();stage.stage={width:1000,depth:1000};return {draft,stage};
}
test('diagram pixels calibrate to inches without using target icon size, DPI or PDF paper size',()=>{
 const {draft,stage}=fixture();assert.equal(inchesPerPixel(draft),.4);const result=reconstruct(draft,stage,'USPSA'),object=result.objects.at(-1);
 assert.equal(object.position.x,120);assert.equal(object.position.y,120);assert.equal(object.rotation,270);assert.equal(object.geometry.faceWidth,18);assert.equal(object.geometry.faceHeight,30);
 const enlarged=reconstruct({...draft,calibration:{...draft.calibration,inches:800}},stage,'USPSA').objects.at(-1);assert.equal(enlarged.position.x,220);assert.deepEqual(enlarged.geometry,object.geometry);
});
test('diagonal scale uses both raster dimensions and validates degenerate calibration',()=>{
 const {draft}=fixture();draft.calibration={...draft.calibration,b:{x:1,y:1},inches:Math.hypot(1000,500)};assert.equal(inchesPerPixel(draft),1);
 for(const c of [{...draft.calibration,inches:0},{...draft.calibration,a:draft.calibration.b},{...draft.calibration,inches:NaN}])assert.throws(()=>validateReconstruction({...draft,calibration:c}));
});
test('unknown and isometric diagrams remain reference-only even when a scale was entered',()=>{
 const {draft,stage}=fixture();for(const projection of ['unknown','perspective'])assert.throws(()=>reconstruct({...draft,projection},stage,'USPSA'),/top-down/);
 assert.throws(()=>reconstruct({...draft,calibration:undefined},stage,'USPSA'),/scale/);
});
test('acceptance appends fresh IDs once; rejection and repeat acceptance preserve existing document identity',()=>{
 const {draft,stage}=fixture(),before=JSON.stringify(stage);const result=reconstruct(draft,stage,'USPSA');assert.equal(JSON.stringify(stage),before);assert.deepEqual(result.objects.slice(0,-1),stage.objects);assert.deepEqual(result.stage,stage.stage);
 assert.equal(reconstruct(draft,result,'USPSA'),result);assert.equal(reconstruct({...draft,proposals:draft.proposals.map(p=>({...p,accepted:false}))},stage,'USPSA'),stage);
});
test('preset dimensions survive calibration and targets can map to existing match-family presets',()=>{
 const {draft,stage}=fixture();draft.proposals[0].presetId='uspsa-metric-chl-v1';const paper=reconstruct(draft,stage,'USPSA').objects.at(-1),preset=targetPreset('uspsa-metric-chl-v1');assert.equal(paper.geometry.faceWidth,preset.width);assert.deepEqual(paper.outline,preset.outline);
 assert.throws(()=>reconstruct(draft,stage,'IDPA'),/preset/);draft.proposals[0].type='wall';assert.throws(()=>reconstruct(draft,stage,'USPSA'),/preset/);
});
test('walls and fault lines use calibrated endpoint geometry, never symbol bounding-box dimensions',()=>{
 const {draft,stage}=fixture();draft.proposals=['wall','faultLine'].map((type,i)=>({...draft.proposals[0],id:type,type,position:{x:.1,y:.2},end:{x:.4,y:.6},rotation:31}));
 const result=reconstruct(draft,stage,'USPSA');for(const o of result.objects.slice(-2)){assert.equal(o.geometry.length,Math.hypot(120,80));assert.equal(o.position.x,120);assert.equal(o.position.y,100);assert.equal(o.endpoints.start.x,60);assert.equal(o.endpoints.end.x,180);assert.equal(o.endpoints.start.z,0);}
});
test('unsupported props/ports, out-of-bounds elements and duplicate starts cannot partially commit',()=>{
 const {draft,stage}=fixture(),before=JSON.stringify(stage);
 for(const p of [{...draft.proposals[0],id:'bad',type:'port'},{...draft.proposals[0],id:'bad',type:'prop'},{...draft.proposals[0],id:'bad',type:'start'},{...draft.proposals[0],id:'bad',position:{x:0,y:0}}]){
  const d={...draft,origin:{x:0,y:0},proposals:[draft.proposals[0],p]};assert.throws(()=>reconstruct(d,stage,'USPSA'));assert.equal(JSON.stringify(stage),before);
 }
});
test('draft validation rejects crossed corners, invalid crops, traversal paths and damaged proposal metadata',()=>{
 const {draft}=fixture();assert.doesNotThrow(()=>validateReconstruction(draft));assert.equal(validQuad([fullQuad()[0],fullQuad()[2],fullQuad()[1],fullQuad()[3]]),false);assert.equal(validCrop({x:.8,y:0,width:.5,height:1}),false);
 for(const changes of [{id:undefined},{version:2},{source:{...draft.source,path:'../stage.db'}},{alignment:{...draft.alignment,rotation:45}},{proposals:[draft.proposals[0],draft.proposals[0]]},{proposals:[{...draft.proposals[0],rotation:Infinity}]}])assert.throws(()=>validateReconstruction({...draft,...changes}));
});
test('perspective mapping preserves all four corners and the affine identity',()=>{
 const identity=quadMapping(fullQuad());assert.deepEqual(identity({x:.3,y:.7}),{x:.3,y:.7});const q=[{x:.1,y:.1},{x:.8,y:.2},{x:.9,y:.9},{x:.2,y:.8}],map=quadMapping(q);for(let i=0;i<4;i++){const p=map(fullQuad()[i]);assert.ok(Math.abs(p.x-q[i].x)<1e-10);assert.ok(Math.abs(p.y-q[i].y)<1e-10);}assert.throws(()=>quadMapping([q[0],q[2],q[1],q[3]]));
});
test('registered geometry detector keeps vendor templates disabled and adapters never auto-accept or invent precision',async()=>{
 assert.equal(recognizers.length,1);assert.equal(recognizers[0].templates.length,0);const {draft}=fixture(),raster={width:1000,height:500,rgba:new Uint8ClampedArray(1000*500*4)};
 const adapter={id:'synthetic-only',templates:[],recognize:async()=>({proposals:draft.proposals,projection:'unknown',warnings:['Synthetic test, not a real diagram.'],layoutRegion:{x:.1,y:.1,width:.8,height:.8}})};
 const result=await propose(draft,raster,adapter,new AbortController().signal);assert.equal(result.proposals[0].accepted,false);assert.equal(result.proposals[0].approximate,true);assert.equal(result.projection,'unknown');assert.equal(draft.proposals[0].accepted,true);
 const controller=new AbortController();controller.abort();await assert.rejects(propose(draft,raster,adapter,controller.signal),/cancelled/);await assert.rejects(propose(draft,{...raster,width:2},adapter,new AbortController().signal),/raster/);
});
test('late or malformed detector results cannot enter the preview',async()=>{
 const {draft}=fixture(),raster={width:1000,height:500,rgba:new Uint8ClampedArray(1000*500*4)},controller=new AbortController();
 await assert.rejects(propose(draft,raster,{id:'late',templates:[],recognize:async()=>{controller.abort();return {proposals:[],projection:'top-down',warnings:[]};}},controller.signal),/cancelled/);
 await assert.rejects(propose(draft,raster,{id:'bad',templates:[],recognize:async()=>({proposals:[{...draft.proposals[0],position:{x:NaN,y:0}}],projection:'top-down',warnings:[]})},new AbortController().signal),/invalid/);
});
