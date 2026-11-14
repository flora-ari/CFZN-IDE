# Mind+ 差异调查：网页优先的服务与能力边界

日期：2026-11-12（Asia/Shanghai）。角色：后端接口设计。状态：研究/提案，主控冻结后才开发。证据目录：`.runtime/mindplus-parity-20261112/backend/`。

## 1. 本轮建议

用户最新要求优先参考 `https://ide.mindplus.top/realtime/projects/editor`，特别是连接 Link 按钮 `SelectSerial_WsConnectButton__3_-CQ`；桌面适配以后。本分支已完成的桌面安装包选段保留为次级材料，**不能把桌面行为直接当作当前网页应有行为**。网页交互和当前握手由主控/前端设计继续确认。

推荐本轮按以下优先级冻结，不重建已有功能：

1. **本机编译服务连接与诊断分层**：复用既有 3002 `/capabilities`，给网页一个明确的检查/重试入口；区分服务在线、协议不兼容、当前板工具缺失、OS 端口枚举失败和浏览器串口状态。不自动启动服务或安装组件。
2. **终端数据与视图生命周期分离**：修正 CFZN 终端状态目前依赖上传视图挂载的问题；模式切换/隐藏不丢本页日志、输入和显示设置，不增加串口所有者。
3. **现有作业日志的操作**：可在既有编译上传弹框上补复制/导出当前日志与清空显示；不是新增日志服务，也不改变真实取消/端口恢复流程。是否作为本轮网页对齐项由主控依据当前网页证据决定。

以上均可保持 **HTTP、业务后端、项目格式与依赖零改动**，主要是既有 web controller/状态调用逻辑。桌面崩溃恢复、所有板型驱动、MicroPython 文件树、账户/云市场、系统设置和安装器不随此次差异调查自动纳入实现。

## 2. 证据身份、方法与局限

当前授权桌面包为 `D:/mindplus dev/Mind+/resources/app.asar`，SHA-256 `48c783ff8b907f98728179b9abf8311b5e4d05db7a570165101147f9b0ee1f59`。包声明 MindPlus `1.8.1-202506121900`、release `1.8.1 RC3.0`，不同于另一个目录中的 Mind+ Link 2.0.7；不能把它与此前网页/Link版本混为同一产品构建。

- 使用 `D:/rea/skills/reverse-engineer-anything/SKILL.md` 与已有 REA 6.8.0 CLI。主控完整身份证据为 `ev_1b937e60276fbd56c26af0a51f35c46fb16185b5a1f15e1f6ec776970bbdb2f6`，仅分析 package 元数据，不等于功能已运行。
- 本分支首次指定五个文件解析，未全量 AST；但 REA 在 `source-transfer` 报 Win32 87。随后使用已有 Node 24.22.1、改为小选段目录，仍在源码传输阶段同错，已停止重试，未修改 REA、安装依赖或启动目标应用。
- 失败记录为 `rea-services-summary.json`、`rea-focused-summary.json`；保留原始部分 Evidence，并成功调用 REA `inspect-analysis-view` 验证其摘要。部分父证据 `ev_539590b5fc315bbae861197a793bce061444271ecbbbb965974011ba9b9bf3bb`，投影视图 `ev_941131b0eed07957cd0f83ff18436faffb42fb8a0cf55d81ba898d790fbe64dd`，见 `rea-partial-evidence.json` / `rea-partial-view.json`。**REA AST/调用图没有完成；后文逻辑结论来自可复核源片段，不冒充 REA 完整语义分析或运行观察。**
- 只读读取 ASAR 目录和选定成员；对 60 MB 主 chunk 仅做文本定位，提取相关 factory 选段，没有把大 bundle 交给全量 AST。`member-provenance.json`、`selected-module-provenance.json` 记录原成员、字节范围、SHA及派生方式；原 factory 未执行。
- `feature-excerpts.json` 保留方法选段；`cfzn-source-observations.json` 固定本轮 CFZN 源码哈希与关键行。Webpack 序号可能在嵌套 bundle 重复，所以以成员/字节范围/哈希定位，不只凭模块数字做跨模块归因。

