# 主控与模块工具箱类别前端提案

日期：2026-11-11。角色：前端接口设计，gpt-6.1-sol / ultra。仅调查与设计，供主控冻结契约；本轮不改产品、不改 VM、不启停服务或访问硬件，不递归派工。

## 1. 收敛方案

用一个 **GUI 层 composeToolbox** 统一工具箱呈现：编程模式保留 Scratch 基础类别；其后追加当前主控的一个类别，内部用标题/分隔线收纳引脚、串口、数据等分组；每个已加载模块仍是一个独立类别。上传模式保留原适用基础类别，再追加相同主控/模块类别，继续使用真实 Arduino 生成器。

选板只换主控，不自动把用户从编程模式切到上传。两种模式都允许加载兼容模块；编程模式中的 upload-only 硬件块明确标记“仅上传模式”，禁用拖用，不声称 ESP32 实时协议已实现。已有上传块的实时执行须有可见阻断，不允许静默 no-op。

模块代码从 Vite publicDir 迁入 **可构建的源码模块图**；图标、官方 GUI 静态资源仍留 publicDir。六模块使用固定 loader 注册，不接受项目文件提供的 URL，不通过关闭 overlay、eval 或放宽 VM 能力绕过错误。

## 2. 按要求实际执行的 REA 调查

已读 D:/rea/.agents/skills/reverse-engineer-anything/SKILL.md 与 javascript-applications、evidence-workflows、connection-and-recovery 指南。当前工具清单没有 REA MCP，直接使用已安装 CLI，不修改连接注册。

复用 docs/design/mindplus-desktop-mode-observations.md 的 shipped snapshot：D:/mindplus dev/Mind+/resources/app.asar，Mind+ 1.8.1-202506121900 / RC3.0。历史 ASAR SHA-256 为48c783ff8b907f98728179b9abf8311b5e4d05db7a570165101147f9b0ee1f59；本轮缓存 renderer .runtime/mindplus-mode/d499c0b3eabcd3c5bbad.chunk.js 的 SHA-256 为8474711b476369ea3b3ceec5e51df9f40930b88b40704f48632a22d50c2cb213。Win32_Process 本轮查询未返回 Mind+.exe，故不声称当前运行观察；没有尝试启动它。

只从该缓存 renderer 取4个原文模块，记录偏移/哈希，以数组包裹原 webpack 函数表达式保证独立语法，绝不执行。该 renderer 有嵌入包导致相同模块编号重复，已按源码内容及偏移消歧，不能仅凭428/330编号认定模块。

| 选定模块与偏移（UTF-16） | 静态事实 |
| --- | --- |
| 2386，29893652–29958401 | Scratch Blocks.getToolboxXML 第955–971行读取 runtime.getBlocksXML，交给工具箱工厂；类别更新走 GUI workspace.updateToolbox |
| 428，20511402–20542527 | 工具箱第77–90行先组装 motion/looks/sound/events/control/sensing/operators/variables/myBlocks，再追加 categoriesXML，选主控不会在此工厂替换基础类别 |
| 330，20393483–20430403 | Arduino 工具箱第87–108行使用 control/operators/variables/myBlocks 等适用分类，再追加扩展XML；与Scratch基础集合独立 |
| 1009，21229074–21283991 | ExtensionLibraries.handleAddExtendItem 第80–108行先 loadExtensionURL，成功后更新已加载状态并 board.addModule；handleLoadModules 第184–217行按主板和模块身份恢复 |

本次使用 .runtime/rea-tools/node-v24.22.1-win-x64/node.exe + D:/rea/.published-runtime/node_modules/rea-agents/scripts/rea.mjs analyze-javascript-application，精确选择上述4文件，45秒/文件上限，无全量大包重跑。结果：4/4解析成功，0解析失败，187698字节，17799 AST节点。父 Evidence ID：**ev_ee29b19979070083651183ddbd40708ac86bb673a9e1b21642da3d687da0a648**。

证据均位于 .runtime/toolbox-categories-research/：rea-summary.json、rea-evidence.json、selected-provenance.json、findings-summary.json、key-source-excerpts.json、raw-module-*.js、selected/module-*.js。application coverage=partial，semantic coverage=unknown，4476语义未知项；静态依赖并未全部纳入，不能称完整调用图或运行时加载验证。上一轮已完成的模式REA片段不重复分析，原证据继续可追溯。

