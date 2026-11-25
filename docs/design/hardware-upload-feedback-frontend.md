# 上传失败反馈的前端最小修复

2026-11-23。根据当前源码与主控提供的截图状态核对。FireBeetle ESP32-E、Profile 和 COM3 已选中，本机服务在线，Profile 返回 `No toolchain configured for this profile.`。本轮证据为只读源码走查，浏览器与实体设备结果由后续验收提供。

## 根因

`nativeUpload` 在 Profile 与 OS 端口均非空时尝试 `start(true)`。工具链不可用会由 `HardwareController.start` 同步抛出 Profile 的实际 reason。catch 先将该原因赋给 `hardware.error`，随后函数落入通用分支，又把它覆盖成“请在设置中选择主控 Profile 和本机烧录端口”。这条错误路径也会覆盖代码生成、协议不兼容、端口残留占有及忙守卫等真实同步错误。 [上传入口](../../apps/web/src/native-hardware.ts#L70) · [启动检查](../../apps/web/src/hardware-controller.ts#L164)

配置弹窗已经读取当前设备对应 Profile，并在 FQBN 后拼接 `profile.reason`，但它只是普通段落。底部独立错误区优先显示视图局部 error，其次 `state.error`，最后作业错误。因此当前画面会同时出现正确的工具链原因和错误的重新选板提示。 [配置弹窗](../../apps/web/src/native-hardware.ts#L94)

## 建议修复

1. 把 `nativeUpload` 的“已有 Profile 与端口”路径做成封闭分支。启动成功直接返回，启动同步失败保留 `describeError(e)`，打开进度/设置弹窗后立即返回。仅在确实缺少必要选择时给出对应提示，分别定位未选主控、未选当前主控 Profile、未选本机烧录端口。实际选择及其归属仍由既有 `start/configure` 校验。
2. FQBN 保留为目标信息，Profile 的不可用原因单独作为可读错误段落展示。建议文案为“当前主控的本机工具链不可用”，下一行保留服务 reason。对这一条精确的已知原因可补“此 Profile 尚未配置本机工具链，配置生效后重新检测”，原始原因继续可见。服务在线状态取 `localService`，Profile 可编译/可上传状态取实际 flags。编译与上传按钮按现有能力、端口与 busy 状态启用，其中上传依赖 compileAvailable 和 uploadAvailable。
3. 校验失败和真实作业错误继续呈现实际原因。重新检测时保持作业、日志与串口诊断的现有保存语义。用户开始下一次有效作业时，`HardwareController.start` 已清理上次启动错误。若保留上次失败到重试前，应让文字表达上次操作的结果，避免显示成当前缺少选择。视图局部 error 优先级应保证重新选择并重试后可以显示新结果。

## 重新检测的范围

- 共用 `renderLocalService` 的“重新检测”调用 `checkLocalService()`，请求 `GET /capabilities`，同时更新全部 Profile、compileAvailable/uploadAvailable 和 reason。它已经覆盖本轮工具链配置后的页面刷新需求，成功后保留用户显式选择的 Profile 与 COM3。 [重新检测按钮](../../apps/web/src/local-service-view.ts#L8) · [能力更新](../../apps/web/src/hardware-controller.ts#L120)
- 打开上传设置调用 `refresh()`，并行刷新 `/capabilities` 与 `/ports`。单独的“刷新烧录端口”只更新 OS 端口列表。已有代次、取消与超时保护继续用于这些 GET 请求。浏览器授权串口列表通过连接弹窗“刷新设备”取得，仍由其现有入口处理。 [打开设置](../../apps/web/src/native-hardware.ts#L68) · [刷新方法](../../apps/web/src/hardware-controller.ts#L143)
- 执行器在创建时运行 `discoverProfiles`，`capabilities()` 返回这次发现结果。主控配置文件后需使本机执行器重新加载配置并完成工具检查，页面再点“重新检测”读取新结果。只点网页检测仍只能看到当前进程的能力快照。 [执行器生命周期](../../apps/api/src/hardware/executor.ts#L53)

## 聚焦验收

用隔离浏览器模拟五板能力响应和明确 OS 端口，分别验证以下场景。无需物理串口操作。

- FireBeetle、Profile 和 COM3 已选，服务在线而 Profile flags 为 false，点击上传只展示实际工具链原因，保持三项选择，创建硬件作业为零。
- 将响应改为同一 Profile 可用，点“重新检测”后原因区和按钮随最新能力更新，Profile/COM3 保留。用模拟作业验证用户再次点击才发起编译，既有错误随本次成功启动清除。
- 分别缺少 Profile、端口和主控，提示准确定位缺项。再以生成失败、协议不兼容或忙状态验证异常保留，防止通用文案再次覆盖。
- OS 端口刷新失败时服务在线信息和工具链原因各按自身状态显示，既有作业错误与串口诊断继续可读。沿用现有健康检查竞态测试，只补本次上传入口覆盖和真实 DOM 文案检查。 [已有检测测试](../../apps/web/test/local-service.test.ts#L56)

建议改动集中在 `apps/web/src/native-hardware.ts` 的上传分支和配置弹窗展示。共用重新检测方法已满足能力更新需求。本提案供主控定修复范围。
