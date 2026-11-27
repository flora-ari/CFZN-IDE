import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const build=JSON.parse(fs.readFileSync('.runtime/board-card-icon-20261126/production-build.json'));
const candidate=JSON.parse(fs.readFileSync('.runtime/board-card-icon-20261126/candidate.json'));
assert.equal(build.ideAuth,true);
for(const f of [...build.sourceFiles,...build.artifacts])assert.equal(sha(fs.readFileSync(f.path)),f.sha256,f.path);
for(const f of build.sourceFiles)assert.equal(f.sha256,candidate.files.find(x=>x.path===f.path).sha256);
const references={};
for(const page of ['index','openblock','login','sso']){
 const html=fs.readFileSync(`apps/web/dist/${page}.html`,'utf8');
 references[page]=[...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map(m=>m[1]);
 for(const ref of references[page])if(!ref.endsWith('/'))assert.ok(fs.existsSync('apps/web/dist'+ref),`${page}: ${ref}`);
}
const editor=build.artifacts.find(f=>/\/assets\/editor-.*\.js$/.test(f.path));
assert.ok(editor);
assert.ok(references.openblock.includes(editor.path.replace('apps/web/dist','')));
assert.ok(references.openblock.includes('/assets/editor-2FWVdJTS.css'));
const fast='/openblock-vendor/openblock-gui.4535c7feb8eb7fb7.js';
assert.ok(references.openblock.includes(fast));
assert.equal(sha(fs.readFileSync('apps/web/dist'+fast)),sha(fs.readFileSync('.runtime/board-card-independent-20261126/stage'+fast)));
for(const name of ['ccraft-logo.png','ccraft-tab-icon.png'])assert.equal(sha(fs.readFileSync('apps/web/dist/branding/'+name)),sha(fs.readFileSync('.runtime/board-card-independent-20261126/stage/branding/'+name)));
fs.writeFileSync('tests/evidence/board-icon-20261126/production-audit.json',JSON.stringify({result:'PASS',ideAuthBuildDeclaration:true,sourceFreezeMatches:true,artifactHashes:build.artifacts,references,legacyAndFastGUIUnchanged:true,brandingUnchanged:true,scope:'read-only metadata, hashes and entry references; no login/browser/network/SDK test'},null,2));
console.log('PASS authenticated build metadata, frozen sources, entry assets, legacy/fast GUI and branding bytes.');
