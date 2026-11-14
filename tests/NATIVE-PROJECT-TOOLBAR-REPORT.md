# 原生项目工具栏独立验收

## 最新：蓝色 MenuBar 同行位置更正（20:16–20:19）

**本次修正结论：4 个聚焦验收组全部通过，未解决产品缺陷 0 项。** 实际构建为 **`assets/editor-Newf58X1.js`**。当前结论以这一节为准；后文 18:52 的 10 组属于首次 alerts 位置的历史功能验收，旧位置结论已被覆盖，保存/桥接/错误语义证据按主控要求复用。

本轮只更新 `tests/native-project-toolbar.mjs` 及测试报告/证据，未修改产品代码、公共契约或根配置，未递归委派。独立服务当前 dist，并使用随机端口真实 API 和独立临时存储；没有使用或停止用户 5173/3001 服务。

执行入口：

```powershell
node tests/native-project-toolbar.mjs --placement
```

新增的 placement 模式从 clean 文档开始，不建立上次 `CFZN_NATIVE_CASE` 的 dirty VM fixture；旧默认模式的宿主与间距断言也已更新到 MenuBar。修正前的 alerts/body 属性及 CSS space 变量均作为“必须不存在”断言。

| 聚焦组 | 最终结果 | 验证内容 |
| --- | --- | --- |
| 真实直接归属、File 移除、桌面同行及无占位 | PASS | 工具组是实际 `.gui_menu-bar-position_3U1T0.menu-bar_menu-bar_JcuHF.box_box_2jjDp` 直接子元素；六按钮及状态唯一，父 app-bar 仍不存在；File 无、Edit/device/title 均保留；1440/1894 六按钮与状态都在蓝栏内；无 `data-cfzn-alert-host`、`data-cfzn-editor-body` 或 CSS 补偿变量 |
| 390px 工具组内横向滚动 | PASS | 真鼠标横向 wheel 使组内 scrollLeft 增加；逐个聚焦六按钮后都完整进入组的可视范围且中心命中自身；状态滚入可见，整个页面 scrollX 仍为 0 |
| 原生下拉、设备库、告警与扩展库优先级 | PASS | 1440 下 Edit 下拉从 y=48 向编辑区展开且可命中；菜单 overflowY=visible；原生设备库可打开；真实 VM 事件触发原告警并关闭；扩展库分类切换正常，模态时新工具组隐藏 |
| 实际 import/save/export 与抽屉点击 | PASS | 原生导出为真实完整 `.ob`，dirty 保持且无保存 API；点击 iframe Import 触发 filechooser，确认替换并重导入实际下载；真实 POST 201/v1 与 GET 归档语义一致；项目抽屉可读本次项目、新建后可重新打开；串口按钮只开抽屉，mock requestPort 为 0 |

关键几何（iframe 内坐标）：

| 视口宽度 | MenuBar | 工具组 | 标签行开始 | 状态 |
| --- | --- | --- | --- | --- |
| 1440 | y=0，H=48 | y=0，H=48，W=374 | y=48 | y=15..33，完整在栏内 |
| 1894 | y=0，H=48 | y=0，H=48，W=374 | y=48 | y=15..33，完整在栏内 |
| 390 | y=0，H=48 | x=293.25，W=72，scrollWidth=374 | y=48 | 横滚后 x=293.25，W=72，可见 |

六按钮均在 y=8..40，无新增下方工具行。已实际查看 1440、1894、390 横滚状态、桌面 Edit 下拉和原生告警截图。窄屏其他原生菜单/标题沿用上游响应式行为；没有扩做整个 IDE 的响应式设计。

本次证据独立存于 `tests/evidence/native-menu-toolbar/`，不覆盖历史 10 组：

