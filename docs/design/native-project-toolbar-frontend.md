# 原生项目操作区域：前端设计

日期：2026-11-06。已按主控发布的 `docs/api-contract.md`「Native project toolbar addendum」收尾；发生差异以该附录为准。本轮仅写本文件，未开发、运行测试或操作服务。

## 1. 实施结论

删除父应用 `App.tsx` 的整个 `header.app-bar` 及专属样式，包括重复 CFZN 标识、项目标题和按钮。六个按钮与 `project-status` 由 **iframe 自身的 React 16** 渲染在真实 `gui_alerts-container_15BWp box_box_2jjDp` 内，放在原生 Alerts 列表之前。

只增加紧凑的原生操作控件，不复制白色 header、品牌区或第二个标题栏。原生 MenuBar、可编辑标题、Alerts 列表、主控/模块扩展全部保留。父 React 19 继续持有项目 API、active/revision、保存状态、notice/冲突处理以及项目/串口抽屉，避免重复业务逻辑。

新增桥接严格使用主控冻结的 **PROJECT_TOOLBAR_ACTION / PROJECT_TOOLBAR_STATE 两类消息**。导入沿用已有 IMPORT_REQUEST / IMPORT_ERROR。HTTP API、归档和匿名存储边界均不变。

## 2. 原生容器的实际结构

检查的是现有固定官方包 `openblock-gui@0.1.0-prerelease.20250611102354` 的 sourcemap，未运行网站。下文 GUI 路径指 sourcemap 中的 `webpack://GUI/./src/`。

| 源码位置 | 已确认的事实 |
| --- | --- |
| GUI `components/alerts/alerts.jsx:17–44` | 外层 Box 含一个 alertsInnerContainer，内部映射原 alertsList；可在内层前增加可选子节点 |
| GUI `containers/alerts.jsx:19–25` | 原列表经 filterPopupAlerts 过滤并由 Redux 关闭；不能把自有消息塞进去改变索引 |
| GUI `components/gui/gui.css` | 宿主 absolute、宽 100%、margin-top 53px、z-index 490、pointer-events none；原菜单高 3rem、z-index 491 |
| GUI `components/alerts/alerts.css` / `alert.css` | 原告警内层最大宽 548px，告警卡片自身恢复 pointer-events |
| GUI `components/gui/gui.jsx:169–174,208–213` | 普通编辑和 player 分支都可能渲染 Alerts，不能无条件在所有分支显示项目按钮 |
| GUI `components/gui/gui.css` | 原 body 高 calc(100% - 3rem)、标签行高 2.75rem；在 y=53 直接增加持久按钮会覆盖现有标签/舞台头部 |
| GUI `components/menu-bar/menu-bar.jsx:777–788` | 原标题输入存在，但菜单 overflow 时隐藏；窄屏需保留抽屉重命名入口 |
| `apps/web/src/openblock.ts:161–180` | chooseImport 已在 iframe 本地点击 input，读取后把字节传给父应用 |
| `apps/web/src/extensions/adapter.ts` | 已有 status/subscribe/assertIdle，可以显示本地禁用态，不改扩展加载链路 |
| `apps/web/scripts/openblock-hooks.mjs`、`prepare-openblock.mjs:22–27` | 有固定 hash、唯一片段校验和 integrationSha256 缓存失效；沿用现有补丁机制 |

主控实测：1440px 下指定容器 rect 为 `(0,53,1440,0)`，只含原 alerts inner。它当前是零高度覆盖层，没有为持久按钮预留空间。用户截图显示六按钮 DOM；本会话没有把截图或主控测量冒充自行完成的浏览器验收。

## 3. 精确布局和原生告警保留

目标结构：

```text
原 MenuBar（保留原项目标题）
原 AlertsComponent 外层 Box
  ├─ 项目  新建  导入  导出  保存  串口终端  project-status
  └─ 原 alertsInnerContainer / 原 alertsList.map（原样保留）
原 bodyWrapper（为操作控件预留实际高度）
```

