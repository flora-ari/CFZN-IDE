# 编辑器强刷后加载慢优化

2026-11-24。用户明确反馈为强刷后的首次进入较慢，加载最终会完成。

## 原因与范围

线上基线 `20261124T081631Z-cfe8ac8d` 的 GUI 为 22,664,720 B，gzip 5,480,379 B。该文件从 publicDir 原样复制，不进入 Vite 的应用模块压缩。真实浏览器基线从 iframe 导航到原有 READY 的三次结果为 15,938 / 11,923 / 11,181 ms；中位数 11,923 ms。资源下载及随后的主线程长任务是本次优化目标，不能把整个等待归因于 API。

测量使用同一 IAB 环境、隔离的本机生产包、GUI 响应速率上限 800 KiB/s。完整网络传输经 ResourceTiming 字节数核实。浏览器进程未重启，首次样本与后续样本存在启动/编译缓存差异；所有样本均保留。这不是公网用户端到端秒数保证。

另发现本机 WLAN DNS `192.168.140.1` 查询域名超时；公共 DNS 返回正确地址，指定服务器地址并保留域名证书校验后，首页约 65 ms、GUI 首字节约 56 ms，TLS ALPN 为 h2。本轮未改系统 DNS 或 hosts，此现象与编辑器脚本处理开销分开记录。

## 实现

- 为 GUI 的非保护顶层 factory 收缩空白、移除非许可注释，输出使用内容摘要命名的新文件。生成器保留原始可执行 token，逐模块核对 token、Identifier、所有函数签名和 AST；需要换行的模块保留换行，无法等价的模块原样保留。JSDoc 注释内的文字不算可执行 token，许可另按原文计数核对。
- 178 个 VM、15 个 Blockly、音频热修复 520、嵌套模块表 237/435、空槽 1169 和末模块 1958 保持原字节。许可声明保留；旧 GUI 路径继续存在，过期 source-map 引用从新文件删除。
- 首页提前发现与 iframe 完全相同的 GUI URL。是否复用同一次下载以实际浏览器和 QA 服务请求日志核对，不能只凭 preload 标签认定有效。
- 构建期生成静态 Brotli / gzip 表示。仅 IDE 站点的新哈希 GUI 路由选择编码；保留 identity 回退、Vary、安全头和各表示的独立 ETag。无需安装 Nginx Brotli 模块。优先级为允许的 br、gzip、identity，不宣称按正 q 值大小排序。
- 从已发布基线隔离打包，加入本次 HTML/GUI/压缩元数据；不把并行 CCraft Link 或 API 修改带入本次发布。原图标资产保持原文。

## 验收与发布

已编译并部署 `20261124T092948Z-cfe8ac8d`，安装退出码 0；API 绑定 `127.0.0.1:9111`。服务器就绪检查在首次短暂 502 后重试成功，部署电脑随后首页、编辑器、health 和 custom-modules 四个公网检查均通过。

最终文件 `openblock-gui.0f3346f8af93e2a9.js` 的 SHA-256 为 `0f3346f8af93e2a988f5afb23ac870389e60acb2ee021692c5401c83eb9c1d55`。

| 测量 | 基线 | 最终版本 |
| --- | ---: | ---: |
| GUI 原文 | 22,664,720 B | 17,619,329 B |
| GUI gzip | 5,480,379 B | 4,662,697 B |
| 浏览器优先传输表示 | gzip 5,480,379 B | br 3,753,908 B |
| 恢复后同环境 READY 三次 | 10,564 / 9,976 / 9,832 ms | 8,351 / 7,742 / 7,674 ms |
| READY 中位数 | 9,976 ms | 7,742 ms |

恢复后补测旧版基线，采用较保守的 **22.39%** 中位数缩短结论（节省 2,234 ms），不使用暂停前的 35% 作为最终收益。GUI 实际传输字节减少 **31.50%**。测试使用同机 IAB 和独立本机生产包，GUI 响应上限 800 KiB/s；暂停、工具重新绑定及 CPU/代码编译缓存未完全控制，不承诺公网用户得到固定秒数。三次新 origin 均核实完整网络响应；每个 origin 只有一次 GUI HTTP body，iframe 复用首页提前下载的响应，没有额外下载同一脚本。全部历史样本保留，见 [最终对照](../tests/evidence/editor-cold-start-20261124/performance-comparison.json)。

前端 176 项测试已通过，最终恢复后的 typecheck/build 通过。独立最终 stage 全模块 AST/token/函数/常量/许可及保护字节检查零差异，另有 21 项聚焦执行/音频/校验器测试通过；36 个 API 文件与基线相同，隔离包没有并行 Link 变更。

主控在最终生产包真实页面拖拽“移动 10 步”并执行，角色 x 从 0 变 10；造型编辑器正常加载；声音播放按钮实际转为停止；保存后新建恢复 x=0，再从作品列表重开，积木和 x=10 均恢复。读取的 error/warn 日志为空。图见 [浏览器验收截图](../tests/evidence/editor-cold-start-20261124/editor-regression.jpg)。

线上 HTML、所引用 JS/CSS、原 Logo/favicon、最终 br/gzip 内容及解压摘要与冻结包一致，条件请求 304；legacy GUI 仍可取且原字节一致，health 正常，TLS 验证及 ALPN h2 通过。主控首次 HTTP 核对后的 TLS 探针缺少显式端口，已补为 443；HTTP 原始响应保留并离线复核，未重复下载已通过的资源，未把丢失的下载时长写成数值。见 [线上字节验证](../tests/evidence/editor-cold-start-20261124/deployed-verification.json)。正式编码矩阵由独立测试另记。

正式 HTTPS 独立验收实际退出码 0，26 组检查全部通过，覆盖 br/gzip/identity 完整解压字节、q 值边界、HEAD、304、跨表示 ETag、安全头和私有路径。见 [HTTP 验收证据](../tests/evidence/cold-start-performance-20261124/encoding-http-checks.json)。

线上 IAB 首次导航在 30 秒工具期限内未返回；随后按已创建的 tab 12 读取到完整原生编辑器、积木列表、角色/舞台与项目操作，确认页面实际已加载。后续脚本属性/截图采集又遇到工具超时，未保存线上截图，也未测得公网 READY 时长；不把自动化调用时长当成页面启动时间。截图证据来自前述本机最终生产包。浏览器内强刷快捷键未在该 IAB 宿主触发重导航，不把它算作强刷验收；完整网络冷启动已用三个全新 origin 验证。本轮没有改系统 DNS/hosts，也没有操作用户串口或本机硬件服务，临时 QA 进程已关闭。

初始候选 `a4c534b8c1f9171b` 被独立测试拒绝：esbuild 即便关闭语法和标识符压缩仍会改写内部绑定和表达式。该候选及 `20261124T091653Z-cfe8ac8d` 隔离包未部署，旧浏览器样本标为 obsolete，不纳入最终收益。

证据：[独立报告](../tests/COLD-START-PERFORMANCE-20261124-REPORT.md)、[主控证据目录](../tests/evidence/editor-cold-start-20261124/)、[性能基线](../.ecc/benchmarks/editor-cold-start-before.json)。
