# 已连接串口时的编译服务恢复：独立验收

日期：2026-11-24（Asia/Shanghai）。结论：**独立验收通过，未发现产品阻塞项。**

依据主控冻结的 `docs/api-contract.md`《已连接串口时的编译服务恢复（2026-11-24）》及两侧设计。仅新增本轮 `tests/` 脚本、报告与独立证据，未改产品实现，未覆盖主控的 `local-compilation.json`、`browser-compilation.json` 或截图。

## 执行结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 新增实际前端对象跨层验证 | 7 / 7 通过 | [脚本](upload-service-recovery-20261124.mjs)、[输出](evidence/upload-service-recovery-20261124/independent-tests.txt)、[结构化结果](evidence/upload-service-recovery-20261124/independent-checks.json) |
| 服务恢复、上传进度、本机服务和浏览器默认入口定向回归 | 55 / 55 通过 | [回归输出](evidence/upload-service-recovery-20261124/frontend-regressions.txt) |

共 62 项通过。项目根目录执行：

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --test tests/upload-service-recovery-20261124.mjs
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/upload-service-recovery.test.ts apps/web/test/local-service.test.ts apps/web/test/upload-progress.test.ts apps/web/test/browser-serial-default.test.ts
```

未重复后端 52 项、前端全部 154 项、生产构建或旧工厂矩阵。开发方全量通过结果不计入本报告独立执行数。

## 独立跨层结果

直接导入实际 `HardwareSession`、`HardwareController`、`UploadProgressModel`、上传渲染函数及 `NativeSerialSocket`，使用模拟 HTTP Response 和假 SerialLike/Streams。每个业务场景先打开一个 9600 浏览器许可端口，独立核对终端连接和本机服务两种状态。所有请求均由函数替身处理，没有真实 fetch 或监听端口。

- **服务错误优先。** unknown、checking、offline、incompatible 四状态下，空 Profile 不覆盖具体服务原因。`startDisabledReason`、实际 model.start、原生 socket upload RPC 错误、两按钮 disabled/title、正文和固定操作区提示一致；终端保持 open，作业 POST、端口 close、停止硬件与 requestPort 均为 0。忙和模式守卫仍优先于服务检查。离线说明包含 `npm run hardware` 与站点本地网络访问检查。
- **检测与恢复。** capabilities / ports 同时发出 GET；offline → checking 时旧启动前提示失效，online 后将失效 Profile 修复为当前 ESP32 的首个匹配项。单个模拟 OS 端口不会自动选中，也不会触发作业。显式点击编译检查只创建 1 次 build，终端不关闭；之后显式选择 OS 端口仅更新配置，不自动上传。
- **Profile 保留与捕获。** 有效显式 Profile 即使 core 不可用也保持选中，提示实际缺失原因；空、失效和跨设备选择修复为当前设备默认项，无匹配时给出明确诊断。用实际运行中的模拟编译作业挂起轮询，再修改当前设备并返回延迟检测结果：忙时 profileId / portId 不被补选覆盖，已提交 deviceId / profileId / code 仍为启动时值；空闲后下一次检测才按新设备补选。
- **端口失败与编译分离。** `/ports` 返回真实形状的 503 错误体时，上传优先显示 `SERIAL_IO_ERROR` 与枚举诊断，而非空选择；编译按钮仍启用。上传被拦截时没有 POST。显式编译可以完成至 failed 作业，且不关闭终端；端口恢复检测不清除这个实际作业对象、工具错误、日志或已有 restoreError，OS 选择仍为空。
- **恢复失败保留。** 通过实际前端流程运行模拟 build → upload，上传返回 failed，再让原终端重新打开失败，产生实际 restoreError。服务重新检测后 failed upload、日志和恢复错误均保留。上传请求仍严格为 `{buildId, portId}`，未添加波特率或来源字段。
- **提交结果未知保留。** 在 build 成功、终端已释放之后丢失 upload 响应，前端保留“提交结果未知”、busy、原作业与日志。成功检测不会自动重试 POST、清除 busy 或重新打开终端；再次 start 被忙守卫阻止。

55 项定向回归另覆盖服务及端口请求的 generation 防旧响应、8 秒超时和慢 body、非兼容字段/重复 ID、轮询及取消中断不释放占用、启动前提示随配置变化失效、真实 job 日志与未知提交保全。浏览器默认入口的 13 项回归包含默认 browser、无本机依赖枚举/discover、原点击栈 requestPort、仅一次连接、取消/拒绝/重复点击和后续守卫、另一来源缓存及活动对象、旧枚举返回、unsupported fallback，全部通过。

## 最终产物与受保护字节

`openblock.html` 确认引用 `editor-DUATB_QJ.js` / `editor-CwQOS_yH.css`；编辑器产物包含终端状态文案与“连接新设备”。编辑器 SHA-256：`26973ecaa997ed2ae360bceb8d0b0fb23f08cb65081b7089fa67166a2fc73b31`。

GUI SHA-256：`78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5`。从固定上游归档只读提取原 GUI，逐个核对 178 个 VM / 15 个 Blockly 模块完整内容及清单哈希，全部一致；`LICENSE`、`LICENSE.MIT`、`TRADEMARK` 原字节一致。

public / dist 用户 PNG 均为原图 SHA-256：`c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2`。

## 主控实测与证据边界

独立执行只验证模拟 HTTP、串口对象和元素树，不等同实体驱动、真实浏览器几何、工具链或部署验收。本轮没有访问正在运行的 3002，没有操作 PID 72632、物理 COM3、浏览器、真实 API / 编译器或公网，也没有启动或清理服务。

主控另行提供以下实测，独立测试方仅只读核对文件，**不计入上述 62 项**：

- [local-compilation.json](evidence/upload-service-recovery-20261124/local-compilation.json)：HTTPS 产品 Origin 许可、OPTIONS 204、Private Network 请求头、ESP32 工具链与 COM3 可用。截图同类 `Serial.begin(9600)` / Hello 循环代表程序的真实 build `1d4b9ae7-5a92-457e-a5e4-39317d8c8a63` 成功，非固件上传。
- [browser-compilation.json](evidence/upload-service-recovery-20261124/browser-compilation.json)、[compile-ready.jpg](evidence/upload-service-recovery-20261124/compile-ready.jpg)：主控报告新生产页恢复在线后默认 ESP32、最初 OS 未选；显式 COM3 后上传按钮可用，点击“编译检查”的真实 build `22209a49-a51f-4afe-9257-0b3056ea0702` 成功。该记录当前终端为未连接，不能替代本报告“终端已连接时服务不可用”场景的实体证据。1280×720 弹窗 bottom=704、操作按钮 bottom≈688，位于视口内。主控说明本轮未调用 uploads、未刷写固件。

新增脚本首次运行曾因夹具恢复 capabilities 后未重新检测、仍使用已缓存的不可用 Profile 而失败；补齐模拟恢复的检测步骤后，7 组全部通过。该失败属于测试夹具时序，不是产品缺陷，未修改产品实现。独立测试交付冻结。
