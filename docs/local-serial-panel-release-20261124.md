# 本机串口面板精简发布

2026-11-24（Asia/Shanghai）。按用户最新截图要求删除“浏览器串口”切换按钮、整个首次授权说明和“连接新设备”区域。面板固定本机目录，保留服务状态、刷新、五列、每行波特率和最右操作；普通浏览器许可候选不再重复显示。旧浏览器活动或待释放句柄仍可查看并断开，确认释放后移除，底层兼容实现及 API 保持。

前端类型检查、生产构建和 152 项测试通过。[独立验收](../tests/LOCAL-SERIAL-PANEL-SIMPLIFICATION-20261124-REPORT.md) 运行现有 31 项聚焦回归并完成源码、产物及受保护字节审查，未发现阻塞项，没有为静态删减新增镜像单测。

主控真实本机生产页显示仅有一行 OS COM3，两个入口区域均不可见；五列表头正确，1280×720 下弹窗 bottom=704，完整位于视口内。COM3 由用户其他窗口占用，主控仅查看目录，没有连接、断开、修改波特率或烧录。见 [浏览器记录](../tests/evidence/local-serial-panel-20261124/browser-observation.json) 与 [截图](../tests/evidence/local-serial-panel-20261124/local-panel.jpg)。旧浏览器句柄释放仅有模拟验证，不计为本轮实体操作。

生产编译后发布 `20261124T025043Z-cfe8ac8d`，归档 SHA-256：`f1a92b69f03b3fb54a02ffbff2f92e0ef6849fb2741289026d6141e231be9aef`。当前入口 `editor-sqHyfw8P.js` / `editor-A53goq4q.css`。服务器安装校验、HTTPS 与 API 正常，线上 HTML/JS/CSS/Logo 字节与本地一致，GUI gzip 解压字节一致且条件请求 304。见 [线上验证](../tests/evidence/local-serial-panel-20261124/deployed-verification.json)。本轮以本机生产页验证渲染、线上响应验证发布产物，没有宣称线上浏览器或硬件复测。

178 个 VM、15 个 Blockly 模块、上游许可和用户 PNG 保持原字节。临时 QA PID 87072 已关闭；本机硬件服务 PID 72632 始终保留且未重启，当前仅 3002 监听。见 [服务保留记录](../tests/evidence/local-serial-panel-20261124/retained-service.json)。
