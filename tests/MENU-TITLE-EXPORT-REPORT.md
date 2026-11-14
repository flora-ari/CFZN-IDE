# 作品名宽度与导出入口独立聚焦验收

2026-11-10。**2/2通过，未解决本轮问题0项。** 构建 `editor-HEQ9jwx-.js` / `editor-D6p5thY9.css`。

命令：`node tests/menu-title-export.mjs`；`node tests/mode-v03-vm-boundary.mjs`。实际Edge、自建随机网页/API端口；只改tests，没有构建全仓或重复API保存矩阵，没有串口/硬件操作。

- 1440/1776/2560 × 短中文、84字长中文、短英文、78字长英文：实际输入宽均180px，容器188px，计算样式input min100/max220；内容可完整编辑，不随名称或视口拉长。五项目按钮和两模式按钮聚焦后都在视口/48px菜单内。
- 原生 `menu-bar_save-icon` 数量0；自有export-project数量1。实际点击Export下载完整 `.ob`（48,357字节），project.json完整、5项造型/声音引用均存在且非空，`cfzn/editor.json`保留实际Monaco手动草稿。
- 导出前后dirty=true，无项目POST/PUT/PATCH写入；无页面JS异常。
- 最终GUI bundle的178个VM模块逐模块SHA256与固定上游相同；24个GUI hook，没有VM factory注入。

证据：`tests/evidence/menu-title-export/2026-11-10T07-01-56-932Z/` 的 results.json、build.json、actual-export.ob、title-{1440,1776,2560}.png。已实际查看2560截图。VM证据为 `tests/evidence/mode-ui-v03-independent/vm-boundary/` 本轮重新生成结果。

首轮英文测试值误为104字，超过既有95字符UI maxlength而截断；改用78字后补测通过。不是本轮新增字符限制或产品缺陷，首轮结果保留。

本轮两个运行均正常退出，自有浏览器/静态服务/API已关闭，最终临时目录已确认不存在。未尝试清理任何历史遗留目录，未触碰用户服务。未执行100字符名称保存、后端全量或其它无关回归。

