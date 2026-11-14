# 模式与上传工作区前端提案

日期：2026-11-10。角色：前端接口设计（gpt-6.1-sol / ultra）。仅设计，待主控冻结契约；不修改实现、VM 或硬件，不新增后端接口。本轮采用 design-taste-frontend 的应用界面原则，沿用 OpenBlock 的蓝色、字体、原生编辑器和紧凑控件；不执行重新抽取视觉风格或另建产品外壳。

## 1. 建议方案

在原模式开关位置放置 **编程模式 / 上传模式** 两个明确按钮。编程模式打开现有舞台、角色、造型/背景和声音能力；上传模式保持积木工作区，右侧改为“上传到设备 → Arduino C 代码区 → 串口终端”的垂直工作区。顶部已验收六项目按钮及 project-status 保持在原生蓝色 MenuBar 同一行。

新增的工作区模式与硬件能力分开：ESP32、FireBeetle、S3/Aijite 可以进入舞台编程，即使其硬件 realtimeAvailable=false。切到编程模式不自动连接、发送 Firmata、刷固件，也不显示实时硬件已就绪。原有 HardwareSession、HardwareController、3002 HTTP 作业和端口释放流程继续复用。

## 2. 无法点击的根因（已读源码）

证据来自当前 apps/web 及固定 GUI 0.1.0-prerelease.20250611102354 的 tgz source map；以下 GUI 路径前缀为 src/。VM 只读用于确认现有接口行为，不作补丁。

| 位置 | 具体行为与影响 |
| --- | --- |
| GUI components/menu-bar/menu-bar.jsx:879–898 | 原 Switch.disabled = isToolboxUpdating || !isSupportSwitchMode；设备单模式时按钮天然不可点 |
| GUI containers/blocks.jsx:478–512 | 读取设备 programMode；只有同时含 realtime/upload 才设 isSupportSwitchMode=true；ESP32 等 upload-only 自动落到 false |
| apps/web/src/extensions/adapter.ts，runtime.setRealtimeMode 外部守卫 | 进一步拒绝四个 ESP32 系列设备的 true，也拒绝已加载模块时转 true；只改按钮外观仍会被拒绝 |
| GUI components/gui/gui.jsx:302–341、390–420 | 同一个 isRealtimeMode 决定造型/声音页签、舞台/角色与硬件区显隐 |
| GUI containers/gui.jsx:58–60 | 非 realtime 时每次更新强制回积木页，不能仅用 CSS 显示造型和声音标签 |
| GUI containers/blocks.jsx:188–192 | 原模式变化会先清空 codeEditorValue；直接切换会丢当前手动代码 |
| GUI containers/blocks.jsx:660–666 | 锁定时由真实 Arduino generator 更新代码；解锁时保持手动代码；现有锁图标可替换为两标签 |

补充必须可运行的依据：只读 VM engine/blocks.js:319–324 显示脚本 stackclick 仅在 runtime.isRealtimeMode() 为 true 时执行；GUI make-toolbox-xml.js:776–803 也会在 upload 设备模式排除运动/外观/声音。故后端提案中的纯 workspaceView/CSS 分离还不足以实现真实舞台编程；本提案采用独立 UI 状态加受控的既有运行接口切换，并把硬件协议资格另外隔离。此处需主控统一裁决，两份提案不能直接同时照搬。

不能把设备 metadata 的 programMode 直接改成 realtime+upload 来“解锁”：它表达硬件能力，不应被 UI 需求篡改。也不能只切舞台 CSS：原生 toolbox 的运动/外观/声音分类和脚本点击执行同样依赖原生编程模式。

## 3. 状态与原生运行模式

建议新增 iframe 外部 ModeController，使用现有 store/VM 接口协调，不修改 VM 源码、生成 VM 代码或注册虚假实时设备能力。

~~~ts
type EditorMode = 'programming' | 'upload';
type CodeMode = 'generated' | 'manual';
interface ModeUiState {
  editorMode: EditorMode;
  codeMode: CodeMode;
  transitioning: boolean;
  disabledReason: string;
  // 硬件协议资格来自实际设备能力，绝不由 editorMode 推断。
  hardwareRealtimeAvailable: boolean;
}
~~~

编程模式需要使用原生 runtime.setRealtimeMode(true) 才能完整获得舞台 toolbox、脚本点击和原生页签；上传模式使用 false。这是调用现有运行接口，**不是将其 true 当成硬件实时可用的证明**。保留独立的 hardware protocol active/ready 判定；未验证 ESP32 协议始终不激活。

