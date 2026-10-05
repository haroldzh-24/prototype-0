// Run against an isolated Chromium browser launched with --remote-debugging-port=9228.
// Start Expo at localhost:8087 first. This test only uses its isolated local database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:8087';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const pages = await (await fetch('http://localhost:9228/json/list')).json();
  const page = pages.find(p => p.type === 'page' && p.url.startsWith('http://localhost:808'));
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
    for (let i = 0; i < 100; i++) { const body=await evaluate('document.body?.innerText ?? ""'); if (text === 'SAVED' ? body.split('\n').includes('SAVED') && !body.includes('Saving...') : body.toLowerCase().includes(text.toLowerCase())) return; await sleep(300); }
    throw new Error('Missing text: ' + text + '\n' + await evaluate('document.body.innerText'));
  };
  const click = async name => {
    const found = await evaluate(`(() => { const e = [...document.querySelectorAll('[role="button"],button,a')].reverse().find(e => (e.getAttribute('aria-label') || e.innerText).trim().toUpperCase() === ${JSON.stringify(name.toUpperCase())} && e.getAttribute('aria-disabled') !== 'true'); if (!e) return false; e.click(); return true; })()`);
    assert.ok(found, 'Button: ' + name); await sleep(350);
  };
  const fill = async (label, value) => {
    await evaluate(`(() => { const e = document.querySelector('input[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(200);
  };
  const capture = async surface => {
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), surface + ': no horizontal page overflow');
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '../.expo/overhaul-' + (process.env.SMOKE_WIDTH || 390) + '-' + surface + '.png'), Buffer.from(screenshot.data, 'base64'));
  };
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    socket.addEventListener('message', e => { const d = JSON.parse(e.data); if (d.method === 'Page.javascriptDialogOpening' && d.params.type === 'beforeunload') void send('Page.handleJavaScriptDialog', { accept: true }); });
    try { await send('Page.handleJavaScriptDialog', { accept: true }); } catch { /* No pending test-browser dialog. */ }
    await send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.SMOKE_WIDTH || 390), height: Number(process.env.SMOKE_HEIGHT || 844), deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await send('Page.navigate', { url: baseUrl + '/' });
    await waitText('Plan your next stage. Prepare for your next session.');
    await capture('home');
    await click('Open STAGE PLANNER'); await waitText('MATCHES');
    await capture('matches');
    const name = 'Browser smoke ' + Date.now();
    await click('+ MATCH'); await fill('Match name', name + ' match'); await click('Create Match');
    await waitText('STAGES');
    await capture('stages');
    await click('+ STAGE'); await waitText('Open Stage Designer');
    await fill('Stage name', name);
    await click('Open Stage Designer'); await waitText('SELECT');
    await capture('designer');
    const rect = testId => evaluate(`(() => { const r = document.querySelector('[data-testid="${testId}"]').getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()`);
    const zoomText = async () => { await click('Stage tools'); const value = await evaluate("document.querySelector('[data-testid=stage-zoom]').innerText"); await click('Done'); return value; };
    const touch = async (type, points) => { await send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p,i) => ({ ...p, id:i, radiusX:2, radiusY:2 })) }); await sleep(100); };
    const center = r => ({ x:r.x+r.width/2, y:r.y+r.height/2 });
    const canvasBefore = await rect('stage-canvas'), objectBefore = await rect('stage-object-start-1');
    const blank = { x:canvasBefore.x+180, y:canvasBefore.y+50 };
    await touch('touchStart',[blank]);
    await touch('touchMove',[{x:blank.x+30,y:blank.y+20}]); await touch('touchEnd',[]);
    const panned = await rect('stage-object-start-1');
    assert.ok(Math.abs(panned.x-objectBefore.x-30)<1, 'Background drag pans the viewport');
    assert.deepEqual(await rect('stage-canvas'),canvasBefore, 'Page/canvas frame stays fixed while panning');
    assert.equal(await evaluate('window.scrollY'),0);
    await click('Fit');
    await touch('touchStart',[{x:120,y:blank.y},{x:220,y:blank.y}]);
    await touch('touchMove',[{x:70,y:blank.y},{x:270,y:blank.y}]); await touch('touchEnd',[]);
    assert.equal(await zoomText(),'200%');
    await click('Fit');
    const start = center(await rect('stage-object-start-1'));
    await touch('touchStart',[start]); await touch('touchMove',[{x:start.x+30,y:start.y+20}]); await touch('touchEnd',[]);
    assert.deepEqual(await rect('stage-canvas'),canvasBefore, 'Selection and object drag do not resize the viewport');
    await click('Edit');
    const physical = await evaluate(`[document.querySelector('input[aria-label="X"]').value, document.querySelector('input[aria-label="Y"]').value]`);
    assert.notEqual(physical[0],'1.666667','Object drag changes physical X'); await click('Done');
    const movedCenter = center(await rect('stage-object-start-1'));
    await touch('touchStart',[movedCenter]);
    await touch('touchStart',[movedCenter,{x:movedCenter.x+90,y:movedCenter.y}]);
    await touch('touchMove',[movedCenter,{x:movedCenter.x+135,y:movedCenter.y}]); await touch('touchEnd',[]);
    assert.equal(await zoomText(),'150%');
    await click('Fit'); await click('Edit');
    assert.deepEqual(await evaluate(`[document.querySelector('input[aria-label="X"]').value, document.querySelector('input[aria-label="Y"]').value]`),physical,'Pinching from an object does not move its physical coordinates');
    await click('Done');
    for (const label of ['USPSA Metric (CHL)', 'USPSA 8-inch round plate', 'Mini Pepper Popper (Blue Steel)']) {
      await click('ADD'); await click(label);
      const c = await rect('stage-canvas'), point = center(c);
      await touch('touchStart',[point]); await touch('touchEnd',[]); await click('Done');
    }
    for (const mode of ['Draw Wall','Draw Fault Line']) {
      await click('DRAW'); await click(mode === 'Draw Wall' ? 'WALL' : 'FAULT LINE'); const c = await rect('stage-canvas');
      const a = { x:c.x+c.width*.3,y:c.y+c.height*.5 }, b = { x:c.x+c.width*.6,y:a.y };
      await touch('touchStart',[a]); await touch('touchMove',[b]); await touch('touchEnd',[]); await click('Done');
    }
    await click('ADD'); await click('Start Position');
    await click('Rotate'); await click('Edit'); assert.equal(await evaluate(`document.querySelector('input[aria-label="Rotation (degrees)"]').value`), '15'); await click('Done');
    await click('Stage tools'); await click('2.5D Preview'); await waitText('2.5D / READ ONLY'); await click('Back');
    await click('Stage tools'); await click('Loadout'); await click('ADD MAGAZINE');
    await fill('Magazine capacity', '20'); await fill('Magazine loaded rounds', '13');
    await click('APPLY MAGAZINE'); await click('USE AS STARTING MAGAZINE');
    await waitText('Total available'); assert.ok(await evaluate(`!!document.querySelector('[aria-label="Total available: 13"]')`));
    await click('Done');
    await click('Route'); await waitText('NO ROUTE YET');
    assert.ok(!(await evaluate('document.body.innerText')).includes('Distance'), 'Route statistics stay in the summary');
    await click('EDIT'); await click('ADD WAYPOINT'); const routeCanvas = await rect('stage-canvas'); await touch('touchStart',[{x:routeCanvas.x+routeCanvas.width*.5,y:routeCanvas.y+routeCanvas.height*.6}]); await touch('touchEnd',[]); await click('WAYPOINT 1'); await click('TARGETS'); await click('+ ASSIGN TARGET'); await waitText('WAYPOINT 1');
    await click('Mark visible'); await click('Engage here'); await click('Done');
    await click('WAYPOINT 1'); await click('RELOAD'); await click('Reload: Magazine 1 (13 rounds)'); await click('Done');
    await click('DONE'); await click('ANALYZE'); await waitText('Waypoints'); assert.ok(await evaluate(`!!document.querySelector('[aria-label="Waypoints: 1"]')`)); await waitText('Movement');
    await click('Done'); await click('BUILD');
    await click('Stage tools'); await click('Overlay / View Settings'); await click('Grid / ON'); await click('Route / ON'); await click('Done');
    await click('Stage tools'); await click('Overlay / View Settings'); await click('Grid / OFF'); await click('Route / OFF'); await click('Done');
    await click('Save'); await waitText('SAVED');
    await click('Back'); await waitText('STAGES');
    await waitText(name); await click('Open ' + name);
    await waitText('SELECT'); assert.ok((await evaluate('document.body.innerText')).includes(name));
    await send('Page.reload'); await waitText('SELECT');
    await click('ADD'); await click('Start Position'); await click('Edit'); assert.equal(await evaluate(`document.querySelector('input[aria-label="Rotation (degrees)"]').value`), '15'); await click('Done');
    await click('Stage tools'); await click('Loadout'); await waitText('Total available'); assert.ok(await evaluate(`!!document.querySelector('[aria-label="Total available: 13"]')`)); await waitText('Starting in firearm'); await click('Done');
    const editorShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '../.expo/browser-editor.png'), Buffer.from(editorShot.data, 'base64'));
    await click('Edit stage name'); await fill('Stage name', name + ' dirty'); await click('Done'); await click('Back'); await waitText('UNSAVED CHANGES');
    await click('DISCARD CHANGES AND CLOSE'); await waitText('STAGES');
    await waitText(name);
    await click('Actions for ' + name); await click('Duplicate'); await waitText(name + ' (copy)');
    await click('Actions for ' + name + ' (copy)'); await click('Rename'); await fill('Stage name', name + ' renamed'); await click('APPLY NAME'); await waitText(name + ' renamed');
    await click('Actions for ' + name + ' renamed'); await click('Delete'); await click('Delete');
    await waitText(name);
    assert.ok(!(await evaluate('document.body.innerText')).includes(name + ' renamed'));
    await send('Page.navigate', { url: baseUrl + '/training' }); await waitText('+ SESSION');
    await capture('training');
    const sessions = () => evaluate('[...document.querySelectorAll("[role=button]")].filter(e => (e.getAttribute("aria-label") || "").startsWith("Open ")).length');
    const beforeSessions = await sessions(); await click('+ SESSION'); await capture('new-session'); await click('CREATE SESSION');
    for (let i = 0; i < 30 && await sessions() === beforeSessions; i++) await sleep(200);
    assert.equal(await sessions(), beforeSessions + 1, 'Create Session persists one additional session');
    await send('Page.navigate', { url: baseUrl + '/account' }); await waitText('Local shooter');
    await capture('profile');
    await send('Page.navigate', { url: baseUrl + '/' }); await waitText('Plan your next stage. Prepare for your next session.');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'No horizontal page overflow');
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '../.expo/browser-home.png'), Buffer.from(screenshot.data, 'base64'));
    assert.deepEqual(errors, []);
    console.log('PASS: Phone layout, touch pan/pinch/object drag and handoff, target presets and drawing tools, inspectors, preview, loadout, route assignment/reload/summary, visibility controls, save/reopen, unsaved guard, stage CRUD, Training and Account.');
  } finally { socket.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
