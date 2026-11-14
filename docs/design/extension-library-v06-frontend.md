# 扩展库选中、移除、兼容与类型筛选前端提案 v0.6

日期：2026-11-11（Asia/Shanghai）。角色：前端接口设计。仅调查与设计，待主控冻结；未开发产品源码，未修改 VM，未启动项目服务、Mind+ 桌面或访问硬件，未递归派工。

## 1. 最小方案

保留原生 OpenBlock 蓝色扩展库、搜索和卡片结构。在现有分类控制区增加一行类型按钮；卡片明确显示选中状态与独立“移除”按钮。模块兼容筛选默认显示全部，使不支持状态可见；未选择主控的模块右上角使用灰色矩形“未选择主控板”，替换当前左上黄色提示。

主控/模块已选择时，点击卡片主体保持幂等，不把再次点击解释为删除。移除有独立操作：模块仍被任一目标的积木引用则拒绝；取消主控前须先移除模块，并确认没有主控相关积木。拒绝发生在保存快照、停止脚本或调用原生卸载之前，不清空工作区。

沿用 v0.5 的类别合成、模式保留、静态模块 loader、同一 VM 幂等、真实生成器及完整归档。无需 HTTP、后端、数据库或归档字段变更。

## 2. 当前官网与 REA 证据

本轮按要求读 D:/rea/.agents/skills/reverse-engineer-anything/SKILL.md，以及 runtime-observation、javascript-applications、connection-and-recovery 指南。未安装引擎或修改 MCP 注册；使用已有 Node 24.22.1 与 D:/rea/.published-runtime/node_modules/rea-agents/scripts/rea.mjs。