官网既有 .runtime/connection-modal-research/scan.json/scan-assets-loaded.png 亦显示 FireBeetle ESP32-E 被选中时仍存在运动/外观/声音/事件等Scratch基础分类，并在后方显示主控类别；该官网页面由模拟Link驱动，仅是受控浏览器UI观察，不是硬件验证。本轮没有重跑该扫描或执行任何 Mind+ VM/固件。

## 3. 当前两项缺陷的代码原因

| 缺陷 | 已核实的当前代码 |
| --- | --- |
| 选主控后基础类别消失 | extensions/adapter.ts selectController 在 loadDevice 后对 controllerIds 显式 rawMode(false)；ModeController.editorMode 又直接派生 runtime.isRealtimeMode，所以会把用户模式带到上传 |
| 原生加载也可能切模式 | GUI containers/blocks.jsx:478–512 根据 dev.programMode/defaultProgramMode 决定原生模式；当前GUI hook跳过了该分支的大部分自动设置，但不能消除外部 adapter 的强制 false，也不能假设所有导入/切板路径都已保留模式 |
| 基础集合随之改变 | GUI lib/make-toolbox-xml.js:776–803 在有device且非realtime时只输出事件/控制/运算/变量/自制积木；这是模式规则，不是缺少Scratch模块 |
| 主控分类分散 | GUI getToolboxXML 把 runtime.getBlocksXML 的每项直接交给原生工厂；原生设备输出多个category，引脚/串口/数据自然被追加成多个顶级类 |
| 编程模式模块消失/不能加载 | library.ts 禁用 realtime 模块卡，adapter.loadModule/registerModule 都拒绝runtime.isRealtimeMode；VM getBlocksXML实时分支也不追加已加载deviceExtensions，原始硬件块还会按info.programMode过滤 |
| Vite publicDir import overlay | vite.config.ts publicDir 指向 .runtime/web-openblock；prepare-openblock.mjs:115–121 将 blocks/generator/toolbox/translations.mjs 放进该目录；adapter.registerModule 再对 /cfzn-extensions/... 动态import |

本机 Vite 实现 apps/web/node_modules/vite/dist/node/chunks/config.js:27427 明确拒绝 publicDir 内非asset的JS/CSS import，与用户报告错误吻合；@vite-ignore 只影响导入分析，不会把 publicDir 文件变成源码模块。本轮未自行启动服务重现 overlay，不把静态定位写成浏览器修复通过。

## 4. 两种模式的最终类别规则

| 状态 | 顶级类别顺序 | 主控/模块硬件执行边界 |
| --- | --- | --- |
| 编程，无主控 | 原Scratch基础集合 + 已加载舞台扩展 | 真正舞台积木/角色/造型/声音执行保留 |
| 编程，已选主控 | 原Scratch基础集合 → 一个当前主控类别 → 每个模块独立类别 → 已加载舞台扩展 | 有真实realtime实现的板块按已有能力启用；ESP32/FireBeetle/S3/Aijite及六个upload-only模块显示禁用块与说明 |
| 上传，已选主控 | 原适用的事件/控制/运算/变量/自制积木 → 一个主控类别 → 每模块独立类别 | 块可拖用，实际Blockly.Arduino生成并走同一编译/上传控制器 |

“原Scratch基础集合”沿用原生target特定差异，例如舞台没有运动块；不能为了固定类别数改变舞台/角色语义。上传模式不强行加入无Arduino生成器的运动/外观/声音。舞台扩展加载状态保留，上传视图按现有规则呈现，不把其源码误当硬件代码。

主控类别内部示例：

~~~text
运动 / 外观 / 声音 / 事件 / 控制 / 侦测 / 运算 / 变量 / 自制积木
ESP32
  仅上传模式（编程视图且无实时能力时）
  引脚
    原引脚积木…
  串口
    原串口积木…
  数据
    原数据积木…
雾化模块
人体红外
…其它已加载模块，各一个类别
~~~

这是GUI XML呈现层合并，不重命名opcode、扩展ID、category菜单影子类型或引脚值；保存仍使用原生device/deviceExtensions/targets。主控顶级类别ID建议 cfzn-controller-{canonicalDeviceId}；模块沿现有catalog.categoryId（如ATOMIZER_CATEGORY），不出现多份同ID类。

## 5. 不修改VM的最小接入

### 一个 GUI composeToolbox

在当前 GUI containers/blocks.jsx.getToolboxXML 的精准hook调用外部 composeToolbox，并把原生makeToolboxXML函数及原参数传入。不要替换runtime.getBlocksXML或generateXMLfromBlockInfo的函数体，也不要全局伪造programMode。

