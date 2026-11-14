# 前端开发交接

## 2026-11-12 模块兼容角标边框对齐：最终冻结

已按 `docs/api-contract.md` 最前“模块兼容角标边框对齐”冻结条目实施。产品源码及构建现已停止修改，真实 dev/dist 六模块卡片几何、宽窄/缩放与加载移除交互验收交主控安排的独立 Sol low；开发侧没有启动浏览器，不将源码/构建核对当页面验收。

- `scripts/openblock-hooks.mjs` 仅调整两条现有 GUI hook 的输出：`cfznCard.badge` 从图片容器内部移到外卡根直接子节点，与 `cfznCard.select` 相邻。图片容器布局、图片、硬件卡片不显示原生 Coming Soon 的条件及 footer 均保留。47 个精确 GUI 片段及既有上游 SHA/唯一命中检查保持。
- `src/extensions/library.css` 仅改原角标规则一行：选择器收窄为 `[data-cfzn-library-card] > .cfzn-card-compatibility`，`top/right` 从 8px 改 0，贴卡片 2px 边框内侧；其余灰矩形样式、max-width、z-index 3、pointer-events none 原样保持。未选板、兼容、不支持共用此位置。
- `library.ts`、目录支持矩阵、加载/移除/筛选/焦点和业务逻辑、Logo、顶部模式、五按钮、依赖、公共接口及后端均未修改。

`npm --prefix apps/web run build` 退出 0，包含 `tsc --noEmit` 与 Vite 构建；日志在 `evidence/module-badge-20261112/build.log`。未增加镜像单测或重跑硬件/归档等无关矩阵。只读核对 67 个 src/scripts/public 输入文件，仅上述两个产品源文件发生 3 行变化，其余 65 个文件字节不变；逐项源 hash 与行差异见 `verification.json`。固定上游 tar 的 178 个 VM、15 个 Blockly webpack 模块与最终 dist 逐模块 SHA/字节一致，runtime 与 dist GUI 完全相同，47 hook 均限 GUI src；Logo PNG 字节保持既有身份，editor JS 内容 hash 亦未变化。

冻结证据目录：`apps/web/evidence/module-badge-20261112/`。`frozen-manifest.json` 记录全部最终产物，`verification.json` 记录源码范围及保护模块逐项结果，`baseline/` 保留改前输入身份和两个变更文件副本。

| 最终产物 | SHA256 |
| --- | --- |
| openblock-vendor/openblock-gui.js | 534E11D74533CF04D869E94FCFFC4D96BDB945236358542B654D1B0DEC2EFDA9 |
| assets/editor-BYnA3_tl.css | DB20BD560C64108CBB498301BF570AD5897393B6048B6D4A1799C45ACF49B90E |
| assets/editor-BYzD-xt1.js | 9D1FC47EEBFA3242C64554044965DE6C6BC2D7FB168007B7693C3A33AE323B2B |
| branding/IDE.png | 18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F |

本轮未启动服务/浏览器，未操作用户 5173/3001/3002 或 COM3，未编译烧录，未递归派工；没有本轮自建服务或浏览器需要清理。独立测试必须读取最终上述冻结文件，并测角标相对**卡片**而非图片的上/右边距；卡片实际 2px 边框内侧为期望零偏移。

## 2026-11-12 顶部Logo资源与缩放：最终冻结

已按 `docs/api-contract.md` 最前Logo冻结条目及两侧brand-logo设计完成。产品源码及构建现已停止修改，等待独立Sol low。范围仅apps/web资源/GUI挂点/Logo样式/prepare检查与交接；HTTP、依赖、归档、后端零变化，既有v0.7行为保持。

- 将用户F:/Desktop/IDE.png原字节复制为public/branding/IDE.png（普通文件，1318×509，275981字节），不裁剪、重编码或重新生成。运行只用同源/branding/IDE.png，不依赖桌面路径。来源与SHA记录于BRANDING.md。
- 新增1个固定GUI MenuBar精确挂点（总47个GUI片段）：CFZN实例的同一img在isOverflow正常/溢出两状态均用新URL，alt为CFZN IDE并加data-cfzn-brand-logo；保留原class、draggable=false、onClickLogo及其他overflow逻辑。不替换其他图片、不新增点击跳转。
- native-project-toolbar.css只新增Logo标记范围的120×40 CSS px盒、同值max尺寸、contain/居中及flex:0 0 auto，删除宽/窄两处旧Logo height:auto。其他菜单、媒体查询、五按钮/保存状态、细滚动条和顶部模式控件不改。prepare沿原复制链路，仅在requiredOutputs补branding/IDE.png，使缓存缺图也可重建。

构建/TypeScript通过（evidence/brand-logo-20261112/build.log）。源/项目public/生成缓存/dist四份PNG均为相同SHA256及275981字节；dev/dist HTTP均200、image/png且响应体哈希相同。VM178个、Blockly15个原始模块再次逐字节一致，新增挂点仅GUI；mode-ui.ts、mode-controller.ts、mode-ui.css、openblock.ts、App.tsx、native-project-toolbar.ts的完整源文件哈希均与本轮前相同。证据asset-and-source-verification.json、protected-source-baseline.json、upstream-byte-comparison.json在本轮evidence目录。

仅做一组短dev/dist宽度变化冒烟（scripts/verify-brand-logo.mjs --dev / --dist）：2560→1200→1199→800→1440，实际原生isOverflow覆盖false/true；同一DOM img始终新URL、120×40、natural1318×509、contain居中，菜单始终48 CSS px，Logo纵向位于菜单内，五按钮/保存状态/两个模式文案与原class/draggable/callback引用均保留，pageerrors=[]。截图与dev-smoke.json/dist-smoke.json同目录。当前实例没有onClickLogo回调，未宣称验证不存在的点击或键盘动作。

验证边界：这是viewport宽度变化，未执行浏览器UI缩放或DPR变更；更多缩放/设备像素覆盖交独立测试。没有新增镜像单测或重跑硬件/归档/完整v0.7矩阵。未启停用户5173/3001/3002、未操作COM3、未递归派工。测试逻辑结束后存在的本轮helper已按实查自有PID树定向清理，cleanup-verification.json记录remainingOwnedScripts=[]；未清理其他会话或被审批拒绝的REA目录。

冻结详情及全部产物SHA256见evidence/brand-logo-20261112/frozen-manifest.json：

| 产物 | SHA256 |
| --- | --- |
| branding/IDE.png | 18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F |
| openblock-gui.js | E3B1E80E0D1D2DF14F881288BEFACB0ED3A7BE863CAF749EA0ACFEE0C9D28086 |
| editor-BRr_St-Y.js | 9D1FC47EEBFA3242C64554044965DE6C6BC2D7FB168007B7693C3A33AE323B2B |
| editor-C8aZSiQs.css | F10C59145A039875B08D92F7A5E77312A66EA1A7B2063A32A34D7FDF8C31A7FD |

## 2026-11-12 Mind+ 网页功能补齐 v0.7：最终冻结

权威范围为 `docs/api-contract.md` 顶部 v0.7。产品源码及构建现已停止修改，可以启动独立 Sol low；本节替代下方旧产物冻结记录。改动仅在 apps/web，未改 HTTP/schema/依赖、根 tests、VM/Blockly 源码或打包模块。顶部右侧 renderControls、mode-controller.ts、mode-ui.css 保持原样。未触碰用户5173/3001/3002服务或COM3；没有递归派工。

### 搜索撤销历史局部修正：重新冻结（2026-11-12）

独立测试发现原生UpdateToolboxFinish虽run为空，却继承Abstract的Events.recordUndo=true，因此每轮搜索展示刷新向主workspace撤销栈加入toolBoxFinish并清除redo。不能将其视为无害UI事件。

本次只改既有GUI updateToolbox精确挂点：保存this.ScratchBlocks.Events.recordUndo，在同步palette装饰及workspace.updateToolbox期间设为false，finally恢复原值，再恢复既有flyout recycling。没有跨await持有标志；事件在该同步调用内创建时捕获false，随后仍按原生队列分发，因此生命周期监听保留。调用之前已创建的真实编辑事件携带自身recordUndo，调用返回后的编辑按恢复的原值创建；合法Undo/Redo内部已有false也会原样恢复。不修改VM/Blockly源码或prototype，不clearUndo、不读写主历史数组来修复状态。新增GUI挂点0处，总数仍46。

`undo-fix-build.log`：构建及TypeScript通过。`scripts/verify-search-undo-v07.mjs --dist`用独立随机端口与真实原生Blockly验证：先合法创建/撤销真实积木，保留非空redo，再执行三轮query/clear/close；完整undo/redo事件内容、作品JSON及编辑状态前后相同（undo 0→0、redo 2→2）。13个toolBoxFinish继续到达且recordUndo均false；随后原有Redo成功，再修改实际数字字段27，Undo回10、Redo回27，4项检查全部通过，pageerrors=[]。证据`evidence/mindplus-parity-v07/undo-fix/dist-result.json`。未触碰历史数组，未模拟Undo实现。

其余四类功能沿前一冻结及主控独立通过记录，不重复完整自验；此次没有重跑全量91项，仍保留其已通过基线。已重新逐字节比较178 VM/15 Blockly，仍相同；GUI新哈希及其他产物见下表/manifest。产品源码及构建再次停止修改，相关搜索dev/dist独立复验交主控。

### 最终实现

