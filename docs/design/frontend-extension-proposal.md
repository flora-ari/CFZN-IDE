# 主控扩展 / 模块扩展：前端接口与集成提案

日期：2026-11-06。角色：前端接口设计。状态：提交主控审议，未修改公共契约或业务代码。

用户已确认本轮范围：**先内置旧 IDE 扩展并提供代码接入方式**；不做界面扩展包导入、扩展市场或任意 URL 安装。后续扩展以源码提交、静态注册、随网站构建发布的方式接入。

## 1. 建议结论

保留当前官方 OpenBlock GUI、原扩展按钮、全屏扩展库、搜索栏、卡片、积木工作区和舞台。在原扩展库筛选栏内增加“主控扩展”“模块扩展”，原有舞台扩展仍可返回。分类只改变目录视图；选中操作必须进入真实设备加载或 Blockly 模块注册链路。

首批建议为 **3 个主控条目 + 6 个模块**：Arduino Uno、ESP32-S3、Aijite ESP32-S3；有源蜂鸣器、雾化模块、人体红外、火焰传感器、水滴传感器、积木注释。自有主控需要接入旧项目真实的 IO3 排除逻辑，使用独立 ID；不能直接复制旧卡片。

当前预编译包没有公开的扩展库组件替换 API，设备构造器表也封闭在包内。因此建议采用**固定官方版本、少量可重放的集成补丁、前端本地扩展目录**。补丁仅提供原组件插槽、目录入口及设备构造器注册入口；实际目录、扩展包装与状态逻辑保留在 `apps/web/` 的普通源码中。保留 VM 引擎、调度器、序列化器和官方编辑界面，不整体替换成旧项目分叉。

首批模块具备真实积木和 Arduino 代码生成能力，属于上传模式模块，**不是浏览器实时执行的 VM 扩展**。本次可以交付拖拽、参数编辑、生成真实代码、保存和恢复；实际编译、烧录和硬件运行仍需主控另行确定工具链任务，不能标为完成。若用户要求这批模块在实时模式下立即驱动硬件，则需要额外的 VM primitive、板端协议/固件和 Web Serial 适配，不能通过增加两个按钮达成。

## 2. 证据位置与检查方式

下文路径约定：

- `WEB` = `F:/CFZN/CFZN-IDE/apps/web`。
- `OLD` = `F:/CFZN/D-Coding/aijite-editor-release/aijite-editor-release/packages`。
- `EXT` = `OLD/external-resources-v3/extensions`。
- `GUI` / `VM` 表示当前官方发布包源码映射中的 `webpack://GUI/./src/` / `webpack://GUI/./node_modules/openblock-vm/src/`，不是对旧分叉源码的推测。

官方证据来自现有归档 `F:/CFZN/CFZN-IDE/.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz` 内 `package/dist/openblock-gui.js.map` 的 `sources` / `sourcesContent`，只在内存读取，未解包写文件。当前生成的 `openblock-gui.js` SHA-256 为 `eb3f8ee4d4e4ce89ffff1b9aec0e4154b66d0044d79cdb1e6e97c7dcef0e6cb9`。

