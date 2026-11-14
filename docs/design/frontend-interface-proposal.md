# CFZN-IDE 前端接口提案 v0.1

状态：已对齐主控冻结的 `docs/api-contract.md`；统一契约优先于本文重复定义。核对时间：2026-11-06。本轮只核对源码、发布包与接口，不声称已完成浏览器运行或真实串口测试。

## 1. 推荐实施路径

主应用使用 React + TypeScript。编辑器使用**官方 OpenBlock GUI 的预编译发布包**，在本机同源 `/openblock.html` 内以 React 16.14.0 运行，由主应用 iframe 承载。父页面负责项目列表、服务端保存和 Web Serial 调试；iframe 负责官方 GUI、真实 VM、积木拖拽与舞台执行。

这条路径不要求本阶段升级或重新构建 OpenBlock，也不把普通 Blockly 另画成相似 UI。保留蓝色顶栏、原分类与工具箱、中间工作区、右侧舞台/角色，以及代码、造型、声音标签。平台新增项目与串口入口保持精简，打开相应面板时才占空间；不重绘官方主界面。

不采用官方站点跨域 iframe：无法控制版本、访问实际 VM 或保证项目读写。这里的 iframe 与主应用同源，代码和所有必要资源由本项目提供。

后端为 Node.js + TypeScript，优先 NestJS。v0.1 使用项目完整包与本地元数据，不记录用户、不接鉴权、SQL、OSS，也不引入 Python 后端。后续 Python 用户/存储信息应通过独立适配器接入，不改变编辑器内部项目格式。

## 2. 已核实的上游事实

| 项目 | 已核实值或行为 |
| --- | --- |
| GUI 源码基线 | `openblockcc/openblock-gui` develop，commit `cdd3478c3d9bbced4cb50f4ac0dda8593416c889` |
| GUI npm 发布包 | `openblock-gui@0.1.0-prerelease.20250611102354` |
| VM npm 版本 | `openblock-vm@0.2.0-prerelease.20250609145235` |
| VM 源码基线 | develop，commit `1799b268d23a04feb364e5d1744c4f07c862ed6a` |
| blocks / l10n | `openblock-blocks@0.1.0-prerelease.20250611095335` / `openblock-l10n@3.15.20250608130541` |
| 原始构建链 | React 16，Webpack 4.46.0、Webpack CLI 3.3.12、Webpack Dev Server 3.11.2 |
| GUI npm 入口陷阱 | `package.json.main` 写作 `./main/scratch-gui.js`，发布清单中没有该文件；真实预编译入口为 `dist/openblock-gui.js` |
| 预编译 GUI | UMD，只有 React 与 ReactDOM 是外部依赖；导出 `default`、`AppStateHOC`、`setAppElement` 等 |
| 获取 VM | GUI `componentDidMount` 调用 `onVmInit(this.props.vm)`，可取得 GUI 正在使用的 VM |
| 初始化结束 | `onProjectLoaded` 通知官方项目加载状态进入显示状态；不要把 `onVmInit` 当成默认项目已加载 |
| 默认完整导出 | `saveProjectSb3()` 返回 Promise，结果是 ZIP Blob，MIME 为 `application/x.openblock.ob`；官方文件名后缀 `.ob` |
| 完整包内容 | `project.json` 加造型与声音二进制资产，不只是积木 JSON |
| 官方文件选择器 | 允许 `.ob,.sb,.sb2,.sb3`；本平台主验收为 `.ob` 和 `.sb3` |
| 原版硬件串口路径 | VM `src/io/serialport.js` 经 `runtime.getScratchLinkSocket('SERIALPORT')` 使用 WebSocket / JSON-RPC，不是浏览器 Web Serial |

本机只读确认 Node `v24.16.0`、npm `11.13.0`。没有安装或改动项目根依赖。`npm view` 因默认缓存目录不可写失败后，改为直接读取 registry 元数据完成核实；这不是依赖不可下载。

## 3. 发布包准备与构建隔离

