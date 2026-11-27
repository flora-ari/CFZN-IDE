import {registerHooks} from 'node:module';
import ts from '../apps/web/node_modules/typescript/lib/typescript.js';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)){const u=new URL(s+'.ts',c.parentURL);if(existsSync(u))return next(u.href,c);}return next(s,c);},load(u,c,next){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};if(u.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(u,c);}});
const React=await import('../apps/web/node_modules/react/index.js').catch(()=>import('../node_modules/react/index.js'));
const {renderToStaticMarkup}=await import('../apps/web/node_modules/react-dom/server.node.js').catch(()=>import('../node_modules/react-dom/server.node.js'));
const {makeLibraryRenderer}=await import('../apps/web/src/extensions/library.ts');
let current='arduinoUno',selects=0,closes=0,prepares=0,ready=false,busy=false,captured;
globalThis.document={activeElement:null,body:{}};
const profile={id:'aijite-esp32s3',deviceId:'aijiteESP32S3',compileAvailable:false,uploadAvailable:false};
const state={profiles:[profile],localService:{status:'online'},toolchain:{support:'available',busy:false,profileId:'',profiles:[{profileId:profile.id,installable:true,state:'missing'}]}};
const hardware={snapshot:()=>state,boardProfile:()=>({...profile,compileAvailable:ready,uploadAvailable:ready}),isPreparingProfile:()=>busy,boardPrepareDisabledReason:()=>'',get linkDisabledReason(){return'';},prepareBoardToolchain:async()=>{prepares++;busy=true;state.toolchain.busy=true;state.toolchain.profileId=profile.id;state.toolchain.job={id:'mock-1',phase:'downloading',progress:{downloadedBytes:1}};}};
const adapter={currentDevice:()=>current,loaded:()=>[],isRealtimeMode:()=>true,status:{busy:false},moduleCatalog:()=>[],removalState:()=>({allowed:true}),selectController:async item=>{current=item.deviceId;selects++;},suppressChanges:false};
const renderer=makeLibraryRenderer(()=>adapter,()=>hardware);
function Library(props){captured=props;return React.createElement('div',null,props.categoryControls,...props.data.map(i=>React.createElement('section',{key:i.deviceId},i.cfznCard.select,i.cfznCard.footer,i.cfznCard.badge)));}
const props={deviceData:[{deviceId:'arduinoUno',name:'Arduino Uno'},{deviceId:profile.deviceId,name:'Aijite ESP32-S3'}],intl:{formatMessage:x=>x.defaultMessage??x},onRequestClose:()=>closes++};
const render=()=>renderToStaticMarkup(renderer(React,Library,props,[],true,null));
const target=()=>captured.data.find(i=>i.deviceId===profile.deviceId);
render(); target().cfznCard.select.props.onClick();assert.equal(selects,0,'missing SDK card must not select');
const findButton=n=>!n?null:Array.isArray(n)?n.map(findButton).find(Boolean):typeof n==='object'?(n.type==='button'&&n.props.className==='cfzn-card-download'?n:findButton(n.props?.children)):null;
findButton(target().cfznCard.footer).props.onClick({stopPropagation(){}});await Promise.resolve();assert.equal(prepares,1);
render();assert.equal(current,'arduinoUno');assert.equal(selects,0);assert.equal(closes,0);assert.equal(captured.autoClose,false);
busy=false;ready=true;state.toolchain.busy=false;profile.compileAvailable=true;profile.uploadAvailable=true;state.toolchain.job.state='succeeded';state.toolchain.job.phase='complete';state.toolchain.profiles[0].state='ready';
const readyMarkup=render();assert.equal(current,'arduinoUno');assert.equal(selects,0,'completion render cannot select');assert.equal(closes,0,'completion render cannot close');assert.ok(!target().cfznCard.badge);
target().cfznCard.select.props.onClick();await Promise.resolve();await Promise.resolve();assert.equal(selects,1);assert.equal(current,profile.deviceId);assert.equal(closes,0);assert.equal(prepares,1);
writeFileSync('tests/evidence/board-toolchain-card-20261126/library-ready-render.html',readyMarkup);
writeFileSync('tests/evidence/board-toolchain-card-20261126/library-callback.json',JSON.stringify({actualReactSSR:true,actualExport:'makeLibraryRenderer',completionSelects:0,completionCloses:0,explicitClickSelects:selects,finalCurrent:current,preparePosts:prepares,autoClose:captured.autoClose},null,2));
console.log('PASS actual React SSR library: completion preserves Uno/library; explicit card callback selects S3 exactly once.');