| 证据 | 源码位置 | 对方案的影响 |
| --- | --- | --- |
| 官方包及 React 16 固定版本，校验 npm 归档完整性 | `WEB/scripts/prepare-openblock.mjs`，manifest 与 prepare | 继续使用现有构建准备流程；补丁和扩展资源也应纳入 manifest 的缓存失效条件 |
| 同源独立 iframe 中加载 UMD GUI；平台 React 为 19 | `WEB/openblock.html`、`WEB/src/openblock.ts`、`WEB/package.json` | 新目录组件在 iframe 中使用其 React 16；不跨 React 版本传组件 |
| VM 经 onVmInit 取得；完整归档由 saveProjectSb3 导出 | `WEB/src/openblock.ts`，bindVm / loadProject / EXPORT_PROJECT | 可安装目录适配器并复用现有保存和失败恢复流程 |
| 只导出 GUI、AppStateHOC、reducers 等，没有 Library 替换接口 | `GUI/index.js` | 无法仅向 GUI 顶层增加一个 prop 就改变原库组件 |
| 原扩展库根据 realtime/upload 选择两种目录和加载方法 | `GUI/containers/extension-library.jsx:82–149` | 不能把硬件模块简单拼进实时扩展数组并调用 loadExtensionURL |
| filterBar、搜索和卡片由通用库组件渲染 | `GUI/components/library/library.jsx:163–235` | 给 filterBar 增加可选插槽，原造型/声音库不传插槽、不改变行为 |
| 设备选择加载真实 VM 设备 | `GUI/containers/device-library.jsx:58–98` | 复用其语义，但修正未等待成功就关闭、错误仅 console 输出的问题 |
| 内建设备表与本地资源地址 | `VM/extension-support/extension-manager.js:13,32–68,288–508` | 固定地址为 127.0.0.1:20112；网页不能假定用户安装资源服务 |
| 设备事件驱动 Redux、模式、引脚菜单和工具箱 | `GUI/containers/blocks.jsx:478–563` | 设备元数据必须先进入 Redux；还需等待工具箱就绪，不能只等待 loadDeviceURL 的 Promise |
| 模块注册事件执行消息、生成器与积木定义函数 | `GUI/containers/blocks.jsx:576–592` | 可接入真实 Blockly 注册链路，无需自行模拟积木 |
| 归档自带 device、programMode、extensions、deviceExtensions | `VM/serialization/sb3.js:557–585` | 不新增并行项目格式，不只保存卡片勾选状态 |
| 恢复依次安装设备、targets/舞台扩展、设备模块 | `VM/virtual-machine.js:565–684` | 目录适配器必须在任何项目加载前安装，并覆盖恢复调用的加载方法 |

Mind+ 的分类和“支持当前主控”筛选依据主控已完成的 [观察记录](./mindplus-extension-observations.md)。本会话没有重复访问 Mind+，不复制远程市场或其扩展代码。

## 3. 旧项目实情

### 主控

- 旧 GUI 的 Aijite 卡片位于 `OLD/aijite-gui/src/lib/libraries/devices/index.jsx:220–254`，但 `deviceId` 实际仍为 `arduinoEsp32S3`。它与同文件普通 ESP32-S3 卡片共用 ID，选中、名称和恢复均不能区分。
- 独立实现确实存在于 `OLD/aijite-vm/src/devices/aijiteEsp32S3/aijiteEsp32S3.js:1–86`：继承 ESP32-S3，`DEVICE_ID` 为 `aijiteESP32S3`；数字、模拟、触摸引脚及 getInfo 菜单均排除 IO3。旧 manager 注册了 `aijiteESP32S3` 和 `aijiteEsp32S3` 两种大小写，但 GUI 没有连到它们。
- 当前官方 VM 已含 Arduino Uno、ESP32-S3 的真实设备类，未含 Aijite 类或 CanMV K230。Aijite 可以用官方 ESP32-S3 类作为基类，移植上述很小的派生逻辑，不搬整套旧 VM。
- CanMV K230 在 `OLD/aijite-vm/src/devices/canmvK230/k230.js` 依赖 `../../io/openmv`，包含 USBDBG 上传、运行和帧/输出相关调用。旧模块又大量声明 `supportDevice: ["k230"]`，与卡片 `canmvK230` 不同。本次不把它列入可用首批；它需要独立协议、Python 生成器和 ID 对齐工作。

### 模块与加载路径

`EXT` 下实际有 75 个模块目录；静态扫描发现 27 个 generator 含 `TODO` 或 `newblock_`，这个数字只表示需检查的候选，不能当作全部错误数量或通过率。

旧模块通常包含 `index.js`、`blocks.js`、`toolbox.js`、`generator.js`、`translations.js`、`assets/`，部分还包含 `lib/` 或运行时 `main.js`。`OLD/aijite-resource/src/extension.js:16–62` 在 Node 端扫描目录、执行 descriptor、拼资源路径并生成目录，其中 `library` 会变成本机绝对路径。资源服务端口在 `src/config.js:31` 为 20112，`src/server.js:108–117` 提供静态资源。

官方 VM 的设备模块加载器取目录中的四个 JS URL，使用 loadjs 加载，然后读取全局 `registerToolboxs`、`registerBlocks`、`registerGenerators`、`registerBlocksMessages`，调用 runtime.addDeviceExtension 并发出 DEVICE_EXTENSION_ADDED。它不为这些模块注册实时 VM 执行函数。

