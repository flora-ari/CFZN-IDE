# 扩展库 v0.6：移除事务与后端边界建议

日期：2026-11-11（Asia/Shanghai）。角色：后端接口设计。状态：提交主控对齐，尚未修改公共契约或产品实现。依据为当前 Toolbox v0.5、现有自有适配层及固定上游源码的只读核对。

## 1. 结论

**后端、HTTP、项目格式和依赖均无需改动。** 选中、取消选中、类型筛选与兼容提示属于前端 catalog/adapter/UI；3001 仍存完整 `.ob`，3002 编译/上传与唯一 HardwareSession 不变。

建议采用以下移除规则：

| 操作 | 允许条件 | 阻止时的行为 |
| --- | --- | --- |
| 移除模块 | 已加载、无该模块积木/监视器引用、无冲突操作 | 保留选中与原项目；说明引用位置/数量或忙原因 |
| 取消当前主控 | 无设备积木/监视器/上传启动块引用，且已加载模块为空；串口已释放 | 保留当前主控；提示先处理引用、逐个移除模块或断开串口 |
| 切换主控 | 沿用现有目标板能力/引脚/模块兼容检查 | 不自动删除不兼容块、改引脚或连带卸载模块 |
| 重复移除已不存在的内置项 | 无操作 | 不产生额外 dirty；过期的主控移除请求不得清除新主控 |

移除不是“删除依赖积木”的确认流程。本轮不提供级联删除或静默改写源码。独立移除按钮/再次点击选中项的具体交互由前端设计定稿，二者只能调用相同的受检命令。

## 2. 当前实现与原生 API 的实际行为

| 位置/方法 | 核实结果 |
| --- | --- |
| adapter.currentDevice / loaded | 来自 runtime.getDevice().deviceId / getLoadedDeviceExtension，适合做唯一选中依据；代码缓存和 presentation 缓存不是选中状态 |
| adapter 包装的 manager.unloadDeviceExtension | 已检查部分模块 opcode 使用并调用 rawUnload，然后 changed；目前没有完整异步备份/完成验证/回滚事务，也未检查独立监视器引用 |
| 原生 manager.unloadDeviceExtension(id) | runtime.removeDeviceExtension(id)，再 emit DEVICE_EXTENSION_REMOVED；删除运行时模块记录并通知 GUI，不自动删除 Blockly 定义/Arduino 函数缓存 |
| ToolboxPresentation | moduleXML 按 ID 缓存，compose 以实际 loaded IDs 决定展示；仅需增加单模块失效/重绘辅助，不应为移除一个模块 reset 所有主控/模块呈现 |
| 原生 manager.loadDeviceURL({deviceId:'null'}) | 进入 manager.clearDevice，不注册一个名为 null 的板卡 |
| 原生 manager.clearDevice | 断开原设备，runtime.clearDevice、clearMonitor、清主控注册、舞台扩展与设备模块，发 SCRATCH_EXTENSION_REMOVED |
| 原生 runtime.clearDevice | 空身份为 `{deviceId:null,type:null,pnpIdList:[]}`，不是字符串 `'null'` |
| 原生 GUI handleScratchExtensionRemoved | 同步空设备 UI，并主动 setRealtimeMode(true)；取消主控后保留用户原模式需要外部事务处理 |
| 当前自有 selectController | `'null'` 最后仍进入 deviceReady(id)，但 native 清空后 Redux ID 为真正 null；等待字符串 `'null'` 会不满足条件，不能直接复用普通选板完成检查 |

上述原生行为来自固定 tarball sourcemap 的只读源码：extension-manager.js 的 loadDeviceURL/clearDevice/unloadDeviceExtension，runtime.js 的 clearDevice/clearMonitor，以及 virtual-machine.js 的 clear/deserializeProject/installDevice。没有修改 VM。

原生 clearMonitor 不仅清显示状态，还取消监视块并调用各 target.deleteMonitors。只保存/回写 getMonitorState 的 Map 不足以保证完整恢复。因此不能把一行 rawDevice('null') 或 runtime.setDevice(empty) 当作完整、无损的主控移除实现。

## 3. 引用检查与 UI 状态

建议给 adapter 增加纯查询 removalState，用于卡片禁用与原因；真正执行前在锁内再次检查，不能信任打开弹窗时缓存的结论。

