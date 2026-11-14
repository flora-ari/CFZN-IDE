# 后端交接

## 顶部 Logo 资源与缩放（2026-11-12）

- 已核对契约顶部 Logo 附录与 `docs/design/brand-logo-backend.md`，以主控冻结的 `apps/web/public/branding/IDE.png` / 同源 `/branding/IDE.png` 为准。PNG 原字节随现有 prepare → Vite → dist 静态资产链发布，仅涉及前端 GUI 精确挂点与 120×40 等比显示约束；不需要后端资源 API、schema、依赖或存储变更，项目完整归档与 Hardware v0.2 保持不变。本轮只更新交接，后端业务零改动；未复制前端资源、修改业务源码、构建、启停服务或操作硬件，未改 VM/Blockly 和顶部模式切换。

## Mind+ 网页功能补齐 v0.7：服务状态分层与 Link 边界（2026-11-12）

- 已静态核对冻结契约、`docs/design/mindplus-parity-backend.md`、`mindplus-link-web-boundary.md` 及现有实现：本轮仅更新交接，后端业务/HTTP/schema/归档/依赖零改动。`hardware/app.ts:14–15` 分别提供 GET capabilities/ports；`executor.ts:48–53` 的 capabilities 已含 protocolVersion=1、executionHost=local、profiles 和 toolchain，ports 独立返回 OS 枚举结果。前端可据能力请求的可达性/响应校验区分检查中、在线、离线、协议不兼容；profile 的 compileAvailable/uploadAvailable/reason 单独表达工具缺失，不能当作服务离线。`ports.ts` 的枚举失败仅影响本机烧录端口列表，不证明浏览器串口失败；端口列表也不表示授权、占用或已连接。无需新增 connect/health/RPC/推送接口。
- 状态检查仅复用既有 GET，不创建作业、不改变主控/profile/显式 OS 端口、源码、dirty 或归档；正在运行的 job 继续使用既有轮询/取消/占有流程，检查失败不能假定 CLI 已退出。TerminalModel 属于编辑器生命周期内的前端有界显示状态，不增加串口 owner，不将日志、输入、格式、服务状态或授权信息写入 `.ob`/后端；完整归档与 revision 语义保持不变。
- 当前 3002 是编译上传执行器，不是已安装 CFZN Link，也不兼容 Mind+ 私有 WebSocket。未来可封装当前执行器，再单独冻结安装/启动、软件与协议版本、浏览器权限及传输策略；继续固定 profile/命令、loopback/产品 Origin、真实任务取消和烧录前浏览器释放/终态恢复。终端仍由唯一 Web Serial 会话持有；若未来改成本机串口代理须另行设计整体所有权，不双开端口，不复制通用 shell/pty/ssh 能力。本轮不实施安装器、托盘、自动更新或新本机服务。
- 未发现需要后端修复的契约冲突。本轮仅源码静态核对与本文件交接，未重跑测试、调用真实端口、启停用户 5173/3001/3002 或访问 COM3，未修改前端、顶部模式切换、VM/Blockly 或其他范围。

## 两个主控入口共用目录（2026-11-11）

- 已核对冻结契约最后一节与 `docs/design/controller-catalog-consistency-backend.md`；本轮仅统一前端完整原生目录的显示/筛选，不扩大五板 `controllerIds`、六模块支持矩阵、串口适配或 3002 DeviceId/profile 能力。3001 继续原样存储完整 `.ob`，不按五板目录裁剪 device；归档、revision、`cfzn/editor.json`、Hardware HTTP 均不变。后端业务/HTTP/schema/依赖零改动，仅追加此交接；未扩大调查、运行测试、操作服务或硬件，未修改其他范围或 VM。

## 扩展库 v0.6：空主控归档与移除边界（2026-11-11）

