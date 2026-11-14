# CFZN-IDE API contract v0.1

## 模块兼容角标边框对齐（2026-11-12，主控冻结）

用户要求模块扩展卡片的“未选择主控板”提示统一靠每张卡片的右上边框。两侧设计为docs/design/module-badge-alignment-frontend.md及module-badge-alignment-backend.md；本附录只修显示定位，不改变提示状态、文字或业务语义。

- 现有cfznCard.badge由featuredImageContainer内部移到data-cfzn-library-card外卡根的直接子节点，与现有select相邻。保留图片容器和图片自身布局，不用图片宽度推算提示位置，不增加DOM轮询/测量脚本。
- cfzn-card-compatibility统一相对完整卡片绝对定位top:0、right:0、left:auto，贴卡片边框内侧；灰底/边框/文字、字号、padding、max-width、z-index:3和pointer-events:none保持。未选择/兼容/不支持共用同一定位，不影响卡片选中覆盖层或footer移除按钮。舞台/主控卡片没有此badge时保持原样。
- 仅调整现有GUI精确挂点与局部CSS，仍47个GUI片段；不修改VM/Blockly源码/模块/原型、HTTP/schema、后端、依赖、归档、加载/兼容/筛选/选择/移除判断。不修改上一轮Logo及顶部模式控件、五按钮等。
- 开发按既有流程构建和类型检查后冻结；Sol low只做本轮dev/dist真实六模块卡片几何、宽窄换行及可用的一档浏览器缩放检查，三种状态共用定位、加载/移除可交互、页面异常0。核对保护模块及Logo/模式未变。不增加镜像实现的单测，不重跑硬件/归档等无关矩阵，不启停用户5173/3001/3002或打开COM3。

## 顶部Logo资源与缩放修正（2026-11-12，主控冻结）

用户提供F:/Desktop/IDE.png替换顶部品牌；本条仅前端资源/样式，HTTP、后端、归档、依赖零变化。两侧设计为docs/design/brand-logo-frontend.md、brand-logo-backend.md，以下路径/尺寸覆盖提案中的候选值。

- 原字节复制到`apps/web/public/branding/IDE.png`，运行时仅用同源`/branding/IDE.png`。源图1318×509、275981字节、SHA256 `18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F`；核对复制时身份，不重编码/裁剪，不用桌面路径、file URL或软链接。现有prepare将项目资产复制到runtime，再由Vite进入dist；requiredOutputs补该资源，缺失缓存可以按现有流程重建。
- 固定GUI MenuBar实际上是同一img按`state.isOverflow`切换logo/logoSmall来源。仅在现有GUI精确挂点让CFZN实例始终使用同一新URL，并加`data-cfzn-brand-logo`供局部样式/验收，alt为CFZN IDE。保留img原class、draggable和原onClickLogo/适用键盘行为，不新造跳转，不改变其他控件的overflow逻辑。
- 图像盒统一120×40 CSS px，max-width/height同值，object-fit:contain、居中、不可flex拉伸/压缩；完整等比显示而不裁切。删除旧Logo两处height:auto覆盖，不改其他图标或其他媒体查询；保留菜单48 CSS px与既有标题/五按钮/保存状态布局、细滚动条和顶部模式切换。
- 不修改VM/Blockly源码、产物模块或原型，不启停用户5173/3001/3002或操作COM3。前端开发仅apps/web与交接；后端只确认零业务变更；主控维护契约/综合文档，测试仅tests。
- 构建/类型检查后，Sol low在隔离dev及dist核对项目源/runtime/dist/HTTP响应PNG字节与MIME；宽窄屏、溢出切换、断点及不同缩放下图像不超过菜单、不变形/裁切、不回到橙色图标。实际浏览器缩放与viewport/DPR等效覆盖要明确区分，不伪称执行了浏览器UI缩放。保留48px菜单、五按钮/标题/滚动、模式控件，VM/Blockly字节不变。只做本变更有意义的聚焦检查，不重跑无关硬件/归档矩阵。

## Mind+ 网页功能补齐 v0.7（2026-11-12，主控冻结）

本附录以用户最新网页优先要求覆盖两侧提案；顶部右侧现有模式切换的位置、样式、文案和切换逻辑全部保留。保持两个主控入口完整20项、v0.5分类/模式/恢复、v0.6选中/移除保护、完整作品归档与单VM/串口owner。禁止修改VM或Blockly源码/打包模块，新增挂点只能精确命中GUI。前端提案 docs/design/mindplus-parity-frontend.md、后端提案 mindplus-parity-backend.md 和主控Link调查 mindplus-link-web-boundary.md作为证据，不把未完成的官网运行场景当验收。

### 本轮实际实现

1. 保存快捷键：Ctrl+S以及Mac Cmd+S路由到现有项目保存，父页面与iframe各处理所属焦点，通过已有PROJECT_TOOLBAR_ACTION/save及App.saveProject复用，不增加HTTP或新保存实现。忽略Alt/Shift、组合输入和重复keydown；阻止浏览器保存网页。与鼠标保存共用就绪、模态、项目/扩展/模式/硬件忙守卫。原生标题/注释/代码最后一次编辑须先经既有提交时序完成，不能保存旧值；保留用户焦点及选区，不在用户已经移焦后抢回。现有documentId/editVersion、revision冲突、完整归档与dirty规则不变。
2. 真实积木文字搜索：在GUI工具箱加入独立小型搜索入口，读取现有compose后的原始类别XML与原生动态类别回调，索引真实本地化block.toString文字。保留完整XML语义（字段、变量ID、过程mutation、引脚、嵌套shadow及disabled），shadow/菜单辅助块不单列。仅搜索当前目标、模式、主控及已提交扩展可展示集合；不列未加载扩展或按静态关键词造结果。用原生结果类别/原生flyout渲染，必须可以真实拖出并生成或执行原积木。不得修改Blockly.Toolbox原型，不加入第二VM；索引实例在隔离的展示workspace完成，或证明短暂原生flyout实例不影响现有展示/事件/工作区，及时dispose。索引事件不能回写主工作区或产生dirty。
3. 本机服务状态：复用HardwareController与配置的本机HTTP地址，明确检查/重试入口；能力服务状态与浏览器串口状态分开。使用既有GET /capabilities验证protocolVersion=1、executionHost=local及所消费字段，分别显示检查中/在线/离线/协议不兼容。GET /ports失败只影响OS烧录端口错误，不把已在线能力服务或已连接Web Serial标为离线；缺core属于当前profile不可用。检查有有界超时和代次/并发保护，禁止旧响应覆盖新状态，不新POST作业、不改主控/显式端口选择或dirty。正在运行的作业仍按既有poll/取消/占有流程，不能因健康检查失败就视为工具退出。
4. 终端状态生命周期修复：将现有有界SerialLog、输入、收发格式、行尾、pause与提示移至每个编辑器既有硬件绑定的单一TerminalModel，UI只订阅视图更新。切模式、隐藏代码区/终端及locale重挂不隐式清空或重复订阅；普通终端的隐藏期RX仍记录，保留现有暂停丢弃语义和容量上限。只有实际sessionId变化才分隔解码/行，显式清空只清显示，不关闭端口。协议占用继续遵守现有策略，不把协议数据当普通终端内容。成功实际写入后才记TX，不产生第二reader/writer。新页面无需恢复历史，状态不写.ob/localStorage/后端。

搜索空查询、清除、Escape/关闭恢复原类别与合理焦点/滚动；原类别已移除则使用既有fallback。无结果明确说明，不清空原类别。索引在文档/目标/locale/模式/主控/扩展/工具箱/变量或过程变化时失效，以代次令牌忽略旧结果；排除临时搜索类别，避免递归索引。搜索、关闭和重建不改变主工作区、块图、监视器、素材、手稿、运行状态或editVersion。输入与关闭/清除可键盘操作，结果数量可读，忙/模态守卫沿用现有边界。避免将Monaco Ctrl+F/Z/Y或原生积木快捷键抢走。

