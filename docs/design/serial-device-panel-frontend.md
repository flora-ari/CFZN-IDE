# 串口设备面板：本机直连优先

2026-11-23。前端只读提案，待主控合并两侧设计并冻结契约后开发。

## 现状与最小改动

当前 [connection-modal.ts](../../apps/web/src/connection-modal.ts) 只把 `session.refresh()` 返回的浏览器已授权对象列为连接行；OS `/ports` 放在另一个烧录下拉框。波特率草稿只有一个，随活动会话变化覆盖，无法独立记住各行设置。[HardwareSession](../../apps/web/src/hardware-session.ts) 已实现唯一 reader/writer、串行写入、关闭确认、失败恢复与旧事件失效；[NativeSerialSocket](../../apps/web/src/native-serial-socket.ts) 和原生 VM API 均复用它。

本机 [ports.ts](../../apps/api/src/hardware/ports.ts) 只做 OS 枚举，[HTTP 服务](../../apps/api/src/hardware/app.ts) 尚无串口打开、收发或关闭接口，当前 capabilities 版本 1 不能证明可直接连接。主控先前读到 `/ports` 为 `items:[]`，随后在 Windows PnP 确认 CP210x COM3 正常、驱动错误码 0，正在确认枚举遗漏或插入时差。前端忠实显示服务结果，空列表文案为“本机服务暂未列出串口，可刷新检测”，不推断实体设备不存在；修正服务返回 COM3 后直接展示该真实 OS 行，不以浏览器尚未授权隐藏它。

建议新增本机 HTTP 串口传输适配器，实现现有 `SerialLike/SerialPortLike` 外观，将本机返回的有序字节包装为浏览器 Streams。HardwareSession、NativeSerialSocket、TerminalModel 及原生 VM 接口继续拥有同一条活动流。适配器内部轮询只供这一个读取流消费，不另向 VM 或终端写一份数据。仅外部适配层和 GUI 展示挂点需要修改，VM/Blockly 原字节保留。

## 用户看到的设备行

默认“本机直连”，打开面板后检测本机串口能力并枚举 OS 端口；枚举不打开串口。最终列顺序固定为 **设备名称｜端口｜波特率｜状态｜操作**。连接、断开、切换和已连接行的应用全部位于最右侧“操作”区域，按钮完整可见，不放进状态列或表格左侧。名称取本机 `displayName`，端口列显示返回的真实 OS `portId`（如 COM3 或 /dev/ttyUSB0），不能以当前选择的主控板名称替代真实 USB 名称。端口字符串和长错误允许换行。

本机服务在线且支持 serial 才启用本机行“连接”。缺工具链但串口能力可用时仍能连接；在线旧服务缺 serial 字段显示“需更新本机服务以使用直接串口连接”。服务离线、权限受限、枚举失败、真实零项分别说明，提供重新检测/刷新。保留上次成功数据时标为“上次列表，尚未确认”，不能继续显示为已确认可连接。