目标是[当前官网实时编辑器](https://ide.mindplus.top/realtime/projects/editor)，不是上轮 Mind+ 1.8.1 桌面快照。入口 HTTP 200，当前 main.d8c89955.chunk.js 为15096826字节，SHA-256 cf38db76a2536009779256943bfd3c4c59c68256bc12a9b74dcf4926f0907f9d；供应商脚本2.760b324a.chunk.js为7736457字节，SHA-256 36bd7497ba6ea826fd1e6c09319e7cd5a1c7c7d2a5798ea77556072d7c16217c。以上是本轮获取的内容身份，不推断官网发布日期或语义版本。

所有新证据保存在 .runtime/extension-library-v06-research/：official-assets.json、各 scenario/evidence.json、截图、DOM、selected-provenance.json、rea-static-evidence.json、rea-static-summary.json、findings-summary.json。完整场景包含逐步截图/界面文本，不依赖控制台输出证明点击成功。

| 证据 | 当前官网实际观察 |
| --- | --- |
| ev_f13c737d23a4939e7cddd325bc13d2fd6ddad8d75b03e52f995fc2f7f2b59a83 | 真实打开扩展库，显示舞台/主控/模块三组及搜索 |
| ev_4c3410342cc302b706cac7e44e675f7a0912d63df3760b72bd33459ba7195764 | 主控类型为主控板/套件；模块类型为传感器/执行器/通信模块/显示器/功能模块/网络服务/扩展板；未选主控灰色矩形位于卡片右上角 |
| ev_ea5b4dcb2a258e51d189808985bdf500107654aac52f5218c3ca988eed745319 | 点击 FireBeetle ESP32 后出现选中边框与“移除”；模块中兼容项可选，motor:bit等不兼容项显示“不支持当前主控” |
| ev_2217e787cc55497d28e9c387e2d64516285f0f11d7a27802e8dd84001bb17f04 | 点击传感器后总数32变18；加载超声波测距模块后出现“移除”；未放置积木时模块可移除，再移除无模块的主控，选中状态消失 |

截图：[未选择主控](F:/CFZN/CFZN-IDE/.runtime/extension-library-v06-research/official-modulesReady.png)、[已选主控](F:/CFZN/CFZN-IDE/.runtime/extension-library-v06-research/official-boardLoaded.png)、[兼容与不支持](F:/CFZN/CFZN-IDE/.runtime/extension-library-v06-research/official-supportedModules.png)、[传感器筛选](F:/CFZN/CFZN-IDE/.runtime/extension-library-v06-research/official-sensorResults.png)、[已选模块](F:/CFZN/CFZN-IDE/.runtime/extension-library-v06-research/official-moduleLoaded.png)、[移除后](F:/CFZN/CFZN-IDE/.runtime/extension-library-v06-research/official-boardRemoved.png)。这是原官网橙色界面，仅借鉴结构，CFZN保留蓝色。

REA使用 capture-browser-scenario 的 launch 模式，由工具建立临时独立 profile；没有附着日常 Chrome。五次场景（含初始页面观察）均已完成，browser.cleanup均为 terminated-owned-process，未留运行中的 REA 场景或本轮自建浏览器。

### 静态选段与未验证边界

从官网当前 main bundle 中按内容定位两个真实函数，避免同名压缩变量重复造成误选：卡片 Wa 的 UTF-16范围14410521–14421021；库 ci 的范围14433106–14443322。原函数不变，仅包为可解析导出表达式，未执行这些本地选段。REA analyze-javascript-application 实际处理20770字节、6326个AST节点，2个源均解析成功、0失败；父证据 ev_ab0d4af1cfb911fe0e471f7dbc8922114e22d5d16833e46434201d769b1f0a29。应用关系覆盖partial，语义覆盖unknown，1775个语义未知；这不是全站分析或完整依赖证明。

静态可见：isLoaded给卡片加选中class；已加载项重复主体点击直接返回；移除按钮阻止冒泡。模块若 workspaceHasExtensionBlock 返回true，显示 extensionInUseCannotRemove 并拒绝移除；主控若被使用则显示确认框，确认后的具体清理效果未实测。类别单选；同一可多选维度内部OR，不同维度之间AND；状态筛选之间AND，名称/描述/SKU搜索再缩小结果。已获取官网 filter_realtime_device_zh-cn.json 与 filter_realtime_extension_zh-cn.json，category.checkbox均为false，与单选推断一致。

未实测：已有模块/主控积木时的删除、主控仍带模块时的级联效果、第三方传递依赖、任何真实硬件。不要将这些写成官网验收结论。CFZN本轮采用明确拒绝规则，无需复制官网潜在清空/级联行为。

## 3. 当前 CFZN 接入点与差距

- apps/web/src/extensions/library.ts 已提供三分类、当前主控、isLoaded和支持当前主控复选框；目前 supportedOnly=true、无类型行、isUnloadble=false，已加载模块只有描述文字，移除动作未暴露。
- apps/web/src/extensions/catalog.ts 有5个 controllerIds 和6个模块；supportsModule根据规范化deviceId与supportDevice判断。当前6模块均支持这5板，原生其他板可构成真实不支持状态；不能为展示效果伪造矩阵。
- adapter.ts 已有模块 used(opcodes) 扫描所有 runtime.targets，manager.unloadDeviceExtension 外部包装会拒绝正在使用的模块。应保留并完善统一适配入口，不绕过它调用rawUnload。selectController已有不兼容模块和积木参数检查、完整归档事务、忙碌/硬件作业守卫与模式保留。
- scripts/openblock-hooks.mjs 已在原生 library.filterBar 注入 categoryControls，在卡片转发 disabledReason并补键盘语义。卡片aria-pressed已有，蓝色选中边框目前仅data-cfzn-controller-selected；模块也须获得同等可见选中状态。
- 原生 isUnloadble 只呈现 Loaded/Not loaded尾部文字，不等同于完整卸载按钮；handleSelect仍调用onItemSelected。仅把isUnloadble设true无法完成需求。

建议只在现有GUI卡片数据链增加可选状态角标与操作插槽/回调，透传 Library → container library-item → component library-item；未提供时保留原生呈现。使用外层React构造iframe React16节点，不跨React19边界。由library.ts供应状态和动作；不重建原生模态、不整卡替换、不通过DOM扫描事后外挂按钮。

## 4. 选中、角标和移除规则

| 卡片状态 | 呈现与可操作性 |
| --- | --- |
| 未选主控 | 模块图像上右上灰色矩形“未选择主控板”；不可添加，可读取名称、说明和支持板列表；栏内“选择主控”入口可达 |
| 有板且兼容 | 右上中性矩形“兼容当前主控”；卡片可添加。此标识只代表目录兼容，不代表实时硬件协议已验证 |
| 有板且不支持 | 右上灰色矩形“不支持当前主控”；不可添加，说明列出本地真实支持主控 |
| 已选主控/模块 | 蓝色2px边框及“当前主控”/“已添加”文字；卡片尾部始终可见独立“移除”按钮，不依赖hover；主控单选、模块多选 |
| 加载/移除中 | 原选中和兼容信息保留，动作禁用并显示进行中；兼容角标不承载busy/error等暂态 |

角标采用约12px文本、4px×8px内边距、1px灰边、浅灰底、2px圆角，定位在图像容器右上并预留最大宽度；不再使用左上黄色pill。已选状态放名称/尾部状态区，移除放尾部右侧，避免同兼容角标遮挡。沿用原图object-fit:contain和图片高度，不改变图像裁切。

拟定适配层能力（仅提案，主控冻结命名）：removeModule(id): Promise<void>、clearController(): Promise<void>。状态仍读取 runtime 已提交ID，不维护第二份selected集合。当前ID的重复添加、已不存在ID的重复移除都是无副作用幂等操作；卡片主体永远不执行移除。

- removeModule：先assertIdle及全部目标引用检查，包括其他角色、脱离堆栈、禁用积木与shadow。仍引用则显示“雾化模块仍有积木在使用，请先删除相关积木”，不更改项目；无引用才进入既有完整归档事务，经已包装原生卸载、刷新工具箱/执行守卫、成功后dirty一次。失败走既有回滚/恢复备份。
- clearController：只针对实际当前主控；先拒绝任何已加载模块依赖，列出名称并给“前往模块扩展”入口，用户逐项移除；然后拒绝主控类别拥有的opcode、相关菜单shadow和Arduino开始帽等仍在工作区的引用。全部通过才在事务内使用原生Unselect device（deviceId=null语义）的既有加载入口。空设备就绪检查不能照搬真实板的引脚等待。
- “无主控”是状态/明确移除动作，不作为主控板/套件分类里的一个硬件商品。原生设备选择入口保留，但其取消选择也必须遵守相同守卫，不留下旁路。
- 不自动删除积木、不自动级联移除模块、不弹出“清空后继续”选项。现有六模块没有声明模块间依赖，不能虚构依赖图；以后新增依赖时，从可信内置目录声明反向检查，不能只检查积木引用。
- 成功移除保留当前编程/上传模式、舞台扩展、纯Scratch积木、素材与手写代码。若无主控且仍处上传视图，保留视图但相关硬件动作提示先选择主控，不假装可编译/烧录。
- 移除是项目中取消加载，已下载的静态代码/Blockly定义可留同VM缓存；展示缓存根据实际已加载ID排除类别。不要删除全局定义、替换VM或保留虚假loaded状态。重新添加必须重新调用注册函数并适配当前板菜单，验证移除→重加→再次移除和换板后重加。

## 5. 真正适用于现有目录的类型行

位置：原生filterBar保留搜索；现有三分类下方增加紧凑searchBar类型行，右侧保留“支持当前主控”和当前板状态。使用同一目录生成选项，不硬编码无结果的官网类目。

| 本地条目 | 提案类型 |
| --- | --- |
| arduinoUno、arduinoEsp32S3、aijiteESP32S3、arduinoEsp32、firebeetleEsp32E | 主控板 board |
| pirSensor、flameSensor、raindropSensor | 传感器 sensor |
| activateBuzzer、atomizer | 执行器 actuator |
| moreComments（积木注释） | 功能模块 function：代码辅助；这是本地设计映射，不声称官网同名库的分类 |

主控扩展当前仅这5个内置板，显示“全部、主控板”；没有套件条目则不显示套件。原生deviceLibrary另有Arduino各板、Pico、micro:bit、Makey Makey等，保持原来可选范围，不把开发板名称或Makey Makey臆断成套件。为该入口补同样显示元数据时按真实目录映射，Unselect不是商品。新增真实套件后，由目录的kit类型自然出现选项，不在本轮创建伪套件。

模块显示“全部、传感器、执行器、功能模块”。通信模块、显示器、网络服务、扩展板暂不显示；后续只有可信内置目录增加实际条目才出现。建议独立的展示type字段/显式映射，不以description关键词猜测；现有tags仍服务原生搜索，不改extensionId/categoryId或归档。

类型单选，点击选中项仍保持选中，使用“全部”清除。先按三分类限定数据，再以类型 AND 兼容复选框 AND 原生关键词搜索求交集。默认支持筛选为false，显示全部兼容/不支持卡片。无主控时复选框禁用且不生效，目录仍显示全部；移除主控也清除此筛选，避免全空。类型选项按该分类完整目录产生，不因搜索或兼容过滤临时消失；不同大分类记忆各自类型，首次均为全部。

复用原生搜索查询，不再建立第二个搜索框。切换大分类时按原生行为清空搜索；切换类型保留当前查询。组合无结果时显示“没有符合筛选条件的扩展”和“清除筛选”，不显示网络/加载失败文案。当前数量小，不引入商城分页、排行、收藏、下载或在线扩展市场，也不复制官网的相关入口。

## 6. 可达性、验收和主控冻结项

类型行用带名称的按钮组与aria-pressed；Tab可到、Enter/Space可选。卡片主体保持独立可聚焦选择目标，移除为原生button，aria-label含条目名；点击和键盘均阻止冒泡。若卡片外层role=button会包住子按钮，GUI挂点应将选择语义移到同级主体容器，避免嵌套交互元素。禁用项仍可读兼容原因，通过aria-describedby关联；不要仅降透明度或只依赖颜色。

错误使用已有role=alert，进行中与结果用polite状态播报。移除后若卡片仍显示，焦点回该卡片添加目标；若筛选使卡片消失，回同组下一个项目或筛选按钮；不回页面顶部。窄屏类型行可换行或局部横向滚动，保留搜索、关闭和操作可达，不产生整个页面横向溢出。

开发后由独立测试验证：真实隔离Vite dev与static dist中的选中/幂等；无板灰角标位置；真实5板/6模块分类；原生不支持板状态与默认显示全部；类型与关键词/支持筛选交集；跨角色/脱离/禁用积木引用拒绝；模块依赖阻止取消主控；无引用移除与同VM重加；忙碌/项目加载/硬件作业守卫；注册/卸载失败回滚；模式和独立类别保留；完整.ob导出/导入后移除状态及素材/手写草稿保持；原生GUI hooks精确匹配与VM模块字节不变。筛选是视图状态，不置dirty；成功加载/移除才按现有事务置dirty。

请主控冻结：①显式移除并拒绝引用/依赖的规则；②默认全部与实际类型映射；③最小GUI状态/动作插槽及适配方法命名。其余继续沿用v0.5，不将本轮设计文档当开发授权。官网使用中移除和级联未实测已明确留作未知，不再扩大调查。