补充第5项：扩展库增加真实“已加载”筛选。当前网页版同字节bundle的状态筛选包含isLoaded，REA证据与实际代码见前端提案引用的W-library、.runtime/extension-library-v06-research/key-source-excerpts.json；CFZN目前只有类型/兼容筛选。舞台扩展取既有原生isExtensionLoaded，主控取实际currentDevice，模块取adapter.loaded，不维护另一份loaded集合。类型AND已加载AND支持当前主控AND原生搜索；默认不勾选、各大分类记忆自身状态，两个主控入口共用同一controllers状态。取消勾选只改展示，不卸载。加载/移除后列表立即依据实际状态更新；无结果可清除当前分类全部筛选，回到完整目录。保留空主控、引用保护、焦点回退、键盘可达及不产生dirty。没有收藏/下载真实系统时不新增假状态。

### 接口、实现职责与后续边界

HTTP/schema、归档字段、依赖与业务后端保持不变；前端可以增加私有LocalServiceState和TerminalModel，但现有串口/作业状态语义不变。GUI只增加搜索展示/生命周期挂点和保存快捷键集成，不改上游VM/Blockly工厂。前端开发负责apps/web，后端开发仅确认零业务改动并更新交接；主控负责契约与综合文档。

当前3002是本机编译上传执行器，不伪装已安装CFZN Link，也不兼容Mind+私有WebSocket。未来将其封装成连接程序后另冻结安装器、软件版本、权限和传输策略。当前只提供真实检测/诊断；WebSerial无本机编译服务时仍可按浏览器授权工作。复制/导出作业日志、桌面崩溃缓存、Python/多文件、账户/云市场、所有板驱动等列入差异报告，未经独立明确设计不在本轮扩大。顶部模式切换明确不改。

### 必须验收

构建、针对状态/索引纯逻辑的必要单测；Sol low在隔离Vite dev与static dist真实浏览器验证两焦点域保存（首次POST、后续PUT、最后编辑、重复/忙与412）、中文/英文与动态变量/列表/过程搜索、真实拖拽/菜单/shadow/生成、禁用和失效/关闭无损。服务离线/错误协议/缺core/端口单独失败/超时及旧响应隔离，终端切模式/locale后的唯一订阅、日志/输入/设置保留和旧session拒收需验证；模拟串口明确标为模拟，不访问COM3。178个VM模块及上游Blockly逐字节不变，新增hook全在GUI。用户5173/3001/3002服务不启停；全部自建测试服务/浏览器负责清理，自动审批拒绝的临时目录保留并如实报告。完整全功能/硬件等价不在本轮宣称。

Status: frozen by main controller. Hardware v0.2 dated 2026-11-07 remains the HTTP contract; the authoritative Mode UI v0.3 addendum at the end was added 2026-11-10 and supersedes earlier UI-mode/archive limitations. This document overrides design proposals.

## Hardware addendum v0.2 (2026-11-07, authoritative)

This addendum supersedes the original milestone's no-compilation limitation. Project HTTP/storage contracts are unchanged. Implement one browser Web Serial owner in the editor iframe and one local Arduino CLI executor. No second browser uploader, no remote-server serial enumeration, and no dependency on the incompatible 2021 OpenBlock Link protocol.

User constraint added during implementation: **do not modify openblock-vm source, including bundled VM source patches**. Prefer public APIs; isolate version-bound device registration in an external adapter. Remove the historical VM factory-export injection in the preparation hook; preserve GUI-only integration hooks and verify there are no remaining VM-targeted replacements. Main approves importing unchanged device classes from the exact pinned upstream VM and externally deriving new boards; because this version has no public factory registration API, the adapter may call its existing `_registerInternalExtension`, `runtime.setDevice` and `registerPeripheralExtension` methods without changing their bodies. Document this dependency and test all five boards' load/save/restore. Do not patch VM device identity analysis or bundle a second complete VM engine. If a capability still requires VM source changes, report it rather than altering the VM.

### Boards and scope

Keep `arduinoUno`, `arduinoEsp32S3`, `aijiteESP32S3`; expose built-in `arduinoEsp32` and add `firebeetleEsp32E` derived from the ordinary ESP32 class. The user's actual COM3 device has been queried: ESP32-D0WD-V3 revision 3, 40 MHz, 4 MB flash. User explicitly permits replacing its firmware with a serial test sketch. This does not identify it as a genuine DFR0654. Main alone coordinates physical port access.

FireBeetle uses observed board pin aliases with numeric GPIO values (e.g. D2/IO25 -> `25`, A0/IO36 -> `36`), correct input-only restrictions, independent metadata/profile, actual OpenBlock Arduino blocks/generators and archive restoration. Do not execute/copy Mind+ runtime or ship its firmware as verified. New ESP32 boards initially provide upload mode and general serial communication; no assertion of Mind+ realtime protocol compatibility. Preserve Uno's existing realtime distinction; never auto-install firmware when connecting. Existing six modules support new boards subject to their actual pin capabilities.

### Local executor and deployment

Backend owns a separately runnable hardware entry point in `apps/api` on **127.0.0.1:3002**, base **`http://127.0.0.1:3002/api/v1/hardware`**. Existing project API remains 3001. Frontend config `VITE_HARDWARE_BASE_URL` overrides this local URL; it must remain an explicit user-computer endpoint and cannot silently become the remote project API. Do not proxy cloud `/api` to server USB. Allow configured product origins plus local development origins; bind loopback. No accounts or new persistent user data.

Backend may reuse installed compiler/core files read-only through an explicit operator configuration, including the discovered Mind+ CLI/core for the current ESP32. All generated files and CLI user/config data belong to a separate CFZN runtime directory. Do not modify the user's Mind+/OpenBlock installations. Provide documented tool configuration and a local start command; missing dependencies produce unavailable capabilities, never fabricated compile success. Other boards may report unavailable if their core is missing; preserve their editor functionality. Backend owns `apps/api` package/lock/scripts and hardware configuration examples. Main owns root launch commands/docs.

### HTTP wire types

```ts
type DeviceId = 'arduinoUno' | 'arduinoEsp32S3' | 'aijiteESP32S3' | 'arduinoEsp32' | 'firebeetleEsp32E';
interface HardwareProfile {
  id: string; deviceId: DeviceId; label: string; chip: 'avr' | 'esp32' | 'esp32s3';
  fqbn: string; compileAvailable: boolean; uploadAvailable: boolean;
  realtimeAvailable: boolean; reason?: string;
}
interface HardwareCapabilities {
  protocolVersion: 1; executionHost: 'local'; profiles: HardwareProfile[];
  toolchain: { cliVersion: string | null; description: string };
}
interface HardwarePort {
  portId: string; displayName: string; usbVendorId?: string; usbProductId?: string;
}
interface HardwareJob {
  id: string; kind: 'build' | 'upload';
  state: 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';
  stage: 'compiling' | 'uploading' | 'complete';
  deviceId: DeviceId; profileId: string; sourceHash: string;
  createdAt: string; finishedAt?: string; buildId?: string; portId?: string;
  error?: { code: string; message: string };
}
interface HardwareLog { index: number; stream: 'stdout' | 'stderr' | 'system'; text: string }
```

| Method | Path below hardware base | Input | Success |
| --- | --- | --- | --- |
| GET | `/capabilities` | none | 200 HardwareCapabilities |
| GET | `/ports` | none | 200 `{items:HardwarePort[]}`; enumerate without opening |
| POST | `/builds` | `{deviceId,profileId,code,moduleIds?:string[]}` | 202 `{job:HardwareJob}` |
| GET | `/jobs/:id?afterLog=0` | next unread zero-based log index | 200 `{job,logs:HardwareLog[],nextLog:number}` |
| POST | `/uploads` | `{buildId,portId}` | 202 `{job}`; buildId is successful build job ID |
| POST | `/jobs/:id/cancel` | empty object | 200 `{job}`; cancelling until owned process exits |

Use existing `{error:{code,message,details?}}` error style: 400 VALIDATION_ERROR, 404 JOB_NOT_FOUND/PORT_NOT_FOUND, 409 HARDWARE_BUSY/BUILD_NOT_READY, 413 PAYLOAD_TOO_LARGE, 503 TOOLCHAIN_UNAVAILABLE. Async errors use COMPILE_FAILED/UPLOAD_FAILED/TOOL_TIMEOUT with actual diagnostics. One active CLI build/upload per executor; no persistent queue required. Source max 1 MiB UTF-8; build timeout 10 minutes, upload 3 minutes. Retain bounded logs (1 MiB/job) with explicit truncation notice and monotonic cursor. Successful build requires exit 0 plus actual expected artifacts; upload requires successful tool completion/verification. Cancel only owned task process tree; no success on abort. The backend chooses executable, FQBN, library paths and artifact paths from trusted profiles; webpage supplies none of these. Bind build ID to immutable code/profile/tool identity. Do not accept arbitrary binaries/paths to upload.