- 模块按 catalog 的完整 opcodes 检查所有原始 target（舞台和全部角色），包括非当前角色、游离/禁用/未连接块、自定义过程中的块与 shadow。未执行到不等于未引用。当前六模块没有可依赖命名正则准确推断的“手写源码依赖表”。
- 同时只读核对 runtime.getMonitorState() 的实际 watcher 记录与 runtime.monitorBlocks 中仍被监视的块；即使 workspace 中已无相应 reporter，仍不能留下失去实现的监视器。检查可见 watcher，也保留已经存入项目的隐藏 watcher 依赖；普通未启用的 monitorBlocks 缓存条目不自动算作用户引用。临时 clone 不重复计数，原始项目引用仍是阻止依据。
- 清主控沿用五板的 Arduino 命名空间及实际设备描述检查，特别纳入非 `arduino_` 前缀的 `event_whenarduinobegin`、设备菜单 shadow 和设备监视器。现有 assertControllerCompatible(..., targetType:null, emptyCapabilities) 可作为五板前置检查基础，不能只查当前可见类别。
- 清主控只要还有任一 committed deviceExtensions 就阻止，即使模块未放积木；否则会与当前“模块必须关联兼容主控”的恢复契约冲突。让用户逐个显式移除；不把注释模块或“所有板都兼容”解释成可以脱离主控。
- 手动草稿可含任意 C++，本轮不靠正则扫描函数名伪称能证明无依赖。成功移除时逐字保留 manualSource 与 codeMode，提示手动草稿未改写、需重新编译核对；清主控后没有编译目标，上传/编译继续由已有主控/profile 守卫阻止。
- 引用阻止时显示具体理由，例如“角色 A 仍有 2 个雾化模块积木”“先移除已加载的雾化模块、积木注释”。移除失败/被阻止不得让卡片先变未选中。

事实范围：现有六模块 vendor 注册代码未出现 watcher/requestAddMonitor/monitorBlocks 创建路径，自有 registerModule 仅注册 Blockly 定义/生成器/翻译和 toolbox；部分 Uno 原生 reporter 明确 disableMonitor。不能因此漏检已有项目的真实硬件 watcher，也不用为本轮不存在的独立模块 watcher 新建注册表或机制。复用实际 monitorState/monitorBlocks 检查即可，不改写其私有数据结构。

兼容提示与选中状态独立：已选模块来自 loaded，当前主控来自规范化 deviceId；右上灰矩形“兼容当前主控”“未选择主控”“不兼容当前主控”只表达 catalog 兼容性，不代表能连接、工具已安装或固件实时可用。无主控时展示模块可用性原因，并禁用添加；不要把“未选择主控”当成一种模块类型。

类型筛选使用明确稳定的 catalog 字段/受控 tag，组合关系为当前库分区 ∩ 类型 ∩ 搜索 ∩ 兼容筛选。现有模块 tags 的 actuator/sensor/other 可映射为类型，extensionId tag 不能充当类型。主控类型由前端维护的真实 metadata 映射，不能依赖当前 3002 是否可达或 capability 返回哪些板。标签文案可本地化，筛选键保持稳定；浏览、筛选、hover、locale 变动均不改项目 dirty。

## 4. 最小外部 adapter 接口建议

以下仅供前端内部对齐，不是新 HTTP/schema；继续使用 existing currentDevice、loaded、status 和 subscribe：

```ts
type RemovalTarget =
  | { kind: 'module'; id: string }
  | { kind: 'controller'; id: string }; // 当前规范 deviceId
interface RemovalState {
  selected: boolean;
  allowed: boolean;
  reason?: 'busy' | 'in-use' | 'modules-loaded' | 'serial-owned' | 'unsupported' | 'stale';
  references?: { targetName: string; count: number }[];
  dependentModuleIds?: string[];
}
removalState(target: RemovalTarget): RemovalState;
removeModule(id: string): Promise<void>;
clearController(expectedDeviceId: string): Promise<void>;
```

reason 到当前语言文案由 UI 映射，运行失败继续走现有 adapter.status.error。已知但未加载模块的 remove 为 no-op；未知 ID 拒绝。clearController 必须核对 expectedDeviceId 与执行时实际主控，避免卡片事件延迟后删除另一块主控。