不能整体搬目录：

- `EXT/LED/generator.js:7–10` 重复声明 `const PIN`，其余函数返回 TODO；`toolbox.js:7–13` 也有重复字段。
- `Button`、`RGB`、`Wifi` 等存在 TODO 生成器；名称看起来完整不代表实现完整。
- `activateBuzzer` 与 `activeBuzzer` 共用 `activeBuzzer_*` 积木 opcode；首批只启用前者，防止后加载者覆盖定义。
- `dht`、`ultrasonic` 等已有实际生成器，但另需 DHT/Ultrasonic 原生库及板卡验证，暂不混入无额外依赖首批。
- `openai`、`deepseek` 的 main-only 形式不符合当前设备模块加载方式；官方 getDeviceExtensionsList 会过滤有 main 无 blocks 的条目。本次不接入云 AI、账户或密钥流程。

## 4. 首批具体目录

以下是建议固定清单，待主控发布；“可接入”是源码分析结论，未声称已做浏览器或硬件验收。

### 主控扩展

| 名称 / 建议 ID | 实现 | 初始交付能力 | 图标来源 |
| --- | --- | --- | --- |
| Arduino Uno / `arduinoUno` | 当前官方内建设备 | 原有引脚积木、Arduino 生成代码、保存恢复；原实时能力不得据此宣称硬件已接通 | 官方现有目录资源 |
| ESP32-S3 / `arduinoEsp32S3` | 当前官方内建设备 | 上传模式积木、Arduino 生成代码、保存恢复 | 官方现有目录资源 |
| Aijite ESP32-S3 / `aijiteESP32S3` | 官方 ESP32-S3 基类 + 旧派生类 IO3 排除逻辑 | 独立身份、受限引脚菜单、上传模式、代码生成、保存恢复 | `OLD/aijite-gui/src/lib/libraries/devices/aijiteEsp32S3/aijiteEsp32S3.png` |

Aijite descriptor 设置 `type: arduino`、`programMode: ['upload']`、`deviceExtensionsCompatible: 'arduinoEsp32S3'`。波特率 115200 只作为目录/终端提示，不在选择卡片时连接串口。旧类的 IO3 规则是现有实现依据，其余板上实际引脚可用性和硬件规格仍需实板验证。

建议规范 ID 为旧类使用的 `aijiteESP32S3`，只在导入适配层接受 `aijiteEsp32S3` 别名。历史归档写的是 `arduinoEsp32S3` 时保留通用主控，不能根据卡片标题猜测它是 Aijite。

### 模块扩展

| 名称 / ID | 真实积木 opcode | 已读生成器证据 | 文件 / 图标 |
| --- | --- | --- | --- |
| 有源蜂鸣器 / `activateBuzzer` | `activeBuzzer_init/on/off` | generator:7–18，pinMode、digitalWrite | `EXT/activateBuzzer/`，`assets/activateBuzzer.png` |
| 雾化模块 / `atomizer` | `atomizer_init/setState/toggle` | generator:5–22，初始化、状态变量、digitalWrite | `EXT/atomizer/`，`assets/atomizer.png` |
| 人体红外 / `pirSensor` | `pirSensor_init/detected` | generator:5–12，INPUT、digitalRead 布尔表达式 | `EXT/pirSensor/`，`assets/pirSensor.png` |
| 火焰传感器 / `flameSensor` | `flameSensor_readDigital/readAnalog` | generator:5–11，digitalRead / analogRead | `EXT/flameSensor/`，`assets/flameSensor.png` |
| 水滴传感器 / `raindropSensor` | `raindropSensor_readDigital/readAnalog` | generator:5–11，digitalRead / analogRead | `EXT/raindropSensor/`，`assets/raindropSensor.png` |
| 积木注释 / `moreComments` | `moreComments_commandBlock/branchBlock` | generator:6–22，实际注释及子语句输出 | `EXT/moreComments/`，`assets/moreComments.png` |

前五项的目录明确支持 Uno / ESP32-S3，Aijite 通过上述兼容基类匹配。第六项旧目录支持 `*`，但生成器只有 Arduino；本轮仅在已列入清单的 Arduino 主控、上传模式启用，不把 `*` 解读成任意语言都支持。