未启动 Mind+ 或 Mind+ Link，未连接用户 5173/3001/3002，未操作 COM3/烧录，未做硬件或当前网页交互实测。本次无持续运行的自建服务。没有读取用户项目、账号或浏览器资料。

## 3. 能力对照与真实缺口

| 主题 | 实际证据 | CFZN 状态与判断 |
| --- | --- | --- |
| 普通串口连接/改速率/收发 | 桌面 preload 暴露 GlobalSerialPort；product 和终端容器有 open/close/update；这是原生 Node 能力 | 已有 Web Serial 单 owner、已授权连接、新授权、切端口/速率与失败恢复；不是缺一套后端串口服务 |
| HEX/文本/行尾/清理 | 桌面终端选段处理 HEX 与行尾、UTF-8缓冲；handleShowHex 会清旧显示 | CFZN 已有增量 TextDecoder、RX/TX、文本/HEX、行尾、暂停及清空。无需照抄桌面“切显示就清数据”行为 |
| 模式切换与终端生命周期 | 桌面 Product.changeActiveInterface 会关闭串口并清选择；终端容器卸载也 close。这里只证明该桌面选段 | CFZN 契约要求模式变化保留唯一会话，不能照搬桌面关闭策略。但日志和 RX 订阅仍挂在 SharedTerminal 实例，是独立的状态生命周期缺口 |
| 编译上传结果 | 桌面 CompileBase 有本机 arduino-builder 路径/构建目录和阶段/错误消息；按板型实现，不证明每块板可用 | CFZN 已有真实 CLI、artifact 检查、日志、校验、取消、超时、串口释放/恢复。已有能力不能再列为缺失；也不需换成旧 arduino-builder |
| 本机服务连接 | 主控正在核对当前网页 Link 按钮与协议；历史网页证据另见下节 | CFZN 只在设置/作业动作中 refresh 能力；当前将 capability 和 OS ports 的错误合在一个 error，缺少独立的服务连接/诊断状态 |
| 作业日志操作 | 本轮未证明当前网页存在每个操作，不从桌面消息字典推导 UI | CFZN 弹框有日志、取消、隐藏，无复制/导出/清空显示按钮；这是现有工作流可直接改善项，非已证实的网页版功能缺口 |
| 项目保存 | 桌面 cacheSb3有 CacheProject、maxSave、异常关闭标志/子进程缓存；VM保存中有页面/代码字段 | CFZN已有完整 `.ob`/素材/手稿、匿名 API、revision/冲突；未发现自动崩溃缓存。桌面缓存的触发时机/恢复效果未运行验证；不在本轮静默新增自动保存 |
| 设备设置 | 桌面 board/burner、原生 SerialPort；有特定板握手/恢复功能 | CFZN五板工具 profile、真实 pin 限制与支持范围已固定；其余主控可见不代表具备编译/实时协议。当前缺 core应保留 unavailable，不为目录一致性扩所有驱动 |

桌面选段位置：`rea-inputs/module-498.js` 的 Product；`module-3052.js` 的终端容器；`module-3084.js` 的输入；`module-33.js` 的 CompileBase；`selected-sources/src-main/cacheSb3.js` 的缓存实现。这些模块只被读取，未调用。

## 4. 推荐的调用逻辑与内部接口

### A. 本机服务在线状态与串口状态分开

沿用已有 `HardwareController`，将当前一次 refresh 的两种结果分开存储/展示：

```ts
type LocalServiceStatus = 'unknown' | 'checking' | 'online' | 'offline' | 'incompatible';
// 前端内部建议；不是新的 HTTP schema。
checkLocalService(): Promise<void>; // GET /capabilities，校验 protocolVersion=1/executionHost=local
refreshUploadPorts(): Promise<void>; // GET /ports，独立端口列表错误
```

现有 `refresh()` 可以继续作为组合入口调用两者，减少改动。设置面板/“连接本机服务”入口显示服务状态和重试；无服务时给出当前已文档化的本机启动方式，不能显示成 Web Serial 连接失败。