已有 manager.unloadDeviceExtension 外部包装也收敛到 removeModule；在 restoring/internal 原生清理期间仍调用捕获的 rawUnload，避免递归事务。library 的移除回调必须 await 真正完成，不能只将 isUnloadble 打开后直接调用未经保护的 native 方法。舞台扩展移除不属于本轮新增范围，保留其既有行为。

ToolboxPresentation 建议仅补 `removeModule(id)` 或等价失效方法；controller 清空/项目恢复时使用已有 reset 并等待新 compose。presentation 不是第二个已加载记录。保留成功的静态 loader 函数缓存以支持再次加入；重新加入仍调用注册函数重绑当前板/locale，不能因函数缓存而跳过注册。

## 5. 模块移除事务

建议把当前同步 wrapper 升级为已有 transaction 的受检异步操作：

1. 检查模块身份/引用与项目、扩展、模式、硬件作业、串口操作忙状态。已无该模块则直接结束；有引用就在生成备份/stopAll/rawUnload 之前拒绝。
2. 取得同一扩展忙锁，在提交前重查引用和文档状态。备份完整归档，包含 cfzn/editor.json；保留原模式、当前 locale 和 dirty/文档版本语义。
3. 调捕获的原生 rawUnload(id)，失效该模块 presentation 并重建实际 toolbox。等待 runtime loaded ID 消失、目标 category 消失；其他模块和主控类别保持原状态，移除的分类若原来选中则回退到可用分类。
4. 确认实际积木/素材/手动草稿未被改写后，作为一次编辑提交 dirty。无需主动删除全局 Blockly.Blocks/Arduino 函数；原生 API 本来只撤销加载记录，删除共享缓存可能影响其他注册/恢复。
5. 任一步失败恢复完整原归档并等待实际注册/工作区恢复；失败不报告移除成功，不产生额外 dirty。原本未保存的更改仍未保存。回滚也失败沿用 recovery 文件及锁定冲突操作的现有路径。

注册/卸载内部产生的 PROJECT_CHANGED、locale toolbox 更新不能再重复增加 editVersion；整个事务成功只产生一次明确编辑。不要用 MARK_SAVED、项目 API 保存或增加 revision 来“提交”前端移除。

## 6. 主控清空：保留整个文档的专用事务

推荐**派生完整候选归档，复用既有 vm.loadProject 生命周期**，比直接 clearDevice 后手动补齐其清掉的舞台扩展/监视器更可靠。沿用现有 fflate/归档帮助层，不新增依赖或格式。

1. 必须已无模块和主控引用。另检查 HardwareSession 是否实际持有端口，包括 error 但关闭未确认的句柄；有则阻止并提示先在连接弹窗明确断开，不能把取消主控藏成隐式断开操作。由 openblock 外层基于现有公开 portId/sessionId、session.operation 和硬件状态注入 `clearBlockedReason()` 即可；关闭失败现有公开 ID 仍保留，无需读取私有 port 或新增 owner。硬件/串口过渡、活动协议或作业未知结果也阻止。
2. 在同一事务中取得完整原归档作为 rollback。外部归档帮助层仅把候选 project.json.device 改为规范空身份 `{deviceId:null,type:null,pnpIdList:[]}`；deviceExtensions 已经为空，不实施级联删除。保留 targets/blocks、舞台 extensions、monitors、素材、原 programMode 和 cfzn/editor.json，不用空白项目替换当前作品。
3. 调现有 vm.loadProject(candidate)，在这个内部操作内完成原生清理与完整恢复。固定 VM 的 clear() 会调用 extensionManager.clearDevice；新文档空身份不会注册一个 `'null'` 设备。现有 deserializeProject/installTargets/原生 sb3 导入路径重新安装舞台扩展、targets/monitors，并由外部 metadata 恢复草稿；不用修改 VM 方法体，也不手写 _monitorState 或目标监视块结构。
4. 原生空主控 installDevice 不负责恢复 programMode，GUI removal event 还可能强制 realtime，所以事务最终显式恢复捕获的用户模式，并等待 GUI 同步。该内部变化不另计编辑，不发送串口配置/握手，不重新开始舞台执行。
5. 清空完成检查使用真实 null 身份、Redux 空设备、原生加载状态/菜单和 presentation 的清空结果，**不调用 deviceReady('null')**。确认舞台扩展、监视器、所有用户块与素材、manualSource/codeMode仍在；不把缓存里残留的旧 pin menu 当成当前主控。
6. 仅成功后提交一次 dirty；失败使用原完整归档回滚并保持原项目身份、模式和未保存状态。此内部重载不改父层 activeProject/revision，不增加 documentId 来冒充用户打开了另一个作品。