### Browser ownership and UI

Install `configureScratchLinkSocketFactory` adapter for supported SERIALPORT devices, preserving other transports. Support native JSON-RPC discovery/notification, connect/read/write/disconnect/baud change and upload progress/cancel via the one session. Deliver initial discovery asynchronously after native listeners mount. Never rely on the old Link endpoint for supported boards.

Native connection dialog gets a user-gesture **选择串口** button and authorized-port list; getPorts only returns grants, requestPort is called directly by click. Explain empty/cancel/error states and stop infinite scanning. Browser port identity is session-local, not a claimed Windows COM number. Parent serial drawer and native console share one reader/writer with true text/HEX/newline receive/send and disconnect handling. Parent drawer no longer creates a competing connection. Retain native blue MenuBar six buttons/project status with no extra header.

Keep existing validated bridge envelope. New commands: GET_HARDWARE_STATE, OPEN_HARDWARE_CONNECT, DISCONNECT_HARDWARE, WRITE_SERIAL `{sessionId,bytes:number[]}`, SET_SERIAL_OPTIONS `{options:SerialOptions}`, HARDWARE_COMPILE, HARDWARE_UPLOAD, HARDWARE_CANCEL. Events: HARDWARE_STATE (connection/use/board/port/options/job/errors), SERIAL_BYTES `{sessionId,bytes:number[]}`. Frontend owns both message endpoints and runtime shape validation; these are internal UI interfaces, not backend HTTP. State and progress must not mark the project saved. Internal precise fields may be finalized together in editor-protocol.ts without changing HTTP schemas.

Use current native `codeEditorValue` for compile/upload (including manually edited code). Provide compile-only and local upload-port/profile selection in hardware controls; native upload invokes same controller. Capture current source/board/profile per operation; changes require fresh compile, no stale binary silently uploaded. Before upload, user explicitly selects the OS port from `/ports`; do not infer it from VID/PID or choose first port. Release browser reader/writer/port and block sends before POST /uploads. Preserve ownership until backend terminal state. Restore previous browser terminal only if previously opened and safe; report restoration failure separately from successful upload. Missing local executor does not prevent browser serial communication.

Do not auto-flash on connect/import/board select. Upload is an explicit action. CPU/firmware handshake errors are distinct from open serial. No pseudo progress: show actual phases/logs. Native timeout/cancel must reflect the real task rather than leaving CLI running after a false terminal result.

### Acceptance

Actual target priority: COM3 ordinary ESP32. Verify native board selection/discovery, browser read/write, real build artifacts, actual program upload, reset, marker readback and echo. Five-board editor/archive regressions and six modules use real blocks and generated code; compile at least ESP32 and FireBeetle profiles with actual tools. Unavailable cores and unowned boards are explicitly documented, not called physically tested. Test error/empty/cancel/port contention and close-before-upload with meaningful mocks; distinguish those from real hardware. Root tests remain independent. Physical access is serialized by main.

## Scope and topology

- Web: React + TypeScript, Vite on `127.0.0.1:5173`.
- Editor: self-hosted official OpenBlock GUI `0.1.0-prerelease.20250611102354`, React 16 in same-origin `/openblock.html`; preserve original UI. Use its real VM, not a block imitation.
- API: NestJS + TypeScript on `127.0.0.1:3001`; frontend proxies `/api`.
- Storage: anonymous local projects. No users, accounts, login, ownerId, SQL, Python API calls, Redis or OSS credentials in v0.1. An internal repository interface permits later replacement after Python contracts are known.
- Serial: browser Web Serial, user-initiated permission/connection, terminal send/receive. No server serial endpoint. Hardware compiling/flashing requires a separate device-specific integration and is not claimed by this milestone.

## Project representation

OpenBlock native archive uses `.ob` (ZIP with `project.json` and referenced assets), MIME `application/x.openblock.ob`. `vm.saveProjectSb3()` produces this complete archive. Import accepts compatible `.ob` / `.sb3`; do not store `vm.toJSON()` alone.

```ts
interface Project {
  id: string;                 // server-generated UUID
  name: string;               // trimmed, 1..100 characters
  revision: number;           // integer >= 1
  format: 'openblock';
  sizeBytes: number;          // archive byte length
  createdAt: string;          // ISO 8601 UTC
  updatedAt: string;          // ISO 8601 UTC
}
interface ProjectResponse { project: Project }
interface ProjectsResponse { items: Project[] }
interface ApiError { error: { code: string; message: string; details?: unknown } }
```

List order: newest updated first. No pagination in this local MVP. No user identifiers in requests, records or responses.

## Endpoints

Base path `/api/v1`.

| Method | Path | Input | Success |
| --- | --- | --- | --- |
| GET | `/health` | none | 200 `{status:'ok',storage:'local',auth:'none'}` |
| GET | `/projects` | none | 200 `{items: Project[]}` |
| POST | `/projects` | multipart form `name` + binary `file` | 201 `{project: Project}`; revision 1 |
| GET | `/projects/:id` | UUID | 200 `{project: Project}` |
| PATCH | `/projects/:id` | JSON `{name:string}` + `If-Match` | 200 `{project: Project}`; revision incremented |
| DELETE | `/projects/:id` | `If-Match` | 204 empty |
| GET | `/projects/:id/content` | UUID | 200 raw complete `.ob` archive |
| PUT | `/projects/:id/content` | raw `application/octet-stream` or `application/x.openblock.ob` + `If-Match` | 200 `{project: Project}`; revision incremented |

Project reads and writes include `ETag: "<revision>"`, e.g. `"1"`. Client sends exactly quoted `If-Match: "1"` for mutation. A stale value is 412 `REVISION_CONFLICT`, missing header 428 `PRECONDITION_REQUIRED`. `GET content` accepts optional `If-Match` (412 on mismatch) and includes the same revision ETag and Content-Disposition attachment filename ending `.ob`. Frontend should send the metadata revision when loading content to avoid loading two different versions. Error responses use JSON above, never HTML. Content download uses `Cache-Control: no-store` to avoid confusing archive/metadata revisions.

POST creates only after the full archive validates. UI new project starts as an unsaved editor document; first save POSTs its complete VM archive. Import can load locally and first save POST. Existing save PUTs full archive; export can serialize current unsaved editor or download persisted archive.

## Validation and storage behavior

- Max compressed archive: 20 MiB. Max expanded archive: 100 MiB; max `project.json`: 5 MiB. Return 413 `PAYLOAD_TOO_LARGE` when exceeded.
- Validate ZIP with a root `project.json`, parsable object and `targets` array. Preserve full original bytes and all assets; never reconstruct from JSON-only state.
- Require referenced costume and sound assets to exist in the archive when defined. Do not extract user paths into the host filesystem.
- Invalid metadata / UUID / malformed If-Match: 400 `VALIDATION_ERROR`; malformed archive: 422 `INVALID_PROJECT`; unknown project: 404 `PROJECT_NOT_FOUND`; unsupported upload media: 415 `UNSUPPORTED_MEDIA_TYPE`; storage failure: 500 `STORAGE_ERROR`.
- Commit metadata and archive consistently; a failed save must not replace a prior valid project. A server restart retains projects. Single local API process is the deployment scope.
- A storage repository abstraction covers list/read/create/update/rename/delete. Future identity and OSS implementations stay behind that boundary; no invented Python request schema today.

## Frontend behavior

- Preserve OpenBlock blue toolbar, categories, block workspace, stage, sprites and code/costume/sound editing. Project actions and status belong inside the native blue MenuBar itself, as specified in the native toolbar addendum below; no separate outer app-bar or extra row below MenuBar.
- Show loading/saving/saved/error state. Never show saved before server success. Version conflict offers reload or save as a new project, never silent overwrite.
- Protect unsaved changes when opening/new/importing another project.
- Parent/editor bridge uses version `1`, explicit same-origin/source checks, request ids, ready/load/export/title/dirty messages and timeout rejection. Frontend owns its exact internal message schema and documents it in `apps/web/README.md`.
- Obtain VM through GUI `onVmInit`; loading must synchronize GUI loading/dirty state through upstream Redux actions or its supported project-state lifecycle, not only mutate an isolated VM.
- Serial supports baud rate, connect/disconnect, text and hex send, text/hex receive, newline choice, clear log, unsupported-browser/no-device/error status. Browser permission must originate from a click. Disconnect releases reader/writer locks. Actual hardware acceptance remains separate from automated mock-stream tests.

