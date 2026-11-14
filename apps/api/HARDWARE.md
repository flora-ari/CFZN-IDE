# 本地硬件执行器 v0.2

执行器单独绑定 `127.0.0.1:3002`，基础地址 `http://127.0.0.1:3002/api/v1/hardware`。项目 API 仍在 3001，归档、revision/ETag 和项目数据目录不变。执行器不提供串口终端、WebSocket 或浏览器烧录器，不依赖旧 Link 协议，也不修改 OpenBlock VM。

## 配置与启动

在 `apps/api` 运行。已有依赖时无需重新安装；复制部署可先执行 `npm ci`。

```powershell
# 先复制示例到自己的配置文件，并修改工具路径、core 版本与 runtimeDir。
$env:HARDWARE_CONFIG = 'F:/CFZN/CFZN-IDE/apps/api/hardware.config.example.json'
$env:HARDWARE_RUNTIME_DIR = 'F:/CFZN/CFZN-IDE/.runtime/hardware'
$env:HARDWARE_PORT = '3002'
npm run hardware
```

`npm run hardware` 先构建再启动；已有 `dist/` 时可用 `npm run start:hardware`，实际入口为 `dist/hardware-main.js`。这些命令不启动或停止 3001/5173，不包含硬件上传操作。Node 不自动读取 `.env`，应使用进程环境变量或自己的启动器注入。

| 环境变量 | 用途 |
| --- | --- |
| `HARDWARE_CONFIG` | 运维方提供的 JSON 配置绝对/相对文件路径；未提供时服务仍启动，五个 profile 均报告不可用 |
| `HARDWARE_RUNTIME_DIR` | 覆盖 JSON 的 `runtimeDir`，默认仓库 `.runtime/hardware`；所有生成配置、用户目录、缓存、源码、产物与证据在此处 |
| `HARDWARE_PORT` | 本机端口，默认 3002；始终绑定 127.0.0.1 |
| `HARDWARE_ALLOWED_ORIGINS` | 逗号分隔的精确产品 origin，覆盖 JSON 的 `allowedOrigins`；默认允许 localhost/127.0.0.1:5173 |

示例包含本次机器的**显式安装路径**，不是所有用户通用的默认值。换机器时需要准备可用 Arduino CLI 和匹配 core/tool，然后修改 JSON：

- `toolchains.<id>.cliPath`：CLI 可执行文件的绝对路径。
- `sourceDataDir`：已安装 Arduino data 根，含 `packages/<vendor>/hardware/<architecture>/<version>` 和工具、索引。
- `packages`：允许只读复用的 vendor 名称列表。
- `builtinToolsDir`：可选，另一套已安装的 `packages/builtin` 目录；示例使用新版 CLI 配套的发现工具，解决旧 core 数据根缺少 mdns-discovery 的问题。
- `profiles.<profileId>.toolchain/coreVersion`：固定 profile 对应的工具链和已安装 core 版本。可由运维指定 `fqbn` 覆盖默认值、`libraries` 指定可信库根绝对路径列表；HTTP 不接受这些配置。

启动时复制索引和 builtin 工具到 runtime，core 和 vendor 工具目录通过只读使用的目录链接引用安装文件。所有 CLI config/data/user/downloads/cache/tmp 路径都指向 runtime；不调用 core/lib install、update 或用户软件的 config set。不要把 runtimeDir 设置为 Mind+/OpenBlock 安装目录或项目存储目录。旧 Windows GCC 在展开较长的 `../lib/...` 头文件路径时会失败，工具布局使用短目录 `.runtime/hardware/t/<hash>`；部署时也应选择较短的 runtime 路径。

