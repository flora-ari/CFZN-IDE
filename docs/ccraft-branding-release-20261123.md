# CCraft 品牌发布记录

2026-11-23，主控汇总。发布编号 `20261123T083322Z-cfe8ac8d`，网站为 <https://ide.xiaodaiyang.top/>。

前端可见产品名称改为 CCraft，包括页面标题、启动遮罩、默认作品名称与相关提示。原生顶部“维基”改为“官网”，在新标签页打开 <https://maker.xiaodaiyang.top/>。用户提供的 PNG 原字节保存为 `apps/web/public/branding/ccraft-logo.png`，用于主要产品标志；透明留白通过展示布局处理，原文件未修改。

前端类型检查、生产构建和 110 项测试通过；独立 10 项聚焦检查、3 组最终产物检查和旧作品真实 API 往返检查通过。178 个 VM 模块、15 个 Blockly 模块及上游许可原文逐字节保留。详细边界见 [独立验收](../tests/CCRAFT-BRANDING-20261123-REPORT.md)。

主控使用生产构建在隔离的本地浏览器验收：启动文字为“正在启动 CCraft 编辑器…”，主要标志引用同源 PNG，图片原始尺寸 1448×1086，显示框 120×40，等比展示且完整包含主体与中文。“官网”实际打开指定网站的新标签，原编辑页仍为 CCraft。全屏切换可正常退出；该模式的截图不作为全屏标志实际可见的证明。默认作品名与消息回退以 Node 和文件验收为证据，本次未在浏览器可见标题输入框中另作断言。

部署脚本退出码 0，服务器和公网的首页、编辑器、健康接口和自定义模块接口检查均通过。发布包 SHA-256 为 `51e1b7623ba1d81a3c35aafe3e52776264ccf480f5bf64acce69beffea4f5fc0`。线上图像已确认与用户原图 SHA-256 一致：`c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2`。

最终 10 个线上文件均经完整 HTTPS 下载并与本地逐字节校验通过，包括两页 HTML、脚本、样式、图标、用户 PNG 和完整 GUI。GUI 的首个 45 秒下载超时，较长超时的完整重取通过，SHA-256 为 `779645f288c17a3ffc4c181908a681d203e410387026ccbf202dc571a6ea359d`。只读 SSH 另确认活动发布链接正确、GUI/Logo 摘要一致且服务为 active。

线上浏览器自动复核超时，没有将其报告为通过；本地生产构建的实际视觉与线上发布文件校验分别记录。临时主控 QA 服务已关闭，没有操作实体烧录或用户正在使用的开发服务。

- [启动页面截图](../tests/evidence/ccraft-branding-20261123/local-boot.jpg)
- [本地生产版顶部截图](../tests/evidence/ccraft-branding-20261123/local-final-header.jpg)
- [线上文件与接口核对](../tests/evidence/ccraft-branding-20261123/deployed-verification.json)
