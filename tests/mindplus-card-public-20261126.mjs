import https from 'node:https';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const origin='https://ide.xiaodaiyang.top';
const sha=b=>createHash('sha256').update(b).digest('hex');
const observations=[];
async function get(path,headers={}){
 const result=await new Promise((resolve,reject)=>{
  const req=https.get(origin+path,{headers:{'Accept-Encoding':'identity',...headers}},res=>{
   const chunks=[];let size=0;
   res.on('data',b=>{size+=b.length;if(size>2_000_000){res.destroy(new Error('Read cap exceeded; no full installer download allowed'));return;}chunks.push(b);});
   res.on('error',reject);res.on('end',()=>resolve({path,status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  });req.setTimeout(15000,()=>req.destroy(new Error('HTTPS timeout')));req.on('error',reject);
 });
 observations.push({path,status:result.status,headers:result.headers,bytes:result.body.length,sha256:sha(result.body)});return result;
}
try{
 const build=JSON.parse(fs.readFileSync('.runtime/mindplus-resource-cache-20261126/production-build.json'));
 const page=await get('/openblock.html');assert.equal(page.status,200);
 for(const name of ['editor-DeEyQ3Tw.js','editor-CuBpnqbv.css']){
  assert.ok(page.body.toString().includes('/assets/'+name));
  const f=build.artifacts.find(x=>x.path.endsWith('/'+name));const r=await get('/assets/'+name);assert.equal(r.status,200);assert.equal(sha(r.body),f.sha256);
 }
 const health=await get('/api/v1/health');assert.equal(health.status,200);const h=JSON.parse(health.body);assert.equal(h.status,'ok');assert.equal(h.auth,'maker');assert.equal(h.storage,'minio');
 for(const path of ['/','/login.html','/?mode=guest']){const r=await get(path);assert.equal(r.status,200);assert.match(r.body.toString(),/<html/i);}
 const metadata=await get('/downloads/CCraft-Link-latest.json');assert.equal(metadata.status,200);const m=JSON.parse(metadata.body);console.log('metadata',m);assert.ok(JSON.stringify(m).includes('0.1.5'));assert.ok(Object.values(m).includes(53313236));assert.ok(JSON.stringify(m).includes('d95f9d4a498ad032bebaab0a614d12e4a6b6029cb03aef3adc5d38f0e1ff7d5d'));
 const range=await get('/downloads/CCraft-Link-Setup.exe',{Range:'bytes=0-63'});assert.equal(range.status,206);assert.equal(range.body.length,64);assert.equal(range.headers['content-range'],'bytes 0-63/53313236');assert.equal(range.body.subarray(0,2).toString(),'MZ');
 fs.writeFileSync('tests/evidence/mindplus-card-cache-20261126/public-http.json',JSON.stringify({result:'PASS',origin,health:h,metadata:m,observations,coverage:'HTTPS default certificate validation; read-only GET; installer only 64-byte Range, no full SHA verification; no browser or Link'},null,2));console.log('PASS public HTTP checks');
}catch(error){fs.writeFileSync('tests/evidence/mindplus-card-cache-20261126/public-http.json',JSON.stringify({result:'FAIL',error:String(error),observations},null,2));throw error;}

