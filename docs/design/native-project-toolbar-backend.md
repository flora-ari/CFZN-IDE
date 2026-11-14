# 原生项目工具栏迁移：后端与父子状态边界审查

日期：2026-11-06（Asia/Shanghai）。状态：设计提案，供主控统一；不修改公共契约。

## 1. 结论

此次只是六个现有入口与保存状态的显示位置迁移，**无需 HTTP API、Project 元数据、归档格式、revision/ETag 或 `apps/api/` 改动**。仍由父应用管理匿名本地项目，子 iframe 提供真实 OpenBlock 文档状态和归档。

建议将受控按钮和状态渲染到用户指定的原生 `gui_alerts-container_15BWp box_box_2jjDp` 区域，移除外层 app-bar。具体原生组件挂载位置由前端设计确认；不把现有 header 换一个外壳重新插入。保留原生告警，以及项目错误/冲突反馈和原有扩展功能。

## 2. 当前源码证据

下列路径相对 `F:/CFZN/CFZN-IDE`，行号对应本次检查版本。

| 位置 | 已存在的行为 | 迁移约束 |
| --- | --- | --- |
| `apps/web/src/App.tsx:76` | `action()` 用 busyRef 防止并发项目操作，统一错误与 412 冲突提示 | 子按钮须调用同一动作入口；仅在子界面禁用按钮不能替代父级检查 |
| `App.tsx:92–131` | 替换前 GET_STATE 检查 dirty；打开先读 metadata 再带 revision 取 content；导入先留在编辑器并清除 active | 不让子按钮直接调用 VM 绕过未保存保护和项目关联更新 |
| `App.tsx:137–165` | 保存先取得完整归档；已有项目 PUT，标题变化再 PATCH；新项目 POST；使用 archive.documentId 防止标记错误文档 | 真实服务器结果、文档身份和保存快照必须继续共同决定状态 |
| `App.tsx:159` | 成功后 MARK_SAVED 只确认导出时的 documentId/editVersion | 保存中产生的更晚编辑不能被标记为已保存 |
| `App.tsx:205` | 导出取得当前完整归档并下载，不调用 MARK_SAVED | 文件下载与保存到项目列表是两个不同动作 |
| `App.tsx:234–235` | status 来自 busy、snapshot.dirty、active.revision；新空项目即使 dirty=false 也显示未保存项目 | 不能仅凭 iframe 的 dirty=false 推断已经持久化 |
| `apps/web/src/openblock.ts:60,106` | snapshot 的 dirty 来自 editVersion 与 savedVersion；积木和扩展修改推进 editVersion | 继续使用该状态源，不从 DOM、按钮颜色或工具箱选择猜测 |
| `openblock.ts:183,235` | 加载及导出执行 extensions.assertIdle；加载失败有原项目备份恢复路径 | 迁移不绕过扩展忙碌、失败及恢复保护 |
| `openblock.ts:248` | MARK_SAVED 检查 documentId、整数版本及版本范围，返回真实 snapshot | 不让新工具栏自行清除 dirty 或伪造确认 |
| `apps/web/src/editor-bridge.ts:40`、`openblock.ts:272` | 双方校验 source、origin、protocol/version；现有请求有 requestId、超时和错误响应 | 新控制消息沿用这个桥接边界 |
| `apps/web/src/SerialPanel.tsx` | 父应用管理串口服务，抽屉连接按钮直接发起 Web Serial；隐藏抽屉不会卸载服务 | 六按钮中的串口终端只切换抽屉，不发起连接或后端请求 |

HTTP 依据为现有 `docs/api-contract.md`：POST/PUT 保存完整 `.ob`，PATCH 改名，修改带引号包裹的 If-Match，412 冲突不静默覆盖。没有新增用户、Python、SQL、OSS 或串口服务的理由。

## 3. 最小父子框架边界

### 权威状态归属

| 父应用 App 保留 | 子编辑器保留 |
| --- | --- |
| active / activeRef：服务器确认的 Project 和最新 revision | VM、GUI store、项目标题、documentId、editVersion、savedVersion |
| snapshot / snapshotRef：最近接收的 EditorSnapshot | dirty、运行状态和完整归档生成 |
| busy、notice、冲突处理、项目列表和 drawer | 主控/模块适配器及其加载、失败、恢复状态 |
| 所有 projectsApi 调用、导出下载、导入后的替换保护、串口终端 | 原生区域中按钮与 project-status 的显示；在原点击中选择导入文件 |

