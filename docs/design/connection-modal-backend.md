# 连接 Modal 后端接口设计提案

日期：2026-11-10（Asia/Shanghai）；补充核对统一配置入口、已连接换端口及失败恢复。  
角色：主控派出的后端接口设计；设计阶段，不实施业务代码。  
状态：提案，待主控在 `docs/api-contract.md` 冻结。本文件不改变既有 Hardware v0.2 HTTP 契约。

## 结论与范围

建议本轮 **后端与 HTTP 零改动**。波特率编辑、连接列表、未连接/成功/失败状态和各入口同步，均由编辑器内既有 `HardwareSession` 与外部 OpenBlock 适配层实现。Mind+ 式内置列表可以覆盖已授权端口的日常连接；首次访问新端口仍需用户主动触发浏览器授权选择器。

保留以下边界：

- 浏览器 Web Serial 独占终端连接与收发；后端不持有终端串口，不新增终端、连接、波特率或授权 API。
- 本机硬件服务 `127.0.0.1:3002` 负责系统端口枚举与已有 CLI 编译/烧录；项目 API 3001 不变。
- 系统端口名和浏览器授权句柄保持两个命名空间。不能以 VID/PID、列表顺序或“只有一个候选”猜测浏览器端口就是 COM3。
- 不修改 openblock-vm 源码或打包 VM，不新增认证、用户数据、持久化设备标识或项目归档字段。
- 本阶段未调用真实 `/ports`、未启动/停止服务、未连接设备、未编译或烧录；结论来自代码及正式 Web Serial 文档核查。

## 现有实现核查

| 位置 | 实际职责 | 对本轮的意义 |
| --- | --- | --- |
| `apps/api/src/hardware/app.ts` | 注册 capabilities、ports、builds、uploads、jobs、cancel；限制本机地址/已配置 Origin，GET 无缓存 | 不存在浏览器串口代理或终端专用接口，无需新增路由 |
| `apps/api/src/hardware/ports.ts` | Windows 运行 `Get-CimInstance Win32_SerialPort`，取 DeviceID/Name/PNPDeviceID；非 Windows 枚举匹配的 `/dev` 名称 | 仅列举 OS 端口，不打开端口、不检查占用、不探测固件 |
| `apps/api/src/hardware/executor.ts` | capabilities 返回启动发现的 profile/toolchain 视图；ports 包装枚举结果；upload 再确认明确提交的 portId 仍在列表 | 能力/端口快照不等于已连接；刷新列表不会授权浏览器 |
| `apps/web/src/hardware-session.ts` | 保存授权句柄、options、连接状态和唯一 reader/writer；refresh/getPorts、choose/requestPort、open/close/setOptions | 本轮连接状态、列表和波特率的单一数据来源 |
| `apps/web/src/hardware-controller.ts` | 合并 session 与 CLI 状态；OS portId 为用户明确选择；烧录前释放浏览器，终态后恢复先前会话 | 不能让新 Modal 绕开 busy/释放/恢复流程 |
| `apps/web/src/native-hardware.ts` | 现有连接 Modal、编译烧录设置、原生 VM 连接桥 | 当前连接 Modal 尚无波特率编辑；属于前端职责 |
| `apps/web/src/native-serial-socket.ts` | 原生 SERIALPORT 的外部 JSON-RPC 适配，discover/connect/updateBaudrate 复用同一个 session | 可在外部适配层完善行为，不需要 VM 补丁 |
| `apps/web/src/mode-ui.ts` | 上传终端读取 session options 并订阅 HardwareController；波特率“应用”调用 setOptions | 既有同步通道可复用，不恢复已退休的父层串口抽屉消息链 |

### 当前需要完善的前端接点

