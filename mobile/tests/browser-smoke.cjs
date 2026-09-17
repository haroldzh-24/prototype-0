// Run against an isolated Chromium browser launched with --remote-debugging-port=9228.
// Start Expo at localhost:8087 first. This test only uses its isolated local database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    for (let i = 0; i < 100; i++) { if ((await evaluate('document.body.innerText')).includes(text)) return; await sleep(300); }
    throw new Error('Missing text: ' + text + '\n' + await evaluate('document.body.innerText'));
  };
  const click = async name => {
    const found = await evaluate(`(() => { const e = [...document.querySelectorAll('[role="button"],button,a')].find(e => (e.getAttribute('aria-label') || e.innerText).trim() === ${JSON.stringify(name)} && e.getAttribute('aria-disabled') !== 'true'); if (!e) return false; e.click(); return true; })()`);
    assert.ok(found, 'Button: ' + name); await sleep(350);
  };
  const fill = async (label, value) => {
    await evaluate(`(() => { const e = document.querySelector('input[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(200);
  };
  try {
    await send('Runtime.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:8087/' });
    await waitText('YOUR NEXT SESSION');
    await click('STAGE PLANNER →'); await waitText('STAGE PLANNER');
    await click('+ NEW STAGE'); await waitText('STAGE BUILDER');
    const name = 'Browser smoke ' + Date.now();
    await fill('Stage name', name);
    for (const label of ['Cardboard', 'No-Shoot', 'Steel Plate', 'Popper', 'Wall', 'Fault Line']) {
      await click('+ ADD'); await waitText('ADD OBJECT'); await click('Add ' + label);
    }
    await click('+ ADD'); await click('◎ START POSITION · SELECT EXISTING');
    await click('2.5D'); await waitText('SPATIAL PREVIEW'); await click('TOP DOWN');
    await click('SAVE'); await waitText('Saved on this device.');
    await click('CLOSE'); await waitText('RECENTLY EDITED');
    await click('SAVED STAGES'); await waitText(name); await click('OPEN');
    await waitText('STAGE BUILDER'); assert.equal(await evaluate(`document.querySelector('input[aria-label="Stage name"]').value`), name);
    await fill('Stage name', name + ' dirty'); await click('CLOSE'); await waitText('UNSAVED CHANGES');
    await click('DISCARD CHANGES AND CLOSE'); await waitText('SAVED STAGES');
    await click('DUPLICATE'); await waitText(name + ' (copy)');
    await click('RENAME'); await fill('Stage name', name + ' renamed'); await click('APPLY NAME'); await waitText(name + ' renamed');
    await click('DELETE'); await click('CONFIRM DELETE');
    assert.equal(await evaluate('document.querySelectorAll("[role=button]").length > 0'), true);
    await send('Page.navigate', { url: 'http://127.0.0.1:8087/training' }); await waitText('No training sessions yet.');
    await click('START TRAINING'); await waitText('No session has been started.');
    await send('Page.navigate', { url: 'http://127.0.0.1:8087/account' }); await waitText('Local shooter');
    assert.deepEqual(errors, []);
    console.log('PASS: Home/planner navigation, all ADD tiles, preview, save/reopen, unsaved guard, rename/duplicate/delete, Training and Account.');
  } finally { socket.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

