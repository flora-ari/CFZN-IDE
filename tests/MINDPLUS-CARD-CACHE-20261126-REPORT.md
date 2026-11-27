# Mind+ 主控状态与缓存独立验收（2026-11-26）

结论：冻结源码及最终认证生产构建通过，未发现前端发布阻断，可发布。真实浏览器几何未验证。

## 本分支独立执行

`node tests/mindplus-card-cache-20261126.mjs` 通过。直接实例化实际 HardwareController / HardwareSession / ToolchainPreparation，以注入 fake HTTP 与 Link 身份、实际 React SSR 验证：两个全新 controller/observer 依次从同一 ready 目录读取，均无任何下载 decoration/control/check/占位，刷新重进仍为空，零 prepare/其他 POST。offline 缓存能力保持中性；切 B 实例尚未读取时中性，成功读取 missing 后才出现浅灰下载入口；noProfile 中性；B 确认 ready 后移除全部 decoration。没有真实网络、服务或串口。

`node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/toolchain-preparation.test.ts`：20/20 通过（实际运行数量以此为准）。覆盖新鲜 missing/unknown/legacy/ready、目录失败及矛盾 capabilities 不误报 missing、同实例迟到目录、新实例旧 capabilities、plan 变化重验；保留共享计划、目标隔离、字节进度、取消/失败/未知提交、串口守卫和一键编译续接/取消回归。不重跑 199 全量。

五项源码/测试文件 SHA 均与 `.runtime/mindplus-resource-cache-20261126/candidate.json` 匹配。library.ts 摘要仍为 `89a9ac35839e979d4b9a15016f95256db36ab6e9d94611884634d20fc768e77c`，未变更目录过滤或模块路径。模块仍只接自身 compatibility badge，不调用主板 toolchain renderer；20 板目录来源、controller footer=null、统一 grid-auto-rows:1fr 及绝对覆层规则保持。CSS 改为约定浅灰且删除旧 ready 图标规则，没有新增流内占位或裁切说明。这些属于结构/规则检查，不声称实际测量了 20 卡的像素几何。

源码区分当前选中板、预置 GUI/公开资源和 Link 编译环境；没有新增浏览器 ready 持久标记、Service Worker 或公开/私有混合缓存。SDK 就绪需要当前实例/epoch/plan 目录及 capabilities 一致，未把 ZIP/100% 字节或选中态当作安装成功。

证据：`tests/evidence/mindplus-card-cache-20261126/independent.json`，含实际请求清单、五文件摘要及 mock/SSR 边界。遵循既有 CUA 拒绝，不更换驱动，不运行 build。

## 最终认证生产构建

`node tests/mindplus-card-production-20261126.mjs` 通过：production-build.json 声明 ideAuth=true，5 项冻结文件及全部列出产物的实际 SHA256 匹配；openblock.html 实际引用 editor-DeEyQ3Tw.js（`442358b88ee946fde8f06af48c64c59ffa80a71b888bece46391a15eb92e29ad`）及 editor-CuBpnqbv.css（`864241b89cceb38854264d49a8d98a77e83a70a6bd4d9a956ff18eb2da1501ba`），本地资源引用存在。完整及哈希 GUI、Logo/favicon 均与前轮冻结副本字节摘要相同，沿用已有 VM/Blockly 保护结论。模块页共用 library.ts 未变；源码 CSS 仅下载 veil 和旧 ready 规则变化，不将模块 compatibility 状态套入主控 SDK 渲染。证据 `tests/evidence/mindplus-card-cache-20261126/production.json`。未运行 build、全量测试、服务或硬件操作。

## 外部真实缓存证据（本分支只读引用）

Link 原测试分支提供 `D:/CFZN/CCraft Link/tests/evidence/toolchain-015-recovery.json`：独立新 Node 进程/新 executor 从隔离持久配置和 receipt 恢复 4 ESP32 ready，9 项 CLI 白名单真实探针，零下载/安装/prepare，17 项 archive/config/receipt 保持不变。此为其执行的非 mock native 证据，本分支仅阅读，不重新启动进程或探测实体。Link 0.1.5 保持原包。本报告的前端 mock 重建通过不能替代这项 native 持久性证据。

## 部署后 HTTP 补验

部署 20261126T071228Z-48e345c3 后，`node tests/mindplus-card-public-20261126.mjs` 通过。默认证书校验的 HTTPS GET 确认 HTML 引用 editor-DeEyQ3Tw.js / editor-CuBpnqbv.css，公网两资产 SHA256 与当前 production-build.json 一致；health=ok/maker/minio，首页、登录和游客静态入口均 200。下载 metadata 仍为 0.1.5 / 53313236 B / `d95f9d4a498ad032bebaab0a614d12e4a6b6029cb03aef3adc5d38f0e1ff7d5d`。安装包仅请求 bytes=0-63，206、64 B、Content-Range=bytes 0-63/53313236、MZ 头正确，未重复整包 SHA。证据 `tests/evidence/mindplus-card-cache-20261126/public-http.json`。本项仅 HTTP/字节验收，不代表浏览器视觉或真实用户、项目、Link 交互验证；未启动服务或重跑功能套件。
