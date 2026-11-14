# 硬件前端设计提案

日期：2026-11-07（Hardware v0.2 冻结后收尾）。角色：前端接口设计。主控已冻结 docs/api-contract.md 顶部 Hardware addendum v0.2；该契约优先于本文。本文保留设计依据与接入说明，不新增公共接口。

## 1. 本轮结论与实施范围

**优先接入用户实物普通 ESP32，新增 FireBeetle ESP32-E 兼容主控；采用一套“浏览器 Web Serial 收发 + 本机 Arduino CLI 编译/烧录”流程。** 保留现有 Uno、ESP32-S3、Aijite ESP32-S3 的编辑、模块和保存能力。本轮不同时实现浏览器 ESP uploader、Uno 浏览器 uploader 和多套 Link 烧录服务。

用户经主控明确补充：实物为 ESP32，不是 ESP32-S3；端口为 COM3 / CP210x，在 Mind+ 实时版选择 FireBeetle ESP32-E 可以检测到。主控随后用 esptool chip_id/flash_id 只读确认 ESP32-D0WD-V3 revision 3、40MHz、Flash 4MB，未写 Flash；用户已明确允许后续覆盖 COM3 程序。以上由主控提供，本分支没有连接设备。芯片/Flash 已确认，实物是否为 DFRobot DFR0654、具体板级引脚与现有固件协议仍不能仅凭发现端口认定。不能把“发现 COM3”“串口已打开”“实时协议就绪”“烧录成功”合并成一个 connected 状态。

主控已采纳的技术方向（本文件补足字段与接入点）：

- 原生连接入口接入 iframe 内唯一 Web Serial 会话，父串口抽屉与原生控制台复用；正常收发不再依赖旧 OpenBlock Link。
- 复用 OpenBlock 已有普通 ESP32 类，增加 FireBeetle 板级元数据、引脚菜单和 profile 绑定，不加载 Mind+ 私有运行时。
- 本机硬件 API 仅负责能力、端口枚举、构建和上传作业；前端通过 HTTP 作业接口使用 Arduino CLI，烧录前关闭浏览器端口。首期无需再提供一套服务端 serial read/write WebSocket。
- 优先把普通 ESP32 的编辑→代码→真实编译→模拟烧录交接链路做通；实际写入按用户已给出的覆盖授权，由主控派开发/测试执行。其它板沿同一 profile 接口保留，缺工具或实体板时分别报告 unavailable / 未实测，不阻塞实物 ESP32 的工作。

## 2. 原生持续扫描的已知原因与源码证据

固定 GUI 的原生串口端点为 **ws://127.0.0.1:20111/openblock/serialport**。20112 是 VM extension-manager 的 HTTP 扩展资源地址，并非串口握手地址；固定 GUI/VM 没有引用 20120。

后端设计已只读核实安装于 D:/openblocklink/OpenBlock Link 的 2021 Link：它注册的是 **/scratch/serialport**，而不是当前 GUI 的 /openblock/serialport。这是源码已证实的路由不兼容点。该旧 Link 还存在 library 字段位置、FQBN 对象、取消上传和固件文件名差异；只改路径不能当作完整修复。详见 docs/design/hardware-backend.md。该结论不等于本分支已实际连接并复现全部运行表现。

当前 CFZN 父页面终端独立使用 navigator.serial，不能为原生 Link 扫描提供结果。原生 15 秒超时又仅在 WebSocket onopen 后启动；runtime 找不到 peripheralExtensions[deviceId] 时静默返回。因此开发还须验明原生设备注册与错误退场，而不是依赖无限重试。

证据取自 .runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz 内 package/dist/openblock-gui.js.map 的 sourcesContent。GUI 路径前缀为 src/，VM 路径前缀为 node_modules/openblock-vm/src/；行号属于源文件。

