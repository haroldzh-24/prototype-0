// Uses the isolated Expo/Chromium database on ports 8087/9228. No production data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const pages = await (await fetch('http://localhost:9228/json/list')).json();
  const page = pages.find(p => p.type === 'page' && p.url.includes(':8087'));
  assert.ok(page, 'Open the isolated Expo browser');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), report = [];
  const output = path.resolve(__dirname, '../.expo');
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(method + ' timed out')); }, 30000);
    pending.set(key, data => { clearTimeout(timer); data.error ? reject(Error(JSON.stringify(data.error))) : resolve(data.result); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const text = () => evaluate('document.body.innerText');
  const wait = async label => {
    for (let i = 0; i < 100; i++) { if ((await text()).includes(label)) return; await pause(300); }
    const body = await text();
    if (body.includes('Opening your saved data') || body.includes('OPFS')) throw Error('BROWSER STORAGE BLOCKED: ' + body);
    throw Error('Missing ' + label + '\n' + body);
  };
  const click = async (label, prefix = false) => {
    const found = await evaluate(`(() => { const e = [...document.querySelectorAll('[role=button],[role=radio],button,a')].reverse().find(e => { const s=(e.getAttribute('aria-label') || e.innerText).trim().toUpperCase(); return e.getClientRects().length && e.getAttribute('aria-disabled') !== 'true' && (s ${prefix ? '.startsWith(' : '=== ('}${JSON.stringify(label.toUpperCase())})); }); if(!e) return false; e.scrollIntoView({block:'nearest'}); e.click(); return true; })()`);
    assert.ok(found, 'Reachable control: ' + label + '\n' + await text()); await pause(250);
  };
  const fill = async (label, value) => {
    await evaluate(`(() => { const e = [...document.querySelectorAll('input')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}); if(!e) throw Error('Input missing'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`); await pause(100);
  };
  const rect = async selector => evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  const touch = async (type, points) => { await send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ ...p, id: i, radiusX: 2, radiusY: 2 })) }); await pause(100); };
  const tap = async point => { await touch('touchStart', [point]); await touch('touchEnd', []); };
  const capture = async surface => {
    for (const [width, height] of [[390,844], [375,667], [320,568]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true }); await pause(200);
      const layout = await evaluate(`(() => { const c=document.querySelector('[data-testid=stage-canvas]')?.getBoundingClientRect(); const save=[...document.querySelectorAll('[role=button]')].find(e=>e.innerText==='Save analysis')?.getBoundingClientRect(); return {overflow:document.documentElement.scrollWidth>innerWidth, canvas:c?{width:c.width,height:c.height}:null,saveVisible:save?save.top>=0&&save.bottom<=innerHeight:null}; })()`);
      report.push({ surface, width, height, ...layout });
      assert.equal(layout.overflow, false, surface + ' at ' + width);
      if (surface.startsWith('video-')) assert.equal(layout.saveVisible, true, 'Fixed video Save at ' + width);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, `final-${surface}-${width}.png`), Buffer.from(shot.data, 'base64'));
      // Browser text stress is supplemental; it does not emulate native Dynamic Type.
      await evaluate(`(() => { globalThis.uiTextStress=[...document.querySelectorAll('[dir=auto]')].map(e=>{const c=getComputedStyle(e);return {e,font:e.style.fontSize,line:e.style.lineHeight,size:parseFloat(c.fontSize),height:parseFloat(c.lineHeight)}}); for(const s of uiTextStress){s.e.style.fontSize=s.size*2+'px';if(Number.isFinite(s.height))s.e.style.lineHeight=s.height*2+'px';} })()`);
      await pause(150);
      const stress = await evaluate(`(() => {const save=[...document.querySelectorAll('[role=button]')].find(e=>e.innerText==='Save analysis')?.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,saveVisible:save?save.top>=0&&save.bottom<=innerHeight:null}})()`);
      report.push({ surface, width, height, textScale:2, ...stress });
      assert.equal(stress.overflow,false,surface+' enlarged text at '+width);
      if(surface.startsWith('video-')) assert.equal(stress.saveVisible,true,'Save with enlarged browser text');
      const stressShot=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,`final-${surface}-${width}-text2x.png`),Buffer.from(stressShot.data,'base64'));
      await evaluate(`(() => {for(const s of uiTextStress){s.e.style.fontSize=s.font;s.e.style.lineHeight=s.line;}delete globalThis.uiTextStress})()`);
    }
    await send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true }); await pause(200);
    console.log('PASS ' + surface + ' at all three widths');
  };
  try {
    await send('Page.enable'); await send('Emulation.setTouchEmulationEnabled', { enabled:true });
    socket.addEventListener('message', event => { const data=JSON.parse(event.data); if(data.method==='Page.javascriptDialogOpening' && data.params.type==='beforeunload') void send('Page.handleJavaScriptDialog',{accept:true}); });
    try { await send('Page.handleJavaScriptDialog',{accept:true}); } catch { /* No pending dialog. */ }
    // Reuse Home without reloading an already-open SQLite browser connection.
    if ((await text()).includes('SELECT') && (await text()).includes('BUILD')) await click('Back');
    for(let i=0;i<3 && !(await text()).includes('Prepare for your next session.');i++) await click('‹ Back');
    await wait('Prepare for your next session.');
    await capture('home'); await click('Open STAGE PLANNER'); await wait('MATCHES'); await capture('matches');
    const name = 'Final review ' + Date.now() + ' ' + 'long stage and match name '.repeat(2);
    await click('+ MATCH'); await fill('Match name', name); await click('Create Match'); await wait('STAGES'); await capture('stages');
    await click('+ STAGE'); await fill('Stage name', name); await click('Open Stage Designer'); await wait('SELECT'); await capture('build');
    let r = await rect('[data-testid=stage-object-target-1]'); await tap({x:r.x+r.width/2,y:r.y+r.height/2}); await wait('DUPLICATE'); await capture('build-target');
    await click('EDIT'); await capture('object-sheet'); await click('Done'); await click('Deselect');
    await click('DRAW'); await click('WALL'); await capture('drawing'); await click('DONE');
    // Small deterministic UI-created fixture keeps the bounded planner run fast.
    for (const objectId of ['wall-1','wall-2','wall-3','target-2','target-3']) {
      r=await rect('[data-testid="stage-object-'+objectId+'"]'); await tap({x:r.x+r.width/2,y:r.y+r.height/2});
      await click('DELETE'); await click('Delete object');
    }
    await click('Stage tools'); await click('Loadout'); await click('Add Magazine'); await fill('Magazine capacity','30'); await fill('Magazine loaded rounds','30'); await click('Apply Magazine'); await click('Done');
    await click('Stage tools'); await click('Target Rounds');
    const labels = await evaluate("[...document.querySelectorAll('input')].map(e=>e.getAttribute('aria-label')).filter(s=>s?.startsWith('Planned rounds for '))");
    for (const label of labels) { await fill(label,'2'); await evaluate(`(() => {const e=[...document.querySelectorAll('input')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}); const b=e.parentElement.querySelector('[role=button]');b.click()})()`); await pause(100); }
    await click('Done'); await click('ROUTE'); await capture('route'); await click('PLAN'); await capture('plan');
    await click('CONFIGURE'); await capture('route-settings'); await click('FIRING AREAS', true); await click('Add whole-stage firing area'); await click('APPLY ROUTE SETTINGS'); await click('GENERATE ROUTE'); await wait('ROUTE FOUND'); await capture('route-result');
    await click('VIEW ON STAGE'); assert.ok(!(await text()).split('\n').includes('Save'), 'Preview has no Save'); await capture('route-preview'); await click('Back to results'); await click('USE ROUTE');
    await click('EDIT'); await click('ADD WAYPOINT'); r = await rect('[data-testid=stage-canvas]'); await tap({x:r.x+r.width*.5,y:r.y+r.height*.7}); await wait('WAYPOINT'); await capture('waypoint-selected');
    await click('WAYPOINT', true); await fill('Waypoint label','Long waypoint label for review'); await click('TARGETS'); await capture('waypoint-targets'); await click('Back to waypoint'); await click('RELOAD'); await capture('waypoint-reload'); await click('Done'); await click('DONE');
    await click('ANALYZE'); await capture('route-analysis'); await click('Done'); await click('Save'); await pause(500); await click('Back'); await wait('STAGES');
    await click('‹ Back'); await wait('MATCHES'); await click('‹ Back'); await wait('Prepare for your next session.');
    await click('Open TRAINING'); await wait('+ SESSION'); await capture('training'); await click('+ SESSION'); await capture('create-session');
    const sessionName='Final video review '+Date.now(); await fill('SESSION NAME',sessionName); await click('CREATE SESSION'); await wait(sessionName); await click('Open '+sessionName); await click('ADD VIDEO');
    // Deliberately unsupported media verifies annotation/error fallback, not AV playback.
    await evaluate(`(() => {const e=document.querySelector('input[type=file]');const d=new DataTransfer();d.items.add(new File([new Uint8Array([0,0,0,0])],'a-very-long-original-video-filename-for-responsive-review.mp4',{type:'video/mp4'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait('Save analysis');
    for (const section of ['TIMELINE','ANALYZE','COMPARE','RESULTS']) { await click(section); await capture('video-'+section.toLowerCase()); }
    await click('TIMELINE'); await click('+ Add event'); await capture('event-sheet'); await fill('Marker milliseconds','invalid'); await click('Add marker at entered ms'); await wait('finite'); await capture('event-error'); await click('Cancel');
    await click('Save analysis'); await pause(500); await click('Close analysis'); await wait('+ SESSION');
    await click('‹ Back'); await wait('Prepare for your next session.'); await click('Open PROFILE'); await wait('LOCAL PROFILE'); await capture('profile');
    console.log('PASS: final source UI browser journey and responsive captures');
  } finally {
    fs.writeFileSync(path.join(output,'final-ui-layout.json'), JSON.stringify(report,null,2)); socket.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
