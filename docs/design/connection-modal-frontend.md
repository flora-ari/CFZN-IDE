# 连接弹窗前端提案

日期：2026-11-10。角色：前端接口设计（gpt-6.1-sol / ultra）。提交主控冻结，不修改 apps/web、VM、现有契约或真实串口。研究文件仅写入 .runtime/connection-modal-research/。

## 1. 交付结论

连接入口直接打开原生遮罩内的一个白色弹窗，标题为 **连接 + 当前主控显示名**。保持用户参考的“上方设备表格 + 下方连接状态图”结构，不拆成多个设置卡片；CFZN 沿用原生蓝色标题栏。弹窗内修改实际设备端口与波特率，上传区和终端订阅同一 HardwareSession/HardwareController 快照。顶部项目工具栏保持最新五按钮，上传模式终端保留。

复用已存在的官网扫描研究，不重跑扫描、桌面大 bundle 或完整官网抓包。本次补齐了成功/失败共用底图的精确来源、上传版相同状态分支，以及两个连接选段的 REA 静态分析。官网发现和连接经 Mind+ Link；CFZN 通信仍为 Web Serial，首次授权窗口必须由浏览器展示，网页弹窗不能替代它。

## 2. 证据范围：观察与静态事实分别记录

### 已有受控浏览器观察（复用）

- 官网 https://ide.mindplus.top/realtime/projects/editor ，标题“新建项目 - 实时模式”；选择 FireBeetle ESP32-E 后弹窗标题“连接 FireBeetle ESP32-E”，列为设备名称、端口、状态、连接操作，空表显示“设备扫描中...”，底部扫描说明及串口示意图。
- DOM、尺寸、CSS：scan.json、connection-rules.css；已加载图片的截图为 scan-assets-loaded.png。1600×1000 下外框宽680px、高约519px，圆角10px，标题栏44px；表头约35px，数据滚动区146px，底部状态区256px。
- REA inspect_web_page 证据 rea-inspect.json：ev_894c528dcdb7da55133063b02e8274f67e04e9891e338df868d6e89f9a1a1420，观察时间 2026-11-10T06:06:56.553Z–06:06:57.878Z（北京时间14:06:56）。
- **该浏览器使用 routeWebSocket 模拟 Link，serialList 返回空列表；未连接真实本机 Link 或串口。** 可称为官网实际渲染的扫描 DOM，不能称实际硬件扫描、连接成功或失败的实机观察。脚本 inspect-modal.mjs 和 network.json 明确记录 simulatedLink=true。

### 本次只读静态核对

当前公共脚本重新下载校验后与已缓存文件 SHA-256 一致，见 source-verification.json：

| 页面 | 官方脚本 | 本地源文件 | SHA-256 |
| --- | --- | --- | --- |
| realtime | https://ide.mindplus.top/realtime/static/js/main.d8c89955.chunk.js | asset-cf38db76a253.js | cf38db76a2536009779256943bfd3c4c59c68256bc12a9b74dcf4926f0907f9d |
| upload | https://ide.mindplus.top/upload/static/js/main.412a2633.chunk.js | ../hardware-research/upload-5f3b17a297bd.js | 5f3b17a297bd06470de266161264a5f7443806512451519e1bb37304dddc8c46 |

realtime 的 JE 为表格列/连接按钮，op 为状态映射，hp 为连接中，gp 为结果图，Np 为整体弹窗；upload 的 Af/Ef/pf/gf/_f 对应同类状态与图片分支。两版均存在 scan、ing、result 分类，connected → result/0，error → result/1，connecting → ing/0，disconnect → scan/1。

结果图不是两张独立成功/失败 PNG：两者共用内联同心圆底图，叠加 serialport 图标，成功色 #4FA2EF，失败色 #FF8080，并显示“连接成功/连接失败”。连接中使用 searching 雷达图，扫描使用 scan-sp 电脑连线示意图。错误结果带详情入口；表格在已有连接/连接中时禁用其它行。上传版的内联底图与实时版字节相同。

这些是静态分支事实；本次没有重现官网真实连接成功/失败状态，也没有进行固件握手。官网包中还有烧录/擦除入口，但本轮连接弹窗不因此新增擦除或自动烧固件能力。

### REA 本次执行与限制