父应用是保存状态的唯一计算方。子工具栏只消费父级发来的显示值和可用性，不维护第二份 active/revision/saved 标志，不访问 API，不从 OpenBlock 原有云保存状态推导本机项目是否保存。

### 最少新增通信

沿用既有 `cfzn.openblock` / version 1 桥接，建议仅增加以下两个方向的语义，具体消息名、字段命名由前端设计与主控对齐后记入 `apps/web/README.md`：

1. **父 → 子：工具栏视图状态。** 内容只需父级算好的 status 文案/样式、四个文档动作是否禁用，以及当前 drawer（projects / serial / null）。如果错误提示也迁入原生区域，发送现有 notice 的显示内容及冲突操作可用性；不为此创建新的后端状态。
2. **子 → 父：项目操作意图。** 五种普通意图为项目列表切换、新建、导出、保存、串口抽屉切换；由父级调用现有函数。按钮发出意图不表示操作已成功，busy、成功、失败以父级后续状态为准。父级继续校验合法动作并使用自己的 activeRef/snapshotRef/busyRef，子级不提交 projectId、revision 或“已保存”断言。

**导入复用既有文件消息，无需再建一套二进制协议。** 在子工具栏真实点击中复用 `chooseImport()` 选文件，仍发 `IMPORT_REQUEST {bytes,name}` / `IMPORT_ERROR`；父级继续执行 `importProject()` 的后缀、大小、未保存保护和 LOAD_PROJECT。不要让点击先跨异步消息、再回父级触发一个已随 header 删除的 file input。选完文件时父级若已 busy，仍按现有动作检查处理，不绕开互斥。

初次 READY 后父级推送当前工具栏视图；busy/snapshot/active/drawer/相关 notice 改变时再推送。尚未收到父状态时显示正在启动并禁用文档动作，不能默认显示已保存。工具栏的重新渲染不得重新创建 VM 或覆盖已有 `CFZNOpenBlock.renderLibrary` 扩展入口。

### 六按钮动作映射

| 按钮 | 实际处理 | 持久化影响 |
| --- | --- | --- |
| 项目 | 父级切换项目列表抽屉，按现有行为刷新列表 | GET 列表；无保存确认 |
| 新建 | 父级 action → GET_STATE/放弃更改确认 → NEW_PROJECT → active=null | 不立即 POST |
| 导入 | 子级选择文件 → IMPORT_REQUEST → 父级 importProject | 导入为未保存文档，不立即创建服务器项目 |
| 导出 | 父级 exportProject → EXPORT_PROJECT → download | 不更新 active/revision/dirty，不调用 MARK_SAVED |
| 保存 | 父级 saveProject → EXPORT_PROJECT → POST 或 PUT/必要 PATCH → MARK_SAVED | 由完整成功链路更新状态 |
| 串口终端 | 父级切换 SerialPanel 可见性 | 无项目保存或串口 HTTP 请求；连接仍由终端中的真实点击发起 |

继续按现有规则禁用新建/导入/导出/保存：父级 busy 或编辑器未就绪时不可用。项目/串口只是抽屉切换，不必因一次保存而扩大禁用范围。重命名继续通过原生标题或已有项目列表入口完成，不因删除外层标题按钮而增加第七个项目操作。

## 4. 保存状态的判定与边界

无操作错误时沿用当前优先级：`busy → 未就绪 → snapshot.dirty → active.revision → 无 active`。**revision 是服务器版本，editVersion 是当前编辑过程的版本计数，二者不能比较或相互赋值。**

