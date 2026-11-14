# Mind+ 功能差异前端提案：网页版优先，桌面辅助

日期：2026-11-12（Asia/Shanghai）。仅调查设计，待主控冻结；不开发产品源码，不改 Blockly/VM 源码或打包代码，不新建 VM，不操作用户5173/3001/3002服务或COM3，不接账户/Python后端/SQL/OSS，不递归派工。

## 1. 本轮建议冻结的范围

**核心仅两项：①将 Ctrl/Cmd+S 接入现有项目保存；②增加真实当前积木文字搜索。** 两项在当前网页版均有源码依据，CFZN确有缺口。沿用原生蓝色MenuBar、工具箱和原生积木拖拽，不重做项目面板、舞台或扩展库。

**用户新增明确边界：IDE顶部右侧现有模式切换不用修改。** 即使其参考桌面，也完整保留当前原位置、样式、“编程模式/上传模式”文案和切换逻辑，不因网页版优先对照而移动、重命名、重做或改变状态归属。搜索只读取现有模式，并在既有模式变化后更新索引；保存快捷键也不改变模式控制器。此约束优先于矩阵中的网页差异，不属于本轮实施范围。

代码区已是Monaco，查找不是缺失能力；可另列轻量入口改进，不作为核心阻塞。主控/模块选中移除、真实类型、两入口20项同目录已经完成，保留v0.5/v0.6成果。网页Link差异交主控/后端协议设计，本提案不重复调查或指定协议。

## 2. 证据与范围

### 当前网页版：主依据

