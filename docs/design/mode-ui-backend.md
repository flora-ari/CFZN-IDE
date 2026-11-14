# 双模式界面：后端与项目保存边界建议

日期：2026-11-10（Asia/Shanghai）。角色：后端接口设计。状态：提交主控对齐；HTTP 沿用 Hardware v0.2，本文不自行冻结项目格式补充。

## 1. 结论与范围

**现有后端足以承接主控高亮、编程/上传双按钮、生成/手动代码、上传按钮和串口终端，无需新增 HTTP 接口或后端模式字段。** 界面共用已有 HardwareController 与 iframe Web Serial 会话，编译上传仍使用本地 3002；项目仍以完整 `.ob` 归档交给 3001 保存。

需要主控补充冻结的是前端模式语义，以及手动代码的归档/脏状态约束。当前保存路径直接调用 `vm.saveProjectSb3()`；固定上游 VM 保存 `programMode`，但不包含 GUI Redux 的 `codeEditorValue` 或 `isCodeEditorLocked`。因此“能上传手写代码”不等于“保存后能恢复手写代码”，不能以既有积木归档测试代替该验收。

本轮仅只读核对契约、现有实现与固定上游 sourcemap，只新增本文件。未改实现、启动服务、调用硬件接口或操作 COM3；不修改 openblock-vm 源码及其打包代码，不递归委派。

## 2. 已有能力核对

| 需求 | 现有边界/实现 | 本轮结论 |
| --- | --- | --- |
| 主控选中高亮 | ExtensionAdapter.currentDevice() / 原生 VM 的已提交 device；库已计算 isLoaded | 前端使用实际选中 deviceId；不新增后端选中状态 |
| 主控与 profile | `/capabilities` 按 deviceId 返回 profile 及 compile/upload/realtime 能力；controller 已按设备过滤 | 选择主控与选择编译 profile 分开；工具缺失不能清除主控高亮 |
| 生成/手动代码 | HardwareController 从当前 codeEditorValue 捕获源码，`/builds` 接收 code | 后端无需 codeMode 字段，编译两者的实际字符串 |
| 编译与上传 | `/builds` → `/jobs/:id`；成功后 `/uploads {buildId,portId}`；支持取消 | 直接复用同一 controller；新按钮不直接发送独立上传请求 |
| 串口终端 | iframe HardwareSession 是唯一 Web Serial owner，父终端/原生控制台共享收发 | 新面板订阅同一会话和日志，不能新建第二个 SerialPort owner |
| 项目保存 | 后端校验 ZIP/project.json/素材后，存储完整原始归档字节；不白名单过滤额外条目 | 经主控冻结的归档附加条目可原样保存，无需改数据库或项目 API |

能力是登记与依赖检查结果，真实编译/上传结果来自 job；高亮、串口 open、实时握手和上传成功各表示不同状态。不能把缺少本地执行器解释为浏览器串口不可用。

## 3. 双模式建议

建议前端明确区分三件事，名称由主控与前端设计统一：

| 状态 | 含义 | 与保存/硬件的关系 |
| --- | --- | --- |
| workspaceView：programming / upload | 双按钮选中的界面布局；编程显示原舞台/角色，上传显示代码/上传/终端 | 建议为会话内视图偏好，单纯切换不修改归档、不产生 dirty、不发 HTTP |
| 原生 programMode：realtime / upload | VM 的执行与积木能力模式，已在 project.json 内持久化 | 仅经已有适配入口、设备支持检查后修改；实际修改按项目编辑处理 |
| codeMode：generated / manual | 当前上传源码来自积木生成还是手动草稿 | 决定下一次编译输入；建议随手动草稿在归档内持久化 |

**“编程模式”显示舞台不代表已经获得实时硬件能力。** 不因点击该按钮就对上传型 ESP32 调用 `setRealtimeMode(true)`，也不更换主控、清空模块/积木或恢复固件。若界面进入上传视图且原生仍为 realtime，编译/上传前通过现有支持检查明确切换 VM 上传模式，成功后才开放操作；不能仅用 CSS 隐藏舞台便宣称模式切换成功。