优先由可重复的准备脚本从精确版本 tarball 提取所需文件并保留许可证，保存包版本、上游 commit 与 npm `dist.integrity`。不要运行 `npm install openblock-gui` 来引入全部历史开发依赖，不依赖 CDN 在用户运行时提供 GUI。

React 16 仅存在于 iframe 中；主应用 React 版本由主控决定。不要对主应用 React 做 alias、降级，或把两套 React 渲染到同一个根节点。主应用只编译自己的 TS；编辑器适配器编译为独立脚本，使用 iframe 已有的全局 React16，不重打包 22 MB 官方 GUI。

静态加载顺序与映射必须按实际包验证：

1. 加载 React16 和 ReactDOM16 的 UMD 文件。
2. **设置全局别名** `window.react = window.React` 与 `window['react-dom'] = window.ReactDOM`。官方 GUI UMD 使用小写键 `root['react']`、`root['react-dom']`；只加载常见的 `React` / `ReactDOM` 全局会失败。
3. 加载 `dist/openblock-gui.js`。其导出对象位于 `window.GUI`；使用 `window.GUI.default` 和 `window.GUI.AppStateHOC`。
4. 调用 `setAppElement`，挂载 `AppStateHOC(GUI.default)`，通过 `onVmInit` 捕获真实 VM，通过 `onProjectLoaded` 发出初次 `READY`。
5. 不调用官方 playground 的 analytics 入口，不启用用户、社区、云变量或用户信息持久化。

| 包内文件 | 本站请求路径 | 原因 |
| --- | --- | --- |
| `dist/openblock-gui.js` | `/openblock-vendor/openblock-gui.js` | 主脚本可用稳定独立路径 |
| `dist/static/*` | `/static/*` | 预编译 GUI 的 publicPath 是 `/static/` |
| `dist/chunks/*` | `/static/chunks/*` | 动态加载 chunks，不能仅复制主 JS |
| `dist/extension-worker.js` | `/extension-worker.js` | VM 内部 bundle 的 publicPath 为空；根路径 `/openblock.html` 下解析到此 |
| 同上 worker | `/static/extension-worker.js` | 也覆盖外层 `/static/` 的 worker 解析路径 |
| 包根 `static/*` | 合并到 `/static/*`，以明确资源清单避免误覆盖 | 原始静态资源与 `dist/static` 是两个目录 |

不要简单把整个 `dist` 放到 `/static`：这会把图片变成 `/static/static/assets`。不要只复制 GUI JS：块图标、字体、懒加载编辑器、worker 会缺失。准备脚本的具体拷贝清单须由本地 Network 无 404、造型/声音标签加载、扩展 worker 加载验收确定。

只有预编译 GUI 无法提供所需菜单钩子时，才对上述 commit 做小范围源码补丁。源码构建应使用单独目录、独立锁文件与明确工具链，不把 Webpack4 直接混入现代主应用构建。

## 4. 编辑器桥接契约

使用同源 `postMessage`，或者建立一次 `MessageChannel` 后传输请求与响应。父子双方检查 `origin`、`source`、协议名及版本。不得把 DOM、Redux store 或 VM 对象跨边界暴露；桥只传结构化数据与二进制。

```ts
type BridgeEnvelope = {
  protocol: 'cfzn.openblock';
  version: 1;
  requestId?: string;
  type: string;
  payload?: unknown;
};

type EditorSnapshot = {
  title: string;
  editVersion: number;
  dirty: boolean;
  running: boolean;
};

type ProjectArchive = {
  bytes: ArrayBuffer;
  mimeType: 'application/x.openblock.ob';
  fileName: string;
  editVersion: number;
};
```

