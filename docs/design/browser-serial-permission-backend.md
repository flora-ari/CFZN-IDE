# 浏览器串口默认入口的后端边界

2026-11-24（Asia/Shanghai）。按主控最新交互方案做只读核对。

**本轮无需修改后端 API。** 默认切到浏览器设备来源、自动调用 getPorts 列出已授权端口，以及“选择新设备后立即连接”的合并动作，均可由现有前端完成。当前 SerialSources.requestPort 已直接调用真实浏览器 API，HardwareSession.choose 返回选定对象的行 ID；面板目前的 authorize 只选择设备，前端可在选择成功后续接既有连接事务。[串口来源](../../apps/web/src/local-serial.ts)、[授权与连接](../../apps/web/src/hardware-session.ts)、[面板动作](../../apps/web/src/serial-device-panel.ts)

首次设备选择需要用户手势触发 navigator.serial.requestPort；getPorts 只返回当前网站已经获准访问的设备。可以把“选择新设备并连接”作为同一个页面动作，点击调用链先立即 requestPort，返回对象后再按该行配置连接，不能先等待本机检测等异步请求再发起选择。取消选择返回原状态，原连接及设置保留。已授权列表可在打开面板或刷新时自动取得，用户直接从设备行连接。[Chrome 官方 Web Serial 说明](https://developer.chrome.com/docs/capabilities/serial)

浏览器授权由浏览器针对网站管理，本机服务的 Origin 许可、串口会话令牌和 OS 枚举都不能替网页授予该权限。本机目录中的 COM3 也不能变成伪造的浏览器 SerialPort。默认浏览器来源应修改面板初始选择和对应文案，保留当前真实本机连接的状态；切换列表来源沿现有 setSource 行为处理。[当前列表来源与授权入口](../../apps/web/src/connection-modal.ts)、[面板来源状态](../../apps/web/src/serial-device-panel.ts)

浏览器返回的 USB VID/PID 用于展示设备信息，不能唯一确定 OS COM 端口。浏览器普通串口连接继续持有真实授权对象，CLI 烧录目标仍通过现有本机端口列表明确选择。本机直连成功返回的真实 portId/deviceRef 可按已有路径关联，其身份依据与浏览器授权对象分开处理。[端口对象映射](../../apps/web/src/hardware-session.ts)、[前端烧录校验](../../apps/web/src/hardware-controller.ts)、[本机目录](../../apps/api/src/hardware/serial-directory.ts)

新设备选择和连接合并后继续共用 hardware.assertIdle、串口操作状态及协议占用守卫，重复点击不能创建并行打开。先完成浏览器选择，之后才由 applySerialSettings 关闭旧连接、打开目标，目标失败沿原事务恢复。关闭失败仍保留持有状态，不能直接清成空闲。上传前继续等待当前读写释放和 close 确认，执行器维持作业与本机串口占用检查，取消等待工具实际退出，结果未知时维持既有 busy 处理。[前端连接事务](../../apps/web/src/hardware-session.ts)、[前端作业交接](../../apps/web/src/hardware-controller.ts)、[后端共享守卫](../../apps/api/src/hardware/ownership.ts)、[上传作业](../../apps/api/src/hardware/executor.ts)

交开发与测试聚焦验证默认浏览器列表、已授权行直接连接、新设备一次页面动作完成选择与连接、取消不丢原连接、重复点击及忙时拒绝、逐行波特率应用、选择失败与关闭失败恢复。网络断言确认纯浏览器授权不调用新的服务端“授予权限”接口，烧录仍走原构建和上传请求。

本轮仅新增此设计文档，未修改应用或运行服务、测试及实体串口。后端开发可按零实现改动交接，前端交互细节以主控冻结为准。