浏览器后备放在次要入口“使用浏览器串口（首次需授权）”。进入后先列 `getPorts()` 已授权对象，行内可直接连接；首次或新增授权保留一个“授权浏览器串口”按钮，其点击同步调用 `requestPort()`，前面不插入 HTTP/扫描 await，取消保留原连接。后备行的端口列显示“浏览器授权端口”，不显示推测 COM。Chrome 官方明确区分已有授权和用户手势触发的首次选择。[Web Serial 使用说明](https://developer.chrome.com/docs/capabilities/serial/)

本机键为 `local:<规范化 OS portId>`，浏览器键为当前页面内的 `browser:<opaque-id>`，显示与会话注册表分开；不以 VID/PID 或列表顺序合并两个来源。切换列表来源只改变展示，不自动断开或打开；已有活动行持续显示。本机恢复在线也不自动把活动浏览器会话转成本机连接。未支持 Web Serial 的浏览器仍可使用本机串口能力，不能因 navigator.serial 缺失禁用本机列表。

## 每行波特率与状态

每行按键保存自己的 `draftBaud / savedOptions / appliedOptions`。重开弹窗、刷新设备列表、连接另一行均不覆盖其他行。未连接行可编辑并保存有效值，连接点击捕获该行设置；已连接行改值后显式“应用”，成功后才更新活动会话的实际值及原生控制台镜像。无效输入仅在本行报错，不阻止编辑别行；串口操作仍共用全局守卫。

建议本机已保存偏好按“本机服务地址 + OS 端口键”存匿名本地设置，明确是按端口记住；端口被其他设备复用时仍需用户确认连接。浏览器行至少在当前编辑页内跨弹窗与刷新列表保留，跨整页加载不承诺物理设备稳定身份，不用 VID/PID 拼持久键。输入采用现有正整数范围校验，硬件/驱动不接受的速率如实返回；默认 115200，常用值以 datalist 提示，保留其他串口选项。

| 行状态 | 显示与操作 |
| --- | --- |
| 已枚举、未连接 | “未连接”，可编辑本行波特率并连接；不能称已验证可用 |
| 正在连接/切换/应用 | 目标行显示真实操作，冻结所有连接变更，防双击 |
| 已连接 | 显示真实应用速率，提供“应用/断开”；其他行提供受守卫的“切换连接” |
| 正在断开/待释放 | 关闭尚未确认不能标未连接；失败保留“待释放/重试断开”，阻止第二次打开 |
| 被本机作业占用 | 显示编译/烧录占用原因，连接/切换/应用禁用，等待取消完成及工具退出 |
| 已拔出/已失效 | 按真实会话事件更新；保留活动行及本行错误以解释结果，刷新后未连接旧行可移除 |
| 连接失败、已恢复旧连接 | 目标行保留失败原因；旧行保持真实已连接及原应用速率，不能把整表标为失败 |
| 本机服务失联/结果未知 | 显示“状态待确认”，阻止并发打开和自动浏览器接管，待状态核对或租约关闭确认 |

实时协议固定的有效波特率继续服从已有协议守卫。VM 的 updateBaudrate、终端设置和行内应用均走同一设置事务，只同步活动行的实际值，不重写其他行偏好。设置不会改 Serial.begin 积木、上传速率、作品脏状态或归档。

## 本地 HTTP 会话的最小协作接口

下表是前端所需语义和建议路径；最终路径、字段和错误码由主控与后端提案统一，当前不改公共接口。沿用 127.0.0.1:3002 的硬件 base，不通过线上项目 API 代理 USB。保持已有编译/上传 endpoints。

| 操作 | 建议接口与前端需要的结果 |
| --- | --- |
| 能力与列表 | `/capabilities` 增可选 `serial:{version:1,available,reason?}`；旧版无字段判需升级。复用 `GET /ports`，空 items 是合法结果 |
| 打开 | `POST /serial/sessions {portId,options,requestId}` → `{sessionId,portId,options,state}`，返回成功须已获得真实 OS 读写能力。requestId 可核对/幂等，响应丢失时可查原尝试，禁止盲开第二次 |
| 状态与接收 | `GET /serial/sessions/:id?after=<cursor>` → 实际 state、按序带 cursor 的原始字节块、nextCursor、错误。支持有界长轮询；单个在途读取，保序、不重放，缓存溢出明确失败，不默默跳字节 |
| 发送 | `POST /serial/sessions/:id/write {requestId,bytes}` → 明确接收/写入确认。bytes 为有界 0–255 数组，现有 writer 排队；请求不明时不得自动重发 TX |
| 关闭 | `POST /serial/sessions/:id/close` → OS 句柄已关闭才确认 closed；幂等。状态/读取可续约，有界租约负责页面退出/断网后的释放；租约时长及状态核对路径由后端冻结 |

后端须对本机 serial 会话和编译/烧录维护统一互斥守卫，包括其他标签页；前端禁用按钮仅是反馈。当前 VM 只维持一个活动串口，不扩展为多设备并行控制。本地会话 ID 不等于行 ID，重连生成新会话，旧 read/disconnect 不能影响新流。

打开、应用、切换、断开全部经 HardwareController 的 idle/mutation/protocol 守卫，延续“停新写→排空旧写→取消读/释放锁→确认关闭→打开目标→成功提交”的事务。目标失败沿用旧连接恢复，不回放 TX。上传前关闭当前来源的真实会话，确认释放后才提交烧录；作业终态后仅按原规则恢复先前打开的来源/端口/设置，恢复错误与作业结果分开。不因选择设备、保存波特率或打开面板自动烧录。[现有事务](../../apps/web/src/hardware-session.ts) · [上传释放/恢复](../../apps/web/src/hardware-controller.ts#L235) · [外部 VM 接入](../../apps/web/src/native-hardware.ts#L14)

HTTPS 访问本机服务仍可能出现 Chrome/Edge 的本地网络/回环权限，这是访问本机助手的许可，和 Web Serial 首次设备许可不同。本机服务继续限定 loopback、产品 Origin 和正确 CORS；现有 Private-Network 响应头不能代替浏览器许可。前端仅在受支持时查询权限，未知时按用户点击检测；拒绝时说明站点权限位置，fetch 失败无法定位时不假报服务未安装。当前同源 iframe 及部署响应的 Permissions-Policy 需一起核对，按实测版本处理 loopback-network/旧 local-network-access 名称，保持同源授权，不使用全站通配。以上是待实际部署浏览器验证的兼容条件。[Chrome 当前指导](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access?hl=en) · [Edge 官方指导](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access)

## 弹窗尺寸与可操作性

现有 [CSS](../../apps/web/src/native-hardware.css#L21) 给连接框 `max-height:100dvh-32px`，同时上下使用 `min(8vh,64px)` margin，合计可超过视口；正文还叠加固定表格高度、独立下拉与最小 232px 结果图。建议复用已验收上传弹窗的有界 flex 结构，用高于 GUI 单 class 规则的 `.cfzn-hardware-modal.cfzn-connection-modal` 双 class 选择器设置 width 为 `min(900px,calc(100vw - 32px))`，height/max-height 为 `min(760px,calc(100dvh - 32px))`，margin 固定 `16px auto`、box-sizing:border-box。不能仅继续追加 `.cfzn-connection-modal`，上线检查需核对 GUI 运行时注入样式后的 computed style。

核对固定上游 GUI 的 `modal_ModalComponent` 后，真实层级如下。`className` 在 ReactModal 内容节点上，`headerClassName` 在内部标题节点上，ConnectionView 和标题是原生 Box 内的兄弟节点；不能误把内容节点的首个子 div 当成标题。

```text
原生 modalOverlay
└─ ReactModal 内容：GUI modalContent + cfzn-hardware-modal cfzn-connection-modal
   └─ 原生 Box（direction=column, grow=1，直接子 div）
      ├─ 标题与关闭：GUI header + cfzn-connection-header
      └─ ConnectionView：cfzn-hardware cfzn-connection（正文滚动区）
         ├─ 服务状态与刷新
         ├─ 五列设备行
         └─ 后备说明、本行错误、紧凑状态
```

在 renderConnection 传入现有 Modal 的 `headerClassName:'cfzn-connection-header'`。内容节点与直接子原生 Box 都设 display:flex/flex-direction:column；Box 用 flex:1、min-height:0、min-width:0，标题/关闭 flex-shrink:0。`.cfzn-connection` 正文用 flex:1/min-height:0/min-width:0/overflow-y:auto，服务状态、表格、次要后备说明都进入这个正文滚动区；五列表头可 sticky，设备列表不再嵌套一个固定高度滚动区。表格及所有 th/td 用 box-sizing:border-box，五列宽度含 padding，避免最后操作列超出右边界。大扫描结果图移出主要布局，收为紧凑真实状态文字。烧录端口选择继续由编译/烧录设置维护，连接不会顺带更改明确的上传端口。容器边界可裁背景，但不能靠整体 overflow:hidden 把操作藏掉。[原生 Modal 接入](../../apps/web/src/native-hardware.ts#L76)

在 1280×720、1366×768、1920×910 的 100% 缩放下，标题/关闭及正文滚动区都在视口内，所有行操作可滚达。另覆盖用户可能使用的 125% 缩放，以实际 CSS 视口约 1528×728 为独立尺寸；按该高度内容框最多 696px，加上下 16px 外距合计 728px。无需更改用户浏览器全局缩放，验收按 CSS 像素测量。小于约 640px 时每个设备仍是一组完整行内容，使用带可见字段标签的纵向卡片/网格排列五项，操作统一放在卡片底部右对齐，不把五列硬压成横向小字；按钮和输入至少 32px 高、保留 focus-visible。保留原生 modal 的焦点圈定、Escape 与关闭后焦点返回；关闭面板不等于关闭串口，已有操作继续由会话状态协调。

## 聚焦验收

1. 本机 serial 能力与浏览器支持独立：新版在线能直接列 OS 行并在行内连接；旧版提示更新；offline/枚举失败/零项分别准确；首次打开和刷新不打开物理串口。浏览器后备已授权直连、首次授权、取消/拒绝均按真实权限结果反馈。
2. 两个同 VID/PID 的 OS 端口及两个浏览器对象保持不同身份；刷新、排序、开关弹窗不串行波特率。编辑第二行不改变第一行应用值，非法输入定位本行。浏览器 fallback 不声称映射 COM。
3. 单一会话下测试切换失败恢复、关闭失败持有、拔出、请求响应丢失、读游标连续性和写入不重放；协议占用、模式切换、编译/烧录及另一标签页占用时受同一守卫。上传关闭确认后方可开始，结束恢复原来源，错误不覆盖真实 job 结果。
4. 在 1280×720、1366×768、1920×910、125% 对应约 1528×728 CSS 视口及 360×640 窄屏，覆盖长设备名/端口/错误、空列表及至少 20 行。核对实际 Box/header/body 层级、computed style 和矩形边界，标题/关闭固定可见、最后一行操作可滚达、右侧操作完整、无页面级横向溢出；键盘遍历、行标签、错误朗读和关闭返回焦点可用。不能通过修改全局缩放规避裁切或用截图代替边界检查。
5. 原生连接状态、终端 text/HEX 收发和 VM 接口由同一个 HardwareSession 驱动；五板编辑/归档保持，VM/Blockly 字节验证继续通过。mock 传输和真实 OS 串口验证分开报告，物理测试仅由主控统一安排。

本轮只写本设计文档；没有开发源码、增依赖、启动服务、操作浏览器/实体串口或服务器。