- [最终四组汇总](evidence/native-menu-toolbar/FINAL-ACCEPTANCE.json)。每项保留 sourceRun。
- 首次运行：[结果](evidence/native-menu-toolbar/2026-11-06T12-16-07-739Z/results.json)、[1440](evidence/native-menu-toolbar/2026-11-06T12-16-07-739Z/layout-1440.png)、[1894](evidence/native-menu-toolbar/2026-11-06T12-16-07-739Z/layout-1894.png)。
- 390 与真实操作补验：[2/2 结果](evidence/native-menu-toolbar/2026-11-06T12-17-48-038Z/results.json)、[390 横滚到状态](evidence/native-menu-toolbar/2026-11-06T12-17-48-038Z/layout-390-status-scrolled.png)、[网络](evidence/native-menu-toolbar/2026-11-06T12-17-48-038Z/network.json)、[导出归档](evidence/native-menu-toolbar/2026-11-06T12-17-48-038Z/menu-native-export.ob)。
- 明确恢复到桌面后的下拉/告警补验：[结果](evidence/native-menu-toolbar/2026-11-06T12-19-27-922Z/results.json)、[Edit 下拉](evidence/native-menu-toolbar/2026-11-06T12-19-27-922Z/native-edit-dropdown.png)、[原生告警](evidence/native-menu-toolbar/2026-11-06T12-19-27-922Z/native-alert.png)。

首轮 390 断言发生在上游 React 响应式 resize 切换前；后续标题操作又继承了该窄屏，标题按原生响应式隐藏。脚本改为等待实际菜单几何就绪，桌面操作明确恢复 1440 并等原生标题存在，再只补相关场景。未将这两项脚本前置问题派为产品缺陷。补跑命令为 placement 加 `CFZN_NATIVE_CASE='390|real import'`、`CFZN_NATIVE_CASE='original Edit'`，没有重跑保存并发/412/完整扩展矩阵。

三个独立运行均已关闭自建 API/静态服务及浏览器，三处本轮临时存储均确认已删除；无自动清理拒绝，也未触碰历史被拒绝清理的目录。页面无 JS 异常。物理串口、编译和烧录不在本轮，没有实机通过结论。

## 历史：首次 alerts 位置的功能验收（18:52–18:57）

日期：2026-11-06，Asia/Shanghai。

**结论：通过。10 个聚焦验收组最终全部 PASS，未发现产品缺陷；未解决产品缺陷 0 项。** 本轮只修改 `tests/`，未修改前后端产品代码、根配置或公共契约，未递归派工。

## 环境、依据与隔离

- 依据 `docs/api-contract.md` 的 Native project toolbar addendum、当前源码和最新前端 HANDOFF。没有把开发自验当作独立证据。
- Windows / Node 24 / Playwright / 本机 Edge 无头浏览器；直接服务当前 `apps/web/dist`。实际浏览器请求确认编辑器构建为 **`assets/editor-BZyWsZTr.js`**，协议资源为 `editor-protocol-C1YyAqD7.js`。
- 每次验收在自身 Node 进程内创建随机端口静态服务器、随机端口真实 Nest API、独立 `mkdtemp` 本地存储。浏览器 API 请求转发到该独立 API；全部测试项目仅存在于该临时存储。
- 未使用或停止用户现有 5173/3001 服务，没有读写用户项目。浏览器、静态服务器、临时 API 均在 finally 关闭；三次本轮主脚本临时存储结束后均已确认不存在。历史被拒绝清理的其他目录未触碰，本轮没有发生自动清理拒绝。
- 最新前端 build/typecheck/13 单测及后端无业务变更结论按交接复用，未重复运行。

## 分批执行与结果

完整首轮：

```powershell
node tests/native-project-toolbar.mjs
```

首轮在真实导入后，脚本仍按固定 `toolbar-number` ID 查找数字影子块，导致四个保存组共用的参数编辑 fixture 报空引用。原生序列化会将数字 shadow 压缩并在恢复时重新分配 ID；这属于测试定位错误，没有派为产品缺陷。修正为从 `toolbar-move` 的真实 `STEPS` 输入连接查找当前 shadow，并按 VM 输入连接断言参数。只补跑受影响四组：

```powershell
$env:CFZN_NATIVE_SAVE_RECHECK = '1'
node tests/native-project-toolbar.mjs
Remove-Item Env:CFZN_NATIVE_SAVE_RECHECK
```

查看截图后，又只补充一次 POST/PUT/fresh reopen 的可见积木就绪检查：实际工作区中的 `toolbar-move` 仍连接启动帽、输入值为 20、SVG 宽度大于 0，再截取完成绘制的画面。该单组通过，排除 VM 已加载但截图早于画布绘制的问题。

