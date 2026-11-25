# 本机设备面板与串口会话后端设计

2026-11-23（Asia/Shanghai）。按主控最新范围收敛的设计提案，公共契约待主控冻结。

在现有 127.0.0.1:3002 Nest 执行器内增加一个活动串口会话，使用官方 serialport 操作 OS 端口，通过有界 HTTP 长轮询传输原始字节。前端外部适配器实现现有 SerialLike / SerialPortLike，继续由 HardwareSession 管理唯一连接、读流和有序写流。弹窗固定列顺序为“设备名称｜端口｜波特率｜状态｜操作”，操作位于最右，每行保留自己的波特率草稿。

当前后端只枚举端口、执行编译和 CLI 上传，没有普通串口读写能力。新增功能属于本机执行器，不涉及项目 API 或云端存储。官方 serialport 主仓包声明为 13.0.0、Node >=20，适合本项目 Node/TypeScript 栈；公开 API 网站当前标记为 12.x，开发须以锁定包的类型和实现复核。原生依赖只加入 API 包，在 hardware 入口按需加载并捕获不可用原因。[当前路由](../../apps/api/src/hardware/app.ts)、[当前枚举](../../apps/api/src/hardware/ports.ts)、[前端会话](../../apps/web/src/hardware-session.ts)、[适配接口](../../apps/web/src/serial.ts)、[官方包声明](https://raw.githubusercontent.com/serialport/node-serialport/main/packages/serialport/package.json)、[官方 API](https://serialport.io/docs/api-serialport/)

## 目录、身份和能力

复用 GET /ports，保持 `{items}` 和已有 portId、displayName、usbVendorId、usbProductId。增加 deviceRef 和 state，state 为 idle、opening、open、closing、error、uploading。由同一可注入枚举 provider 为显示、打开和上传提供路径，建议采用 SerialPort.list() 的真实 path，名称优先使用系统 friendlyName，缺失时使用 manufacturer 与 path。idle 表示服务自身未占用，外部程序占用只能由实际打开结果确认，显示“未连接”即可。

主控先观察到空列表，随后确认 Win32_SerialPort 和 /ports 都正常返回 COM3，PnP 中 CP210x 状态正常。这不能证明 WMI 遗漏。此次改动是将面板的浏览器授权目录改为本机真实目录，目录 provider 的调整按该目标实施。

服务端为当前存在周期内的目录项签发随机 deviceRef，绑定执行器 instanceId、规范 OS path、可取得的 PnP/序列号/位置信息和存在代次。取得操作锁后重新枚举并校验引用，再打开服务端记录的路径。客户端不能传任意路径来指定设备，也不能通过 VID/PID 推算 COM。拔出、观测到身份变化或服务重启使旧引用失效。同 VID/PID 的两个端口仍是独立目录项。OS 元数据不足时以当前枚举、真实路径句柄和存在代次确定目标，不宣称完成板卡型号认证。

现有 capabilities 保留 protocolVersion:1、executionHost:'local'，新增可选字段如下。serial 不可用时保留独立的编译能力，前端可明确进入浏览器 Web Serial 后备模式。

```ts
serial?: {
  version: 1;
  available: boolean;
  reason?: string;
  transport: 'http-poll';
  instanceId: string;
  maxReadBytes: 65536;
  maxWriteBytes: 65536;
  rxBufferBytes: 1048576;
  maxPendingWriteBytes: 262144;
  readWaitMaxMs: 15000;
  firstReadTimeoutMs: 5000;
  readLeaseMs: 45000;
}
```

## 精确接口提案

所有路径位于 /api/v1/hardware 下，新增串口路由要求准确允许的 Origin。前端每个编辑器绑定使用 crypto.getRandomValues 生成一次 32 字节随机 ownerToken，以 64 位十六进制放在 X-CCraft-Serial-Owner 请求头。服务端在首次打开时将其与 Origin 绑定，仅在内存保存摘要。该令牌用于同源不同页面的会话隔离，无新增账户和登录流程。重启产生新 instanceId，旧会话全部失效。

```ts
interface SerialSessionView {
  id: string;
  instanceId: string;
  deviceRef: string;
  portId: string;
  state: 'opening' | 'open' | 'closing' | 'closed' | 'disconnected' | 'error';
  held: boolean;
  options: SerialOptions;
  nextWriteSequence: number;
  pendingWriteSequence?: number;
  error?: {code: string; message: string};
}
```

| 方法及路径 | 请求 | 成功响应与含义 |
| --- | --- | --- |
| POST /serial/sessions | `{requestId,deviceRef,options}` | 201 `{session:SerialSessionView}`，真实 open 成功后响应。requestId 为 UUID，相同 owner、requestId 和载荷只执行一次，重复请求复用结果。 |
| GET /serial/sessions/current?requestId=UUID | owner 头，requestId 可选 | 200 `{instanceId,session:SerialSessionView或null,request?:{requestId,state:'unknown'或'pending'或'succeeded'或'failed',error?}}`，只返回此 owner 的状态。用于打开响应丢失的核对。 |
| GET /serial/sessions/:id/read?after=N&waitMs=15000 | owner 头，字节游标从 0 开始，等待范围 0–15000 ms | 200 `{session,from,next,dataBase64}`，最多 64 KiB 解码后字节。无数据返回空 Base64 和原游标，终态立即唤醒。 |
| POST /serial/sessions/:id/write | `{sequence,dataBase64}` 和 owner 头 | 200 `{sequence,sizeBytes}`，有序写入和 drain 完成后确认。序号从 1 开始。 |
| POST /serial/sessions/:id/close | `{}` 和 owner 头 | 200 `{session}`，真实关闭后返回 closed、held:false。并发 close 合并，已关闭会话重复调用可成功。 |

同一时刻最多一个 opening、open、closing 或仍 held 的 error 会话。其它 owner 的打开返回占用错误，不能抢占。请求结果记录在终态后保留 120 秒，总计最多 64 个记录，回收只影响历史状态，不回收仍持有的句柄。

打开响应未知时先查 current；重复提交必须沿用原 requestId 和载荷，不能另建一个连接请求。服务端先记录 pending 并保留活动槽再调用驱动，所以竞争请求能看到真实 pending。历史成功请求的会话已关闭时，重试仍返回该终态；用户新的连接动作使用新 requestId。旧 sessionId 的读写不能落入后来打开的会话。

新路由采用独立 96 KiB JSON 上限、inflate:false，并在现有大请求解析之前处理。所有字段白名单校验。SerialOptions 沿用 baudRate 为 1–4294967295 整数、dataBits 为 7或8、stopBits 为1或2、parity 为 none/even/odd、flowControl 为 none/hardware。驱动不支持某个请求值时报告实际失败。[当前设置类型](../../apps/web/src/hardware-types.ts)、[请求中间件](../../apps/api/src/hardware/app.ts)

每行 options 草稿按 deviceRef 保存在前端。仅点击该行连接才提交该行配置，成功响应返回实际 options。改变已连接端口的设置继续沿 HardwareSession 关闭、重开、失败恢复原设置的事务，当前阶段不另加 update 路由。点击本机行连接成功后，响应中的真实 portId/deviceRef 可同步为明确的烧录目标，关联依据来自同一后端目录。[已有设置事务](../../apps/web/src/hardware-session.ts)

## 原始字节与回收

RX 使用 Buffer 和 Base64，服务端不做文本解码或添加换行。前端流式解码继续沿用 TerminalModel。每个会话只允许一个等待中的 read。after 确认此前连续交付的字节，服务端保留最多 1 MiB 未确认数据；失败重试同一游标可以取回未确认数据。请求已回收字节、跳过未交付字节或重复读消费者都明确报错。RX 溢出使读流失败并发起关闭，不能悄悄丢字节后继续报告完整通信。

TX 严格校验 Base64，单次解码最多 64 KiB，待写队列合计最多 256 KiB。每个 sequence 只执行一次，相同序号同载荷重试复用进行中或已完成结果，同序号不同载荷和跳号拒绝。保留最近 64 次的序号、载荷摘要和结果，不能重发已经从去重窗口回收的旧序号。WritableStream 只在真实写入和 drain 完成后 resolve，终端随后记 TX。写入结果未知时核对 nextWriteSequence/pendingWriteSequence，不能自动用新序号重发。

遵循 Node 背压并监听 write callback、error 和 close。建议单次写入/排空期限 30 秒，超时报告发送结果可能不完整，停止后续自动写入并关闭会话。低波特率的大量数据由客户端分片。成功 drain 表示 OS 传输完成，设备应用响应仍由 RX 确认。原生对象以 autoOpen:false 创建，打开前挂好所有错误和关闭监听。[官方流接口](https://serialport.io/docs/api-stream/)

open 成功后 5 秒内没有第一个 read 就关闭。之后以读消费者存活维持 45 秒租约，长轮询每次最多 15 秒，正常响应后前端立即续读。安静设备也持续空响应续读，回收不依赖 RX 字节时间。等待中的请求被客户端中断时发起关闭，正常空响应结束不视为中断；没有观察到 TCP 断开时仍由租约兜底回收。关闭弹窗继续由编辑器绑定读取，编辑器卸载才停止读泵并请求 close。

拔出通过原生 error/close 和重新枚举更新状态，终止读写并派发 disconnect。关闭失败保留 held:true、会话 ID 和占有权，允许原 owner 重试 close，不能让新连接或上传复用尚未确认释放的端口。终态返回期间只保留必要状态和去重摘要，字节缓冲释放。正常服务 shutdown 等待已拥有的句柄和 CLI 进程退出。

## 上传互斥与来源

原有一次一个 CLI 作业继续保留。会话管理器和执行器使用同一个操作锁，异步枚举前先保留操作状态，消除打开、关闭和上传之间的竞态。

- CLI 运行或结果未知时拒绝新的串口 open、切换和写入，close 仍允许。编译可保留已有会话的 RX，启动编译前先确认没有串口打开/关闭事务。
- 上传前由 HardwareSession.close() 等待服务端真实释放。POST /uploads 取得执行器保留后重查目标端口，活动或仍 held 的串口会话一律阻止上传，返回占用原因。无需替用户关闭别的 owner。
- 上传期间保留端口占有权直到 CLI 真正退出；取消仅进入 cancelling。作业终态后才可按原设置重新连接，恢复失败单独展示，设备引用失效时要求刷新重选。

建议新本机面板的 POST /uploads 在现有 `{buildId,portId}` 中增加 deviceRef，服务端核对二者来自同一当前目录项。旧 Web Serial 后备的请求兼容规则由主控冻结。现有构建、产物身份检查和 CLI 退出判断继续复用。[当前执行器](../../apps/api/src/hardware/executor.ts)、[上传交接](../../apps/web/src/hardware-controller.ts)、[进程退出](../../apps/api/src/hardware/process.ts)

新串口路由继续使用 loopback 监听和 Host 限定，要求准确 Origin 和 owner 头。CORS 允许头增加 X-CCraft-Serial-Owner，精确回写 Origin、Vary:Origin 和现有本机网络预检头，响应 no-store。缺少或格式错误的 owner 返回401，未允许或缺失 Origin 返回403，其它 owner 操作会话返回404。令牌不是用户身份，不能据 sessionId 越过 owner 范围操作。[现有来源中间件](../../apps/api/src/hardware/app.ts)

| HTTP | 建议错误码 |
| --- | --- |
| 400 | VALIDATION_ERROR，字段、options、Base64 或游标格式错误。 |
| 401 / 403 | SERIAL_OWNER_REQUIRED / SERIAL_ORIGIN_FORBIDDEN。 |
| 404 | PORT_NOT_FOUND / SERIAL_SESSION_NOT_FOUND。 |
| 409 | PORT_STALE、SERIAL_PORT_BUSY、SERIAL_SESSION_STATE、SERIAL_SEQUENCE_CONFLICT、SERIAL_CURSOR_INVALID，及现有 HARDWARE_BUSY。 |
| 413 / 429 | PAYLOAD_TOO_LARGE / SERIAL_CAPACITY_EXCEEDED，数据或有界队列超限。 |
| 503 / 504 | SERIAL_UNAVAILABLE、SERIAL_IO_ERROR / SERIAL_IO_TIMEOUT。 |

## 前端接入与验收

本机适配器的 getPorts() 返回 /ports 的稳定 PortLike 对象，open 创建会话，一个读泵喂给 ReadableStream，WritableStream 按序提交写入，close 确认释放才 resolve。元数据链补齐真实显示名、portId 和 deviceRef，调整当前 HardwareSession 的 browser-N 和已授权串口展示。单一 HardwareSession、NativeSerialSocket、TerminalModel 继续负责现有执行和终端行为。后备浏览器模式仍使用真实 navigator.serial 授权对象，切 transport 前确认释放旧 owner。[适配入口](../../apps/web/src/native-hardware.ts)、[对象映射](../../apps/web/src/hardware-session.ts)、[原生协议桥](../../apps/web/src/native-serial-socket.ts)

使用官方 MockBinding 和注入的目录/执行器验证同 VID/PID 两个端口、过期引用、逐行不同波特率、单活动会话、requestId 去重及未知响应、写入去重/超限、RX 游标/溢出、安静 RX 消费者断开、open 后没有 read、拔出及 close 失败仍 held。并发测试连接与上传、取消等待实际退出、原连接恢复和非法 Origin/owner。前端 dev/dist 验证固定五列、动作最右、完整视口布局及终端唯一读写所有权。实体检查由主控协调。[官方 MockBinding](https://serialport.io/docs/api-binding-mock/)

请主控冻结路径、字段、限额和上传 deviceRef 的兼容规则。本轮仅重写本设计文档，未修改应用、安装依赖或访问本机服务、浏览器、服务器及实体串口。原生绑定平台可用性和实际读写尚待实施验收。