- 操作顶边位于原菜单底部后 5px，默认 y=53；用 `calc(3rem + 5px)` 表达 iframe 内位置，不混用父应用的根字号。
- 六按钮与状态为一个透明 flex group，最大宽 52rem、左右至少 8px；按钮高约 2rem、间隔 4px。沿用原生字体、蓝色、浅色边界与控件圆角，只有保存适度强调；没有全宽白底、品牌或独立标题。
- group `flex-wrap:wrap`；窄屏保留六按钮并换行。不要假定原标签右侧和舞台左侧之间始终有足够空隙，也不要靠遮住绿旗来塞按钮。
- 在 group 的 React DOM ref 上用 ResizeObserver 得到高度 H；给 iframe 原 bodyWrapper 设置 `box-sizing:border-box; padding-block-start:H+10px`，保持原 `height:calc(100% - 3rem)`，内部 flex 继续填余下空间。默认 H=32px，预留约 42px；这是原 GUI 内部布局留白，不是增加一条 app-bar。
- 操作 group 不计入任何告警高度；原告警仍为临时覆盖层，不因每次告警出现而推挤工作区。宿主改为 column/align-items:center；原告警在操作下方间隔 6px，仍用原 548px 内层及原关闭/重连行为。
- 宿主保持 pointer-events:none；只有工具 group 和原具体告警恢复 pointer-events:auto。整块透明空白不能吞掉拖拽或舞台点击。
- 层级保持原 490，原菜单和模态优先。为空 alertsList、关闭最后一条告警仍保留工具。
- 普通编辑及上传模式显示；扩展库、设备库、其他原生模态、player-only、舞台全屏时隐藏工具，原告警按上游规则显示。模态期间保留上一次操作留白，避免底层反复跳动；player/fullscreen 可取消留白，退出再恢复。隐藏产生的零高度不应误覆盖最后有效测量。
- 不改造整套 OpenBlock 响应式，只验收新增控件在 1440/1024/768/390px 的换行、可见状态和无新增覆盖。原编辑器自身最小宽度约束仍属上游行为。

采用 `design-taste-frontend` 的现有单组件规则，保持周围原生设计。视觉结果由实现阶段真实截图确认。

## 4. React 集成点

为固定 bundle 的 `components/alerts/alerts.jsx` 增加一个可选 renderer 插槽，在原外层 Box 内、原 alertsInnerContainer 之前调用：

```ts
window.CFZNOpenBlock?.renderProjectTools(React16)
```

通过现有 `openblock-hooks.mjs` 精确补丁实现，保留 `renderLibrary`、device metadata/factory 钩子。新组件类型只创建一次，沿用 `extensions/library.ts` 的 React16 参数化 renderer 写法；不得 import 父应用 React19 来生成元素。原告警 children 和回调不改。

`openblock.ts` 在首次 GUI render 前建立本地 toolbar view-store。React16 工具组件订阅该 store、GUI mode/modals 与扩展 adapter；卸载清理订阅。状态下发只更新该组件，不重新 mount 编辑器/VM。

为宿主、工具 group、bodyWrapper 添加明确的稳定 `data-cfzn-*` 属性/ref。允许对自己定义的 DOM 读取尺寸、设置布局 CSS 变量或 focus；禁止重挂载节点、读 Fiber、改 React 私有对象、用散列类扫描并插入按钮。无需新依赖、第二个 React root 或完整 GUI 重构。

## 5. 六按钮、保存状态和标题

| 控件 | 实际行为 |
| --- | --- |
| 项目 | 发 projects 动作，父切换项目抽屉并执行现有 list；保留打开/重命名/删除/刷新 |
| 新建 | 发 new，父复用 newProject → confirmReplacement → NEW_PROJECT；保留未保存保护和 active 清除 |
| 导入 | iframe click 直接 chooseImport；选中后现有 IMPORT_REQUEST 交父校验、确认和 LOAD_PROJECT |
| 导出 | 发 export，父复用 EXPORT_PROJECT → download；导出当前完整编辑状态与素材，不清 dirty |
| 保存 | 发 save，父复用首次 POST / 后续 PUT 与必要的 rename、MARK_SAVED；保留版本冲突及部分成功语义 |
| 串口终端 | 发 serial，只切换父串口抽屉；不申请权限、不打开端口、不运行 Link/烧录 |