- 保存：父页面与iframe各自安装Ctrl+S/Mac Cmd+S，复用原PROJECT_TOOLBAR_ACTION/save→App.saveProject和完整归档/revision流程；工具栏鼠标与快捷键共用request/canRequest。就绪、模态/播放器、项目/扩展/模式/硬件/串口忙守卫保留。原生输入blur提交后再保存，保留选区；用户移焦及document.hasFocus=false时不恢复焦点。不抢Ctrl+F/Z/Y；重复、Alt/Shift和组合输入有对应保护。
- 搜索：新增palette-search.ts、palette-index.ts及CSS；原始compose XML只读，native动态category回调取当前变量/列表/过程。每GUI binding复用一个无VM监听的headless Workspace，用真实block.toString索引；按文档/目标/locale/模式/板/已提交扩展/工具箱与实际语义事件失效，原生toolBoxFinish不触发循环。分批异步有generation保护，错误本代终止并可显式重新索引。
- 索引兼容固定上游：只在索引用clone移除各层disabled；过程generateshadows改false，并使用原生ProcedureUtils.buildShadowDom_按原生参数split/argumentids补数字1、空文本shadow，布尔不造shadow。原结果模板XML完整保留disabled、变量ID、mutation/参数、引脚与嵌套shadow；去重只剔除block/shadow实例id/x/y。每item在同步Events.disable/enable内构建和清理所有自身顶层块，包括半构建失败；不跨await禁用事件、不clearUndo。索引完成不Workspace.clear/dispose，不关闭用户新打开的WidgetDiv/DropDownDiv；仅随GUI workspace销毁时dispose。
- 搜索结果走原生临时类别和flyout，可以实际拖出原积木；空查询、清除、Escape/关闭恢复原类别与滚动，类别已移除走原fallback。没有第二VM、Toolbox原型覆盖或手工关键词表。
- 服务：接入localService五态和独立portError，设置及连接界面提供检测/重试和独立烧录端口刷新。能力校验、8s请求/body超时、独立epoch/旧响应隔离、显式profile/port保留和job占有保护由最终HardwareController实现。Progress订阅后立即重取snapshot，避免render→effect之间漏掉快速状态。空主控/非支持主控的uploadProgress仍沿用既有原生路由；服务UI冒烟显式选择支持的ESP32后验证，不将该原生界面视为新诊断面板。
- 终端：nativeHardware绑定创建唯一TerminalModel，UI仅订阅snapshot.logs与setters；使用真实protocolRequested/realtime抑制普通记录，包括Uno握手，ESP32编程模式可继续普通RX。写入成功后才appendSent，旧session拒绝；保留200行/64KiB、输入/格式/行尾/baud草稿/pause/message及隐藏期接收，不另开reader/writer。RX/TX仍是显示方向标记，未按用户本轮提问擅自删除。
- 扩展库“已加载”：取原生stage manager/currentDevice/adapter.loaded实际状态，各有效大分类记忆独立开关，两个主控入口共享controllers；类型AND已加载AND兼容AND原生搜索。清除筛选复位，取消勾选不卸载，展示不产生dirty。

### 验证与证据

前一v0.7完整基线 `npm test` **91/91**，`npm run build`（含TypeScript）通过；日志为 `evidence/mindplus-parity-v07/unit-tests.log`、`build.log`。`scripts/verify-upstream-bytes.mjs`逐模块证明 **178个VM+15个Blockly**完全相同，结果upstream-byte-comparison.json。GUI新增4处精确挂点（attach/detach/render/post-update），修改既有updateToolbox挂点以装饰展示XML，总46个GUI片段；所有片段均固定SHA输入及匹配数校验。

dev关键冒烟在最终Progress双快照修正前通过；前一冻结dist `scripts/verify-parity-v07.mjs --dist`全部checks=true、pageerrors=[]：真实中文搜索与清除无dirty；动态变量/列表及%n/%s/%b过程、参数ID/shadow保留；真实鼠标拖出；iframe首次POST、父层后续PUT、最后输入标题与2..5选区保留；空主控loaded筛选/清除；终端切模式重挂后的输入/格式/行尾/baud草稿保留；ESP32下服务在线而缺profile编译不可用、检测不dirty。证据dev-smoke.json、dist-smoke.json、dist-smoke.log及截图在同目录。API为隔离mock，但保存使用真实完整原生归档并解压检查project.json；不冒称后端集成/412全矩阵/实际硬件验收。

完整locale、禁用模块菜单/shadow、异步竞态、412与模拟串口隐藏期唯一订阅等矩阵交独立Sol low。没有实机串口测试。所有自建浏览器/随机端口测试服务已退出；早期dev关闭挂起的已核对仅本轮脚本PID并清理，owned-process-cleanup.json及cleanup-verification.json记录。未删除被审批拒绝的REA临时目录。

### 冻结产物

完整SHA256与大小见 `evidence/mindplus-parity-v07/frozen-manifest.json`。

| 产物 | SHA256 |
| --- | --- |
| app-WvfxpJny.js | 2D989C3351A29A23F114565BBF432F21191F4703FB394B3E3D17D19B4368C176 |
| editor-BqeCIwvM.js | 9D1FC47EEBFA3242C64554044965DE6C6BC2D7FB168007B7693C3A33AE323B2B |
| editor-BwFLiudp.css | C3A8F4AEE438E128C6968B34538472D29AA3998A6A784574EEFF19F02347B091 |
| save-shortcut-DZCizx91.js | E1176DDF804797080DD9B9CE9BA59A361294097DD82E3CF3D0163351D7F7058E |
| openblock-gui.js | C0C8A51D40D0EEE40C84541601915CC83D1454BF2D35ADFDF320F016CF1699B3 |
| module-loader.js | A2564C8772E19271635F1A935D3516CEABA305D26B63672C3E81632049348207 |


## 2026-11-11 两个主控入口共用目录：局部冻结

本节为最新冻结，替代下节 editor-u0ep3dyT。已完整阅读契约末尾“两个主控入口共用目录”及两侧短设计。产品只改 `src/extensions/library.ts`：两入口主控候选都取同一 nativeProps.deviceData 的有序可见投影，排除 null/undefined、字符串null及hide:true；不再按nativeDevices/五板controllerIds截断。保留现有条目及元数据原顺序。

原生入口的有效分区固定controllers，类型选择、清除筛选、原生搜索重置和卡片映射都使用该有效键。去掉顶部入口的类型过滤旁路和类型行隐藏条件；nativeDevices只保留标题/大分类导航/取消命令等入口外观差异。未知类型在全部和名称搜索保留，具体类型只匹配可信显式元数据。controllerIds、supportDevice、profile/驱动与所有v0.6选中、移除、依赖/引用、模式、忙和硬件守卫均未改。

`npm run build`（含TypeScript）成功，现有48项测试全通过；日志 `evidence/controller-catalog-build.log` / `controller-catalog-unit-tests.log`。178个VM模块逐个字节一致，证据 `evidence/controller-catalog/vm-byte-comparison.json`。GUI源码hook与产物、CSS、App/协议、loader均未改；本轮未新建浏览器测试框架或启服务。按主控分工，两个实际入口的dev/dist有序ID/关键元数据、同查询/类型、非五板选择及选中/移除短链交独立Sol low验证，不将源码/现有单测冒称实际双入口浏览器验收。

冻结 `editor-pi1Qp4cx.js` SHA256 `C51710B097867E3146015325833DD8C10076F55D367D1EFDDEC76B35C3DCB1E6`。GUI仍 `D2FB1A1FA791E6DF812918C2153235931647DAEAD16F8922C9747A8D41BAE4AF`；CSS仍 `479DF13CE126247EAAAD528D1AF5D4C681BF322CEF568C07957B1A15BD23098F`，integration/loader保持v0.6。无后端、根tests、契约、VM、用户服务或COM3操作。源码/构建已停止修改，可立即派独立验收。

## 2026-11-11 扩展库 v0.6 冻结交付

主控已冻结本版并启动独立 Sol low；此后不再修改产品或构建。权威需求为 `docs/api-contract.md` 末尾 v0.6，前后端设计均已完整阅读。改动均归 apps/web，没有 VM 源码/打包 VM 补丁、根 tests、后端、HTTP、依赖或共享契约改动；没有递归派工、操作实体硬件或启停用户5173/3001/3002。

### 修改与行为