硬件模块的引脚下拉依赖 `Blockly.Device.getPinOptions('arduino_pin_setDigitalOutput'/'arduino_pin_readDigitalPin'/'arduino_pin_readAnalogPin')`。这些 opcode 在当前官方 Uno 和 ESP32-S3 类中均存在；必须等对应主控工具箱完成后注册模块。各模块没有引入额外 C/C++ 库。`activateBuzzer/index.js` 虽声明 `library: 'lib'`，该目录实际无 lib、生成器也不 include 库，网页目录不保留这个无效依赖。

需初始化的模块至少提供一份真实示例组合（初始化 + 操作/读取），不能用生成器存在替代代码组合验收。火焰/水滴读取的硬件引脚模式在示例中由主控积木明确设置。

## 5. 原版 UI 的最小改动

- 保留 `gui_extension-button_2T7PA` 对应的原按钮与 Redux 打开流程。
- 原 `library_filter-bar_1W0DW` 中保留搜索、标签与布局；增加与现有标签控件同尺寸/字体的分类控制，语义为“舞台扩展 / 主控扩展 / 模块扩展”。前两项新功能以“主控扩展”“模块扩展”准确命名；舞台入口用于保留现有扩展的可达性。
- 分类使用独立 state，不能直接借用原 selectedTag：原搜索 handleFilterChange 会把 selectedTag 设回 all，否则搜索会意外退出主控分类。
- 模块页增加“支持当前主控”筛选；兼容判断为当前完整 ID、deviceExtensionsCompatible、明确适用的通配项。无主控时显示说明和“选择主控”入口，允许浏览目录但禁止加载硬件模块。
- 开启支持筛选时隐藏不兼容项；关闭时显示全量条目及不兼容原因，选择仍不可执行。未选中主控不访问 device.deviceExtensionsCompatible，修复原代码该处空对象风险。
- 类别、搜索、支持筛选、选中和加载状态各自独立。每次打开按当前编程模式选择初始页：纯舞台默认为舞台扩展；已选上传主控默认为模块扩展。切换分类不切编程模式、不清空积木。
- 原卡片展示图片、名称、描述和当前已选中/已加载状态。重复点同一主控幂等；主控为单选，模块为多选。错误在库内就地显示并可重试，不能只有 console.error。
- 保留键盘进入/切换/退出、可见焦点和关闭后的焦点返回；按钮需提供可访问名称与选中状态。CSS 模块散列类仅用于核对现有 UI，不作为永久 JS 绑定协议。

这是 `design-taste-frontend` 的单组件修改场景，沿用周围设计，不抽签换主题、不重做原 OpenBlock。按用户要求保留原蓝色工具栏、卡片及积木颜色。本轮是设计交付，没有启动服务或做截图验收；实现后须检查原扩展库及新分类在桌面、平板和窄屏的溢出/焦点行为。

## 6. 可维护集成方案

### 6.1 固定包上的四处窄入口

建议由 `WEB/scripts/prepare-openblock.mjs` 在已验证归档的暂存产物上应用受版本控制的补丁，再发布到现有 `.runtime/web-openblock`。该脚本目前只按 manifest 相等就提前返回，需把补丁版本和目录内容指纹纳入缓存条件。

1. **Library 插槽**：`GUI/components/library/library.jsx` 的 filterBar 增加可选 `categoryControls`，仅扩展库传入；保留原 Filter、TagButton、LibraryItem。
2. **ExtensionLibrary 适配入口**：在现有容器边界允许本地目录控制器接管分类、数据与选择处理，仍使用原 LibraryComponent。源码位置 `GUI/containers/extension-library.jsx`；当前产物中有清楚的 `CONCATENATED MODULE` 边界和 `extension_library_ExtensionLibrary` / `library_library` 符号。不要用 MutationObserver 添两个脱离 React 状态的按钮，也不要读取 React Fiber 私有字段。
3. **设备元数据入口**：向 `GUI/lib/libraries/devices/index.jsx` 的 deviceData 增加自有主控。必须同时兼容原设备库和项目恢复，不能只给新卡片列表塞数据。现有 makeDeviceLibrary 只接受能匹配内建设备的项，且同 ID 外部项不会覆盖内建项（815–835）；单独替换 getDeviceList 无法加入独立 Aijite 类。
4. **设备工厂注册入口**：在 VM extension-manager 的 builtinDevices 表上增加受控注册钩子，注册 `aijiteESP32S3` 派生工厂，以当前官方 ESP32-S3 类为父类。迁移旧类中的 DEVICE_ID、引脚过滤/getInfo 规则，不搬旧基类、CommonPeripheral 或整个 VM。此处是设备注册表适配，仍需主控明确接受；不是已有公开 API。

