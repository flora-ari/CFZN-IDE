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
const output=resolve(web,'evidence/brand-logo-20261112'); await mkdir(output,{recursive:true});
const surfaces=process.argv.includes('--dist')?['dist']:['dev'];
const expected='18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F';
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
  await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{configurable:true,value:{getPorts:async()=>[],requestPort:async()=>{throw Error('No physical serial in logo smoke');}}}));
  let frame;
  try {
    await page.goto(origin); frame=await(await page.locator('iframe').elementHandle()).contentFrame();
    await frame.locator('#boot-message').waitFor({state:'hidden',timeout:90000});
    await frame.locator('img[data-cfzn-brand-logo]').evaluate(img=>img.decode());
    const http=await frame.evaluate(async()=>{const r=await fetch('/branding/IDE.png');return{status:r.status,mime:r.headers.get('content-type'),bytes:[...new Uint8Array(await r.arrayBuffer())]};});
    assert.equal(http.status,200); assert.ok(http.mime.includes('image/png')); assert.equal(http.bytes.length,275981);
    const sha=createHash('sha256').update(new Uint8Array(http.bytes)).digest('hex').toUpperCase(); assert.equal(sha,expected);
    const layouts=[];
    for(const width of [2560,1200,1199,800,1440]) {
      await page.setViewportSize({width,height:900}); await page.waitForTimeout(450);
      const snapshot=await frame.evaluate(()=>{
        const img=document.querySelector('img[data-cfzn-brand-logo]'),bar=document.querySelector('[data-cfzn-menu-host]');
        const r=img.getBoundingClientRect(),m=bar.getBoundingClientRect(),style=getComputedStyle(img);
        let fiber=img[Object.keys(img).find(k=>k.startsWith('__reactInternalInstance$'))],imageProps=fiber?.memoizedProps,menu;
        while(fiber){if(fiber.stateNode?.state&&'isOverflow' in fiber.stateNode.state){menu=fiber.stateNode;break;}fiber=fiber.return;}
        const sameNode=!window.logoSmokeNode||window.logoSmokeNode===img;window.logoSmokeNode=img;
        return{width:innerWidth,src:img.currentSrc,alt:img.alt,draggable:img.draggable,natural:[img.naturalWidth,img.naturalHeight],logo:{x:r.x,y:r.y,width:r.width,height:r.height},bar:{x:m.x,y:m.y,width:m.width,height:m.height},fit:style.objectFit,position:style.objectPosition,maxWidth:style.maxWidth,maxHeight:style.maxHeight,flexGrow:style.flexGrow,flexShrink:style.flexShrink,isOverflow:menu?.state.isOverflow,sameNode,callbackPreserved:!!menu&&imageProps.onClick===menu.props.onClickLogo,hasClickHandler:typeof menu?.props.onClickLogo==='function',originalClass:img.className.includes('menu-bar_openblock-logo'),buttons:[...document.querySelectorAll('.cfzn-project-button')].map(e=>e.textContent),modes:[...document.querySelectorAll('.cfzn-mode-controls button')].map(e=>e.textContent),status:!!document.querySelector('[data-testid=project-status]')};
      });
      assert.ok(snapshot.src.endsWith('/branding/IDE.png')); assert.equal(snapshot.alt,'CFZN IDE'); assert.equal(snapshot.draggable,false);
      assert.deepEqual(snapshot.natural,[1318,509]); assert.equal(snapshot.logo.width,120); assert.equal(snapshot.logo.height,40);
      assert.equal(snapshot.bar.height,48); assert.ok(snapshot.logo.y>=snapshot.bar.y&&snapshot.logo.y+40<=snapshot.bar.y+48);
      assert.equal(snapshot.fit,'contain'); assert.equal(snapshot.position,'50% 50%'); assert.equal(snapshot.maxWidth,'120px');assert.equal(snapshot.maxHeight,'40px');
      assert.equal(snapshot.flexGrow,'0');assert.equal(snapshot.flexShrink,'0');assert.equal(snapshot.sameNode,true);assert.equal(snapshot.originalClass,true);assert.equal(snapshot.callbackPreserved,true);
      assert.deepEqual(snapshot.buttons,['项目','新建','导入','导出','保存']);assert.deepEqual(snapshot.modes,['编程模式','上传模式']);assert.equal(snapshot.status,true);
      layouts.push(snapshot);
      if(width===800||width===1440)await page.screenshot({path:resolve(output,surface+'-'+width+'.png')});
    }
    assert.ok(layouts.some(v=>v.isOverflow===true));assert.ok(layouts.some(v=>v.isOverflow===false));assert.deepEqual(errors,[]);
    await writeFile(resolve(output,surface+'-smoke.json'),JSON.stringify({surface,http:{status:http.status,mime:http.mime,bytes:http.bytes.length,sha256:sha},layouts,errors,zoom:'viewport changes only; no browser UI zoom or DPR change',physicalSerial:false},null,2));
    console.log(JSON.stringify({surface,http:true,widths:layouts.map(v=>({width:v.width,isOverflow:v.isOverflow,logo:v.logo,menuHeight:v.bar.height})),errors}));
  }catch(error){process.exitCode=1;await page.screenshot({path:resolve(output,surface+'-failure.png')}).catch(()=>{});console.log(JSON.stringify({error:String(error),errors}));throw error;}
  finally{browserServer.process().kill('SIGKILL');server.closeAllConnections();const shutdown=setTimeout(()=>process.exit(process.exitCode??0),3000);if(vite)await vite.close();await new Promise(r=>server.close(r));}
}