- `src/extensions/catalog.ts`：五板显式 board；三传感器 sensor、蜂鸣器/雾化器 actuator、注释 function。模块保留实际支持矩阵，支持将来的显式菜单/依赖声明。
- `src/extensions/library.ts` / `library.css`：原生 Library、搜索、图片和舞台行为保留。主控/模块选中取 runtime ID，蓝色2px边框、当前主控/已添加、独立移除按钮；选择按钮与移除按钮同级，避免嵌套交互。主体重复选择幂等，帮助链接保留自己的区域。灰色兼容角标位于图像右上，展示真实支持列表；去掉这些卡片的黄色 coming-soon pill。类型来自完整可信目录，类型/原生搜索/兼容取交集，兼容默认false且无板禁用，空结果可清筛选。类型分区记忆，换分区清原生搜索；原生全设备入口保留原商品范围，不将无主控命令作为商品。当前主控深蓝白字粗体状态保留。所有自有按钮处理Enter/Space，避开原生document快捷键阻止Space的行为；移除后焦点回卡片主体或类型按钮。
- `src/extensions/removal.ts`（新）：查询所有原始目标的全部 block IDs，覆盖其他角色、游离、禁用、过程和shadow；只读检查实际 monitorState 与 isMonitored 的 monitorBlocks，从活动监视块追踪其输入，隐藏持久监视器也算引用，未启用缓存不算。提供稳定原因键及清晰文案。
- `src/extensions/adapter.ts`：唯一 `removeModule` / `clearController(expectedDeviceId)` / `removalState`。身份、过期目标、模块依赖、引用、项目/模式/locale/硬件/串口忙及清板串口占有保护在备份/stop/卸载之前检查，取得锁后再查。模块事务使用原 rawUnload，删除目标 presentation，确认实际 ID/分类消失且其他类别保留；不删共享定义和静态代码缓存，重新加入仍重新注册。外部 native unload/null入口同样走受检命令，内部恢复流程用已捕获原生调用避免递归。成功一次 dirty，拒绝/no-op不编辑，失败保留完整回滚/双失败recovery路径。
- `src/editor-archive.ts`：完整候选归档只改 project.json.device 为规范空对象，模块仍在时拒绝，其余 ZIP 条目与元数据保留。清板经现有 vm.loadProject 生命周期，恢复原模式及完整手稿；不调用直接清板后私填监视器。原空设备导入分支也显式恢复归档 programMode，避免上传档重开被原生空设备分支改成编程。最后工作区刷新等待一轮原生事件队列，清板成功只提交一次编辑，documentId不变。
- `src/extensions/toolbox-presentation.ts`：单模块失效及当前主控真实块/菜单/自定义字段opcode查询，缓存不代表选中状态。
- `src/openblock.ts`：从现有公共 HardwareSession portId/sessionId、协议状态注入清板占有保护，模式/locale过渡共用忙守卫。保留v0.5同VM绑定幂等、手稿、单owner与订阅；类别被移除时回退可用类别。
- `scripts/openblock-hooks.mjs`：固定上游hash与精确GUI src hook增加可选cfznCard状态/选择/角标/footer透传、空结果、原生搜索分区重置、类别回退和locale事务协调；未提供可选数据时保留原行为。选择slot是featured根div直接子节点，帮助/移除区域在其上层；原生移除时以公开Blockly.Device.setDevice(null,null)同步视图，不改VM。
- `test/extension-library-v06.test.ts`（新）：引用查询、候选归档仅改device/完整条目、真实目录类型三项聚焦单测。自验脚本为 `scripts/verify-library-v06.mjs`。

### 验证、证据和运行

`npm test` 48/48，`npm run build`（含TypeScript）成功。日志 `evidence/toolbox-v06-unit-tests.log` / `toolbox-v06-build.log`。178个VM webpack模块与固定上游逐个字节一致，证据 `evidence/extension-library-v06/vm-byte-comparison.json`。

按主控收束分工，开发只做真实隔离Vite dev与静态dist各三组有界冒烟：真实类型+搜索交集/空结果清筛选且不dirty；标题鼠标、Enter/Space添加、选中幂等、模块移除/重加/焦点、跨角色引用拒绝和模块依赖阻止null；清板保留纯Scratch块连接、五项素材内容SHA、完整手稿与编程模式，documentId不变、editVersion仅+1。静态额外点验图片/描述主体和标题命中选择按钮，真实帮助链接区域未被遮挡，移除按钮实际点击成功。无pageerror。已查看1440选中主控和390模块截图：深蓝当前主控、独立移除、类型/搜索/关闭可见，灰矩形在右上。

复跑：apps/web下 `node scripts/verify-library-v06.mjs --dev` 或 `--dist`。脚本自建随机HTTP端口与独立Edge，模拟空项目API/无硬件能力，不使用用户服务、不请求实体串口，finally关闭自建浏览器/Vite/HTTP。结果与截图在 `evidence/extension-library-v06/`，dev/dist-result.json各三组true，日志为 `evidence/toolbox-v06-dev.log` / `toolbox-v06-dist.log`。早期empty exact定位和未滚动到第五卡是fixture错误，日志保留；修正没有扩展舞台产品。

**独立待验范围：**完整原生monitor/舞台扩展、全部引用形态、两模式及新页面归档、真实API字节往返、卸载/清板故障回滚、失败关闭仍占串口和并发忙矩阵。开发引用单测用明确模拟记录，不能当作原生监视器运行证明；本轮没有实体COM3、编译、烧录或传感器验证。当前开发短链无未解决产品阻断，正式验收以独立报告为准。

### 最终产物

- editor-u0ep3dyT.js：`F9A7726421441A4439E277E27F4EE83D8D513060BE090AAB2958D42EA52C3E75`
- editor-B9DwHpTo.css：`479DF13CE126247EAAAD528D1AF5D4C681BF322CEF568C07957B1A15BD23098F`
- openblock-gui.js：`D2FB1A1FA791E6DF812918C2153235931647DAEAD16F8922C9747A8D41BAE4AF`
- module-loader.js保持：`A2564C8772E19271635F1A935D3516CEABA305D26B63672C3E81632049348207`
- integrationSha256：`72d3568d38b08e5a4d54f601281e13ca75b6b94520d8565c49db405fedb4efc5`。App、协议和既有MenuBar布局不变。

## 2026-11-11 v0.5 独立测试派修：同 VM 绑定幂等

最新冻结为 `editor-CaooKnKD.js` SHA256 `1863E2AFEB9C193AF439DD7618FD16212B34601ACE558F508D96318EEECF6091`，替代下节 editor-PDao8tJd。产品只改 `src/openblock.ts` 的 bindVm：同一 VM 且已有 adapter 时直接返回，不再次安装 adapter、loadProject wrapper、ModeController、HardwareSession 或订阅。没有修改 VM、设备注册保护或 GUI hook；GUI SHA256 仍为 `42E0FDDF402A615EB60B13BBAC338AD4BAF473511D2590DDD0D9D4F599825480`，helper/manifest/CSS/App/协议保持上节。

根因由独立最小诊断确认：上游 ConnectedIntlProvider 以 locale 为 key，语言切换会重挂载 GUI，componentDidMount 再次调用 onVmInit，VM 对象却不变。原 bindVm 重复包裹 manager.loadDeviceURL，派生设备注册时基础 ID 又进入上一层 adapter，造成 canonical 同步超时和 rollback 重入。普通干净页不切语言的跨板链通过，语言前后同 VM 的 loadProject/loadDeviceURL 引用变化则稳定复现。

新 GUI 仍执行原生挂载流程以建立工作区及当前渲染回调；原 VMScratchBlocks 返回同一个共享 Blockly 对象，adapter 经 getMainWorkspace 取得新工作区，ModeController.generate 每次接收当前 GUI 传入的 workspace，不保留旧视图指针。因此本次只对 VM 绑定做幂等，不重新创建现有业务控制器或人工重挂载视图。

`verify-programming-archive.mjs` dev/dist定点均通过：中→英→中后 VM、loadProject、loadDeviceURL 引用保持，完整手稿/15块链保留；清空工作区并等待 VM 删除完成，六模块 FireBeetle→Aijite→FireBeetle 成功，模式保持 programming，三个设备视图一致，Aijite 数字菜单排除IO3；之后同一页再次导入原归档恢复15块及手稿，错误0。归档初始往返同时验证五项素材内容SHA、六模块及clean。结果见 `evidence/toolbox-v05/archive-fix/{dev,dist}/lifecycle.json` 和 `lifecycle-dev.log` / `lifecycle-dist.log`。未运行独立完整矩阵。

最终 `lifecycle-build.log`（含tsc）成功，`lifecycle-unit-tests.log` 45/45通过，178 VM 模块逐字节不变。只更新 apps/web 源码、自验和交接；无硬件、root tests、HTTP、后端或用户服务操作。新产物已交主控，独立角色待复验。

## 2026-11-11 v0.5 独立测试派修：完整归档恢复与语言刷新

本节为最新冻结，替代下节旧 editor-D_pU3iT4 冻结。定点修复仅 `src/extensions/adapter.ts`、`src/openblock.ts`、`src/extensions/toolbox-presentation.ts` 和 `scripts/openblock-hooks.mjs`；配套单测、自验脚本、文档和证据均在 apps/web，无 VM/HTTP/后端/root tests 修改。

1. **归档硬件链丢失根因与修复。** 使用独立输入 `tests/evidence/toolbox-v05/2026-11-11T03-43-14-476Z/dist-complete.ob` 在干净 iframe 复现：第一次模块注册后的 workspaceUpdate 仍有15块，但后续模块定义未齐，GUI XML 恢复抛 isConnected 异常；排队事件随后删掉整个 Arduino 链，VM 仅剩纯 Scratch 两块。现在仅对包含模块的归档恢复，GUI 仍组合/更新工具箱以完成模块 ready 检查，但全部模块和原模式齐备前延迟主工作区 XML 重建。最后完整刷新一次，等待原生事件队列一轮，逐 ID/type 确认 VM 与工作区都保留原块后才允许导入成功。延迟标志在 finally 释放，确认失败进入既有归档 rollback；普通单模块加载行为不变。
2. **语言切换后主控分类消失根因与修复。** 原生 BLOCKSINFO_UPDATE 刷新事件没有 deviceId，原捕获函数忽略它；切英文后旧中文缓存被严格 locale 校验排除。现在 GUI 捕获传入公开 vm.getLocale() 的实际语言和 runtime.getDevice() 的实际板卡。无 deviceId 事件只有在 canonical 当前设备与已有主控匹配、且携带完整已关联分组集合时才重建新语言缓存；只复制这些已关联分组，额外舞台/模块类别不并入。严格 device/locale 校验保持。新增第45项单测覆盖别板、舞台、部分刷新拒绝、混入额外 pen 过滤和新旧语言失效。

