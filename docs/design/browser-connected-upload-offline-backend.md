# 浏览器已连接但本机上传离线的后端结论

2026-11-24（Asia/Shanghai）。本轮只读核对代码；主控负责恢复本机服务及验证实际工具链。

**本轮无需修改 API。** 浏览器串口连接成功，只说明网页持有浏览器授权的串口对象。本机编译、OS 端口枚举及 CLI 上传依赖独立的 `http://127.0.0.1:3002/api/v1/hardware` 执行器。主控已说明此前按用户要求关闭过本机服务，因此先恢复该服务，再重新检测。初次 `/capabilities`、`/ports` 均未取得响应时，Profile 与 OS 列表为空符合现有取数路径，不能据此判定工具链或 USB 驱动缺失。[前端服务地址](../../apps/web/src/native-hardware.ts)、[能力与端口检测](../../apps/web/src/hardware-controller.ts)

项目根 `npm run hardware` 会先编译 API，再运行硬件入口；入口读取配置、创建执行器，最后只监听 `127.0.0.1`。默认配置是项目根 `.runtime/hardware/hardware.local.json`，不随启动工作目录漂移；显式 `HARDWARE_CONFIG` 优先，显式文件缺失、配置损坏及默认文件的其他读取错误均明确失败。默认文件不存在才沿用空配置行为。主控恢复时应保留既有本机文件和精确板型绑定，检查启动错误与就绪输出，不能只看到进程就宣布服务或工具链可用。[启动入口](../../apps/api/src/hardware-main.ts)、[配置加载](../../apps/api/src/hardware/config.ts)

线上页面直接请求用户本机回环地址。当前执行器限制 loopback Host，且 `Origin` 必须精确匹配许可；本机配置应包含 `https://ide.xiaodaiyang.top`。`HARDWARE_ALLOWED_ORIGINS` 设置后会覆盖配置中的列表，需检查有效来源。已许可来源的 CORS 响应与 OPTIONS 已实现，不需新增代理或放开任意来源。[来源与预检](../../apps/api/src/hardware/app.ts)

`Failed to fetch` 没有可读 HTTP 错误体，单凭该文本无法区分服务未监听、地址错误、CORS 拒绝或浏览器网络权限阻止。HTTPS 页面访问本机还受浏览器的本地网络访问权限约束，已有 `Access-Control-Allow-Private-Network` 响应头不能代替用户授予权限。服务恢复后由主控在真实线上页面核对两个请求的网络结果与网站权限；不能直接将 HTTPS 到回环 HTTP 一概判为不可行，也不能通过关闭浏览器安全策略解决。[Chrome 官方本地网络访问说明](https://developer.chrome.com/blog/local-network-access)

恢复验收先核对 `/capabilities` 的 `protocolVersion: 1`、`executionHost: local` 和目标 profile 的 `compileAvailable`、`uploadAvailable`、`reason`。服务在线与工具链可用分别判断。现有发现流程校验 CLI、指定 core 的真实 `boards.txt`、精确 FQBN 及 `board details`；缺失绑定明确返回不可用。普通 ESP32 与 FireBeetle ESP32-E 继续使用各自已配置的真实工具链，不用旧 FireBeetle32 代替 E。能力校验通过仍不等于完成一次真实编译。[工具链验证](../../apps/api/src/hardware/toolchain.ts)

随后核对 `/ports` 返回的真实 `items[].portId`，由用户明确选择烧录目标。浏览器的 USB VID/PID 不能唯一确定 COM，禁止用它猜测 COM3，禁止把浏览器授权行 ID 传给 CLI。当前上传请求仍为 `POST /uploads {buildId, portId}`：要求保留的成功构建，重新枚举并精确匹配 OS 端口，检查工具链身份及产物未变。端口消失返回 `404 PORT_NOT_FOUND`；工具链不可用在构建入口返回 `503 TOOLCHAIN_UNAVAILABLE`。[端口与上传检查](../../apps/api/src/hardware/executor.ts)

上传前沿现有前端事务等待串口读写结束并确认关闭，失败继续保留持有状态。后端保留单作业、串口事务/写入和端口占用互斥；`HARDWARE_BUSY`、`SERIAL_PORT_BUSY` 等冲突继续拒绝操作，取消等待实际进程退出后才释放。浏览器连接不能让另一个进程越过 OS 独占。[前端作业交接](../../apps/web/src/hardware-controller.ts)、[本机共享守卫](../../apps/api/src/hardware/ownership.ts)

最小可恢复体验复用现有“重新检测”：服务恢复后重新请求能力和 OS 目录，清除对应成功请求的离线提示，保留浏览器连接和仍有效的显式选择；无效目标要求重新选择。检测不得顺带构建或上传。若需继续改进，只需前端将本机服务离线原因置于缺 Profile/端口提示之前，避免把连接故障显示成用户漏选；本轮不增加公共字段或新启动协议。

本轮仅新增本文档，未启动服务、访问物理串口或改动产品代码。实际服务恢复、当前工具链可用性及线上浏览器访问结果由主控验收；重新检测本身不构成烧录授权。
