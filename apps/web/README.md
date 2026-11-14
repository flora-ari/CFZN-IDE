# CFZN IDE 前端

顶部Logo资源与缩放（2026-11-12）：使用用户提供的原始PNG，项目资产为 `public/branding/IDE.png`，运行URL为同源 `/branding/IDE.png`。正常与原生溢出状态共用同一图片，固定120×40 CSS像素盒，contain等比居中完整显示，菜单仍为48 CSS像素；不读取桌面路径，也不改变五按钮或右上模式控件。图片来源与原始SHA256见[BRANDING.md](./BRANDING.md)，冻结产物与开发自验范围见[HANDOFF.md](./HANDOFF.md)。

## 当前行为（网页功能补齐 v0.7，2026-11-12）

原生蓝色 MenuBar 的项目工具组固定为“项目、新建、导入、导出、保存”五按钮及保存状态，没有顶部串口按钮或父层串口抽屉。父层只保留项目抽屉与操作提示；串口操作位于上传模式终端。顶部右侧“编程模式 / 上传模式”的位置、样式、文案及切换逻辑保持现有实现。

Ctrl+S、Mac Cmd+S在父页面和编辑器iframe各自所属的焦点范围触发已有保存流程。首次保存POST，后续保存携带已有revision执行PUT，仍保存完整作品和素材；快捷键不增加保存API。原生标题等输入先完成提交，再导出归档；保留原焦点与选区，用户已移焦或页面失去焦点时不抢回。重复按键、组合输入及Alt/Shift组合有保护，忙碌/模态等状态遵守与鼠标保存相同的守卫；不接管Ctrl+F/Z/Y。

积木工具箱的“搜索”入口按真实本地化积木文字查找当前目标、模式、主控及已加载扩展的可展示积木，覆盖原生动态变量、列表和过程。索引使用隔离的原生workspace，结果由原生类别/flyout展示，可以直接拖出使用；保留字段、变量ID、过程参数、引脚、嵌套shadow及禁用状态。空查询、清除、Escape或关闭恢复先前类别与滚动，原类别消失时使用现有回退类别。目标/语言/模式/扩展等变化会使索引失效，旧异步结果被忽略；搜索本身不编辑作品或产生dirty，不改变现有撤销/重做记录，不修改VM/Blockly。

扩展库提供“已加载”筛选，读取舞台扩展管理器、当前主控ID及实际模块加载集合；默认不勾选，各大分类记忆自身状态，两个主控入口共用controllers状态。它与类型、支持当前主控及原生名称搜索取交集。取消勾选只恢复列表展示，清除筛选会一并复位，不会卸载扩展或更改作品。详见[扩展接入说明](./EXTENSIONS.md)。

本机编译服务、浏览器串口、OS烧录端口是三个独立状态。支持主控的编译设置和连接弹窗提供服务检测/重试：复用配置的本机地址GET /capabilities，校验protocolVersion=1、executionHost=local及消费字段，区分尚未检测/检测中/在线/离线/协议不兼容。GET /ports失败仅更新烧录端口错误；缺core/profile表示当前编译能力不可用，不能把已在线服务或已连接Web Serial标为离线。诊断有8秒请求及响应体超时和旧响应隔离，保留已有显式profile/OS端口选择；不新建编译作业，也不因检查失败释放运行中作业的占有。当前执行器不是Mind+ Link，不建立其私有WebSocket。

每个编辑器硬件绑定持有一个临时TerminalModel，HardwareSession仍是唯一端口/reader/writer owner。终端视图仅订阅模型；切模式、隐藏视图及语言重挂保留日志、输入、收发格式、行尾、波特率草稿、暂停和提示，隐藏期间仍记录允许的普通RX。真实协议请求/占用期间不把协议字节记录成普通终端数据。写入实际成功后才记TX，实际session变化分隔解码，旧session记录被拒绝；暂停继续丢弃RX，显式清空只清显示，不关闭串口。日志最多200行/64KiB；这些临时状态不写入.ob、localStorage或后端，重新打开页面不恢复历史。RX/TX只是接收/发送显示标记，不加入原始串口数据。