`'null'` 是上游设备选择命令；真正运行时空身份是 JavaScript null。旧归档的 `'null'`、空设备对象和当前空身份在外部读取边界统一识别为“无主控”，不能传入普通设备兼容描述或产生 null profile；新写出使用原生规范空对象。只调用 runtime.setDevice(empty) 无法清理 manager/GUI，不采用此捷径。

完整候选归档方案的实际状态保留必须由开发后的 fresh-context round-trip 验证，包含变量/列表监视器、舞台扩展 reporter、用户自定义过程参数与素材；本轮没有运行此实现。若任何引用/资源无法验证安全恢复，应失败并保留备份，而不是删掉监视器或跳过未知实现后宣称清空成功。本轮不需要级联移除任何模块；已有模块即阻止清主控，用户逐项处理即可。

## 7. 模式、locale、忙状态与唯一串口会话

保留 v0.5 的编程/上传模式和 stage-execution 守卫。移除、过滤和灰提示不改变硬件协议能力；无主控时不再渲染旧板类别，移除模块后不再展示其类别，也不遗留能误运行的“已选中”标记。

扩展事务与项目加载/导入/保存快照、ModeController.transitioning、硬件 busy/cancelling、session.operation 使用一致守卫。移除过程中禁止并行卡片操作、模式切换、清空/新建或 locale 重建；命令本身检查，而不是只禁用按钮。未结束的写入/关闭不能因 UI 重新渲染就被遗忘。

普通文本连接下移除无引用模块无需改变端口配置；主控清空要求先释放连接。既有失败回滚可能重建原生外围设备，若实际连接因此被关闭必须显示真实断开及恢复结果，不能伪造仍连接、重新授权或开第二个 owner。保留同一个 HardwareSession/controller；GUI 因 locale 重挂载时使用既有 bindVm 幂等保护，不重新创建会话或订阅。

locale 更新只重建可计算的 category 文案/缓存，不重新选板/加载/移除，也不清手动草稿。成功后使用当前 locale 重绘，回滚不把项目里历史语言当应用语言。状态/类型文案可翻译，canonical ID、opcode、参数、categoryId 与筛选键不随语言变化。

## 8. 后端与验收边界

归档 API 继续验证结构/素材并原样存储，不新增模块卸载或主控清空端点，也不根据网站 catalog 删除/拒绝合法项目内容。项目仍为原生 device/programMode/extensions/deviceExtensions/targets/素材与 cfzn/editor.json；不加入 selected/removal/filter 状态字段、函数对象或串口信息。HTTP、匿名存储、硬件 profiles 与依赖均零实施改动。

开发后由主控派测试，建议最少覆盖：

1. 未使用模块可移除并重新加入；stage/另一角色/游离/禁用块/过程定义/监视器中有引用时准确阻止，卡片和原块不变。
2. 已加载但无积木的模块也阻止主控清空；全部显式移除后，纯舞台项目可清主控，pen/music 等舞台扩展、监视器、素材、块连接与参数保留。
3. `'null'` 命令与 JS null 空身份正确，无假加载 ID、超时或旧板 category；重复操作/过期主控卡片命令不会改错对象。
4. 成功一次 dirty，失败/no-op/筛选/locale 不新增 dirty；原有 dirty、手动草稿/codeMode、两种 programMode 经成功、故障回滚及 fresh-context 保存重开均保留。
5. busy、关闭失败仍占有端口、模式/locale 过渡拒绝冲突；一个 VM/HardwareSession；用明确 mock 验证，不操作 COM3。
6. 类型/搜索/兼容筛选真实交集，空结果和无主控提示正确；选中取运行时提交结果，移除入口键盘可用，灰提示不覆盖选中含义。
7. 验证固定 VM 模块字节未改；项目归档实际 POST/GET 字节保持即可，不为零后端改动重复无关全套回归。

本轮仅新增本文件；未改公共契约、产品或依赖，未启动服务、运行测试或操作硬件。等待主控冻结后续开发范围。