- capabilities 可达但 compileAvailable=false：服务在线，当前 profile 工具不可用，展示 reason。
- `/ports` 枚举失败：只标烧录端口列表失败；不把可用编译器或已开的浏览器串口改成离线。
- 协议不符与网络不可达分别说明。这个检查是能力请求，不等于打开端口、安装软件或建立持久 WebSocket。
- 读取状态不产生 dirty；不改变主控、profile/OS端口的显式选择或源码。切 UI/重试服务检查不重新 POST build/upload。
- 活动 job 查询中断仍沿用既有 busy/取消/恢复规则；不能因服务显示离线就假定工具已退出并抢回端口。

本轮不用新增 `/connect`、`/health` 或 Link兼容 RPC。`/capabilities` 已有 protocolVersion、executionHost、profiles、toolchain；软件发布版本留到真正封装 CFZN Link 时另行冻结。

### B. 终端状态随编辑器实例存活

当前 `mode-ui.ts` 的 SharedTerminal 在 React 实例中创建 SerialLog、input、收发显示格式、行尾、pause 和 message，并在组件挂载时订阅 session.onBytes；卸载清理会取消订阅。HardwareSession却继续持有端口并读流。因此隐藏/切出上传视图可能出现“物理连接还在、此前显示状态已丢、不可见期间无人记录普通 RX”的不一致。这是源码生命周期推断，本轮没有伪称完成浏览器重现。

建议在已有 `nativeHardware`/编辑器绑定生命周期创建一个轻量 TerminalModel，保存有界 SerialLog 和终端输入/显示状态，注册**唯一一次显示订阅**；UI只 subscribe/unsubscribe 视图更新。它不调用 requestPort/open、不持有第二套 reader/writer，不是新的串口服务。bindVm同VM幂等与 locale 重挂约束继续生效。

模式/代码区隐藏只影响显示，普通终端 RX 仍按现有容量限额记录；sessionId变化继续分隔数据/解码，旧包不混入新连接。显式“暂停”沿用当前已约定的暂停/丢弃语义，不擅自改成无限后台缓存。真实 Uno协议占用时按既有协议策略处理，不能把握手字节伪装成普通文本或靠模式名判断 ESP32 协议已可用。

清空是显式动作，只清显示数据；切模式、locale、打开连接弹窗或隐藏视图均不隐式清空。新页面重建无需持久恢复终端历史，不写 `.ob`、用户数据或 localStorage。连接/应用波特率继续经过既有 applySerialSettings，日志/TX只在真实写入成功后记录。

### C. 在既有作业弹框补日志操作

保持 `/builds`、`/uploads`、`/jobs/:id?afterLog=`、取消及端口交接不变。复制/导出读取前端当时的日志快照，包含当前 job/profile/阶段/结果；如果只导出当前有界显示，就明确标为“当前显示日志”，不声称是无截断的完整历史。浏览器下载可用 Blob；剪贴板不可用则给真实失败/下载入口，不新增后端文件系统访问。

“清空显示”不清后端 JobLog、不把 cursor置0、不取消job，不回放旧日志；之后继续显示真实新输出。隐藏弹框仍由原 controller跟踪作业。无需新增任务列表、持久历史、WebSocket日志或第二个 upload controller。不要照搬桌面固定阶段百分比替代现有真实阶段/日志。

## 5. Mind+ Link 的作用与未来 CFZN 封装

**Link 是网页与用户电脑本机能力之间的伴随程序。** 网页不能直接启动 Arduino 编译器或任意访问本机文件/端口；本机程序接收受支持命令，调用本机工具/设备，再把能力与结果交给网页。串口终端、编译和烧录仍是不同操作；连接 Link 不代表串口或固件握手已经成功。

证据分层：