v0.7构建与91项单测通过，开发自验的范围、最终产物哈希和dev/dist证据见[前端交接](./HANDOFF.md)及evidence/mindplus-parity-v07/。独立验收由主控另行汇总；模拟API/串口证据不代表实机串口或烧录已验证。以下日期条目保留阶段记录，当前界面与协议说明以本节及上述交接为准。

标题与浮动消息更新（2026-11-10）：原生 MenuBar 改为从左排列，剩余空间由右侧原生菜单的自动外边距吸收，作品名块与五按钮工具组保持6px间距；上一轮标题默认宽度及窄屏收缩不变。父App原占行通知替换为 `ProjectNotice`，通过React Portal固定在顶部居中，不改变iframe尺寸。普通info/success默认3000ms自动关闭，悬停或键盘焦点停留时暂停剩余时间；错误/冲突持久可关闭，冲突的重新载入/另存为与busy守卫保留。替换消息清理旧计时器，关闭时核对消息对象身份。新建、未保存作品重命名补成功反馈，所有既有操作通知使用同一组件；无新增框架或依赖。样式与交互参考 [Element Plus Message](https://element-plus.org/zh-CN/component/message)，实现使用现有React。

本次开发验证为构建（含类型检查）通过，未新增单测或扩大回归；消息时序与布局由主控安排独立Sol low测试。未修改HTTP/归档/VM/串口或启停用户服务。

作品名与导出入口小修（2026-11-10）：名称区不再随宽屏增长，桌面容器基准188px（原生左右padding合计8px，输入默认180px），容器min108/max228、输入min100/max220；空间不足时允许收缩。1199px及以下延续窄屏容器basis60/min40/max100、输入min0。没有新增字符限制或改变长名称编辑/保存规则。已精确删除名称旁原生软盘“导出到本机”图标，保留项目工具栏唯一“导出”；共享下载器/handler、完整归档与保存逻辑不变。构建含类型检查通过；主控反馈独立Sol low对1440/1776/2560、短长中英文标题、完整归档下载/dirty及178个VM模块字节校验均通过。

连接弹窗 v0.4（2026-11-10）：原生连接菜单和上传终端入口打开同一网页弹窗，标题“连接 + 当前主控名”，上半部为真实已授权设备表，下半部按实际扫描/连接/成功/失败状态显示研究资源。`添加新设备` 在点击栈内调用浏览器授权；已授权行直接连接，新增授权取消保留原连接。表格的授权编号/USB 芯片描述不代表 COM 或已识别主控。独立的“本机烧录端口”复用原 HardwareController.portId，3002 不可用仍可使用浏览器串口。

Modal、上传终端和 NativeSerialSocket 的配置都经过 `HardwareController.applySerialSettings({browserPortId?,options})` → HardwareSession 单一事务，支持同值无操作、已授权换端口和改波特率。事务同步占锁，排空写入后释放旧端口，再打开目标；目标失败先清理，再尝试用原配置恢复原授权对象。恢复成功仍报告本次更改失败；清理/关闭失败保留真实 owner，禁止并开及交给上传器。`serialOperation/pendingBrowserPortId/serialError/scanning/scanError` 是前端快照字段；扫描错误不改变正在工作的连接。波特率校验为 `1..4294967295` 整数和既有完整配置；原生 Redux 波特率及连接名仅镜像已提交值，同值原生回调不重开。真正断开/拔出会同步原生 peripheral 标记，切换/恢复期间不会重置 socket。不会修改 Serial.begin、烧录速率、dirty 或 `.ob`。

资源在 `public/cfzn-connection/`，`connection-assets-manifest.json` 保留官网 URL、SHA-256、内联 PNG 偏移和 DOM symbol 提取记录；由现有 prepare 脚本复制到实际静态资源目录。成功/失败使用同一原始圆环 PNG，叠加蓝/红串口图标和文字；研究为模拟 Link 扫描 DOM及静态连接选段分析，没有复制官网连接实现或固件。普通浏览器首次授权仍展示系统选择器。

本轮验证：40 项单测（新增11项事务/守卫测试）、构建及类型检查通过。`node scripts/verify-connection-modal.mjs` 使用隔离 Edge、双模拟串口与 HTTP 替身，覆盖授权行无 chooser、显式取消、切换/恢复、全局同步、原生菜单重开、Escape 关闭不掉线、缺3002、拔出清理和 1440/1000/390px 四列表格/动作可见；证据在 `evidence/connection-modal-v04/`。串口分片/UTF8/HEX回归通过，178个VM原始模块字节相同。未操作真实COM3、烧录或启停用户服务；独立验收由主控另派。

顶部串口入口清理（2026-11-10）：原生蓝色 MenuBar 仅保留项目、新建、导入、导出、保存及保存状态。已删除旧父层串口抽屉组件、样式、订阅及专用通知，串口操作使用上传模式内的终端。现有 29 项单测、构建（含类型检查）通过；本次未运行浏览器或真实硬件测试。

串口文本显示修正（2026-11-10）：上传终端使用 `src/serial-log.ts`。接收 chunk 不是文本行；流式 UTF-8 文本按真实 LF/CRLF/CR 分行，跨 chunk 的 hello、中文/emoji 会拼接，无换行提示即时显示。RX/TX 与连接会话分开，HEX 保留原始字节。清空/重连重置待解码状态；暂停仍丢 RX，恢复不跨丢失区拼接。日志维持有界。隔离浏览器定点自验为 `node scripts/verify-serial-text.mjs`，已同步为仅验证上传终端；`evidence/serial-text/` 中的证据属于此前两终端版本，没有作为本次浏览器验证结果。

Mode UI v0.3（2026-11-10）：原生 MenuBar 的旧开关改为“编程模式 / 上传模式”。编程模式调用原运行接口，显示真实舞台、角色、造型、声音和可执行的舞台积木；上传模式右栏为上传动作、代码区开关、Arduino C、自动生成/手动编辑、原生 Monaco 及共享串口终端。当前主控在菜单白色粗体显示，库内状态为深蓝底粗白字，当前卡片用 2px 蓝框及 aria-pressed。主控卡名称会选择设备，底部了解更多/帮助链接保留。

模式由外部 `ModeController` 协调，原生 `programMode` 仍是归档权威。舞台运行与硬件协议分开：ESP32/S3/FireBeetle 的编程视图不启动 Firmata、不改变已连接普通终端波特率、不重连；Uno 的显式原有协议路径保留。切模式不更换 VM 或 HardwareSession；模式/代码来源/手动编辑标 dirty，生成器刷新及编译上传完成不标已保存。硬件/项目/扩展忙时阻止冲突切换并显示原因。

自动代码来自原 Blockly Arduino generator，始终只读。首次手动编辑复制生成内容，此后保留独立草稿；切回自动、切舞台、隐藏代码区或切板均不丢草稿。手动源码最多 1 MiB UTF-8。手稿标签显示当前友好主控名并提示切板后核对；切板不隐式编译/上传。编译及上传使用当前被选中的来源。

完整 `.ob` 中新增唯一可选 ZIP entry `cfzn/editor.json`：`{version:1,codeMode:'generated'|'manual',manualSource?:string}`。不改变 project.json/素材内容，不存设备句柄、COM、profile、job 或日志。旧归档无 entry 时回到自动且无继承草稿；非法/未知版本在替换当前项目之前拒绝。含模块的编程归档先按上传模式完成实际模块注册，再恢复原生编程模式与手稿。保存、导出、事务备份和失败回滚共用归档边界。导出期间如编辑版本变化，明确失败要求重试，不拼接旧积木和新手稿。

本轮自验：`npm run build`、21 项单测；`node scripts/verify-mode-ui.mjs` 用隔离静态服务/真实 Edge/模拟串口与作业验证真实舞台、手稿往返、新上下文恢复、串口零模式副作用、上传来源和忙状态。证据在 `evidence/mode-ui-v03/`，包括桌面/1100px、选板、造型及新上下文截图。`vm-byte-comparison.json` 验证当前 178 个上游 VM webpack 模块字节未变。没有操作 COM3、停止用户服务或修改 Mind+。

Hardware v0.2（2026-11-07）：五块主控为 Uno、ESP32-S3、Aijite ESP32-S3、普通 ESP32 和 FireBeetle ESP32-E；六模块保持完整归档。新增 ESP32 条目使用上传模式和通用串口，实时固件未验证，不自动烧录实时固件。FireBeetle 标签使用板面别名，内部值为实际 GPIO，例如 D2/IO25=`25`、A0/IO36=`36`；输出菜单排除输入专用 GPIO34–39。

硬件服务默认地址为 `http://127.0.0.1:3002/api/v1/hardware`，可由 `VITE_HARDWARE_BASE_URL` 显式覆盖。它与 3001 项目 API 分开；服务不可达时浏览器普通串口仍可独立使用。执行器需允许实际页面 Origin；随机预览端口必须由执行器配置允许，不能因目录或 CLI 存在就当作工具链可用。

“上传模式 → 串口终端 → 连接串口”打开原生设备连接弹窗；弹窗自动列出已授权端口。“添加新设备”的真实点击直接调用 `requestPort`，取消、未授权和打开失败均有明确终态。串口唯一 owner 在 iframe，上传终端和原生控制台共享读写队列与字节流。波特率变更通过关闭后重开生效。Uno 实时协议占用时禁止终端自由文本发送。

原生硬件区“编译 / 烧录设置”显示当前主控的后端 profile、能力原因和实时枚举的 OS 端口。“编译检查”只构建；“编译并上传”先捕获当前 `code.codeEditorValue`（包括手动 C++ 编辑）、编译，再成功关闭浏览器端口后上传。原生 Upload 已选目标时进入同一控制器，否则先打开设置。必须明确选 OS 端口；浏览器 opaque port ID 不推断 COM3。源码或项目在编译期间变化会阻止上传旧产物。取消会等待后端作业终态；隐藏进度窗不取消作业；恢复原浏览器终端失败单独报告，不改写已完成的烧录结果。

源码约束：`openblock-hooks.mjs` 仅允许 GUI 的 `src/` hooks，历史 `CFZNDeviceFactories` VM 注入已经删除。`device-registration.ts` 通过固定版本可访问的实例注册入口做外部派生注册，`finally` 恢复包装方法；没有改 VM 源码、原始 VM 模块字节、引擎或序列化器。纯兼容性描述由 `prepare-device-descriptions.mjs` 从已校验上游 map 生成 `/openblock-vendor/device-descriptions.json`，记录每个来源 SHA-256；只在构建时读取纯描述，不另打包第二个 VM。

历史硬件验证（v0.2）：`npm test` 为 19 项单测；`node scripts/verify-hardware.mjs` 使用隔离动态端口、真实 Edge、模拟串口和模拟 HTTP 作业，覆盖五板 + 六模块 + 真实积木的 `.ob` 恢复、FireBeetle 引脚、原生/父共享收发、取消、关闭失败阻止上传与恢复。`--real-compile` 增加对已运行 3002 的真实编译；随机页面 Origin 经测试转发为配置允许的 5173，仅允许编译/读取/取消，不允许真实上传。证据在 `evidence/hardware-v02/`。本分支没有打开或烧录 COM3；实机报告由主控提供。

硬件诊断桥接沿用 v1 envelope：`GET_HARDWARE_STATE`、`OPEN_HARDWARE_CONNECT`、`DISCONNECT_HARDWARE`、`HARDWARE_COMPILE {profileId?}`、`HARDWARE_UPLOAD {profileId?,portId?}`、`HARDWARE_CANCEL`。旧父层终端专用 `WRITE_SERIAL` / `SET_SERIAL_OPTIONS` 请求及 `HARDWARE_STATE` / `SERIAL_BYTES` 通知已删除；上传终端直接使用 iframe 内的会话与硬件订阅。精确内部字段在 `src/hardware-types.ts`。这些状态不写入 `.ob`，也不触发 MARK_SAVED。选择器：上传终端 `upload-terminal`，原生弹窗 `hardware-connect`，作业界面 `hardware-progress`。

需要 Node.js 22.12 或更新版本和 `tar`。在仓库根目录运行 `npm run setup`、`npm run dev`，然后用 Chrome 或 Edge 打开 `http://127.0.0.1:5173`。Vite 将 `/api` 转发到 `127.0.0.1:3001`。单独开发前端时，在本目录运行：

```powershell
npm ci --cache ../../.runtime/npm-cache
npm run dev
npm run typecheck
npm test
npm run build
```

应用保留原版 OpenBlock 菜单、项目标题、积木区、舞台、角色、造型和声音编辑器。“项目、新建、导入、导出、保存”五按钮和保存状态直接位于 iframe 原生蓝色 MenuBar 同一行，在标题与 tailMenu 之间；精确移除原 File（文件）入口，保留标题所在 fileMenu、Edit、设备/连接等其余原生控件。没有外层品牌/标题 app-bar，也没有菜单下方新增工具区。父应用仍负责匿名本地项目 API、错误/412 提示及项目抽屉。新建和导入先留在编辑器，首次保存创建服务端项目；后续保存携带引号包裹的 `If-Match` 版本号。导出始终打包当前编辑器内容，包括未保存更改和资产，不会清除 dirty。版本冲突时可以重开最新版或另存为新项目。

`scripts/prepare-openblock.mjs` 使用官方 `openblock-gui@0.1.0-prerelease.20250611102354`（上游提交 `cdd3478c3d9bbced4cb50f4ac0dda8593416c889`），以及 React / ReactDOM 16.14.0。脚本优先复用 `.runtime/upstream` tarball，否则从 npm 获取，核对固定 SHA-512 `dist.integrity` 后解包。`postinstall`、`predev`、`prebuild` 自动执行；可以单独运行 `npm run prepare:openblock`。不安装 GUI 的旧依赖树。资源由本机提供：

| 上游文件 | 运行路径 |
| --- | --- |
| GUI UMD 和 React 16 UMD | `/openblock-vendor/` |
| `dist/static/`、`dist/chunks/`、`dist/libraries/` | `/static/`、`/static/chunks/`、`/static/libraries/` |
| `dist/*worker.js` | 根路径及 `/static/` |
| 授权、商标文件、版本和校验记录 | `/openblock-vendor/` |

外层 React 19 与同源 `/openblock.html` 中的 React 16 分离。GUI 通过官方 `onVmInit` 提供 VM，`onProjectLoaded` 完成默认项目初始化后发出就绪事件。桥接调用 `vm.loadProject` 和 `vm.saveProjectSb3`，加载状态、标题和 dirty 同步到固定版本的官方 Redux store；保留官方 VM 引擎与序列化器。官方附加 Scratch 角色、造型及声音素材库使用上游公共服务；默认项目和归档自带素材不依赖该服务。上述五板的 SERIALPORT 使用公开 socket factory 接入共享 Web Serial，其它原版传输保留原行为。

桥接使用同源 `postMessage`，两端校验 `event.origin`、`event.source`、协议名 `cfzn.openblock` 和版本 `1`。包结构为 `{protocol, version, type, requestId?, payload?}`，响应使用同一个请求 ID。请求和启动等待上限均为 45 秒。归档使用可转移 `ArrayBuffer`，发送后原 buffer 脱离。

| 类型 | 请求或事件内容 |
| --- | --- |
| `HELLO` / `READY` | 外层握手；编辑器返回当前状态 |
| `NEW_PROJECT` / `LOAD_PROJECT` | 重置默认归档，或接收 `{bytes, title, dirty?}` 并返回状态 |
| `EXPORT_PROJECT` | 返回 `{bytes, mimeType, title, fileName, editVersion, documentId}` |
| `SET_TITLE` / `MARK_SAVED` | 设置 `{title, persisted?}` 或确认 `{documentId, editVersion}` 对应的成功保存；更新更晚的编辑仍保留 dirty |
| `GET_STATE` / `GET_PROJECT_JSON` | 状态 `{title, editVersion, documentId, dirty, running}`；或调试用 `{json}` |
| `RUN` / `STOP` | 运行绿旗脚本、停止脚本 |
| `CHANGED` / `REPLACED` | 状态更新；原版文件菜单新建时清除外层项目关联 |
| `IMPORT_REQUEST` / `IMPORT_ERROR` | 原版文件菜单选取项目后交给外层导入及未保存保护 |
| `PROJECT_TOOLBAR_STATE` | 父 → 子单向受控视图：`{statusText,statusKind,documentActionsDisabled,drawer}`；kind 为 pending/dirty/saved/unsaved，drawer 为 projects/null |
| `PROJECT_TOOLBAR_ACTION` | 子 → 父单向意图：`{action}`，只接受 projects/new/export/save；没有项目 ID、revision 或已保存断言 |
| `RESPONSE` / `BOOT_ERROR` | `{ok:true,result}` 或 `{ok:false,error:{code,message}}`；启动错误单独通知 |

原生项目操作由 iframe 自己的 React 16 实例渲染和订阅；`CFZNOpenBlock.renderProjectTools` 保留现有 `renderLibrary`。`scripts/openblock-hooks.mjs` 为固定官方 MenuBar 增加直接子节点插槽和 `data-cfzn-menu-host`，保留原 containerRef；File 只通过它自己的唯一渲染条件关闭，不按共享类名删除。原生 alerts、GUI body 和原 3rem 菜单高度保持上游布局，没有 Alerts 插槽、body padding、ResizeObserver 或高度补偿变量。桌面五按钮/状态同一行完整显示；390px 下仅工具组内部可横向滚动，按钮聚焦会滚入可见区域，不给整个 MenuBar 加 clipping overflow，原生下拉可正常展开。模态/舞台全屏时仍隐藏控件；原生模态打开时，通过当前抽屉的既有 toggle 意图关闭父抽屉，让模态优先；HardwareSession 与 TerminalModel 的生命周期不随项目抽屉变化。

父层是保存状态的唯一计算方，优先级为 busy → 未就绪 → dirty → 已确认 active revision → 未保存项目。READY 时和状态变化时推送视图；iframe 默认 pending/文档动作禁用。API 成功后仍用原 documentId/editVersion 做 MARK_SAVED，保存期间更晚编辑保持 dirty。所有新消息继续校验 origin/source/envelope 与 payload，父层保留 busy/readiness 执行守卫。导入按钮在 iframe 原 click 内直接调用 chooseImport，不通过异步意图启动文件选择；稳定隐藏 input 位于 iframe，`data-testid="project-file-input"`，同一文件可重复选择。

浏览器测试须在 `frameLocator('[data-testid="openblock-frame"]')` 内查找五按钮与 `project-status`，父文档不再保留隐藏兼容副本。项目抽屉、project-notice 和冲突按钮仍在父文档；串口终端仅在上传模式内。原生标题照常编辑；窄屏项目抽屉也保留“重命名当前项目”入口。

位置更正的定点自验在仓库根运行 `node apps/web/scripts/verify-native-toolbar.mjs --placement`，需要已构建的 apps/web/dist、现有 apps/api/dist、根 Playwright 及本机 Edge。脚本建立随机端口的独立 Nest API、临时存储和静态代理；不使用用户 5173/3001 做写入，结束时关闭新服务并删除自己的临时存储。最新证据在 `apps/web/evidence/native-menu-toolbar/`，包括 MenuBar 直接归属、File 缺席、1440/1894/390 几何、窄屏滚动、原生 Edit/告警及导入/保存/导出检查。上一轮完整保存语义证据仍在 `evidence/native-toolbar/`；本次沿用它，不重复无关 API 或扩展矩阵。

串口终端需要支持 Web Serial 的浏览器，使用本机地址或 HTTPS。连接按钮打开原生连接弹窗，弹窗内“添加新设备”直接打开浏览器设备选择框，支持波特率、文本及十六进制收发、行尾和清空记录。端口关闭时先排空写队列、取消读取、释放读写流锁。`npm test` 使用模拟端口验证这些读写和关闭行为。

实际硬件由主控验收：用已知回显设备核对正确波特率下的文本、HEX 和行尾字节；拔出设备后确认界面提示并可重新连接；检查占用或取消授权时的提示。串口终端与原生硬件区的编译/烧录分工明确。

主控/模块扩展说明见 [EXTENSIONS.md](./EXTENSIONS.md)，源码和图片许可见 [vendor/SOURCES.md](./vendor/SOURCES.md)。准备脚本只修改 GUI 控件插槽；前端外部实例适配器接管本地目录与模块加载，保留官方 VM 引擎及完整归档序列化。主控/模块资源使用同源 `/cfzn-extensions/`，不依赖 20112 资源服务。设备或模块加载期间，保存/导出明确报告忙碌，完成后再保存。
