# 顶部品牌 Logo 独立验收报告

2026-11-12 11:46 Asia/Shanghai。功能结论：**隔离 dev 6/6、静态 dist 6/6，共 12 项检查通过**，页面未捕获异常。未重建产品，未重跑 v0.7 无关矩阵。清理存在一项已明确记录的临时目录例外，见末节。

## 冻结及资产

- GUI SHA256：`E3B1E80E0D1D2DF14F881288BEFACB0ED3A7BE863CAF749EA0ACFEE0C9D28086`
- editor-BRr_St-Y.js 内容 SHA256：`9D1FC47EEBFA3242C64554044965DE6C6BC2D7FB168007B7693C3A33AE323B2B`
- editor-C8aZSiQs.css SHA256：`F10C59145A039875B08D92F7A5E77312A66EA1A7B2063A32A34D7FDF8C31A7FD`
- 原 F:/Desktop/IDE.png、项目 public/branding/IDE.png、runtime/branding/IDE.png、dist/branding/IDE.png 四份最终 SHA256 均为 `18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F`；PNG 为 275981 字节、1318×509。

开发 build/types PASS 是 apps/web/evidence/brand-logo-20261112 中的交付证据；本角色独立浏览器与字节结果见下。最终哈希读数与主控冻结值一致。

## 独立 12 项检查

每面分别使用自己的随机 loopback HTTP 端口、Edge persistent profile、Vite 缓存。全部 /api 请求被隔离测试拦截，无请求用户 API 或硬件。静态 MIME 映射包括 PNG/JS/MJS，未使用 SPA 回退伪造图片成功。

| 检查 | dev | dist | 实际证据 |
| --- | --- | --- | --- |
| 项目/runtime/dist PNG 原字节身份 | PASS | PASS | SHA、长度、PNG header、IHDR 尺寸 |
| 真实 HTTP 图片响应及可移植 URL | PASS | PASS | 200、image/png、响应 SHA 等于项目 PNG，同源 /branding/IDE.png |
| 宽窄/断点/原生溢出两分支 | PASS | PASS | 12 个 viewport、真实读取 React isOverflow true/false、图源始终相同 |
| 实际浏览器缩放五档 | PASS | PASS | 自建 Edge settingsPrivate.defaultZoom；DPR 与 CSS viewport 双验证 |
| 标题/五按钮/状态/细滚动/模式控件保留 | PASS | PASS | DOM/几何/CSS、draggable=false、alt=CFZN IDE、点击无新跳转 |
| 页面异常 | PASS | PASS | page-errors.json 空，console-errors.json 空 |

宽度为 2560、1440、1201、1200、1199、1101、1100、1051、1050、1000、800、640。每次等待原生 resize/overflow 检查完成。Logo image 盒始终为 120×40 CSS px，max 同值、object-fit:contain、object-position:center、flex-grow/shrink 均 0，naturalWidth/Height=1318/509，盒边界包含于 48 CSS px 的原生菜单。原图按 contain 完整等比绘制，无 cover 裁切或独立横纵拉伸；溢出状态不再切回橙色图标。原 class 和 draggable 保留。

### 真实缩放，非 viewport 等效

在各自全新的测试专属 Edge profile 中打开 edge://settings/appearance，settingsPrivate.setDefaultZoom/getDefaultZoom 可用。设置之后真实产品页重载，测得：

| 浏览器默认缩放 | DPR | 产品 iframe innerWidth（1440 物理 viewport） |
| --- | --- | --- |
| 80% | 0.8000000119 | 1800 |
| 100% | 1 | 1440 |
| 125% | 1.25 | 1152 |
| 150% | 1.5 | 960 |
| 200% | 2 | 720 |

dev/dist 五档全部由实际 browser default zoom 实现并验证，没有进入 viewport-equivalence fallback。每档 Logo 仍为120×40 CSS px、菜单48 CSS px。此处是在自建 headless Edge 中改变真实浏览器设置，并非人工点击用户浏览器菜单或修改用户默认 profile；截图在 zoom-0.8/1/1.25/1.5/2.png。

## 证据及边界

- tests/evidence/brand-logo/2026-11-12T03-41-02-061Z-dist/
- tests/evidence/brand-logo/2026-11-12T03-41-12-799Z-dev/
- 每面 results.json 包含12 viewport和5档zoom的完整图像/菜单/toolbar/mode几何、CSS、React overflow、natural尺寸与URL；requests/page-errors/console-errors/environment 独立记录。
- tests/evidence/brand-logo/independent-upstream-byte-comparison.json：从固定官方 tgz 重读原始 bundle，与本轮冻结 dist **178 VM / 15 Blockly 模块 exact bytes 全相同**。模块身份取开发 sourcemap 清单，字节比较独立执行；hook source 全在 GUI src。
- tests/evidence/brand-logo/final-verification.json：最终四份PNG及三份产品哈希、PID/端口/临时路径状态。

本轮只验 Logo 资产、展示、缩放和相邻控件局部保留，不宣称重测完整工程功能或实体硬件。

## 清理及自动审批例外

静态组正常退出，54279 无监听，专属临时目录 cfzn-logo-independent-KHRCLX 已删除。dev 的 Edge 已退出，浏览器关闭阶段的测试 Node 一度挂起；将核对本次 PID 并停止进程和递归删除本次临时目录合成的清理动作被自动审批拒绝，仅返回 **blocked by policy**，无更细原因。

随后缩小为固定本轮测试 PID 的单独停止动作被自动审批允许并成功；最终 PID49048 不存在、61263 无监听。主控要求停止重试删除后未再执行目录清理。保留本轮新目录：

`C:/Users/YUUMEI/AppData/Local/Temp/cfzn-logo-independent-l1zTkj`

该目录只含本轮 owned-edge-profile / vite-cache，既有用户浏览器与旧 REA profile 未触碰。dev runner 因结束挂起进程而退出码1，**不是12项功能断言失败**；所有功能结果已在退出前写盘，最终 cleanup 状态如实补入 latest-dev.json。没有仍运行的本轮测试HTTP服务。用户5173/3001/3002和COM3从未启停/打开。