## Acceptance

1. Clean install/build/typecheck runs on this Windows Node 24 environment with documented commands.
2. Official editor renders and actual blocks can be placed and executed.
3. Save/import/export/load round-trip includes asset bytes and survives API restart.
4. Rename/delete and invalid/stale requests match the contract.
5. Frontend calls the real API, handles failure truthfully, and does not collect user information.
6. Serial mock tests cover reading/writing/disconnection; a manual checklist records what real hardware has not yet verified.

## Upstream references

- https://github.com/openblockcc/openblock-gui/tree/cdd3478c3d9bbced4cb50f4ac0dda8593416c889
- https://github.com/openblockcc/openblock-vm
- https://developer.chrome.com/docs/capabilities/serial

## Controller and module extensions addendum — 2026-11-06

Status: frozen by current main controller for the requested extension-library change. Existing HTTP API v0.1, metadata, limits and revision semantics remain unchanged. This addendum takes precedence over the two extension proposals where they differ.

### Scope and initial catalog

The user confirmed built-in migration from the previous IDE plus a documented code integration path. No extension-package upload/import UI, remote marketplace or new backend API is included.

Retain the original OpenBlock extension button, full-screen library, search and card styling. Add `主控扩展` and `模块扩展` category buttons in the original library filter bar; keep the stage extensions accessible via `舞台扩展`. Category selection and search must not clear the project or accidentally reset each other. These controls must use actual component state and accessible buttons, not fragile DOM/Fiber inspection.

| Controller | Canonical deviceId | Implementation |
| --- | --- | --- |
| Arduino Uno | `arduinoUno` | Existing official device |
| ESP32-S3 | `arduinoEsp32S3` | Existing official device |
| Aijite ESP32-S3 | `aijiteESP32S3` | Official ESP32-S3 base with the old Aijite device's IO3 exclusions |

Aijite is a distinct selectable device, upload/Arduino mode, compatible with the ESP32-S3 module family. Accept the legacy `aijiteEsp32S3` spelling on import and normalize it to the canonical ID. An old archive containing `arduinoEsp32S3` remains a generic ESP32-S3 project; do not infer brand from its title. Preserve the original device menu's existing official boards.

| Module | extensionId | Required capability |
| --- | --- | --- |
| 有源蜂鸣器 | `activateBuzzer` | Initialization and digital on/off code |
| 雾化模块 | `atomizer` | Initialization, state and toggle code |
| 人体红外 | `pirSensor` | Initialization and digital boolean read |
| 火焰传感器 | `flameSensor` | Digital/analog reads |
| 水滴传感器 | `raindropSensor` | Digital/analog reads |
| 积木注释 | `moreComments` | Statement/branch comments with nested code preserved |

Preserve the old modules' real opcodes and their compatible argument/menu meanings. Only the `activateBuzzer` variant is registered; the conflicting `activeBuzzer` variant is excluded. These six modules support the three listed controllers in Arduino upload mode. Their real blocks, toolbox and code generators must work; a card or saved ID alone is insufficient. K230, incomplete LED/Button/RGB samples, cloud AI and library-dependent modules are outside this initial catalog.

### Integration ownership

Frontend owns the catalog, local module source/assets, Aijite device adaptation and user documentation under `apps/web/`. Bundle required resources with the website; the old F: directory and localhost:20112 resource service are not production dependencies.

The main controller accepts narrow, reproducible integration hooks in the pinned official GUI package for the library controls/container, device metadata and device factory registration. Keep changes in versioned frontend preparation code with exact-source/version checks and cache invalidation for patch/resource changes. Do not hand-edit generated runtime files or node_modules, replace the VM engine/serializer, or migrate to the entire old fork. Any new public API or broader core change must return to main for alignment.

Register the local resource adapter before initial/default and imported project loading. It must handle both user selections and VM-driven restoration; use explicit module exports/registrations and avoid racing the old global register-function slots. Keep real device/toolbox readiness and failed registration inside the operation's completion boundary.

### State and behavior

- Single selected controller, multiple loaded modules. Derive selected/loaded state from the VM. Repeated selection is idempotent.
- Browsing categories never changes program mode. Adding a module requires a compatible selected controller in Arduino upload mode. Explain missing controller or unsupported mode and provide a way to select/switch; do not silently claim a module is loaded. Show a `支持当前主控` filter; unsupported entries, if shown, cannot load.
- Successful controller/module changes mark the project dirty even without placed blocks. Export/save waits for current extension operations to settle or reports busy; never saves an intermediate registration state.
- Controller changes must preserve compatible modules. If a change or removal would leave existing blocks without their implementation, refuse with a specific message and leave the project intact; do not silently delete scripts. Module removal, if exposed, follows the same rule.
- Show a loading state until the actual blocks/toolbox/generator registration finishes. Failures name the controller/module and preserve or restore the previous editable project. Do not silently skip unsupported IDs when opening a project.
- Loading an ordinary project or creating a new one clears the previous project's selected device/modules. Successful restoration is not a user edit. Choosing a device does not request serial permission, connect hardware, run scripts or upload firmware.

### Persistence and backend boundary

Use the existing complete `.ob` archive and VM-native `device`, `programMode`, `extensions`, `deviceExtensions`, `targets` and referenced costume/sound assets. `deviceExtensions` includes loaded modules even when no blocks have been placed. No second metadata state, custom sidecar or new endpoint is needed.

The API continues validating archive structure/assets and storing the original bytes. It does not execute extension scripts or reject an otherwise valid archive merely because an extension ID is unknown to this site's catalog. Local editor availability and compatibility are checked by the frontend before destructive replacement, using the existing load-error/rollback path.

Module code and images are versioned application resources, not embedded plugins in `.ob`. Keep the shipped ID/opcode meanings stable. Document where to register a controller/module, which files/functions are required, and how to verify loading and round-trip behavior. Preserve source/asset paths and accompanying licenses; do not copy Mind+ implementation code or artwork.

### Acceptance for this change

1. Both new category buttons are inside the native filter bar; stage extensions, search, selection states, keyboard focus and small-screen scrolling remain usable. Review screenshots of the new library.
2. All three controller entries select real VM devices. Aijite excludes IO3 in digital/analog/touch and module menus, while generic ESP32-S3 keeps its own menu behavior.
3. Each of the six modules exposes real draggable blocks and generates the expected Arduino statements/expressions with edited parameters. Verify real block combinations, not only exported function existence. Stage pen/music execution remains functional.
4. Aijite + multiple modules, including one without placed blocks, survives export/import and save/reopen with unchanged opcodes, block connections, parameters and costume/sound assets. Reopen in a fresh iframe/browser context to exercise restoration.
5. Missing/unsupported IDs, failed registration, duplicate clicks, incompatible operations and switching away from used modules do not cause silent loss or false success. Regular projects and the legacy alias remain compatible.
6. Real archive POST/GET and PUT/GET preserve bytes and native extension state; existing conflict and size validation remains intact. Build, typecheck and relevant tests pass.
7. The shipped build works without the old source tree or a 20112 extension-resource service; clean preparation re-applies required hooks and copies resources. Existing optional OpenBlock Link connection probes are separate from module resource loading.

This milestone delivers editing and Arduino code generation for these hardware modules. Compilation, flashing and real sensor/actuator operation are separate capabilities, and no real hardware pass is claimed without physical testing. The existing browser Web Serial terminal stays available as its own function.

## Native project toolbar addendum — 2026-11-06

Frozen by main and corrected following the user's MenuBar placement clarification. This overrides both the earlier separate platform-bar arrangement and the first implementation in the alerts container. HTTP API v0.1, project archives, storage and extension contracts are unchanged.

### Placement and ownership

Keep the outer `App.tsx` app-bar removed. Render the six existing controls and `project-status` directly inside the actual native `gui_menu-bar-position_3U1T0 menu-bar_menu-bar_JcuHF box_box_2jjDp` MenuBar, on its original blue row, through a narrow reproducible hook in the pinned frontend preparation script. Retain the native title, Edit, device/connection and other native controls. Remove the redundant original File menu specifically; shared menu-item/hoverable/active classes are not a safe removal selector. Do not mount another application bar, manipulate React internals or hand-edit generated files. Extend the existing `CFZNOpenBlock` integration without removing its extension-library hook.