外部适配器应把当前“拒绝 ESP32 进入 true”的总闸调整为“允许舞台编程，仍拒绝启动不支持的硬件协议”。硬件控制器 source.realtime / snapshot.use='protocol'、串口连接提示、连接波特率和发送限制必须使用实际 protocol active，不能继续直接等于 extensions.isRealtimeMode()。串口终端在 ESP32 编程视图下仍是普通收发。

调用 setRealtimeMode(true) 的既有实现会在外围设备已连接时请求切换到实时波特率（VM runtime.js:2686–2692）。ModeController 与 NativeSerialSocket 必须显式区分“舞台模式切换引发的请求”和“用户改终端波特率”：未激活硬件实时协议时保持当前 HardwareSession 配置，不因舞台切换触发隐式 close/open、57600 baud 或协议 TX。该隔离放在外部适配器，不修改 VM setter。openblock.ts 的 WRITE_SERIAL / SET_SERIAL_OPTIONS 当前同样直接检查 extensions.isRealtimeMode()，须一起改为实际 protocol active，否则 ESP32 舞台视图仍错误禁用终端。

两个按钮只在项目加载、主控/模块切换、toolbox 更新或硬件作业忙时短暂禁用，并给出原因；不以 upload-only 或无本地编译器为禁用舞台的条件。无主控也能编程；上传视图可打开，显示选择主控引导并禁用编译/上传执行。

切换顺序：检查忙状态 → 捕获代码/编辑态及页签 → vm.stopAll → 调用现有模式接口 → 等待 GUI/toolbox 更新 → 恢复相应视图、必要的代码草稿 → resize Monaco/Blockly → 发布新模式。重复点击当前按钮不重复运行事务。保持相同 VM、target、workspace 和 HardwareSession，不导出再重载项目，不删除角色或模块。

编程视图只展示可用的舞台工具箱；upload-only 模块/设备积木保留在项目中，不在舞台工具箱提供或被当作实时驱动宣传。返回上传视图恢复原硬件工具箱和配置。Uno 的既有实际硬件实时能力单独保留，不扩大到其它板。

### 保存与加载：最小附加元数据（提交主控冻结）

桌面 Mind+ 证据由主控取得：D:/mindplus dev/Mind+/resources/app.asar，版本 1.8.1 RC3.0 / 202506121900；只读提取 .runtime/mindplus-mode/module-2321.js、2322.js、3464.js 显示独立 activeInterface/interfaceIndex，Scratch 与 Arduino 分别渲染，切换前缓存项目并 disposeBoard；3219/3220 为 auto/manual 标签；3054 上传前 closeCommSerialport，按 isWrite 选择 writeCode 或 code。CFZN 采用界面模式和手稿分离的职责，不复制其 disposeBoard 流程或私有 VM；切换视图不应重建现有 HardwareSession。

推荐在同一 .ob ZIP 的 project.json 增加一个可选命名空间，**不新增文件、HTTP 字段或第二份项目正文**：

~~~ts
interface CfznEditorMetadataV1 {
  version: 1;
  mode: 'programming' | 'upload';
  codeMode: 'generated' | 'manual';
  manualDraft?: { deviceId: string; code: string };
}
// project.json.cfzn = { editor: CfznEditorMetadataV1 }
~~~

只保存 UI 模式、代码选择及非空手稿；自动代码来自真实积木重算，不再存一份，主控本体继续用原生 device。manualDraft.deviceId 用于校验草稿归属，不能将 ESP32 手稿静默套到 S3。草稿内容最多沿用源码 1 MiB UTF-8 限制，仍受项目 JSON/完整归档既有限制。不写端口、硬件会话、日志、工具路径、用户信息或 job。

VM 原生 serialization/sb3.js:579 会把运行态 true 写成 programMode:'realtime'；该值当前又驱动模块验证。**不能直接将舞台运行时的 true 原样存成 ESP32 的硬件模式。** 外部 ArchiveAdapter 保存时只规范 project.json：上传主控保持原生 programMode:'upload' 和完整 deviceExtensions，UI 编程视图独立存 cfzn.editor.mode；无主控的舞台项目保留 realtime，旧 Uno realtime 归档保留原有硬件语义。由主控冻结这一归档兼容规则，不修改 VM serializer。

导入先提取并校验 cfzn.editor，再把原生 device/programMode/deviceExtensions 按既有流程交给 VM。加载上传模块时保持原生 upload，全部 targets/素材/模块恢复后再由 ModeController 恢复舞台视图及手稿。这样现有“模块必须 upload”的归档验证可继续保留，无需对全部 realtime+module 文件放宽。没有 cfzn.editor 的旧文件完全走旧规则：按 programMode 选择默认视图，自动代码重算，没有手稿；附加状态损坏或版本无法支持时，在替换当前文档前明确报错并保留原项目，不能静默丢手稿；与后端提案一致。