| 环节 | 源码位置 | 已确认行为 |
| --- | --- | --- |
| 原生扫描 | GUI containers/scanning-step.jsx:21–26、35–36 | 挂载即 scanForPeripheral，随后才订阅列表/超时事件 |
| 设备路由 | VM engine/runtime.js:1807–1827 | 按 deviceId 查 peripheralExtensions；不存在时不建立 socket，也不报错 |
| 过滤条件 | VM devices/common/common-peripheral.js:88–96 | listAll 使用 filters.pnpid=['*']；其它情况使用元数据或设备默认值 |
| 本地端点 | VM util/scratch-link-websocket.js:25–48；extension-support/extension-manager.js:13 | 串口 WS 20111/openblock/serialport；扩展资源 HTTP 20112 |
| 扫描超时与结果 | VM io/serialport.js:42–51、191–204、293–298 | 打开 socket 后发 discover；15 秒超时；didDiscoverPeripheral 才填列表；首次发现清除 timer |
| 连接参数 | GUI containers/connection-modal.jsx:44–53；VM common-peripheral.js:104–110 | upload 模式传控制台波特率；connect.params.peripheralConfig.config 为实际配置 |
| 收发 | VM io/serialport.js:116–140；common-peripheral.js:155–188 | read 注册接收；write/onMessage 使用 base64 承载字节 |
| 上传代码 | GUI containers/hardware-header.jsx:26–37、64–68 | 上传当前 Redux code.codeEditorValue，不是重新加载保存文件 |
| 上传 RPC | VM io/serialport.js:150–180 | upload 携带源码与 config.library；uploadFirmware、abortUpload 分开 |
| 原生进度 | GUI containers/upload-progress.jsx:29–30、65–77、96–169 | stdout/error/success/abortEnabled；60 秒无日志 timeout 本身不停止作业 |
| 公开替换口 | VM virtual-machine.js:1732；engine/runtime.js:1769–1789 | configureScratchLinkSocketFactory(factory) |
| 当前独立终端 | apps/web/src/serial.ts:51–160 | 父页面单独 requestPort/open/reader/writer，无共享会话或烧录交接 |
| 安装适配器 | apps/web/src/openblock.ts:130–150 | bindVm/onVmInit，可在首个连接动作前配置 socket factory |

原生 discover 的 JSON-RPC 形状为 {jsonrpc:'2.0',id:0,method:'discover',params:{filters:{pnpid:['*']}}}；返回相同 id 的 result 只能完成请求，设备必须另经 didDiscoverPeripheral.params={peripheralId,name,...} 通知。connect 的参数为 {peripheralId,peripheralConfig:{config:{baudRate,dataBits,stopBits}}}。

原生 util/jsonrpc.js 没有通用 RPC 超时；入站 request 的 if(id) 也忽略 id=0 的回包义务。开发适配器应采用明确终态，并保留这些兼容测试。扫描错误应区分设备未注册、传输不可用、没有已授权端口和端口打开失败，不再统一提示“安装 Link”。

## 3. Mind+ 与 FireBeetle 包的实际证据

### 已观察到的完整链路

主控已实际抓取 Mind+ 2.0.7 网页及本地 WS：实时页使用 ws://127.0.0.1:6601/，getPathInfo 返回 LINKAPPROOT=D:/mindplus/Mind+ Link，reportVersion 返回 2.0.7；选 FireBeetle ESP32-E 后 serialList 枚举。某次记录只列 COM1，不能将历史观测视为永久端口状态。

上传网页公开代码使用本地 Arduino CLI：getArduinoCliPath 指向 LINKAPPROOT/tool/arduino-cli，配置位于 %HOMEDIR%/AppData/Local/mind+/Arduino/arduino-cli.yaml。编译与上传命令由本地 Link 的 spawn 执行；串口由 newSerialport/open/close/write 控制，数据传输另用 ws6602。**这次观察支持本地编译/上传链路，不应继续引用旧的云编译假设。** 证据为 .runtime/hardware-research/{realtime,upload}-observations.json 与 upload-5f3b17a297bd.js。主控已使用 REA 同版发布运行时成功分析 FireBeetle 包的 main.js，结果为 .runtime/hardware-research/rea-firebeetle-published-summary.json 和 rea-firebeetle-published-evidence.json。摘要记录解析 1 个 JavaScript 文件、0 个解析失败、遍历 57451 个 AST 节点；语义图达到单文件 20000 节点上限，semantic coverage 为 partial 且 truncated=true。summary 的 complete-within-view 只描述该摘要视图，不能写成整个程序分析全覆盖；这些静态结果也不代表执行了包或验证过硬件。

