# 上传端口恢复的后端影响核对

2026-11-23（Asia/Shanghai）。本轮只读核对源码，供主控冻结界面修复范围。

**结论为后端业务零改动，可复用现有 Hardware v0.2。** 截图红字“上次上传未开始：请先明确选择本机烧录端口”由前端记录的一次启动前检查失败组成。当前已选择 COM3、编译与上传均显示可用时，这条历史消息仍可能保留。前端需处理提示恢复和操作按钮可达性，端口校验、作业创建及来源规则继续沿用已有实现。[前端上传入口](../../apps/web/src/native-hardware.ts)、[前端控制器](../../apps/web/src/hardware-controller.ts)、[Hardware 契约](../api-contract.md)

主控补充的独立核对记录表明，近期 ESP32 构建 `8d82c7ee-c168-46e7-8b92-8c040921d32c` 已成功，其后没有对应上传；当日 15:08 的 FireBeetle 上传 `21df9ba0-0a76-42e7-92ca-9b59420cab3b` 已在 COM3 验证成功。本会话据主控交接收敛到前端提示与布局修复，未访问这些作业或用户服务。

`nativeUpload()` 捕获 `hardware.start(true)` 的异常后，将原因存入闭包中的 `uploadError`。进度弹窗给它添加“上次上传未开始”前缀。`uploadError` 仅在下一次 `start()` 成功返回后清空。进度弹窗选择 profile 或 OS 端口时，`hardware.configure()` 提交新的 `profileId` / `portId`，其后的 `setError('')` 只清组件内另一份错误。因此端口已正确提交后，历史上传提示仍会出现。`hardware.start(true)` 中的精确文本“请先明确选择本机烧录端口”在 `portId` 为空时抛出，发生在设置 busy、清理作业和提交 `/builds` 之前。[错误记录与渲染](../../apps/web/src/native-hardware.ts)、[configure 与 start](../../apps/web/src/hardware-controller.ts)

前端恢复建议是将这次预检查提示关联到当时的选择状态，在用户修正对应配置后清除或失效，并根据当前状态展示剩余条件。设置更新只提交选择，实际点击“编译并上传”才发起作业。真实编译、上传失败及取消结果仍从 `job` 和 `state.error` 展示，配置更改不能覆盖其结果。OS 端口须保留明确选择，沿用 controller 中已有校验。[前端状态与作业](../../apps/web/src/hardware-controller.ts)

按钮在视口外的判断尚待前端实测。源码中，进度弹窗依次渲染服务状态、profile、能力及原因、端口、若干错误消息、固定 230px 高的日志，最后才是“编译检查”“编译并上传”“取消作业”“关闭”。通用 `.cfzn-hardware-modal` 使用 `margin:9vh auto`，自身未声明可视高度上限和滚动。低高度视口中存在底部动作超出可见区域的可能，前端应验证并修正弹窗布局与滚动，保证鼠标和键盘可达。[弹窗布局](../../apps/web/src/native-hardware.ts)、[对应样式](../../apps/web/src/native-hardware.css)

服务端请求链路如下。

| 阶段 | 当前行为 | 本轮交接要求 |
| --- | --- | --- |
| `GET /capabilities` | 返回本机执行器的 profile、编译/上传可用标志及不可用原因。能力检查不创建作业。 | 当前能力与历史启动提示分别更新，保留真实 unavailable 原因。 |
| `GET /ports` | 返回 `{items:[{portId,displayName,...}]}`。Windows 实现查询 OS 串口清单，仅枚举。 | 使用响应中的精确 `portId`，显示名称与请求值保持关联。 |
| 前端明确选择 | `configure()` 验证 profile 属于当前主控，并确认非空端口仍存在于已有清单。 | 有效选择后修正相应预检查提示，避免自动提交。 |
| `POST /builds` | 校验主控/profile、代码、模块及依赖，检查执行器空闲和工具链后创建编译 job，返回 202。该请求不含 OS 端口。 | 用户修正端口后显式重试，可重新进入既有构建链路。 |
| 编译完成后的前端准备 | 构建成功后重新 GET 端口清单，核对捕获的 OS 端口，释放浏览器串口，再提交上传。 | 保留现有来源快照、单串口 owner、取消及未知提交状态处理。 |
| `POST /uploads` | 接收 `{buildId,portId}`。检查构建成功、端口实时存在、工具身份及产物一致性，之后才创建上传 job。 | 实时端口消失时给出准确原因，交由用户重新选择。 |
| 作业跟踪 | 通过 `GET /jobs/:id?afterLog=...` 读取真实状态及日志，取消等待拥有的工具进程退出。上传成功需工具完成及验证日志。 | 提示修复和重新选择均不能直接显示上传成功。 |