使用 D:/rea/.published-runtime/node_modules/rea-agents/scripts/rea.mjs（6.8.0）及本项目 .runtime/rea-tools/node-v24.22.1-win-x64/node.exe，只分析 selected/realtime-connection.js 与 selected/upload-connection-status.js，总计48,777字节，2文件解析成功、0解析失败、6,850 AST 节点。证据为 rea-selected-summary.json / rea-selected-evidence.json，父证据 ev_fc7dd16cd0414742325f401f4930efa9eec05877b39b2e960604db959cea2275。

selected-provenance.json 保存原脚本 URL、哈希、UTF-16 选择区间和输出哈希；realtime 选段仅在声明末尾补分号，未执行脚本。选段依赖外部压缩符号，application coverage=partial、semantic coverage=unknown，含1743语义未知项；这是范围内静态分析，不是整个官网或协议全覆盖。本次没有重复分析60MB桌面 bundle。

## 3. 可交给开发的资产

下表路径均相对 F:/CFZN/CFZN-IDE/.runtime/connection-modal-research/。完整机器清单为 connection-assets-manifest.json；旧 asset-map.json 继续保留。

| 用途 | 研究文件 | 来源 | SHA-256 |
| --- | --- | --- | --- |
| 扫描/未连接串口示意 | scan-sp.43a795b2.svg，3034B | https://ide.mindplus.top/realtime/static/media/scan-sp.43a795b2.svg | c8279ef7930d2d268e45b6c4b9fb111c5ea37c87713b3e9eb0147d24514a0c71 |
| 正在连接雷达 | searching.48df3abf.png，240×240，42624B | https://ide.mindplus.top/realtime/static/media/searching.48df3abf.png | 6f989a176727ca6890d0f06796e650f6425235daa23de1506dcfa8c9e79f29fc |
| 成功/失败共用底图 | result-rings-inline.png，136×136，8589B | realtime main 脚本 UTF-16偏移14772548的内联PNG；upload字节相同；与原 inline-0.png 相同 | 1f6a0fa66a72589f5b3cd2fdeebe356b661e558a63026acd94af9a444a4e2e27 |
| 中心串口图标 | icon-serialport.svg，444B | 官网 DOM symbol #df-serialport，由已有 save-assets.mjs 提取 | 81aaa9cc7171d2f221d794ab61c9108f26cdc0dd3977ae7d40812d530b33cb1b |
| 标题连接图标 | icon-link.svg，562B | 官网 DOM symbol #df-link，由已有 save-assets.mjs 提取 | bc94a6cbcb9570061a3c46ced53f6634de83ad96349cbee2a8d2b4dcabcc1fa2 |

开发按主控决定把所需资源复制到 apps/web/public/cfzn-connection/ 并保留上述来源清单；本分支未写产品目录。扫描/结果示意图仅表示连接状态，不包含固件。不要把官网 JS、品牌标志或私有 runtime 引入产品。当前已提取图文件没有额外许可证声明，清单保留其研究来源事实。

建议界面资产组合：扫描=scan-sp；opening=searching+serialport；open=result-rings+蓝色serialport；failed=result-rings+红色serialport。状态含文字，不能仅靠红蓝区别。133px左右显示雷达/结果圆图；状态图装饰性 alt 为空，文字通过 role=status 宣告；prefers-reduced-motion 下停止旋转。

## 4. 单一白卡布局与入口

保留 native-hardware.ts.renderConnection / 原生 Modal；将固定 contentLabel“设备连接”改为“连接 {当前主控名}”，名称来自已提交 canonical deviceId 的 metadata，不从最后点击卡片、COM芯片名或 Profile 临时值猜测。无主控显示“连接主控”并给选择入口。

MenuBar 连接按钮、上传区连接入口都只调用同一个 openConnect，首先展示网页弹窗；不在点击 MenuBar 时立即调用 requestPort，不跳到旧设置弹窗。关闭 X/Escape 只关弹窗，不断开已连接设备；真正断开必须点对应行按钮。焦点限制在弹窗，关闭后返回发起按钮。

~~~text
┌ 连接 ESP32                                      × ┐  原生蓝标题
│ 终端波特率 [115200 ▼]  [应用]   [选择其他串口…]  │
│ 设备名称           端口            状态    操作    │
│ Silicon Labs…      COM3（用户指定） 未连接 [连接] │
│ 已授权串口 2       浏览器串口       可用   [连接] │
│                 [刷新设备]                       │
├──────────────────────────────────────────────────┤
│             扫描/连接中/成功/失败示意图           │
│             当前状态、操作提示或具体错误          │
│             [查看详情]（仅失败时）                │
└──────────────────────────────────────────────────┘
~~~