`scripts/verify-programming-archive.mjs` 是此次定点自验，可用 `--dev` 切换真实隔离 Vite，默认静态 dist，均只使用随机端口并阻断硬件服务。dev/dist均通过：原 Stage0/Sprite15 块与全部连接深比较不变，五项素材引用内容 SHA-256 不变，六模块/原 realtime/完整手稿/clean 保留；导入后等待排队事件、再经过中→英→中，仍不丢链且无 workspace/page error。主控分组实际从引脚/串口/数据变为 Pins/Serial/Data，再返回中文，始终恰一主控分类。原生 Arduino 启动帽编程模式 disabled=true 是原生行为，切上传恢复 false；其他模块工作区块没有被本轮写入禁用状态，归档 blocks 深比较保持。没有为自验 every(!disabled) 改原生帽/主工作区。

证据：`evidence/toolbox-v05/archive-fix/dev/`、`dist/` 各含 `result.json`（输入/恢复项目和刷新轨迹）、`restored.ob`、`restored.png`、`locale.json`；执行日志 `archive-dev.log`、`archive-dist.log`。最终 `archive-build.log`（含tsc）成功，`archive-unit-tests.log` 45/45通过，178 VM 模块字节仍与固定上游一致，`vm-byte-comparison.json` 已更新。此为开发定点证据，完整dev/dist归档API回环和注册失败rollback仍交独立测试复验。

新冻结 `editor-PDao8tJd.js` SHA256 `A3D5E263849CBF174A6D80BE63CBA8C57CF0745FCD795963B6BB07712A109567`；GUI `42E0FDDF402A615EB60B13BBAC338AD4BAF473511D2590DDD0D9D4F599825480`；helper仍为 `A2564C8772E19271635F1A935D3516CEABA305D26B63672C3E81632049348207`；manifest integrationSha256 `197647b2811bd970b293a2e975e27e5d53fe43b31c77c2e101e39a19a0cefa09`。CSS、App和协议保持前轮内容。没有操作硬件或启停用户服务。

## 2026-11-11 Toolbox categories / built-in module loading v0.5

已按 `docs/api-contract.md` v0.5 完成前端实现并冻结，供主控启动独立 Sol low 验收。源码、脚本、文档、测试和证据均在 `apps/web/`；没有修改公共契约、后端或根 tests，没有递归派工、硬件操作或启停用户服务。

### 交付行为

- `src/extensions/toolbox-presentation.ts` 在 GUI 事件边界只读复制主控分类描述，保留目标过滤、hideFromPalette、原生模式能力、菜单/影子/颜色和分组。组合原生基础分类、一个主控分类、逐个模块分类与编程舞台扩展；分类缓存不进入项目归档。仅四款明确的 ESP32 上传主控整体受限，Uno 和其他原生板按各积木原生能力处理。
- `src/extensions/builtin-resources.ts` 协调可重试清单、固定发布版本和失败重试号。`public/cfzn-extensions/module-loader.js` 为唯一 classic 静态加载入口，通过原生 import 返回四类函数；`openblock.html` 提前加载，`prepare-openblock.mjs` 校验和复制 helper/24 个 ESM 资源。没有 publicDir 源码 import、eval、备用实现或 Vite 放宽。
- `src/extensions/adapter.ts` 选择主控和加载兼容模块保持当前模式。资源准备先于完整归档备份、stopAll 和文档变更；准备失败不重新反序列化，注册失败保留真实归档回滚。就绪核对积木、生成器及组合分类中的 opcode，不等待当前 flyout 选择。`library.ts` 允许编程模式加载模块并说明其上传用途。
- `src/extensions/stage-execution.ts` 与 `src/openblock.ts` 在 GUI 绿旗、堆栈点击、舞台键鼠及父层 RUN 入口检查不支持的舞台链路，沿过程调用追踪；独立 Arduino 启动脚本不阻碍纯 Scratch，运行中编辑成不支持组合会停止。上传模式被动键鼠静默阻止，不因 Delete 等操作反复弹错；明确运行操作通过现有模式消息说明原因。`mode-ui.ts` 只给现有错误消息补 alert 语义，串口 RX/TX 呈现不变。
- `scripts/openblock-hooks.mjs` 增加精确 GUI 命中和只读分类捕获。实测发现模式切换时原生 flyout 回收会保留旧 disabled；现在仅模式变化时临时关闭 flyout recycling、更新后 finally 恢复，并对受管 palette 显式生成 disabled=true/false。主工作区不写禁用状态，不修改 VM 执行器、VM getter 或私有类别数组。
- `test/toolbox-v05.test.ts` 新增四项针对性单测；`scripts/verify-toolbox-v05.mjs` 可分别用 `--dev` / `--dist` 在随机端口隔离重跑。接入说明见 `EXTENSIONS.md`。

### 验证与冻结产物

`npm run build`（含 TypeScript）通过，`npm test` 44/44 通过。实际 Vite 开发链路及静态 dist 各七组核心检查通过：模式与原生基础分类；清单503/模块404失败后文档 JSON 不变并可重试；编程模式加载六模块；纯 Scratch 与独立 Arduino 共存；混合执行明确阻止；引脚4→5改变真实 Arduino 代码；编程→上传后六模块实际 flyout.disabled=false 并逐个用鼠标拖出。两种页面均无 pageerror，各28个真实 .mjs 请求且无 Vite import 查询改写。

证据在 `evidence/toolbox-v05/`：`dev-result.json`、`dist-result.json`、两份 `*-flyouts.json`、编程/上传 PNG、`build.log` 与 `unit-tests.log`。已查看上传截图：更多注释两个积木正常着色，无灰色黄网纹，六类真实拖出块均可见。固定上游 178 个 VM webpack 模块逐个字节一致，见 `vm-byte-comparison.json`。

冻结产物：`editor-D_pU3iT4.js` SHA256 `BC3D2D44AE93C90FDE17DE4222BF6E0575A82F6C63E3ABA5B6D68E081AEBAFAD`；`editor-CrSKtmGm.css` SHA256 `CADD3AB820E12F68B04ECC727A39246F4143769D16FBE8AC84C4041A66EEE17B`；GUI SHA256 `5D9AA6908733CA3A2BE55B5C4A7411BC375D9E76370333E15F6E8C230756020E`；helper SHA256 `A2564C8772E19271635F1A935D3516CEABA305D26B63672C3E81632049348207`。manifest integrationSha256 为 `d0a100345f1a1c84a0ed7db66a05b7e6f89816b8527a1c391ef8b5e8b0f57caa`。App / CSS / 协议产物保持前轮内容。

本轮未验证实板传感器、编译烧录或 COM3。按主控要求，跨板完整矩阵、编程归档新上下文恢复及注册失败/双重回滚矩阵交独立测试执行；不将开发核心自验视为独立验收。产品没有已知未解决的本轮核心缺陷。

## 2026-11-10 标题贴邻工具组与浮动消息

按本轮权威附录实现，产品修改仅四文件：`native-project-toolbar.css` 以scoped选择器覆盖MenuBar的space-between为flex-start，tail-menu使用margin-inline-start:auto吸收剩余空间，直接兄弟file-menu与cfzn-project-tools保持原6px边距；保留标题188px基准容器、min/max及窄屏规则。`ProjectNotice.tsx` 为新增React19小组件，`App.tsx` 沿用单Notice状态及原冲突业务按钮，`style.css` 将notice改为父document.body Portal上的fixed居中消息，不占App/iframe布局高度。

普通info/success默认3000ms、支持duration0，hover/focus暂停并按剩余时间继续；错误与conflict始终持久可关闭。Effect按Notice对象清理/重设timer，关闭回调额外核对当前对象身份，防止旧结果关闭新消息。Portal不自动focus，使用status/alert及aria-hidden状态SVG，消息按文本渲染；没有Vue、ElementPlus运行时或全局消息框架。全部既有setNotice结果进入同一组件，新建项目及未保存作品重命名补成功反馈。保存/busy、冲突恢复、确认决策、HTTP与归档语义不动。

`npm run build`（含tsc）通过，按主控要求未加单测或扩大浏览器回归。核心已先交主控派独立Sol low检查标题邻接/消息尺寸/3秒自动关闭/交互暂停/持久冲突/替换timer。代码不涉及VM、串口、硬件、后端、根docs/tests或用户服务。

交付产物：`app-N5hfoMQ-.js` SHA256 `889208BCB737528D0BEF5EB33DFF2EA8C51D6D500D9D13413C059CC177716277`；`app-kk7fVTCm.css` SHA256 `A0A8E427BE737D833CC27038BDBBE1ECA9CF1FEF326DEC0C0043E72EE7E82B07`；`editor-rF8V3vXf.css` SHA256 `4EAC8684D7443820FE3AF670628E3E7B9CF43D731D30B46BBE920268C8D3F335`。`editor-BVvoAVED.js`仍与上轮编辑器逻辑字节相同（8FD114EE…965D5），协议模块不变。

## 2026-11-10 作品名宽度与重复导出入口

产品代码仅两处最小修改：`src/native-project-toolbar.css` 将作品名容器设为 flex 0 1 188px、min108/max228，输入min100/max220；扣除原生左右各4px padding后默认输入180px。窗口<=1199时容器basis60/min40/max100，输入min0，保留原窄屏压缩及工具组滚动。宽屏1776/2560不会增长；选FireBeetle且菜单空间不足的1440允许按flex收至约154px，不会挤走五按钮和模式切换。未改变原生已有名称长度规则或API名称校验。