| 请求 / 事件 | payload 与结果 | 实际操作 |
| --- | --- | --- |
| `READY` 事件 | 协议版本、`EditorSnapshot` | 初始项目已可编辑；发送前不接受加载或导出 |
| `LOAD_PROJECT` | `{bytes: ArrayBuffer, title: string}` → `EditorSnapshot` | `vm.stopAll()`，`await vm.loadProject(bytes)`，完成后更新标题/状态 |
| `EXPORT_PROJECT` | 空 → `ProjectArchive` | `await vm.saveProjectSb3()`，再取 `blob.arrayBuffer()` |
| `GET_PROJECT_JSON` | 空 → `{json: string}` | `vm.toJSON()`；仅用于检查、测试与调试，不当作完整备份 |
| `GET_STATE` | 空 → `EditorSnapshot` | 返回桥内部状态 |
| `SET_TITLE` | `{title: string}` → `EditorSnapshot` | 更新官方标题状态，并通知父层同步元数据 |
| `RUN` / `STOP` | 空 → 状态 | `vm.greenFlag()` / `vm.stopAll()` |
| `MARK_SAVED` | `{editVersion: number}` | 只把已保存快照对应版本标为 clean；期间若有新编辑仍为 dirty |
| `CHANGED` 事件 | `EditorSnapshot` | VM `PROJECT_CHANGED` 加标题修改，递增 editVersion |
| `RESPONSE` | `{ok: true, result}` 或 `{ok: false, error:{code,message}}` | 以 requestId 匹配；加载与导出请求串行处理 |

`ArrayBuffer` 可通过 transferable 传输。发送方 transfer 后 buffer 会被分离，不能再次使用；需要保留的数据先复制。开发中用简单请求队列防止载入与导出重叠；暂时禁用相关操作并显示状态即可。

标题不是 VM JSON 的项目元数据来源。主应用的 `ProjectDto.name` 与 GUI 标题应双向同步；适配器负责锁定版本的标题/dirty reducer 钩子，不把内部 action 字符串变成公共接口。官方 `AppStateHOC` 内部有 store，但它不是稳定公开 API；若使用 ref 访问，必须将此依赖封装在 iframe 适配器并固定版本。

初始默认项目的异步加载必须先完成，再执行父页面的 `LOAD_PROJECT`，避免默认项目覆盖刚加载的数据。加载时临时暂停 `CHANGED` 外发；成功后设为 clean，再恢复监听。直接调用 `vm.loadProject` 还需同步官方 GUI 加载状态、标题和变更提示；可复用上游 `sb-file-uploader-hoc` 的成功/失败状态顺序。失败不能标记保存成功。

### JSON 与资产的正确关系

`vm.toJSON()` 只给出项目描述，造型和声音通常是 assetId/md5ext 引用。单独保存 JSON 再加载，依赖配置正确的 `scratch-storage` 资产存储；否则可能缺图、无声或被替换为默认资产。

v0.1 因而统一保存完整 `.ob` 包：后端存储字节，恢复时把原字节送回 `vm.loadProject`。这覆盖用户上传的自定义造型与声音，且不需要第一阶段设计独立资产 API。允许导入 `.sb3` 后再由 VM 归一化为 `.ob`；API 只接受 `.ob` / `.sb3`，原版 GUI 若载入 `.sb` / `.sb2`，必须先用 VM 导出完整 `.ob` 再保存。OpenBlock 设备扩展项目不能承诺可在原版 Scratch 无损运行。

官方保存 HOC 另有 `vm.toJSON()` + `vm.assets` + `storage.store()` 的拆分资产上传机制。v0.1 不启用此远端保存流程，也不把它假接到只收一个 JSON 的后端。

## 5. 前后端 REST 契约

与主控、后端提案对齐；以下为前端所需字段，最终以共享 contracts 定义为准。

```ts
interface ProjectDto {
  id: string;
  name: string;
  format: 'openblock';
  revision: number;
  sizeBytes: number;
  createdAt: string; // UTC ISO 8601
  updatedAt: string; // UTC ISO 8601
}
```

