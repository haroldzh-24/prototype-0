// Run against an isolated Chromium browser launched with --remote-debugging-port=9228.
// Start Expo at localhost:8087 first. This test only uses its isolated local database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:8087';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const pages = await (await fetch('http://localhost:9228/json/list')).json();
  const page = pages.find(p => p.type === 'page' && p.url.includes(':8087'));
  assert.ok(page, 'Open localhost:8087 in the test browser');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text + ': ' + (data.params.exceptionDetails.exception?.description || ''));
    if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error('Timed out: ' + method)); }, 60000);
    pending.set(key, data => { clearTimeout(timer); data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitText = async text => {
    for (let i = 0; i < 400; i++) { if ((await evaluate('document.body?.innerText ?? ""')).toLowerCase().includes(text.toLowerCase())) return; await sleep(300); }
    throw new Error('Missing text: ' + text + '\n' + await evaluate('document.body.innerText'));
  };
  const click = async name => {
    const found = await evaluate(`(() => { const e = [...document.querySelectorAll('[role="button"],[role="radio"],button,a')].reverse().find(e => (e.getAttribute('aria-label') || e.innerText).trim().toUpperCase() === ${JSON.stringify(name.toUpperCase())} && e.getAttribute('aria-disabled') !== 'true'); if (!e) return false; e.click(); return true; })()`);
    assert.ok(found, 'Button: ' + name); await sleep(350);
  };
  const fill = async (label, value) => {
    await evaluate(`(() => { const e = document.querySelector('input[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(200);
  };
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    socket.addEventListener('message', e => { const d=JSON.parse(e.data); if(d.method==='Page.javascriptDialogOpening' && d.params.type==='beforeunload') void send('Page.handleJavaScriptDialog',{accept:true}); });
    await send('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
    await send('Emulation.setTouchEmulationEnabled', { enabled:true });
    await send('Page.navigate',{url:baseUrl+'/'}); await waitText('YOUR NEXT SESSION');
    await click('STAGE PLANNER \u2192'); await waitText('MATCHES');
    const name='Designer tools '+Date.now();
    await click('+ MATCH'); await fill('Match name',name); await click('Create Match'); await waitText('Back to Matches');
    await click('+ STAGE'); await fill('Stage name',name); await click('Open Stage Designer'); await waitText('STAGE EDITOR');
    const rect=selector=>evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()');
    const objects=()=>evaluate('[...document.querySelectorAll("[data-testid^=stage-object-]")].map(e=>e.dataset.testid)');
    const canvas=()=>rect('[data-testid="stage-canvas"]');
    const touch=async(type,points)=>{await send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i,radiusX:2,radiusY:2}))});await sleep(100);};
    const tap=async p=>{await touch('touchStart',[p]);await touch('touchEnd',[]);};
    const drag=async(a,b)=>{await touch('touchStart',[a]);await touch('touchMove',[b]);await touch('touchEnd',[]);};
    for(let i=0;i<200 && !(await objects()).length;i++)await sleep(100);
    const initialObjects=await objects();assert.ok(initialObjects.length>0,'Canvas finished layout');const base=initialObjects.length;
    await click('ADD'); await waitText('USPSA Metric (CHL)'); await click('USPSA Metric (CHL)'); await waitText('Tap to place');
    let c=await canvas(),a={x:c.x+c.width*.4,y:c.y+c.height*.4};
    await tap(a);await tap({x:a.x+45,y:a.y+20});
    assert.equal((await objects()).length,base+2,'Repeated placement remains active');
    const first=(await objects()).find(id=>!initialObjects.includes(id));
    await drag({x:a.x-45,y:a.y+15},{x:a.x-20,y:a.y+40});assert.equal((await objects()).length,base+2,'Pan never places');
    await touch('touchStart',[{x:a.x-30,y:a.y},{x:a.x+30,y:a.y}]);await touch('touchMove',[{x:a.x-50,y:a.y},{x:a.x+50,y:a.y}]);await touch('touchEnd',[]);assert.equal((await objects()).length,base+2,'Pinch never places');
    await click('Fit');await click('Done');assert.equal((await objects()).length,base+2,'Toolbar never places');
    await click('Stage tools'); await click('UNDO EDIT'); await click('Done');assert.equal((await objects()).length,base+1,'Pan/pinch produce no undo entries');await click('Stage tools'); await click('REDO EDIT'); await click('Done');assert.equal((await objects()).length,base+2);
    await click('DRAW'); await click('WALL'); c=await canvas();a={x:c.x+c.width*.25,y:c.y+c.height*.3};let b={x:a.x+80,y:a.y};
    const beforeWall=await objects();await drag(a,b);assert.equal((await objects()).length,base+3,'Wall drag commits');const newWall=(await objects()).find(id=>!beforeWall.includes(id));
    await tap({x:b.x,y:b.y+55});assert.equal((await objects()).length,base+4,'Connected second segment');
    await click('UNDO SEGMENT');assert.equal((await objects()).length,base+3);
    await click('Cancel current segment');await click('Done');
    await click('DRAW'); await click('FAULT LINE');c=await canvas();await drag({x:c.x+c.width*.35,y:c.y+c.height*.55},{x:c.x+c.width*.65,y:c.y+c.height*.65});assert.equal((await objects()).length,base+4);await click('Done');
    await click('ADD');await click('PCSL');await click('PCSL Mini Practical');c=await canvas();await tap({x:c.x+c.width*.72,y:c.y+c.height*.55});
    await click('Done');
    // Select the first newly placed target by its stable saved ID.
    let r=await rect('[data-testid="'+first+'"]');await tap({x:r.x+r.width/2,y:r.y+r.height/2});await click('Edit');await click('Advanced +'); await waitText('Preset: USPSA Metric');
    await fill('Rotation (degrees)','359');await click('Apply changes');await click('Done');
    const angle=await evaluate('document.body.innerText');assert.ok(angle.includes('359.0\u00b0'));
    const wheel=await rect('[aria-label="Drag target rotation wheel"]');const w={x:wheel.x+22,y:wheel.y+22};await drag(w,{x:w.x+18,y:w.y+2});
    await click('Edit');const rotation=Number(await evaluate(`document.querySelector('input[aria-label="Rotation (degrees)"]').value`));assert.ok(rotation>=0&&rotation<359,'Wheel crossed zero');await click('Done');await click('Stage tools'); await click('UNDO EDIT'); await click('Done');await click('Edit');assert.equal(Number(await evaluate(`document.querySelector('input[aria-label="Rotation (degrees)"]').value`)),359);await click('Done');await click('Stage tools'); await click('REDO EDIT'); await click('Done');
    r=await rect('[data-testid="'+newWall+'"]');await tap({x:r.x+r.width/2,y:r.y+r.height/2});
    const endpointBefore=await rect('[aria-label="Drag segment end"]');
    await drag({x:endpointBefore.x+22,y:endpointBefore.y+22},{x:endpointBefore.x+47,y:endpointBefore.y+42});
    const endpointAfter=await rect('[aria-label="Drag segment end"]');assert.notDeepEqual(endpointAfter,endpointBefore,'Endpoint handle edits geometry');
    await click('Stage tools'); await click('UNDO EDIT'); await click('Done');assert.deepEqual(await rect('[aria-label="Drag segment end"]'),endpointBefore,'Endpoint drag is one undo action');await click('Stage tools'); await click('REDO EDIT'); await click('Done');
    await click('Edit');await fill('Length','2.125');await fill('Rotation (degrees)','45');await click('Apply changes');
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Length"]').value`),'2.125');
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Rotation (degrees)"]').value`),'45');await click('Done');
    await click('Save');await waitText('Saved on this device.');const count=(await objects()).length;await send('Page.reload');await waitText('STAGE EDITOR');assert.equal((await objects()).length,count,'Reopen retains all objects');
    r=await rect('[data-testid="'+first+'"]');await tap({x:r.x+r.width/2,y:r.y+r.height/2});await click('Edit');await click('Advanced +'); await waitText('Preset: USPSA Metric');assert.equal(Number(await evaluate(`document.querySelector('input[aria-label="Rotation (degrees)"]').value`)),rotation);await click('Done');
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname, '../.expo/designer-tools.png'),Buffer.from(shot.data,'base64'));
    assert.deepEqual(errors,[]);console.log('PASS: 390x844 browser touch placement, pan/pinch guards, connected walls, fault line, tool changes, undo/redo, wheel and numeric rotation, endpoint dragging/numeric edits, save/reopen.');
  } finally { socket.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