审计原生软盘：menu-bar 的 SB3Downloader→getSaveToComputerHandler→vm.saveProjectSb3→.ob下载，是重复的“导出到本机”，不是API保存；原生下载器文件名取前100字符，并调用既有telemetry回调。自有导出走toolbar action→App.exportProject→EXPORT_PROJECT→完整归档，保留手稿metadata、编辑版本一致性检查和非法文件名字符处理，导出保持dirty。准备脚本新增唯一、GUI src作用域精确hook，删除仅名称旁saveIcon的SB3Downloader渲染片段；共享下载器、handler及归档/保存逻辑全部保留。

`npm run build`（含tsc）通过。主控已回报独立Sol low聚焦验收通过：1440/1776/2560短长中英文输入不随名称或宽屏增加、五按钮/模式可达、原生图标0/自有导出唯一、真实48357字节归档含5素材/手稿metadata且dirty保持；178个VM模块字节一致。正式报告为根目录 `tests/MENU-TITLE-EXPORT-REPORT.md`，由主控与测试维护。没有新增单测/全面回归，没有操作硬件、用户服务或apps/web以外源码。

最终产物：`editor-HEQ9jwx-.js` SHA256 `8FD114EE3ED20D9260C8502540148881969008DAD67144F9D9DE3D32300965D5`（逻辑字节同上版）；`editor-D6p5thY9.css` SHA256 `1669F7FA70E895FBBB8F235D99F755603ED731B6346CC6ACD0CCB07E0EF10673`；实际GUI脚本 `dist/openblock-vendor/openblock-gui.js` SHA256 `A7796F67820F6B8E5754BCA869D02F337F9390CF5DFC2D9344BBF89A4B1A3B75`。主控负责根文档与独立测试报告。

## 2026-11-10 Connection modal v0.4

按主控契约落地，产品代码仅 apps/web：新增 `src/connection-modal.ts`、`public/cfzn-connection/` 资源及其原始来源清单；改 `hardware-session.ts`、`hardware-controller.ts`、`hardware-types.ts`、`native-serial-socket.ts`、`native-hardware.ts/.css`、`mode-ui.ts` 与 `openblock.ts` 的既有忙状态接点；prepare 脚本将应用 public 资源加入缓存指纹并复制到实际静态目录。原生 MenuBar、真实VM及硬件API沿用原架构，没有新增父消息、HTTP接口或串口代理，也未恢复 SerialPanel。

核心事务为 `HardwareController.applySerialSettings` → `HardwareSession.applySerialSettings`。选择、切换、释放、恢复同步持锁；getPorts 刷新独立于连接状态。设置验证/同值短路在改变 owner 之前完成；打开新端口只发生于旧端口确认关闭之后。打开/流建立失败先清理已取得的目标句柄，再恢复仍获授权的旧对象/旧配置；包含 getReader 已取得、getWriter 抛错时的部分 reader 锁释放。目标清理失败不恢复第二个句柄。读结束/拔出事件绑定 port + generation。失败 close 保留 owner，并阻止编译烧录开始，用户可重试断开。NativeSerialSocket 普通连接不会用设备默认配置覆盖用户设置，真实 Uno 协议配置仍保留单独来源守卫；模式切换仍不触发 ESP32 Firmata。

原生 Redux 波特率/连接名为显示镜像，同值回调不重开。事务中的 closing 不重置原生 socket；真正断开、拔出、恢复失败时通过既有 VM disconnect API 清除驱动连接标记，镜像同步时 socket 不再次尝试释放物理端口。Modal/上传终端只保留编辑草稿，实际配置来自同一快照。系统COM选择与授权设备完全分开，不推断/绑定USB编号；本机服务不可用不会阻止串口通信。

验证：`npm test` 40/40，新增11项有意义事务测试（顺序与写队列、无操作/无效配置、目标/速率失败恢复、原关闭失败、部分流失败、目标清理失败、恢复失败、同步授权取消及占锁、枚举失败及旧事件、原生默认速率/镜像/项目守卫、真实协议占用守卫）；build/typecheck 通过。`scripts/verify-connection-modal.mjs` 隔离 Edge+双模拟串口自验退出0，结果6组全部通过，1440/1000/390px截图中全部表格动作可达；`verify-serial-text.mjs` 的 hello、逐字节中文/emoji、prompt、原始HEX与清空通过，零页面错误、零POST作业。178个VM模块字节保持一致，证据复制至 `evidence/connection-modal-v04/vm-byte-comparison.json`。

终版 `dist/assets/editor-CpXKUff0.js` SHA256 `8FD114EE3ED20D9260C8502540148881969008DAD67144F9D9DE3D32300965D5`；`editor-O6lxRObp.css` SHA256 `C1490F336CE015531F7EC8C9F08EA1CDE431B3F1F8DD90C5E39088051ABA022C`。主要证据 `evidence/connection-modal-v04/result.json`、`connected-{1440,1000,390}.png`、`failure-desktop.png`、`recovered-desktop.png`、`unplug-desktop.png`。资源URL/原始哈希和提取记录在 public 资源清单；成功/失败官网运行态来自静态分支证据，不作为实机观察。

本分支没有打开COM3、烧录、启停用户服务、修改VM源码或原始打包VM模块、修改根tests/契约/后端。只有模拟串口和页面自验；独立Sol low测试及最终验收由主控协调。

## 2026-11-10 顶部串口入口及孤立链路清理

最新实现覆盖下方历史交付中的父串口抽屉描述：MenuBar 保留五个项目按钮及保存状态；删除 `SerialPanel.tsx`、App 的 serial 抽屉分支、专属 CSS、EditorBridge 硬件/字节监听器及缓存。经主控批准，从工具栏 action/drawer 校验移除 serial，删除父层专用 `HARDWARE_STATE` / `SERIAL_BYTES` 转发及 `WRITE_SERIAL` / `SET_SERIAL_OPTIONS` 请求和处理。删除无消费者的 SerialBytes、isSerialBytes、isHardwareSnapshot；实际 HardwareSession 使用的 isSerialOptions 保留。转发移除后的本地 projectTools.refresh / modes.publish、上传模式 SharedTerminal、HardwareSession、SerialLog 与编译烧录实现保留。GET/OPEN/DISCONNECT 和 COMPILE/UPLOAD/CANCEL 六个既有硬件诊断桥保留。旧 SerialTerminalService 按主控明确要求不在本轮清理。

同步工具栏及串口自验脚本，移除旧父抽屉点击与行断言；verify-hardware 的状态等待改用保留的 GET_HARDWARE_STATE。现有 `npm test` 29/29、`npm run build`（含类型检查）通过；本次未运行浏览器自验或硬件测试。最终产物为 editor-BwMW-OWc.js、app-B6Q0ZY3u.js、editor-protocol-D2Cz2SCd.js、app-DUkQqapI.css，editor-B0PxROSH.css 未变。未改 VM、apps/web 外文件、后端或用户服务；独立测试与契约更新由主控协调。

## 2026-11-10 串口文本分片显示修正

仅修改前端显示逻辑，未改 VM、后端、HardwareSession、串口协议或例程。新增 `src/serial-log.ts`，父抽屉 `SerialPanel.tsx` 与上传终端 `mode-ui.ts` 共用：RX/TX 各自流式 UTF-8 解码，文本片段拼入当前真实行，LF/CRLF/CR 才结束一行，跨 chunk CRLF 只结束一次，无换行 prompt 即时显示。方向切换保持时间顺序，连接会话不拼接，迟到旧会话的数据不进入新会话。HEX 使用独立原始 byte chunk 记录，不把显示换行添加到数据中。清空和会话变化重置解码/CRLF 状态；上传终端暂停仍丢弃 RX，暂停/恢复切断 RX 解码和待拼接状态，不跨丢失区补成字符。文本行数/字符总量与 HEX 片段数/字节总量均有界。

验证：`npm test` 29/29（新增8项：h+ello、分割CRLF、多行和无换行、逐字节中文/emoji、RX/TX/会话、清空、暂停与有界日志），`npm run build` 含 typecheck 通过。隔离真实 Edge + 模拟端口 `scripts/verify-serial-text.mjs` 已退出0：两终端均显示单行 hello、单行中文🙂、即时 prompt>，原始 HEX 逐字节相等，清空后新片段仍拼成一行，单次端口打开，无 POST 作业、零页面错误。证据 `evidence/serial-text/result.json`、`parent-text.png`、`upload-text.png`。最新 bundle `editor-BK6uPSqw.js` / `app-B9HPbewB.js` / `serial-log-LtutPDlF.js`，CSS 未改。

未打开 COM3、未烧录、未修改 hello 例程、未启停用户服务。浏览器使用动态隔离静态服务及 mock，finally 关闭其浏览器/端口；实机及独立验收由主控后续派工。

### 2026-11-10 窄屏模式按钮补修