CFZN 借鉴的是“发现、收发、编译、上传分开”和实际生命周期，不复制 Mind+ 私有实现，不把它的任意 spawn 能力暴露给网页。后端正在检查 Mind+ 的本地工具及 Arduino data 能否供独立 profile 验证；本提案不将“目录存在”写成“编译已通过”。

### 已只读核对的扩展包

本分支读取了 C:/Users/YUUMEI/AppData/Local/mind+/download/realtime/devices/dev-DFRobot-firebeetleEsp32E@0.0.3 的 config.json、main.js 文本及文件名，未执行 main.js 或固件。

| 包字段/内容 | 观察值 | CFZN 应如何处理 |
| --- | --- | --- |
| id / version | firebeetleEsp32E / 0.0.3 | 记录来源；Hardware v0.2 已冻结 CFZN 新设备沿用此稳定 ID |
| compatibilityId / SKU | fireBeetleEsp32E / DFR0654 | 大小写与 id 不同；不能混作同一个字段，也不能因此认定用户实物 SKU |
| boardConfig | mindplus:esp32:fireBeetleEsp32E；core version 0.0.2 | 这是 Mind+ core 的 FQBN；不能直接当作官方 esp32 core 中同名板型 |
| mode / firmware.online | realtime / ./firmware/firmata.bin | 文件夹另有 firmata.partitions.bin；不自动复制、合并或烧录 |
| main.js 入口 | getPrimitives、getDevice、getInfo；单一描述对象带 name/toolboxName 等 | 与 OpenBlock 设备类的 DEVICE_ID、分类数组、peripheral 注册和代码生成约定不同 |
| 实时设备依赖 | runtime.createSerial；独立 Firmata 实现；校验固件名称与版本 | 不可仅把 main.js 塞进 CFZNDeviceFactories 后声称即插即用 |
| 引脚 | D2/IO25 等板面别名；数字、模拟菜单分开 | 提取事实映射后，用 OpenBlock 原生菜单/生成器表达 |

包内存在 Firmata 代码不证明它与 OpenBlock Uno 的 Firmata 实现可互换。首期新 ESP32 主控提供 Arduino 上传模式和通用串口；“实时积木控制现有 Mind+ 固件”若要实施，必须单独核对协议、固件授权与用户允许的硬件验证，不能暗中刷固件使其看似连接成功。

### 与 OpenBlock ArduinoPeripheral 的实时兼容结论

**不能直接替换，基础 Firmata 命令存在交集，完整兼容尚未验证。** 只读源码已找到以下具体差异，足以阻止把新 ESP32 的 programMode 直接改成 realtime：

- 两边都出现报告版本 0xF9、查询固件 SysEx 0x79 等基础命令；这仅证明协议有共同部分。
- Mind+ FireBeetle 包的 shake 在 ready 后检查 firmware.name 必须为 fireBeetleEsp32E，并检查版本；还依赖 runtime.createSerial、getPrimitives、serialWriteIsAvailable、reportDFRobot/updateConfigInfo 及板级 pinPortConversionTab。OpenBlock 当前 Firmata 中未找到对应 DFRobot 扩展与流量控制接口。
- OpenBlock lib/firmata/firmata.js:760–798 的 ready 路径等待 reportversion/queryfirmware，然后查询 capabilities 与 analog mapping；ArduinoPeripheral 另有 1 秒 reportVersion 心跳和 2200ms 超时。Mind+ 的 ready/固件检查不是该运行状态的等价替换。
- OpenBlock ArduinoPeripheral.parsePin/readAnalogPin（:445–449、537–545）按 numDigitalPins 将 A 标签与模拟通道换算；FireBeetle A0→GPIO36、A1→39 等是离散映射，不能套用 Uno 的连续模拟脚偏移。数字 GPIO 可做明确映射，ADC/PWM、心跳、错误和断线均仍需协议级验证。