- 已静态复核冻结契约、`docs/design/extension-library-v06-backend.md` 与当前校验/保存/下载链路，未发现冲突，后端业务、HTTP、schema、依赖零改动，仅追加交接。`project-archive.validator.ts` 只验证 ZIP/CRC/大小、根 JSON 的 targets 数组及引用素材，不校验 device 身份或设备目录，因此符合其余约束的 `{deviceId:null,type:null,pnpIdList:[]}` 空主控归档与空 deviceExtensions 可正常接收；完整块、舞台扩展、监视器、素材及 `cfzn/editor.json` 随原 `.ob` Buffer 直接保存/返回，不重建或删减。API 不解析模块移除、选中/类型/兼容筛选状态，不替前端执行引用守卫或清板事务；revision/If-Match 仍仅随既有显式保存/改名请求提交，前端 no-op/筛选/内部卸载不调用 API 就不改变服务端版本。3002 保持 Hardware v0.2 原路由，无卸载、清板、筛选或新硬件命令，也无新增串口 owner。本轮未运行测试、操作服务或 COM3，未修改前端、root/tests、契约或 VM。

## 工具箱类别与内置模块加载 v0.5（2026-11-11）

- 已静态核对冻结契约、`docs/design/toolbox-extension-loading-backend.md` 及当前 API：本轮后端业务、HTTP、依赖和匿名存储零改动，仅更新此交接。POST/PUT 仍将校验后的原 Buffer 交给本地存储，GET content 原样返回完整 `.ob`；device/programMode/extensions/deviceExtensions、素材与 `cfzn/editor.json` 均随归档保全，revision/ETag/If-Match 冲突语义不变。模块 URL、资源版本、重试计数及类别/加载缓存由前端保持在归档外，API 不新增这些字段或扩展资源代理，也不新增 serial owner；3001 项目服务、3002 Hardware v0.2 和浏览器唯一 Web Serial 会话边界不变。未发现契约冲突；未重复运行后端测试、启停服务、访问硬件或修改前端/root/tests/VM。

## Connection modal v0.4：无需后端业务变更（2026-11-10）

- 已静态复核冻结的 v0.4 契约、`docs/design/connection-modal-backend.md` 和当前调用链。连接、授权、端口/波特率切换与失败恢复属于前端唯一 HardwareSession；后端业务、HTTP schema、依赖均无需变更，本轮仅追加交接。
- `src/hardware/app.ts:14–19` 仍只提供 Hardware v0.2 的 capabilities/ports/builds/uploads/jobs/cancel。GET ports 经 `executor.ts:53` 返回 `{items:HardwarePort[]}`；`types.ts:8` 定义 `portId/displayName` 与可选十六进制 USB VID/PID，`ports.ts:6–23` 仅枚举 OS 端口，不打开、不授权、不返回连接态或波特率，也不映射浏览器授权句柄。
- `executor.ts:82` 上传仍只接 `{buildId,portId}`，第 89 行复核明确提交的 OS 端口；不接收 browserPortId、baudRate 或浏览器授权信息。前端现有 hardware-controller 仍通过 capabilities/ports 配置烧录、先 session.close 再 uploads、终态后恢复；普通浏览器连接/设置不需新增 HTTP。本机服务不可达应仅影响编译/烧录设置，不能据此判定浏览器连接失败。
- 本轮仅源码/契约静态核对，未调用真实 `/ports`、未运行测试或硬件操作，未启停服务，未修改前端、VM、共享契约或接口。

## Mode UI v0.3：代码草稿附加条目兼容（2026-11-10）