composeToolbox分三种输入来源：

1. 基础类别：继续调用原生makeToolboxXML，明确传当前UI模式和目标。编程用原Scratch集合，上传用原Arduino集合；不把主控块作为基础category的替代值传入。
2. 主控类别：在GUI handleScratchExtensionAdded 已有输入 extensionInfo.categoryInfoArray 上建立只读呈现缓存，按deviceId归属记录原始categoryInfo.blocks.xml/原名称/顺序。这个输入位于VM过滤之前，包含真实已注册block和menu定义，不需切换runtime模式才能取XML，也不需读写VM私有数组。BLOCKSINFO_UPDATE/切板/语言更新时更新缓存。
3. 模块类别：adapter完成真实注册时，记录其原toolbox.default()经toolboxForDevice修正后的XML；按runtime.getLoadedDeviceExtension()的实际已提交ID列表投影。缓存只是可重算XML，不是第二套已加载或归档状态。

主控XML用DOMParser处理：取各原category子节点，在一个新category中按原顺序加入label/sep和原block/label节点；不要嵌套category，不用正则改opcode。保留target filter/hideFromPalette及原影子值；编程视图为仅上传块添加disabled属性及分组说明。不同子类的菜单定义仍由原注册流程处理，不塞成可见的顶级菜单类。

现有runtime.getBlocksXML(target)仍可用于正常舞台扩展，但其中的已归属主控项必须剔除，避免重复顶级类。上传模式中正常deviceExtensions也去重；编程模式从外部模块XML缓存补齐VM原getter未包含的项。更新走原GUI的updateToolboxState/workspace.updateToolbox，保留选中category与滚动，只有原选中类消失时才回默认类。

### 模式单一归属

选板前捕获当前editorMode；loadDevice/native注册可能短暂按设备默认值配置，但事务结束前必须恢复用户模式并等待toolbox就绪。移除selectController里的无条件rawMode(false)；GUI自动模式分支对CFZN已有模式意图只同步主控，不重新推断用户选择。导入以归档programMode为准，新建沿现有默认，不能把旧页内状态覆盖新文档。

这次选板/装模块不调用硬件连接、不变更串口配置、不刷固件；加载过程只标记一次主控/模块内容变更，内部模式恢复不制造额外dirty。不要通过给upload-only设备添加realtime能力字段解锁类别。

## 6. 模块装载修正

建议prepare将24个可执行ESM（六模块×四注册部分）生成到 apps/web/.generated/extensions/{id}/{kind}.mjs，**该目录属于Vite源码，不属于publicDir**。使用现有moduleSource转换真实vendor函数，保持blocks/translations/generator/toolbox原实现；不执行外部项目URL。

新增固定module-loaders.ts，以显式import或受编译期静态glob支持的固定目录建立六个loader。注册函数仍收到现有iframe的Blockly实例，React16/19不变。生产build由Vite输出受管理的chunks；开发时由源码模块图加载。图标等URL仍留public资源，不能因为修代码加载改坏iconURL。

prepare缓存命中条件须同时确认源码ESM已生成，输入指纹覆盖vendor和转换器；仅有旧public manifest不算完成。apps/web下依赖/生成目录约定和根锁文件归属由主控协调。本轮不要以server.fs.strict=false、关闭overlay、动态Function/eval、任意HTTP import或把JS改为url字符串来代替源码模块加载。

loadModule/registerModule移除“只要realtime就拒绝”的总条件，改为检查主控、兼容性、忙状态。先载入四注册函数并校验，先完成translations→definitions/generators→toolbox注册，然后确认真实Blockly.Blocks和Blockly.Arduino函数存在，再提交已加载状态。保持已有transaction回滚与同ID幂等，不在函数加载失败后留下已加载卡片。

当前成功等待条件要求模块块出现在“当前flyout”，这依赖用户选中类别；应改成注册函数存在且compose后的对应module category包含预期opcode。加载成功后可选择该模块category，但不能因为用户停在运动类就判失败。所有注册都完成后再显示“已加载”。

## 7. 未实现实时执行的明确边界

编程视图允许模块登记、保存、查看，并不承诺六模块已有VM realtime primitive。雾化器等当前vendor文件只有Blockly定义与Arduino generator，单纯让积木可点击会造成未知primitive或静默无效。

