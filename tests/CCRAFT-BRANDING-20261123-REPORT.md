# CCraft 品牌独立验收

2026-11-23（Asia/Shanghai）。最终用户 PNG 版的独立 Node 与文件/产物检查通过。聚焦 Node 测试 10 项和最终独立文件检查 3 组通过，同轮较早取得的真实隔离 API 作品兼容检查通过。

最终核对 editor-DZdxa2LI.js、app-nn_yBamJ.js、editor-DRDKyc1b.css，GUI SHA-256 为 779645f288c17a3ffc4c181908a681d203e410387026ccbf202dc571a6ea359d。

| 范围 | 当前核对结果 |
| --- | --- |
| 可见名称和入口 | 两页 HTML 标题、启动遮罩、父页 iframe 名称、未就绪/关闭/超时、启动失败和读取项目错误、默认作品名、恢复备份名均命中 CCraft。favicon 与通用图使用本地品牌资源。 |
| 最终用户 Logo | ccraft-logo.png 为 1448×1086、495240 字节，SHA-256 为 c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2，public、runtime、dist 副本逐字节一致。正常/溢出状态的真实 GUI 来源表达式及全屏入口均引用同一本地 PNG、alt 为 CCraft。 |
| Logo 展示范围 | 120×40 框使用 object-fit:cover、object-position:50% 53%。只读 PNG 扫描线测试核对 alpha>16 的主体和中文范围完整落在显示视口内，保留等比缩放。外围透明留白及部分低透明像素不在展示视口内，PNG 文件保留全部原始字节。浏览器实际视觉由主控另验。 |
| GUI 消息 | 既有测试对上游全部语言消息执行白名单核对，插值参数保留，未审核的其他消息与用户字符串原样保留。缓存按消息对象和 locale 派生，返回冻结对象；同输入身份稳定。zh_CN、zh-Hant、zh-HK、en_US 和未知 locale 的默认值与官网名称另做独立核对。 |
| 官网 | 从已构建 GUI 提取真实 handleClickOpenWiki 并执行，调用精确为 window.open('https://maker.xiaodaiyang.top/', '_blank', 'noopener,noreferrer')。模拟当前页地址和内容不变。现有测试覆盖原生键盘 Enter/空格、可访问名称及其他帮助目标。真实新标签浏览器行为由主控另验。 |
| 生成代码和已有内容 | 既有测试覆盖自动生成固定首行及 CR/LF/CRLF，手动代码不替换。独立构造包含 OpenBlock 标题、变量、注释、字符串、造型名称和 SVG 内容的旧作品，添加手稿后经临时真实 Nest 保存与下载，字节完全一致。 |
| 协议和格式 | cfzn.openblock、application/x.openblock.ob、format openblock、旧 .sb3 提交文件名及 .ob 下载、cfzn/editor.json 均继续工作。POST 201、ETag/If-Match 和完整归档实际往返通过。 |
| 上游边界 | 已构建 GUI 等于固定上游经过精确 GUI src 挂点后的结果。178 个 VM 和 15 个 Blockly 模块逐字节一致，LICENSE、LICENSE.MIT 和 TRADEMARK 与上游压缩包原文件逐字节一致。 |

本会话执行范围为 Node、文件/产物、处理函数模拟和同轮较早的真实临时项目 API，浏览器测试次数为 0。用户 PNG 冻结后的收尾使用 CCRAFT_FILE_ONLY=1，只运行文件检查与聚焦 Node 测试。主控负责真实启动遮罩、菜单、Logo、默认标题和官网新标签验收。较早隔离 Nest 使用随机回环端口，临时存储已清理。

- [最终 10 项聚焦 Node 测试](evidence/ccraft-branding-20261123/node-tests.txt)
- [最终独立文件检查记录](evidence/ccraft-branding-20261123/final-file-checks.json)
- [同轮隔离项目 API 兼容记录](evidence/ccraft-branding-20261123/project-compatibility.json)
- [用户 PNG 原文件摘要](evidence/ccraft-branding-20261123/user-logo-reference.json)
- [独立复验脚本](ccraft-branding-20261123.mjs)