- 只读核对统一契约末尾 Mode UI addendum v0.3 与当前 API 调用链，确认合法完整 `.ob` 中可包含可选 `cfzn/editor.json`，后端无需新 HTTP 字段、接口或业务代码修改；本轮仅更新本交接文件。匿名本地存储及 Hardware v0.2 边界不变。
- 校验：`src/projects/project-archive.validator.ts:69` 遍历全部 ZIP 条目，检查重复路径、CRC 和展开总量；第 86/103 行仅对根 `project.json` 收集/解析，之后检查 targets 和造型/声音引用。没有条目白名单、没有删除 `cfzn/`、没有重建 ZIP，因此合法 `cfzn/editor.json` 作为附加文件通过结构校验并保留。仍受原有 20 MiB 压缩/100 MiB 展开归档限制；5 MiB 限制仅适用于根 project.json。
- POST：`src/projects/projects.controller.ts:66` 校验 `file.buffer` 后，第 67 行把同一 Buffer 传入 store.create；`src/projects/local-project.store.ts:71` 将该 Buffer 直接写入完整归档文件。
- PUT：`src/app.ts:29` 使用 raw body 解析；`src/projects/projects.controller.ts:132` 校验后，第 133 行把原 Buffer 交给 replaceContent；`src/projects/local-project.store.ts:100` 直接写新归档，再提交版本元数据。不会将草稿内容转成后端 Project 元数据，也不改 revision/If-Match 语义。
- GET content：`src/projects/local-project.store.ts:55` 直接 readFile 读取已存归档，`src/projects/projects.controller.ts:114` 直接 end(archive) 返回；因此保存、下载路径不会改变 ZIP 原字节，附加 JSON 的空白/编码/压缩表示也不会被后端重新序列化。
- 边界：后端不解析或验证附加条目的 version/codeMode/manualSource 语义，不单独执行 manualSource 1 MiB 上限；该 v0.3 格式与载入前校验由前端 VM 外归档适配层负责。前端重新导出时也须显式加回此条目，后端字节保全不能替代 VM 外的读写/回滚实现。未发现阻断。
- 本轮为源码静态确认，未新增或运行测试，未启动/停止服务，未访问 COM3，未改动 API 业务、测试、前端、契约或 VM。

## 本地硬件执行器 Hardware v0.2（2026-11-07）

