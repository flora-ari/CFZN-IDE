# Mind+ 桌面扩展库对照的后端设计

日期为 2026-11-18（Asia/Shanghai）。本提案供主控冻结契约，依据当前仓库源码与历史验收记录。

## 结论

本轮可以在前端完成。筛选条件和卡片信息来自随应用发布的目录，当前主控和模块的加载状态来自当前作品的 OpenBlock 运行时。选择、换板和移除继续由已有扩展适配器执行。作品内容在显式保存时经原项目 API 提交完整 `.ob`。现有 HTTP、`Project`、`ProjectStore`、ZIP 校验和归档格式均满足需求，后端实施量为零。

桌面 Mind+ 作为筛选维度、分组和卡片信息层级的交互参考。仓库的[桌面模式调查](mindplus-desktop-mode-observations.md)覆盖模式与上传，既有[扩展研究](mindplus-extension-observations.md)针对网页。当前桌面取证中的应用清单为部分静态覆盖，窗口记录只取得标题和系统控件（`ev_a7a6df6c1db756ef18e4f74502b2af9ec85082cb107c23291a757e6c5ee7fbc6`、`ev_0a0d79b72f829d2baefcdc83469e097d750cda69dd04dbbd8426c938c061bdf5`）。桌面筛选项、默认值及点击行为以主控和前端补取的桌面证据为准。本提案只核验 CFZN 的实现边界。

## 最小契约