发布包不带可直接使用的 GUI 源文件入口，但带完整 sourcemap 和可读 bundle。短期可在 prepare 阶段对上述四个准确、版本固定的片段做可重放变换；保存“上游源码位置 → 变换前片段 → 变换后片段”与 hash、唯一命中检查。升级出现不匹配直接构建失败，不悄悄漏补丁。禁止手改运行目录或 node_modules 后宣称可复现。若主控选择维护官方源码构建，则同样四处源码补丁更清晰，但会引入 GUI 旧构建依赖/锁文件协调，不能作为已零成本可用的方案。

不建议只使用 `aijite_arduinoEsp32S3` 的外部继承 ID 冒充完整 Aijite 实现：官方确实能解析下划线继承 ID，但只会实例化通用 ESP32-S3，不能自动应用旧派生类的 IO3 规则。该方式仅可作为明确标注的“通用兼容配置”，不能替代本提案的自有主控验收。

### 6.2 前端目录和模块适配器

建议新增的前端源码范围（路径是设计建议，不是本轮已创建文件）：

- `apps/web/src/extensions/catalog.*`：固定受控目录、兼容判断、显示信息。
- `apps/web/src/extensions/adapter.*`：安装到真实 vm.extensionManager 实例，处理目录、模块加载/卸载和任务串行化。
- `apps/web/src/extensions/library.*`：分类 UI 与状态。
- `apps/web/vendor/extensions/<id>/`：选定模块的源码、图片、来源/版本与许可证；不以开发机器旧目录为生产依赖。
- `apps/web/scripts/` 下固定版本补丁及模块包装逻辑，随 prepare 执行。

在 bindVm 初始化时安装 adapter；在默认项目 READY、任意恢复和设备选择之前将设备元数据填入 GUI Redux。原 DeviceLibrary 打开时的 getDeviceList / makeDeviceLibrary 也必须保留自有条目，不得重新覆盖掉它。

覆盖 manager 的 `getDeviceList`、`getDeviceExtensionsList`、`loadDeviceExtension`、`unloadDeviceExtension` 入口，而不是全局拦截 fetch 或改 127.0.0.1:20112 指向 API。目录从打包资源取得；旧 `supportDevice` 与图标相对路径转为受控元数据/同源资源。`getDeviceExtensionsList` 每次依据 runtime 重新生成 isLoaded，不以卡片 state 为真值。

模块打包时把旧 register 函数转为模块级明确导出。旧文件尾部 `exports = register...` 是 classic script 的兼容写法，不能原样作为 ESM import。translations 中的 Node module.exports 仅用于资源服务，不需带进浏览器。生成模块应明确导出 `toolbox / defineMessages / defineBlocks / defineGenerators`，保留原 opcode。

加载时使用固定 `id → importer` 映射，执行原 `runtime.addDeviceExtension` 与 `DEVICE_EXTENSION_ADDED` 对接。首批不接受项目传入任意脚本 URL，不执行旧 Node descriptor 作为用户插件。不要并发复用原全局 register* 槽：原加载器会先清空共享全局，两个模块并行可能交叉注册；新适配器应使用独立模块导出并将设备/模块操作串行化。

### 6.3 后续通过代码接入扩展

面向项目开发者提供一份接入文档与一个真实首批模块作为示例，步骤固定为：

1. 将模块源码、图标和来源/许可记录放入受版本控制的扩展目录；保留/确定稳定 ID 和 opcode，明确是实时 VM 扩展还是上传模式生成器。本期接入模板为上传模式 Arduino 模块。
2. 显式导出 toolbox、defineMessages、defineBlocks、defineGenerators；在静态 catalog 填入名称、图片、支持主控、语言、模式、版本和 opcode 列表，并在固定 importer 表增加对应导入函数。不通过文件上传或项目内容产生动态 import 路径。
3. 自有主控另增加独立 descriptor 和 device factory；基础主控已有实现则复用，存在引脚/功能差异则以派生类表达。不能只加图标、改名或给通用主控重复 ID。
4. 提交实际积木/生成代码示例和保存恢复样例，运行兼容/注册/恢复检查，然后随前端构建发布。新增公共语义或改变既有 ID/opcode 时先交主控确认，不能让旧归档悄悄改变含义。