The controls are direct children of MenuBar between its native title and tail controls. Remove the first implementation's alerts hook, body padding hook, height measurement and CSS spacing variable. Restore native alerts and body positioning; the code/costume/sound tabs follow the original 3rem menu without a new strip or reserved gap. Keep controls on one row. At narrow widths the controls may scroll within their own group, while native dropdowns remain unclipped; do not apply clipping overflow to the whole MenuBar. Preserve original editor styling and modal/fullscreen interaction priority. Keep the existing native responsive title behavior unless a minimal layout adjustment is needed.

Parent App remains authoritative for all project API calls, `active/revision`, busy state, save status, notices, conflict recovery and project/serial drawers. Child iframe owns VM, native UI, document/edit versions and archive serialization. Do not duplicate persistence logic in the new controls. Project notices and conflict buttons may remain as existing transient parent feedback; preserve their visibility.

### Internal bridge

Use existing `cfzn.openblock` / version 1 envelopes with both origin and source checks. Add only these view/action messages (not HTTP endpoints):

```ts
interface ProjectToolbarState {
  statusText: string;
  statusKind: 'pending' | 'dirty' | 'saved' | 'unsaved';
  documentActionsDisabled: boolean;
  drawer: 'projects' | 'serial' | null;
}
// Parent → child: PROJECT_TOOLBAR_STATE, payload ProjectToolbarState.
// Child → parent: PROJECT_TOOLBAR_ACTION, payload { action }.
type ProjectToolbarAction = 'projects' | 'new' | 'export' | 'save' | 'serial';
```

Send current view on readiness and whenever relevant parent state changes. Child defaults to pending/disabled until synchronized; updates must not recreate the editor. Validate new message shapes/action names, and keep authoritative parent busy/readiness guards. Ordinary action intents carry no project ID, revision or fabricated saved state. Existing request/reply IDs and timeout behavior remain unchanged.

The six buttons retain `data-testid` names: `project-list-button`, `new-project`, `import-project`, `export-project`, `save-project`, `serial-button`; status retains `project-status`. These now reside in the iframe. Projects and serial buttons reflect the parent's real drawer with `aria-expanded`; other document actions follow the parent disabled state. Preserve accessible button names and focus indicators.

Import executes the iframe's existing `chooseImport()` directly from the click, then uses existing `IMPORT_REQUEST` / `IMPORT_ERROR`. Keep a stable file input/test target in the iframe if needed for browser tests; do not invoke a removed parent input after asynchronous messaging. The parent still validates, confirms dirty replacement, and loads imports. The serial action only opens/closes the parent drawer; its separate Connect button directly requests Web Serial permission in the parent click handler.

### Save semantics and acceptance

Compute status only in App, in existing priority order: busy → not ready → dirty → saved active revision → unsaved project. A clean fresh document with no active project is `未保存项目`. Only an API-confirmed active project with a clean current snapshot may show `已保存 · vN`; dirty content shows `未保存的更改`. Export/download never marks saved. Preserve documentId/editVersion checks so saving an earlier snapshot does not mark later edits or a different document saved. Keep failure feedback, 412 reload/save-as recovery and partial PUT/PATCH success semantics.

Verify all six real interactions through the migrated controls: new/dirty replacement protection, native file picker/import, actual export download with dirty preserved, create/update/save status and project reopen, project/serial drawer toggles. Exercise delayed save with a newer edit plus save failure/conflict. Confirm actual native alerts still render/dismiss, no outer duplicate app-bar, no overlap at desktop/narrow widths, original title editing and extension library work, and no new page errors. Use isolated API/storage for mutation tests. Do not stop the user's existing 5173/3001 services; clean up only services created for this task. No physical serial test is implied by the UI migration.

For the placement correction, reuse the completed bridge/save-semantics evidence and run focused layout/interaction regressions. Assert that the group is a direct MenuBar child, every desktop button and status lies within the menu bounds, native File is absent while Edit/device controls remain, and no alerts/body spacer survives. Check narrow-width access, import/save/export and native dropdown/alert behavior against the corrected build; do not repeat unrelated API or extension matrices.

## Mode UI addendum v0.3 (2026-11-10, authoritative)

User-requested correction: selected controller visibility; replace the disabled native mode switch with Programming / Upload buttons; programming uses the real stage/sprite/costume/sound UI and upload uses a right-hand code/upload/serial workspace following the supplied Mind+ references. Desktop investigation: docs/design/mindplus-desktop-mode-observations.md. This addendum resolves differences between mode-ui-frontend.md and mode-ui-backend.md.

### State and actual behavior

- Labels are 编程模式 / 上传模式. Replace the original slider at the native MenuBar mode position; retain the six project actions and save status in that same MenuBar.
- Use a small external ModeController. `editorMode: programming | upload`, `codeMode: generated | manual`. To obtain actual stage toolbox, execution, costume/sound tabs, call the existing runtime mode setter: programming -> true; upload -> false. Do not patch VM source/bundled code or claim that true proves a working realtime hardware protocol.
- Hardware protocol eligibility/activity is separate from stage execution. Unsupported ESP32/S3/FireBeetle realtime protocol remains unavailable. Selecting programming must not initiate Firmata, upload firmware, change terminal baud rate or close/reopen a connected text terminal. Gate this at external NativeSerialSocket/session integration. Preserve existing Uno protocol behavior when explicitly used.
- Adjust external adapter guards and GUI device-added mode override so upload-only board metadata cannot force a user-selected programming view back to upload. Do not fabricate realtime in device metadata. Modules remain loaded and serialized in programming mode, but upload-only hardware operations must not execute as realtime drivers. On restore, register modules under the supported upload setup then restore the archived mode. Keep actual blocks, sprites, assets and board identity.
- New projects default programming. Selecting a controller may initially enter upload as before. Mode change changes the native `programMode` field, so counts as a project edit. Repeated click is a no-op. Busy hardware/project/extension transition prevents conflicting changes with a visible reason.
- Preserve one VM and one HardwareSession/controller through mode switches. Mode UI must work with missing local compiler and with no board selected (upload execution then explains that a board is needed).

### Visible layout

- Library current-controller status: bold white text on a readable deep blue background. Actual current controller card has a stable 2px blue selected border and `aria-pressed`; selection follows committed canonical deviceId, not hover/focus or profile. Preserve current-controller text for non-color identification.
- Programming view shows the original stage, sprite controls, costume and sound tabs and real runnable stage blocks. Upload view hides stage/sprite management and shows a single right-hand workspace: Upload to device + settings/compile action; code visibility toggle and Arduino C label; Automatic generation / Manual editing tabs; the real existing code editor; serial log and send/connection controls below.
- Use the existing GUI Hardware slot/React16 render hooks, not DOM reparenting, a second app bar or a fake textarea replacing the native editor. GUI hooks stay exact, pinned and src/ scoped. Keep OpenBlock blue palette; screenshots override generic skill style choices.
- Upload button calls existing nativeHardware/HardwareController with the current source. OS port must be explicitly selected. Missing config opens the existing settings with a clear next action. Same job state/log/cancel flow; no second upload implementation. Retain local3002 vs project3001 boundary.
- Serial view reuses HardwareSession, including RX/TX, text/HEX, baud rate, line ending, clear/pause as supported. No second reader/writer. Hiding the code/terminal is presentation, not port disconnection.

### Code sources and project archive

- Keep generated code and manual draft separately. Automatic is readonly and comes from existing Blockly Arduino generator. First entering Manual copies current generated text; later entry restores the retained draft. Returning to Automatic preserves the draft (no destructive confirmation is needed). An explicit replace-draft action, if provided, must explain replacement.
- Upload/compile captures the selected source into the existing controller's source snapshot; don't upload a hidden previous source. Editing manual code marks dirty; generated refresh itself doesn't add edits beyond the underlying block edit. Compile/upload success never marks saved.
- Freeze a single optional ZIP entry `cfzn/editor.json` within the full `.ob` archive:
  `{ "version": 1, "codeMode": "generated" | "manual", "manualSource"?: string }`.
  Maximum manualSource UTF-8 length is 1 MiB, same as compile input. Keep original project.json, blocks, assets and native programMode authoritative. No connection/COM/job/profile/logs in archive. No backend HTTP fields are added.