重打包在前端归档边界完成：调用既有 saveProjectSb3 得到完整 ZIP，仅替换 project.json，造型、声音及其它 ZIP entry 的内容字节逐项保留；不得改 VM 源码、序列化函数或打包 VM 片段。第三方 OpenBlock 可能忽略/丢弃 cfzn 字段，所以兼容要求是完整原生项目可读，不能声称所有第三方软件往返都保留手稿。ZIP 库依赖/锁文件由主控协调，设计阶段不安装。

统一 ArchiveAdapter 应用于保存、导出、导入、项目替换回滚和扩展事务备份；不能只在 EXPORT_PROJECT 写元数据，而 transaction 仍调用 rawSave 导致失败恢复丢手稿。生成器模式、手稿和 view 状态在异步归档前与 documentId/editVersion 一起捕获，不能对旧素材快照混入之后输入的代码。

视图切换、手稿编辑、代码模式选择都应作为同一项目编辑版本管理，保证保存后恢复一致，均不调用 MARK_SAVED。初次加载、内部恢复和重复选择不误增版本。新建默认编程；已有项目按元数据/旧字段恢复，不因当前设备 upload-only 的注册事件再覆盖用户的 UI 选择。

## 4. 可直接实施的 GUI 挂载点

全部是 GUI src/ hook 或外部 TS/CSS，仍由固定 hash、精确单次替换、prepare 指纹校验。禁止匹配 node_modules/openblock-vm 内片段；禁止依赖 React Fiber 或移动既有 DOM 节点。

| 接点 | 最小改动 |
| --- | --- |
| menu-bar 原 programModeGroup | 用 renderModeControls(React16, props) 替换 Switch，使用两个原生 button、aria-pressed、键盘焦点；MenuBar 订阅 ModeController 的最终状态 |
| menu-bar 设备名称 span | 增加稳定 data-cfzn-current-device 标记，主控名 color:#fff/font-weight:700；保留原设备图标和选择行为 |
| extensions/library.ts + library-item GUI 根 | 当前主控根据 canonical deviceId 设置 selected，稳定标记 data-cfzn-controller-selected；由 library.css 画蓝框，不以名称或描述文字判断 |
| GUI containers/blocks.jsx，设备加入分支 | 保留设备/积木注册；对受支持主控把自动模式/是否可切换的 UI 决策委托 ModeController，metadata 的硬件能力不变 |
| GUI containers/blocks.jsx，模式变化清代码处 | 由外部模式协调保留/恢复草稿，避免直接把手动代码清空；不修改 Arduino generator |
| GUI components/hardware/hardware.jsx | 保留当前 Hardware 容器提供的 Monaco props，在同一右栏渲染上传头、代码标签、真实 CodeEditor 与串口底部；传组件引用和 props 给外部 React16 renderer，禁止复制仿造编辑器 |
| GUI hardware-header | 原底部横向头不再重复出现上传动作；同一控制器操作放到右侧上传区头部，保留 necessary native layout controls |
| native-hardware.ts | 抽出可嵌入的设备/profile/OS端口/编译上传操作和日志组件，继续使用现有 controller；进度窗可作为同一状态的详细日志视图 |

保持 GUI 原生 runtime→Redux 事件通道。只需一个 ModeController 订阅出口，不创建另一套 backend 模式状态。新内部方法名供主控定稿；若父页面需要获知模式，在现有 EditorSnapshot 增加受校验字段即可，不改硬件 HTTP。

## 5. 界面规格

当前主控名在原生蓝条使用白色粗体；扩展库的“当前主控：名称”也使用蓝底白字粗体的小型状态区，避免白字落在白底上。设备卡片只对当前选中主控加 2px OpenBlock 蓝色边框，预留同宽透明边框避免跳动；保留“当前主控”文字与 aria-pressed，不把 hover 或键盘焦点当成已选。焦点另有 outline，模块“已加载”状态不误用为“当前主控”。

双按钮沿用原生蓝条高度；活动按钮白底蓝字，未活动按钮透明底白字；34px 左右控件高度，清楚区分 selected/hover/focus/disabled。原切换标题与小滑块一起移除，避免同一位置有两套模式控件。宽度不足沿现有 MenuBar overflow 处理，不新增品牌栏或第二行。

右侧上传区为现有工作区一部分，不使用弹窗代替完整主视图。桌面右栏建议宽 420–560px，积木区域保持可用，内部 min-width/min-height:0，滚动在代码或日志容器内：

