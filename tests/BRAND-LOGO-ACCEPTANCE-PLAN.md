# Logo 独立短验收准备

状态：等主控最终冻结及启动；没有浏览器/产品执行。依据 docs/api-contract.md 顶部 Logo 附录（120×40 覆盖提案候选32px）。

运行器 tests/brand-logo-independent.mjs 有 --run-frozen 门槛，CFZN_LOGO_SURFACE=dev/dist。复用本地 Playwright/Edge/Vite，不安装依赖、不重建，随机隔离HTTP端口、测试专属Edge profile，拦截全部API请求避免用户服务及物理串口。结束关闭所属资源并仅删除新建专属路径，不碰旧REA profile。

检查：项目public/runtime/dist字节275981、1318×509、SHA256等于源快照；真实HTTP200/image/png及响应哈希；浏览器natural尺寸、同源URL、alt/draggable、120×40/contain/居中/非flex、Logo在48px菜单内。宽窄/断点2560～640并真实观察React原生isOverflow两状态，图源始终相同。保留五按钮、标题、状态、滚动条及模式控件。

仅测试自建Edge profile中edge://settings的settingsPrivate.setDefaultZoom能力，尝试80/100/125/150/200%，必须DPR和CSS viewport同时证明才记实际浏览器缩放。能力不可用或未生效则明确标为viewport布局等效检查，不伪称UI缩放。每次截图和几何/状态记录。

重用 tests/parity-v07-boundary.mjs 独立178VM/15Blockly exact bytes比较（模块身份来自上轮sourcemap清单，字节从固定上游tgz重读）；不重跑v0.7无关矩阵。冻结后记录最终hash、独立结果、开发构建/类型交付来源和资源清理。
