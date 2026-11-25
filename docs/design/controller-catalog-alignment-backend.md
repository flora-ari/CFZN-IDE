# 主控目录与私有模块支持范围对齐设计

2026-11-20（Asia/Shanghai）。后端设计核对已按主控冻结的“主控目录与模块支持范围”附录收敛。[统一契约](../api-contract.md)

本轮扩大私有模块 `supportDevice` 的可信 ID 集合。主控已创建前后端共用的 `apps/api/src/common/controller-catalog.json`，覆盖 IDE 已注册的完整可见目录，工厂的显示名称和顺序继续取运行时同一目录。主控页将完整目录直接作为候选集，撤去“全部”“主控板”类型控件及对应过滤条件。现有私有模块接口可承载完整 ID 数组，数据模型仍使用 `schemaVersion: 1`。[共用 ID 清单](../../apps/api/src/common/controller-catalog.json)

派工时后端从硬件 `PROFILES` 派生五板集合，工厂选项、前端定义校验及新模块默认主控也使用五板 `controllerIds`。IDE 主控库实际取 `nativeProps.deviceData`，经空 ID、`'null'` 和 `hide:true` 过滤后有 20 项。前端的 `parseCustomModuleRecord` 会再次校验 `supportDevice`，因此扩大后端接受范围时，工厂与前端读取必须一起更新，否则已保存的新板模块会使目录解析失败。[后端定义校验](../../apps/api/src/custom-modules/definition.ts)、[硬件配置](../../apps/api/src/hardware/config.ts)、[目录过滤](../../apps/web/src/extensions/library.ts)、[前端定义校验](../../apps/web/src/extensions/custom-module-definition.ts)、[工厂选项](../../apps/web/src/extensions/custom-module-factory-editor.ts)、[新模块初值](../../apps/web/src/extensions/custom-module-factory.ts)、[API 响应解析](../../apps/web/src/extensions/custom-modules-api.ts)

当前准备产物中的原生 `deviceData` 有 18 个可见主控，外部 `installDeviceMetadata` 增补 Aijite ESP32-S3 和 FireBeetle ESP32-E。原生 `arduinoUnoUltra`、`arduinoSE`、`arduinoEsp8266` 为 `hide:true`，另有 `'null'` 取消项。这些隐藏项与取消项均排除在新 `supportDevice` 集合之外。当前 20 个可见条目均为 `disabled:false`。未来原生禁用项应继续呈现其真实禁用状态，主控可选集合的变动通过同一目录校验发布。[当前 GUI 准备产物](../../.runtime/web-openblock/openblock-vendor/openblock-gui.js)、[外部设备元数据](../../apps/web/src/extensions/aijite.ts)、[既有真实目录证据](../../tests/evidence/controller-catalog-consistency/2026-11-11T08-10-52-878Z/dev-catalog-metadata.json)

实现按主控冻结方案接入，目录与发布核对如下。

| 项目 | 接入与核对 |
| --- | --- |
| 共用数据位置 | 已定文件为 `apps/api/src/common/controller-catalog.json`，内容为有序字符串数组。服务端与前端定义校验均直接导入同一 JSON，提取成员集合。工厂展示数据取运行时主控 rows。 |
| 发布路径 | 主控已为两端开启 `resolveJsonModule`。JSON 位于 API 的 `rootDir: src` 内，由 TypeScript 随导入编译到 `dist/common/`，服务启动可从发布目录读到。前端从同一源文件静态导入，并由 Vite 打包。核对现有 Node 直接运行前端测试时的 JSON 导入属性，以及 Vite dev 对跨应用静态导入的访问。 |
| 展示来源 | 顶部主控库、扩展库主控页和工厂支持主控选项共同使用注册后完整可见 rows，按原目录顺序显示名称及可用状态。工厂选项由库入口传入 rows，使用已有本地化名称解析。搜索、“仅当前模式”和“已加载”等临时展示筛选不裁剪工厂的选项来源。 |
| 防止漂移 | 将注册后的可见目录有序 ID 与共用 JSON 逐项比对，检查重复、缺项、多项及顺序，用真实 dev/dist 入口核对名称和顺序。目录变动时显式更新注册与共用数据并一同发布，前后端校验持续读取同一个 ID 文件。 |
| 校验规则 | `supportDevice` 为非空字符串数组，每个值须精确属于共用数据，元素唯一。保持当前 `400 VALIDATION_ERROR`、`details.field = 'definition.supportDevice'`。POST 的合法 ID 选择来自服务发布数据，客户端请求不能提交或扩写允许列表。 |
| 读取规则 | `POST`、目录 `GET` 和详情 `GET` 返回原有结构，原顺序保存并读取模块声明的 `supportDevice` 子集。前端解析使用同一完整允许集合。工厂根据当前可选主控初始化默认勾选，当前没有主控时沿用空草稿，确认保存仍要求选择至少一个。 |

当前后端 `tsconfig.json` 的 `rootDir` 为 `src`，共用 JSON 位于 API 源码内，可沿用该编译布局。前端导入数据文件，目录显示名称与顺序仍取原生注册信息。部署同时发布支持完整目录的前端和后端，验证最终 API 发布目录中的 JSON 与前端消费源一致。聚焦检查覆盖数据为非空字符串数组、ID 唯一以及取消和隐藏身份排除。[API 编译配置](../../apps/api/tsconfig.json)、[前端编译配置](../../apps/web/tsconfig.json)、[前端脚本](../../apps/web/package.json)

主控已创建的共用数据包含以下 20 项。本设计逐项核对了其与原生注册可见目录证据的顺序。