仅调整 `native-project-toolbar.css`：1199px 以下压缩 logo，维基/教程/旧固件入口保留原图标和动作、隐藏文字；1050px 以下连接项采用原生图标形式。项目工具组继续内部横向滚动，整个 MenuBar 不裁切。模式和硬件逻辑未变。新产物 `editor-B3v_28-W.js` / `editor-B0PxROSH.css`，build/typecheck 通过。定点 `scripts/verify-mode-narrow.mjs` 在隔离页面恢复真实六模块/手稿归档、连接模拟串口，验证 1440/1100/1000px 两模式按钮都完整在视口内且能实际鼠标点击；1100px 上传按钮范围 x=1023–1089，1000px 为923–989。六项目按钮仍在原 MenuBar，root overflow=visible，零页面错误。截图和几何证据 `evidence/mode-ui-v03-narrow/result.json`、`upload-{1440,1100,1000}.png`。本补修不重复既有归档/HTTP 测试，不操作真实串口。

## 2026-11-10 最新交付：Mode UI v0.3

按 `docs/api-contract.md` 尾部 Mode UI v0.3 实施，修改仅在 `apps/web/`。没有派子任务、改后端/根契约/根 tests、启停用户服务、触碰 COM3 或改 Mind+。添加固定 `fflate@0.8.2` 到前端依赖及其锁文件，用于外部 ZIP sidecar；没有引入第二个 VM。

- `mode-controller.ts` / `mode-ui.ts` / CSS：原模式位双按钮；使用既有 setter 得到真实舞台 toolbox/执行/页签。上传右栏复用真实 CodeEditor/Monaco，紧凑一行上传到设备/设置编译/代码区/Arduino C，自动与手动两标签，底部共用串口。代码隐藏后按真实容器宽高调用 editor.layout，避免 Monaco 空白；保留单 VM/session/controller。
- `editor-archive.ts`：完整原生 ZIP 增读写唯一 `cfzn/editor.json`，生成与手稿分开。JSON 文件允许合法源码转义膨胀，解码后的源码严格 1 MiB。缺 entry 清草稿，未知版本/损坏内容在替换之前拒绝。记录的 native programMode 不规范改名。含模块 programming 项目临时 upload 注册，再恢复归档模式。
- `openblock.ts` / extensions adapter：当前来源传入原 HardwareController。编程视图与硬件 protocolActive 分离，NativeSerialSocket 拦截非支持板在编程视图下的协议发送和模式引起的 baud RPC，父串口也按协议占用判断。原 setter wrapper 保持 mode change dirty。硬件订阅同步模式按钮 busy；导出复核文档/编辑版本防混合快照。内部事务 rawSave 也包含 sidecar，rollback 走同一恢复边界。
- GUI 窄 hooks 均固定 hash、唯一命中、src/ 范围：两按钮原位置、原 Hardware 传真实 CodeEditor 引用、生成器回调、保留手稿、设备加入时不覆盖外部视图。主控名称白粗体、库状态深蓝、当前卡片蓝边。原卡片名称链接会吞选板中心点击，现主控名称传播选板，底部帮助链接保留。MenuBar 收缩标题并在桌面压缩 logo 为 120px，为双按钮和完整六按钮/保存状态留空间；无第二 header。

自验：build/typecheck 通过，21/21 单测通过（含 1 MiB 转义草稿往返与原条目内容不变）。隔离 Edge 脚本 `scripts/verify-mode-ui.mjs` 验证无板双模式、仅切模式 dirty、卡片中心选中/蓝框、六模块真实生成、手动编辑/自动往返、归档期间后续编辑拒绝、真实 motion x0→25 / costume0→1 / 声音块、造型声音页签、串口打开次数/波特率/TX 不因模式变化、共享 HEX、Monaco toggle 后可见文本/尺寸、1440 MenuBar 无重叠且工具组386/386完整、新上下文 programming+六模块+手稿恢复、坏 sidecar 不替换文档、旧归档清手稿、作业当前源码/busy/取消。证据 `evidence/mode-ui-v03/result.json` 及 PNG，真实归档 `draft-project.ob`。178 个源图定位的 VM webpack 模块与固定上游原始模块字节相同，证据 `vm-byte-comparison.json`。

本轮硬件 HTTP/串口均使用 mock，未将旧实机证据当作新 UI 物理验收。用户手动源码不能反推成积木；生成错误可见并阻止自动源上传。窄窗口保留原 IDE 行为，六项目按钮在工具组内横向滚动，1100px 上传栏首屏仍有代码和串口控制，不承诺完整手机 IDE。独立测试按主控派工继续。

## 2026-11-07 最新交付：Hardware v0.2

按冻结契约完成，改动限定 `apps/web/`。没有修改后端、根契约/配置或根 tests；没有递归派工；没有打开/烧录 COM3，没有重启/停止用户 5173、3001 或主控 3002。

- 五板：加入官方普通 `arduinoEsp32` 与外部派生 `firebeetleEsp32E`，保留旧三板、六模块、legacy Aijite 拼写归一化和切换前兼容性检查。FireBeetle 从普通 ESP32 派生，D/A 标签映射数值 GPIO；数字输出排除输入专用脚，ADC/touch/DAC/PWM 与实际菜单求交集，修正过滤后无效默认值。
- 零 VM 源码/原始模块修改：删除历史 `CFZNDeviceFactories = builtinDevices` hook；准备脚本强制 hook 来源仅 `src/` GUI。`device-registration.ts` 集中外部注册包装，在 `finally` 恢复原注册入口。使用固定版本可访问的 `_registerInternalExtension` / `_loadedDevice`，未改写 VM 原函数体、引擎或序列化器，也未打包第二个 VM。兼容性预检使用构建生成的只读描述缓存，并记录来源 hash，不先切板取描述。
- `hardware-session.ts` 为 iframe 唯一 Web Serial owner；`native-serial-socket.ts` 用公开 `configureScratchLinkSocketFactory` 实现 SERIALPORT JSON-RPC，保留其它传输。原生连接 Modal 自动列出已授权端口，“选择串口”真实点击直接 requestPort；空、取消、打开失败均退到明确状态。单 reader、单 writer 队列分发给原生控制台及父抽屉。父页面移除实际串口 owner，桥接 `number[]` 字节并校验 sessionId。关闭失败保留占用，UI 仍允许重试断开。
- `hardware-controller.ts` 是唯一编译/上传 HTTP 控制器。默认 3002 hardware base，支持 VITE_HARDWARE_BASE_URL；当前代码编辑器源码、主控、profile、文档/编辑版本一起捕获；上传前复核未变化且 OS 端口仍存在。成功排空写队列、取消读并 await port.close 后才 POST uploads。用户明确选择 OS 端口，不用 VID/PID 猜 COM3。
- 原生硬件头部增加编译/烧录设置入口；原生 Upload 已选目标后进入同一控制器，否则先设置。原生进度 Modal 订阅缓存状态/日志与终态，无假百分比、无 60 秒静默即结束。隐藏不取消。取消后保持占用直到 job 终态；HTTP 轮询暂断也保持占用。恢复仅针对原先打开的浏览器终端，失败另列 restoreError，不改上传结果，不自动运行积木或重放 TX。新 ESP32 realtime/固件未验证，禁止自动刷写。
- 已验收蓝色 MenuBar 六按钮/状态位置保留；没有增加外层 header。所有硬件会话、OS 端口和作业状态仅在内存，不进入 .ob，也不触发 MARK_SAVED。

验证与证据：

1. `npm run build`（含 typecheck）与 `npm test` 19/19 通过。新增硬件单测覆盖 chooser 同步手势、共享 RX、写入顺序、关闭失败保留占用、RPC id=0、明确 OS 选择、当前源码、关闭成功才上传、旧源码拒绝、恢复失败与取消等待真实退出。
2. `node scripts/verify-hardware.mjs` 使用独立随机静态端口、真实 Edge、模拟 Web Serial 与模拟作业 HTTP。五块板每个都加载六模块和真实连接积木，经完整 .ob 保存/加载后核对板 ID、积木图、生成器、素材元数据与声音引用。上游 VM 自己会在加载时规范化 SVG hash，测试不把这种 hash 变化视为素材丢失。另验 FireBeetle GPIO 标签/输入专用限制、空列表/取消/手势、父/原生共享 RX/TX、单次打开、上传释放/恢复、取消终态、关闭失败阻止 uploads 与重试断开、MenuBar 六按钮、无 CFZNDeviceFactories、无旧 Link socket、零页面错误。
3. `node scripts/verify-hardware.mjs --real-compile` 已通过，真实 3002 作业 `bed01c1d-efa5-45ba-a219-86cef6df1528`，profile `firebeetle-esp32e-4mb`，源码为当前编辑器手动 C++ 测试值，成功生成校验产物，未上传。随机隔离页面 Origin 不在执行器默认允许列表，测试转发为配置允许的 5173 Origin；没有绕改服务端配置或用户服务。完整证据 `evidence/hardware-v02/result.json`，截图 `native-connected.png`、`native-upload-success.png`、`real-compile-success.png`。

限制：本分支仅 mock 串口/上传和真实编译；物理 WebSerial、GPIO/ADC/PWM 及其它实体板仍由主控/独立测试如实验收。当前 S3 profiles 无工具链会显示后端 reason；没有自动安装工具、复制 Mind+ main/firmware 或恢复其旧固件。实例注册绑定固定上游版本，升级须重新检查并回归五板归档。若 POST 创建作业的响应丢失，无法确认服务器是否启动进程，前端保守保留 busy 并提示检查本机执行器；不能自行宣称端口已空闲。浏览器 opaque ID 与 OS 路径无法自动等同。

入口与选择器：iframe `data-testid=serial-button` / 精确按钮“串口终端”；`hardware-connect` 内“选择串口”“刷新已授权端口”“连接”“断开”；原生硬件区“编译 / 烧录设置”，`hardware-progress` 内 profile、OS 端口、“编译检查”“编译并上传”“取消作业”。测试脚本结束会关闭自己的浏览器和动态端口服务，不残留固定预览服务。

