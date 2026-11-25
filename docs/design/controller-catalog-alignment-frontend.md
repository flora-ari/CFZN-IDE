# 主控目录与自定义模块支持范围对齐

2026-11-20（Asia/Shanghai）。本提案依据当前未提交工作区源码及固定 GUI 产物，已按主控当日冻结的“主控目录与模块支持范围”附录收敛。目标是主控页使用完整目录、取消二级分类，并让工厂的支持主控勾选项与该目录逐项一致。源码定位描述设计核对时的实现，后续开发以冻结契约为准。

## 当前来源和缺项

原生 GUI 的 `deviceData` 有 22 项。排除 `deviceId:'null'` 的取消命令，以及三个 `hide:true` 父设备后，剩 18 项。CFZN 的 `installDeviceMetadata` 在同一个数组追加爱集特 ESP32-S3 和 FireBeetle ESP32-E，形成实际 20 项可见目录。固定 GUI 的 `makeDeviceLibrary()` 无外部列表时返回此数组。现有 adapter 将 `getDeviceList` 设为返回 undefined，GUI 经原有更新动作把目录写入 Redux `deviceData`。两个 Library 的渲染挂点都把各自的 `nativeProps.deviceData` 传入同一渲染器。 [原生目录](../../.runtime/web-openblock/openblock-vendor/openblock-gui.js#L81875) · [makeDeviceLibrary](../../.runtime/web-openblock/openblock-vendor/openblock-gui.js#L82478) · [原生目录更新](../../.runtime/web-openblock/openblock-vendor/openblock-gui.js#L345438) · [派生元数据](../../apps/web/src/extensions/aijite.ts#L20) · [两个 GUI 入口](../../apps/web/scripts/openblock-hooks.mjs#L352) · [adapter](../../apps/web/src/extensions/adapter.ts#L327)

当前代码中没有名为 `listLibraryTypes` 的函数。对应职责位于 `library.ts` 的 `typeOf/available/selectedType` 和类型按钮生成逻辑。`complete` 已包含完整可见目录，但 `controllerTypes` 只给原有五板标注 board，因此“全部”有 20 项，“主控板”仅有 5 项，差集为 15 项。用户所说的合并可通过直接使用 `complete`、移除主控分区的类型筛选与类型行实现。 [列表投影与类型过滤](../../apps/web/src/extensions/library.ts#L120) · [类型行](../../apps/web/src/extensions/library.ts#L199) · [五板类型来源](../../apps/web/src/extensions/catalog.ts#L37)

工厂存在四个五板限制，需要同步修正。只改变勾选项会在保存或重读时失败。

| 位置 | 当前限制及影响 |
| --- | --- |
| 支持主控控件 | `controllerIds.map` 渲染五项，工厂拿到的 `deviceName` 已来自原生目录，但没有接收完整目录行。 [控件](../../apps/web/src/extensions/custom-module-factory-editor.ts#L138) · [工厂传参](../../apps/web/src/extensions/library.ts#L210) |
| 新草稿默认值 | 仅在当前板属于五板时默认勾选，当前板为 Nano 等原生板时得到空数组。 [newDefinition](../../apps/web/src/extensions/custom-module-factory.ts#L40) |
| 前端 schema | `validateCustomModuleDefinition` 只接受五板。列表和按 ID 读取都会经 `parseCustomModuleRecord` 再次校验，因此影响历史版本读取、私有目录及作品引用恢复。 [校验](../../apps/web/src/extensions/custom-module-definition.ts#L142) · [请求与反序列化](../../apps/web/src/extensions/custom-modules-api.ts#L27) |
| 后端 schema | `definition.ts` 从硬件 `PROFILES` 提取五个 deviceId 作为支持列表。声明支持范围与编译 profile 需要各用自己的可信集合。 [服务端校验集合](../../apps/api/src/custom-modules/definition.ts#L3) |

## 20 项实际目录

以下按原生运行目录顺序列出，派生板位于末尾。名称取原生元数据。表中模式和语言都是目录声明。当前 20 项均有 upload 标记，其中 Uno、Nano、Mega 2560 另有 realtime 标记。当前没有可见的独立 Python 或通用 microPython 类型设备。

| 序号 | ID | 名称 | 原生类型及语言 | 模式 |
| --- | --- | --- | --- | --- |
| 1 | arduinoUno | Arduino Uno | arduino，C/C++ | realtime、upload |
| 2 | arduinoNano | Arduino Nano | arduino，C/C++ | realtime、upload |
| 3 | arduinoLeonardo | Arduino Leonardo | arduino，C/C++ | upload |
| 4 | arduinoMega2560 | Arduino Mega 2560 | arduino，C/C++ | realtime、upload |
| 5 | arduinoUnoR4Minima | Arduino Uno R4 Minima | arduino，C/C++ | upload |
| 6 | arduinoUnoR4Wifi | Arduino Uno R4 WiFi | arduino，C/C++ | upload |
| 7 | arduinoEsp32 | ESP32 | arduino，C/C++ | upload |
| 8 | arduinoEsp32S3 | ESP32-S3 | arduino，C/C++ | upload |
| 9 | arduinoEsp8266NodeMCU | NodeMCU | arduino，C/C++ | upload |
| 10 | arduinoK210MaixDock | MaixDock | arduino，C/C++ | upload |
| 11 | arduinoK210Maixduino | Maixduino | arduino，C/C++ | upload |
| 12 | arduinoRaspberryPiPico | Raspberry Pi Pico | arduino，C/C++ | upload |
| 13 | arduinoRaspberryPiPicoW | Raspberry Pi Pico W | arduino，C/C++ | upload |
| 14 | arduinoRaspberryPiPico2 | Raspberry Pi Pico 2 | arduino，C/C++ | upload |
| 15 | arduinoRaspberryPiPico2W | Raspberry Pi Pico 2 W | arduino，C/C++ | upload |
| 16 | microbit | Micro:bit | microbit，MicroPython | upload |
| 17 | microbitV2 | Micro:bit V2 | microbit，MicroPython | upload |
| 18 | makeyMakey | Makey Makey | arduino，C/C++ | upload |
| 19 | aijiteESP32S3 | Aijite ESP32-S3 | arduino，C/C++ | upload |
| 20 | firebeetleEsp32E | FireBeetle ESP32-E | arduino，C/C++ | upload |

排除项为 `null`、`arduinoUnoUltra`、`arduinoSE`、`arduinoEsp8266`。后面三个是原生隐藏父类，已有作品恢复仍可能经过它们，保留在原始注册目录。可见 NodeMCU 使用 `arduinoEsp8266NodeMCU`。列表中板卡语言还包含 block，本表仅列文本生成语言。统计由 TypeScript 语法树解析固定 GUI 的目录字面量并对照两条派生追加逻辑得出。 [隐藏项](../../.runtime/web-openblock/openblock-vendor/openblock-gui.js#L82428) · [派生项](../../apps/web/src/extensions/aijite.ts#L23)

## 主控页与工厂共用可见目录

1. 在前端提供一个针对原生元数据行的可见投影，排除 JS null/undefined、字符串 'null' 取消命令及 `hide:true`。以规范 deviceId 作为身份，沿原目录保留名称、图标、说明、disabled、类型、模式与顺序。两个主控入口和工厂勾选区都使用这份投影。当前结果恰好 20 项，验收按有序 ID 比较。原有 disabled 信息继续传给控件，当前目录均为 false。
2. 主控分区不生成二级分类控件，类型判断恒等于完整目录。旧内存中残留 `controllers.type='board'` 时也必须得到完整目录。可以删除只服务主控类型的 `controllerTypes` 或其导入。模块类型仍由完整模块目录生成。主控关键词、已加载和“仅当前模式”在完整主控目录上继续按当前规则取交集，“仅当前模式”默认关闭。两处入口使用相同条件时逐项一致。
3. `cfznResetKey` 在主控分区只依据分区身份，移除已废弃的主控类型值。清除筛选及移除卡片后的焦点回退要覆盖没有 `data-library-type="all"` 的情况，使用现有已加载控件、主分类按钮或原生搜索框等存活目标。切入主控页和工厂勾选不会提交作品编辑。
4. `library.ts` 将上述完整的可见 controller rows 传给 Factory，再传给 Editor。支持主控勾选区始终按完整目录生成，独立于主控页当时的关键词、已加载和模式筛选。新草稿默认勾选当前可见主控，包括 Nano、Micro:bit 等。无主控时保持显式选择。编辑旧定义按原 `supportDevice` 勾选，正常确认时只更新用户修改的 ID。
5. 勾选区、详情支持板文字和预览主控选择器共用元数据的名称解析，保留当前 locale。ID 校验集合和本地化显示各有来源，避免另写第二组板名。预览板选择保持既有优先级，用户选定项优先，其次当前板，再取当前支持列表首项。

## 双端可信 ID 与部署

主控已经创建并冻结 `apps/api/src/common/controller-catalog.json`，包含按原生顺序列出的完整 20 ID，逐项与上表一致。它用于固定可信身份验证，名称和显示顺序由前端当前原生目录提供。API schema 与前端 schema 引用同一个文件，取代前端 `controllerIds` 和后端 `PROFILES` 在定义校验中的五板用途。前端可见投影保留原生完整目录，聚焦测试校验其 ID 集与 JSON 完全一致，目录升级时能够及时发现漂移。 [共用可信清单](../../apps/api/src/common/controller-catalog.json) · [主控冻结契约](../api-contract.md#主控目录与模块支持范围2026-11-20)

此放置方式贴合 API 现有 `rootDir:src → outDir:dist`。主控已在两侧 TypeScript 配置启用 `resolveJsonModule`，API 普通 JSON import 随 tsc 输出到 dist 的 common 目录，前端经 Vite 打入页面资源。前端测试当前使用 Node 的 `--experimental-strip-types`，直接 JSON import 要兼容 Node 的 `with { type: 'json' }`，同时验证 Vite 开发、生产与 TypeScript 的解析。后端按现有 Node16/CommonJS 编译。交付检查 dist 内 JSON 随包存在，以及独立启动 API 时的读取路径。

schema 继续校验非空、唯一、字符串和可信 ID，保留 `schemaVersion:1` 及完整 `supportDevice` 字符串数组。未知 ID、隐藏父类和取消命令拒绝，新可见板的定义通过 POST、目录读取及 GET 按 ID 一致验证。已有五板版本直接按原定义读取。前端对原有项目拼写别名仍经过既有归一化，保存新定义使用目录中的规范 ID。主控已派两侧开发接入共用清单。 [API 配置](../../apps/api/tsconfig.json) · [前端配置](../../apps/web/tsconfig.json) · [前端测试入口](../../apps/web/package.json#L17)

原有 `controllerIds` 五板集合继续服务六个内置模块支持矩阵和固定描述准备边界。`deviceReady` 只对这五板查现有缓存并等待引脚菜单匹配，换板的 `boardDescription` 也有相同条件。完整 schema 目录另有独立来源，避免 Nano 等新板因缺少描述缓存而等待超时。 [内置模块矩阵](../../apps/web/src/extensions/catalog.ts#L32) · [就绪检查](../../apps/web/src/extensions/adapter.ts#L244) · [换板描述](../../apps/web/src/extensions/adapter.ts#L299)

## 引脚、语言与实际能力

当前准备脚本只读取 Uno、普通 ESP32 和 ESP32-S3 的描述，运行时增加两个派生描述，共五板。完整选择目录扩为 20 项后，Nano 等新板在工厂中可能没有这三个引脚接口的静态预览候选。普通文本、数字、布尔、自定义下拉仍可预览和保存。带引脚参数时继续展示“预览缺少可用引脚，请选择或检查主控”，绘制无候选状态，生成示例返回缺少引脚提示。实际添加到作品后沿 `currentPinOptions` 读取当前板的真实菜单，缺失或字段值不属于候选时给出可读错误。换板涉及自定义引脚时沿现有守卫拒绝无法证明可用的目标，保留原作品。静态描述扩充可后续独立设计。 [描述准备](../../apps/web/scripts/prepare-device-descriptions.mjs#L27) · [预览候选](../../apps/web/src/extensions/custom-module-factory-preview.ts#L23) · [预览缺失提示](../../apps/web/src/extensions/custom-module-factory-editor.ts#L114) · [实际生成检查](../../apps/web/src/extensions/custom-module-runtime.ts#L35)

完整目录有 18 项 arduino、2 项 microbit。原生 GUI 将 microbit 类型映射为 Python 生成语言，CFZN 私有模块当前仅向 `Blockly.Arduino` 注册 C++ 模板。严格对齐可通过让全部 20 项均可勾选并保存作者的支持声明实现。建议在 Micro:bit 两项旁显示 MicroPython 类型及当前工厂使用 Arduino C++ 的说明，在保存、详情和重读时完整保留这两项 ID。 [原生语言映射](../../.runtime/web-openblock/openblock-vendor/openblock-gui.js#L50513) · [当前私有模块生成器](../../apps/web/src/extensions/custom-module-runtime.ts#L76)

主控冻结的本轮边界是完整目录及声明存储对齐，语言和生成器沿各自既有实现。Micro:bit 两项的新增验收以选择、保存、重读和创建新版本为准。作者勾选支持的含义应按“支持声明”说明，工厂保留当前 Arduino C++ 模板的用途提示。后续若要求在这两板实际生成自定义 MicroPython，需为其定义生成模板和兼容判据。当前代码向 `Blockly.Arduino` 注册生成器的事实及 Micro:bit 原生 Python 路径应记录在验收范围内，避免将勾选保存作为新增语言实现的证明。

18 项 Arduino 类型可复用当前受信块构造和 Arduino 模板生成路径。新增板能保存私有定义，不要求具备本机编译 profile。已有硬件 `DeviceId` 与 `PROFILES` 只包含 Uno、ESP32、ESP32-S3、爱集特 ESP32-S3、FireBeetle ESP32-E 五项，编译入口仍以服务实际能力为准。主控目录模式标签、作者支持声明、引脚候选、生成语言及本机工具可用性均按各自真实来源判断。 [硬件类型](../../apps/api/src/hardware/types.ts#L1) · [五个编译 profile](../../apps/api/src/hardware/config.ts#L19) · [编译参数校验](../../apps/api/src/hardware/executor.ts#L70)

## 聚焦验收建议

1. 在真实 dev 和静态 dist 通过底部扩展、顶栏主控两个入口逐项核对 20 个 ID、名称、顺序和关键元数据，确认没有主控二级类型行。先前选过主控板类型的视图也能恢复完整目录。无板、有板、模式切换、关键词与已加载筛选继续可操作，清除后恢复 20 项默认目录。
2. 工厂支持主控逐项等于同一完整目录，页面主控关键词与“仅当前模式”不会缩减工厂勾选项。当前主控是 Nano 时新草稿默认勾选 Nano。编辑已有五板版本保留原选择，读写未知 ID、隐藏项和取消项均拒绝。
3. 使用 Nano 创建带普通参数的私有模块，真实 POST 成功，GET/目录重读及新页面工厂编辑保留支持列表和字段。选择 Nano 后加载、拖出普通自定义积木并检查参数敏感 Arduino 代码，确认 `deviceReady` 沿已有非五板路径完成。编译按钮按当前真实 profile 能力反馈。
4. 带 Nano 引脚参数时验证预览缺失反馈，实际工具箱从当前主控菜单读取，缺失时保留明确错误。兼容换板、未知目标菜单拒绝及已有五板真实引脚范围各做一次聚焦检查。保存和筛选均不伪造 pin 0。
5. 在 Micro:bit、Micro:bit V2 勾选并保存声明，重读和创建新版本保持 ID，普通块预览可用。同时核对 IDE 原有 Micro:bit 选择与原生积木，记录其原生生成语言及当前工厂 C++ 模板的能力范围。
6. 两端类型检查、构建和必要校验测试验证单一 20 ID 清单及 JSON 打包。后端只带 dist 启动可读新板定义。核对五板硬件 profile 和六个内置模块支持矩阵，VM/Blockly 固定上游字节检查按既有工具执行。本设计阶段未启动产品服务、运行浏览器或进行实体硬件测试。