- 已实现独立 `src/hardware-main.ts` / `src/hardware/`，默认只绑定 `127.0.0.1:3002/api/v1/hardware`。精确实现契约的 capabilities、ports、builds、uploads、jobs 日志游标及 cancel；原 3001 项目 API、存储及其业务实现未改，前端/根配置/共享契约/VM 源码或打包代码均未改。
- `npm run hardware` 构建后启动；已有 dist 可用 `npm run start:hardware`。本机已验证的显式配置为 `apps/api/hardware.config.example.json`，环境键为 `HARDWARE_CONFIG`、`HARDWARE_RUNTIME_DIR`、`HARDWARE_PORT`、`HARDWARE_ALLOWED_ORIGINS`。具体复制部署、依赖配置和命令见 `apps/api/HARDWARE.md`。没有新增 npm 依赖，package-lock 无需变动。
- 实现单 build/upload 执行槽，可信 profile 派生 CLI/FQBN/库/产物路径，spawn argv + shell:false；Windows 仅 taskkill 自有 PID 进程树。取消在真实进程关闭前保持 cancelling；构建/上传超时分别 10/3 分钟，源码限 1 MiB UTF-8，日志限约 1 MiB/job、明确截断并维持单调游标。成功构建须 exit 0 且真实产物非空，记录大小/SHA256；上传重验成功 build 的产物及工具/profile 身份，用同一 CLI recipe + --verify，exit 0 且含验证回执才成功。后端无串口 connect/read/write 终端。
- 五个 profile：`uno-avr`、`esp32s3-default`、`aijite-esp32s3-default`、`esp32-4mb-dio`、`firebeetle-esp32e-4mb`。配置依赖可用与实测通过分开；两款 S3 因缺 core 不可用，不伪装成普通 ESP32。所有实时固件能力未验证，realtimeAvailable=false。
- 本机工具：Mind+ 修改版 CLI git-snapshot / commit `2c1d71e` / 2026-07-30T10:30:44Z；普通 ESP32 core 1.0.6，FireBeetle Mind+ core 0.0.2。生成 config/data/user/cache/tmp/sketch/build 只在 CFZN runtime，既有 core/vendor 工具只读引用、索引与 builtin 工具复制到隔离目录，不执行用户软件安装或更新。实际修正旧 Windows GCC 的过长头文件路径问题，工具布局使用短 `t/<hash>`；补用已安装新版 builtin 发现工具，未修改用户安装。
- 后端分支真实无硬件 HTTP 编译：普通 ESP32 job `142b4a1e-2a46-4fba-8bd5-941c0a2fe5cc`，FQBN `esp32:esp32:esp32:FlashMode=dio,FlashFreq=40,FlashSize=4M,PartitionScheme=default,UploadSpeed=115200`，产物 BIN 204,640、分区 BIN 3,072、ELF 4,518,144 字节；FireBeetle job `bc07c343-fd2f-47f9-8407-9e41fac74e4c`，FQBN `mindplus:esp32:fireBeetleEsp32E`，产物 BIN 205,840、分区 BIN 3,072、ELF 4,053,788 字节。相同串口标识/回显源码分别编译成功；另用实际 `#error CFZN_EXPECTED_COMPILER_DIAGNOSTIC` 验证 COMPILE_FAILED。证据 `.runtime/hardware-verify/verification-summary.json`、各 job 的 result.json（完整日志、版本、core、FQBN、产物 SHA256）及 `.runtime/hardware-verify-output.log`。
- `npm run build`、`npm run typecheck`、`npm test` 通过：共 15 项（既有 6 项项目 HTTP 回归 + 新增 9 项硬件测试）。覆盖字段/profile/大小/缺工具/来源校验、成功 build/upload、未知端口、修改产物/工具身份、占用/缺验证回执、单任务互斥、取消/超时、日志截断、缺一个 core 不影响另一个、隔离配置、真实 Node 子孙进程树终止和 argv 字面量。HTTP uploader/产物为测试替身；真实 CLI 编译另由 verify:hardware 证明。
- **主控独占完成的实物结果（本分支只读引用，未重复操作 COM3）：** `.runtime/hardware-research/physical-esp32/result.json` 记录通用 ESP32 build `8b4f08f1-8348-4b0b-8169-657a067b1b27`、upload `a7c83c05-6445-4a63-b0ae-6ddfd10a7925` 通过，boot/app/partition 各段 Hash of data verified、RTS 复位；`.runtime/hardware-research/serial-echo-result.json` 记录 115200 下真实读到 `CFZN_ESP32_TEST_READY` 并回显随机 `CFZN_ECHO_fc1dd4a0be77`（953 ms）。传输是 System.IO.Ports.SerialPort，不能当作浏览器 Web Serial 通过，也不证明实物是原厂 FireBeetle。
- 限制：Uno 本轮仅依赖校验，未单独实际编译/实物测试；S3/Aijite 无 core/实物；FireBeetle 仅本轮真实编译，未以其 profile 实物刷写；浏览器授权、共享终端、上传前释放/恢复和五板模块生成器回归仍由前端/独立测试验收。后端分支全程未枚举或打开 COM3、未烧录、不触碰用户 5173/3001 或主控保持运行的 3002 服务。

## 原生项目工具栏整合：无接口变更（2026-11-06）