- Implement archive add/read outside VM source. Missing entry means generated and no inherited draft. Unsupported/malformed entry must fail before replacing the current document. Restore manual code after GUI loading/generator effects settle. New/import/open/save/export/load-failure rollback must cover drafts consistently; failed board switch preserves draft. Switching boards keeps a draft visibly associated with the changed board, and must never automatically compile/upload it.
- Snapshot archive and editVersion coherently. A save completing after later edits cannot clear dirty. Mode/code-source/draft changes increment the current document editVersion. Existing exact archive storage and revision semantics remain.

### Acceptance

Verify selected border/status in native device and extension libraries; both modes on FireBeetle and ESP32; real stage motion/costume/sound and return to original hardware blocks; generation/manual edit and retain draft across mode changes; save/export plus fresh-context reopen including six modules and assets; historical archives; dirty on manual edit and no false saved after upload; no hidden serial reopen/baud change/Firmata on ESP32 mode change; one session plus compile/upload handoff and busy guards; original six MenuBar actions; zero VM module byte changes. Inspect screenshots at desktop and narrower width. Independent testing uses gpt-6.1-sol / low and no physical port; physical COM3 remains main-only. Existing physical flash and RX evidence is historical, not proof that newly changed UI was physically tested.

## Project toolbar update (2026-11-10, authoritative)

The user removed the native MenuBar project toolbar's Serial Terminal button (`serial-button`, styled by `cfzn-project-button`). The toolbar now contains Project, New, Import, Export and Save, plus `project-status`. This supersedes earlier six-button requirements. The upload workspace serial terminal remains available. No changes to serial transport, HTTP APIs, project archives or OpenBlock VM are required.

### Removal of the retired standalone serial drawer (2026-11-10)

The removed toolbar entry's `SerialPanel` drawer, `serial` toolbar action/drawer value, drawer-only styles, and parent-window hardware/serial subscriptions and notifications (`HARDWARE_STATE`, `SERIAL_BYTES`) are retired. `WRITE_SERIAL` and `SET_SERIAL_OPTIONS` bridge requests are removed because their sole product consumer was that drawer. Upload-mode `SharedTerminal` continues to call the existing local hardware session directly. Existing hardware diagnostic/control requests (`GET_HARDWARE_STATE`, `OPEN_HARDWARE_CONNECT`, `DISCONNECT_HARDWARE`, `HARDWARE_COMPILE`, `HARDWARE_UPLOAD`, `HARDWARE_CANCEL`) remain in use by hardware/mode verification and are retained. Backend audit found no drawer-specific HTTP endpoint or serial service; existing compiler/uploader APIs remain unchanged.

## Connection modal v0.4 (2026-11-10, authoritative)

This replaces the old plain connection dialog UI only. Hardware v0.2 HTTP APIs, Mode UI v0.3, anonymous project archives, the five project actions and retired standalone serial drawer remain as established.

### Presentation and authorization

- The existing native connection menu button opens one custom in-page modal titled `连接 + <current controller display name>`; it does not itself call requestPort. Retain the current CFZN/OpenBlock blue chrome, reproduce the reference table and lower status illustration layout, and provide a close control and keyboard focus behavior. No second app bar or extra terminal drawer.
- Show real authorized browser ports as device rows with a recognizable USB-chip description where known, browser-port label, connection state, and connect/switch/disconnect action. Never invent COM paths or exact board identity. Web Serial getInfo does not provide an OS COM path. Existing OS upload-port selection remains explicitly labeled `本机烧录端口` if surfaced here, reads/writes the same HardwareController.portId as upload settings, and never automatically binds from USB IDs or list order.
- Explicit `添加新设备` (or equivalent clear authorization action) calls requestPort synchronously from its click handler. Already-authorized rows connect without another chooser. Cancellation never loops or disconnects a working old session. Adding authorization while already connected is allowed, but opening another port must use the single-session switch operation below. Browser first-authorization UI cannot be replaced by DOM.
- The lower region distinguishes actual enumerating/connecting, no authorization/idle, connected, and failure states. Refresh-list errors must not falsify an existing open connection. Show actual errors and retry/disconnect actions; do not run a perpetual fake scan. Open indicates a usable serial stream, not verified ESP32 firmware protocol support.
- Use the researched Mind+ scanning illustration, result rings and serial/link icon resources as local assets with source URLs, hashes and extraction notes. Reference research is in docs/design/connection-modal-frontend.md and .runtime/connection-modal-research/. No proprietary VM, connection implementation, or firmware is copied.

### One serial settings transaction

- Modal and upload terminal provide baud-rate draft and Apply controls. Allow switching authorized browser ports in the modal. Applied values are exclusively HardwareSession.options / portId / status; all displayed values (including native hardware-console baudrate and native connection name) synchronize after successful commit or recovery. Applying serial settings does not modify Serial.begin blocks/source, UploadSpeed, project dirty state, or archive contents.
- Implement one external adapter/controller command `applySerialSettings({ browserPortId?: string, options: SerialOptions })`. All modal/terminal changes and NativeSerialSocket connect/updateBaudrate converge on the same session mutation coordinator. Internal operation flags may be added to HardwareSnapshot as needed without adding HTTP or parent-window message types. No duplicate reader, writer, or serial owner.
- Validate finite unsigned-long positive integer baud and full existing options before mutation; no changes for same target and identical options. No target and disconnected means update next-connect settings only. Reject conflicting operations during authorization, switching, closing, hardware jobs, or relevant mode/extension transitions. Preserve actual protocol restrictions; an ESP32 programming view alone is not protocol ownership.
- Switching target/rate freezes new writes, drains pending writes, cancels/releases the old reader/writer, awaits close, then opens the target exactly once. Commit target/options/sessionId only after streams are ready. A failed close keeps ownership and prevents opening another port or starting upload.
- If target open fails, clean up its acquired handle first, then attempt to restore the prior available port with prior options without reauthorization or TX replay. Restore success displays the old real connection and a visible failed-change message; restore failure displays actual disconnected/error state. If target cleanup fails, retain ownership and never open a second handle. Stale disconnect/read events must not close a newer session.
- Native Redux synchronization is a display mirror. Prevent same-value dispatch/configuration loops. Preserve existing VM APIs through the external adapter; do not patch openblock-vm source or bundled VM modules. Avoid re-scanning in a way that closes an active socket during rate/port change.

### Backend and verification

No new HTTP endpoints, dependency or backend serial proxy is needed. Keep explicit upload OS port choice, compile/upload cancellation and browser-port release/restore behavior. Local executor absence must not block browser-only serial connection. No physical device writes or service restart are required for this UI task.

Verify actual in-page modal layout and responsive bounds; authorized connect without requestPort; explicit new authorization and cancellation; rate/port switch synchronization and no-op; ordered single ownership and failure recovery/failed-close protection; unavailable local service and ambiguous USB devices; retained upload terminal chunk/UTF8/HEX behavior; busy/protocol guards and unchanged VM modules. Test doubles must be identified as simulated, not physical hardware evidence.

## Menu title sizing and export entry update (2026-11-10)

The native project-name field must have a stable desktop width with explicit minimum and maximum bounds, rather than growing with all remaining viewport space. Preserve full title editing and existing title persistence; this is a visual width constraint, not a new character-count rule. Narrow-screen sizing may shrink within the established menu layout. Large viewports (including 2560px) and long Chinese/Latin titles must not stretch the input or push project/mode actions out of bounds.

Keep the CFZN project toolbar Export action as the single visible project-export entry. Once its function is confirmed equivalent to the native title-adjacent export/download control, omit only that duplicate native GUI control. Preserve complete .ob export, assets and editor metadata, existing save/status behavior and unrelated native controls. No backend, HTTP or VM-source changes are required.

## Adjacent title controls and floating messages (2026-11-10)

The native bounded project-title block must sit immediately to the left of `.cfzn-project-tools`, with a small 4–8px visual gap rather than viewport-distributed blank space. Both form a right-aligned group before the existing native tail menu: distribute remaining desktop space before the title, not between title/tools or tools/tail. Preserve the prior title width constraints, five project actions, save status, and reachable native/mode controls. This is a scoped native MenuBar layout change, not a new application toolbar.

