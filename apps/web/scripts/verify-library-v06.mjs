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
const output = resolve(web, 'evidence/extension-library-v06'); await mkdir(output, { recursive: true });
const moduleNames = { atomizer: '雾化模块', activateBuzzer: '有源蜂鸣器', pirSensor: '人体红外', flameSensor: '火焰传感器', raindropSensor: '水滴传感器', moreComments: '积木注释' };
const moduleCategories = ['ACTIVATEBUZZER_CATEGORY', 'ATOMIZER_CATEGORY', 'PIRSENSOR_CATEGORY', 'FLAMESENSOR_CATEGORY', 'RAINDROPSENSOR_CATEGORY', 'MORECOMMENTS_CATEGORY'];
const surfaces = process.argv.includes('--dev') ? ['dev'] : process.argv.includes('--dist') ? ['dist'] : ['dev', 'dist'];
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
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [], resourceRequests = [], checks = {};
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', req => { if (req.url().includes('/cfzn-extensions/extensions/') && req.url().includes('.mjs')) resourceRequests.push(req.url()); });
  await page.route('http://127.0.0.1:3002/api/v1/hardware/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/ports') ? { items: [] } : { protocolVersion: 1, executionHost: 'local', profiles: [], toolchain: { cliVersion: null, description: 'no hardware used' } }) }));
  await page.addInitScript(initialize);
  let frame;
  const bridge = (type, payload) => bridgeOn(page, type, payload);
  const categories = () => frame.evaluate(() => {
    const xml = new DOMParser().parseFromString(window.testStore.getState().scratchGui.toolbox.toolboxXML, 'application/xml');
    return [...xml.documentElement.children].filter(node => node.tagName === 'category').map(category => ({ id: category.id, name: category.getAttribute('name'), nested: category.querySelectorAll('category').length,
      blocks: [...category.querySelectorAll('block')].map(block => ({ type: block.getAttribute('type'), disabled: block.getAttribute('disabled') })) }));
  });
  const mode = label => frame.getByRole('button', { name: label, exact: true }).click();
  const closeLibrary = () => frame.getByText('返回', { exact: true }).click();
  async function flyout(id) {
    await frame.evaluate(id => window.testBlockly.getMainWorkspace().toolbox_.scrollToCategoryById(id), id);
    await page.waitForTimeout(300); // Native toolbox scroll animation must finish before pointer coordinates are measured.
    return frame.evaluate(id => {
      const xml = new DOMParser().parseFromString(window.testStore.getState().scratchGui.toolbox.toolboxXML, 'application/xml');
      const category = [...xml.getElementsByTagName('category')].find(category => category.id === id);
      const types = new Set([...category.children].filter(node => node.tagName === 'block').map(node => node.getAttribute('type')));
      return window.testBlockly.getMainWorkspace().getFlyout().getFlyoutItems().filter(block => types.has(block.type)).map(block => ({ id: block.id, type: block.type, disabled: block.disabled }));
    }, id);
  }
  try {
    await page.addInitScript(() => Object.defineProperty(navigator, 'serial', { configurable:true, value:{getPorts:async()=>[],requestPort:async()=>{throw Error('No physical serial');}} }));
    await page.goto(origin); await page.locator('iframe').waitFor();
    frame=await(await page.locator('iframe').elementHandle()).contentFrame();
    await frame.locator('#boot-message').waitFor({state:'hidden',timeout:90000});
    await frame.evaluate(()=>{
      const render=CFZNOpenBlock.renderLibrary;CFZNOpenBlock.renderLibrary=(...args)=>{window.testVm=args[2].vm;return render(...args);};
      const upload=CFZNOpenBlock.renderUploadWorkspace;CFZNOpenBlock.renderUploadWorkspace=(R,C,props)=>upload(R,C,{...props,onCodeEditorDidMount:editor=>{window.testEditor=editor;props.onCodeEditorDidMount(editor);}});
    });
    const open=async label=>{if(!await frame.locator('.cfzn-extension-controls').count())await frame.locator('[class*="extension-button"]').first().click();await frame.getByRole('button',{name:label,exact:true}).click();};
    const card=key=>frame.locator('[data-cfzn-library-card="'+key+'"]');
    const idle=()=>frame.waitForFunction(()=>!document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'));
    await open('模块扩展');
    await frame.evaluate(()=>testVm.runtime.emit('DEVICE_EXTENSION_ADDED',{defineMessages:B=>{window.testBlockly=B;return B;}}));
    const clean=await bridge('GET_STATE');
    const showAllModules=frame.getByRole('checkbox',{name:'显示全部模块',exact:true});
    await frame.locator('.cfzn-extension-empty').getByText(/请先选择主控板/).waitFor();
    assert.equal(await frame.locator('[data-cfzn-library-card]').count(),0);
    await showAllModules.check();
    assert.equal(await frame.locator('.cfzn-card-compatibility').filter({hasText:'未选择主控板'}).count(),6);
    assert.deepEqual(await frame.getByRole('group',{name:'扩展类型'}).getByRole('button').allTextContents(),['全部','传感器','执行器','功能模块']);
    await frame.getByRole('button',{name:'传感器',exact:true}).click();assert.equal(await frame.locator('[data-cfzn-library-card]').count(),3);
    const search=frame.locator('input[class*="library_filter-input"]');await search.fill('红外');assert.equal(await frame.locator('[data-cfzn-library-card]').count(),1);
    await frame.getByRole('button',{name:'执行器',exact:true}).click();assert.equal(await search.inputValue(),'');
    await search.fill('红外');await frame.locator('.cfzn-extension-empty').waitFor();
    await frame.getByRole('button',{name:'清除筛选',exact:true}).click();assert.equal(await frame.locator('[data-cfzn-library-card]').count(),0);assert.equal(await search.inputValue(),'');
    assert.equal(await showAllModules.isChecked(),false);
    await showAllModules.check();
    assert.equal((await bridge('GET_STATE')).editVersion,clean.editVersion);
    await page.screenshot({path:resolve(output,surface+'-no-board.png')});checks.realTypesAndSearch=true;
    await open('主控扩展');const board=card('controller-firebeetleEsp32E');
    await board.locator('[class*="library-item_library-item-name"]').scrollIntoViewIfNeeded();
    const title=await board.locator('[class*="library-item_library-item-name"]').boundingBox();
    assert.equal(await board.locator('[class*="library-item_library-item-name"]').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).classList.contains('cfzn-card-select');}),true);
    await page.mouse.click(title.x+title.width/2,title.y+title.height/2);await idle();
    await frame.waitForFunction(()=>testVm.runtime.getDevice().deviceId==='firebeetleEsp32E',null,{timeout:5000});
    assert.equal(await board.getAttribute('data-cfzn-selected'),'true');
    await page.screenshot({path:resolve(output,surface+'-selected-board.png')});
    const selected=await bridge('GET_STATE');assert.equal(selected.editVersion,clean.editVersion+1);
    await board.getByRole('button',{name:'FireBeetle ESP32-E',exact:true}).press('Enter');await idle();assert.equal((await bridge('GET_STATE')).editVersion,selected.editVersion);
    for (const selector of ['[class*="library-item_featured-image_"]','[class*="library-item_featured-description_"]']) {
      const area=board.locator(selector);await area.scrollIntoViewIfNeeded();const box=await area.boundingBox();
      assert.equal(await area.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).classList.contains('cfzn-card-select');}),true);
      await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await idle();assert.equal((await bridge('GET_STATE')).editVersion,selected.editVersion);
    }
    const help=card('controller-arduinoUno').locator('a[href]').first();await help.scrollIntoViewIfNeeded();
    assert.equal(await help.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest('a')===el;}),true);
    await open('模块扩展');const buzzer=card('module-activateBuzzer');
    await buzzer.getByRole('button',{name:'有源蜂鸣器',exact:true}).press('Space');await idle();await frame.waitForFunction(()=>testVm.runtime.getLoadedDeviceExtension().includes('activateBuzzer'));
    assert.equal(await buzzer.getAttribute('data-cfzn-selected'),'true');assert.equal(await buzzer.getByText('已添加',{exact:true}).count(),1);
    await open('主控扩展');assert.equal(await board.getByRole('button',{name:'移除 FireBeetle ESP32-E',exact:true}).isDisabled(),true);
    const refusal=await frame.evaluate(async()=>{try{await testVm.extensionManager.loadDeviceURL({deviceId:'null'});return '';}catch(e){return e.message;}});assert.match(refusal,/先移除模块/);
    await open('模块扩展');let before=await bridge('GET_STATE');
    await buzzer.getByRole('button',{name:'移除 有源蜂鸣器',exact:true}).click();await idle();await frame.waitForFunction(()=>!testVm.runtime.getLoadedDeviceExtension().includes('activateBuzzer'));
    assert.equal((await bridge('GET_STATE')).editVersion,before.editVersion+1);
    assert.equal(await buzzer.getByRole('button',{name:'有源蜂鸣器',exact:true}).evaluate(el=>el===document.activeElement),true);
    before=await bridge('GET_STATE');await frame.evaluate(()=>testVm.extensionManager.unloadDeviceExtension('activateBuzzer'));assert.equal((await bridge('GET_STATE')).editVersion,before.editVersion);
    await buzzer.getByRole('button',{name:'有源蜂鸣器',exact:true}).click();await idle();await frame.waitForFunction(()=>testVm.runtime.getLoadedDeviceExtension().includes('activateBuzzer'));await closeLibrary();
    await frame.evaluate(()=>{window.testSprite=testVm.editingTarget.id;testVm.setEditingTarget(testVm.runtime.targets.find(t=>t.isStage).id);const B=testBlockly;B.Xml.clearWorkspaceAndLoadFromXml(B.Xml.textToDom('<xml><block type="activeBuzzer_on" id="v06-other-target"/></xml>'),B.getMainWorkspace());});
    await frame.waitForFunction(()=>testVm.editingTarget.blocks.getBlock('v06-other-target'));await frame.evaluate(()=>testVm.setEditingTarget(testSprite));await open('模块扩展');
    before=await bridge('GET_STATE');const originalJSON=await frame.evaluate(()=>testVm.toJSON());assert.equal(await buzzer.getByRole('button',{name:'移除 有源蜂鸣器',exact:true}).isDisabled(),true);
    const used=await frame.evaluate(async()=>{try{await testVm.extensionManager.unloadDeviceExtension('activateBuzzer');return '';}catch(e){return e.message;}});assert.match(used,/仍被引用/);
    assert.equal(await frame.evaluate(()=>testVm.toJSON()),originalJSON);assert.equal((await bridge('GET_STATE')).editVersion,before.editVersion);
    await closeLibrary();await frame.evaluate(()=>{testVm.setEditingTarget(testVm.runtime.targets.find(t=>t.isStage).id);testBlockly.Xml.clearWorkspaceAndLoadFromXml(testBlockly.Xml.textToDom('<xml/>'),testBlockly.getMainWorkspace());});
    await frame.waitForFunction(()=>testVm.editingTarget.blocks.getAllIds().length===0);await frame.evaluate(()=>testVm.setEditingTarget(testSprite));await open('模块扩展');
    await buzzer.getByRole('button',{name:'移除 有源蜂鸣器',exact:true}).click();await idle();checks.removeReaddAndReferenceGuard=true;
    await closeLibrary(); // Complete native monitor/stage-extension matrix belongs to independent testing.
    await frame.evaluate(()=>{const B=testBlockly;B.Xml.clearWorkspaceAndLoadFromXml(B.Xml.textToDom('<xml><block type="event_whenflagclicked" id="v06-flag" x="50" y="50"><next><block type="motion_changexby" id="v06-move"><value name="DX"><shadow type="math_number"><field name="NUM">17</field></shadow></value></block></next></block></xml>'),B.getMainWorkspace());});
    await frame.waitForFunction(()=>testVm.editingTarget.blocks.getBlock('v06-move'));
    await mode('上传模式');await frame.getByRole('tab',{name:'手动编辑',exact:true}).click();await frame.waitForFunction(()=>!!window.testEditor);
    await frame.evaluate(()=>testEditor.setValue('// retained by v0.6\nvoid setup(){}\nvoid loop(){}\n'));await mode('编程模式');
    const archive=await bridge('EXPORT_PROJECT'),files=unzipSync(new Uint8Array(archive.bytes)),project=JSON.parse(strFromU8(files['project.json']));before=await bridge('GET_STATE');
    await open('主控扩展');await board.getByRole('button',{name:'移除 FireBeetle ESP32-E',exact:true}).click();await idle();
    await frame.waitForFunction(()=>testVm.runtime.getDevice().deviceId===null&&testStore.getState().scratchGui.device.deviceId===null&&testBlockly.Device.getDeviceId()===null);await closeLibrary();
    const after=await bridge('EXPORT_PROJECT'),cleared=unzipSync(new Uint8Array(after.bytes)),next=JSON.parse(strFromU8(cleared['project.json']));
    assert.deepEqual(next.targets.map(t=>t.blocks),project.targets.map(t=>t.blocks));assert.deepEqual(next.monitors,project.monitors);assert.deepEqual(next.extensions,project.extensions);assert.equal(next.programMode,project.programMode);
    assert.deepEqual(JSON.parse(strFromU8(cleared['cfzn/editor.json'])),JSON.parse(strFromU8(files['cfzn/editor.json'])));
    const sha=value=>createHash('sha256').update(value).digest('hex');
    for(const[ti,target]of project.targets.entries())for(const kind of ['costumes','sounds'])for(const[ai,asset]of target[kind].entries()){const fresh=next.targets[ti][kind][ai];assert.equal(sha(files[asset.md5ext]),sha(cleared[fresh.md5ext]));}
    const state=await bridge('GET_STATE');assert.equal(state.documentId,before.documentId);assert.equal(state.editVersion,before.editVersion+1);
    await writeFile(resolve(output,surface+'-cleared.ob'),new Uint8Array(after.bytes));await page.screenshot({path:resolve(output,surface+'-cleared.png')});checks.completeArchiveClear=true;
    await open('模块扩展');await showAllModules.check();await page.setViewportSize({width:390,height:900});await page.screenshot({path:resolve(output,surface+'-narrow.png')});
    assert.deepEqual(errors,[]);results.push({surface,checks,errors,physicalSerial:false});await writeFile(resolve(output,surface+'-result.json'),JSON.stringify(results.at(-1),null,2));console.log(JSON.stringify(results.at(-1)));
  }catch(error){console.log('BODY',(await frame?.locator('body').innerText())?.slice(-3500));await page.screenshot({path:resolve(output,surface+'-failure.png')});throw error;}
  finally{await browser.close();await vite?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
await writeFile(resolve(output,'result.json'),JSON.stringify(results,null,2));