因此本期复用 CommonPeripheral 的上传/普通串口路径，新条目明确 upload-only。若后续扩展 realtime，应实现独立 ESP32 协议适配，并以握手、GPIO/ADC/PWM 和拔出恢复的实测来开放能力；不执行缓存 main.js，不因两边都叫 Firmata 就复用 Uno 固件或直接继承 ArduinoPeripheral。

## 4. 主控扩展落地：普通 ESP32 与 FireBeetle 分开

固定包已经内置 VM devices/arduinoEsp32/arduinoEsp32.js：CommonPeripheral、DEVICE_ID=arduinoEsp32、upload-only；PNPID 包含 VID_10C4/PID_EA60，终端元数据默认 115200。extension-manager.js:48 已注册该 factory，GUI devices/index.jsx:324–358 已有元数据。CFZN 当前 controllerIds 只列既有三板，因此“主控扩展”页和六模块兼容表尚未纳入它；不需重新造一套 ESP32 VM。

建议主控扩展目录显示以下五个明确条目，新增两项共用普通 ESP32 实现和同一烧录执行器：

| deviceId | 展示与用途 | 模式/本轮优先级 |
| --- | --- | --- |
| arduinoEsp32 | ESP32，保留 GPIO 编号，适合用户目前只确认芯片的实物 | upload + 通用串口；首要编译与实物验证目标 |
| firebeetleEsp32E | FireBeetle ESP32-E，兼容板级引脚别名 | upload + 通用串口；新增薄适配，独立 profile |
| arduinoUno | 原样保留 | 保留既有 realtime/upload；本轮不自动安装实时固件 |
| arduinoEsp32S3 | 原样保留 | upload；不能作为此次普通 ESP32 的替代目标 |
| aijiteESP32S3 | 原样保留，维持 IO3 排除规则 | upload；独立 ID/profile 不变 |

新 FireBeetle 类继承普通 arduinoEsp32 class，覆盖 DEVICE_ID 与板级菜单；绝不能从 arduinoEsp32S3 派生。通过现有 CFZNDeviceFactories/CFZNDeviceMetadata 入口注册，在 metadata 中声明 Arduino/upload 和 profile 关系。使用原生 Arduino opcodes 与生成器，不把 Mind+ 的 firebeetle_* opcode 直接移入已有项目；本轮不增加 Mind+ 项目导入器或任意扩展包导入 UI。

引脚以当前缓存包中的事实为设计输入。显示名采用 D2 / IO25，**内部 value 与生成代码采用 GPIO 数字字符串 '25'**，避免 D2 被错误解释为 GPIO2；不依赖某个 Arduino variant 恰好定义 D2 宏。

| 标签 | GPIO | 标签 | GPIO | 标签 | GPIO |
| --- | --- | --- | --- | --- | --- |
| D2 | 25 | D3 | 26 | D4 | 27 |
| D5 | 0 | D6 | 14 | D7 | 13 |
| D8 | 5 | D9 | 2 | D10 | 17 |
| D11 | 16 | D12 | 4 | D13 | 12 |
| A0 | 36 | A1 | 39 | A2 | 34 |
| A3 | 35 | A4 | 15 | — | — |

数字输出只使用板级输出菜单；模拟输入使用 A0–A4 对应 GPIO。其它继承的 DAC/touch/PWM 等菜单按普通 ESP32 能力与实际板引出脚求交集，不能把所有继承菜单原样保留，也不能把实时包的 PWM 子集当作全部芯片能力。普通类本身排除 flash 占用 GPIO6–11，输出菜单不含 GPIO34–39；新适配不得放宽这些限制。