静态注册与恢复约束：

| 字段或行为 | 固定规则 |
| --- | --- |
| 主控身份 | catalog.id、VM device.deviceId、GUI descriptor.deviceId 三者一致；独立主控不得重复 ID |
| 模块身份 | catalog.id 与原生 deviceExtensions 中的 ID 一致；保持大小写和已有 opcode |
| 兼容 | ID / 兼容基类 + 模式 + 语言同时满足；不能仅按卡片分类判断 |
| 注册来源 | 仅发布时固定的 descriptor、factory 和 importer；不恢复项目内任意脚本 URL |
| 初始化 | 目录/构造器/manager adapter/GUI metadata 在 loadProject 前可用；空目录不得传入会读 deviceList[0] 的上游函数 |
| 恢复 | 原生 device → targets/舞台扩展 → deviceExtensions；加载完工具箱和定义后才宣布成功 |
| 缺失实现 | 明确拒绝并保留/恢复原项目；不跳过后自动保存 |
| 版本边界 | 本轮不增加归档字段或版本市场；同 ID 保持兼容，破坏性变更交主控制定迁移 |

## 7. 内部接口建议（不是新公共契约）

```ts
type LibraryKind = 'stage' | 'controller' | 'module';
type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface ControllerEntry {
  id: string;                     // 精确、稳定，Aijite 与通用 ESP32-S3 不共用
  name: string;
  iconUrl: string;
  compatibilityId?: string;        // Aijite → arduinoEsp32S3
  programModes: ('realtime' | 'upload')[];
  implementation: 'builtin' | 'aijite-esp32s3';
}

interface ModuleEntry {
  id: string;                     // 保留旧 extensionId，区分大小写
  version: string;
  name: string;
  iconUrl: string;
  supportedControllers: string[];
  programMode: 'upload';
  language: 'arduino';
  blockOpcodes: string[];          // 检查定义冲突与卸载引用
  load: () => Promise<ModuleRegistration>;
}

interface ModuleRegistration {
  toolbox: () => string;
  defineMessages: (blocks: unknown) => unknown;
  defineBlocks: (blocks: unknown) => unknown;
  defineGenerators: (blocks: unknown) => unknown;
}
```

此清单只用于前端内部数据与实现分工。当前不实现版本市场、版本求解或运行时安装器；旧 version 保留作来源记录。同一设备/模块 ID 的语义应保持稳定。若未来确有跨版本项目迁移需求，由主控另行定义归档/目录版本契约。

## 8. 注册、选择和错误时序

### 主控选择

1. 对照固定目录查 ID，保证 metadata 和 constructor 都已注册。已有同一 ID 则返回当前状态。
2. 若切换会影响现有设备模块或工作区积木，显示具体影响并提供取消/另存后切换；不能静默清空。初次选择无损场景直接进行。
3. 保存当前完整归档作为失败回滚快照，停止执行，将设备与模块变更置为 busy。
4. 调用原 loadDeviceURL；等待对应 `SCRATCH_EXTENSION_ADDED` 和 GUI 工具箱/引脚菜单实际就绪，再加载所需兼容模块。原 Promise 成功并不覆盖后续异步 GUI 注册成功。
5. 验证 runtime.getDevice、Redux 当前主控、编程模式与卡片一致；完成才显示选中，发一次项目变更。
6. 切换时显式保留兼容且已选模块；不兼容模块及既有块的处理须在步骤 2 列明。首版可拒绝有不兼容块的切换，让用户先另存/新建，而不是自行删除脚本。

### 模块选择/卸载

