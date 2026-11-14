import{unzipSync,strFromU8}from'fflate';
import{createHash}from'node:crypto';
import { chromium } from '@playwright/test';
import { createServer as createVite } from 'vite';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';

const web = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(web, 'evidence/mindplus-parity-v07/undo-fix'); await mkdir(output, { recursive: true });
const surfaces = process.argv.includes('--dist') ? ['dist'] : ['dev'];
const results = [];
const initialize = () => {
  let dom;
  Object.defineProperty(window, 'ReactDOM', { configurable: true, get: () => dom, set: value => {
    dom = value; let render;
    Object.defineProperty(value, 'render', { configurable: true, get: () => function (...args) { const result = render.apply(this, args); if (result?.store) window.testStore = result.store; return result; }, set: fn => { render = fn; } });
  } });
};
const bridgeOn = (page, type, payload) => page.evaluate(({ type, payload }) => new Promise((resolve, reject) => {
  const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
  const timer = setTimeout(() => { removeEventListener('message', listener); reject(new Error(`bridge timeout ${type}`)); }, 45000);
  function listener(e) {
    if (e.source !== target || e.data.requestId !== requestId) return;
    clearTimeout(timer); removeEventListener('message', listener);
    if (!e.data.payload.ok) { reject(new Error(e.data.payload.error.message)); return; }
    const result = e.data.payload.result;
    resolve(type === 'EXPORT_PROJECT' ? { ...result, bytes: [...new Uint8Array(result.bytes)] } : result);
  }
  if (type === 'LOAD_PROJECT') payload = { ...payload, bytes: new Uint8Array(payload.bytes).buffer };
  addEventListener('message', listener); target.postMessage({ protocol: 'cfzn.openblock', version: 1, type, payload, requestId }, location.origin);
}), { type, payload });
for (const surface of surfaces) {
  let vite;
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://local').pathname;
    if (path.startsWith('/api/')) { res.setHeader('content-type', 'application/json'); res.end('{"items":[]}'); return; }
    if (surface === 'dev') { if (vite) vite.middlewares(req, res); else { res.writeHead(503); res.end(); } return; }
    const dist = resolve(web, 'dist'), file = resolve(dist, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
    if (!file.startsWith(dist + sep)) { res.writeHead(400); res.end(); return; }
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' })[extname(file)] || 'application/octet-stream');
    const stream = createReadStream(file); stream.on('error', () => { res.writeHead(404); res.end(); }); stream.pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, origin = `http://127.0.0.1:${port}`;
  if (surface === 'dev') vite = await createVite({ root: web, configFile: resolve(web, 'vite.config.ts'), server: { middlewareMode: true, hmr: { server, clientPort: port } }, logLevel: 'error' });
  const browserServer = await chromium.launchServer({ channel: 'msedge', headless: true });
  const browser = await chromium.connect(browserServer.wsEndpoint());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(10000);
  const errors = [], resourceRequests = [], checks = {};
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', req => { if (req.url().includes('/cfzn-extensions/extensions/') && req.url().includes('.mjs')) resourceRequests.push(req.url()); });
  await page.route('http://127.0.0.1:3002/api/v1/hardware/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/ports') ? { items: [] } : { protocolVersion: 1, executionHost: 'local', profiles: [], toolchain: { cliVersion: null, description: 'no hardware used' } }) }));
  await page.addInitScript(initialize);
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, 'CFZNOpenBlock', { configurable: true, get: () => api, set: value => {
      api = value;
      const attach = value.attachPaletteSearch;
      value.attachPaletteSearch = (B, workspace, ...args) => { window.testBlockly = B; window.testWorkspace = workspace; window.testEvents=[]; workspace.addChangeListener(e=>{if(window.testEvents.length<60)window.testEvents.push({type:e.type,element:e.element,workspaceId:e.workspaceId});}); return attach(B, workspace, ...args); };
    } });
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { getPorts: async () => [], requestPort: async () => { throw Error('No physical serial in smoke'); } } });
  });
  let frame;
  const bridge = (type, payload) => bridgeOn(page, type, payload);
  const history = () => frame.evaluate(() => ({
    undo: testWorkspace.undoStack_.map(e => ({ type:e.type,recordUndo:e.recordUndo,json:e.toJson() })),
    redo: testWorkspace.redoStack_.map(e => ({ type:e.type,recordUndo:e.recordUndo,json:e.toJson() })),
    recordUndo: testBlockly.Events.recordUndo
  }));
  try {
    await page.goto(origin);
    frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    await frame.locator('#boot-message').waitFor({state:'hidden',timeout:90000});
    await page.waitForTimeout(150);
    assert.equal(await frame.evaluate(() => testWorkspace.getAllBlocks(false).length),0);
    await frame.evaluate(() => {
      testBlockly.Events.setGroup(true);
      try { testBlockly.Xml.domToWorkspace(testBlockly.Xml.textToDom('<xml><block type="motion_movesteps" id="v07-undo-move" x="440" y="140"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block></xml>'),testWorkspace); }
      finally { testBlockly.Events.setGroup(false); }
    });
    await frame.waitForFunction(() => testWorkspace.undoStack_.some(e=>e.type==='create'&&e.ids?.includes('v07-undo-move')));
    await page.waitForTimeout(150);
    await frame.evaluate(() => testWorkspace.undo(false));
    await frame.waitForFunction(() => !testWorkspace.getAllBlocks(false).some(b=>b.id==='v07-undo-move')&&testWorkspace.redoStack_.length>0);
    await page.waitForTimeout(150);
    const before=await history(), state=await bridge('GET_STATE'), graph=await bridge('GET_PROJECT_JSON');
    assert.ok(before.redo.length>0); assert.equal(before.recordUndo,true);
    await frame.evaluate(() => {
      window.queryLifecycleEvents=[];
      testWorkspace.addChangeListener(e=>{if(e.type==='toolBoxFinish')queryLifecycleEvents.push({type:e.type,recordUndo:e.recordUndo,workspaceId:e.workspaceId});});
    });
    for(let round=0;round<3;round++) {
      await frame.getByRole('button',{name:'搜索积木',exact:true}).click();
      const input=frame.getByRole('textbox',{name:'搜索当前积木文字'});
      await input.fill('移动');
      await frame.waitForFunction(()=>/个匹配积木/.test(document.querySelector('.cfzn-search-panel [role=status]')?.textContent)&&testWorkspace.toolbox_.getSelectedCategoryId()==='cfzn-search-results');
      await frame.getByRole('button',{name:'清除',exact:true}).click();
      await frame.waitForFunction(()=>testWorkspace.toolbox_.getSelectedCategoryId()!=='cfzn-search-results');
      await input.fill('转');
      await frame.waitForFunction(()=>/个匹配积木/.test(document.querySelector('.cfzn-search-panel [role=status]')?.textContent)&&testWorkspace.toolbox_.getSelectedCategoryId()==='cfzn-search-results');
      await frame.getByRole('button',{name:'关闭积木搜索',exact:true}).click();
      await frame.waitForFunction(()=>!document.querySelector('.cfzn-search-panel')&&testWorkspace.toolbox_.getSelectedCategoryId()!=='cfzn-search-results');
    }
    await page.waitForTimeout(150);
    const after=await history(); assert.deepEqual(after,before);
    assert.deepEqual(await bridge('GET_PROJECT_JSON'),graph); assert.deepEqual(await bridge('GET_STATE'),state);
    const lifecycle=await frame.evaluate(()=>queryLifecycleEvents);
    assert.ok(lifecycle.length>=12); assert.ok(lifecycle.every(e=>e.recordUndo===false));
    checks.searchPreservesUndoRedo=true; checks.lifecycleStillDelivered=true;
    await frame.evaluate(()=>testWorkspace.undo(true));
    await frame.waitForFunction(()=>testWorkspace.getAllBlocks(false).some(b=>b.id==='v07-undo-move'));
    await page.waitForTimeout(100);
    assert.equal(await frame.evaluate(()=>testWorkspace.getBlockById('v07-undo-move').getInputTargetBlock('STEPS').getFieldValue('NUM')),'10');
    await frame.evaluate(()=>testWorkspace.getBlockById('v07-undo-move').getInputTargetBlock('STEPS').setFieldValue('27','NUM'));
    await frame.waitForFunction(()=>testWorkspace.undoStack_.some(e=>e.type==='change'&&e.newValue==='27'));
    await frame.evaluate(()=>testWorkspace.undo(false));
    await frame.waitForFunction(()=>testWorkspace.getBlockById('v07-undo-move').getInputTargetBlock('STEPS').getFieldValue('NUM')==='10');
    await frame.evaluate(()=>testWorkspace.undo(true));
    await frame.waitForFunction(()=>testWorkspace.getBlockById('v07-undo-move').getInputTargetBlock('STEPS').getFieldValue('NUM')==='27');
    checks.existingRedoStillWorks=true; checks.newEditUndoRedoStillWorks=true;
    assert.equal(errors.length,0,errors.join('\n'));
    await writeFile(resolve(output,surface+'-result.json'),JSON.stringify({surface,checks,before,after,lifecycle,errors,physicalHardware:false},null,2));
    console.log(JSON.stringify({surface,checks,undo:before.undo.length,redo:before.redo.length,lifecycleEvents:lifecycle.length}));
  } catch(error) {
    process.exitCode=1; await page.screenshot({path:resolve(output,surface+'-failure.png')}).catch(()=>{});
    console.log(JSON.stringify({error:String(error),errors,history:await history().catch(String)})); throw error;
  } finally {
    browserServer.process().kill('SIGKILL'); server.closeAllConnections();
    const shutdown=setTimeout(()=>process.exit(process.exitCode??0),3000);
    if(vite)await vite.close(); await new Promise(resolve=>server.close(resolve)); clearTimeout(shutdown);
  }
}