- `HardwareSession.choose()` 在已有打开端口时拒绝授权，当前 Modal 也禁用已连接时的新端口选择；`open()` 不接受已有打开端口。因此“修改串口”不能只换下拉框，需要统一的切换操作。
- `setOptions()` 已有 close→open，但重开失败后不尝试恢复原配置；当前没有覆盖换端口、重开、恢复全过程的操作锁。只禁用按钮不够，命令入口也须检查占用。
- `SharedTerminal` 直接调用 `session.setOptions()`，订阅只更新本地 baud 文本；`native-hardware` 的会话订阅只同步原生 peripheralName，尚未统一 `scratch-gui/hardware-console/setBaudrate`。
- `NativeSerialSocket.connect` 目前用原生 `peripheralConfig.config` 覆盖 session options；这会让设备默认波特率覆盖用户刚在 Modal 应用的普通终端配置。`updateBaudrate` 也需进入相同入口，不能成为第二条配置路径。
- 原生 `connect()` 调用 `vm.connectPeripheral()` 后没有等待实际端口完成；成功图必须订阅真实 session open，不能由函数返回或固定延时决定。`refresh()` 枚举异常当前会更新全局 connection error；新实现应把扫描错误与仍在工作的已连接会话分开。
- `serial.ts` 中保留的旧 `SerialTerminalService` 不能重新实例化；本需求仍只有 iframe HardwareSession 持有端口。

### GET `/capabilities`

保持 `HardwareCapabilities` 原有结构：`protocolVersion: 1`、`executionHost: 'local'`、五款主控 profiles 和 toolchain 描述。它回答“这个本机执行器配置了哪些编译/烧录能力”，不回答以下问题：

- 用户当前是否给浏览器授权、端口是否能打开或被占用。
- 实际接入的板卡型号、芯片型号、固件协议是否兼容。
- 当前串口波特率或终端是否已连接。

不要根据 `compileAvailable/uploadAvailable/realtimeAvailable` 改写浏览器连接状态。缺少本机服务或某个 core 时，编辑器及浏览器普通串口通信仍应可用；局部显示编译/烧录不可用即可。

### GET `/ports`

保持 wire type：

```ts
interface HardwarePort {
  portId: string;
  displayName: string;
  usbVendorId?: string;
  usbProductId?: string;
}
// 200: { items: HardwarePort[] }
```

Windows 实现把 `DeviceID` 作为 `portId`（例如 COM3），`Name` 作为 `displayName`，从 PNPDeviceID 提取可选四位十六进制 VID/PID 字符串。不会返回 PNPDeviceID 本身、USB 序列号或浏览器权限标识。非 Windows 当前只有设备路径/显示名；不能要求这些可选 USB 字段总存在。

`200 {items:[]}` 表示本次枚举未列出端口。它不能证明设备未接入，驱动/系统枚举结果仍受本机环境限制。执行系统查询失败时，Windows 当前返回 `503 TOOLCHAIN_UNAVAILABLE` 和“Local serial port enumeration failed.”；本轮沿用现有语义，不为 Modal 调整错误码。HTTP/解析异常也应显示为“本机烧录端口列表暂不可用”，不能变成“浏览器连接失败”。

该接口不提供授权状态、占用/可连接状态、板卡认证、实时固件握手、热插拔推送或波特率。除非用户进行原有显式烧录操作，刷新列表不会触发上传。

## 浏览器授权与 COM 的映射边界

