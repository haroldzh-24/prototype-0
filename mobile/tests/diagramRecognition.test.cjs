const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {detectGeometry,createGeometryRecognizer}=require('../src/diagramImport/geometryDetector.ts'),{evaluateDetections}=require('../src/diagramImport/evaluation.ts');
const {propose,recognizers}=require('../src/diagramImport/recognition.ts'),{fullQuad,fullCrop,reconstruct,validateReconstruction}=require('../src/diagramImport/model.ts');
const {mergeDetections,acceptSelection,editSegmentOverlay}=require('../src/diagramImport/proposalEdits.ts');
const {render}=require('./fixtures/diagram-recognition/render.cjs');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/diagram-recognition',name+'.json'),'utf8'));
const signal=()=>new AbortController().signal;
function draftFor(raster){const asset={path:'diagram-imports/clean.png',name:'Synthetic.png',mime:'image/png',size:10},page={asset,width:raster.width,height:raster.height,page:2,pageCount:3};return {version:1,id:'drawing',source:asset,sourceKind:'image',page,aligned:page,alignment:{corners:fullQuad(),rotation:0,crop:fullCrop()},projection:'top-down',origin:{x:30,y:30},proposals:[]};}

for(const name of ['clean-basic','connected-boundary','repeated-symbols','grid-and-text','diagonal-wall'])test('synthetic geometry fixture: '+name,async()=>{
 const sample=fixture(name),raster=render(sample),result=await detectGeometry(raster,signal()),score=evaluateDetections(sample.expected,result.proposals,sample,sample.scale);
 assert.equal(score.missedElements,0);assert.equal(score.falseDetections,0);assert.equal(score.wrongClassifications,0);assert.ok(score.meanPositionErrorPixels<=2);
 assert.ok(result.proposals.every(p=>!p.accepted&&p.approximate));
 if(name==='connected-boundary'){assert.ok(result.diagnostics.corners.length);assert.ok(result.proposals.every(p=>p.type==='unknown'));}
 if(name==='repeated-symbols'){assert.equal(new Set(result.proposals.map(p=>p.recognition.groupId)).size,1);assert.ok(result.proposals[0].recognition.groupId);}
 if(name==='grid-and-text'){assert.equal(score.scaleCalibrationFailures,1);assert.equal(result.diagnostics.grid.xSpacing,.125);assert.equal(result.diagnostics.suppressedTextComponents,3);}
});
test('normalized geometry and text suppression remain stable at the bounded 1024-pixel input size',async()=>{
 const sample=fixture('grid-and-text'),small=render(sample),rgba=new Uint8ClampedArray(1024*1024*4);
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(Math.floor(y/4)*256+Math.floor(x/4))*4;rgba.set(small.rgba.subarray(i,i+4),(y*1024+x)*4);}
 const result=await detectGeometry({width:1024,height:1024,rgba},signal());assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].type,'wall');assert.equal(result.diagnostics.suppressedTextComponents,3);
});
test('negative annotation fixture reports false detections without inventing target classifications',async()=>{
 const sample=fixture('annotation-ambiguity'),result=await detectGeometry(render(sample),signal()),score=evaluateDetections(sample.expected,result.proposals,sample);
 assert.ok(score.falseDetections<=2);assert.ok(result.proposals.every(p=>p.type==='unknown'));assert.ok(result.warnings.some(s=>s.includes('classify')));
});
test('dark, blank and malformed crops fall back or reject instead of inventing geometry',async()=>{
 const dark=await detectGeometry(render(fixture('dense-unsupported')),signal());assert.equal(dark.proposals.length,0);assert.match(dark.warnings[0],/dense/);
 const blank=await detectGeometry(render({width:64,height:64,primitives:[]}),signal());assert.equal(blank.proposals.length,0);assert.ok(blank.warnings.some(s=>s.includes('not evidence')));
 await assert.rejects(detectGeometry({width:2000,height:8,rgba:new Uint8ClampedArray(0)},signal()),/1024/);
});
test('proposal IDs/source geometry are stable, calibration-independent, and scoped to the actual aligned image',async()=>{
 const raster=render(fixture('clean-basic')),draft=draftFor(raster),a=await propose(draft,raster,recognizers[0],signal()),b=await propose(draft,raster,recognizers[0],signal());assert.deepEqual(a.proposals,b.proposals);
 assert.ok(a.proposals.every(p=>p.recognition.sourceImage.path===draft.aligned.asset.path&&p.recognition.sourceImage.page===2&&p.recognition.scaleStatus==='uncalibrated'));
 const calibrated={...draft,calibration:{a:{x:0,y:0},b:{x:1,y:0},inches:256,evidence:'user',approximate:true}};const c=await propose(calibrated,raster,recognizers[0],signal());assert.deepEqual(c.proposals.map(p=>p.id),a.proposals.map(p=>p.id));assert.ok(c.proposals.every(p=>p.recognition.scaleStatus==='calibrated-approximate'));
 const other=await propose({...draft,aligned:{...draft.aligned,asset:{...draft.aligned.asset,path:'diagram-imports/other.png'}}},raster,recognizers[0],signal());assert.ok(other.proposals.every(p=>!a.proposals.some(q=>q.id===p.id)));
 const stage=require('../src/stage/defaults.ts').createDefaultStage();await assert.rejects(async()=>reconstruct({...draft,proposals:a.proposals.map(p=>({...p,accepted:true}))},stage,'USPSA'),/scale/);
});
test('detection reruns preserve manual corrections, decisions and existing accepted proposal IDs',async()=>{
 const raster=render(fixture('clean-basic')),result=await propose(draftFor(raster),raster,recognizers[0],signal()),edited=result.proposals.map((p,i)=>i===0?{...p,type:'faultLine',accepted:true,position:{x:.2,y:.2}}:p);
 assert.deepEqual(mergeDetections(edited,result.proposals),edited);const original=JSON.stringify(edited);const accepted=acceptSelection(edited,[edited[0].id],true);assert.equal(accepted[0].accepted,true);assert.equal(JSON.stringify(edited),original);
 assert.throws(()=>acceptSelection(edited,[edited.find(p=>p.type==='unknown').id],true),/Classify/);assert.ok(acceptSelection(edited,edited.map(p=>p.id),false).every(p=>!p.accepted));
});
test('unknown shapes cannot commit; mapped shapes use preset sizes, not image-space extents',async()=>{
 const raster=render(fixture('clean-basic')),draft=draftFor(raster),found=await propose(draft,raster,recognizers[0],signal());const circle=found.proposals.find(p=>p.recognition.shape==='circle');
 const calibrated={...draft,calibration:{a:{x:0,y:0},b:{x:1,y:0},inches:256,evidence:'grid',approximate:true},proposals:[{...circle,accepted:true}]},stage=require('../src/stage/defaults.ts').createDefaultStage();assert.throws(()=>reconstruct(calibrated,stage,'USPSA'),/Classify/);
 calibrated.proposals=[{...circle,type:'steelPlate',presetId:'uspsa-round-8-v1',extent:{width:.4,height:.4},accepted:true}];const object=reconstruct(calibrated,stage,'USPSA').objects.at(-1);assert.equal(object.geometry.faceWidth,8);assert.equal(object.geometry.faceHeight,8);
});
test('segment size/rotation edits preserve source evidence and respect non-square image coordinates',()=>{
 const p={id:'line',type:'wall',position:{x:.2,y:.2},end:{x:.6,y:.2},rotation:0,source:'manual',accepted:false,approximate:true,notes:''};
 const edited=editSegmentOverlay(p,{width:200,height:100},{rotation:90,lengthPixels:50});assert.ok(Math.abs(edited.end.x-.2)<1e-10);assert.ok(Math.abs(edited.end.y-.7)<1e-10);assert.deepEqual(p.end,{x:.6,y:.2});assert.throws(()=>editSegmentOverlay(p,{width:200,height:100},{rotation:90,lengthPixels:100}),/leave/);
});
test('templates require explicit application/version provenance and ambiguous matches stay unknown',async()=>{
 const sample=fixture('repeated-symbols'),raster=render(sample),first=await detectGeometry(raster,signal()),bounds=first.proposals[0].recognition.bounds;
 const x0=Math.round(bounds.x*raster.width),y0=Math.round(bounds.y*raster.height),width=Math.round(bounds.width*raster.width),height=Math.round(bounds.height*raster.height),rgba=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=((y+y0)*raster.width+x+x0)*4;rgba.set(raster.rgba.subarray(i,i+4),(y*width+x)*4);}
 const t={id:'synthetic-diamond',application:'Synthetic fixture only',version:'1',type:'cardboardTarget',raster:{width,height,rgba},notes:'Not a real stage-builder icon.'};
 const known=await createGeometryRecognizer([t]).recognize({raster,signal:signal()});assert.ok(known.proposals.every(p=>p.type==='cardboardTarget'&&p.recognition.templateId===t.id));
 const ambiguous=await createGeometryRecognizer([t,{...t,id:'conflicting',type:'noShootTarget'}]).recognize({raster,signal:signal()});assert.ok(ambiguous.proposals.every(p=>p.type==='unknown'));assert.throws(()=>createGeometryRecognizer([{...t,application:''}]),/provenance/);
});
test('recognition checks cancellation before and during bounded pixel processing',async()=>{
 const raster=render(fixture('clean-basic')),a=new AbortController();a.abort();await assert.rejects(detectGeometry(raster,a.signal),/cancelled/);
 const b=new AbortController(),pending=detectGeometry(raster,b.signal);setTimeout(()=>b.abort(),1);await assert.rejects(pending,/cancelled/);
});
test('evaluation distinguishes wrong classifications, misses, false positives, angle wrap and bad scale',()=>{
 const expected=[{id:'wall',type:'wall',shape:'line',center:{x:.5,y:.5},rotation:179},{id:'missing',type:'unknown',shape:'circle',center:{x:.9,y:.9}}];
 const p={id:'p',type:'faultLine',position:{x:.4,y:.5},end:{x:.6,y:.5},rotation:1,recognition:{shape:'line'}};
 const score=evaluateDetections(expected,[p,{...p,id:'extra',position:{x:.1,y:.1},end:{x:.2,y:.1}}],{width:100,height:100},{expectedInchesPerPixel:1,actualInchesPerPixel:2});assert.equal(score.wrongClassifications,1);assert.equal(score.missedElements,1);assert.equal(score.falseDetections,1);assert.equal(score.meanRotationErrorDegrees,2);assert.equal(score.scaleCalibrationFailures,1);
});
test('new detection metadata validates and older manual drafts remain compatible',async()=>{
 const raster=render(fixture('clean-basic')),draft=draftFor(raster),result=await propose(draft,raster,recognizers[0],signal());assert.doesNotThrow(()=>validateReconstruction({...draft,proposals:result.proposals}));assert.doesNotThrow(()=>validateReconstruction(draft));assert.throws(()=>validateReconstruction({...draft,proposals:[{...result.proposals[0],recognition:{...result.proposals[0].recognition,sourceImage:{path:'../../stage.db',page:1}}}]}));
});
test('raster provenance accepts ordinary rounded downsampling of wide diagrams but rejects unrelated aspect ratios',async()=>{
 const raster={width:1024,height:147,rgba:new Uint8ClampedArray(1024*147*4)},draft=draftFor(raster);draft.aligned={...draft.aligned,width:2048,height:293};
 const adapter={id:'rounded-raster-test',templates:[],recognize:async()=>({proposals:[],projection:'unknown',warnings:[]})};
 await assert.doesNotReject(propose(draft,raster,adapter,signal()));await assert.rejects(propose(draft,{width:1024,height:200,rgba:new Uint8ClampedArray(1024*200*4)},adapter,signal()),/aspect/);
});
