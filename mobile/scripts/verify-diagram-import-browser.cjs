// Synthetic raster / IndexedDB verification, not real-diagram recognition or native testing.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),ts=require('typescript');
const {pathToFileURL}=require('node:url');
async function main(){
 const modulePath=process.env.PLAYWRIGHT_MODULE || 'C:/Users/brrrr/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
 const {chromium}=await import(pathToFileURL(modulePath).href);
 const root=path.resolve(__dirname,'../src'),sources={};
 function collect(file){
  const id=path.relative(root,file).replaceAll('\\','/');if(sources[id])return id;
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;sources[id]={code,deps:{}};
  for(const [,request] of code.matchAll(/require\(["']([^"']+)["']\)/g))if(request.startsWith('.')){
   const target=path.resolve(path.dirname(file),request),resolved=fs.existsSync(target+'.web.ts')?target+'.web.ts':target+'.ts';sources[id].deps[request]=collect(resolved);
  }
  return id;
 }
 const assets=collect(path.join(root,'diagramImport/assets.web.ts')),preparation=collect(path.join(root,'diagramImport/preparation.web.ts')),recognition=collect(path.join(root,'diagramImport/recognition.ts')),rasterReader=collect(path.join(root,'diagramImport/rasterReader.web.ts'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic diagram import verification</title>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  async function install(){await page.evaluate(({sources,assets,preparation,recognition,rasterReader})=>{
   const cache={};function load(id){if(cache[id])return cache[id].exports;const mod={exports:{}};cache[id]=mod;const local=request=>request==='expo-modules-core'?{uuid:{v4:()=>crypto.randomUUID()}}:request==='expo-document-picker'?{}:load(sources[id].deps[request]);new Function('require','module','exports',sources[id].code)(local,mod,mod.exports);return mod.exports;}
   window.diagramAssets=load(assets);window.diagramPreparation=load(preparation);window.diagramRecognition=load(recognition);window.diagramRasterReader=load(rasterReader);
  },{sources,assets,preparation,recognition,rasterReader});}
  await install();
  const result=await page.evaluate(async()=>{
   const {storeBlob,readBlob,assetUri}=window.diagramAssets,{preparePage,alignPage}=window.diagramPreparation;
   const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;const context=canvas.getContext('2d');context.fillStyle='#ff0000';context.fillRect(0,0,100,100);context.fillStyle='#0000ff';context.fillRect(100,0,100,100);
   const source=await storeBlob(await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),'Synthetic printed plan.png');const before=Array.from(new Uint8Array(await(await readBlob(source)).arrayBuffer()));
   const {page}=await preparePage(source,1),corners=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}];
   const aligned=await alignPage(page,{corners,rotation:90,crop:{x:0,y:0,width:1,height:1}}),cropped=await alignPage(page,{corners,rotation:90,crop:{x:0,y:.5,width:1,height:.5}});
   async function pixel(asset,x,y){const image=new Image();image.src=await assetUri(asset);await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return Array.from(ctx.getImageData(x,y,1,1).data);}
   const skew=await alignPage(page,{corners:[{x:.2,y:.1},{x:.8,y:.2},{x:.9,y:.9},{x:.1,y:.8}],rotation:0,crop:{x:0,y:0,width:1,height:1}});const skewRed=await pixel(skew.asset,Math.floor(skew.width*.25),Math.floor(skew.height*.5)),skewBlue=await pixel(skew.asset,Math.floor(skew.width*.75),Math.floor(skew.height*.5));
   const pdf=await storeBlob(new Blob(['%PDF-synthetic-reference-only'],{type:'application/pdf'}),'Synthetic.pdf');let pdfMessage='';try{await preparePage(pdf,1);}catch(e){pdfMessage=String(e);}
   return {source,before,skewRed,skewBlue,after:Array.from(new Uint8Array(await(await readBlob(source)).arrayBuffer())),aligned,cropped,red:await pixel(aligned.asset,40,40),blue:await pixel(aligned.asset,40,120),cropBlue:await pixel(cropped.asset,40,40),pdfMessage,pdfRetained:(await readBlob(pdf)).size>0,png:await assetUri(aligned.asset)};
  });
  assert.deepEqual(result.skewRed,[255,0,0,255]);assert.deepEqual(result.skewBlue,[0,0,255,255]);assert.deepEqual(result.before,result.after);assert.equal(result.aligned.width,80);assert.equal(result.aligned.height,160);assert.equal(result.cropped.width,80);assert.equal(result.cropped.height,80);assert.deepEqual(result.red,[255,0,0,255]);assert.deepEqual(result.blue,[0,0,255,255]);assert.deepEqual(result.cropBlue,[0,0,255,255]);assert.match(result.pdfMessage,/rebuilt iPhone/);assert.equal(result.pdfRetained,true);
  const geometry=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);ctx.fillStyle='#000';ctx.fillRect(32,48,96,6);ctx.strokeStyle='#000';ctx.lineWidth=2;ctx.beginPath();ctx.arc(184,76,14,0,2*Math.PI);ctx.stroke();ctx.strokeRect(40,152,40,32);
   const asset=await window.diagramAssets.storeBlob(await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),'Synthetic geometry.png'),page={asset,width:256,height:256,page:1,pageCount:1},draft={version:1,id:'browser',source:asset,sourceKind:'image',aligned:page,alignment:{corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],rotation:0,crop:{x:0,y:0,width:1,height:1}},projection:'top-down',origin:{x:0,y:0},proposals:[]};
   const raster=await window.diagramRasterReader.readRaster(page,new AbortController().signal),result=await window.diagramRecognition.propose(draft,raster,window.diagramRecognition.recognizers[0],new AbortController().signal);
   return result.proposals.map(p=>({type:p.type,shape:p.recognition.shape,path:p.recognition.sourceImage.path,status:p.recognition.scaleStatus,accepted:p.accepted}));
  });
  assert.equal(geometry.length,3);assert.deepEqual(geometry.map(p=>p.shape).sort(),['circle','line','rectangle']);assert.equal(geometry.filter(p=>p.type==='unknown').length,2);assert.ok(geometry.every(p=>!p.accepted&&p.status==='uncalibrated'&&p.path.startsWith('diagram-imports/')));
  await page.reload();await install();const reopened=await page.evaluate(async source=>Array.from(new Uint8Array(await(await window.diagramAssets.readBlob(source)).arrayBuffer())),result.source);assert.deepEqual(reopened,result.before);
  const directory=path.resolve(__dirname,'../.expo/diagram-browser');fs.mkdirSync(directory,{recursive:true});const downloadPromise=page.waitForEvent('download');await page.evaluate(async source=>window.diagramAssets.openOriginal(source),result.source);const download=await downloadPromise;assert.equal(download.suggestedFilename(),'Synthetic printed plan.png');await download.saveAs(path.join(directory,'original-reference.png'));assert.deepEqual(Array.from(fs.readFileSync(path.join(directory,'original-reference.png'))),result.before);fs.writeFileSync(path.join(directory,'corrected-synthetic.png'),Buffer.from(result.png.split(',')[1],'base64'));
  console.log('PASS: actual browser image decode, quadrilateral warp, rotation, crop, unchanged original, IndexedDB reload, byte-exact original download, explicit PDF fallback, decoded-raster geometry proposals with provenance. Synthetic images only; no native or real-diagram recognition test.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