1. 检查当前主控、上传模式、生成语言、同 ID 加载状态与 opcode 冲突；不通过就地解释。
2. 加载受控模块导出，检查四类注册函数和主控引脚工具箱，按原 GUI 回调实际注册 translations / generators / blocks，加入 toolbox。注册成功后才提交 loaded 与 project dirty。
3. 在 runtime 注册表、Blockly 定义/生成器和工具箱三者一致后显示已加载。加载失败撤销本次记录并恢复原状态；不能留下勾选但无积木。
4. 卸载前检查全部 targets 的该模块 opcode 引用，包括嵌套块/监视器；有引用时禁止卸载并说明需先移除相关积木。无引用时更新 runtime 与工具箱，更新 dirty。
5. 设备加载、模块注册、项目导入、导出/保存互斥；不得在半注册状态导出一个“已保存”归档。

建议内部错误码：`CONTROLLER_NOT_FOUND`、`MODULE_NOT_FOUND`、`CONTROLLER_REQUIRED`、`MODULE_INCOMPATIBLE`、`PROGRAM_MODE_UNSUPPORTED`、`EXTENSION_LOAD_FAILED`、`EXTENSION_REGISTRATION_FAILED`、`EXTENSION_IN_USE`、`EDITOR_BUSY`。保持具体模块名和重试动作。现有父子桥仍可按 EDITOR_ERROR 携带消息；没有平台需要消费新状态时，不增加桥协议消息。

`runtime.setDevice` / `addDeviceExtension` 本身仅修改状态（`VM/engine/runtime.js:2564–2598`），未见主动发 PROJECT_CHANGED。adapter 成功后须显式通知项目变更；只选主控或模块、不拖积木，也必须触发现有未保存提醒。导入恢复时仍由现有 loading 标记抑制 dirty，不能把恢复误标为用户编辑。

## 9. 序列化、恢复与接口边界

继续使用 `vm.saveProjectSb3()` 完整 `.ob` 归档，沿用现有 API v0.1 上传/下载与版本冲突处理。项目中保留 native 的 device、programMode、extensions、deviceExtensions、targets 和素材。扩展脚本/图标属于版本固定的应用资源，不塞入项目归档，不把 Windows 旧目录或本机 C/C++ library 路径写进前后端协议。

恢复顺序：

1. 先检查 archive 中的设备/模块 ID 是否有本地实现、兼容和正确模式；检查只读，不先清空当前 VM。
2. 确保目录、GUI 设备元数据、Aijite 构造器及 manager adapter 已初始化，再进入现有 loadProject 生命周期。
3. 使用原 VM 的“设备 → targets/舞台扩展 → 设备模块”的恢复顺序。模块注册函数依赖主控 flyout，应等待工具箱就绪，不仅延迟一个任意毫秒数。
4. 等全部注册完成，核对 workspace 恢复，再确认项目加载成功；selected UI 从 runtime 重建。
5. 缺失/不支持模块不静默跳过，不把损坏结果覆盖保存。加载失败由现有完整归档回滚；若回滚本身失败，停止编辑并显示恢复失败，保留原备份供导出。项目加载已有备份恢复流程，但需确保新增资源失败也在其错误边界内。

**本功能不需要新 BFF 业务接口。** 目录、代码与图片可随前端构建同源部署；项目后端继续保存/验证完整归档，不执行扩展、不管理硬件。无需 `/devices`、`/extensions`、串口 API、WebSocket、Python、SQL 或 OSS。主控只需在验收/接口文档中明确扩展 ID、保存语义和能力范围；若最终选择后端动态下发目录，则由主控另立契约，本提案不先行规定。

## 10. 硬件与许可记录

### 硬件能力

官方 `VM/io/serialport.js:17–35` 通过 `runtime.getScratchLinkSocket('SERIALPORT')` 建立 WebSocket；upload / uploadFirmware 是向 Link 发 RPC。`VM/devices/common/common-peripheral.js` 也使用该类。这与平台 `WEB/src/serial.ts` 的 Web Serial 终端不是同一通路。

选择主控/模块不得自动连接 Link、请求串口或烧写固件。可编辑和生成代码不等于已连接设备。原界面中的连接/上传入口需反映真实可用性，在本期未提供编译烧录服务时给出明确不可用原因，不能出现虚假的“上传成功”。保留平台 Web Serial 的连接和收发能力，不能把终端数据流直接当成固件 RPC。