保留测试标识：`project-list-button`、`new-project`、`import-project`、`export-project`、`save-project`、`serial-button`、`project-status`，位置改为 iframe。项目/串口的 aria-expanded 来自父 drawer。按钮名称、焦点样式和键盘点击可用。

状态文案**只由 App 计算**：busy → 未 ready → dirty → active 已保存版本 → 未保存项目。对应文案保持“正在保存…”、“正在启动…”、“未保存的更改”、“已保存 · vN”、“未保存项目”。iframe 不自行宣布已保存，也不以本地扩展 label 改写父状态；扩展 busy 可额外暂禁操作，并继续依靠 assertIdle 保证导出/切换不会进入半注册状态。

保存完成要等 API 成功和 MARK_SAVED；保存期间新编辑保持 dirty。导出不改变保存状态；错误与 412 的父 notice/重新载入/另存为保留。按冻结契约，它们继续作为**父应用现有临时反馈**，不新增 iframe notice 协议或第二套冲突操作。

原生标题输入继续 `canEditTitle:true`，由其 blur/Enter 提交 Redux，watchStore 传播 dirty。新保存按钮不要在 mousedown 抢先发送导出；点击时应先完成原生输入 blur，再发 save。不得读取标题组件私有缓冲值。

菜单窄屏 overflow 会隐藏标题，因此在项目抽屉保留“当前项目：名称 / 重命名”入口，复用现有 renameProject，未保存项目也能改名；不增加第七个工具栏按钮。1–100 字符、trim 和既有 If-Match 行为不变。

## 6. 已冻结的桥接增量

封装仍是 `cfzn.openblock` / version 1，双向 origin/source 校验，既有请求 ID、RESPONSE、45 秒超时不变。

```ts
type ProjectToolbarAction = 'projects' | 'new' | 'export' | 'save' | 'serial';
// Child → parent: PROJECT_TOOLBAR_ACTION, { action }

interface ProjectToolbarState {
  statusText: string;
  statusKind: 'pending' | 'dirty' | 'saved' | 'unsaved';
  documentActionsDisabled: boolean;
  drawer: 'projects' | 'serial' | null;
}
// Parent → child: PROJECT_TOOLBAR_STATE, payload 如上
```

实现要求：

1. BridgeCallbacks 增加 onToolbarAction，严格校验五种枚举，然后交 App 现有操作函数；动作不带 projectId/revision/伪造的保存状态。
2. 增加单向状态发送方法；父在 READY 和相关 state 改变时发送全量 ProjectToolbarState。子收到后更新 view-store，不产生 CHANGED、不碰 VM/dirty。
3. 子默认 pending/disabled，状态更新不能重建 GUI。父 busyRef/readiness 仍作为最终执行守卫；子同步延迟期间连续点击保存不能重复 POST。
4. 导入已有 IMPORT_REQUEST/IMPORT_ERROR 不变；不存在“跨消息打开选择器”动作。
5. 仅增加上述两类消息，不新增反向 RPC、notice 字段或冲突动作枚举；布局和焦点增强不扩大桥协议。

父抽屉的布局/焦点不需要新增业务消息：如需跟随实际控件高度，可在同源 READY 后对上述**明确由本项目创建的 DOM**作只读测量/ResizeObserver；以工具底边+8px设抽屉顶部，保留右/下8px和原宽度。父只读取该 DOM 尺寸/可见性，不访问 GUI store 或 React 实例。原生工具因模态/全屏隐藏时，可据同一显式节点可见性关闭抽屉视图；不要卸载串口服务。