| 方法与路径 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /api/v1/projects` | 无，本阶段不分页 | `200` + `{items: ProjectDto[]}`，最近更新优先 |
| `POST /api/v1/projects` | `multipart/form-data`，`name` + `file` 完整包 | `201` + `{project: ProjectDto}` |
| `GET /api/v1/projects/:id` | 无 | `200` + `{project: ProjectDto}` |
| `PATCH /api/v1/projects/:id` | JSON `{name}` + `If-Match` | `200` + `{project: ProjectDto}`，revision 递增 |
| `GET /api/v1/projects/:id/content` | 建议带元数据 revision 的 `If-Match` | `200` 原包，`Content-Type: application/x.openblock.ob`、ETag、下载文件名 |
| `PUT /api/v1/projects/:id/content` | raw `application/octet-stream` 或 `application/x.openblock.ob` 完整包 + `If-Match` | `200` + `{project: ProjectDto}`，revision 递增 |
| `DELETE /api/v1/projects/:id` | `If-Match` | `204` |

`If-Match` 使用服务端返回的带引号 ETag 原值，例如 `"1"`。加载 content 时带元数据 revision，防止元数据与内容来自不同版本。成功写入后才更新当前 revision 与保存提示。新项目首次保存走 POST；已保存项目走 PUT。导入复用 POST/编辑器加载，导出当前未保存内容使用 VM，导出服务器版本使用 GET content。名称 trim 后为 1–100 字符；压缩包上限 20 MiB，展开上限 100 MiB，project.json 上限 5 MiB。

标准错误为 `application/json`，例如：

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "项目已被其他窗口更新",
    "details": {"currentRevision": 4}
  }
}
```

前端按 `code` 分支，不能解析中文 message。冻结错误码为：`VALIDATION_ERROR`（400）、`INVALID_PROJECT`（422）、`PROJECT_NOT_FOUND`（404）、`REVISION_CONFLICT`（412）、`PAYLOAD_TOO_LARGE`（413）、`UNSUPPORTED_MEDIA_TYPE`（415）、`PRECONDITION_REQUIRED`（428）、`STORAGE_ERROR`（500）。冲突时保留当前编辑器内容，提供重新加载或另存；网络失败不能清除 dirty。

不向后端发送用户对象、串口权限、串口会话或实时串口日志。元数据中不预填虚构 userId、ownerId、OSS URL。

## 6. 浏览器串口边界

串口调试是父页面独立 TypeScript 服务，直接调用 `navigator.serial`。不要为浏览器本地串口设计 Node REST 代理；远端服务器无法访问用户电脑的 COM 口。浏览器是连接所有者，iframe 不重复申请同一个端口。

```ts
interface SerialOptions {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
}

interface SerialService {
  requestAndOpen(options: SerialOptions): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
```

可见状态为 unsupported、disconnected、requesting、opening、open、closing、error。基础 UI 提供连接/断开、波特率、UTF-8 文本与 HEX 收发、换行设置、清空日志；日志设合理滚动上限。文本跨 chunk 解码必须保留 decoder 状态，不能把每个任意串口 chunk 当作完整 UTF-8 字符或完整行。

真实限制：

- 必须在安全上下文（部署 HTTPS 或本机 localhost）并检测 `navigator.serial`；以实际运行的 Chromium 浏览器能力为准。
- `requestPort()` 必须由用户点击触发并经浏览器设备选择；不能静默授权。无设备、取消选择、拒绝权限需给出不同状态。
- 浏览器通常不提供可依赖的 `COM3` 路径字符串；不要把设备列表 API 设计为必须返回操作系统路径。
- 端口被其他软件占用、驱动缺失、错误波特率、USB 拔出、板卡重启均需真实处理。断开时取消读取、等待读循环结束、释放 reader/writer lock 后关闭端口。
- Web Serial 只提供字节通信；**不会自动给 OpenBlock 原有硬件积木、编译、烧录功能接上设备**。官方硬件积木依赖 OpenBlock Link 协议与固件。v0.1 验收浏览器串口终端收发；烧录与积木硬件控制属于后续板卡/协议适配，不得显示为已实现。

无实际设备时，自动化只能验证界面、错误路径、收发逻辑模拟；必须把真实收发验收标为待硬件验证。

## 7. 聚焦验收用例