未进行：真实 Uno/Aijite/ESP32-S3 接线、编译、烧录、传感器读数、电平/电压确认、IO3 物理限制验证、CanMV USBDBG 验证。测试报告应分别列出浏览器编辑/代码生成、模拟连接和真实硬件结果。

### 资源与许可证文件

| 源位置 | 实际文件内容 | 迁移记录要求 |
| --- | --- | --- |
| `OLD/external-resources-v3/LICENSE` | MIT，Copyright 2021 OpenBlock.cc | 与移入的模块源码/图片一并保留原声明，记录每个目录来源 |
| `OLD/aijite-vm/LICENSE`、`OLD/aijite-gui/LICENSE` | MIT，Copyright 2022 OpenBlock.cc | 派生类和自有主控图片保留来源及相应文件 |
| `OLD/aijite-gui/LICENSE.MIT` | 文件内容是三条款 BSD 文本，Copyright 2016 MIT | 不按文件名误标为 MIT License；沿用官方发布包现有许可/TRADEMARK 保留方式 |
| `OLD/aijite-blocks/LICENSE` | Apache 文本 | 本方案不搬整套 Blocks；若后续复制其中实现，单独记录 |

首批各模块根目录未见单独 LICENSE，`author` 有空值；目录总 LICENSE 不能证明每张后来加入图片的单独来源。可以记录现有项目随附许可和资产路径，但不能把“旧项目有文件”写成“自有原创/版权已核实”。自有主控图片及第三方元件照片的素材来源确认由主控归口；不下载 Mind+ 卡图替换。根 package.json 声明 BSD-3-Clause 而根 LICENSE 内容为 MIT，记录该差异，不擅自重写许可证。

## 11. 实现后的验收建议

1. **入口/UI**：点击原按钮，筛选栏出现新增分类；切换分类、搜索、标签、“支持当前主控”、滚动、关闭/重开均有效；舞台 pen/music 原链路仍可编辑执行。
2. **真实主控**：三张卡对应不同 runtime ID；Aijite 的数字/模拟/触摸菜单及模块引脚下拉均不含 IO3；通用 ESP32-S3 不受影响；原设备库和新入口状态一致。
3. **真实模块**：六个模块逐个加载，实际拖入块、编辑参数并接到 Arduino 开始事件；代码预览包含预期 pinMode/digitalWrite/digitalRead/analogRead 或注释，不能全是 TODO、空串或未知 opcode。
4. **兼容和冲突**：未选主控、实时模式、不支持主控、重复加载、相同 opcode 模块、已有块卸载、切换不兼容设备均按设计处理；多次快速点击不串包。
5. **恢复**：选择 Aijite + 两种模块 + 修改参数/自有造型声音，完整保存、关闭 iframe、重新打开并导入；核对 device、deviceExtensions、blocks、连接关系、参数、图像/声音字节与生成代码。再测只选扩展未放块的归档。
6. **错误保全**：目录缺项、模块资源失败、注册函数抛错、工具箱未就绪、未知 Aijite 别名；原项目保持可恢复、无假的已加载/已保存，无自动请求硬件权限。
7. **构建复现**：新环境 prepare/build 不依赖旧工程路径、20112 服务或手改 node_modules；补丁 hash/命中错误明确失败；更新补丁/资源后不会命中旧 manifest 缓存；不改变其他素材库。
8. **已有项目与 API**：普通 Scratch/OB、官方内建主控项目、已有 API 保存冲突继续正常；新增目录不要求启动另一个后端。
9. **硬件另表**：本轮不把 mock 或生成代码测试计为硬件通过。真机通过需要明确板型、固件/编译器版本、连线、输入与观察结果。

## 12. 请主控冻结的选择

- 首批清单：上述 3 个主控、6 个模块；暂缓 K230、占位模块与含外部原生库的模块。
- 接受固定包的四处窄集成入口，或改用官方源码构建同样的小补丁；不整体切换到旧分叉。
- 自有主控规范 ID `aijiteESP32S3`，导入别名 `aijiteEsp32S3`，兼容基类 `arduinoEsp32S3`。
- 本次可用能力为真实编辑、Arduino 代码生成、完整保存恢复；编译/烧录和模块实时硬件执行是否另立任务。

本轮仅做文件/源码静态检查及提案撰写，未修改业务代码、公共契约或旧工程，未安装依赖、启动服务、执行测试或操作硬件。
