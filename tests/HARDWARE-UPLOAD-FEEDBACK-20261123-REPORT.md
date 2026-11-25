# 上传前配置与错误反馈独立验收

2026-11-23（Asia/Shanghai）。按冻结契约“上传前配置与错误反馈”执行。独立自动验证通过，相关前端 Node 测试 39 项、后端配置与硬件 HTTP 测试 15 项、补充原生入口模拟 3 组均通过。固定上游字节核对通过，178 个 VM 模块和 15 个 Blockly 模块一致。

| 范围 | 独立验证结果 |
| --- | --- |
| 原生上传错误覆盖 | 实际 `nativeHardware.nativeUpload()` 在缺主控、缺 Profile、Profile 已失效、Profile 不属于当前板、缺端口、端口已失效、工具链未配置、上传工具不可用、生成失败、模式守卫、作品变更守卫、忙状态、串口残留占有、协议不兼容共 14 类场景中保留具体原因。弹窗打开，未创建作业，原有作业错误字段保留。 |
| 准备状态和按钮 | 设置视图按实际 compileAvailable 和 uploadAvailable 分别显示状态。覆盖 false/false、false/true、true/false、true/true 及无端口组合。编译按钮仅依赖编译能力，上传按钮同时依赖编译、上传、明确端口及空闲状态。精确的工具链未配置原因显示中文处理提示并保留原始诊断。 |
| 历史错误与当前结果 | 原生入口失败以“上次上传未开始”显示，视图局部错误以“上次设置或启动操作未完成”显示。重新检测后当前能力变为可用，历史失败仍标明其历史身份。已有真实作业错误、日志、串口诊断均保留。补充模拟通过实际渲染函数生成元素树并核对文本和按钮属性。 |
| 重新检测 | 实际“重新检测”回调并行读取 capabilities 和 ports，保持显式 Profile 与端口。只有两个 GET，不创建作业，也未取得浏览器串口所有权。既有测试同时覆盖检查竞态、迟到响应、8 秒超时、端口响应体超时、错误或畸形响应、失效端口与上传前二次校验。 |
| 默认配置与优先级 | 使用临时目录验证默认文件读取、显式相对路径优先、运行目录与来源环境覆盖、默认 ENOENT 空配置回退。显式 ENOENT、损坏 JSON、非对象、非法字段、权限模拟错误及真实目录读取错误均失败并指出所选路径。 |
| 配置定位 | 将已构建的配置模块复制到临时模拟项目的 src/hardware 和 dist/hardware 布局，从临时项目根与 apps/api 两种 cwd 执行，均读取同一项目默认文件。HARDWARE_RUNTIME_DIR 覆盖生成物位置，不改变默认配置查找。 |
| 既有 HTTP 边界 | 临时真实 Nest 服务验证 build/upload/cancel/read 路由、202/200 成功响应、输入字段白名单、源码大小、Profile 与设备匹配、不可用工具链 503 TOOLCHAIN_UNAVAILABLE、未知作业和端口 404、产物绑定、并发忙锁 409、来源及 CORS 预检。执行器 runner 和端口枚举使用测试替身。配置路径没有新增 HTTP 入口。 |

新增的 [原生入口模拟脚本](hardware-upload-feedback-20261123.mjs) 使用当前源码的真实 HardwareController、HardwareSession、nativeHardware 和 renderLocalService。脚本将原生入口临时转译到内存，使用假的 React hook/元素树及不相关集成占位对象，执行模拟 GET 响应。该证据覆盖入口分支与渲染结果，浏览器像素、焦点和实际设备状态由主控浏览器验收提供。

生产入口 `editor-ByCJsQIT.js` 包含历史错误标注、中文工具链提示及失效选择提示，旧通用覆盖文案已移除。已构建的后端配置模块包含默认 hardware.local.json 路径、ENOENT 分支及所选路径错误信息。此处为产物静态检查，详细哈希和命中位置见 [产物记录](evidence/hardware-upload-feedback-20261123/dist-checks.json)。

主控提供的运行证据如下。本独立会话核对了主控保存的验证清单与截图，以下作为主控报告的证据登记。清单包含默认配置启动方式、两板能力、COM3、两个成功编译作业、core/FQBN 与产物哈希。 [主控真实验证清单](evidence/hardware-upload-20261123/local-verification.json)

- 主控报告官方 ESP32-E 2.0.17 的真实构建 `ccb0d303-d0a4-43e1-b927-a4edacdedd69` 成功，并含 D2→GPIO25、D9→GPIO2、A0→GPIO36 的映射断言。
- 主控报告在 localhost:5173 的独立 IAB 草稿中，FireBeetle 专用 FQBN 显示编译及上传可用。显式选择 COM3 后，重新检测保留该选择，两个按钮启用。只点击“编译检查”，真实作业 `e5159dea-71e3-4bc1-99f5-59673c5ba31d` 进入 succeeded，页面终态为“编译 succeeded”。
- 主控已确认未设置 HARDWARE_CONFIG 或 HARDWARE_RUNTIME_DIR，从 apps/api 运行 node dist/hardware-main.js 后自动读取项目默认配置。主控报告进程 67152 的两板能力可用，编译完成后重新检测仍保留 FireBeetle 和 COM3，并显示成功及可用按钮。主控截图已保存并可读取。 [主控实际编译成功截图](evidence/hardware-upload-20261123/firebeetle-compile-success.jpg)

本会话执行了 Node 自动测试和元素树模拟，浏览器测试次数为 0，实体串口和实体固件写入次数为 0。测试 Nest 服务仅监听随机回环端口，端口名使用 COM_TEST 等夹具值，模拟 runner 不执行硬件命令。临时测试资源随测试结束清理。

复验命令如下。

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/hardware.test.ts apps/web/test/local-service.test.ts
node --test apps/api/test/hardware-config.test.cjs apps/api/test/hardware.test.cjs
node --experimental-strip-types --disable-warning=ExperimentalWarning tests/hardware-upload-feedback-20261123.mjs
node apps/web/scripts/verify-upstream-bytes.mjs
```

- [前端 39 项输出](evidence/hardware-upload-feedback-20261123/frontend-node-tests.txt)
- [配置与硬件 HTTP 15 项输出](evidence/hardware-upload-feedback-20261123/backend-node-tests.txt)
- [原生入口模拟记录](evidence/hardware-upload-feedback-20261123/native-entry-simulation.json)
- [VM/Blockly 核对输出](evidence/hardware-upload-feedback-20261123/upstream-bytes.txt)