```powershell
$env:CFZN_NATIVE_CASE = 'native POST'
node tests/native-project-toolbar.mjs
Remove-Item Env:CFZN_NATIVE_CASE
```

其余已通过场景未为凑单次全绿重复运行。每次结果、网络、环境、截图位于独立时间目录；最终按同名场景的最新结果合并至 [FINAL-ACCEPTANCE.json](evidence/native-project-toolbar/FINAL-ACCEPTANCE.json)。

| 验收组 | 最终结果 | 实际检查 |
| --- | --- | --- |
| 原生归属、唯一性、初始状态、1440/390 布局 | PASS | 父页面无 header/app-bar；实际 `.gui_alerts-container_15BWp.box_box_2jjDp` 中六按钮与一个状态各只有一份，父页面同 testid 数量为 0；clean 未关联项目显示“未保存项目”；按钮中心命中自身，菜单→控件→标签不重叠，空白宿主不截获指针 |
| 项目抽屉、键盘/焦点、原生标题、真实 VM 编辑 | PASS | 原生项目按钮按 Enter 打开真实父抽屉，expanded=true；Escape 关闭并返回 iframe 按钮焦点；编辑原生标题标 dirty；真实 Blockly/VM 建立启动帽与移动积木 |
| 真下载、新建 dirty 取消/确认、iframe 原生文件选择重导入 | PASS | 原生导出产生真实 `.ob` 下载，快照和 dirty 保持，写 API 次数不增加；新建取消保全完整项目，确认建立新 documentId 和 unsaved 状态；从 iframe 导入按钮捕获真实 filechooser，重新导入下载文件，块/素材语义保持且 dirty=true |
| 真实 POST/PUT、保存状态与 fresh reopen | PASS | POST 201 显示 v1；编辑后 PUT 200 显示 v2；真实上传 body 与 GET 内容精确字节相同；新浏览器上下文通过项目列表打开后 clean、v2，积木连接/参数与逐素材身份 SHA-256 保持 |
| 延迟保存后继续改原生标题和积木 | PASS | 等真实 PUT 到达后延迟转发，显示“正在保存…”，四文档按钮 disabled；此时编辑标题及积木值 30→40，完成后 notice 明确“已保存较早版本”、状态仍 dirty，API 归档值为 30、当前 VM 为 40；再次保存以及名称 PATCH 后状态与真实最新 revision 对齐 |
| 保存失败与原生保存重试 | PASS | 对真实 PUT 请求注入 JSON 500；notice 可见、dirty 保持，API 原归档字节与 revision 不变；解除注入后点击同一原生 Save 成功 |
| 真实 412 与两种恢复入口 | PASS | 对独立 API 做外部 If-Match PATCH，浏览器实际 PUT 得到 412；notice 两种入口可操作；取消重载保全文档，另存 POST 新 ID/v1；再次制造冲突并确认重载，恢复服务端 title/块值/revision2、clean |
| 串口抽屉与点击手势边界 | PASS（模拟权限选择） | 原生 Serial 只开抽屉、expanded 同步，requestPort 次数仍 0；父抽屉 Connect 实际点击才调用 mock requestPort 一次，`navigator.userActivation.isActive=true`；关闭回传 expanded=false。mock 返回 NotFoundError，未连接实机 |
| 原生告警、模态/全屏优先级、窄屏抽屉与页面错误 | PASS | 通过真实 VM 事件触发原生设备告警，原告警组件显示且可关闭；扩展库三分类可切换，打开后工具组隐藏且父抽屉关闭；原 stage fullscreen 隐藏工具组并恢复；390 项目抽屉可打开/关闭；三轮 pageerror 均为空 |
| 旧扩展脚本单个受影响 UI 路径冒烟 | PASS | 仅运行 `top toolbar` 场景：真实 Aijite/模块项目通过迁移后 Save POST/PUT、fresh 项目列表重开、原生导出和真实 chooser 重导入；其他旧扩展场景未执行 |

## 证据索引

总索引：[FINAL-ACCEPTANCE.json](evidence/native-project-toolbar/FINAL-ACCEPTANCE.json)。`latest.json` 仅指向最后一次单组可见积木检查，不代表已覆盖首轮其他通过项；所有原始运行目录保留。