DFRobot 将 DFR0654 列为独立 FireBeetle 2 ESP32-E 产品并公布其板级规格；这类资料用于核对所选 profile，不能反向认定用户手上的所有 ESP32 板都具有相同参数。[DFRobot 官方产品资料](https://wiki.dfrobot.com/dfr0654/)

六模块仍只在 Arduino upload 模式可用。将 arduinoEsp32 和 firebeetleEsp32E 纳入 catalog.supportDevice，复用现有能力比较、引脚菜单和切换事务；逐个验证数字输出、数字输入、ADC 与注释生成代码。修正 adapter.ts 中写死“仅 Uno/S3/Aijite”的提示。新设备需通过 .ob 导出/加载和跨板切换检查，旧 aijiteEsp32S3 拼写归一化保持原规则，不将普通 ESP32、FireBeetle、S3 互相自动改名。

## 5. 单一会话与端口交接

建议 iframe 内 HardwareSession 为本应用普通收发的唯一 Web Serial owner，复用 serial.ts 的字节编码和关闭逻辑。原生控制台、原生连接图标和父抽屉只订阅状态/字节，不另开端口。NativeSerialSocket 通过 VM 公开 factory 将 SERIALPORT RPC 映射到该会话；upload/abortUpload 则映射到同一 HTTP 作业控制器。

socket 必须实现 open/close/setOnOpen/setOnClose/setOnError/setHandleMessage/sendMessage/isOpen。open/discover 的回调异步投递，避开原生“先扫描后订阅”导致首屏丢事件；其它设备类型保留原有传输行为。找不到当前 deviceId 的 peripheral 注册必须返回可见错误。

### 原生选择与串口收发

保留原生 ConnectionModal 外壳和图标。扫描正文显示已授权端口及“选择串口”；初次 getPorts 为空显示“尚未选择串口”。按钮真实点击中直接 requestPort，再按明确连接意图 open。父抽屉的连接动作可打开此原生弹窗，但不经异步消息直接触发 chooser。取消选择不是设备错误，也不提示安装旧 Link。

getPorts 仅返回已授权端口，requestPort 需用户手势；reader/writer 释放后才可 close。依据：[Chrome Web Serial 官方说明](https://developer.chrome.com/docs/capabilities/serial)。不承诺浏览器 SerialPort 带 Windows COM 路径。

普通串口保持一个 reader 和一个 writer 队列，RX 分发到原生控制台与父抽屉，保留 text/hex/换行/日志。关闭抽屉只隐藏。波特率修改需要关闭再打开端口并恢复消费者，不能只改下拉框。Uno realtime 保留已有 Firmata 路由及心跳，自由文本发送在协议占用期间禁用；新 ESP32 条目不声称 realtime-ready。

### 本机烧录目标与互斥

本地 API 的 /ports 枚举不打开设备。浏览器 opaque portId 与 OS portId 分开，**不以 VID/PID 自动猜测 COM3**。烧录界面让用户从实时枚举结果明确选目标，显示板型/profile 与端口；若当前 COM3 已消失则刷新/重新选，不退到 COM1。

首期单会话规则足够：取得 flash 占用后，禁止新终端写入/重复上传/切板/切模式/替换项目；等待写队列完成，停止 VM 硬件发送和 realtime 心跳，取消读取、释放 reader/writer，await port.close。只有成功释放后才 POST /uploads。后端也只让一个 uploader 持有目标端口，外部程序占用时返回失败，不结束用户其它程序。

编译无须占用串口，也不要求先保存项目。默认“上传”流程先捕获当前代码并完成构建，再使用明确选定的目标执行写入。用户已经授权覆盖 COM3，后续开发/测试可在该范围按主控派工执行，无需重复索取同一授权；这不把 COM3 永久固化为任何设备的自动选择，也不使本设计分支获得实际硬件操作任务。

上传作业结束且工具释放端口后，才恢复之前明确打开的浏览器终端；恢复失败独立显示，不改变已经完成的烧录结果，也不自动运行积木/重放 TX。重枚举需新授权时提供选择入口。取消和超时必须等待实际工具退出；关闭进度窗口不代表端口已空闲。

会话、OS 端口、权限和 jobId 只在内存，不写入 .ob；原生保存状态不受连接、编译、上传成功影响。仍完整保存积木、素材、主控与六模块元数据。

## 6. 编译/上传与原生 UI

首期执行器固定为**本机硬件 API → Arduino CLI → 所选 profile 的官方上传 recipe**。使用后端确认的独立配置、core 与库；可参考本机 Mind+ 工具文件做开发验证，但前端不引用其任意 spawn、绝对路径或私有扩展运行时，也不修改用户运行中的 Link 安装。

普通 ESP32 和 FireBeetle profile 由后端登记，chip 必须是 esp32；使用哪个 core/FQBN/Flash/PSRAM/分区由已安装 boards.txt 与实物确认决定。Mind+ 的 mindplus:esp32:fireBeetleEsp32E 与官方 esp32:esp32:* 不能字符串替换后等同；OpenBlock 泛用 ESP32 的完整默认选项也不能未经当前 core 校验直接发送。保留三个旧 profile 的能力信息，S3 工具不齐时明示原因，不为本期实物验证先铺开多套工具链。

原生硬件头部上传按钮继续读取 code.codeEditorValue，包含直接编辑的 C/C++；不能从保存文件或纯积木 JSON 另生源码。现有“画布必须有积木”检查应最小调整为实际源码非空，确保用户编辑的源码是构建输入。“编译检查”若加入，放在原生硬件头部；已验收蓝色 MenuBar 六项目按钮及保存状态保持位置。

原生 UploadProgress 对应 building / releasing / uploading / restoring 阶段及日志。后端只提供阶段时不伪造百分比。原生先调用 upload 后挂载进度窗，适配器必须缓存首批日志和终态；60 秒无日志不能直接宣称作业结束或恢复串口，应读真实 job 状态。取消按钮由可取消状态控制，取消成功也不意味着固件被还原。

普通项目上传和实时固件安装分离。本期 ESP32 不提供自动恢复 Mind+ 固件；缓存里有 firmata.bin 与 partitions 并不足以形成可烧录计划。Uno 原生固件入口保留能力判断，未确认兼容固件时不可宣称可安装。

## 7. 按 Hardware v0.2 接口接入

本节原草案已由主控冻结契约替代。HTTP 类型、错误码、限制和返回格式直接以 docs/api-contract.md 的 Hardware addendum v0.2 为准，不继续维护第二份 schema。

**执行器独立运行于 127.0.0.1:3002，硬件 base 为 http://127.0.0.1:3002/api/v1/hardware；项目 API 继续使用 3001。** 前端使用 VITE_HARDWARE_BASE_URL 显式覆盖本机硬件地址，不回退为项目 API、远程服务器串口或旧 Link。后端提供独立入口/启动命令，主控协调启动；本设计分支没有启停服务。

| 边界 | 已冻结内容 |
| --- | --- |
| capabilities | protocolVersion:1、executionHost:'local'、profiles、toolchain；profile 使用 id/deviceId/label/chip/fqbn/compileAvailable/uploadAvailable/realtimeAvailable/reason |
| GET /ports | {items:HardwarePort[]}；OS portId/displayName，USB VID/PID 为可选 string；枚举不打开设备 |
| POST /builds | {deviceId,profileId,code,moduleIds?} → 202 {job}；documentId/editVersion 只保留为前端快照关联值，不扩展 HTTP 输入 |
| POST /uploads | {buildId,portId} → 202 {job}；buildId 为成功 build job ID；先释放 Web Serial 再提交 |
| GET /jobs/:id?afterLog=0 | {job,logs,nextLog}；日志 index 为单调递增索引，stream 为 stdout/stderr/system；state/stage/error 等遵循契约 |
| POST /jobs/:id/cancel | 空对象 → {job}；工具退出前保持 cancelling/占用，不把请求接收当作取消完成 |
| 父页面→iframe | GET_HARDWARE_STATE、OPEN_HARDWARE_CONNECT、DISCONNECT_HARDWARE、WRITE_SERIAL、SET_SERIAL_OPTIONS、HARDWARE_COMPILE、HARDWARE_UPLOAD、HARDWARE_CANCEL |
| UI 载荷与事件 | WRITE_SERIAL / SERIAL_BYTES 为 {sessionId,bytes:number[]}；SET_SERIAL_OPTIONS 为 {options:SerialOptions}；HARDWARE_STATE 包含连接、占用、板型、端口、配置、作业与错误 |

前端两端共同在 editor-protocol.ts 完成内部 HardwareSnapshot 的精确字段及运行时校验，保留现有 v1 envelope/origin/source 校验。串口字节在内部处理时仍使用 Uint8Array，跨窗口按已冻结 number[] 传递。文档不再要求 ArrayBuffer wire payload、{ports:...} 返回或 host/ready/seq/failure 等旧草案字段。

原生最小映射保持不变：bindVm 注册 factory；NativeSerialSocket 的 discover/connect/read/write/updateBaudrate 走统一 Web Serial；upload 解码 params.message，取得原生按钮捕获的 codeEditorValue，再结合当前 canonical deviceId/profile 建立同一 build→release→upload job。采用后端登记 profile，不接受原生 config 中的任意 FQBN/库路径；abortUpload 取消该 job；新 ESP32 的 uploadFirmware 明确 unsupported。UploadProgress 订阅同一日志与终态，无第二份上传实现。

前端仍用 documentId/editVersion 与当前源码/board/profile 检查快照是否变化；变化即重新编译，不能静默上传旧产物。HTTP 202 只表示接收，job 终态才释放上传占用。连接、编译和上传均不调用 MARK_SAVED。执行器不可达不影响独立 Web Serial 收发。

## 8. 开发接点与聚焦验收

前端实现范围：apps/web/src/openblock.ts、editor-protocol.ts、editor-bridge.ts、serial.ts、SerialPanel.tsx、extensions/catalog.ts、adapter.ts，以及新 ESP32/FireBeetle metadata/factory 适配和小型硬件会话模块。原生 UI 插入继续使用 openblock-hooks.mjs 的固定输入 hash、精确单次替换及 prepare 指纹；不直接修改生成 bundle。根依赖、工具配置和公共契约由主控协调。

| 验收层 | 本轮优先结果 |
| --- | --- |
| 主控扩展 | 普通 ESP32 与 FireBeetle 可选；旧三板保留；新类确由普通 ESP32 派生；不把 S3 选项/引脚带入 |
| 引脚与模块 | D2 生成 GPIO25、A0 生成 GPIO36；输出不出现输入专用脚；六模块分别及组合真实生成并编译；跨板不兼容引脚有明确阻断 |
| 保存回归 | 新 deviceId 和模块能 .ob 往返；旧项目无 ID 漂移；MenuBar、素材、dirty/MARK_SAVED 行为不变 |
| 连接模拟 | 无授权/取消/选择/拔出/重连有终态；原生与抽屉共享唯一 reader/writer；缺注册不转圈；无旧 Link 仍可走 Web Serial |
| 工具实跑 | 先完成普通 ESP32 和选定 FireBeetle profile 的无设备编译；记录 CLI/core/FQBN；语法错误与缺工具输出真实诊断 |
| 交接模拟 | 构建失败不接触端口；close 成功后才 upload；上传期间拒绝发送与重复上传；取消等待工具退出；恢复失败单独显示 |
| 实物读写 | 在用户授权范围内，以当前 COM3/实物 ESP32 记录选择、连接、收发与拔插；端口发现不写成实时协议通过 |
| 实际烧录 | 用户已允许覆盖 COM3，主控派工后执行，记录 profile/端口/工具日志与运行现象；当前设计分支未执行。没有实体板的旧型号记未实测 |

设计验证仅包括固定源码、已有观测、扩展包文本与官方板资料读取；未执行 Mind+ 包、未连接/打开串口、未写入固件、未编译样例，也未启停服务。

## 9. 已冻结的收敛决策

1. 已冻结两个新增目录项：已内置 arduinoEsp32，以及新 ID firebeetleEsp32E；FireBeetle 使用普通 ESP32 基类、数字 GPIO 内部值和独立 profile。实际目标优先选用户已确认的普通 ESP32，品牌板型尚未确认时不假装已识别 DFR0654。
2. 已冻结唯一流程：iframe Web Serial 会话负责正常收发，本地 3002 Arduino CLI 执行器负责构建/上传；本期不实现浏览器烧录器，也不另建服务端串口终端。
3. HTTP schema 以 Hardware v0.2 为准；后端以已核实工具/core 登记 ESP32/FireBeetle profile，前端按 compileAvailable/uploadAvailable/realtimeAvailable/reason 呈现能力，不扩大到立即补齐全部 S3/Uno 硬件实测。
4. 新 ESP32 首期为 upload 与通用串口；Mind+ 实时固件兼容不是已完成事实。用户已允许覆盖 COM3，主控可直接安排已授权的硬件验收，无需重复确认。