CLI/core 来源、再分发授权及安装由部署者负责；本仓库示例只引用现有安装，不打包 Mind+ 运行时、固件或商业扩展。该安装中的 CLI 自报修改版 `git-snapshot`，不可标为官方发布版本。参数依据本机 CLI `--help` 实测，同时参照 [Arduino compile](https://docs.arduino.cc/arduino-cli/commands-reference/arduino-cli_compile/)、[upload](https://docs.arduino.cc/arduino-cli/commands-reference/arduino-cli_upload/) 和 [配置目录说明](https://docs.arduino.cc/arduino-cli/configuration/)。

## 五款 profile

| profileId / deviceId | 默认 FQBN / 本机 core | 本轮证据 |
| --- | --- | --- |
| `uno-avr` / `arduinoUno` | `arduino:avr:uno` / 1.8.3 | 依赖与 board details 校验可用；未持有实物 |
| `esp32s3-default` / `arduinoEsp32S3` | `esp32:esp32:esp32s3` | 本机无匹配 core，compile/upload unavailable |
| `aijite-esp32s3-default` / `aijiteESP32S3` | `esp32:esp32:esp32s3` | 本机无匹配 core，compile/upload unavailable；不套用普通 ESP32 |
| `esp32-4mb-dio` / `arduinoEsp32` | `esp32:esp32:esp32:FlashMode=dio,FlashFreq=40,FlashSize=4M,PartitionScheme=default,UploadSpeed=115200` / 1.0.6 | 串口标识/回显 sketch 真实编译通过，未由后端分支操作实物 |
| `firebeetle-esp32e-4mb` / `firebeetleEsp32E` | `mindplus:esp32:fireBeetleEsp32E` / 0.0.2 | 独立真实编译通过；core 默认 DIO/4MB/80MHz，不表示实物已鉴定为 DFR0654 |

`compileAvailable/uploadAvailable` 表示配置、CLI、core 和 board details 检查可用；每次实际作业仍以真实进程退出、产物/上传验证结果为准，不保证所有生成器及第三方库都兼容。所有 `realtimeAvailable` 当前均为 false：未验证兼容实时固件/协议，连接时不自动刷入任何固件。

六个受控 moduleIds：`activateBuzzer`、`atomizer`、`pirSensor`、`flameSensor`、`raindropSensor`、`moreComments`。这些模块当前只生成基本 Arduino 调用，不需要额外库；构建仍使用页面提交的当前源码。需要 Servo 等外部库时运维在 profile 配置中明确提供，并记录版本，不接收网页任意库路径。

## HTTP 与任务行为

精确 wire schema 以 `docs/api-contract.md` 顶部 Hardware v0.2 为准。实现包含 `GET capabilities/ports`、`POST builds/uploads`、`GET jobs/:id?afterLog=0`、`POST jobs/:id/cancel`。POST 只接受 JSON，工具路径、FQBN、CLI flags、产物路径均不属于页面输入。产品 origin 必须精确登记；没有 Origin 的本地脚本也可调用。

构建传 `{deviceId,profileId,code,moduleIds?}`；上传只传 `{buildId,portId}`。`buildId` 是同一执行器会话中成功 build job 的 ID；重启不从磁盘恢复旧 buildId，需重新构建。网页应以 capabilities 为 profile 来源，以 `/ports` 为本机 OS 端口来源，用户明确选择；禁止推断浏览器 Web Serial 句柄等同 COM3。`GET ports` 仅查询 Windows CIM/Linux/macOS 设备列表，不打开端口或查询固件。后端分支的真实编译脚本不调用 ports/upload。

每个执行器同时只有一个 build/upload；第二项返回 409 HARDWARE_BUSY。源码最多 1 MiB UTF-8；构建最长 10 分钟，上传 3 分钟。CLI 以 `spawn(executable, argv, {shell:false})` 调用；板包自身固定 recipe 可启动其工具。取消和超时只终止该次拥有的 PID 进程树（Windows taskkill /PID /T /F；POSIX 进程组）；实际关闭前保持 cancelling/占用，绝不取消用户已有 Mind+/Link/Vite/API。

构建成功须退出 0 且 ELF、应用 BIN/AVR HEX 和 ESP32 分区 BIN 实际存在、非空，随后记录大小/SHA256。上传重验本 build 的产物与 CLI/core/profile 身份，使用匹配的 CLI upload recipe（含 bootloader/分区等），加 `--verify`；须退出 0 且存在 esptool/avrdude 验证诊断才报告 succeeded。占用、拔线和编译失败保留实际工具输出，不能以进度百分比代替结果。源码/设备变化时，前端负责要求重新编译；后端不会接受任意二进制文件路径。

浏览器须先释放 reader/writer/port 再调用 uploads，并在后端终态前阻止重新打开；这是前端单会话职责。后端不信任“已释放”就一定无占用，系统占用仍由真实 uploader 报错。成功上传不等于程序行为或实时协议已验证，后续由主控独占实物进行复位、标识回读和回显验证。

日志每 job 最多约 1 MiB，超出时明确提示截断，index/nextLog 单调递增。内存最多保留约 20 个终态任务；旧上传关联的 build 不会在引用仍存时删除。终态写入 `runtime/jobs/<id>/result.json`，含日志、工具版本/core/FQBN/身份及产物 SHA256；源码和产物也在同目录，用于本机诊断，不写入项目 API。重启后这些文件仅作证据，不恢复作业。停止执行器后可手动清理其 runtime 目录；不要在服务运行中删除或修改产物。

## 验证命令

```powershell
npm run typecheck
npm test
# 显式配置工具后，真实编译 ESP32/FireBeetle 和一个预期失败的源码。
# 使用随机 HTTP 端口；不调用 /ports、/uploads，也不接触实物。
npm run verify:hardware
```

`npm test` 含既有项目归档 HTTP 回归及硬件 executor 测试；硬件 HTTP 中的产物和上传回执为明确测试替身，另有真正 Node 子进程/子孙进程取消、超时和 argv 字面量测试。`verify:hardware` 才调用实际 CLI，证据为 runtime 的 `verification-summary.json` 与各 job 的 `result.json`。可在命令后传入 profileId 列表选择真实编译项。
