# 积木工厂工作台前端设计

本提案依据旧爱集特积木工厂的 `src/App.jsx:2280` 表格与 `src/App.jsx:2396` 编辑页、`src/components/Editors.jsx` 生成器编辑器，以及 CFZN-IDE 的既有私有模块流程。数据字段与编译入口以 `docs/api-contract.md` 主控冻结版为准。

## 工作台与操作

- 从「模块扩展」进入现有私有目录。「新建模块」「创建新版本」「查看详情」打开工作台。页眉放返回、标题、保存及详情态的添加入口。沿用弃稿确认、提交错误反馈、原版本可恢复及返回扩展库后的筛选和焦点恢复。
- 宽屏采用旧版左右布局，左栏约 360 px，顺序为模块信息、外观、Arduino 头文件、Arduino 库。右侧填满剩余空间。窄屏上下排列，表格区域允许横向滚动。外观颜色实时更新真实积木预览。模块信息包含现有名称、说明、作者、版本、类别和兼容主控。保存后显示服务端标识，积木 opcode 仍由不可变模块 ID 与单行积木 key 组合。
- 右侧 `Block Definitions` 卡片顶部放 `Function`、`Output`、`Boolean`、`Hat` 四个新建按钮。表头按旧版保留 `Op Code`、`Preview`、`Block Logic`、`Action`。每行独立显示真实预览。`Edit` 内嵌编辑 key、积木文字、参数类型、下拉选项及默认值。`Block Logic` 打开该行的 C++ 模板编辑与参数插入按钮。`Delete` 明确到行并确认，最后一块可先另建一块。新增块立即打开对应编辑区域。预览/编辑区域保留行的稳定身份，修改 opcode 或其他行时避免重建正在输入的编辑器。详情下支持查看外观和代码。
- 「编辑头文件」打开同一工作台内的 `全局声明和头文件` / `setup() 初始化` 编辑面板。Arduino 库展示名称与精确版本，提供搜索、添加及移除，加载、无结果与失败分开显示。库条目取自受控官方索引，编译解析以主控冻结的后端契约为准。旧版有脚本式生成器、MicroPython、ZIP 及本机路径发布入口，现有私有模块使用受限 C++ 文本模板、模块保存与添加至作品流程。

## 原生编辑器与预览

- 在 `scripts/openblock-hooks.mjs` 扩展库渲染挂点，把同一个原生 `containers_code_editor` 作为尾部参数传入 `makeLibraryRenderer`。pinned GUI 中它是负责测量的 React 类组件，直接包装 `react-monaco-editor`，没有 Redux 连接。`mode-ui.ts:96` 已用它。工厂以本地 `value` / `onChange` 管理草稿，传 `language: 'cpp'`、`theme: 'vs'`、有标签的 `options` 和明确容器尺寸，通过 `editorDidMount` 与 `ResizeObserver` 在显示时布局。设定 `readOnly` 支持详情及忙碌状态。同一时刻仅挂载使用中的代码编辑区域。各字段变化、选区、撤销和保存与作品上传窗独立。
- 当前工厂从 `adapter.blocks` 取 Blockly，该字段只在 `deviceReady()` 调 `captureBlocks()` 后设置。新会话若无主控，或原生积木已经挂载但从未经过扩展事务，工厂取得 `undefined`。在现有 `attachPaletteSearch(B, workspace, …)` 的原生工作区注入后同步发布 Blockly 实例与工作区，配对 `detachPaletteSearch(workspace)` 时只清除同一工作区。发布后通知既有 `adapter.subscribe` 的库视图，覆盖打开后晚到的工作区。通过工作区身份约束失效和重新挂载。扩展事务继续使用原生设备准备与引脚同步检查。
- 复用 `customBlockJson` 与 `renderFactoryBlock` 在只读临时工作区绘制每行 SVG。定义、颜色、形状和引脚下拉与项目中的真实积木使用同一构造器。仅在行的可见输入发生变化时重绘。先从当前主控或已勾选的兼容主控取预览引脚，否则显示占位引脚。维护临时命名注册、`mainWorkspace`、事件禁用计数和字段缓存的对称恢复。工厂预览不进入作品 XML、撤销历史或保存状态。无主控、首次打开、新增四形状与重新打开均须出原生 SVG。输入暂时无效时显示可定位的校验反馈，无法挂载时区分等待与真正出错。

## 生成与验收

- `Function`、`Output`、`Boolean` 分别沿用 `command`、`reporter`、`boolean`，`Hat` 使用 `shape_hat` 做 Arduino 顶层入口。帽块无前连接、有后连接。预置 Arduino `check_` 允许这种顶层和其下游堆栈，帽生成器返回语句字符串，跟随积木继续走 `scrub_`。运行范围是 Arduino 顶层 `setup()` 堆栈，不提供新的实时事件。原生 `control_forever` 特判仍只识别 `event_whenarduinobegin`，自定义帽下仍按原生普通循环生成。
- 头文件、块逻辑和库引用随不可变模块定义保存。代码仍经受限 `{{NAME}}` 参数替换，表达式返回优先级元组，语句返回字符串。行预览与安装读同一套外观数据，缺省外观使用已存 v1 的紫色样式。已添加的模块与归档通过相同模块 ID 恢复。工厂中的默认参数示例标识为示例，安装后以实际块连接和原生代码生成结果为准。
- 在开发页与生产包验证首次无板打开、跨模式打开代码编辑器、四种真实预览图、参数/颜色即时更新、取消草稿、重开后恢复版本与库引用。装入新模块后验证真实拖出、报告/布尔嵌入、帽块与其下游代码生成、作品保存/恢复。检查退出工厂后原工作区、撤销记录和上传编辑器状态，复核 OpenBlock VM 与 Blockly 上游模块字节。实体设备结果按实际验证单独记录。
