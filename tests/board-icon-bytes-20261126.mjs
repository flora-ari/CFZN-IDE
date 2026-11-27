import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import React from '../apps/web/node_modules/react/index.js';
import {renderToStaticMarkup} from '../apps/web/node_modules/react-dom/server.node.js';
import {renderBoardToolchain} from '../apps/web/src/board-toolchain-card.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(fs.readFileSync('apps/web/src/board-toolchain-card.ts')),'5be73ea48ff430e9ce32b73fc612d8223faa52b72a31d3a136ad4acfd1eac76e');
assert.equal(sha(fs.readFileSync('apps/web/src/extensions/library.css')),'33846ce80504b5ef9e1d02a9a21063927d47e937b23b0a182efb1eaead0adfc6');
const profile={id:'esp32',deviceId:'arduinoEsp32',compileAvailable:false,uploadAvailable:false};
const job={id:'mock',phase:'downloading',state:'running',progress:{downloadedBytes:1_563_002,totalBytes:878_894_784}};
const snapshot={profiles:[profile],localService:{status:'online'},toolchain:{profileId:profile.id,busy:true,support:'available',profiles:[{profileId:profile.id,installable:true}],job,cancelAvailable:true}};
const hw={snapshot:()=>snapshot,boardProfile:()=>profile,isPreparingProfile:()=>false,boardPrepareDisabledReason:()=>'',linkDisabledReason:''};
const results=[];
for(const phase of ['known','unknown','resolving','installing','validating','complete']){
 job.phase=['known','unknown'].includes(phase)?'downloading':phase;
 job.progress={downloadedBytes:1_563_002,...(phase==='unknown'?{}:{totalBytes:878_894_784})};
 const view=renderBoardToolchain(React,hw,profile.deviceId,'ESP32',()=>{});
 assert.equal(view.decoration.props.className,'cfzn-card-download-layer');
 assert.equal(view.overlay.props.className,'cfzn-card-preparation');
 const html=renderToStaticMarkup(view.decoration);
 if(phase==='known'){
  assert.match(html,/0%/);assert.match(html,/已下载 1\.5 MiB \/ 838\.2 MiB/);
  assert.match(html,/title="已下载 1\.5 MiB \/ 838\.2 MiB"/);
  assert.match(html,/aria-valuetext="已下载 1\.5 MiB \/ 838\.2 MiB"/);
 }else if(phase==='unknown'){
  assert.match(html,/已下载 1\.5 MiB/);assert.doesNotMatch(html,/%|838\.2|\bmax=|\bvalue=/);
 }else assert.doesNotMatch(html,/已下载|MiB|aria-valuetext|\bmax=|\bvalue=/);
 assert.doesNotMatch(html,/cfzn-card-footer/);
 results.push({phase,html});
}
fs.writeFileSync('tests/evidence/board-icon-20261126/byte-progress-react.json',JSON.stringify({result:'PASS',renderer:'actual React SSR of renderBoardToolchain',cases:results,layout:'unchanged CSS hash; bytes inside absolute preparation layer',geometryExecuted:false},null,2));
console.log('PASS six actual React progress states; unchanged absolute-layer CSS, no flow footer.');