| 用例 | 通过标准 |
| --- | --- |
| 原版界面启动 | 主要布局、蓝色顶栏、分类/工具箱、舞台/角色、三标签保留；Network 无必要资源 404 |
| 真实积木执行 | 从工具箱拖“当绿旗被点击→移动10步”，舞台角色位置发生变化；stop 能停循环 |
| 造型与声音 | 能打开两种编辑器、导入自定义造型/声音并使用；不能只展示占位面板 |
| 完整保存重开 | 自定义素材、变量、脚本保存后刷新页面，从项目列表重开一致；ZIP 含 project.json 及素材 |
| 保存时继续编辑 | 保存完成后新增改动仍显示未保存，不被旧快照回执错误清除 |
| 导入导出 | 官方 `.ob`、普通 `.sb3` 均能载入，重新导出的 `.ob` 在新编辑器会话可打开 |
| 初始加载竞争 | 自动打开已存项目时，官方默认项目不会稍后覆盖它 |
| 网络/坏包 | 不显示保存成功；不丢掉可恢复的当前编辑内容；错误有明确文案 |
| revision 冲突 | 两窗口编辑同项目，旧 revision 保存不覆盖新数据，内容保留并可另存 |
| 后端重启 | 已保存项目列表与完整包可重新读取 |
| 串口真实收发 | 支持的本机浏览器、真实板卡/USB串口，在已知正确波特率下发送并收到可验证字节；拔出后状态收敛 |
| 不支持串口 | 明确显示能力限制，其他编辑/保存功能仍可工作 |

实现时先证明“预编译 GUI 本机启动 → 拖积木运行 → VM 导出/重载含素材包”，再接后端和串口面板。未取得此证据前，不把静态界面或 JSON 编辑器当作 OpenBlock 集成完成。

## 8. 核对来源

以下均为上游源码、发布包或浏览器官方文档；仓库分支核对结果已记录精确 commit，开发须固定该版本。

- [OpenBlock GUI package.json](https://github.com/openblockcc/openblock-gui/blob/cdd3478c3d9bbced4cb50f4ac0dda8593416c889/package.json)
- [GUI 容器与 onVmInit](https://github.com/openblockcc/openblock-gui/blob/cdd3478c3d9bbced4cb50f4ac0dda8593416c889/src/containers/gui.jsx)
- [GUI 公开导出](https://github.com/openblockcc/openblock-gui/blob/cdd3478c3d9bbced4cb50f4ac0dda8593416c889/src/index.js)
- [官方构建与资源拷贝](https://github.com/openblockcc/openblock-gui/blob/cdd3478c3d9bbced4cb50f4ac0dda8593416c889/webpack.config.js)
- [npm GUI 精确版本文件清单](https://unpkg.com/openblock-gui@0.1.0-prerelease.20250611102354/?meta)
- [实际 UMD 文件](https://unpkg.com/openblock-gui@0.1.0-prerelease.20250611102354/dist/openblock-gui.js)
- [VM 装载和序列化](https://github.com/openblockcc/openblock-vm/blob/1799b268d23a04feb364e5d1744c4f07c862ed6a/src/virtual-machine.js)
- [官方完整包下载器](https://github.com/openblockcc/openblock-gui/blob/cdd3478c3d9bbced4cb50f4ac0dda8593416c889/src/containers/sb3-downloader.jsx)
- [官方项目导入流程](https://github.com/openblockcc/openblock-gui/blob/cdd3478c3d9bbced4cb50f4ac0dda8593416c889/src/lib/sb-file-uploader-hoc.jsx)
- [官方 JSON+资产分别保存流程](https://github.com/openblockcc/openblock-gui/blob/cdd3478c3d9bbced4cb50f4ac0dda8593416c889/src/lib/project-saver-hoc.jsx)
- [官方串口 Link 传输](https://github.com/openblockcc/openblock-vm/blob/1799b268d23a04feb364e5d1744c4f07c862ed6a/src/io/serialport.js)
- [Chrome Web Serial 文档](https://developer.chrome.com/docs/capabilities/serial)
- [Web Serial 规范](https://wicg.github.io/serial/)