首期采用主控建议的最小边界：无实时实现的模块/板块在编程flyout中disabled，顶部说明“仅上传模式：切换上传模式后编辑、生成并烧录”；模块卡仍可加载，不以灰块伪称功能已执行。切上传后这些块恢复可用，并用原generator产生Arduino代码。不增加实时协议/固件。

已有项目里保留的上传硬件块不能因切视图被删除或永久写成disabled。GUI对其显示警告；绿旗/运行命令及stackclick进入VM前，按已登记的不可用opcode集合做运行检查，遇到将执行的上传块（含所调用自制积木）明确拒绝本次启动，提示具体块及切换上传方式。Arduino启动帽下的独立上传脚本不作为Scratch绿旗脚本执行；无硬件调用的Scratch脚本仍可运行。

GUI容器 controls.handleGreenFlagClick、父桥RUN和Blocks工作区stackclick转发是已有可接入口；不要改vm.greenFlag、runtime执行器或getOpcodeFunction本体来掩盖缺口。开发须把键盘/角色点击/广播等舞台入口同样纳入可运行脚本检查，至少保证混合项目被检查后才进入舞台执行；若入口无法完整覆盖，应在编程视图将含不支持块的可运行脚本明确整体锁定并提示，不能接受“可能静默跳过”为通过。仅为展示而disable的UI状态不写入原生项目block数据。

这样可以用既有GUI入口完成当前类别/模块需求；无需修改openblock-vm或把Mind+实时实现搬进来。实际Uno硬件实时积木沿已有真实资格判定，六个模块即使在Uno上也不因基板支持实时就自动获得realtime实现。

## 8. 兼容与归档

不增加HTTP、数据库、账户、工具链或新的项目metadata字段。原.opcode/字段/变量/自制积木/deviceExtensions顺序与素材均保留；工具箱显示ID不进入块身份。沿已冻结Mode UI归档适配器保存模式/手稿，不能用此次分类修正回退旧设计草案。

恢复路径允许在编程模式注册模块定义与generator，再由compose显示disabled类，不要求把整个用户界面切到上传；如原生导入器必须以upload完成安装，可在其既有受抑制内部阶段执行，最终恢复归档模式。失败回滚保留原板、模块、草稿、素材与模式。换板仍用现有assertControllerCompatible和目标引脚能力检查，不能因类合并放宽GPIO/ADC菜单；如FireBeetle D2仍是GPIO25，Aijite仍排除IO3。

生成/手写来源及HardwareController未变；用户切回上传后执行真实生成，生成错误仍阻止编译。不要为维持两种模式显示而把所有积木送给Arduino generator，Scratch运动等不在上传工具箱且不能被误报为生成成功。

## 9. 开发与验收顺序

1. prepare输出源码模块 + 固定loader；开发页加载雾化器等六模块无publicDir import overlay，失败/重试不产生半注册；build/preview同样可加载。
2. 去掉选板强制上传；在五板编程/上传中分别选板、重复选择、换兼容板，保持用户模式。
3. composeToolbox统一基础/单主控/各模块类别，语言切换、角色切换、原生工具箱刷新后无重复/丢失；类内分组和所有原pin/menu值正确。
4. 编程模式可以加载多个模块并分别看到独立类；upload-only块明确禁用/说明；纯Scratch移动、造型、声音及脚本点击实际运行；已有混合脚本明确阻断不假成功。
5. 上传模式六模块分别及组合使用真实积木生成代码，雾化器包含pinMode/digitalWrite等实际代码；不做串口实测或新实时固件。
6. 在编程模式含模块的完整.ob保存后全新iframe恢复，再切上传继续生成；角色、素材、手稿、模式、模块和引脚都保留。兼容切板失败、模块导入失败回滚保持原项目。
7. VM源码/打包VM字节未改；现有五项目按钮、连接弹窗、统一HardwareSession和3002作业流程回归。真实硬件测试若未执行明确标注。

## 10. 主控待冻结与未知项

待冻结仅三项：两模式类别顺序/单主控合并规则；编程模式允许登记但禁用upload-only块和运行前检查的边界；可执行模块移出publicDir的生成/loader约定。HTTP和硬件协议无需变化。

本轮Mind+结论是缓存shipped代码与已有受控官网UI观察的组合；不含2026-11-11运行中的Mind+事件追踪，也未复现用户Vite overlay。REA图有上述未知依赖，但已定位的工厂拼接、真实扩展装载与当前CFZN代码原因足以进入实现。无需为消除这些未知再全量分析或启动Mind+硬件连接。
