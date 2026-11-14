# 硬件连接、编译与烧录：后端设计提案

日期：2026-11-07（Asia/Shanghai）。状态：已按主控冻结的 `docs/api-contract.md` 顶部 Hardware v0.2 收尾。本文件补充工具与源码证据，接口以该契约为准。

## 1. 本轮定向与验证边界

**采用统一浏览器 Web Serial 会话 + 单一本地 Arduino CLI 编译/烧录执行器。优先验证实物普通 ESP32，保留现有三款主控，新增 `arduinoEsp32` 与 `firebeetleEsp32E` 两项，合计五款。** 本期不并行实现浏览器烧录器，也不复用旧 Link 的整套串口服务。原生 GUI 的发现、连接和终端由前端统一会话适配；后端只枚举上传用系统端口、管理工具 profile、编译和执行上传任务。

主控已转达用户允许覆盖 COM3 现有程序，以测试程序验证烧录和串口。实际打开设备、芯片查询及刷写由主控统一协调；无需重复询问同一测试授权。本设计分支仍只读研究、只修改本文件，不操作串口。本文“主控实机证据”和“本分支文件核对”分别标明，未执行的编译、上传或实时协议测试不计为通过。

| 证据 | 已知结果 | 能支持的结论 |
| --- | --- | --- |
| 用户确认 | 实物是 ESP32，不是 S3；Mind+ 实时模式选择 FireBeetle ESP32-E 能发现 COM3 | 新增普通 ESP32 及 FireBeetle 兼容适配，不继续把当前实物按 S3 处理 |
| 主控 Windows 识别 | COM3，CP210x，VID 10C4 / PID EA60 | USB 串口桥信息；VID/PID 本身不能确定主控型号 |
| 主控用旧 Link esptool 3.0 只读查询 | ESP32-D0WD-V3 revision 3；40MHz；Flash manufacturer 46 / device 4016；detected 4MB；未写 Flash | 当前芯片家族为普通 ESP32、Flash 容量 4MB；查询中的 40MHz 是芯片晶振信息，不等同 Flash 工作频率 |
| 本分支检查 | Mind+ CLI、普通 ESP32 core/GCC/esptool 文件存在；CLI/GCC 可返回版本 | 有可供后续实际编译验证的工具候选；尚未编译通过 |

这些证据尚不能证明实物是 DFRobot DFR0654 原厂板，也不能确认 PSRAM、全部引脚布线、板载 LED 或当前固件协议。新增控制器显示兼容关系，不能把用户的普通 ESP32 重新命名成已鉴定的 FireBeetle 实物。

## 2. Mind+ 扩展与本地链路证据

### 2.1 缓存中的 FireBeetle ESP32-E

已读取 `C:/Users/YUUMEI/AppData/Local/mind+/download/realtime/devices/dev-DFRobot-firebeetleEsp32E@0.0.3/config.json`，并检查同目录文件：

| 字段/文件 | 值 |
| --- | --- |
| 扩展 id / 名称 | `firebeetleEsp32E` / FireBeetle ESP32-E |
| 扩展版本 / mode | `0.0.3` / `realtime` |
| boardConfig.board | `mindplus:esp32:fireBeetleEsp32E`，注意 board 名中的大写 B |
| boardConfig.version | `0.0.2`，这是板卡 core 版本，不是扩展版本 |
| boardsURL | `https://resource.mindplus.top/mindplus/package/package_mindplus_index.json` |
| compatibilityId / sku | `fireBeetleEsp32E` / `DFR0654`，属于扩展声明，不能据此鉴定用户实物 |
| 入口与运行时 | `main.js`；`meta.runtimeVersion` 为 `0.0.2` |
| 实时固件 | `firmware/firmata.bin`，255,504 字节；同目录 `firmata.partitions.bin`，3,072 字节 |

本机 upload/devices 当前未找到对应扩展包，不能把实时包描述成已下载的上传扩展。主控负责用 REA 继续分析包和运行时；本分支未复制或执行包入口。

**Mind+ 扩展包不能直接作为 OpenBlock 扩展载入。** 它的 descriptor、运行时接口、板型配置和固件入口需要映射到本项目已有的设备工厂、积木/代码生成器和 profile。只复制 `config.json` 或改一个扩展 id 不会提供发现、编译和实时执行能力。固件名为 Firmata 也不能证明与 OpenBlock VM 的握手、扩展消息和引脚语义兼容。