## 2026-11-06 最新交付：原生蓝色 MenuBar 同行更正

按主控修正后的 Native project toolbar 附录完成，位置以本节为准。六按钮及 project-status 现在是实际 `gui_menu-bar-position_3U1T0 menu-bar_menu-bar_JcuHF box_box_2jjDp` 的直接子节点，位于原标题区域与 tailMenu 之间，原生蓝色菜单仍为 3rem（48px），没有下方第二工具区。原 File 入口已精确移除；标题所在 fileMenu、Edit、设备/连接和其余原生控件保留。外层 app-bar 继续不存在。

本次修改：

- `scripts/openblock-hooks.mjs` 删除旧 AlertsComponent 插槽和 GUI body 标记 hook；改为固定官方 MenuBar 根 Box 的 data-cfzn-menu-host、tailMenu 前唯一插槽、仅针对 File 唯一条件的渲染守卫，保留 containerRef。仍有原有 renderLibrary 和设备/扩展 hooks，hash/唯一命中检查及准备缓存失效机制不变。
- `src/native-project-toolbar.ts/.css` 删除 ResizeObserver、全部高度测量/补偿变量、alerts margin、body padding 和额外 player 布局属性。控件改为菜单内单行 flex，桌面全部可见；窄屏只滚动工具组，并在按钮聚焦时将其滚入可见范围。整个 MenuBar 不设裁切 overflow，因此原生下拉正常覆盖编辑区。
- `src/style.css` 撤掉上一轮为下方工具区增加的抽屉顶边补偿，抽屉在原菜单下方开始。父业务、两类桥接消息、状态计算、导入同步手势和保存/冲突语义均未修改。
- `scripts/verify-native-toolbar.mjs` 更新旧 alerts 归属及下方位置断言，增加 `--placement` 定点模式，不重复上轮完整 API/保存/扩展矩阵。README 已同步最终位置和命令。

验证：`npm run build`、`npm run typecheck` 通过，`npm test` **13/13**。`node apps/web/scripts/verify-native-toolbar.mjs --placement` 通过：MenuBar 直接归属、File 缺席、旧 alerts/body 标记和 CSS 补偿缺席、实际 filechooser 导入、实际 POST 保存与导出、串口抽屉/用户手势边界、扩展库/全屏、原生告警显示关闭、原生 Edit 下拉和无页面错误。

已查看 `evidence/native-menu-toolbar/toolbar-1440.png`、`toolbar-1894.png`、`toolbar-390.png`、`toolbar-390-scrolled.png`、`native-edit-menu-1440.png`。矩形/API 记录在该目录 `results.json`：三种视口菜单与 group 均在 y=0..48，tabs 均从 y=48 开始；1440/1894 下六按钮及状态完全落在菜单内，390 下工具组在可视范围内，逐个聚焦六按钮与滚动到状态均通过。窄屏继续沿用上游其他菜单/标题的 overflow 行为，不扩做整套 IDE 响应式。

临时 API、静态代理和独立存储均已在本次定点脚本 finally 清理。未停止/重启用户 5173/3001，没有向其 API 写测试项目。仅改 apps/web；未改根配置、共享契约、后端、根 tests，也未触碰先前被阻止清理的临时文件。请主控交独立测试回归此次挂载/style 更正；前一轮并发保存/错误/412 的完整证据继续有效。

## 2026-11-06 原生项目工具栏首次迁移交付（历史位置）

以下记录首次 Alerts 方案的历史结果；当前 UI 位置以本文最上方 MenuBar 同行更正为准。仅修改 apps/web，未动根配置、契约、后端或 tests，未递归委派。

实现文件：

- `src/App.tsx`、`style.css`：删除整个外层 header.app-bar、重复品牌/标题和父文件 input 及废弃样式。保留原项目 API 函数、notice/412 重载/另存处理、项目抽屉及始终挂载的 SerialPanel。父层计算唯一真实保存视图，接收五个普通动作；四个文档动作仍受父 busy/readiness 守卫。抽屉内保留当前项目重命名；关闭可返回原生入口焦点。
- `src/editor-protocol.ts`、`editor-bridge.ts`：仅新增冻结的 PROJECT_TOOLBAR_STATE / PROJECT_TOOLBAR_ACTION。状态四字段，普通意图仅 `{action}` 的五项白名单；仍做 origin/source/版本校验，保留 requestId/超时、文档版本保护及完整归档接口。READY 与父状态变化均推送视图。
- `src/native-project-toolbar.ts/.css`：使用 iframe 的 React 16、受控订阅、六按钮和 project-status；没有 React 19 组件混入，也没有新品牌标题栏。仅观察按钮组高度，给 body 预留空间，空白覆盖层可穿透，原生模态隐藏控件、全屏隐藏并取消占位。项目/串口 expanded 由父真实 drawer 回传。仅实际父抽屉 Connect 点击申请 Web Serial。
- `src/openblock.ts`、`scripts/openblock-hooks.mjs`：通过固定包准确匹配补丁，在实际 `gui_alerts-container_15BWp box_box_2jjDp` 的原 AlertsComponent 内插入 controls，并保持原告警 children。给原 body 加布局属性。保留 CFZNOpenBlock.renderLibrary 与已有扩展适配。导入直接复用 iframe 的 chooseImport，稳定 file input/testid 也位于 iframe；没有异步消息后再 click 父 input。
- `test/project-toolbar.test.ts` 与 `scripts/verify-native-toolbar.mjs`：仅前端范围的状态/消息定点单测和隔离浏览器检查。README 已记录协议、所有者、测试选择器及执行方式。

验证：

1. `npm run build`、`npm run typecheck` 通过，`npm test` **13/13**。构建仍基于固定官方包；原生 hooks 的修改进入现有准备指纹缓存，不手改生成目录/node_modules。
2. `node apps/web/scripts/verify-native-toolbar.mjs` 通过 14 项聚焦检查：实际容器内恰有六按钮和一个状态、真实 filechooser 导入、创建/更新/重开、保存失败、延迟 PUT 期间继续编辑、412 显示两种恢复并实际另存、导出保持 dirty 且无写 API、新建确认取消/接受、项目/串口切换、Connect 才调用 requestPort、扩展库入口、原生舞台全屏隐藏/恢复、原生设备断开告警显示/关闭、无页面 JS 错误。
3. 桌面控件 rect 为 y=53、H=32，原标签行 y=90；390px 控件组 H=54、标签行 y=112。两者都在原菜单下且与标签无覆盖，所有按钮在视口内。空白宿主不截获指针。模态打开时父项目抽屉会关闭，保留串口服务实例。
4. 已查看 `evidence/native-toolbar/initial-native-1440.png`、`toolbar-1440.png`、`toolbar-390.png`、`native-alert-1440.png`；结构、尺寸/API 调用记录在 `results.json`。沿用原 OpenBlock 的紧凑控件语言、无新主题/图片。taste-skill 新组件 lint 0 FAIL / 1 WARN；唯一 warning 为有意匹配原生控件的 1px 按钮边框，属于 data-ui 的现有界面风格。

隔离与收尾：浏览器自验从 apps/api/dist 创建临时 Nest API，并创建随机端口的静态/代理服务与独立临时数据目录；每个正常/可控失败路径均在 finally 关闭 API/静态服务并移除自己的存储。第一次测试脚本确认框处理异常遗留的一处本轮临时存储也已核对测试元数据后单独清理。没有向用户 3001 写测试项目，没有停止用户 5173/3001；收尾确认二者仍在监听。此前被阻止清理的 .inspect/旧扩展失败截图没有触碰。

限制与独立验收：本轮没有复制整套扩展验收矩阵，也未做真实串口硬件测试；浏览器 requestPort 采用取消选择的 mock 验证手势边界。原版 IDE 本身的桌面最小布局/窄屏原菜单裁切仍保留，本轮只保证新增六按钮与状态可用。独立测试请适配旧根 tests 的 iframe 选择器，并按主控安排补充原生标题、模态/抽屉、状态同步及既有扩展回归。

## 2026-11-06 独立测试派修：主控切换保护

已修复测试发现的两项实质缺陷：通用 ESP32-S3 的 `activeBuzzer_init(PIN=3)` 切 Aijite 未拒绝；`arduino_serial_multiSerialPrint` 切 Uno 因旧 Blockly 定义缓存被误认为兼容。后者在全新上下文会丢失可编辑实现，现已在设备变更前明确拒绝。

- 新增 `src/extensions/controller-compatibility.ts`：从三个已确认纯描述的设备工厂 prototype 调用 `getInfo()`，不实例化外设构造器；按目标板构建上传模式的真实 device opcode、菜单 shadow opcode 和静态字段值集合。模块 PIN 使用其实际借用的目标板引脚菜单。
- `src/extensions/adapter.ts` 在进入 transaction、保存快照、stopAll、加载设备和工具箱事件之前完成上述检查。拒绝不再依赖旧 flyout 或全局缓存定义，原设备/模块/连接/参数及 dirty 状态不发生变化。并将 `deviceReady` 从“ID 已更新且菜单非空”改为“实际 flyout 的数字输出/数字输入/模拟输入引脚值集合与目标板纯描述一致”，防止兼容切换后模块继续绑定旧板菜单。
- 未修改 VM 引擎/序列化器、导入流程、公共契约、后端或根 tests；未清理此前被自动审批阻止的临时文件。

