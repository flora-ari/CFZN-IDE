# Mind+ 式主控状态与缓存识别

2026-11-26，已编译部署并通过独立公网补验。用户确认只调整主控板选择页，功能模块页保持原样。

## 取证与实现范围

主控重新静态取得线上 Mind+ 原 JS/CSS；Craft 原文证明已下载卡片不保留下载/成功勾，未下载才显示浅灰层与右上下载入口。本机按模式、主板和版本保存 ZIP、解压目录及成功提交后的 dev.json；SDK core/tools 和下载归档是另两层，不依靠页面 localStorage 布尔值恢复状态。完整偏移、哈希、证据 ID 与工具限制见 `.runtime/mindplus-resource-cache-20261126/findings.md`。

CCraft 预置编辑资源继续由固定 GUI/静态资源和原版加载器提供，本轮不虚构一个额外的 ZIP 缓存。已有本机 0.1.5 用持久配置、归档/core 和 receipt 重新发现工具链，实际恢复能力由 Link 主控做隔离跨 executor 验证。编辑资源、本机编译就绪与当前作品已加载主控分别判断。

本机补验已通过：全新 Node 进程和新 executor 从隔离 `D:/CCLQ015-a15c7e` 的持久数据恢复，未注入旧 discovered；1 次 CLI version、4 次 board details、4 次 GCC-E，共 9 次白名单查询后，四个 ESP32 Profile 全部 ready。下载/安装指令为 0，没有调用 prepare/build/upload 或启动应用/HTTP。配置、receipt、17 个归档的大小/SHA/mtime 和冻结源码前后不变，父进程环境也未改。子进程代理指向关闭的 loopback，没有运行代理服务或宣称 OS 抓包。准确报告为 `D:/CFZN/CCraft Link/tests/toolchain-015-recovery-report.md`，完整证据为同项目 `tests/evidence/toolchain-015-recovery.json`；本轮无需 Link 产品修改或重打包。

前端修正目标：ready 正常无图标/灰层/占位；本实例新鲜目录明确 missing 且可安装，或对应失败可重试时，才显示浅灰与下载入口。unknown、离线、无 Profile 或旧 Link 不误画为缺失；目录/能力跨实例与观察次序重新对账，避免旧缓存或旧请求污染新状态。保持卡片尺寸、两阶段选择、字节进度、取消、共享计划和编译续接。

两侧设计为 `docs/design/mindplus-resource-cache-frontend.md` 与 `mindplus-resource-cache-backend.md`，统一契约见 api-contract.md 最顶部。原开发会话上下文压缩连续遇到模型转发 502，未修改产品；现有前端设计会话兼任实现，独立测试会话照常验收。

## 验证与发布

五文件源码候选 `.runtime/mindplus-resource-cache-20261126/candidate.json` 冻结；开发全量前端 199/199、类型与硬件回归通过。独立验收实际运行的定向数量为 20/20，并通过实际 HardwareController/HardwareSession/ToolchainPreparation + React SSR 组合检查：两个新 controller/observer 先后读取同一 ready 目录，无下载装饰及零 POST；切换实例尚未确认时中性，确认 missing 后显示下载，确认 ready 后移除全部装饰。模块 library 原字节、20 板目录与卡片尺寸规则不变。这不是实际浏览器几何测试，细节见 `tests/MINDPLUS-CARD-CACHE-20261126-REPORT.md`。

主控 `VITE_IDE_AUTH=true npm run build` 通过。最终 JS `editor-DeEyQ3Tw.js`，228,028 B，SHA `442358b88ee946fde8f06af48c64c59ffa80a71b888bece46391a15eb92e29ad`；CSS `editor-CuBpnqbv.css`，40,985 B，SHA `864241b89cceb38854264d49a8d98a77e83a70a6bd4d9a956ff18eb2da1501ba`。完整 GUI SHA 仍为 `6894755e27261ca3f03fc239a9b0d64bacf2269e9dc5f1e9bd2f289860621420`；独立生产构建补核通过。记录为 `.runtime/mindplus-resource-cache-20261126/production-build.json`。

已上线 `20261126T071228Z-48e345c3`，API `127.0.0.1:9111`，发布归档 SHA `4f8c225b3681ace42e8f0f08a2f5ce2b22d31dfd115c3006422c3e53e0a93fcc`。部署器退出 0，Nginx 首次切换 health 502 经内置重试后恢复；首页、编辑器、health、自定义模块、登录及 SSO 均检查通过。主控另对公网 HTML/JS/CSS 字节、ok/maker/minio、最新下载元数据和 64 字节 Range 206 补验通过，见 `build/deploy/20261126T071228Z-48e345c3/mindplus-card-cache-verification-online.json`。

原独立测试另行核对公网最终 HTML/JS/CSS 引用和摘要、health 及 0.1.5 元数据/Range 通过，报告已补充线上范围。没有再跑已通过的全量套件，也没有把 HTTP 或 SSR 验证称为实际浏览器截图/几何通过。

固定下载继续提供已冻结 0.1.5，53,313,236 B、SHA `d95f9d4a498ad032bebaab0a614d12e4a6b6029cb03aef3adc5d38f0e1ff7d5d`，本轮没有新本机安装包。源码 public、dist 和本轮打包安装文件均重新完整计算本地 SHA；先前 `20261126T062621Z` 发布的完整公网下载证明保留，本轮未重复传输整包，只补公开 Range 与元数据。没有因为 UI 发布清理同版本缓存、旧网站备份或用户本机数据。

浏览器实际几何及截图仍受此前工具拒绝边界限制，不能以源码/React 组件输出冒充视觉验收。无实体串口、烧录、用户缓存清理或本机服务启停。
