const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {detectGeometry}=require('../src/diagramImport/geometryDetector.ts'),{evaluateDetections}=require('../src/diagramImport/evaluation.ts'),{render}=require('../tests/fixtures/diagram-recognition/render.cjs');
async function main(){
 const directory=path.resolve(process.argv[2]||path.join(__dirname,'../tests/fixtures/diagram-recognition')),results=[];
 for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.json')).sort()){
  const sample=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));
  if(!Number.isInteger(sample.width)||!Number.isInteger(sample.height)||sample.width<8||sample.height<8||sample.width>1024||sample.height>1024)throw Error('Fixture raster must be bounded to 8-1024 pixels per side.');
  let raster;
  if(sample.origin==='synthetic')raster=render(sample);else{const raw=path.resolve(directory,sample.rgbaFile);if(!raw.startsWith(directory+path.sep)||fs.statSync(raw).size!==sample.width*sample.height*4)throw Error('Real fixture needs a local, exact-size RGBA file.');raster={width:sample.width,height:sample.height,rgba:new Uint8ClampedArray(fs.readFileSync(raw))};}
  const started=performance.now(),result=await detectGeometry(raster,new AbortController().signal);results.push({id:sample.id,origin:sample.origin,metrics:evaluateDetections(sample.expected,result.proposals,sample,sample.scale),elapsedMs:Math.round((performance.now()-started)*10)/10,diagnostics:result.diagnostics,warnings:result.warnings});
 }
 const report={note:'Synthetic results are algorithm fixtures, not evidence of real-world recognition accuracy. No automatic scale extraction is implemented.',samples:results};
 const out=path.resolve(__dirname,'../.expo/diagram-recognition-evaluation.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