| 范围 | 提案 | 仓库依据 |
| --- | --- | --- |
| 主控目录 | 顶部主控入口和扩展库“主控扩展”共用注册目录及同一筛选投影。保留有序的可见项、原 ID、禁用状态和真实说明。排除原生取消命令和隐藏项。`controllerIds` 继续用于既有模块兼容及适配范围。分类未标注的原生主控仍可通过“全部”和关键词找到。 | [library.ts](../../apps/web/src/extensions/library.ts)、[catalog.ts](../../apps/web/src/extensions/catalog.ts)、[双入口契约](../api-contract.md#两个主控入口共用目录2026-11-11主控冻结) |
| 模块目录与分类 | 模块沿用内置目录和 `supportDevice`。桌面风格的新分组仅对有明确元数据的现有条目生效。界面标签可本地化，条目身份始终使用稳定 ID。可见分类从该分区的完整目录生成，搜索和其它筛选不会清空分类选项。 | [catalog.ts](../../apps/web/src/extensions/catalog.ts) 的 `type`、`controllerTypes`、`supportsModule` |
| 筛选组合 | 以冻结的现有行为为基线：全部类型、已加载关闭、模块兼容筛选关闭。类型、已加载、支持当前主控和原生搜索取交集。没有主控时兼容筛选禁用并清除，模块仍可见。保留分区筛选记忆、原生查询重置及清除空结果的入口。筛选和展示调整只更新视图，`documentId`、`editVersion`、dirty 和存档 revision 均保持原值。舞台扩展沿用原有入口和状态。 | [library.ts](../../apps/web/src/extensions/library.ts)、[v0.7 验收](../../tests/MINDPLUS-PARITY-V07-REPORT.md) |
| 加载与可用状态 | 主控卡按 `currentDevice()` 标记“当前主控”，模块按 `loaded()` 标记“已添加”，包括已注册但尚未放入积木的模块。兼容状态单独由当前主控和 `supportDevice` 计算。应用内置、资源准备、作品已加载以及连接/编译能力各有独立含义。若参考界面出现“已安装”，此轮建议使用现有“已加载”或“已添加”表达作品状态，真实下载或机器级安装留待独立需求。 | [adapter.ts](../../apps/web/src/extensions/adapter.ts) 的 `currentDevice`、`loaded`、`registerModule`；[builtin-resources.ts](../../apps/web/src/extensions/builtin-resources.ts) 的同源静态资源准备 |
| 选择、换板与移除 | 两个入口调用相同的 `selectController`、`loadModule`、`removeModule`、`clearController`。移除始终是独立动作。候选卡或确认中的选择只表示用户意图，成功完成设备/模块注册后才显示新的选中状态。重复选择和取消确认均无文档变化。兼容换板保留已加载模块、舞台扩展及当前模式，重新注册当前板对应的工具箱和引脚菜单。已有兼容检查拒绝不支持的模块、硬件 opcode 或引脚；移除使用现有全目标引用、监视器、依赖和串口/忙守卫。成功操作提交一次编辑，操作本身不提交 HTTP 写入。 | [adapter.ts](../../apps/web/src/extensions/adapter.ts)、[controller-compatibility.ts](../../apps/web/src/extensions/controller-compatibility.ts)、[removal.ts](../../apps/web/src/extensions/removal.ts) |
| 事务和失败 | 准备资源、校验条件和完整归档备份均复用当前事务。提交前禁用冲突动作；已有引用或兼容性拒绝在变更前发生。准备失败保留原状态并可重试；开始变更后的失败以完整快照回滚，回滚也失败时进入现有恢复锁定并提供备份下载。打开/导入沿已有草稿校验和加载失败恢复路径，失败时父页面仍指向原作品。相关卡片动作不发起串口授权、连接或编译/烧录作业。 | [adapter.ts](../../apps/web/src/extensions/adapter.ts) 的 `transaction`；[openblock.ts](../../apps/web/src/openblock.ts) 的 `loadProject`、忙守卫；[App.tsx](../../apps/web/src/App.tsx) 的 `openProject`、`importProject` |

现有验收基线为两个入口各 20 个可见主控，类型标记只覆盖 5 个现有适配板。模块目录有 6 项，其中 3 个传感器、2 个执行器、1 个功能模块。目录发布沿用现有同源静态资源与固定 ID。筛选条件、分类标签、当前高亮、计数、资源加载/重试状态和资源路径都属于视图或应用资源状态，持久化载荷仅使用既有作品字段。模块的 `supportDevice` 表示目录兼容，实时协议、连接和编译可用性仍由各自现有接口判断。[双入口验收](../../tests/CONTROLLER-CATALOG-CONSISTENCY-REPORT.md)、[模块目录](../../apps/web/src/extensions/catalog.ts)

## 保存、归档和后续存储边界

- **作品内容**。使用 `vm.saveProjectSb3()` 及现有归档帮助层保留 `project.json` 中的 `device`、`programMode`、`extensions`、`deviceExtensions`、完整目标和块图，以及造型、声音等条目。可选 `cfzn/editor.json` 仍保存版本、代码模式和手写草稿，缺失时使用生成默认值。清空主控沿现有完整候选归档流程，将原生设备身份设为 `{deviceId:null,type:null,pnpIdList:[]}` 并确认模块已清空，恢复原模式和草稿。历史兼容 `.ob` / `.sb3` 沿原导入路径；本地旧板别名归一化仍由编辑器负责。[editor-archive.ts](../../apps/web/src/editor-archive.ts)、[catalog.ts](../../apps/web/src/extensions/catalog.ts)、[openblock.ts](../../apps/web/src/openblock.ts)
- **HTTP 保存**。新建或导入后的首次显式保存走 `POST /api/v1/projects`，multipart `name` 与 `file`，成功返回 revision 1。已保存作品走 `PUT /api/v1/projects/:id/content`，提交完整归档和带引号的 `If-Match`。同名保存只推进一次 revision；若标题同时更改，当前 `App.saveProject` 在内容保存后再用新 revision 执行既有 `PATCH`。重新打开先读元数据，再带对应 `If-Match` 请求 `GET /api/v1/projects/:id/content`，以相同 revision 的 `.ob` 原始字节恢复。旧 revision 返回 412 `REVISION_CONFLICT`，缺少必需修订头返回 428 `PRECONDITION_REQUIRED`。保存成功只确认同一 `documentId` 的所保存 `editVersion`，较晚的编辑仍为未保存状态。[api.ts](../../apps/web/src/api.ts)、[App.tsx](../../apps/web/src/App.tsx)、[projects.controller.ts](../../apps/api/src/projects/projects.controller.ts)
- **字节与校验**。ZIP 校验继续检查条目完整性、根 `project.json`、`targets` 数组及引用素材，保持压缩 20 MiB、解压 100 MiB、`project.json` 5 MiB 的上限。校验通过后 `LocalProjectStore` 以原始请求字节存储，通过项目级锁和元数据指针切换提交。编辑器可用性独立校验：结构与素材完整但扩展 ID 未知的包可通过 API 原样保存和下载，编辑器打开时给出缺少实现的错误并保全当前作品。比较同一次 HTTP 上传与下载的字节，编辑器再次序列化时比较作品语义和素材：归档帮助层可能对 ZIP 重新压缩。[project-archive.validator.ts](../../apps/api/src/projects/project-archive.validator.ts)、[local-project.store.ts](../../apps/api/src/projects/local-project.store.ts)、[API 既有测试](../../apps/api/test/api.test.cjs)
- **匿名本地与未来 Python/OSS**。目前由 `PROJECT_STORE` 注入 `LocalProjectStore`，项目 ID 为服务器分配的 UUID，`Project` 只含作品元数据。继续通过 `ProjectStore` 管理完整归档和版本提交。收到 Python 正式身份、存储位置和授权契约后，再设计服务端可信身份、逐项目授权、匿名存量迁移归属、对象位置及元数据与对象提交的一致性。匿名作品归属须有独立规则。目录和筛选本轮无需账户，`Project` 和归档无需用户标识、token、bucket 或对象 key，本轮无需 Python/SQL/OSS 请求、鉴权或数据迁移。[project-store.ts](../../apps/api/src/projects/project-store.ts)、[app.ts](../../apps/api/src/app.ts)、[既有后端设计](backend-interface-proposal.md)

## 回归矩阵

以下为主控冻结后的验收用例。历史[v0.6](../../tests/EXTENSION-LIBRARY-V06-REPORT.md)、[主控双入口](../../tests/CONTROLLER-CATALOG-CONSISTENCY-REPORT.md)与[v0.7](../../tests/MINDPLUS-PARITY-V07-REPORT.md)报告可用作基线。

| 场景 | 操作及通过条件 | 验证位置 |
| --- | --- | --- |
| 双入口与真实分类 | 比较两个主控入口在默认、同类型、同关键词和已加载条件下的有序 ID。未分类、禁用、隐藏及取消命令各按现有规则处理。模块测类型、兼容、状态、关键词交集及空结果清除。选择/清除筛选后比对 `GET_STATE`，项目 revision 和归档语义保持一致。 | 隔离 Vite dev / 静态 dist，真实 UI |
| 加载与筛选联动 | 无板时兼容筛选禁用且不影响结果，清除其它筛选后六个模块均可见；选板后按真实支持范围更新。添加无积木模块，在已加载视图立即出现；移除后立即消失。关闭已加载筛选不卸载。打开另一个项目后按该项目运行时重新计算选中项。 | Dev / dist，运行时和界面交叉核对 |
| 换板和移除 | 含兼容模块、带字段积木及手稿的作品兼容换板，检查真实工具箱、引脚菜单、原模式，切换前后 `documentId` 相同、`editVersion` +1。重复点击、确认取消（若纳入）、不兼容模块或引脚、跨目标引用、主控仍有模块及忙时均拒绝或幂等，既有 dirty 不丢失。无引用清板后核对舞台扩展、素材、原生监视器及草稿。 | Dev / dist，可复用 v0.6 与换板用例 |
| 故障与请求边界 | 中断模块资源准备，恢复后显式重试。注入一次实际进入事务后的注册失败，检查原主控/模块、块图、素材、模式、草稿和脏状态恢复。记录筛选及选择/移除期间的网络和串口调用，项目写入为零，仍可出现既有同源模块静态资源请求；串口授权及创建硬件作业为零。 | Dev / dist，故障注入单独标注 |
| 完整归档往返 | 以含主控、已加载却未使用的兼容模块、舞台扩展、积木、造型、声音和手稿的作品做真实首次 POST。再换板或移除后显式同名 PUT，保持同一项目 ID、revision +1、ETag 与 `sizeBytes` 匹配。逐次比较请求体与 GET 下载的 SHA-256，重启隔离 API 后用新页面打开，检查选中状态、块图、素材、模式和草稿正确、打开后 clean。 | 隔离项目 API 用临时数据目录，配合真实浏览器 |
| 旧包、未知 ID 与冲突 | 导入无 `cfzn/editor.json` 的兼容旧包，检查新文档无前一作品草稿；结构合法的未知 ID 包由隔离 API 逐字节保存，编辑器拒绝替换当前作品。按既有测试覆盖缺失或过期修订头、并发仅一笔成功、无效归档及提交失败后的原数据保留。实际 412 恢复路径保留本地编辑和服务器版本。 | 既有 `api.test.cjs` 与聚焦重开/冲突验收 |
| 交付边界 | 比对实际改动范围和发布包，项目 HTTP、后端依赖、项目 schema 及项目存储实现无新增变更。新增界面接入在 GUI/外部适配层；基线 VM 和 Blockly 模块逐字节一致。 | 源码与构建产物检查 |

设计核验为源码走查和已有验收记录对照。本轮未执行产品测试、访问实际串口、烧录或部署。

## 请主控冻结的决定

1. 依据桌面实证锁定本轮筛选项、标签、排序、默认状态与主控分组，并确认顶部入口和扩展库共用相同主控筛选口径。建议保留真实注册目录及原生“全部”。
2. 确认卡片状态采用现有“当前主控”“已添加”“已加载”语义。桌面下载、已安装包、收藏或远程目录如另有明确需求，需独立设计来源、获取和生命周期。
3. 若桌面换板有确认步骤，决定 CFZN 是否采用。建议确认界面只收集意图，最终执行仍由现有适配器校验，保留兼容模块和作品内容。现有 `docs/api-contract.md` 由主控继承或补充展示条款即可，项目 HTTP 和归档契约无需修订。
