# 主板卡片编译环境下载展示发布记录

2026-11-26，Asia/Shanghai。已重新编译并发布到 https://ide.xiaodaiyang.top/。

## 交付行为

- 编译环境下载入口、灰色遮罩、实际阶段/下载进度、取消和失败重试均位于对应主控卡片；任务身份取实际 Profile/plan，不借用当前主控名称。
- 采用 Mind+ 首次下载的两阶段交互：下载成功只刷新卡片，保持当前主控与库不变，再次点击卡片才加载主控。下载不修改当前作品、有效 Profile 或端口，也不暗中断开串口。
- 删除编辑器顶部两处下载徽标及上传弹窗的大块安装过程、安装日志。保留正常编译/上传日志、错误、取消和按需准备后自动续接。
- 无总量使用不定进度；编程与上传模式均可准备。保留旧自动准备触发、共享计划去重、离线和不支持下载主控的原有编辑能力。

统一边界见 [api-contract.md](api-contract.md) 顶部本轮章节；设计见 [前端提案](design/board-toolchain-card-frontend.md)。原前端/后端设计、前端开发与独立测试会话完成各自工作，主控负责集成验证和部署。

## Mind+ 取证

重新获取现网引用 `main.d8c89955.chunk.js`，15,096,826 B，SHA-256 `cf38db76a2536009779256943bfd3c4c59c68256bc12a9b74dcf4926f0907f9d`。Craft 证据 `ev_2ced46f3435ea47a3e3a4e369c2d5105a660f2e88a40899c2ff8dd37d44a1606` 覆盖 Wa 卡片函数 UTF-16 `[14410518,14421021)`，确认独立下载成功只刷新目录，再次点击才加载。映射存于 `.runtime/mindplus-board-selection-20261126/mapping.md`。

REA 的 JavaScript 语义分析实际调用因 worker 缺少 `sha256Hex` 导出失败，未取得语义图，不能宣称该分析成功。采用 Craft 原脚本静态证据和本项目隔离行为测试实施；未运行 Mind+ Link 或真实下载其主控资源。

## 验收与边界

前端全量回归 190/190 通过；最终续接守卫调整后工具链定向 13/13、typecheck 和生产 build 通过。独立测试核对 178 个 VM / 15 个 Blockly 保护模块及 Logo 字节保持一致。

独立 IAB 实测完整 GUI：Uno 为当前板时下载 Aijite ESP32-S3，当前板不变，灰遮罩、25% 进度和取消按钮可见，下载按钮未被选择层截获；无总量时 progress 不带 value/max，不显示百分比；返回编辑器顶部无新增下载块。截图在 `tests/evidence/board-toolchain-card-20261126/`。

IAB 连接重置后，Chrome 新测试标签导航超时，认证生产包的补充视觉场景未完成，未计为通过。以实际 React 渲染/回调补验：下载成功后不自动选择或关闭库，再次点击才选择一次；主控另以真实导出上传视图的 React SSR 核验准备态不渲染安装块/安装日志，并保留 build/upload 的正常日志、错误、端口和取消，共三场景通过。这些不等于完整浏览器视觉或实体 SDK 验证。

独立测试结论为可部署、未发现产品阻断，详见 [验收报告](../tests/BOARD-TOOLCHAIN-CARD-20261126-REPORT.md)。本轮均为模拟 Link/下载任务，没有启动 Link、下载真实 SDK、打开串口或烧录。自建 mock 服务已停止；报告保留测试 Chrome 创建超时及未获得可关闭标签句柄的限制。

## 生产发布核对

- Release：`20261126T033018Z-48e345c3`，认证构建，API `127.0.0.1:9111`；服务器安装 exit 0，首页、编辑器、健康检查、模块、登录及 SSO 路径检查通过。
- 部署包 SHA-256：`d0e2e14422b121ec91474667d19c1fc19931c64f7a0d5403d86fc8129a3468eb`。
- 编辑器 JS：`editor-CJF09GpH.js`，224,843 B，SHA-256 `7b91690de240b7d639834778a009df4b35fbd72e3c805cf8dc3c8c7d2b94134a`。
- 编辑器 CSS：`editor-8taSoHxD.css`，40,014 B，SHA-256 `daf4e8b807ecf79d46a4308443231a3192de6cfd336e7acbafe49b3909abd70d`。
- 主控核对十个冻结源码/测试文件、archive 摘要、线上 HTML 引用及线上 JS/CSS 原字节一致；API 返回 `status=ok, auth=maker, storage=minio`。验证脚本 `.runtime/verify-board-card-deploy.mjs` 的 local 和 online 检查均 PASS。

服务器发布目录与回退备份按既有部署流程保留。本次无后端、Link HTTP、归档或跨 iframe 协议变化；正式 Link 下载仍为原 0.1.3，不把尚待用户实际唤起验证的 0.1.4 候选作为正式安装包发布。
