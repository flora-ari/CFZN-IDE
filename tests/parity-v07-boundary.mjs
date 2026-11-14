// Independent exact-byte recheck of the handed-off sourcemap module identities.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'tests/evidence/parity-v07');
const reference=JSON.parse(await readFile(join(root,'apps/web/evidence/mindplus-parity-v07/upstream-byte-comparison.json'),'utf8'));
const original=execFileSync('tar',['-xOf',join(root,'.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz'),'package/dist/openblock-gui.js'],{maxBuffer:100*1024*1024}).toString();
const shipped=await readFile(join(root,'apps/web/dist/openblock-vendor/openblock-gui.js'),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
function chunks(text){const matches=[...text.matchAll(/^\/\* (\d+) \*\//gm)];return new Map(matches.map((m,i)=>[m[1],text.slice(m.index,matches[i+1]?.index??text.length)]));}
const a=chunks(original),b=chunks(shipped),result={checkedAt:new Date().toISOString(),upstreamSha256:sha(original),shippedSha256:sha(shipped),moduleIdentitySource:'developer sourcemap identity list; bytes independently compared to pinned upstream tarball',groups:{}};
for(const[name,count]of[['vm',178],['blockly',15]]){assert.equal(reference[name].length,count);result.groups[name]=reference[name].map(({id})=>{assert.ok(a.has(id)&&b.has(id));assert.equal(sha(a.get(id)),sha(b.get(id)),name+' module '+id);return{id,sha256:sha(a.get(id)),bytes:Buffer.byteLength(a.get(id))};});}
const hooks=await readFile(join(root,'apps/web/scripts/openblock-hooks.mjs'),'utf8'),sources=[...hooks.matchAll(/source: '([^']+)'/g)].map(m=>m[1]);assert.ok(sources.every(s=>s.startsWith('src/')));result.guiHookSources=sources;
await mkdir(out,{recursive:true});await writeFile(join(out,'independent-upstream-byte-comparison.json'),JSON.stringify(result,null,2));console.log('PASS 178 VM and 15 Blockly modules exact upstream bytes; hook sources GUI only');