适配建议：新增独立的 OpenBlock 设备标识 `firebeetleEsp32E`，基于普通 ESP32 设备能力建立工厂和引脚映射，后台关联其 Mind+ board profile；保持 `arduinoEsp32` 通用项独立。原始扩展代码、图片与固件是否纳入发布包应由主控根据实际需要及来源许可处理，本文不以缓存存在作为直接打包依据。首期串口、编译及用户程序上传不依赖复制 Mind+ 实时固件。

### 2.2 主控提供的 Mind+ 公开页面观测

`.runtime/hardware-research/realtime-observations.json`、`upload-observations.json` 及上传页脚本显示：

- 页面经本地 WebSocket 6601 获取路径、Link 版本和串口列表；Link 根为 `D:/mindplus/Mind+ Link`，报告版本 2.0.7。捕获时串口列表曾只有 COM1，这是当时快照，不否定用户后来发现 COM3。
- 上传页从本地 Link 根取得 `tool/arduino-cli` 路径，调用本机进程执行 compile/upload，传入 board、buildPath、config、库及源码；不能再把该观测归纳为“Mind+ 在云端编译”。
- 页面脚本出现 `--profile tmp_profile`、`--fast-compile` 等参数。其 CLI 是修改版，不能把这些 flags 原样当成所有官方 CLI 版本都支持的参数。

我们复用的是本地 CLI 的进程调用方式及已安装工具候选，不依赖 Mind+ Link 的通用 spawn RPC，也不把其本地任意进程接口暴露给本产品页面。

## 3. 已安装工具及可复用范围

检查限定于主控给出的安装位置、旧 IDE、相关 Arduino 工具目录与扩展缓存；没有全盘扫描、安装或修改工具。版本查询不涉及设备。

### 3.1 Mind+ 普通 ESP32 工具候选

| 项目 | 本地证据 |
| --- | --- |
| CLI | `D:/mindplus/Mind+ Link/tool/arduino-cli.exe`，37,846,368 字节；实际 `version` 为 git-snapshot、commit `2c1d71e`、2026-07-30T10:30:44Z |
| CLI 发行说明 | 同目录 `NOTICE-arduino-cli.txt` 明确为修改版，包含 fast-compile/profile 改动，附许可证及来源 `https://gitee.com/dfrobot/arduino-cli.git`；不把它标成已知官方发布版本 |
| data 根 | `C:/Users/YUUMEI/AppData/Local/mind+/Arduino/`；已有配置引用该 data 根及包索引 |
| core | `packages/mindplus/hardware/esp32/0.0.1/` 与 `0.0.2/`；目标扩展使用 0.0.2 |
| 编译器 | `packages/mindplus/tools/xtensa-esp32-elf-gcc/5.2.0/`；实际 GCC 5.2.0，crosstool-ng 1.22.0-61-gab8375a |
| 镜像/上传工具 | esptool_py 2.8 的 Windows exe，以及 gen_esp32part_py 0.0.1；本分支未运行上传 |
| 0.0.2 包记录 | installed.json 指向 `esp32-0.0.2.zip`，35,011,021 字节，记录 SHA-256 `37f0e35c8bf59398f3e8909fbc1dd65c1544bde1e57a4ee42a3952710c75b371`；这不是本轮重算的归档校验结果 |

0.0.2 的 `boards.txt` 存在 `fireBeetleEsp32E`，但没有通用 `esp32` board，也没有 S3 board。因此不能构造不存在的 `mindplus:esp32:esp32`，或拿它支持两款 S3。

FireBeetle 配置实际为 `mcu=esp32`、`variant=fireBeetleEsp32E`、240MHz CPU、DIO、4MB Flash、80MHz Flash、默认分区；上传工具 esptool_py。其 variant 定义如 D0→GPIO3、D1→GPIO1、D2→GPIO25、D9→GPIO2，SDA→21、SCL→22。**D 引脚名与 GPIO 数字不能混用**；这些是软件配置证据，不等于实物布线已经验证。通用 ESP32 项优先展示 GPIO 名，FireBeetle 项若展示 D/A 别名须明确转换。

### 3.2 旧 OpenBlock Link 与旧 IDE