~~~text
原生 MenuBar …… 当前主控 [编程模式][上传模式] …… 六项目按钮/保存状态
┌──────────────积木工作区──────────────┬────────上传工作区────────┐
│                                    │ 上传到设备       [上传] │
│                                    │ 主控配置 / 本机OS端口   │
│                                    │ [编译检查] 真实作业状态 │
│                                    ├────────────────────────┤
│                                    │ 代码区         Arduino C│
│                                    │ [自动生成] [手动编辑]  │
│                                    │ 当前 Monaco 代码内容    │
│                                    ├────────────────────────┤
│                                    │ 串口终端 / 连接 / 波特率│
│                                    │ RX/TX 记录与发送        │
└────────────────────────────────────┴────────────────────────┘
~~~

顶部“上传到设备”调用同一个 hardware.start(true)，先选择本机 OS 端口；编译检查调用 start(false)。设备连接由 HardwareSession 用户授权操作，不能用“上传端口 COM3 已选”冒充浏览器连接。3002 不可用只禁用编译/上传并提示原因，不阻断代码查看和浏览器串口。

“Arduino C”是当前 Arduino 源码语言标识，不提供未实现的其它语言。自动生成/手动编辑作为互斥标签，映射原生 isCodeEditorLocked：generated=true/readOnly，manual=false/editable。第一次转手动复制当前生成内容；已有手稿时恢复原手稿。返回自动只切换显示/编译来源，不删除手稿，因此无需重复确认。另设明确“用生成代码替换手稿”动作时才说明覆盖并确认；普通标签往返必须无损。

保留 generatedCode 与 manualDraft 两份会话内值，按 documentId/deviceId 隔离；切舞台、代码面板卸载或打开造型/声音都不丢手稿。保存/导出按上节最小 cfzn.editor 元数据携带当前草稿。切主控时发现其它板手稿不能静默覆盖或迁移，应先保留/导出当前手稿再明确处理；本轮不做多版本代码历史。实际上传来源仍是当前 Redux codeEditorValue 与 codeMode 对应内容。手动编辑不反向转成积木。

生成错误显示为错误状态，不能把 generator 返回的错误字符串当作可上传代码；上传按钮须随当前内容/生成有效性更新。进入自动模式才触发真实现有 Blockly.Arduino.workspaceToCode，不造一套生成器。

底部串口终端优先复用现有原生 HardwareConsole，并补足需要的 text/HEX/行尾及共享状态；如需统一新 renderer，只创建其 React16 视图。父页面 React19 SerialPanel 不跨 React 边界搬入，始终作为同一 HardwareSession 的另一视图，不能新增 reader/writer。

桌面代码区取得主要剩余高度，串口区首屏至少露出标题、连接状态和发送入口；终端可折叠，不挤成只有一行的记录。窄窗口内部控件换行，必要时切右栏全宽视图，不能横向溢出遮住按钮；不在本轮重做完整手机 IDE。

## 6. 验收与边界

- 选 ESP32/FireBeetle 后两个模式均可切；当前主控白粗体、选中设备卡蓝框、重新打开库仍正确。
- 编程模式可以添加/选择角色、进入造型/声音、执行真实运动/外观积木和脚本点击；切回来仍保留积木、素材及目标。
- 已加载六模块的项目可编程→手动代码→保存→重新打开→上传，模块 ID/积木/引脚、所选视图与手稿不丢；旧 .ob 无附加字段仍可载入；回滚恢复同样保留这些状态。
- ESP32 切舞台不产生 Firmata 握手、刷写、隐式波特率改变或虚假 protocol 状态；串口收发仍走唯一会话。Uno 的协议能力单独回归。
- 自动生成来自真实积木，手动内容为实际 controller 输入；切模式、造型、声音再返回不丢手稿；两个来源标签往返均保留手稿，显式覆盖动作的取消分支也保留手稿。
- 上传主区和原生进度窗看到同一 job/logs；busy 禁止模式/设备切换，释放串口后才上传；本轮设计不实际操作 COM3。
- 菜单六项目按钮、保存/导出、原生文件标题/告警、React16/19 边界及 VM 原始字节不变。实现后由开发与测试做浏览器验证，不把本设计标为 UI 已验收。

主控已补充 REA 结果：原 ASAR 分析超时保留证据后，抽取 6 个 GUI 模块的有范围静态分析成功，文件为 .runtime/mindplus-mode/selected-summary.json / selected-evidence.json，父证据 ev_f21eb46f42189ee79953f8750b7d4a0f560a811fe378ff326cf57d14a70b7885；不将选定模块分析称为桌面应用全覆盖。

本分支仅写本文件，没有修改应用、调用服务或访问串口。主控需冻结：独立 UI 模式与运行态映射、project.json.cfzn.editor 的最小元数据及原生 programMode 规范规则、代码草稿/覆盖规则、GUI hook 接点；既有 Hardware v0.2 HTTP 与控制器边界保持一致。