关闭抽屉时先 focus iframe，再通过同源公开 DOM 的稳定 testid/ref 对应按钮恢复焦点；若按钮不可见则不抢模态焦点。此处只作布局/焦点增强，不添加新桥接动作，不让 API 业务绕过消息通道。开发可选择等效的局部布局实现，验收以不覆盖原菜单/模态且焦点正确为准。

## 7. 用户手势与抽屉生命周期

**文件选择**：click/键盘激活中同步检查可用性后立即调用 chooseImport/input.click，不先 await GET_STATE/HTTP/父消息。选到文件后再进行父端未保存确认，取消选择不改变 active/dirty。input 清空 value 或重建以允许再选同一文件；可在 iframe 留稳定 file-input 测试目标。读取前检查 20 MiB，父继续校验类型/大小和完整归档。

文件选择器需要 transient activation；本方案不依赖异步消息之后还保留该状态。依据：[HTML 文件选择器算法](https://html.spec.whatwg.org/multipage/input.html#show-the-picker,-if-applicable)。

**串口授权**：串口终端工具按钮只展开抽屉；用户在父 SerialPanel 再点“连接串口”，现有 connect 在第一个 await 前调用 requestPort。不能由 PROJECT_TOOLBAR_ACTION 的 message handler、打开抽屉的 effect 或父状态同步自动申请权限。依据：[Chrome Web Serial](https://developer.chrome.com/docs/capabilities/serial)。

SerialPanel 继续始终挂载、用 hidden 切换。关闭抽屉、两个抽屉切换或原生模态打开不清日志、不卸载连接实例；仅现有断开/设备拔出/App卸载做释放。串口对象不跨 iframe，无需新增 iframe 串口授权配置。

打开抽屉将焦点给其标题/首控件；Escape 只处理父抽屉自身，不能抢原生模态的 Escape。保持现有非模态抽屉性质，不无依据新增 aria-modal 或全局焦点锁。

## 8. 修改范围和验收

建议实现范围仅 `apps/web/`：App/style 删除旧栏并保留抽屉；openblock/bridge/protocol 加两类消息；新增 React16 工具组件/局部样式；hooks 加原生插槽；README 更新桥协议。现有扩展目录、设备/模块注册和 VM 序列化不改。

必须验证：

- DOM：父无 app-bar；指定原生 Box 中只有一组六按钮、一个状态；原告警仍可显示/关闭/重连，无透明点击拦截。
- 布局：1440/1024/768/390px及缩放后按钮/状态可见，换行更新留白；不覆盖菜单、标签、绿旗或积木。全屏/扩展库打开后优先级和隐藏/恢复正确。
- 真实交互：六按钮逐一操作，原生文件 chooser、真实下载、首次/更新保存与重新打开均通过；只 setInputFiles 不足以证明文件选择手势。
- 保存：延迟保存中新增编辑、失败、412、PUT/PATCH 部分成功保持现有语义；不把旧快照/其他文档标为已保存；导出不清 dirty。
- 标题与焦点：原输入刚修改后点击保存使用新标题；窄屏未保存项目可经抽屉重命名；抽屉关闭回到原按钮，模态不被抢焦点。
- 串口：开抽屉 requestPort 为零；点击连接才申请。模拟读写/断开与关闭重开日志保持，实板结果另记。
- 桥接：陌生来源、未知动作、错误 payload 拒绝；READY/重新挂载后状态同步；保留父执行守卫。不要留父隐藏按钮应付旧测试，测试改用 frameLocator。
- 扩展回归：三主控六模块入口、真实积木/代码生成/完整恢复不受迁移影响；typecheck/build及相关前端验证通过。

设计阶段没有启动或停止任何服务，也未操作用户自行重启的 5173/3001。后续变更测试用隔离 API/存储；仅清理测试会话自己创建的服务，不能关闭用户现有进程。布局尚未由本会话运行验证，由开发/测试按以上清单和截图完成。