`D:/openblocklink/OpenBlock Link/resources/tools/Arduino/` 已有：

| 工具/core | 核实结果与用途 |
| --- | --- |
| Arduino CLI | alpha 0.18.3，commit d710b642，2021-05-14；可返回版本，用于旧环境参考 |
| AVR | core 1.8.3，AVR GCC 7.3.0 可返回版本，avrdude 6.3.0-arduino17 exe 存在；Uno 候选环境，未实际编译 |
| 普通 ESP32 | `esp32:esp32` core 1.0.6，有 `esp32` board；xtensa-esp32 GCC 5.2.0、esptool_py 3.0.0 存在 |
| 通用 ESP32 配置 | `esp32:esp32:esp32`，variant esp32；boards.txt 有 DIO、4M、默认分区及 115200 上传选项；不能原样接收 2025 GUI 的全部新 core 选项 |
| S3 | 此 core 没有 esp32s3 项，未发现其所需编译环境 |
| 库/固件 | Servo、ServoESP32；旧 Uno Firmata HEX 存在，未证实与当前 VM 实时协议兼容 |

旧 IDE `F:/CFZN/D-Coding/aijite-editor-release/aijite-editor-release/` 有 aijite-link 0.2.0 源码，但自身 tools/firmwares 缺失；desktop 的 `tools/Arduino/arduino-cli` 只是 29 字节 macOS 路径文本。PATH 和通常的 Arduino15 目录没有另一套可直接使用的 Arduino/S3 工具链。

首轮开发建议以 **Mind+ CLI 为统一候选执行程序**，按 profile 指定已安装的 core/tool 数据根，分别验证旧普通 ESP32 core 与 Mind+ FireBeetle core；其跨数据根兼容性必须靠真实编译确认，不能现在宣称可用。若现有组合不兼容，由主控固定一套独立 CLI/core 环境替换工具版本，保留同一执行服务。不要为了补依赖再建第二条烧录路线。

所有新增 config、sketch、构建产物和缓存位于本项目专用目录；不对用户正在使用的 Link/Mind+ 目录执行 `config init`、`config set`、core install/update 或覆盖文件。实际工具路径由配置登记；运行时不自动下载安装。正式固定环境须记录 CLI/core/库版本；不能仅记录文件路径作为可复现证据。

## 4. 五款主控与 profile

以下 profileId 是工具配置示例名，实际值由受控配置登记，字段遵循 Hardware v0.2。控制器登记与能力就绪分开；既有项目里的三款 deviceId 不改名、不迁移成新 ESP32 项。

| deviceId | 建议 profileId / 基础 FQBN | 本轮能力与验收重点 |
| --- | --- | --- |
| `arduinoUno` | `uno-avr` / `arduino:avr:uno` | 保留；现有 AVR core 可作编译候选。未持有对应实物的测试仍标未实测；实时另需 Firmata 验证 |
| `arduinoEsp32S3` | `esp32s3-default` / `esp32:esp32:esp32s3` | 保留；当前缺 S3 core/工具，capabilities 如实不可用，不套用普通 ESP32 编译器 |
| `aijiteESP32S3` | `aijite-esp32s3-default` / 同 S3 core 的独立板级配置 | 保留既有 IO3 约束；Flash/PSRAM/USB 参数依实际板型，不从品牌名推断；当前缺工具 |
| `arduinoEsp32` | `esp32-4mb-dio` / `esp32:esp32:esp32` | **当前实物优先验证**；候选使用已安装 core 1.0.6，明确 4MB、DIO、默认分区；初测上传速率可固定 115200，Flash 频率采用该 profile 的独立值 |
| `firebeetleEsp32E` | `firebeetle-esp32e-4mb` / `mindplus:esp32:fireBeetleEsp32E` | 新增兼容项；core 0.0.2、其 variant/默认分区，80MHz Flash 为包的配置值，不能靠晶振查询证明；与通用 ESP32 分别编译验证 |

固定 GUI `0.1.0-prerelease.20250611102354` 的 sourcemap 已包含 `devices/arduinoEsp32/arduinoEsp32.js`，其工厂继承 CommonPeripheral，CP210x 已在 PNP 列表中。优先复用普通 ESP32 设备/生成器，避免从 S3 改名复制。该源的默认 FQBN 含新 core 选项；后台必须按自有 profile 生成当前 core 支持的 FQBN，不接受整个默认对象直接透传。

