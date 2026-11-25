# 上传反馈与 FireBeetle ESP32-E 本机配置设计

2026-11-23（Asia/Shanghai）。按主控派工完成只读核对，供主控冻结后实施。

建议分两处落地。前端保留执行器返回的具体失败原因，配置侧把 `firebeetle-esp32e-4mb` 绑定到独立安装的官方 ESP32 2.0.17 与准确的 ESP32-E FQBN。服务端利用现有 `ProfileBinding.fqbn` 即可完成绑定，再在 `loadHardwareConfig` 中补充默认本机配置读取。现有 Hardware v0.2 的请求、响应、错误码和作业流程可继续使用。

派工时 `.runtime/hardware/hardware.local.json` 只有 `esp32-4mb-dio`，使用官方 1.0.6。FireBeetle profile 缺少绑定时，`discoverProfiles` 已返回 `compileAvailable:false`、`uploadAvailable:false` 和 `reason:'No toolchain configured for this profile.'`。`HardwareController.start()` 会抛出这个原因，`nativeUpload()` 捕获后又将 `hardware.error` 覆盖为选择主控及端口的通用提示。截图中的 COM3 和当前主控可以同时有效，失败仍发生在工具链准备阶段。[本机配置](../../.runtime/hardware/hardware.local.json)、[能力发现](../../apps/api/src/hardware/toolchain.ts)、[前端校验](../../apps/web/src/hardware-controller.ts)、[原生上传入口](../../apps/web/src/native-hardware.ts)

前端应在校验失败后显示保留下来的具体原因，并沿用现有弹窗中的 FQBN、profile、端口及刷新入口。缺少主控、缺少匹配 profile、工具链不可用、端口未明确选择和服务离线分别沿各自实际状态提示。对本次情况可显示“FireBeetle ESP32-E 的本机工具链尚未配置”，并保留服务返回原因供查看。服务端对绕过界面直接提交的不可用 profile 已返回 `503 TOOLCHAIN_UNAVAILABLE`，消息取自该 profile 的 `reason`，无需增加诊断路由。[构建入口](../../apps/api/src/hardware/executor.ts)、[现有 HTTP 契约](../api-contract.md)