同一白色内容区，顶部控件、表格、底图之间只用间距/一条分隔线，不嵌套设置卡片；680px宽，窄窗口 max-width:calc(100vw - 32px)，高度不超过视口，只有表体和必要内容区域滚动。为波特率行增加约36px高度即可，不改成侧栏或全屏向导。表头语义用 table/th，状态有文字，连接/断开使用真实 button。

不复制官网“打开设备管理器”操作：普通网页没有该原生能力；CFZN 使用现有授权/错误帮助。项目工具栏不恢复已删除的串口终端按钮。

## 5. 设备行与实际端口：明确数据来源

必须保留两个标识：browserPortId 表示被浏览器授权的 SerialPort；osPortId（现有 controller.portId）表示用户选择的本机烧录端口。**Web Serial 不提供 Windows COM 路径，不能用相同 VID/PID 把二者自动配对。** 首次 requestPort 必须在真实点击内直接执行；getPorts 只返回已授权列表，不能冒充全系统设备扫描。依据：[Chrome Web Serial 官方说明](https://developer.chrome.com/docs/capabilities/serial)。

建议同一表格合并展示来源，但仅通过显式用户选择建立关联：

1. 打开弹窗并行读 session.refresh() 与现有 hardware.refresh()/GET /ports。前者列授权串口，后者枚举 OS 端口，不打开设备；刷新期间只短暂显示“正在刷新设备列表”，完成后无设备显示“未发现已授权设备，请选择串口”，不能永久转圈。
2. 有本机执行器时可展示 COM3 等 OS 行。该行的“连接”在尚未关联 browserPort 时，点击内直接 requestPort，并明确提示“请在浏览器窗口选择 COM3”。选择成功后建立 **用户指定关联**；这是用户选择而非网页验证到 COM3，列表注明“用户指定”。随后按统一会话完成实际 open，只有 open 成功该行才成为已连接。用户取消则保留原连接和原设置。
3. 已授权浏览器端口没有 OS 关联时独立展示“已授权串口 N / USB…”，端口列为“浏览器串口（未关联OS端口）”，仍可正常连接；不得伪造 COM 编号。若需上传，用户再明确指定 OS 端口。关联可在该行端口下拉修改，修改同步 controller.portId，不暗改 browserPortId。
4. 本机3002不可达时仍展示浏览器授权行与“选择串口”，终端可用；OS 端口标明暂不可取得，上传能力按既有契约不可用。选择通信端口不能被尚未加载 profile 或编译工具缺失阻断。
5. 同一个 browserPortId 只对应一个活动通信连接；用户关联与OS选择仅在本次会话有效，不写 .ob/localStorage，不按上次 COM3 自动连接。重新枚举发现 OS 端口消失时清除失效选择并同步其它区域，不退到第一个端口。

表格的设备名称使用系统 displayName 或浏览器授权描述，主控名只在标题/上下文展示；CP210x 不表示已识别 ESP32/S3。端口列的来源标记不能省略，否则会把人工配对误呈现为自动物理识别。

## 6. 统一设置与切换事务

唯一真实配置仍由 HardwareSession.options、HardwareSession.portId、HardwareController.portId 管理；弹窗只保存未提交的 baudRate 草稿和 selectionPending。上传区终端、原生console、标题连接状态从同一快照订阅；所有入口复用统一 changeConnection/changeOptions 方法，不分别 setState 或创建第二个 session。

### 波特率

支持常用9600/19200/38400/57600/115200/230400/460800/921600与合法自定义正整数，默认显示当前 options.baudRate。未连接时“应用”更新下次连接配置；已连接时复用 session.setOptions，等待写队列→取消读→释放锁→close→同端口open，完成后再显示新波特率。打开失败保留失败状态和请求值，不能显示仍已连接；关闭失败保留占用，不能允许上传或打开第二个串口。

原生 console 的 hardware-console.baudrate Redux 字符串与会话 options 一起在统一命令成功后更新；上传内终端的 baud 输入由该快照刷新。通信波特率不等于 CLI 烧录速率，后者继续由 profile/recipe 决定，弹窗不要修改 FQBN。

### 更换实际通信端口

更换到已授权端口：先验证目标仍在授权列表，关闭旧端口并确认释放，再打开目标。更换到新授权端口：点击时先直接 requestPort，用户未选择前不关闭旧连接；选择成功后再执行关闭/打开事务。现有 session.choose() 在已连接时拒绝选择，开发应拆出仅授权/remember 的入口或调整其守卫，不能在 await close 后才 requestPort 丢掉点击手势。

选框期间 selectionPending 是弹窗操作状态，旧连接仍然实际存在，不能把全局 connection 从 open 提前改成 disconnected。更换成功生成新 sessionId，旧 RX/TX 事件按既有 session 校验丢弃。新端口打开失败显示未连接及重试入口，不假装仍在旧端口。OS 烧录端口关联的变更采用用户明确选择并同步 hardware.portId；不靠 VID/PID联动猜测。

硬件作业busy/cancelling、protocol占用或串口opening/closing时禁用端口/波特率变更并显示原因；关闭弹窗不取消编译、烧录或真实串口操作。未验证ESP32实时协议不因连接成功显示实时ready；Uno实际协议占用遵守其现有模式/握手约束。

## 7. 状态与错误策略

| 会话/操作结果 | 表格与底部状态 | 行为 |
| --- | --- | --- |
| 刚打开/刷新 | 表头保持；短暂刷新状态 + scan-sp | getPorts/GET ports结束后退出刷新，无自动授权 |
| 无授权/无设备 | “尚未选择串口” + scan-sp | 提供选择串口；不能写成已扫描全系统无设备 |
| requestPort等待 | “等待浏览器选择串口” + scan-sp | 浏览器安全框拥有选择；只一份picker pending |
| 授权取消 NotFoundError | 中性“未选择串口”，不红色失败 | 保留原连接/波特率；允许再次点选 |
| opening/switching | “正在连接/切换端口” + searching | 禁止重复连接、TX与设置提交 |
| open | 当前行“已连接”/断开，底部蓝色圆图+成功文字 | 基于port.open与流建立完成，不声称固件协议通过 |
| open失败/占用/授权拒绝 | 红色圆图+具体错误、重试/详情 | 端口占用提示释放其它使用者，不杀外部程序 |
| disconnect成功/拔出 | 未连接或“设备已拔出” + scan-sp | 清除当前活动状态，正常保留可重选授权项 |
| close失败 | “断开失败，端口仍被本应用持有” | 保留占用，阻止CLI交接，不提前报断开成功 |
| unsupported/SecurityError | 原因与浏览器/权限提示 | 不循环扫描，不归因未安装旧Link |
| CLI unavailable | 通信仍可用；OS列表单独提示 | 不把编译服务错误当串口失败 |

详情显示当前会话该次操作的错误名称/阶段/消息；不复用Mind+私有_outputMessage或读取系统资料。避免整页阻塞式alert；保持弹窗内重试和focus。刷新/连接的异步结果与操作代次绑定，关窗或切板后迟到结果不覆盖新主控标题及会话。

## 8. 开发接点及验收

前端修改集中于 native-hardware.ts/.css（表格/状态图与标题）、hardware-session.ts（只授权选择、更换端口事务）、hardware-controller.ts/hardware-types.ts（共享选择与快照）、mode-ui.ts 的终端设置入口，以及必要的外部 native socket/Redux 同步。复用当前 GUI connection modal hook；不增加VM源码或产物补丁，不改3001/3002 HTTP。具体内部方法名由主控契约与开发共同落实。

验收至少包含：入口直接开新弹窗；五板标题随已提交主控变化；空列表/取消/unsupported/失败/连接/拔出底图和文案正确；OS与浏览器未关联时诚实展示；两块同VID/PID设备不自动配对；更换端口和波特率只保留一个reader/writer；其它终端/上传区域同步；picker取消保持旧连接；close失败不允许上传；硬件busy禁用变更；关窗不等于断开；重新开窗状态正确；顶部仍五项目按钮。

本次成果是有来源的资源、范围明确的REA证据和设计，不是连接实现或硬件验收。未观察到的官网成功/失败运行态已经标注，现有静态分支足够进入实现，无需等待其真实串口复现。实际COM3访问仍由主控统一调度。