本轮重新获取[官网实时编辑器](https://ide.mindplus.top/realtime/projects/editor)：入口HTTP200；main.d8c89955.chunk.js为15096826字节，SHA-256 **cf38db76a2536009779256943bfd3c4c59c68256bc12a9b74dcf4926f0907f9d**；2.760b324a.chunk.js为7736457字节，SHA-256 **36bd7497ba6ea826fd1e6c09319e7cd5a1c7c7d2a5798ea77556072d7c16217c**。与上轮网页快照相同，但不推断发布版本/日期或远程目录未变化。

使用既有D:/rea CLI 6.8，对当前网页三个搜索函数和保存快捷键函数作选段分析：父证据 **ev_a2a0af4a104a219b6feb5ff37e4f429a888c383f6bbe898b55bb00dda30aef82**。2个文件、1882字节、502个AST节点、0解析失败；应用关系partial、语义unknown，134个语义未知。原函数不变，仅包成命名导出，未本地执行。偏移/摘要见frontend/web-source-provenance.json。

- **W-search**：main UTF-16范围14169591–14170655，Toolbox.searchBlocks遍历真实类别XML，动态类别通过getToolboxCategoryCallback取内容，使用原生Xml.domToBlock构造飞出区积木，再按真实block.toString文字匹配；不靠预设关键词。CategoryMenu的输入处理14172342–14172683负责显示搜索类别；空查询隐藏结果并恢复此前类别。
- **W-save**：当前网页项目初始化hook注册keydown；Mac使用metaKey，其他使用ctrlKey，key为s时调用保存回调并preventDefault。原函数及位置见web-selected/save-shortcut.js、provenance。网页本地保存回调PO调用saveProjectSb3；无window.electron分支下载项目，有Electron分支使用本地路径。不要把浏览器下载等同于CFZN匿名API保存。
- **W-library**：上轮同字节bundle卡片/扩展库REA父证据ev_ab0d4af1cfb911fe0e471f7dbc8922114e22d5d16833e46434201d769b1f0a29，可辅助说明统一isLoaded、独立移除、类型/兼容结构。上轮官网实测选中、无引用移除、类型与灰角标在.runtime/extension-library-v06-research；属于2026-11-11观察，本轮没有重做，不冒充今天新运行证据。
- **W-link**：当前main包含SelectSerial_WsConnectButton__3_-CQ。主控已另做按钮/握手等选段分析；本提案只记录前端入口差异。

已实际调用REA官网运行场景，试图核对Ctrl+S和搜索；场景未及时返回，已中断，**没有产生可用功能成功证据**，不计作网页实测通过，不再重跑长场景。取消后曾发现本轮临时profile的Chrome残留，随后按精确profile/PID核对进程已退出；不能把取消本身当清理成功。细节见owned-cleanup-verification.json与owned-cleanup-final.json。

### 本地桌面：辅助依据

D:/mindplus dev/Mind+/resources/app.asar内renderer与.runtime/mindplus-mode缓存本轮逐字节比对相同：60021929字节，SHA-256 **8474711b476369ea3b3ceec5e51df9f40930b88b40704f48632a22d50c2cb213**。package声明1.8.1-202506121900 / RC3.0。主控身份REA父证据ev_1b937e60276fbd56c26af0a51f35c46fb16185b5a1f15e1f6ec776970bbdb2f6仅用于身份，不能作为功能分析。

本轮实际REA分析9个GUI模块与一组选定Blockly函数：父证据 **ev_0a7a1e9f6f09dd6bf4704af7a735d1b797898be6f2a20932af377285b720cf02**；10文件、225071字节、29789节点、0失败，应用partial、语义unknown，7458个语义未知。M3429保存快捷键；M167项目保存；M3443最近/缓存项目；M3511编辑菜单；M2386积木容器；M3174上传代码操作；M1009扩展库；M2340/M2724舞台布局/运行控件；旧搜索函数取自Blockly模块15。无运行中的Mind+.exe，未启动桌面或访问硬件。

**网页版与旧桌面搜索实现不同**：旧桌面使用searchAsync/searchFlyout缓存、特殊标签和结果上限；当前网页使用类别XML及动态回调。不能拿旧桌面函数名、结果上限或拼音假定作为本轮网页版规格。

### CFZN：源码、已验收记录与本轮实际观察

已读AGENTS.md、最新collaboration与api-contract，并核对当前library/adapter/toolbox/mode/App/桥接/GUI hooks。已验收记录只作现状依据，不重复计作本轮测试。

本轮用独立临时静态服务及独立Chrome观察当前dist的真实editor iframe：editor-pi1Qp4cx.js SHA-256 c51710b097867e3146015325833dd8c10076f55d367d1efddec76b35c3dcb1e6，GUI SHA-256 d2fb1a1fa791e6df812918c2153235931647daead16f8922c9747a8d41bae4af。父页面仅观察原生桥消息，不伪造VM/保存实现；没有项目API请求。

- **C-key**：保存按钮启用；Ctrl+S后PROJECT_TOOLBAR_ACTION数量为0，实际点击保存后为1且action=save，确认快捷键未走已有命令。此观察证明路由缺口，不是API持久化验收。
- **C-ui**：编程页面没有积木搜索入口；当前固定GUI中searchBlocks/searchAsync/getSearchFlyout/searchBlocks_机制未发现，不能假设可直接调用Mind+搜索API。
- **C-existing**：真实编辑菜单已有“恢复”和“打开加速模式”；上传Monaco的Ctrl+F实际打开查找控件（findVisible=1）。pageerror为0。

截图：frontend/cfzn-programming.png、cfzn-edit-menu.png、cfzn-code-find.png；结果cfzn-runtime-observation.json。自建静态服务与浏览器已正常关闭。所有新证据位于 **.runtime/mindplus-parity-20261112/frontend/**。

## 3. 功能矩阵

S=当前网页版静态原文/REA；R=本轮CFZN真实观察；H=当前源码及已验收记录；D=旧桌面辅助。优先级P1为本轮核心，P2为后续明确候选，保留为已有能力，边界项不自动立项。

| 功能 | Mind+依据 | CFZN现状/差异 | 优先级、接入边界及可测试项 |
| --- | --- | --- | --- |
| 项目新建、打开、导入、保存 | W-save(S)，M167/M3443(D) | App已有匿名项目列表、完整归档导入/导出、版本保存、dirty与冲突恢复(H) | 保留；不为对齐网页下载替换API保存，完整.ob/素材/草稿不变 |
| 键盘保存 | W-save(S)，M3429(D) | C-key(R)明确未路由，鼠标保存正常 | **P1**；复用既有save命令，验证iframe/父层焦点、一次请求、忙守卫/冲突 |
| Ctrl+Shift+S与文件路径另存 | 桌面M3429/M167(D)；网页本地路径分支限Electron | CFZN导出与另存为恢复动作具有不同语义 | 边界；本轮不抢占浏览器快捷键、不新增文件路径/保存API |
| 最近项目/崩溃缓存 | 桌面M3443(D)，读本机路径 | CFZN已有已保存项目列表；未实现同等桌面崩溃缓存(H) | P2，持久化策略由主控/后端决定；不以浏览器绝对路径伪装桌面能力 |
| 积木文字搜索 | W-search(S)，网页真实XML/本地化block文字 | C-ui(R)+当前GUI源码无相同机制 | **P1**；GUI外层实现，真实当前积木、可拖用、关闭无损 |
| 基础类/当前板/各模块类别 | W-search遍历类别(S)，M2386(D) | v0.5已实现单主控类+逐模块类、两模式及locale恢复(H) | 保留；搜索不能另造板模块定义或改变类别/工作区 |
| 变量、过程及动态菜单搜索 | W-search调用类别回调(S) | 原生工具箱已有动态类别，尚无搜索(H) | P1搜索覆盖项；使用当前回调XML/当前变量ID/过程mutation，不硬编码名字 |
| 主控选择、取消与目录一致 | W-library(S)，M1009(D) | v0.6选中/独立移除与双入口20项已验收(H) | 保留；不得再次缩为五板或放宽模块支持矩阵 |
| 模块选择、取消、兼容与类型 | W-library(S)，M1009(D) | 已有蓝色选中、独立移除、右上灰角标、类型与搜索交集(H) | 保留；引用/依赖/monitor拒绝保全，不复制潜在级联清空 |
| 舞台扩展的显式选中/移除 | 网页通用card有isLoaded/remove路径(S) | stage分支仍使用原生卡片，无本轮主控/模块式独立移除(H) | **P2真实差异**；先确认当前VM支持的卸载边界及引用保全，再提案，不改VM实现卸载 |
| 自动生成/手写与代码保留 | 网页/旧桌面区分编辑来源，M3174(D) | 已有Monaco、生成只读/手稿、完整归档及切板提示(H) | 保留；不替换成Ace，不覆盖手稿或混用生成/手稿撤销历史 |
| 代码查找/撤销等编辑机制 | 旧上传代码M3174提供复制/剪切/撤销/重做(D) | Monaco Ctrl+F已实测(R)，原生编辑器具备编辑命令；工具条入口较少(H) | P2轻量入口；“查找”按钮调用现有Monaco action，复制在用户手势中执行；不是新增编辑引擎 |
| 字号/代码区大小与显隐 | M3174 Ctrl+滚轮字号，桌面M3052拖动布局(D辅助) | 已有代码区显隐/ResizeObserver，未提供同等显式字号按钮(H) | P2可选视图改进；本轮不承诺桌面拖拽面板，字号不置dirty/写归档 |
| 编辑菜单：恢复删除/加速 | M3511(D)，当前网页原生相应组件可见来源 | C-existing(R)已有恢复/加速 | 保留；不当作缺口，不将恢复删除等同通用撤销 |
| 积木撤销/重做、造型声音编辑 | M2386调用workspace.undo(false/true)(D)；原生编辑架构 | CFZN保留原生Blockly/造型声音编辑(H)，本轮未重做实际块编辑回归 | 保留基础机制；不新增第二撤销栈，不能凭函数存在宣称全部实测通过 |
| 舞台绿旗/停止/大小/全屏/角色背景 | M2340/M2724(D)，网页同类原生舞台 | CFZN原生舞台及编辑区域可见(R)，执行守卫v0.5已验收(H) | 保留；查询/快捷键不触发运行或绕过硬件块守卫 |
| 模式切换、上传与设备连接 | 网页当前Link入口(S)，主控另查协议；桌面串口/编译由后端设计 | CFZN Web Serial单owner+3002、编程/上传模式已实现，Link入口不同(H) | 顶部右侧模式切换按用户要求原位置/样式/文案/逻辑全部保留；Link由主控另冻结，不能为仿按钮另建会话或宣称硬件已通 |
| Python、多文件、账户与远程市场 | 旧M3395/M3281及网页条件分支(D/S辅助) | 第一阶段明确未接入 | 边界；仅列差异，不默默扩大到Python后台、账户、SQL、OSS或在线扩展执行 |

## 4. 核心A：项目保存快捷键

不增加协议类型。iframe的openblock.ts与父层App分别监听自身document；复用现有PROJECT_TOOLBAR_ACTION {action:'save'}和App的save命令。按键不会跨iframe冒泡，两侧各处理所属焦点，不能互相转发形成两次保存。

- 识别Ctrl+S及Mac Cmd+S；忽略组合输入、Alt、Shift和重复keydown，不在本轮绑定其他项目快捷键。识别后preventDefault，避免浏览器“保存网页”。只拦此组合，不抢Monaco的Ctrl+F/Z/Y或积木编辑快捷键。
- 与工具栏共用已有就绪/busy/扩展/模式/硬件守卫；忙时不写入，显示已有可理解反馈。不得只检查按钮disabled，也不新增保存实现或绕过documentId/editVersion/revision一致性。
- 保存前提交标题/注释等尚在编辑的原生输入，通过既有blur/flush生命周期及GUI提交时序完成，再走现有导出与保存。避免照搬旧桌面无条件blur导致焦点丢失；保存完成后可恢复原编辑焦点/选择范围，除非用户已切走或正在处理确认/错误。
- 新作品继续首次POST，已保存作品继续PUT；成功/失败/412冲突、恢复/另存为、完整手稿与素材沿当前行为。不给网页的本地下载函数移植一个新的持久化路径。
- 实现入口：native-project-toolbar.ts抽取可复用的保存intent发送方法，openblock.ts调用；App.tsx父层复用同一save函数；editor-protocol已有save枚举不扩展。

## 5. 核心B：真实积木搜索的最小 GUI 层

当前CFZN未发现官网searchBlocks机制，**不修改Blockly.Toolbox原型、不复制Mind+ Blockly包、不修改VM**。采用当前网页的“真实类别XML→真实积木文字→搜索结果类别”原则，在现有GUI容器和ToolboxPresentation之外增加小型搜索控制器。

### 原生接入与索引

1. 在固定GUI的src/containers/blocks.jsx工作区创建/工具箱刷新边界增加精确GUI hook，传入真实Blockly、当前workspace、已完成compose的原始工具箱XML及刷新/选类回调；通过CFZNOpenBlock.renderPaletteSearch构造iframe React16搜索栏。现有composeToolbox、locale、恢复延迟和同VM幂等边界保持。公共hook须主控冻结后才实施。
2. 原始compose输出是唯一允许集合：先应用实际编辑目标、当前模式、主控/已提交模块、hideFromPalette与原有过滤。动态category的custom回调通过workspace.getToolboxCategoryCallback取得当前XML，包含真实变量/列表ID、自制过程mutation与参数，不枚举未加载扩展。
3. 索引每个可显示顶层block模板的完整XML、所属类别、opcode、禁用状态及真实本地化文字。优先读取当前原生flyout中对应积木的toString；未有实例时用原生XML工厂在现有展示用flyout workspace中短暂构造，读取文字后立即dispose，生命周期不得挂主workspace/VM监听，不向用户工作区插块。不得以静态中文词表、opcode关键词或目录描述替代真实标签；动态菜单无法正确解析时必须修复索引流程，不能硬编码兜底后宣称覆盖完整。
4. 去重键为类别+opcode+语义XML：忽略展示实例生成的block节点ID/位置；保留变量field ID、过程mutation、字段值、引脚、嵌套shadow及其他语义。相同opcode但不同过程/字段模板不能合并；shadow和菜单辅助块不单列结果，仍作为父块XML保留。button/label/sep不当作积木。
5. 查询trim后对真实本地化文字做子串匹配，可对英文不区分大小写；这是明确的小幅易用性选择，不移植旧桌面拼音/特殊标签或结果上限。可短延迟合并输入；若限制首屏渲染，必须显示真实总数并能继续查看，不把未展示结果当不存在。

### 原生结果、状态与关闭

- 非空查询在工具箱展示临时“搜索结果”类别，复制命中的完整XML节点，仍由现有Blockly飞出区渲染及原生拖拽创建真实积木。原始XML深拷贝，不像直接appendChild那样挪走原类别模板。不引入第二VM或自绘假积木卡片。
- 编程模式上传专用块继续带“仅上传模式”说明且disabled，不因搜索变可用；上传模式按实际可用集合启用。菜单/阴影/变量/过程参数均由原模板和原生控件处理，搜索不枚举并修改用户字段。
- 无结果显示“没有匹配的积木”，保持编辑器可用；空查询、清除、Escape或关闭移除临时结果类别，恢复原类别/滚动/焦点。原类别被模块移除时用既有fallbackCategory，不留幽灵选中状态。清除查询不能清空工作区。
- 索引及结果以documentId、targetId、locale、模式、主控、已加载扩展集合、工具箱版本和变量/过程变化失效；使用代次令牌丢弃旧异步结果。新建/导入/切板/模块移除/语言重挂后从新原始XML重建，不给旧缓存保留能力。搜索类别本身排除出下一次索引，避免递归重复。
- 仅刷新工具箱展示，不调用loadProject、emitWorkspaceUpdate或重建主workspace来做搜索；不写查询到归档/存储，不增加editVersion/dirty。完整块图、连接、字段、变量列表、监视器、素材、手写源码和模式不变。查询不运行程序、不请求串口/Link。
- 输入有名称、清除/关闭可Tab和Enter/Space操作，结果数量以polite状态播报，焦点不被后台刷新抢走。遵守已有模态/busy与拖拽禁用边界。

## 6. 开发后验收与未知

由主控冻结后前端实现，Sol low在真实隔离Vite dev与static dist验收；研究阶段不拿自验代替最终结论。

- Ctrl/Cmd+S：真实键盘，父层与iframe、标题/注释/Monaco焦点各场景；新建和已保存项目各一次正确写入；重复/忙/失败/冲突行为；不出现浏览器保存网页或重复请求。验证当前手稿、最后一次字段编辑和完整归档。
- 搜索：实际中文与切换后的英文标签、Scratch核心、当前主控与六模块、动态变量/列表/自制过程；期望集合由真实工具箱独立取证，不复用实现索引充当oracle。模式/locale/目标/板/模块变化后无旧结果。
- 结果必须真正鼠标拖出并保留字段/菜单/shadow/过程参数，上传块生成参数敏感代码；编程禁用块不能拖用或绕过执行守卫。验证重复模板、空/无结果、关闭与原类别回退、清除不损坏原类别。
- 查询、关闭和索引重建前后editVersion、完整项目图与素材/手稿保持，运行中的纯舞台程序不被查询停止；重复语言重挂仍同VM幂等。固定VM/Blockly代码字节不变，新增hook仅GUI范围。
- 新GUI hook/索引动态回调覆盖及短暂展示实例的事件隔离是实施必须验收的技术点，当前没有产品实现，不声称已通过。Monaco文档/来源切换后的撤销栈边界未新测，因此本轮不加撤销按钮或重写模型。舞台扩展卸载、桌面崩溃恢复、Python与Link集成均另列，不阻塞核心两项。

本轮停止扩大调查，先交此矩阵与两个具体接入方案。官网运行未完成已标未知，当前网页静态REA成功；本地桌面仅辅助。临时profile删除被自动审批以blocked by policy拒绝，目录C:/Users/YUUMEI/AppData/Local/Temp/rea-browser-scenario-iW6l4L保留；没有尝试替代删除，相关浏览器/CLI进程已核对退出，不影响提案。