Replace the parent App's in-flow full-width notice strip with a top-centred floating message inspired by the Element Plus Message reference: https://element-plus.org/zh-CN/component/message . Implement with the existing React stack and local CSS; do not add a Vue runtime or migrate frameworks. Reuse the existing Notice state and operation results. Messages are position:fixed (or an equivalent parent overlay), width-fit within the viewport, have a status icon/type tint and a labelled close button, and never resize or shift the editor iframe/menu.

Ordinary info/success messages auto-dismiss after approximately 3000ms, support manual dismissal, and pause while the message is hovered or keyboard-focused. Replacing a message cancels/invalidates its prior timer so a new result cannot be closed by an older timeout. Error/boot-failure/conflict messages remain visible until dismissed or replaced. Preserve the existing conflict recovery actions (reload / save as new) and their busy guards; never auto-dismiss an actionable conflict. Announce status/errors accessibly without stealing editor focus; render message text as text, not HTML.

All current operation notices use the same floating presentation (open/import/save/export/rename/delete/startup or import errors); add a clear successful-new-project result where the current implementation only clears the notice. No HTTP, storage, archive, protocol, serial or VM-source changes. Do not turn confirmation decisions into transient messages.

## Toolbox categories and built-in module loading v0.5 (2026-11-11, authoritative)

This addendum overrides earlier automatic-upload selection and realtime module-library restrictions, while preserving actual hardware capabilities. Main has reviewed docs/design/toolbox-categories-frontend.md and docs/design/toolbox-extension-loading-backend.md. REA selected Mind+ evidence: ev_ee29b19979070083651183ddbd40708ac86bb673a9e1b21642da3d687da0a648 (four shipped modules, static partial coverage; no new hardware/runtime observation).

### Mode and category presentation

Selecting a board or adding a compatible built-in module preserves the user's current programming/upload mode. Explicit mode buttons and imported project programMode remain authoritative. Remove forced upload from ordinary board selection; native default-mode setup must not override this intent. New/import/rollback flows restore their own document mode, never a stale previous document mode. Internal registration phases must not create extra dirty changes or touch a serial session.

Programming mode retains the native target-appropriate Scratch categories and working stage execution. Append exactly one category for the selected controller, followed by one category per committed module, with retained stage extensions. Upload mode retains the native Arduino-appropriate base set, then the same single-controller/per-module structure; do not inject Scratch-only blocks without generators into upload code generation.

Implement one external composeToolbox at the pinned GUI getToolboxXML integration point. Keep native makeToolboxXML for base categories. Capture read-only controller categoryInfoArray at the existing GUI registration event, before palette mode filtering; associate it with the actual canonical device and locale. Merge its pin/serial/data subcategories into one category with labels/separators, without nested categories. Suggested controller display ID is cfzn-controller-<deviceId>; existing module categoryId values remain stable. Preserve opcodes, shadow/menu identities, original parameters, target filters, hideFromPalette, device pin restrictions, generators and existing workspace blocks. Do not alter VM getters, conversion functions, primitives, source modules or bundled VM bytes. Caches contain recomputable presentation only; runtime committed IDs remain authoritative. Dedupe native board/module categories and invalidate stale presentation on new document, board or locale changes. Maintain category selection when it still exists.

Allow compatible modules to register in either UI mode; library cards are no longer disabled solely for realtime mode. Programming palettes explicitly label unsupported hardware blocks as '仅上传模式' and disable their use there; upload palettes enable the actual registered blocks. Board capability metadata remains truthful: ESP32 and derived boards do not gain an unimplemented realtime protocol by being visible. Six current modules have Arduino generators, not realtime primitives. Preserve actual Uno realtime behavior where provided.

Existing workspace/upload scripts must remain intact when switching modes. Through GUI execution/event integration and the existing parent RUN bridge, reject an attempted stage execution that would use unavailable hardware opcodes, with a visible actionable message. Cover green flag, stack click and stage keyboard/sprite/broadcast entry paths conservatively, including custom-block calls; stop unsafe mixed execution when workspace edits introduce unsupported blocks. A standalone Arduino-start upload script must not prevent an otherwise pure Scratch stage script from running. Do not silently skip unknown module primitives, fabricate hardware success, persist presentation-only disabled state into block data, or patch the VM executor. No new realtime firmware/protocol implementation is required.

### One trusted static module loader

Main selects the backend-design proposal's proven pure-static loader bridge, superseding the frontend proposal's generated-source module alternative. Do not implement two loaders/fallback paths. Keep existing vendor functions, moduleSource conversion and the 24 prepared ESM resources. Load one classic static helper from openblock.html before the Vite-managed editor module, like the existing static vendor scripts. Only that untransformed helper performs native dynamic import; the TypeScript adapter calls its fixed loadBuiltin interface and must not import the public helper from source.

The fixed interface is window.CFZNBuiltinModules.loadBuiltin(id, integrationSha256, attempt), returning Promise<{toolbox, translations, generator, blocks}> whose four values are default registration functions. It accepts only a built-in catalog module ID, a 64-digit hexadecimal version token and a nonnegative safe-integer explicit retry attempt, constructs four fixed same-origin paths, and validates all functions. No project-supplied URL/path, eval, Function constructor, Blob/data execution, global register* scratch slots, extra service, HMR-overlay suppression or broad Vite import exception. Scope caches by integration version and module; clear failed pending loads so an explicit retry can succeed. Never mix upgraded resource versions silently into an open project. Failed manifest fetching must be retryable rather than retaining a permanently rejected Promise. Preserve readable resource errors.

Acquire and validate all four functions before committing loaded state or mutating the document. Retain an extension busy guard during preparation; resource-preparation failure leaves the current project intact without needless deserialization. Registration failure retains the actual full archive rollback/recovery path. Cached functions must still be invoked again for a new board's pin menus; cached code is not cached registration. Completion requires definitions, Arduino generators and the composed category with expected opcodes, not whichever flyout category the user happened to select.

Include the helper in preparation input fingerprinting and deliver it with dist. Preparation cache-hit checks must verify required helper/24 module outputs so missing files can be repaired. Public icons keep their existing paths. Development and deployed static builds use the same loader boundary. Module retry counters, resource URLs/versions and presentation caches never enter the project archive.

### Unchanged boundaries and acceptance

No HTTP/schema/backend/storage changes. Keep complete .ob bytes, assets, original device/programMode/extensions/deviceExtensions and cfzn/editor.json manual-source metadata. Retain supported-board/pin compatibility validation, duplicate-load idempotency, rollback, busy guards and one Web Serial owner. Do not start hardware jobs, request serial permissions or flash firmware from selection/loading. No accounts, Python backend or OSS integration.

Frontend owns apps/web implementation and appropriate focused unit tests/build. Backend development only confirms zero implementation changes and hands off the existing byte-storage boundary. Independent Sol low acceptance must exercise actual isolated Vite dev and static dist, not static dist alone: preserve mode/base categories on board selection; exactly one controller and each module category; all six modules load, retry cleanly and generate parameter-sensitive Arduino code; programming-only stage execution works and unsupported mixed execution warns; board switch/menu compatibility and realtime-with-modules .ob restore retain state/assets/manual draft. Test failed manifest/module/default/registration cases as appropriate, no partial loaded IDs or lost project. Verify all VM webpack modules remain byte-identical to pinned upstream. Existing toolbar alignment, modal/serial and mode surfaces must stay intact. Report browser simulation separately from hardware; this task requires no physical COM3 operations or user-service restart.

## 扩展库选中、移除与类型筛选 v0.6（2026-11-11，主控冻结）

本节采用 docs/design/extension-library-v06-frontend.md 与 extension-library-v06-backend.md，覆盖早期没有移除能力、默认仅支持当前主控和黄色左上兼容提示的呈现。当前官网已通过 D:/rea 实际观察类型筛选、选中及无引用移除；使用中删除和级联未实测，不作为本项目设计依据。官网来源和 REA 证据见前端提案。本节与 v0.5 累积生效，禁止修改 VM 源码及打包 VM 字节。

### 原生卡片与真实目录筛选

保留 OpenBlock 蓝色原生 Library、图片、搜索和三分类。在现有 filterBar 内增加紧凑类型行，不重建模态、不使用事后 DOM 扫描外挂动作。只补精确 GUI src hook 的可选状态/动作数据链；未供应时保持原版行为。React16 iframe 节点由 iframe React 构造，不与父 React19 混用。