原生 `programMode` 与界面布局可以不同；普通 ESP32 在编程视图中仍保持其已支持的上传型设备能力。保留真正舞台积木运行，硬件积木按其实际支持模式处理；本轮不新增或假称 ESP32 实时协议。若主控决定双按钮本身必须切换 VM 模式，则需明确不支持该模式的板卡处理，不能把两种状态未经约束地一一映射。

纯布局切换保留代码草稿、设备、模块及已打开的串口会话。隐藏终端不自动断开；不能卸载唯一会话/controller 导致丢失 job。硬件作业处于 busy/cancelling、串口正在 opening/closing 时，建议阻止模式/主控切换，沿用现有忙状态提示；允许在原界面取消并等到真实结束。项目恢复和新建期间不触发连接或上传。

主控卡片的选中样式、aria-pressed 等以 `currentDevice()` 的已提交结果为准；再次选中幂等。切换失败仍显示原主控，并给出错误。不要从鼠标焦点、最后点击、OS 端口、上传 profile 或临时 loading 状态推导选中项。

## 4. 手动代码与完整项目保存

### 当前缺口的代码证据

- `apps/web/src/openblock.ts` 的 EXPORT_PROJECT、加载前备份和默认项目快照使用 `vm.saveProjectSb3()`；editVersion 当前主要来自 VM PROJECT_CHANGED、标题和扩展事务，未覆盖手动代码输入。
- 固定 GUI `src/reducers/code.js` 仅在 GUI state 维护代码和锁定状态；`src/containers/hardware.jsx` 的编辑处理更新该 state。手动代码不是 VM blocks。
- 固定 VM `src/serialization/sb3.js` 序列化 device、programMode、extensions、deviceExtensions、targets 与素材等，未序列化上述 GUI 代码状态。本轮只读取该源，没有修改。

### 提交主控的最小归档补充

建议由**外部归档适配层**在原生完整 `.ob` ZIP 中加入单个版本化条目 `cfzn/editor.json`，只保存新引入的代码编辑状态：

```json
{
  "version": 1,
  "codeMode": "manual",
  "manualSource": "void setup() {}\nvoid loop() {}\n"
}
```

`codeMode` 为 generated/manual；manualSource 为可选手动草稿。切回生成代码可保留草稿供用户再次进入手动模式恢复。生成代码始终由真实积木和当前设备生成，不把它作为第二份权威积木数据保存。device、programMode、模块与素材仍使用原生字段；附加条目不重复这些状态，不新增旁路文件、外部存储或 localStorage 才能恢复的依赖。

该条目是本需求新增的项目内容，必须由主控在契约中明确批准后实施；并非将旧模块扩展状态改存 sidecar。建议布局偏好不写入条目，避免仅切换显示就使项目变脏。如用户后续要求恢复上次布局，再单独冻结其持久化语义。

保存/导出采用统一 `captureProjectArchive` 外部帮助层：先捕获 documentId/editVersion 与代码草稿，再取得原生完整归档并附加该条目；若异步序列化期间内容变化，应重试或明确失败，不能给混合内容贴旧版本号。不得通过替换 VM 序列化源码实现。现有父层仍 POST/PUT 完整归档，API 成功后只 MARK_SAVED 相应快照，后来的手动输入继续显示未保存。

加载在破坏当前文档前解析、检查条目版本/字段、manualSource 类型与 UTF-8 1 MiB 源码上限；与 VM 归档加载、扩展恢复一起构成一次操作。恢复代码草稿和 codeMode 后再结束 loading/计算干净状态；生成器不能随后覆盖已恢复的手动草稿。无条目的历史 `.ob`/`.sb3` 默认 generated，清除上一项目草稿；损坏或无法支持的代码条目应明确加载失败并保留原文档，不能静默丢弃手动代码。