官方 Espressif Arduino core 2.0.17 的板型 ID 为 `dfrobot_firebeetle2_esp32e`，FQBN 为 `esp32:esp32:dfrobot_firebeetle2_esp32e`，其 `build.variant` 指向同名 variant。该板默认值为 ESP32、4 MB、DIO、40 MHz 和 default 分区。官方同时保留旧 `firebeetle32`，本机已安装的 1.0.6 只有这一旧板条目。配置应使用已核实的 ESP32-E ID。DFRobot 的 FireBeetle 2 ESP32-E 指南也使用 Espressif 官方索引安装并选择 ESP32-E。[Espressif 2.0.17 板型定义](https://raw.githubusercontent.com/espressif/arduino-esp32/2.0.17/boards.txt)、[DFRobot 安装指南](https://wiki.dfrobot.com/dfr0654/docs/23250)、[本机 1.0.6 板型](../../.runtime/hardware/arduino-esp32/data/packages/esp32/hardware/esp32/1.0.6/boards.txt)

官方 ESP32-E variant 定义了 D2→GPIO25、D9→GPIO2、A0→GPIO36 等引脚，对应当前外部 `board-info.ts` 的显示映射。其余积木参数继续按已有代码值生成。此核对证明板型和引脚描述一致，实际编译和串口上传仍须分别取得作业证据。[官方 ESP32-E 引脚](https://raw.githubusercontent.com/espressif/arduino-esp32/2.0.17/variants/dfrobot_firebeetle2_esp32e/pins_arduino.h)、[CFZN 引脚映射](../../apps/web/src/extensions/board-info.ts)

主控已安排将 2.0.17 独立安装在 `.runtime/hardware/arduino-esp32e`。安装完成后，下列片段可合并到现有 `hardware.local.json` 的相应对象中，保留原有通用 ESP32 绑定、运行目录和来源配置。片段中的 CLI 路径取自当前本机配置。

```json
{
  "toolchains": {
    "esp32e-local": {
      "cliPath": "D:/CFZN/D-Coding/D-Coding/Aijite/tools/Arduino/arduino-cli.exe",
      "sourceDataDir": "D:/CFZN/CFZN-IDE/.runtime/hardware/arduino-esp32e/data",
      "packages": ["esp32"]
    }
  },
  "profiles": {
    "firebeetle-esp32e-4mb": {
      "toolchain": "esp32e-local",
      "coreVersion": "2.0.17",
      "fqbn": "esp32:esp32:dfrobot_firebeetle2_esp32e"
    }
  }
}
```

使用独立 `esp32e-local` 名称也符合当前工具准备流程。运行时路径由 toolchain ID 的摘要派生，包工具目录经 junction 指向对应安装源，复用已有 ID 却改成另一安装根会被 `linkDirectory` 检出目标不一致。保持 `esp32-local` 指向原 1.0.6，让两个版本各用自己的包、工具和生成配置。[工具目录准备与校验](../../apps/api/src/hardware/toolchain.ts)

现有默认 FQBN 为 `mindplus:esp32:fireBeetleEsp32E`，本地配置的 `fqbn` 覆盖会贯穿 capabilities、板型发现、编译、上传和工具身份。官方配置接入时可沿用此机制。执行器先检查精确 core 目录中的 `boards.txt`，再使用 CLI `board details` 验证 FQBN，并为已准备的 profile 记录工具身份。下游 job 的 `result.json` 包含 coreVersion 和 FQBN，可用于核验实际目标。capabilities 的可用只表示依赖验证已完成，实际结果由作业返回。[profile 定义与覆盖](../../apps/api/src/hardware/config.ts)、[能力发现](../../apps/api/src/hardware/toolchain.ts)、[作业执行与结果](../../apps/api/src/hardware/executor.ts)

`D:/Mind+/Arduino/hardware/dfrobot/mpython/boards.txt` 也有 `fireBeetleEsp32E`。其 `platform.txt` 引用 `../../tools/mpython`，实际工具位于 `D:/Mind+/Arduino/hardware/tools/mpython`。本次静态检查确认 `esptool.exe` 和 `xtensa-esp32-elf/bin/xtensa-esp32-elf-g++.exe` 存在。该桌面布局与执行器要求的 `sourceDataDir/packages/<vendor>/hardware/<arch>/<version>` 布局不同，接入它还需处理包布局和依赖。主控正在准备的官方 2.0.17 已提供明确板型，本方案按该路径收敛。[本地板型](D:/Mind+/Arduino/hardware/dfrobot/mpython/boards.txt)、[本地平台](D:/Mind+/Arduino/hardware/dfrobot/mpython/platform.txt)

`loadHardwareConfig` 的最小读取规则如下。默认文件路径通过当前模块位置定位到仓库 `.runtime/hardware/hardware.local.json`，使 `src/hardware/config.ts` 和 `dist/hardware/config.js` 都能得到同一仓库位置。路径定位与启动时的工作目录无关。

| 条件 | 读取及失败行为 |
| --- | --- |
| 显式提供有效 `HARDWARE_CONFIG` 路径 | 读取该文件，沿用当前相对/绝对路径解释。文件不存在、读失败或内容无效均报明确错误，指出所选配置文件。 |
| 未提供 `HARDWARE_CONFIG`，项目本机文件存在 | 读取项目固定 `.runtime/hardware/hardware.local.json`，解析为配置对象，应用现有字段校验。 |
| 未提供 `HARDWARE_CONFIG`，读取默认文件得到 `ENOENT` | 使用空配置，继续启动并通过 capabilities 报告五个 profile 的实际不可用原因。 |
| 默认文件权限、目录类型、JSON 或配置字段错误 | 启动明确失败并指出配置来源，保留文件供修正。只将默认文件不存在视为零配置部署。 |
| 读取任一配置成功 | `HARDWARE_RUNTIME_DIR` 与 `HARDWARE_ALLOWED_ORIGINS` 继续按当前优先级覆盖对应字段。`HARDWARE_RUNTIME_DIR` 用于生成物位置，默认配置文件的查找仍固定在项目本机位置。 |

读取采用一次 `readFile` 并根据实际错误处理，可避免“先检查存在、再读取”的时序差异。可为内部 `loadHardwareConfig(env = process.env, defaultConfigPath = 项目固定路径)` 增加第二个可选参数，用于测试传入临时默认路径，生产调用沿用默认值。显式环境路径始终优先于该默认参数。JSON 顶层应为配置对象，格式正确却为 `null`、数组或字符串也要明确拒绝。空对象仍代表合法的零配置。执行器在启动阶段完成能力发现，目前配置生效需由主控在现有作业结束后安排重启该执行器，浏览器再刷新能力。默认读取使之后普通 `npm run hardware` 可复用已保存的本机设置。[配置加载](../../apps/api/src/hardware/config.ts)、[服务启动入口](../../apps/api/src/hardware-main.ts)、[执行器初始化](../../apps/api/src/hardware/executor.ts)

开发还需同步更新 `apps/api/HARDWARE.md` 中 `HARDWARE_CONFIG` 的默认读取说明。配置路径与绝对工具路径继续放在已有忽略的 `.runtime/`，本机配置内容由主控管理。[现有运行说明](../../apps/api/HARDWARE.md)、[仓库忽略规则](../../.gitignore)

聚焦验收建议如下。

| 场景 | 验收结果 |
| --- | --- |
| 配置选择 | 显式文件优先于默认文件，显式不存在或损坏均失败。默认存在可读取，默认缺失维持零配置行为。默认权限/JSON/字段错误可读，不能静默变成空配置。 |
| 路径与环境 | 从仓库根和 `apps/api` 启动定位相同默认文件。运行目录及来源环境覆盖正常。源码测试和最终编译入口采用同一规则。 |
| 能力与原因 | FireBeetle 未配置或精确板型未安装时返回 false/false 和具体 reason。前端有板、有 COM3 时仍展示该原因，纯预检查失败没有新建 job。直接不可用构建请求返回既有 503。 |
| 精确目标 | 2.0.17 安装完整后，CLI `board details` 及 capabilities 显示精确 ESP32-E FQBN。通过现有 API 做无实体端口的构建，核对 job、产物和 `result.json` 中 core/FQBN。通用 ESP32 仍走原 1.0.6。 |
| 隔离测试 | 现有“unconfigured deployment”测试会调用 `loadHardwareConfig({HARDWARE_RUNTIME_DIR: temp})`，新增默认读取后会命中真实本机文件。该 HTTP 用例应通过可选默认路径传入临时目录中的不存在文件，或使用显式临时空配置。默认存在和缺失均通过临时路径验证，避免测试调用本机工具链。 |
| 后续上传 | 实际上传由主控协调实体端口。须核对成功构建、串口释放/占用、真实上传完成和失败日志，能力发现或通用 ESP32 构建均不能代替本板上传证据。 |

本轮仅新增本提案。官方 2.0.17 的板型和 variant 为静态源码核对，安装由主控进行；本会话未执行安装、配置写入、服务重启、CLI 构建或串口操作。派工时通用 ESP32 作业 `dc502271-b80b-4428-a8eb-c1039bf8156a` 正在运行，其后续状态由主控跟踪。