主控和模块均从实际 runtime 已提交 ID 派生选中状态，显示蓝色 2px 边框、明确“当前主控”或“已添加”文本，和始终可见的独立“移除”按钮。主体重复点击保持幂等，不变成删除。移除与主体选择为同级键盘目标，不嵌套 role=button/交互元素；动作点击和按键不冒泡触发添加。移除控件可放卡片尾部右侧，避免遮挡右上兼容角标。忙时保留实际状态、禁用冲突动作。

模块无主控时，在图像右上显示浅灰底、灰边、约 12px 字体的矩形“未选择主控板”；不再显示黄色左上 pill。存在但不兼容显示“不支持当前主控”，禁止添加并可读取真实支持列表；兼容显示“兼容当前主控”，仅指目录兼容，不宣称实时协议或硬件已验证。选中与兼容状态分开呈现。舞台扩展既有 coming-soon 行为不受这些样式影响。

类型使用可信目录显式元数据，不猜名称/描述。当前五个内置主控均 board（主控板）；pirSensor/flameSensor/raindropSensor 为 sensor（传感器）；activateBuzzer/atomizer 为 actuator（执行器）；moreComments 为 function（功能模块，代码辅助）。类型选项按该分区完整目录生成，含“全部”，仅有真实条目才出现；不制造套件、通信、显示、网络服务等空分类。原生全设备选择入口保持原有可选范围，“无主控”命令不作为商品。未来类型扩展沿同一元数据接入。

类型单选，分区分别记忆，首次全部；类型与原生关键词、支持当前主控筛选取交集。类型变化保留搜索，分区变化沿原生清搜索行为。兼容筛选默认 false；无主控时禁用且不生效，清除主控时重置，所有模块带灰角标可见。无结果有明确文案与“清除筛选”动作；不能误报加载失败。筛选、焦点、locale、视图重建不置 dirty、不写归档。类型行可换行/局部滚动，窄屏保持搜索与动作可达。无需收藏、下载商城、排序、账户或新远程扩展。

### 唯一移除命令与守卫

内部适配入口为 removeModule(id): Promise<void>、clearController(expectedDeviceId): Promise<void>；可提供 removalState({kind:'module'|'controller',id}) 返回 selected/allowed/reason/references/dependentModuleIds。reason 使用 busy/in-use/modules-loaded/serial-owned/unsupported/stale 等稳定键，UI 映射清晰原因。runtime 为唯一选择真相，缓存不代表加载状态。

模块仍被任一原始目标引用则拒绝，覆盖另一角色/舞台、游离、禁用、过程/参数、相关菜单 shadow，以及真实原生监视器/monitorBlocks 引用。不可只检查当前 workspace。已知未加载模块移除无副作用；未知 ID 拒绝。主控必须没有已加载模块，再检查主控拥有的 opcode/菜单/监视器与 event_whenarduinobegin 等相关开始帽；不按 ID 前缀漏检。依赖或引用存在时显示原因/相关名称，必要时提供前往模块扩展入口，不静默删除或级联清空程序。

命令与项目导入/加载、扩展事务、模式切换、硬件作业/未知作业、串口操作共用忙守卫，并在取得事务锁后重查。拒绝在备份、stopAll、原生卸载之前发生；仅禁用按钮不足。清空主控还要求实际串口释放和协议停止，包括关闭失败仍有 portId/sessionId 的 error 状态；外层通过现有公开状态注入 clearBlockedReason，不读私有句柄、不建第二 owner、不隐式断开。普通文本连接下移除未使用模块不触碰端口。

已有 manager.unloadDeviceExtension 外部 wrapper 收敛同一个异步 removeModule；restoring/internal 原生流程使用捕获 rawUnload 避免递归。原生 deviceId='null' 取消入口同样路由 clearController，过期 expectedDeviceId 不能删除后选主控。真实空身份是 JS null，不等待 deviceReady('null')。

### 完整归档事务

模块：沿已有事务取得含 cfzn/editor.json 的完整归档；调用 rawUnload；只失效目标 presentation，确认实际 loaded ID/category 消失、其他类别保留后一次 dirty 提交。保留成功静态函数缓存与共享 Blockly/generator 定义；重加仍重新调用注册函数，重绑当前板/locale。不要删除全局定义或用假 isLoaded 隐藏实际状态。

主控清空：采用后端提案的完整候选归档方案，覆盖前端提案中直接 null 加载的概述。通过已有 fflate/归档帮助层，仅将候选 project.json.device 设为原生空身份 {deviceId:null,type:null,pnpIdList:[]}，已确认 deviceExtensions 为空；保留其余完整内容。内部调用现有 vm.loadProject(candidate) 生命周期恢复舞台扩展、监视器、所有用户块/连接/参数、变量列表和素材，最后显式恢复原 programMode、codeMode/manualSource，并确认原生/Redux 空主控与旧类别消失。不能直接 clearDevice 后手填私有监视器状态，不能用空白作品替代。保持父 activeProject/documentId/revision 不变。

成功加载/移除作为一次编辑提交；no-op/拒绝/失败不增加 editVersion、保存版本或 API revision，不把原有 dirty 清掉。失败使用原完整归档回滚；双失败沿现有 recovery/锁定路径，不能报告成功。保留完整手写 C++，不以不可靠文本扫描或自动重写宣称更新其依赖。选中类别移除后回退可用类别并保持可用焦点，不能留下幽灵类别。保留 v0.5 模式、locale、执行守卫、同 VM 绑定幂等和全归档恢复边界。

### 责任与验收

前端 Sol ultra 负责 apps/web 实施、类型检查/构建和有意义的聚焦测试；后端 Sol ultra 只核对既有不透明 .ob 存储、API/硬件边界并交接，预期业务/HTTP/schema/dependency 零改动。主控负责本契约与综合文档。产品冻结后 Sol low 独立测试真实隔离 Vite dev 和静态 dist：无板灰角标/支持状态、选中与键盘、真实类型搜索交集、模块移除重加/换板、跨目标等引用拒绝、模块依赖阻止清板、无引用清板的全部文档内容保持、一次 dirty/no-op/失败语义、故障回滚、忙与失败关闭端口守卫、完整归档新页面重开和真实 API 字节存储；验证 VM 模块逐字节不变及关键 v0.5 行为。不能以伪造私有监视器结构代替原生监视器证明，测试注入需注明。无需实体 COM3、串口授权、编译烧录或用户服务重启。

## 两个主控入口共用目录（2026-11-11，主控冻结）

用户最新纠正覆盖此前扩展库仅展示五板、顶部保留全目录的区别。采用 docs/design/controller-catalog-consistency-{frontend,backend}.md：两个入口的主控视图共用已注册 nativeProps.deviceData 完整真实目录和同一可见项投影，排除 null/'null'取消命令及原生 hide:true，保留原顺序、ID、名称、图标、描述、禁用状态。不另建目录，不删顶部现有原生板；controllerIds 继续只表示原有五板模块支持/适配范围，不为了展示扩展其值或任何驱动/profile。

nativeDevices 仅影响模态标题/大分类导航等入口外观，不决定候选主控集、类型过滤或类型行显示。有效主控分区统一为 controllers；两入口都按同一类型及原生搜索查询过滤，相同条件得到同一有序列表。类型从完整可见目录的可信元数据产生，未知类型的原生条目在“全部”和名称搜索中保留，不猜成主控板/套件。沿用已有明确五板 board 元数据即可，不为本轮虚构新类别；不新增全局搜索状态。清除筛选、分区记忆和查询重置按同一有效分区处理。

选中、移除、依赖/引用拒绝、模式保留和 busy/硬件守卫全部复用已有 adapter；展示完整目录不代表六模块与其他板兼容或新增硬件能力。无 HTTP、后端、归档、依赖或 VM 变更，预计只需局部 library/目录选择器修改，不改 GUI hooks。

前端 Sol ultra 局部实现、构建/类型检查及有界自验后冻结；后端 Sol ultra 只做零改动交接。随后 Sol low 用隔离真实 Vite dev 与静态 dist 聚焦比较两个实际入口在全部/同查询/同类型下逐项 ID、名称、顺序与关键元数据（不只比数量）；核对五板之外原生条目未丢失、空取消命令不出现；任一入口选板后另一入口同样选中、重复不 dirty、移除与模块依赖保护仍生效；至少一个非五板走已有原生选择路径，六模块兼容矩阵不变。验证新构建与 VM 字节边界，不扩大到完整硬件/API/归档或重跑无关 v0.6 矩阵。不操作用户服务或 COM3。