现有六模块的适用设备列表和 GPIO 菜单需显式扩展到两款普通 ESP32；Aijite 的 IO3 特例不得自动继承给它们。真实生成代码逐个及组合编译，特别核对旧 core 的 PWM/Servo 等 API 与固定 GUI 生成器是否匹配。串口示例能编译不代表所有积木都兼容。

五款分别报告 compile、upload、realtimeFirmware 能力及不可用原因。初期普通 ESP32 具备串口与用户 sketch 上传目标；在未证实协议前，不宣称 FireBeetle/Mind+ Firmata 可供 OpenBlock 实时控制。新增项进入控制器库、保存/恢复及模块加载的测试不能以烧录测试替代。

## 5. 本地执行架构与端口交接

按冻结契约，在 `apps/api/` 增加独立启动的 hardware 入口，绑定 `127.0.0.1:3002`，base URL 为 `http://127.0.0.1:3002/api/v1/hardware`；现有项目 API 保持 3001。前端由 `VITE_HARDWARE_BASE_URL` 显式配置本地地址。允许配置的产品 Origin 与本地开发 Origin，不争抢旧 Link 的 20111，不启停用户现有 Link/Mind+ 服务。服务只接受登记过的 profile、模块和固定工具，不接受任意 shell、CLI flags、库路径或固件磁盘路径。

原生 GUI 的 socket factory 由前端适配到 iframe 内唯一 HardwareSession；普通串口的原生显示和父页面终端共用一个 reader/writer。**后端不再实现另一套 connect/read/write WebSocket 服务**。原生 upload 适配为同一 HTTP 作业流程，abortUpload 对应真实取消，不另建上传队列。