Web Serial 的 `getPorts()` 返回站点已获授权的可用端口对象；`requestPort()` 是首次/新增授权入口，需要用户的即时激活并展示浏览器提示。自行绘制的 Modal 不能替代这项授权。[Chrome 官方说明](https://developer.chrome.com/docs/capabilities/serial)、[Web Serial requestPort 规范](https://wicg.github.io/serial/#requestport-method)

标准 `getInfo()` 提供可选 USB VID/PID 或蓝牙服务类型，不提供 COM 名、系统设备路径或 USB 序列号；`requestPort` 的标准过滤器也没有 COM/path 选项。[Web Serial 端口信息规范](https://wicg.github.io/serial/#serialportinfo-dictionary)、[过滤器规范](https://wicg.github.io/serial/#serialportfilter-dictionary)

据此，本项目设计采用如下规则：

| 信息/操作 | 可以做 | 不可以做 |
| --- | --- | --- |
| 已授权 `SerialPort` 对象 | 用当前页面内 `browser-*` ID 对应真实对象，列出并直接连接 | 把该 ID 当成持久化标识或上传用 `portId` |
| 浏览器 VID/PID 与后端 VID/PID | 作为 USB 类型提示；比较时意识到前端是数值、后端是十六进制字符串 | 即使当前只匹配到一个端口，也自动绑定 COM；同芯片、多接口、重插/重枚举都不能由该提示消除歧义 |
| 后端 `portId/displayName` | 在现有烧录设置中列出真实 OS 名称，用户明确选择 | 用这行直接调用 Web Serial open，或显示为已授权/已连接 |
| 用户先选 COM 后打开浏览器选择器 | 可展示此前选择供用户自行核对 | 承诺浏览器实际选择了同一个 COM，或把选择结果静默绑到此前的 COM |
| 缺少 USB 信息的端口 | 显示中性名称并保持可选 | 丢弃、猜型号、用列表索引与 OS 列表配对 |
| 浏览器弹窗显示的友好 COM 名 | 用户可据此辨识并授权 | 读取/抓取浏览器弹窗内容作为应用内稳定 API |

若产品未来要求“未授权全量 COM 列表内直接点击连接，且绝不出现浏览器提示”，这需要改变当前浏览器 Web Serial 产品边界，不能通过本轮扩展 `/ports` 实现。本轮保持已有边界，不引入后端串口终端或新的桌面授权层。

## 建议的内置列表数据来源

1. Modal 打开/刷新时使用 `HardwareSession.refresh()`，把已授权端口作为可连接设备行；列表可展示中性名称、USB 类型提示、选中态和本会话连接态。`browser-*` 是会话内对象 ID，不是 COM 名。
2. 点击已授权行的连接动作直接进入统一配置/连接入口，不再调用 `requestPort()`。点击“添加/授权新设备”才从当前点击处理器直接调用授权 helper，由它立即调用 `requestPort()`；不能先等待后端请求、关闭旧端口或跨窗口消息。已连接时也可授权新对象：授权期间保留旧会话，用户取消则旧连接/配置不变，授权成功后再进入换端口流程。需要调整现有 choose 守卫，不能为满足旧守卫而提前断开旧连接。
3. 首次未授权、权限撤销、新设备不在授权列表时，通过一条清晰入口进入浏览器选择器。用户取消后留在未连接列表，不能循环重弹；打开失败后也不能自动再弹授权。
4. 浏览器授权端口连接不等待 `/ports` 或 `/capabilities`。弹窗可另设“本机烧录端口”选择，读取现有 `/ports`，用用户明确选择调用 `HardwareController.configure(profileId,portId)`；保持与原设置面板同一 portId，缺少 profile 时提示先完成现有设置。其行不能伪装成可直接 Web Serial 连接的设备。浏览器授权端口与烧录 OS 端口各自标明用途，不能联动猜配。
5. 连接/断开事件及显式刷新可更新授权列表；关闭 Modal 不等于断开串口，切换编程/上传模式也不重新授权或重开连接。页面重载后重新 getPorts 建立当前页面映射，不恢复 `browser-*` 字符串到猜测端口。

这样可以复用 Mind+ 的内置列表与状态反馈，而把浏览器选择器压缩到确实需要授予新权限的动作。

## 波特率与状态同步契约建议（前端内部）

本段供主控合并前端提案；不新增后端 wire type。

- `HardwareSession.options` 是已应用配置的唯一来源；默认值沿用 115200/8N1/无流控。Modal、上传终端、原生状态均由同一 hardware/session 订阅读取，不各存一套已应用波特率。
- 输入中的未提交文本是各控件的草稿；“应用”或开始连接时先校验、再提交到统一配置入口。无效/未提交草稿不得污染其他入口。Web Serial baudRate 使用非零 unsigned long；建议前端接受 `1..4294967295` 的十进制整数并由系统报告不支持的实际速率，常用值可提供快捷选项。[Web Serial SerialOptions 规范](https://wicg.github.io/serial/#serialoptions-dictionary)
- 未连接且未指定待连接端口时，应用只更新下一次连接配置；已连接时按下文完成 close→open→必要时恢复。只有新 open 成功后，界面才显示“已连接”及已应用波特率。失败后的所有入口显示实际原连接已恢复、全部断开或仍待释放，不得继续显示目标设置已成功生效。
- `busy`、opening/requesting/closing、释放/上传/恢复阶段以及实际协议占用时禁止冲突编辑/连接；错误原因对用户可见。NativeSerialSocket 的原生 `updateBaudrate` 仍经过同一 session 和现有协议/模式守卫。
- 修改终端波特率不更改 Arduino 源码中的 `Serial.begin()`，也不改 CLI FQBN 的 `UploadSpeed`。设备固件通信速率、浏览器串口配置和烧录工具传输速率是三种不同配置；本轮只编辑浏览器配置。
- 不把连接、波特率、授权句柄、COM、日志或作业状态写入项目 `.ob`、项目 API 或匿名用户数据。Modal 与终端同步不使项目变脏，也不影响保存状态。

连接状态只能来自实际会话结果：选择端口/点击连接不是成功，`port.open()` 及 reader/writer 就绪后的 session open 才表示串口打开。对于 Uno 等需要协议握手的工作流，串口打开与协议准备好继续分开；ESP32/S3/FireBeetle 仍不能宣称实时协议可用。打开失败、拔出、读取结束、关闭失败、速率重开失败均走已有会话错误/关闭状态，不由后端 capabilities 推导成功。

建议用户状态归并如下，视觉样式由前端设计确定：

| 会话/动作结果 | Modal 状态 | HTTP 关系 |
| --- | --- | --- |
| disconnected、初次授权列表为空、用户取消授权 | 未连接；必要时说明没有授权设备/未选择设备 | 无需 HTTP |
| requesting/opening/closing | 授权中/连接中/断开中；防止重复动作 | 无需 HTTP |
| session open，流已就绪 | 已连接及实际已应用波特率 | 无需 HTTP；不宣称固件握手成功 |
| session error、打开/读取/关闭/重开失败 | 连接失败或断开失败及原因；重试/重选入口 | 无需 HTTP；保留现有端口占有保护 |
| 本机 3002 不可达，或 `/ports` 失败 | 烧录设置局部服务错误 | 不改变浏览器连接成功/失败状态 |
| 编译/上传作业运行中 | 显示现有作业阶段并禁用冲突连接/编辑 | 沿用 Hardware v0.2 |

### 单一 applySerialSettings 入口

建议在现有外部 hardware/controller 层提供一个内部命令，名称供主控与前端合并；不增加 HTTP 或已退休的跨父窗口消息：

```ts
applySerialSettings(input: {
  browserPortId?: string; // 指定已授权对象则连接/切换；省略时保持当前目标
  options: SerialOptions;
}): Promise<HardwareSnapshot>;
```

没有打开端口且未传 browserPortId 时，只保存本页下一次连接配置；有当前端口时，省略 browserPortId 表示修改当前端口配置。同一端口、相同配置重复应用为无操作，不反复断开重开。浏览器选择器只负责授权；取得对象 ID 后才调用本入口。显式断开也经过同一个占用协调器。

Modal 的连接/切换/应用、上传终端的“应用”、NativeSerialSocket 的 connect/updateBaudrate 都进入该入口。原生适配仍使用既有 VM 连接/通知接口，但不得从另一路再次 open、按默认值重设或先扫描把正在使用的 socket 关掉。无需修改 VM 函数体；原生握手流程的固定参数由外部适配处理。

普通文本连接使用用户已应用 options，原生设备默认 baud 只作首次初始化参考，不能覆盖后续用户配置。真正 Uno 协议占用时仍遵守固定配置/握手限制，Modal 显示其实际速率和不可编辑原因；需先结束该协议使用才可自由修改。ESP32 编程视图不能因此被误判为协议占用。

入口同步取得一次串口操作锁，再开始异步关闭/打开/恢复；新授权期间也占用选择操作，防止另一端同时上传或改配置。原有硬件 busy/cancelling、模式/项目/扩展过渡与该锁互相检查；拒绝冲突命令而不是把旧设置排队到稍后偷偷执行。串口操作状态与 CLI job state 分开，不能为切波特率伪造编译/上传 job。

建议 HardwareSnapshot 复用现有 connection/options/browserPortId/sessionId，加小型前端内部操作信息：当前操作阶段、待切换 browserPortId，以及本次失败/恢复结果。pending 输入不是已应用 options；恢复成功时仍保留“目标切换失败，已恢复原连接”的反馈。关闭失败保留端口占有信息与重试断开入口，不能仅凭 connection===error 放开新连接或上传。具体字段由主控统一，不改后端 wire type。

### 已连接换端口或波特率：提交与恢复

1. 验证完整 options、授权对象与操作守卫，捕获旧 browserPortId、options、是否打开及会话代次。未通过校验不改变旧会话；未实际使用端口时仅更新配置即可。
2. 已连接且目标变化时冻结新写入，等待已提交写入，取消读循环并等锁释放，释放 writer 后等待旧 port.close 成功。扫描/切换图表示正在切换，不宣称旧连接仍正常收发。
3. 旧 close 失败时停止操作，保留旧端口所有权和真实错误；不打开目标端口、不启动 CLI 上传，也不能声称已恢复正常连接。用户可重试释放；界面说明需要处理当前连接。
4. 关闭成功后尝试打开目标并建立唯一 reader/writer。成功后提交目标 ID、options、新 sessionId，再广播成功；未成功前不能发布目标“已连接”。
5. 目标 open 或流建立失败时先关闭该尝试实际取得的句柄。只有确认目标已释放、旧对象仍获授权且设备可用，才尝试用旧 options 恢复旧端口；同端口改速率也按此规则恢复旧速率。恢复不再次调用 requestPort，也不发送固件或旧 TX 文本。
6. 恢复成功：所有位置显示旧目标/旧速率已连接，并提示目标切换失败；本次 apply 返回失败结果或可辨识的错误，不冒充目标应用成功。恢复也失败：显示实际断开和两次错误；若目标清理失败则保持占有保护，禁止同时打开旧端口。初始未连接时失败不自动挑另一设备。

读循环、拔出、迟到 open/close 与恢复完成事件绑定会话代次；旧事件不得关闭新句柄、改写新 options 或给新目标显示成功。切换/恢复建立的新会话更新 sessionId，终端按其既有规则分隔 RX/TX，防止跨端口残留字节被拼成同一条消息。

### 提交后的全局同步与无循环规则

HardwareSession 发布已提交配置和真实连接/占有状态，HardwareController 统一生成 snapshot。Modal、上传终端和原生连接标题都订阅该 snapshot；底部图与文字也由它派生，不能各自启动一个“几秒后成功”的计时器。

外部 native-hardware 的唯一同步订阅在配置成功提交或恢复成功后，将 `options.baudRate` 镜像为 `scratch-gui/hardware-console/setBaudrate` 所需字符串；仅当值不同才 dispatch。原生 peripheralName 在 open 时使用当前授权对象标签；opening/closing/error 显示实际过渡/失败，不保留一个假装仍已连接的原生标记。原生协议 ready 继续使用真实握手结果。

该 Redux dispatch 是**显示同步**，不是再次调用 applySerialSettings 的命令。NativeSerialSocket.updateBaudrate 仅处理真正的配置请求；同值请求无操作，适配层保留必要的来源/同步中守卫，避免 session→Redux→原生回调→session 的重开循环。所有“已应用”显示读 snapshot；输入草稿在提交成功后收敛到同一值，恢复后收敛到旧值，失败目标可仅保留在明确标注的本次尝试信息中。

授权列表刷新独立维护 scanning/列表错误，不修改仍在工作的 session open。底部扫描图只表示真实枚举/连接/重开过渡，枚举结束即停止；空列表、用户取消、连接失败分别显示。若已有连接且刷新失败，保留实际“已连接”及“列表刷新失败”提示。选择器取消也不绘制为已打开旧串口的连接失败。

## 与编译/烧录的交接

保留用户明确选择 OS `portId` 的要求，`POST /uploads` 仍只接 `{buildId,portId}`；不增加 baudRate、browserPortId、授权信息或任意工具参数。新 Modal 不能把授权行的选择自动写成烧录 COM。

现有 controller 会在编译成功后刷新 OS 端口、检查原端口存在，再等待浏览器写入/读循环和 close 完成，之后提交上传。连接/波特率编辑需遵守同一 busy/use 状态，不能另建 reader/writer 或让新连接在上传终态前重占端口。关闭失败时继续保留会话对端口的占有保护，不得仍提交上传。上传终态后只恢复原先打开的浏览器句柄和配置；恢复失败单独显示，不能掩盖上传实际结果。

后端只检查提交端口仍在系统枚举中，并由实际上传工具报告占用等错误；不能因为 `/ports` 中有 COM 就保证可用。选择器授权成功、串口打开成功或编译成功均不能自动触发烧录。

## 验收建议与交付

本轮若按零后端变更冻结，不需要后端业务实现、依赖或 HTTP 回归扩展。独立测试由主控另派 `gpt-6.1-sol / low`，可用模拟 Web Serial 和明确 HTTP 测试替身，聚焦以下事项：

1. 已授权设备列表内连接不调用 requestPort；新授权只由显式按钮调用，取消/失败不循环弹窗。
2. Modal、上传终端与原生 hardware-console 的已应用波特率及连接态同步；无效草稿不串改，同值应用不重开，Redux 镜像不会产生二次配置循环。
3. 3002 不可达、capabilities 缺少工具链、ports 为空/失败均不阻止已授权浏览器串口连接。
4. 多个相同 VID/PID、缺失 USB 信息、列表重排和页面重建都不会自动绑定 OS 端口、自动选择上传 COM 或伪造板卡身份。
5. 编译/释放/上传/恢复中的新 Modal 不能改变串口配置、开第二会话或提前抢回端口；显式 OS 上传选择和既有 HTTP 输入保持原样。
6. 项目归档/保存、五按钮原生 MenuBar 和已退休抽屉保持当前契约；VM 代码无修改。
7. 已连接换已授权端口、同端口改速率均按 close→open 顺序，任意时刻最多一套 reader/writer。目标失败后恢复旧配置；恢复也失败或 close 失败时，各 UI 如实显示并保留占有保护，不能上传或并开另一端口。
8. 已连接时新增授权直接由手势 requestPort，取消保留原连接；授权后换端口复用同一事务。枚举失败不把正常连接改成失败；旧会话的迟到事件不污染新会话。
9. Modal 的“本机烧录端口”只复用明确选择的 hardware.portId，其他设置位置同步；切浏览器端口/波特率不自动改烧录 COM，不修改生成代码的 Serial.begin 或 UploadSpeed。

本阶段只更新本提案。未运行单测、浏览器测试或硬件测试；没有新增真实硬件证据。待主控冻结统一契约后再按其派工进入开发/测试。

## 参考资料

- 仓库权威契约：`docs/api-contract.md` 的 Hardware v0.2、Mode UI v0.3 与项目工具栏更新。
- 仓库执行器说明：`apps/api/HARDWARE.md`。
- [Chrome 官方 Web Serial 使用说明](https://developer.chrome.com/docs/capabilities/serial)。
- [Web Serial 规范](https://wicg.github.io/serial/)；本次同时核查可读的[上游规范源文件](https://raw.githubusercontent.com/WICG/serial/main/index.bs)中的 requestPort、getPorts、SerialPortInfo 和 SerialOptions 定义（2026-11-10 检索）。