加载失败回滚、扩展切换失败的恢复备份、新建、导入、保存、导出都必须覆盖这份草稿，不能仅调整工具栏的导出路径。若下层恢复机制暂不能带附加条目，也必须由外部事务保留同一份内存草稿并恢复，不能修改 VM 实现。

手动代码输入、草稿被用户替换、codeMode 改变均推进 editVersion 并标 dirty；加载/恢复不当作用户编辑。生成视图自动刷新不额外制造一次编辑，积木自身已有 dirty。从手动模式返回生成模式不反向把 C++ 转为积木，也不悄悄删除草稿。切换主控若将使草稿对应目标发生变化，需显式处理保留/替换，由前端提案约定，不能自动拿旧目标的手写程序上传新主控。

编译、上传成功、终端收发、连接/断开、日志清空、纯视图高亮均不 MARK_SAVED、不修改项目 revision。COM 路径、SerialPort/sessionId、jobId、工具绝对路径、日志和编译产物不写入项目。

## 5. 上传流程与 HTTP 保持

后端保持 Hardware v0.2 的精确输入：`POST /builds {deviceId,profileId,code,moduleIds?}` 与 `POST /uploads {buildId,portId}`。不新增 mode、codeMode、projectId、revision、documentId/editVersion、releaseId 或浏览器端口字段；当前后端会拒绝未登记字段。

生成代码与手动代码都只传入当前选定来源的一次源码快照。controller 在编译后再次检查源码、设备、profile 与文档版本，变化则要求重编译。新“上传”按钮仍执行：编译 → 真实 job 日志 → 检查快照 → 用户已明确选择的本机 OS 端口 → 停止硬件交互并等待 Web Serial 关闭成功 → POST 上传 → 等待真实终态/释放 → 按原规则恢复串口。生成/手动来源切换也不能绕过此检查。

编译期间修改代码草稿可以继续保留，但不能悄悄上传已过期产物。上传进行中编辑相关来源/切板行为由同一忙锁控制；UI 关闭或切换面板不代表取消，取消需现有 `/jobs/:id/cancel` 并等进程退出。状态查询中断或上传提交结果未知时不能仅因界面换了模式便释放串口占用。

3001 继续是匿名项目服务，3002 继续是用户电脑的本地执行器。未来项目 API 在云端时，浏览器仍连接显式本地 hardware URL；不让远程服务枚举或打开用户 COM 端口。浏览器串口标识不能靠 VID/PID 自动映射成 COM3；新上传区域仍保留明确的 OS 端口/profile 选择及不可用原因。

## 6. 主控冻结与验收建议

建议主控冻结两项前端约束即可：双按钮是布局视图还是实际 VM 模式（推荐上述布局分离）；手动草稿/代码来源的归档条目及完整事务路径。HTTP、项目元数据和匿名存储不需改动，也不需为此启动后端业务开发。

本轮验收重点：

1. 已选主控在进入库、失败切换与归档恢复后均高亮正确；五板仍是实际设备，缺工具不影响选中。
2. 双视图切换保留积木、舞台/角色/素材、模块和手动草稿；不把 ESP32 显示舞台等同实时硬件兼容。
3. 手动修改代码后 dirty；保存/导出再在全新 iframe 导入/重开恢复同文代码与代码来源；普通项目和历史归档不会继承上个项目草稿。
4. 保存期间继续手动输入，较旧快照保存成功不能清掉新编辑的 dirty；加载失败回滚仍含原草稿。后端取回归档字节与提交字节相同。
5. 两种来源都经同一 controller 提交真实源码；纯手写且无积木仍可编译；源码/设备/profile 变化阻止旧产物上传。用 mock 验证端口关闭前不 POST 上传、日志/取消/恢复失败语义。
6. 后端 unavailable、串口授权取消、作业 busy、查询中断时，界面反馈明确；现有保存冲突和 MenuBar 回归通过。实际 COM3 测试只由主控协调，UI/mock 结果不算物理验收。

本提案已完成静态核对；未运行测试或作出新增硬件通过结论。
