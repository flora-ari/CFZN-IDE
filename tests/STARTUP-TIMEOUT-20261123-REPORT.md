# 网页启动传输与 Logo 官网入口独立验收

2026-11-23（Asia/Shanghai）。独立自动检查通过，启动、品牌和归档聚焦 Node 测试 16 项，现有预压缩测试 1 项，补充最终产物与实际 GUI 压缩验证 5 组全部通过。未启动浏览器、网页服务、硬件服务或线上操作。

冻结产物为 app-C0XuQYw1.js / app-C88jyimZ.css / editor-8a8g-MnV.js / editor-BGbwFYeN.css。GUI SHA-256 为 78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5，178 个 VM、15 个 Blockly 模块及三份上游许可逐字节匹配。用户 PNG SHA-256 仍为 c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2。

| 范围 | 独立验证 |
| --- | --- |
| 45 秒与 180 秒 | 假时钟执行真实 EditorBridge。44999ms 仍为 loading，45000ms 转 slow 且不可重试。180000ms 转 error 并允许显式重试，没有自动重载。45 秒后及 180 秒截止后的合法 READY 均清启动提示和两个计时器，已就绪后不可再用启动重试。普通 RPC 仍沿用独立的 45 秒操作超时。 |
| 来源与释放 | 外源及旧 iframe 的消息被忽略。dispose 可重复调用，清除计时器、父页 message 和 iframe load 监听，拒绝未完成请求。替换 iframe 的新 bridge 只接受新来源。就绪后迟到 BOOT_ERROR 不覆盖工作区状态。 |
| 早期资源错误 | 最终 HTML 的真实内联监听与源 HTML 一致，并安装在 React 等关键脚本之前。覆盖 script、stylesheet、modulepreload 失败、脚本执行异常、初始化 rejection 和默认项目失败。错误使用既有 cfzn.openblock / version 1 / BOOT_ERROR，资源 URL 仅保留路径。HELLO 仅向同源真实父页重放。 |
| 运行期与重试 | 首次资源失败移除错误监听，就绪或 pagehide 清除剩余监听。就绪后的运行期异常不再产生启动失败。App 独立保存 boot 和业务 notice，receive 不清业务提示，retryStartup 同时要求从未就绪、无当前快照和 bridge 可重试。销毁旧 bridge 后才增加 iframe key。 |
| Logo 官网入口 | 正常与溢出两分支的真实 GUI 表达式都生成原生 a 链接，href 为 https://maker.xiaodaiyang.top/，target 为 _blank，rel 为 noopener noreferrer，可访问名称为 CCraft 官网。链接保留原生 Tab/Enter 语义，图片不再触发项目 Logo 回调。原“官网”处理函数及其 Enter/空格测试继续通过。 |
| 实际 GUI 压缩 | 在临时目录复制最终 GUI，调用真实 precompressWeb 生成 .gz。gunzip 后与原 GUI 完全相同，原文件、临时原副本和压缩表示的 mtime 语义均通过检查。二进制资源、小文件及不节省空间的文件按既有测试跳过。 |
| 缓存与站点配置 | 静态审查 IDE HTTPS 模板启用 gzip、gzip_vary、etag，API 关闭 gzip/gzip_static，.mjs 使用 JavaScript MIME，安全头保留。模拟 nginx -V 验证有 gzip_static 模块时生成 on/off，无该模块时省略可选指令。固定 URL 仍 expires -1，哈希 assets 仍 expires 1y，未引入 GUI URL 改写。 |

压缩检查直接复制本次最终产物，临时目录完成后已清理。部署打包先复制 dist 并保留时间，再为同一次 stage/web 生成 .gz，原资源保留。压缩属于传输表示，固定 GUI 和原始资源仍按既有 URL 校验缓存。

最终 GUI 原文件 22,664,239 字节，压缩表示 5,480,187 字节，为原体积的 24.18%。主控另报告最终包 20261123T085924Z-cfe8ac8d 的 SHA-256 为 9370c475dda7dfb2217651ea353b9464f41cce4c81635ffad987bbed7873bbec，同次包内 284 个文本压缩副本共 6,778,703 字节。包级数据来自主控，本会话独立核对的是最终 GUI 压缩往返。

主控提供的真实浏览器补验也已通过。隔离生产页首次 GUI 故意返回 404，立即出现具体资源失败及“重新加载编辑器”。点击重试后真实编辑器与原生项目工具栏可用，editor-startup-status.isVisible 为 false。主控在“CCraft 官网”原生链接按 Enter 后，新标签实际 URL 为 https://maker.xiaodaiyang.top/，原编辑页仍为 http://127.0.0.1:50498/。 [资源失败画面](evidence/startup-timeout-20261123/resource-error.jpg) · [重试后真实就绪](evidence/startup-timeout-20261123/retry-ready.jpg)

本独立会话取得的是 Node 时钟/事件模拟、真实最终 HTML 脚本与 GUI 表达式执行、文件字节及模板配置证据。实际 HTTPS Content-Encoding、Vary、MIME、安全头、ETag/304 与公网冷启动 READY 耗时仍由主控负责上线验收，不能由静态检查替代。本轮未声称已测得公网加载时间。

复验命令如下。

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/editor-startup.test.ts apps/web/test/branding.test.ts apps/web/test/editor-archive.test.ts
node --test deploy/test-precompress.mjs
node --experimental-strip-types --disable-warning=ExperimentalWarning tests/startup-timeout-20261123.mjs
```

- [16 项前端聚焦测试](evidence/startup-timeout-20261123/frontend-tests.txt)
- [预压缩测试](evidence/startup-timeout-20261123/precompress-test.txt)
- [5 组独立检查及 GUI 压缩大小](evidence/startup-timeout-20261123/independent-checks.json)
- [独立验证脚本](startup-timeout-20261123.mjs)