- **主控本轮静态核对**：`D:/mindplus/Mind+ Link` 为2.0.7，desktop setConfig 的 commandPort=6601、transmitPort=6602，mind-link入口 dist/link.js，命令/传输链含串口及pty/ssh/udp，随包带arduino-cli。证据由主控保存于 `.runtime/mindplus-parity-20261112/link/rea-desktop-observed-bundle.json`；本分支没有执行该服务或验证这些通道。
- **历史网页实观测**：2026-11-07的 `.runtime/hardware-research/realtime-observations.json` 记录 `ws://127.0.0.1:6601/` 及 Link路径/版本交互；这是历史网页证据，不能替代主控正在进行的2026-11-12握手验证。
- **当前桌面选段**：preload直接提供native SerialPort，Product.scanMainWebSocket/bindWebSocketSendMsg主体为注释/getMainWebSocketConnect返回error。仅凭此不能断言整个桌面程序依赖或完全不依赖另外安装的Link，也不能从命名推导活跃的URL。
- 主控发现 Link ASAR 的未打包node-pty native文件存在integrity不一致，首次REA拒绝已保留、后用record-and-continue读取；按有矛盾的静态证据处理，不表述成已执行/完整验证。旧 OpenBlock Link 的20111 `/scratch/serialport` 是另一产品协议，不作为Mind+ Link或CFZN的新接口。

CFZN当前3002已经承担伴随程序的**编译上传执行器部分**：loopback HTTP、能力/profile、OS端口枚举、任务日志/取消、固定工具执行及互斥；WebSerial仍在浏览器负责终端。未来可将该执行器封装成CFZN Link，而不是复制Mind+的通用进程/pty/ssh服务。

未来封装职责建议：

1. 提供受控的安装/启动/退出与清晰软件版本、协议版本、能力清单；网页对明确配置的本机地址握手，不盲扫端口。当前网页先用既有 capabilities，真正安装器以后再设计。
2. 注册/检查固定编译工具和板型配置，报告不可用原因；生成文件留在CFZN专用目录，不修改用户Mind+/旧Link安装或自动下载全部板卡工具。
3. 本机设备枚举用于明确的OS上传端口选择。保留WebSerial终端owner，烧录前确认浏览器释放、工具结束后再恢复；若未来改成本机终端代理，须另行冻结整体所有权，不能两边同时开同一端口。
4. 保留单任务/端口占用、实际进程树取消、真实校验/日志与失败占有状态；不把服务连通当作硬件成功，不随网页打开自动烧录。
5. loopback绑定、产品Origin白名单、固定命令/profile及输入限制；网页不能提交任意命令/路径。远程HTTPS访问本机端点的浏览器权限与传输策略仍需目标浏览器验证，Origin配置不能代替浏览器授权。

本轮只解释及保留架构边界，不做托盘、开机启动、自动更新、驱动安装或新服务部署，也不与用户现有Link争抢端口。

## 6. 存储、风险与验证范围

完整匿名 `.ob` 与 `cfzn/editor.json`、revision/冲突、dirty/快照关联保持现有契约。编译日志、服务状态、授权对象、OS端口、终端历史不进入项目。桌面 `.mp`、缓存恢复、多语言多程序页与MicroPython文件操作不直接映射到当前归档；需要另行确认格式与范围。

后续聚焦验证建议：服务capabilities成功但缺core、ports单独失败、错误协议和超时状态分层；终端正常收发后切模式/隐藏/locale往返仍保留有界数据与输入设置，普通隐藏期RX不会因视图卸载丢失，连接/reader/writer仍唯一；日志清显示不改cursor或job，复制/导出与当时显示快照一致；已有取消、网络中断、关闭失败占有和恢复失败回归。使用标明的mock及隔离dev/dist，硬件另由主控协调，不操作现有服务。

网页 Link按钮/握手的当前实测结果由主控合并后再冻结。源码可确认“CFZN现在如何存状态”，不能证明未执行的Mind+网页功能；也不能由一个UI按钮推出已支持所有板、实物通信或编译上传。

本轮仅写本提案与指定backend证据，未改产品、VM、依赖或公共契约，未启动目标/用户服务或进行硬件操作。主控可先冻结A的服务状态分层与B的终端状态连续性；C及未来封装按最新网页证据和用户优先级决定。