| 条件或结果 | 应有状态与动作 |
| --- | --- |
| 未 READY | 正在启动；收到 BOOT_ERROR 时保留明确启动错误，不伪装为就绪 |
| action 未结束 | 正在保存/导入/导出/打开等实际动作；请求发出、归档导出完成均不是保存成功 |
| active=null，dirty=false | 未保存项目，例如新默认项目；没有本机持久化记录 |
| dirty=true，无论 active 是否存在 | 未保存的更改；active.revision 仅代表此前已确认版本 |
| active 存在且当前 snapshot.dirty=false | 已保存 · vN；active 必须仍关联当前 documentId |
| 导入成功 | active=null、dirty=true，提示保存后才进入项目列表 |
| 导出成功 | 可以提示“已导出”；主保存状态仍由原 active/snapshot 决定 |
| 删除当前已存项目 | active=null；当前编辑内容仍在，后续保存为 POST，不能继续显示旧 vN 已保存 |

**保存中继续编辑：** 假设导出 `{documentId:D, editVersion:10}` 后用户编辑到 11，POST/PUT 成功只能确认 D/10。MARK_SAVED 返回 dirty=true，状态仍为未保存的更改，可提示“已保存较早版本，后续编辑仍未保存”。状态必须根据最新接收的 snapshot 推导，不能让一次成功 notice 覆盖随后到达的 CHANGED。

**保存期间文档已替换：** 旧文档的保存响应可更新列表，但不得把新文档绑定到旧项目或清空新文档 dirty。保留现有 documentId/keepCurrent 检查；请求完成不是忽略文档身份的理由。

**PUT 成功、后续改名 PATCH 失败：** 当前 App 已在 PUT 成功后保存新的 active/revision，并在 PATCH 前更新列表。这是真实部分成功，应保留新 revision；PATCH 未成功时不调用 MARK_SAVED，展示失败并保留未完成编辑。一次保存可能递增两次 revision，工具栏使用实际响应值，不自行 `revision + 1`。

**MARK_SAVED 失败或超时：** 服务器已经确认的 Project/revision 可保留，但不能伪造编辑器清洁状态。显示确认失败，保持真实 dirty；不因此自动重做 POST 或盲目覆盖。

**保存请求失败：** 不执行 MARK_SAVED，不清除当前编辑，不伪造 revision。网络错误可能无法确认服务器是否已提交，文案应表达本次保存失败/结果未确认，不武断声称服务器绝未落盘。现有实现没有自动重试，迁移不添加隐藏重试。

**412 冲突：** 保留当前编辑与已知 revision，继续显示“重新载入 / 另存为新项目”两个现有处理入口；重新载入仍走未保存保护，另存为新项目走 POST。不能从列表偷偷取新 revision 后自动 PUT。

当前 App 把错误放在 notice，project-status 的公式本身不含错误。迁移必须同时保留可见错误反馈：有未保存编辑时，错误不能被“已保存”样式覆盖；若没有新编辑但一次重复保存失败，可以保留此前版本的已保存事实，同时明确本次操作失败。若前端将错误并入 project-status，其来源仍是父级本次操作结果，不能把项目列表或串口错误错误归类为保存失败。不得仅迁移状态文字而丢失 notice 和冲突操作。

主控/模块变化继续由现有适配器推进 editVersion。扩展加载中 EXPORT_PROJECT 的 assertIdle 会拒绝操作，父级应显示该忙碌原因，不发送半完成归档；加载成功后正常保存。不修改扩展的状态机、归档字段或兼容规则。

## 5. 交付与后续核查

本次后端开发增量为零。由前端实现受控原生按钮、最小桥接与父状态投影；主控只需冻结挂载方式及内部通信约定，HTTP v0.1 保持不变。

后续测试应针对迁移行为核查：

- 新空项目、导入项目、成功打开已存项目的状态分别正确；六按钮各自只触发现有一条动作链。
- 保存中延迟 API 响应并继续改积木/标题/模块，响应后仍显示未保存更改；成功后版本来自真实响应。
- 导出带未保存内容的项目，下载成功但 dirty 不变、不触发 POST/PUT/PATCH、不执行 MARK_SAVED。
- API 不可达、412、PUT 成功后 PATCH 失败、编辑器确认失败时均显示真实反馈；冲突处理入口仍可用。
- 原生文件入口、导入未保存保护、项目列表、串口抽屉及已有主控/模块功能保持；原生告警仍能显示，不因工具栏替换消失。

本轮仅静态阅读并写入此文档；未修改业务代码或公共契约，未启动、停止服务，未运行测试或硬件操作。后续若独立验证需要临时服务，由执行者清理其自行创建的进程，不影响用户既有服务。
