// Isolated test-only Metro entry + CDP. No SQLite or production model substitution.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;height:100%;background:#101722}#root{display:flex}</style><div id="root"></div><script src="http://localhost:8087/tests/route-ai-browser-entry.bundle?platform=web&dev=true&hot=false"></script>');});
  await new Promise(r=>server.listen(8088,'127.0.0.1',r));
  const pages=await(await fetch('http://localhost:9228/json/list')).json(),page=pages.find(p=>p.type==='page');assert.ok(page);
  const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let serial=0;const pending=new Map(),errors=[],report=[];
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){pending.get(data.id)?.(data);pending.delete(data.id);}else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},45000);pending.set(id,d=>{clearTimeout(timer);d.error?reject(Error(JSON.stringify(d.error))):resolve(d.result);});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const body=()=>evaluate('document.body?.innerText??""');
  const wait=async text=>{for(let i=0;i<120;i++){if((await body()).includes(text))return;await pause(250);}throw Error('Missing '+text+'\n'+await body()+'\n'+JSON.stringify(errors));};
  const click=async title=>{assert.ok(await evaluate(`(()=>{const e=[...document.querySelectorAll('[role=button]')].reverse().find(e=>e.getClientRects().length&&e.innerText.trim()===${JSON.stringify(title)});if(!e||e.getAttribute('aria-disabled')==='true')return false;e.scrollIntoView({block:'nearest'});e.click();return true;})()`),title+' reachable');await pause(100);};
  const message=async text=>{await evaluate(`(()=>{const e=document.querySelector('textarea[aria-label="Ask about this route"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(100);await click('SEND');for(let i=0;i<120;i++){if(await evaluate('!routeAISmoke.state.phase'))break;await pause(100);}assert.equal(await evaluate('!!routeAISmoke.state.phase'),false,'request settled');await pause(150);};
  const output=path.resolve(__dirname,'../.expo');fs.mkdirSync(output,{recursive:true});
  const layout=async(name,width,height)=>{const result=await evaluate(`(()=>{const input=document.querySelector('textarea');const r=input?.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,composerVisible:r?r.top>=0&&r.bottom<=innerHeight:null};})()`);assert.equal(result.overflow,false,name+' overflow');if(name==='sheet')assert.equal(result.composerVisible,true);report.push({name,width,height,...result});const image=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`route-ai-${name}-${width}.png`),Buffer.from(image.data,'base64'));};
  try{
    await send('Runtime.enable');
    for(const [width,height] of [[390,844],[375,667],[320,568]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await send('Page.navigate',{url:'http://127.0.0.1:8088/?mock='+width});await wait('Route AI smoke');await pause(200);
      await layout('toolbar',width,height);await click('ASK');await wait('OFFLINE');await layout('sheet',width,height);
      await evaluate(`(()=>{const e=document.querySelector('textarea[aria-label="Ask about this route"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'long route question '.repeat(30));e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);await pause(100);
      await layout('long-composer',width,height);
      assert.equal(await evaluate(`(()=>{const e=document.querySelector('textarea');const r=e.getBoundingClientRect();const send=[...document.querySelectorAll('[role=button]')].find(b=>b.innerText.trim()==='SEND');const b=send.getBoundingClientRect();return e.scrollWidth<=e.clientWidth&&r.bottom<=innerHeight&&b.bottom<=innerHeight&&send.getAttribute('aria-disabled')!=='true';})()`),true,'long input wraps and Send is reachable');
      await evaluate(`(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);await pause(100);
      await click('How long is this route?');await wait('MOCK TIMING');assert.ok(await evaluate('routeAISmoke.state.messages.at(-1).text.includes("distanceInches")'));
      await message('Move waypoint 2 two yards left');await wait('PROPOSED CHANGE');assert.equal(await evaluate('routeAISmoke.plan.route.positions[1].position.x'),150);
      await click('VIEW ON STAGE');await wait('PROPOSED 2');await layout('ghost',width,height);await evaluate('routeAISmoke.zoom()');await pause(150);assert.equal(await evaluate('routeAISmoke.state.preview.proposedRoute.positions[1].position.x'),78);
      await click('ASK');await click('CANCEL');assert.equal(await evaluate('routeAISmoke.state.preview===undefined'),true);
      await message('Move that waypoint two yards left');await wait('Which waypoint do you mean?');await click('Waypoint 2 (W2)');await wait('PROPOSED CHANGE');await click('APPLY');await wait('Applied.');assert.equal(await evaluate('routeAISmoke.plan.route.positions[1].position.x'),78);assert.ok((await body()).includes('UNSAVED'));
      await message('Undo that');await wait('UNDO LAST ASSISTANT CHANGE');await click('APPLY');await wait('Reverted the previous route change.');assert.equal(await evaluate('routeAISmoke.plan.route.positions[1].position.x'),150);
      await message('Move waypoint 2 two yards left');await wait('PROPOSED CHANGE');await evaluate('routeAISmoke.manualChange()');await wait('ROUTE CHANGED');await click('RECALCULATE');await wait('PROPOSED CHANGE');await click('CANCEL');await click('Done');await click('SAVE');assert.equal(await evaluate('routeAISmoke.state.preview===undefined'),true);
      await click('ASK');
      await evaluate('(()=>{const c=routeAISmoke.controller;globalThis.originalInterpret=c.adapter.interpret;c.adapter.interpret=()=>new Promise(r=>globalThis.finishSlow=r);return true;})()');
      await evaluate(`(()=>{const e=document.querySelector('textarea[aria-label="Ask about this route"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(e,"Slow request");e.dispatchEvent(new Event("input",{bubbles:true}));return true;})()`);await pause(100);await click('SEND');await wait('Understanding');
      assert.equal(await evaluate('document.querySelector("textarea").value'), '');
      assert.equal(await evaluate('document.querySelector("textarea").readOnly'),true);
      assert.equal(await evaluate('routeAISmoke.controller.send("duplicate").then(r=>r.status)'), 'ignored');
      await click('CANCEL');await wait('REQUEST CANCELLED');
      await evaluate('(()=>{const c=routeAISmoke.controller;c.adapter.interpret=originalInterpret;finishSlow({intent:"QUERY_DISTANCE"});return true;})()');await pause(100);
      assert.equal(await evaluate('routeAISmoke.state.preview===undefined'),true);
      assert.equal(await evaluate('routeAISmoke.state.messages.some(m=>m.status==="pending")'),false);
      report.push({name:'busy cancellation',width,height,composerDisabled:true,duplicateIgnored:true,lateResultDiscarded:true});
      report.push({name:'mock journey',width,height,query:true,clarification:true,cancel:true,apply:true,dirty:true,explicitSave:true,undo:true,stale:true,zoomIndependent:true});
      await send('Page.navigate',{url:'http://127.0.0.1:8088/?unavailable=1'});await wait('Route AI smoke');await click('ASK');await wait("On-device Route AI isn't available on this device.");await layout('unavailable',width,height);assert.equal(await evaluate('document.querySelector("textarea").readOnly'),true);
    }
    assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(output,'route-ai-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:report.length,sizes:3,nativePerformance:'not measured',report:'.expo/route-ai-browser-report.json'},null,2));
  }finally{socket.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