以上实现集中在现有控制器、端口枚举和执行器中。[HTTP 路由](../../apps/api/src/hardware/app.ts)、[端口枚举](../../apps/api/src/hardware/ports.ts)、[服务端构建与上传](../../apps/api/src/hardware/executor.ts)、[前端编译后端口重检](../../apps/web/src/hardware-controller.ts)

错误仍按现有语义处理。缺少或空的 `portId` 返回 400 `VALIDATION_ERROR`，实时端口不存在返回 404 `PORT_NOT_FOUND`，未知构建返回 404 `JOB_NOT_FOUND`，构建未成功或产物/工具发生变化返回 409 `BUILD_NOT_READY`，另有活动作业返回 409 `HARDWARE_BUSY`。这些拒绝发生在上传 job 创建前。CLI 执行中的错误由已创建 job 的 `UPLOAD_FAILED` / `TOOL_TIMEOUT` 等返回。截图中的中文预检查消息与这些服务端错误可通过网络是否提交、是否获得 job ID 交叉核对。[输入校验与作业守卫](../../apps/api/src/hardware/executor.ts)、[现有类型](../../apps/api/src/hardware/types.ts)

来源链路继续按本机执行器处理。前端使用 `VITE_HARDWARE_BASE_URL` 或默认 `http://127.0.0.1:3002/api/v1/hardware`。服务端要求 loopback Host，并针对每次请求的准确 Origin 校验开发来源和配置来源；通过时返回该 Origin 的 CORS 响应及现有预检头，OPTIONS 返回 204，POST 要求 JSON。`capabilities`、`ports`、`builds`、`uploads` 经过同一中间件。`config.allowedOrigins` 可由 `HARDWARE_ALLOWED_ORIGINS` 覆盖。主控后续验收应以部署页当前成功的能力、端口响应和实际按钮请求核对来源，截图中的显示值可能来自已取得的状态，本会话未据此推定服务实时可达。[本机地址接入](../../apps/web/src/native-hardware.ts)、[来源与 CORS](../../apps/api/src/hardware/app.ts)、[配置读取](../../apps/api/src/hardware/config.ts)

建议本轮仅安排以下聚焦验收。

| 场景 | 验收条件 |
| --- | --- |
| 历史提示恢复 | 先在无 OS 端口时点击上传，产生与用户相同的提示且没有构建请求；明确选择模拟端口后，相关历史提示恢复。用户再次点击才创建构建和上传作业。 |
| 状态与可达性 | 当前主控、profile、端口都有效时，鼠标和键盘均能到达“编译并上传”。覆盖低高度、浏览器缩放及错误文本换行，底部按钮可操作。 |
| 端口消失 | 使用隔离 `portsProvider` 模拟构建前后端口变化，以及上传 POST 时端口已消失，维持既有拒绝原因和无新增上传 job 的行为。 |
| 作业结果保留 | 模拟真实接口的编译/上传成功、失败、取消和提交结果未知。修改选择只清关联预检查反馈，已有结果、日志、busy 和串口恢复规则正确。 |
| 来源 | 隔离服务按允许 Origin 验证能力、端口、OPTIONS 和作业请求，未配置 Origin 按现有规则拒绝。所有 OS 枚举和 CLI 使用注入实现。 |

现有 `apps/api/test/hardware.test.cjs` 已包含模拟端口、指定端口传入上传器、端口不存在、产物改动、并发作业、Origin 拒绝及 CORS 检查，可作为此次交接基线。本轮后端只需确认这些行为可复用，实际浏览器提示和几何恢复由前端与独立测试聚焦验收。[已有隔离测试](../../apps/api/test/hardware.test.cjs)

本轮新增本设计文档，未执行测试或访问用户服务、OS 串口清单及实体端口。历史提示残留已由当前源码核对，截图对应页面的实时状态和按钮几何仍待主控安排浏览器复现。