本次定点验证：`npm run typecheck`、`npm run build` 通过；`npm test` **11/11**（增加 3 项针对性单测，覆盖无构造副作用、目标 opcode、模块/设备引脚、菜单 shadow 和旧非空菜单的误判）。5174 既有生产预览已读取重建后的 dist，编辑器脚本为 `assets/editor-DmlIsIFJ.js`。

`node apps/web/scripts/verify-controller-switch.mjs` 的 3 个全新上下文场景全部通过，未运行整套矩阵：

1. ESP32-S3 + 蜂鸣器 PIN=3 → Aijite：明确显示原积木名及引脚 3 不受支持；完整 VM 项目 JSON 与桥接状态逐项相同。本例切换前通过 MARK_SAVED 建立 clean 状态，拒绝后仍 clean、editVersion 不变。
2. ESP32-S3 + `arduino_serial_multiSerialPrint` → Uno：明确显示不支持该 opcode；完整项目 JSON 与桥接状态保持。本例切换前 dirty，拒绝后 dirty/editVersion 保持。
3. ESP32-S3 的共同数字引脚 4 + 蜂鸣器 → Uno → Aijite：两次切换都成功，模块、块连接、参数保持，代码继续包含 `activeBuzzerPin = 4` 与 `digitalWrite(4, HIGH)`，成功切换标记 dirty；Aijite 的板卡及已放置模块 PIN 菜单均无 3。

证据在 `evidence/controller-switch-fix/results.json` 与同目录 4 张 PNG。新增自验脚本与单测只在 apps/web 下；请主控交独立测试会话回归这两项原复现用例及共同引脚正例。

## 2026-11-06 主控/模块扩展交付

已按 `docs/api-contract.md` 的扩展附录实现，所有源文件修改归属均在 `apps/web/`。未改后端、根配置、公共契约或根 `tests/`；未递归派工。既有 5173 / 3001 服务未终止。本次另启动的生产预览在 `http://127.0.0.1:5174`，可供独立验收使用。

### 文件与行为

- `src/extensions/catalog.ts`：3 主控 / 6 模块固定目录、稳定 ID/opcode、兼容判断和导入预检。仅旧 `aijiteEsp32S3` 规范为 `aijiteESP32S3`，通用 ESP32-S3 不推断品牌。
- `src/extensions/aijite.ts`：官方 ESP32-S3 基类上的独立 Aijite 工厂/元数据，保留数字/模拟/触摸 IO3 排除；原设备菜单官方板卡保持可达。
- `src/extensions/adapter.ts`：独立 ESM 资源注册、VM 派生状态、工具箱完成边界、busy、dirty、兼容切换、失败快照恢复。保存/导出在操作中报告忙碌。恢复设备阶段不等待依赖 installTargets 的引脚 flyout，最终恢复完成仍等待实际工具箱。旧工具箱的空/A0 默认值不在当前菜单中时，仅为新积木选取有效默认引脚，不重写已编辑字段。
- `src/extensions/library.ts`、`library.css`：原 Library 筛选栏分类、独立搜索状态、支持当前主控筛选、真实加载/错误信息、原卡片键盘语义。仅硬件目录图片统一 186px 并 contain。未选主控显示“先选择主控”。窄屏目录完整单列，筛选栏可横向滚动，搜索输入聚焦后可见。
- `src/openblock.ts`：在默认/导入项目前安装适配器，抑制中间 dirty，成功操作显式通知变更；沿用完整归档桥接，双重恢复失败时保留可下载恢复备份。
- `scripts/openblock-hooks.mjs`、`prepare-openblock.mjs`：固定官方包的来源/hash/唯一命中检查，提供库插槽/容器、原卡片可访问状态、设备元数据/工厂入口，保留官方 VM 引擎与序列化器。复制本项目 vendor 并生成独立模块导出，资源/补丁指纹使准备缓存失效，浏览器导入也携带版本。没有旧目录/20112 资源依赖。蜂鸣器旧 RGB 字符串转等值 hex 以兼容当前 Blockly 分类解析器。
- `vendor/`：6 个完整旧模块及图片、Aijite 源快照/图片/随附许可、来源说明和输入 hash。代码接入文档为 `EXTENSIONS.md`；无扩展包上传 UI，`activeBuzzer` 冲突变体不注册。
- `test/extensions.test.ts`：4 项新增检查；`scripts/verify-extensions.mjs`：可重跑的核心浏览器/真实 API 归档验证。

### 自验结果与证据

Windows Node 24.16 / Edge 的生产构建自验：

1. `npm run typecheck`、`npm run build` 通过；`npm test` 8/8（扩展 4 + 既有串口 4）。新源码 taste-skill lint 0 FAIL / 0 WARN。未将整套原版 IDE 按营销页规则重设计。
2. 从原扩展库选中真实 Aijite VM 设备，加载全部六模块，检查实际 Blockly 定义、flyout 和 Arduino 生成器；数字/模拟下拉排除 IO3。无页面 JS 错误、无 20112 资源请求。记录：`evidence/extensions/native-state.json`。
3. 通过真实 Blockly XML API 建立连接，修改引脚 4/5/6 和模块状态，组合蜂鸣器 init/on/off、雾化状态/toggle、PIR、火焰/水滴数字与模拟读取、嵌套注释。全部六模块生成实际 Arduino 代码，没有 TODO/占位。证据：`all-six-modules.ino`、`connected-blocks-1440.png`。**此项未宣称鼠标拖拽已自验。**
4. 最终样例保留六模块，其中水滴模块无放置积木。实际 POST/GET、PUT/GET（revision 2）下载完整归档逐字节一致，仅创建并清理本次项目。全新浏览器上下文/iframe 导入后，设备、模块、积木连接/参数和 3 SVG + 2 WAV 内容 SHA-256 保持，dirty=false。另验证了全部模块零积木归档恢复，及随后新建清理设备/模块。证据：`roundtrip.json`、`aijite-six-modules.ob`、`restored-aijite.ob`、`modules-without-blocks.ob`、`restored-blocks-1440.png`。
5. 官方原生 SVG 加载可能规范化资产 ID/ZIP 文件名；编辑器往返对比素材**内容字节**，API 原样存储阶段比较完整归档字节。UI→API 的素材逻辑引用交给独立测试进一步核查。
6. 已查看 1440 / 768 / 390 截图。390px 下实际滚到最后卡片、聚焦输入搜索、切分类保留查询、清空查询及返回均通过。6 张未选主控卡片真实提示均为“先选择主控”。证据：`ui-check.json`、`layout-*.json`、`modules-before-controller.png`、`modules-390-scrolled.png`、`modules-1440.png`、`modules-768.png`、`modules-390.png`。视觉说明见 `evidence/extensions/VISUAL_REVIEW.md`。

### 独立验收与限制

按主控要求收束开发侧矩阵，不再重复整套端到端验收。测试会话请覆盖：舞台 pen/music 实际执行、鼠标拖拽、资源下载/注册失败和回滚、重复/快速点击、旧别名、普通项目/新建清理、3 主控兼容切换（含不支持的引脚与已用积木拒绝切换）、模式冲突、UI→API 保存重开及素材逻辑引用。相关逻辑已实现，但未将全部注入故障/组合标为开发侧通过；双重回滚失败的恢复备份路径也待独立故障注入。

本阶段交付编辑和 Arduino 代码生成；未做实板编译、烧录、传感器/执行器或 IO3 电气验证。Web Serial 保持独立功能。旧图片独立作者信息不完整，已保留随附许可和来源，未声称逐图独立版权核验。

## 以下为原初步搭建阶段的历史记录

前端监听 `127.0.0.1:5173`，通过 Vite 代理访问 `127.0.0.1:3001`。根命令 `npm run dev` 同时启动两者；若两者已在运行，直接打开现有页面，无需重复运行启动命令。使用和桥接细节见 `README.md`。

在 Windows Node 24 / Chrome 完成以下开发验证：

- `npm run typecheck`、`npm run build`、`npm test`：通过；串口单测 4/4，覆盖字节及行尾、正常读写与关闭、设备断开事件和取消浏览器选择。生产输出包含 `index.html`、`openblock.html` 和自托管资源。
- 真 VM：默认项目与原版积木区渲染；加载含 SVG、WAV 和积木的 `roundtrip.ob`；打开造型和声音标签；运行脚本将角色 x 坐标从 0 移到 10；导出完整 `.ob`；恢复默认项目。
- 真实 API 的 Chrome 冒烟：通过顶部栏导入并首次保存（201），刷新后从项目列表打开，重命名（200），另一客户端更新后触发保存冲突（412），将当前项目另存（201），下载 `.ob`，打开串口面板。仅清理本次创建的测试项目。

开发截图在 `.runtime/web-editor.png` 和 `.runtime/web-serial.png`。编辑器准备好后顶部保存按钮启用，可用此条件等待页面就绪。稳定的选择器有 `openblock-frame`、`project-file-input`、`save-project`、`project-list-button`、`project-row`、`active-project-name`、`project-status`、`project-notice`、`serial-button`、`serial-panel`（`data-testid`）。

独立验收还应覆盖鼠标拖拽放置、浏览器真实用户操作、API 重启后保留归档、资产字节回环及保存途中继续编辑。实际 USB/串口设备未接入，手工验收步骤见 `README.md`。原版 GUI 的可选 Link 探测在本机未安装 Link 时可出现连接失败；Web Serial 终端独立运行。
