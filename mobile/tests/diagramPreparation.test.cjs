const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {fullQuad,fullCrop}=require('../src/diagramImport/model.ts');
function adapter(native){
 const original=Module._load,file=require.resolve('../src/diagramImport/preparation.ts'),copies=[];delete require.cache[file];
 Module._load=function(request,...args){if(request==='expo-modules-core')return {requireOptionalNativeModule:()=>native};if(request==='./assets')return {assetUri:async a=>'file:///Documents/'+a.path,preserveFile:async(uri,name,mime)=>{copies.push(uri);return {path:'diagram-imports/derived.png',name,mime,size:5};}};return original.call(this,request,...args);};
 try{return {...require(file),copies};}finally{Module._load=original;}
}
const source={path:'diagram-imports/original.pdf',name:'Original.pdf',mime:'application/pdf',size:10};
test('PDF adapter uses the chosen one-based page and preserves the original reference',async()=>{
 const calls=[],a=adapter({page:async(...args)=>{calls.push(args);return {uri:'file:///tmp/page.png',width:1000,height:750,pageCount:4};}}),before=JSON.stringify(source);
 const result=await a.preparePage(source,3);assert.deepEqual(calls[0],['file:///Documents/diagram-imports/original.pdf',true,3]);assert.equal(result.page.page,3);assert.equal(result.page.pageCount,4);assert.equal(JSON.stringify(source),before);assert.equal(a.copies.length,1);
});
test('missing native module and locked or invalid PDF pages fail without inventing a raster',async()=>{
 await assert.rejects(adapter(null).preparePage(source,1),/rebuilt/);await assert.rejects(adapter({page:async()=>{throw Error('PDF locked');}}).preparePage(source,1),/locked/);
 const a=adapter({page:async()=>({uri:'file:///tmp/p.png',width:0,height:5,pageCount:1})});await assert.rejects(a.preparePage(source,1),/invalid/);assert.equal(a.copies.length,0);await assert.rejects(a.preparePage(source,0),/valid PDF page/);
});
test('image alignment passes manual corners, rotation and crop to the local adapter',async()=>{
 const calls=[],a=adapter({align:async(...args)=>{calls.push(args);return {uri:'file:///tmp/aligned.png',width:600,height:800,pageCount:1};}}),page={asset:source,width:1000,height:700,page:2,pageCount:3},alignment={corners:fullQuad(),rotation:90,crop:{x:.1,y:.2,width:.7,height:.5}};
 const result=await a.alignPage(page,alignment);assert.deepEqual(calls[0].slice(1),[alignment.corners,90,alignment.crop]);assert.equal(result.page,2);assert.equal(result.pageCount,3);assert.equal(result.width,600);assert.equal(result.height,800);
 await assert.rejects(a.alignPage(page,{...alignment,crop:{...fullCrop(),width:2}}),/non-crossing/);assert.equal(calls.length,1);
});