```json
[
  "arduinoUno",
  "arduinoNano",
  "arduinoLeonardo",
  "arduinoMega2560",
  "arduinoUnoR4Minima",
  "arduinoUnoR4Wifi",
  "arduinoEsp32",
  "arduinoEsp32S3",
  "arduinoEsp8266NodeMCU",
  "arduinoK210MaixDock",
  "arduinoK210Maixduino",
  "arduinoRaspberryPiPico",
  "arduinoRaspberryPiPicoW",
  "arduinoRaspberryPiPico2",
  "arduinoRaspberryPiPico2W",
  "microbit",
  "microbitV2",
  "makeyMakey",
  "aijiteESP32S3",
  "firebeetleEsp32E"
]
```

已有模块的五板 `supportDevice` 均为此集合的子集，原模块快照和原作品引用继续有效。工厂编辑旧版本时保留原勾选集合，保存修改继续创建新的不可变模块 ID，原版本的支持范围不会随目录扩大。六个内置模块仍使用原五板声明。`controllerIds` 还控制 `deviceReady` 的引脚描述就绪检查，须保留这部分五板含义，新增完整集合单独用于私有模块的声明校验与工厂选择。[不可变版本存储](../../apps/api/src/custom-modules/local-module.store.ts)、[内置支持矩阵](../../apps/web/src/extensions/catalog.ts)、[设备就绪和换板校验](../../apps/web/src/extensions/adapter.ts)

`supportDevice` 的允许集合只负责声明可选主控。模块实际加载仍按声明与当前设备匹配，并执行既有注册、工具箱及回滚流程。换板时保留模块声明兼容检查，出现既有引脚或 opcode 不受目标支持时给出原有拒绝原因。当前预生成主控描述只有 Uno、ESP32 和 ESP32-S3，再由外部适配派生两项；新增目录条目的引脚预览不能假设已有五板描述。普通模板可完成新板声明、保存和重读，使用引脚时按实际可信菜单判断可用性。硬件执行器继续依据已有 profile 判断可执行目标，Micro:bit 系列在原生目录中的语言为 MicroPython，能力提示应依据实际生成及执行路径。[设备描述准备](../../apps/web/scripts/prepare-device-descriptions.mjs)、[派生描述](../../apps/web/src/extensions/device-registration.ts)、[工厂引脚预览](../../apps/web/src/extensions/custom-module-factory-preview.ts)、[引脚候选处理](../../apps/web/src/extensions/custom-module-definition.ts)、[编译 profile](../../apps/api/src/hardware/config.ts)

未知或伪造 ID 继续在 POST 校验时拒绝，覆盖拼写近似、大小写变化、空字符串、路径、对象、`null`、`'null'`、三个隐藏父类及仅存在于块参数中的名称。当前作品加载对历史 `aijiteEsp32S3` 的归一化沿原路径处理，新模块 `supportDevice` 使用规范 `aijiteESP32S3`。目录的正式扩容通过修改可信发布数据完成。[现有校验错误](../../apps/api/src/common/api-error.ts)、[历史设备身份归一化](../../apps/web/src/extensions/catalog.ts)

主控页撤去类型过滤后，候选集始终从完整可见 rows 开始，忽略此前保留在内存的 `type:'board'`。两个主控入口继续共用同一搜索及状态筛选。模块页保留自己的真实类型和筛选状态。纯目录浏览及工厂中的草稿主控勾选只影响各自视图或草稿，实际向作品加载模块才进入既有编辑事务。项目仍以完整 `.ob` 保留设备、模块 ID、积木、素材及手稿，私有定义仍经所有者范围内的不可变版本读取。[库筛选与状态](../../apps/web/src/extensions/library.ts)、[项目归档帮助层](../../apps/web/src/editor-archive.ts)、[私有模块访问范围](../../apps/api/src/custom-modules/module-access.ts)

开发和独立测试按以下矩阵聚焦回归。

| 场景 | 通过条件 |
| --- | --- |
| 三处目录对齐 | Dev 和 dist 中比较两个主控入口与工厂的有序 ID、名称及可用状态，当前为同一 20 项。主控页没有“全部”“主控板”二级分类，进入后旧类型状态不裁剪列表。无板、有板及两种模式下工厂选项来源一致。 |
| 新板保存重读 | 以普通无引脚模板声明 `['arduinoNano']`，由真实工厂 POST 保存，目录与详情 GET、页面刷新和服务重启后均能读取，checkbox 恢复 Nano。另用 API 遍历共用集合验证每个 ID 可保存，包括 `microbit`、`microbitV2`、`makeyMakey`。混合多个新旧主控时保存原顺序。 |
| 旧定义和版本 | 既有五板模块可读取、编辑另存，原 ID 和原支持数组保留。Nano 等新目录声明不扩张六个内置模块的兼容集合。使用一个新板的普通模块完成真实加载、完整作品保存和新页面重开。 |
| 非法输入 | 对未知、隐藏、取消、错误类型、空数组、重复 ID 及伪造字段断言 400 和准确字段，失败后目录无新增记录。至少保留同所有者可读、其它所有者 404 的现有访问检查。 |
| 运行边界 | 原五板的引脚就绪检查正常。新板选择完成，适配器按原路径就绪，缺少描述时不进入五板缓存等待。引脚缺失或不兼容换板有可读错误并保全作品。新增声明保存本身不发起串口或硬件作业。 |
| 发布和漂移 | API 最终编译目录包含共用 JSON，可独立启动已编译服务并接受 Nano 保存；前端 Vite dev、静态 dist 和现有 Node 单测均可读取同份数据。共用数据与真实注册项出现缺项、多项、重复或顺序差异时校验能检出，固定 VM/Blockly 模块字节核对通过。 |

本轮设计已按主控确定的共用 JSON 路径、字符串数组结构及双端导入方案完成对齐。评审只新增本设计文件，验收矩阵尚待开发和测试执行。