首轮（18:52，`2026-11-06T10-52-42-098Z`）：

- [原始结果](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/results.json)、[网络](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/network.json)、[环境](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/environment.json)。四个影子 ID 失败保留为测试排错记录，最终结果见补测。
- [1440 布局](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/layout-1440.png)、[390 布局](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/layout-390.png)、[原生告警](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/native-alert.png)。已逐张实际查看；新控件紧凑、位于原生菜单下，390 下六按钮完整可用且状态换行。原 IDE 固有的桌面最小布局/菜单裁切未作为本轮新增问题。
- [扩展库模态](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/extension-modal-priority.png)、[舞台全屏](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/stage-fullscreen.png)、[390 抽屉](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/project-drawer-390.png)、[实际导出](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/actual-native-export.ob)。
- [旧脚本单场景日志](evidence/native-project-toolbar/2026-11-06T10-52-42-098Z/legacy-smoke.log)；其归档、素材映射及 runs JSON 位于同目录 `legacy-extension-smoke/`。

保存补测（18:53，`2026-11-06T10-53-45-782Z`）：

- [4/4 原始结果](evidence/native-project-toolbar/2026-11-06T10-53-45-782Z/results.json)、[真实 API 请求/响应状态](evidence/native-project-toolbar/2026-11-06T10-53-45-782Z/network.json)、[环境](evidence/native-project-toolbar/2026-11-06T10-53-45-782Z/environment.json)。
- [新上下文重开](evidence/native-project-toolbar/2026-11-06T10-53-45-782Z/fresh-ui-api-reopen.png)、[真实 412 恢复 UI](evidence/native-project-toolbar/2026-11-06T10-53-45-782Z/real-412-recovery.png)、[revision 2 完整归档](evidence/native-project-toolbar/2026-11-06T10-53-45-782Z/api-revision-2.ob)。

可见工作区补验（18:57，`2026-11-06T10-57-09-973Z`）：

- [单组 PASS 结果](evidence/native-project-toolbar/2026-11-06T10-57-09-973Z/results.json)、[完成绘制的 fresh reopen 截图](evidence/native-project-toolbar/2026-11-06T10-57-09-973Z/fresh-ui-api-reopen.png)。已实际查看启动帽、移动 20 步、舞台角色和 v2 保存状态同时呈现。

## 既有脚本适配

修改 [extensions-independent.mjs](extensions-independent.mjs)：

- 项目按钮、状态及等待条件定位到真实 iframe；项目标题改用唯一原生 title-field，不保留已删除的 active-project-name。
- 导入 helper 改为点击真实 iframe 导入按钮 → filechooser → setFiles，并观察实际父→子“正在导入…”视图后等按钮可用，避免异步消息尚未处理就读旧状态。
- 扩展模态本就隐藏原生工具栏，旧 busy-save 场景改为断言控件不可见，并验证已有桥接导出被 busy 拒绝、无保存请求；保留“不保存半注册归档”的原断言含义。该场景本轮只做静态适配，没有执行。
- 允许 `CFZN_TEST_EVIDENCE` 指向本轮目录，避免覆盖上轮验收证据。

修改 [extensions-switch-repro.mjs](extensions-switch-repro.mjs)：状态移至 iframe；重开导入采用真实 iframe 入口/filechooser；允许独立证据目录。本轮未重跑这两个已通过的上轮切换缺陷回归，只通过 `node --check` 验证语法并逐项检查定位迁移。

主脚本会自动运行一次隔离旧路径冒烟，等价配置为 `CFZN_TEST_FILTER='top toolbar'` 与自建静态服务地址，不运行上轮 14 组完整扩展矩阵。没有新增旧按钮或测试专用产品实现。

## 限制与收尾

- 本轮验证工具栏迁移影响；没有重做全扩展、后端重启/边界校验、通用 IDE 全量验收。
- 串口仅 mock requestPort 取消选择并记录真实浏览器激活，不代表实机串口、传感器、编译或烧录通过。
- 所有本轮自建服务、浏览器及本轮 API 存储已关闭/清理。没有操作用户服务，没有触碰此前被自动审批拒绝清理的目录。
- `node --check` 已通过新主脚本及两个修改的既有脚本；未重复 unchanged 后端/前端单测。