- 已阅读统一契约的 Native project toolbar addendum 与 `docs/design/native-project-toolbar-backend.md`。本轮仅迁移六按钮和保存状态的显示位置，新增消息属于父子 iframe 内部桥接；HTTP v0.1、Project 元数据、完整 `.ob` 归档及本地存储边界均不变。后端业务代码改动为零，仅追加本交接记录。
- 静态核对当前 controller、归档校验、If-Match 解析、错误定义及本地存储：POST 校验后原样保存归档并创建 revision 1；PUT/PATCH 各自校验当前 revision、独立提交并递增版本，响应 ETag 来自实际 Project；缺失 If-Match 为 428，过期版本为 412，GET content 支持可选版本检查。按项目串行提交、先写新归档再切换元数据指针的保存逻辑保持不变，未发现本次迁移需要修复的后端问题。
- 工具栏继续由父应用发起现有 API 请求并处理服务端确认、失败/冲突与 PUT 成功后 PATCH 失败的部分成功结果；不新增后端工具栏、保存状态或串口接口。
- 按主控要求，本轮仅静态核查，未重复运行上一轮已通过的 build/typecheck/6 项 HTTP 测试，未修改测试或用户数据，也未启动、停止或重启任何服务；用户现有 5173/3001 服务未触碰。

## 既有能力记录

- 已按 `docs/api-contract.md` 完成匿名健康检查、项目列表、创建、读取、改名、删除，以及完整 `.ob` 内容上传和下载。支持导入兼容 `.sb3`，下载保留原始归档字节。所有项目错误走统一 JSON 格式。
- 归档逐项检查 ZIP 数据和 CRC、根 `project.json`、`targets` 及引用的图片和声音，并执行 20 / 100 / 5 MiB 三项限制。归档内容不解压到磁盘路径。
- `ProjectStore` 提供存储替换边界。本地实现按项目串行检查和提交 revision，先写新归档、再切换元数据；旧版本请求返回 412，失败写入保留旧版本。
- Windows Node.js 24.16.0 下已通过 `npm run build`、`npm run typecheck`、`npm test`（5 项 HTTP 集成测试）和 `npm run dev` 健康检查。真 OpenBlock VM 导出的 2,107 字节归档也已实测上传，在 API 进程重启后下载并逐字节比对。
- 默认地址 `http://127.0.0.1:3001/api/v1`，可用 `PORT` 和 `PROJECT_DATA_DIR` 隔离测试。部署范围是单进程本地项目存储。

## 主控 / 模块扩展归档对齐（2026-11-06）

- 已核对 `docs/api-contract.md` 的 Controller and module extensions addendum：现有归档校验仅检查 ZIP、JSON/targets、素材引用和大小限制，不按主控或扩展目录执行白名单检查；POST/PUT 将原始 Buffer 交给 `ProjectStore`，本地存储不重建归档。不需要新增 API、元数据字段或业务实现改动。
- 本次修改仅涉及 `apps/api/test/api.test.cjs` 和本交接文件。新增 1 项 HTTP 回归，复用既有临时目录、`127.0.0.1:0` 随机端口和断言辅助函数，不读取或修改用户项目数据。
- 测试构造含 `device.deviceId = aijiteESP32S3`、`programMode = upload`、普通扩展 `extensions`、设备模块 `deviceExtensions`、真实模块 opcode/连接/PIN 参数及 SVG/WAV 素材的完整 ZIP 归档。`activateBuzzer` 有放置积木，`pirSensor` 和 `moreComments` 仅加载、未放置积木；另含目录未知的普通扩展 `futureStageExtension` 与模块 `futureDeviceExtension`。
- POST → GET content 和修改积木参数、opcode、造型/声音字节后的 PUT → GET content 均逐字节相等；保存时未知 ID 不被拒绝。ETag/revision 从 `"1"` 递增为 `"2"`，项目 ID、名称和 createdAt 不变，updatedAt/sizeBytes 正确；重启应用后 revision 2 的元数据与归档仍一致。既有冲突、失败提交及大小/素材校验测试继续复用，未重复添加。
- Windows / Node.js `v24.16.0` 下：`npm run typecheck` 通过；`npm test` 通过（包含 `npm run build`，共 6 项 HTTP 测试，6 通过、0 失败）。
- 本项使用测试构造的完整归档验证 HTTP 和持久化边界，不替代浏览器真实 VM 的模块注册、代码生成及保存恢复验收；这些由主控后续独立测试调度。本次未进行硬件测试、编译或烧录。
