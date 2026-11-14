ROUND 1
Seen in one second: OpenBlock 原生扩展库中的主控、器件目录。
Idea (one sentence): 在原生筛选栏内加入硬件分类，继续使用原卡片、搜索、返回和积木编辑器。
Live thing: 选择真实 VM 主控、加载真实模块并生成 Arduino 代码。
Layout words by section: filter=原生横栏 / catalog=原卡片网格 / workspace=原生编辑器。
Scores: design 8 · usability 8 · creativity 6.5 · content 8 → overall 7.7
Caps applied: 单组件沿用已有设计，不重新抽取页面方向；不把原生界面卡片/边框当作营销页违规项。
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. 旧模块图片比例使卡名错位：仅硬件目录使用统一 186px 图片区域及 contain；`modules-1440.png` 已对齐。
2. 未选主控的旧 disabled 标记不真实：原组件接收实际原因文本，`modules-before-controller.png` 显示“先选择主控”。
3. 390px 原模态内层 min-content 把目录挤出屏幕：限定该目录容器宽度，卡片单列、筛选栏横向滚动；`modules-390.png`、`modules-390-scrolled.png` 及 `ui-check.json` 验证最后卡片、搜索和返回可操作。

已查看 `controllers-1440.png`、`modules-1440.png`、`modules-768.png`、`modules-390.png`、`connected-blocks-1440.png`、`restored-blocks-1440.png`。保留原蓝色、字体、卡片和积木颜色，没有新主题/照片下载/额外营销动效。筛选栏在窄屏需要水平滚动，完整 IDE 仍沿用上游桌面布局，不将该局部改动描述为整套 IDE 手机适配。

图片由旧项目本地复制或沿用固定官方包；原路径及随附许可见 `vendor/SOURCES.md`，未复制 Mind+ 素材。这里没有声称整页通用 inspect.mjs 规则全通过；已执行新源码 lint（0 FAIL / 0 WARN）、真实浏览器尺寸检查和截图逐张审查。
