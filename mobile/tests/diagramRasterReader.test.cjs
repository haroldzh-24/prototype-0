const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
function load(native){const original=Module._load,file=require.resolve('../src/diagramImport/rasterReader.ts');delete require.cache[file];Module._load=function(request,...args){if(request==='expo-modules-core')return {requireOptionalNativeModule:()=>native};if(request==='./assets')return {assetUri:async()=> 'file:///Documents/diagram.png'};return original.call(this,request,...args);};try{return require(file);}finally{Module._load=original;}}
test('Hermes-compatible RGBA decoder preserves channel order/alpha without Buffer or atob',()=>{
 const {decodeRgba}=load(null),expected=Uint8ClampedArray.from({length:8*9*4},(_,i)=>(i*13)%256);assert.deepEqual(decodeRgba(Buffer.from(expected).toString('base64'),8,9),expected);
 for(const [data,w,h]of [['!',8,8],['AAAA',8,8],['',2000,8],[Buffer.alloc(8*8*4).toString('base64').replace('==','A='),8,8]])assert.throws(()=>decodeRgba(data,w,h));
});
test('native raster adapter checks availability and cancellation before/after decode',async()=>{
 const page={asset:{}},signal=new AbortController();await assert.rejects(load(null).readRaster(page,signal.signal),/rebuilt/);let calls=0;
 const controller=new AbortController(),reader=load({pixels:async()=>{calls++;controller.abort();return {width:8,height:8,rgba:Buffer.alloc(256).toString('base64')};}});await assert.rejects(reader.readRaster(page,controller.signal),/cancelled/);assert.equal(calls,1);
 const before=new AbortController();before.abort();await assert.rejects(reader.readRaster(page,before.signal),/cancelled/);assert.equal(calls,1);
});
