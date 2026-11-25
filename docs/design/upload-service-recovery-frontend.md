# 编译上传：本机服务检查与恢复

2026-11-24。最小前端设计，待主控冻结后开发；本轮只读，不启动服务或操作串口。

## 原因

[HardwareController.validateStart](../../apps/web/src/hardware-controller.ts#L180) 仅优先检查 incompatible，offline/unknown/checking 仍继续检查空 Profile，最终误报“请先选择当前主控的 Profile”。浏览器串口连接与本机编译服务状态本来独立，因此左上显示已连接并不能证明编译或烧录可用。

重新检测已有 generation/AbortController 防旧响应覆盖，成功会替换 capabilities、清 portError，空 profileId 会按当前设备匹配默认项；但非空失效 profileId 不会修复。[UploadProgressModel](../../apps/web/src/upload-progress.ts#L20) 已按配置和当前阻塞原因失效启动前提示，真实 job/error/log/restoreError 独立保存，可继续复用。

## 最小冻结规则

**检查优先级。** 保留现有忙、端口待释放、模式/协议等操作守卫；进入编译准备检查后，先确认 localService 为 online，再校验主控/Profile、工具链、代码和上传 OS 端口。startDisabledReason 与真正 start 必须走同一规则，不能仅在按钮层禁用。服务不可用时不发 POST /builds 或 /uploads，也不先断开正常浏览器终端。

| 本机服务状态 | 当前阻塞原因与动作 |
| --- | --- |
| unknown | “尚未检测本机编译服务，请点击检测本机服务” |
| checking | “正在检测本机编译服务，请稍候”；禁用重复检测与编译/上传 |
| offline | “无法访问本机编译服务，请启动或恢复服务后重新检测”；保留原始诊断详情 |
| incompatible | “本机编译服务协议不兼容，请检查服务地址或更新服务后重新检测” |
| online | 继续原有当前设备/Profile、编译/上传能力和 OS 端口检查 |

`Failed to fetch` 本身不能证明服务未安装，也可能来自站点权限、CORS 或网络策略。使用“无法访问”，通过现有 [本机服务视图](../../apps/web/src/local-service-view.ts) 提供重新检测及简短恢复说明，不要求用户再次授权 Web Serial 来修复本机 HTTP。服务检测不影响独立浏览器终端收发。

**恢复与默认 Profile。** “重新检测”仍并行读取 capabilities 和 OS ports，不打开串口、不自动编译或上传。成功时更新当前服务消息和对应诊断；保留当前设备仍有效的显式 Profile（工具链不可用也要保留并显示实际 reason）。空、失效或不属于当前设备时，空闲状态下复用既有按设备匹配的默认逻辑：唯一匹配项直接补选，或使用既有默认规则（当前为服务返回顺序的首个匹配项）；不新增 HTTP default 字段、不按别的板型猜 FQBN。无匹配项明确显示“本机服务没有当前主控的 Profile”。作业进行中不改变已捕获配置。

**OS 端口仍由用户明确选择。** 刷新保留仍有效的显式选择，缺失或失效时要求重新选；即使列表只有 COM3，也不自动选。浏览器授权对象不冒充 COM，不用 VID/PID 推断对应关系。服务 online 但 `/ports` 失败时，上传优先展示现有 portError 与“刷新烧录端口”，不能被“请选择端口”覆盖；编译检查不因端口列表失败而禁用。

**只清已失效的启动提示。** 服务、Profile、端口变化后复用 UploadProgressModel.synchronize 的当前原因比较，清不再适用的“上次上传/编译未开始”。capabilities 成功只清服务检测失败，ports 成功只清端口检测失败；两路一成一败如实显示。不得因重新检测或补默认项清真实 job 错误、日志、提交结果未知或 restoreError。用户下一次显式点击才创建新作业。

**区分两项就绪状态。** 上传弹窗显示紧凑的“终端：已连接/未连接”与“编译上传：等待本机服务/待选 OS 端口/已就绪”。有浏览器活动连接时说明“终端连接用于收发；烧录需本机编译服务和明确的 OS 端口”。当前阻塞原因在固定操作栏可见，不只藏在 disabled 按钮 title 或历史错误里。只有全套检查通过才显示“当前配置已就绪，点击编译并上传”。浏览器连接面板继续按来源展示，不把本机服务故障重新放到浏览器来源顶部。

## 聚焦验证

1. 浏览器串口已连接、Profile/OS 为空时，unknown/checking/offline/incompatible 分别显示准确原因；两个按钮和 native upload 最终校验一致，无构建/上传 POST，无端口关闭。
2. offline → checking → online，当前设备默认 Profile 自动补选，旧启动前失败消失；OS 仍未选，不能上传。明确选择后用户显式重试才创建一次作业。有效显式 Profile、不同设备及失效 Profile 分别覆盖。
3. capabilities 成功但 ports 失败：可编译、上传提示枚举失败；恢复 ports 后该诊断消失。全部配置有效时显示就绪，不掩盖工具链不可用原因。
4. 保留真实失败 job/log/error/restoreError 和提交未知状态；旧异步检测不能回写新结果，刷新不改变运行中捕获配置。保持上传前释放、终态后恢复、单会话及其他现有守卫。

范围仅 apps/web 的检查、默认值恢复和提示；HTTP、后端、VM/Blockly、云端架构均沿用现有契约。主控负责恢复本机 3002 与实际运行验收。