本机枚举用于 CLI 上传端口选择；浏览器 getPorts/requestPort 用于 Web Serial 授权发现。Web Serial 不提供可直接使用的 Windows COM 路径，VID/PID 也不能唯一映射同型号设备。上传时从后端当前列表明确选择 OS 端口；本轮主控已明确 COM3 是测试目标，应用不得将 COM3 固化为所有用户的默认目标。[Chrome Web Serial 文档](https://developer.chrome.com/docs/capabilities/serial)

一次原生上传流程：

1. 捕获当前 `codeEditorValue`、deviceId/profileId、moduleIds、documentId/editVersion，包括用户手改 C/C++，不重新生成后覆盖这份快照。
2. 后端编译，不打开串口；失败停在编译阶段。产物与源码、profile、工具版本绑定。
3. 编译成功后，前端取得 flash 占用，停止 VM 硬件交互/心跳，等已提交写入结束，释放 reader/writer 并等待端口 close 成功。关闭失败不能进入上传。
4. 前端保持占用并提交 `{buildId,portId}`；关闭完成及会话关联仅在前端内部管理，不增加 HTTP 字段。后端检查任务/端口，启动唯一 CLI upload，使用该 build 的固定 profile 与产物；外部占用仍按真实 uploader 错误处理。
5. uploader 退出且进程树结束后释放执行槽；前端再恢复此前开启的终端配置。刷写成功与终端恢复失败分别记录，不自动重新执行项目或重发终端文本。

编译期间允许继续编辑；上传前若源码、设备或 profile 已变，应重新编译，不能把旧产物显示成当前源码；documentId/editVersion 用于前端检查快照是否仍适用。上传期间阻止本应用新开串口、重复上传和切板。其他程序占用时返回错误，不强杀进程。

本地 CLI 的 COM3 是执行机端口；将来项目 API 上云后仍需用户本机执行器。远程服务不能把服务器串口当成浏览器用户设备。未来发布涉及的本地连接部署方式独立验证，本轮不扩大成云代理发布工程。

## 6. 构建与上传约束

CLI 采用 `spawn(executable, argv, {shell:false})`；参数由注册 profile 派生。独立 sketch 目录与 `.ino` 文件同名；库由 moduleIds 映射固定资源。先用该 CLI 的实际命令能力核对参数，再执行 build；不能把修改版的 `--fast-compile` 当作必要条件，也不默认复制 Mind+ 的临时 profile 机制。

Arduino CLI 的 compile 和 upload 是两个阶段，upload 本身不编译。建议 compile 明确 FQBN/config/build-path，upload 引用同一构建目录、同一 profile 及选定 port；具体 flags 以已选版本验证结果为准。[官方 compile](https://docs.arduino.cc/arduino-cli/commands-reference/arduino-cli_compile)、[官方 upload](https://docs.arduino.cc/arduino-cli/commands-reference/arduino-cli_upload)

成功条件：build 进程退出 0 且 profile 要求的产物存在；upload 进程正常完成，保留 uploader 的写入/校验结果。没有真实百分比就显示阶段和日志。用户程序是否运行正确另由烧录后串口标识和行为确认，不能由“命令退出 0”直接推出。

Mind+ core 0.0.2 的 `platform.txt` 已定义普通 ESP32 的上传配方：bootloader 0x1000、partition 0x8000、boot_app0 0xe000、应用 0x10000，且依赖 core 内文件。这里是**该 core 的配方证据**，并非所有板的通用偏移。实现让 CLI 使用匹配构建的 recipe，不手工拼只含应用 bin 的不完整烧录，也不把缓存中的实时 `firmata.bin` 当当前用户程序。

Flash 测试前主控核对当前芯片查询与 profile；用户已经授权测试覆盖，不需要再因本文旧版本的待授权措辞阻断工作。芯片/Flash 查询由主控独占串口执行，结果可记录供本轮验收；不增加后台周期探测或打开页面就进入 bootloader 的行为。

实时固件安装与用户 sketch 上传保持独立。发现设备、串口 open、收到普通文本、Firmata-ready 是不同状态；本轮用户 sketch 覆盖后原来的实时固件可能不再存在。恢复实时功能需要匹配固件和协议验证，不能在普通“连接”时静默刷固件。

## 7. 已冻结 HTTP 边界

以下摘要遵循 Hardware v0.2，完整类型以契约为准；本地前缀 `/api/v1/hardware`，错误继续使用 `{error:{code,message,details?}}`。现有 `/api/v1/projects`、`.ob` 归档、revision 和保存状态语义不变。

| 方法/路径 | 输入 | 语义 |
| --- | --- | --- |
| GET `/capabilities` | 无 | 200 HardwareCapabilities：protocolVersion 1、executionHost local、profiles、toolchain；每个 profile 有 compileAvailable/uploadAvailable/realtimeAvailable 与 reason |
| GET `/ports` | 无 | 200 `{items:HardwarePort[]}`；当前 OS portId/displayName/usbVendorId/usbProductId；枚举不打开，不根据 CP210x 自动鉴定板型 |
| POST `/builds` | `{deviceId,profileId,code,moduleIds?:string[]}` | 202 `{job}`；不要求项目已保存或已连接设备；code 是当前编辑器快照 |
| GET `/jobs/:id?afterLog=0` | 下一个未读日志的零基索引 | 200 `{job,logs,nextLog}`；日志含 index/stream/text，真实阶段、终态与诊断 |
| POST `/uploads` | `{buildId,portId}` | 202 `{job}`；buildId 为本执行器已成功构建且尚保留产物的 build job ID |
| POST `/jobs/:id/cancel` | 空对象 | 200 `{job}`；子进程确实退出后才进入 cancelled；已终态返回当前状态 |

首期单机只需一个构建/上传执行槽，重复作业返回 busy；不引入数据库、持久任务历史或远程队列。HardwareJob 按契约返回 id、kind、state、stage、deviceId/profileId、sourceHash、createdAt、可选 finishedAt/buildId/portId/error。state 为 running/cancelling/succeeded/failed/cancelled，stage 为 compiling/uploading/complete。documentId/editVersion 留在前端快照关联，不增加 HTTP 请求或作业字段。任务迅速返回 202，避免长编译占用现有 45 秒桥接请求。

`sourceHash` 标识实际 code；构建另记录 profile 与工具/库版本，使同源码的不同构建组合可区分。后端保管产物清单，页面不能传任意文件路径替换产物。构建、上传、连接状态均不进入 .ob，不调用 MARK_SAVED、不推进项目 revision。

冻结错误为：400 VALIDATION_ERROR，404 JOB_NOT_FOUND/PORT_NOT_FOUND，409 HARDWARE_BUSY/BUILD_NOT_READY，413 PAYLOAD_TOO_LARGE，503 TOOLCHAIN_UNAVAILABLE；异步错误 COMPILE_FAILED/UPLOAD_FAILED/TOOL_TIMEOUT，保留真实诊断。源码上限 1 MiB UTF-8，build 超时 10 分钟、upload 3 分钟；每任务日志上限 1 MiB，截断有明确提示且游标单调递增。原生 60 秒无日志 UI timeout 不代表进程结束；前端须继续跟踪或请求实际取消，不能丢失作业后继续开放端口。

取消只终止该任务拥有的进程树，不能杀 Link、Mind+、Vite/API 或其他任务。取消上传不等于恢复旧 Flash，终态不得映射成普通 uploadSuccess；完成释放后提示本次上传未完成。临时构建产物不作为持久项目数据；失效 build 按冻结错误语义处理。

## 8. 原生扫描问题的既有证据

只读解析 `D:/openblocklink/OpenBlock Link/resources/app.asar` 得到：桌面 1.0.0，openblock-link `0.1.0-prerelease.20211006073349`，默认串口服务 127.0.0.1:20111；主控观察资源服务为 20120。本分支未连接服务。

| 固定 2025 GUI/VM | 已装 2021 Link | 结论 |
| --- | --- | --- |
| `/openblock/serialport` | 只注册 `/scratch/serialport` 与 `/scratch/ble`，未知路由 close | 已证实 URL 不匹配，不能全归为串口驱动或没有设备 |
| `config.library` | 从顶层 params.library 取库 | 改 URL 仍不足以保证上传兼容 |
| fqbn 可为按操作系统分支的对象 | uploader 直接把 config.fqbn 传 CLI | 需要 profile 归一化 |
| 支持 abortUpload | 旧 session 无对应分支 | 不具备相同取消语义 |
| Uno `arduinoUno.hex` | 安装里是 `arduinoUno.standardFirmata.ino.hex` | 文件名替换不能证明实时固件兼容 |

旧 aijite-link 0.2.0 源码虽更接近新协议，但工具不齐且实际 listen 为 0.0.0.0，不原样接管。统一 Web Serial socket adapter 应负责 discover 结果与 didDiscoverPeripheral 事件、未授权入口、零设备/异常退出，以及已连接与实时握手完成的区分；不继续让旧 20111 服务决定新会话状态。前端提案负责具体 VM 适配点。

## 9. 实施与验收交接

1. 依据已冻结 Hardware v0.2 开发五款主控、统一前端会话与独立 3002 本地 CLI 执行器。新增控制器和既有三款的归档兼容同时进入开发范围。
2. 后端登记可用工具、独立配置/工作目录、真实作业日志、失败与取消；先验证普通 ESP32 4MB，再独立验证 FireBeetle profile。只有实际编译通过后才记录为编译已验证；S3 依赖缺失明确展示，不阻塞当前普通 ESP32 验证。
3. 前端接入原生发现与统一串口会话、五主控/六模块、实际源码快照、编译→释放→上传→恢复流程。保持已验收 MenuBar 六按钮和保存状态。
4. 主控在已授权 COM3 实机上优先上传通用 ESP32 串口标识/回显测试程序，以唯一标识证明运行了本次构建，并核对普通收发和拔插恢复。首个测试不依赖尚未确认的板载 LED 或外接负载。FireBeetle profile 的实机兼容性单列结果，不将一次成功复制成五板硬件通过。
5. 测试区分：五主控注册/归档与模块回归、真实编译、串口/上传模拟、COM3 实机。覆盖错误源码、缺依赖、旧产物错配、占用、失败、取消及终端恢复失败。没有 Uno/S3/Aijite 实物就记录未实测。
6. 两个新增 ESP32 项按冻结范围先提供上传模式及普通串口；实时协议未验证，不执行或复制 Mind+ runtime，不将其固件作为已验证资源发布。未来实时能力须另有真实握手和指令执行证据，不能由“Mind+ 能发现 COM3”推定。

设计已按主控冻结契约收尾，无新增公共接口提案；后续开发按受控配置选择并实测上述工具/core 组合。**无需再在两种烧录路线间选择，也无需重新等待已给出的 COM3 测试覆盖授权。** 本分支本轮未安装工具、启动服务、实际编译、打开串口或写入 Flash；COM3 芯片/容量证据来自主控报告。
