# 工具箱与自有扩展加载：后端边界及修复建议

日期：2026-11-11（Asia/Shanghai）。角色：后端接口设计。状态：原因已静态核对并隔离复现，交主控冻结方案后开发。本文件不改变公共契约。

## 1. 结论

**两个缺陷均在前端集成链路，项目 API、Hardware v0.2 HTTP、匿名存储与串口服务均无需改动。**

1. 模块报错不是 atomizer 文件不存在：自有加载器从 Vite publicDir 动态 import，虽已有 `@vite-ignore`，Vite 7.3.7 仍给变量 URL 注入 `?import`。该请求绕过 public 静态服务，进入 source transform，触发图五对应的 `ERR_LOAD_PUBLIC_URL`。retry 改 URL 不改变根因。
2. 选板后基础类别消失有独立的模式原因：自有 `selectController()` 主动 `rawMode(false)`；固定 GUI 的上传工具箱本来就不生成运动/外观/声音/侦测类别。编程模式中的模块隐藏还有 VM 原有 `getBlocksXML()` 不追加上传模块 XML，以及自有 loader/library 的 realtime 守卫，不能只修网络请求。
3. 建议本轮选择**单一纯静态加载边界**，复用现有 24 个已生成 ESM 文件、受控 catalog 与注册流程；将动态 import 移入通过普通 script 标签加载的静态 helper，源码 adapter 只调用 helper。隔离浏览器已证明同一文件经该边界可加载。不要并行维护第二个 fallback loader，不关闭 HMR overlay 来掩盖错误。

主控/模块类别规则由前端设计依据 Mind+ 调查另定；本提案只提出必须保留的模式、注册、恢复与验证约束。不修改 openblock-vm 源码/打包模块，也不新增端口代理或串口 owner。

## 2. 图五错误的实际链路

### 仓库与本机证据

| 位置 | 本轮实际核对 |
| --- | --- |
| `apps/web/vite.config.ts` | publicDir 指向 `F:/CFZN/CFZN-IDE/.runtime/web-openblock/`；开发与构建共享该目录，只有 `/api` 代理到项目 API |
| `apps/web/scripts/prepare-openblock.mjs` | 复制 public/vendor，使用 moduleSource 把六模块各四个 `.js` 转成 `.mjs`，输出到 `cfzn-extensions/extensions/<id>/` |
| `apps/web/src/extensions/adapter.ts` | registerModule 对 toolbox/translations/generator/blocks 使用四个 `import(/* @vite-ignore */ `${resource}...mjs${query}`)`；query 为 manifest.integrationSha256 加 retry |
| `apps/web/node_modules/vite/package.json` 与 package-lock | 实际安装且锁定为 **7.3.7**；package.json 声明范围 `^7.2.2`，不能只根据声明认定实际版本 |
| atomizer 资源 | runtime 和 dist 均有 blocks/toolbox/generator/translations 的 `.mjs`；blocks.mjs 提供 `export default registerBlocks` |
| 全部模块一致性 | 本轮逐一比较六模块 × 四文件，24 个 runtime `.mjs` 均等于当前 moduleSource(vendor `.js`)；没有转换差异 |
| 两份 manifest | runtime 与 dist 的 integrationSha256 同为 `847d88b1a66a85b0281900e9ccf566d2668d214a1903978bfccb3c6cb66637ea` |

因此，本次已排除“atomizer 源文件未拷贝”“该次 runtime/dist manifest 不同”“只需重试第三次”的解释；不将它扩大为所有机器或所有部署都不存在资源缺失。

### 为什么 @vite-ignore 仍不够

已读安装版 `vite/dist/node/chunks/config.js`，相关行号基于本轮安装文件：

- 27464 附近：`hasViteIgnoreRE` 只包围 warning。
- 27467–27469：后续独立条件仍对非字符串常量表达式执行 `__vite__injectQuery(rawUrl, 'import')`。
- 22660：servePublicMiddleware 对 isImportRequest 请求直接 next，不按 publicDir 静态文件返回。
- 22901–22909：loadAndTransform 无 source code 可加载且 checkPublicFile 命中时，产生 `ERR_LOAD_PUBLIC_URL` 及“copied as-is / should not be imported from source code”错误。

这与 Vite 的 public 资源开发时根路径访问、构建原样复制的边界一致。实际修复应基于安装版转换结果，而不是把 `@vite-ignore` 理解成完全跳过所有处理。[Vite publicDir 说明](https://vite.dev/guide/assets.html#the-public-directory)

错误截图中的 `&amp;retry=3` 可以是 HTML 展示转义；当前源码构造的是正常 `&retry=`。本轮证据不支持把 amp 转义当作根因。

## 3. 隔离复现与验证边界

本轮运行两项隔离诊断，未访问或启停用户 5173/3001/3002，未操作 COM3，未运行产品 prepare/build，也未修改产品文件。

### 实际 adapter 转换

使用已安装 Vite 的 JS API，`configFile:false`，root 指向现有 apps/web，publicDir 指向现有 runtime；`middlewareMode:true`、`hmr:false`、`watch:null`、`preTransformRequests:false`、`optimizeDeps:{noDiscovery:true,include:[]}`。不 listen，结束后 server.close。

对实际 `/src/extensions/adapter.ts` 执行 transformRequest，四个动态导入都变成：

```js
import(__vite__injectQuery(`${resource}blocks.mjs${query}`, 'import'))
```

对 atomizer blocks 的 URL 直接执行 transformRequest，`retry=0`、`retry=3`，有无显式 import query，均取得 `ERR_LOAD_PUBLIC_URL` 及与用户相同的 publicDir 诊断。直接调用 transformRequest 表示强制转换，不等同于原始 URL 的普通静态 GET。

### 隔离 HTTP 与真实浏览器

另用 Node HTTP 包装 Vite middleware，仅 listen `127.0.0.1:0` 自动分配端口（本次 61645）。诊断 HTML、静态 helper 和 Vite 管理的最小 import 探针均由内存提供，不生成产品文件；publicDir 仍是现有 runtime。用新的无串口权限 Edge headless 页面验证，结束后关闭浏览器、临时 HTTP 与 Vite。

| 探针 | 本轮结果 |
| --- | --- |
| 普通 GET `/cfzn-extensions/extensions/atomizer/blocks.mjs?v=readonly-audit&retry=3` | 200、text/javascript，包含 default export |
| GET 同一地址但含 `?import&...` | 最小 custom middleware 环境返回 404；未取得模块代码。完整 Vite 页面可通过转换错误层显示 publicDir 诊断，不把此探针状态码冒充用户截图状态码 |
| Vite 管理的 `url => import(/* @vite-ignore */ url)` | 浏览器报告 Failed to fetch dynamically imported module，失败 URL 含 `?import&...` |
| 普通静态 script 提供的 `url => import(url)` | 同一原始 public URL 加载成功，defaultType 为 function |

以上证明开发链路错误及纯静态边界的可行性，不是完整六模块 UI/生产修复验收。开发后仍须实际点击模块并验证积木、代码生成和归档恢复。

## 4. 推荐的最小前端修复

### 一个受控静态 helper，沿用现有模块

建议在现有 public 资源中增加 `cfzn-extensions/module-loader.js`（示例名），prepare 原样复制并纳入已有输入指纹。`openblock.html` 在 `/src/openblock.ts` 之前通过普通 `<script src="/cfzn-extensions/module-loader.js">` 加载；这个边界与现有静态 React/GUI 脚本一致。helper 不从 Vite source 代码 import，不能再在 adapter 中 import public helper，否则只是把错误搬到 helper。

helper 提供一个固定命名空间下的 `loadBuiltin(moduleId, version, attempt)` 能力；返回四份模块 namespace/注册函数。它只接受内置六个 catalog ID 和固定四种文件名，内部构造同源资源路径。项目归档、用户输入和任意 URL 不能成为代码来源。helper 就绪后保持同一入口，不恢复旧 registerBlocks/registerGenerators 全局可变槽；两次并发加载不能覆盖彼此的注册函数。

唯一动态 import 留在这个未经过 Vite source 转换的 helper 中。adapter 在 `await resourceVersion` 后调用 helper，再沿用 default 函数检查、当前板型引脚处理和注册事务。不存在 eval、new Function、fetch 后执行字符串、Blob/data URL 执行或新增本地服务。

这是本次推荐的一条路线。把自有模块生成到 publicDir 之外、用固定源码 import 注册表打包也可成立，但会更改现有模块产物链；若主控改选该路线，应完整替换当前加载方式并做同样的开发/生产验收，不能同时保留两套自动 fallback。

### 函数缓存与板型注册必须分开

- 资源加载可按 `(integrationSha256,moduleId)` 复用成功的函数 namespace；当前板型切换后仍须重新调用定义/生成器/消息函数，使闭包使用当前 Blockly.Device 引脚菜单。缓存命中不等于新板型已完成注册。
- 四文件全部成功且 default 均为函数之后，才开始改变 runtime/toolbox。资源缺失时只报告加载失败，不提前添加已加载模块 ID。
- 将加载准备与注册提交分开：在同一扩展 busy 操作中先取得并校验资源，再生成完整备份、停止执行并修改 VM。准备阶段失败时原文档无需经历无意义的 vm.loadProject 回滚。
- 保持当前事务失败恢复备份；真正注册失败仍可能已部分修改 Blockly/runtime，必须恢复实际原项目或给恢复文件，不能仅从 UI 删一条错误消息。
- 原生模块已加载判断保持幂等；主控重建清除模块实现后，按 retained deviceExtensions 重新注册。成功条件同时检查定义、生成器和当前模式下应呈现的 toolbox，不以 Map 中已有 ID 作为唯一证据。

### 版本、重试与准备缓存

现有 integrationSha256 已覆盖 vendor、public 与 prepare/hooks，继续作为这套发布资源的版本 token；新增 helper 也须被指纹覆盖并随产物交付。模块版本号 1.0.0 是目录元数据，不能替代实际资源指纹。

失败的 native import 可能在当前文档的模块映射中保留失败结果；只有明确用户重试时才换 attempt query。不要无限自增、定时重试或把原始导入错误变成“成功加载”。资源加载失败与注册失败分开记录：注册失败可重新调用已成功获取的函数，不必每次再下载四份模块。

`resourceVersion` 当前是文档创建时的一次 Promise，失败后即使 retry 增长仍先 await 同一个 rejected Promise。建议加载失败后释放该版本请求缓存，显式重试可重新获取清单；成功版本则固定到本次编辑器资源集。运行中替换资源后不混合不同版本，提示重新准备/刷新并保留当前项目。

prepare 当前 fast path 只核对 manifest 内容和 GUI bundle 存在，不检查扩展/helper 是否齐备。最小补充为检查必需交付清单（含 24 模块与 helper）；不新增后台下载器或全盘校验机制。本次文件齐备，缺清单保护不是图五的直接原因。

不要用 `server.fs.allow` 放开 public import、删除 import 参数、全局拦截 Vite错误、禁用 overlay 或改后端代理来绕过问题。开发与生产应使用同一个受控静态 helper；生产从 dist 的对应原样静态路径加载。

## 5. 类别消失、主控切换与编程模式模块

本轮静态证据：

| 位置 | 当前行为 |
| --- | --- |
| 自有 adapter.selectController | loadDevice 后对五个自有支持板执行 rawMode(false)，没有保留用户原编程模式 |
| 固定 GUI `src/lib/make-toolbox-xml.js:776` | 有设备且为上传模式时，只组合设备启动事件、控制、运算、变量、自制积木等；else 分支才包含运动/外观/声音/侦测 |
| 固定 VM `runtime.getBlocksXML:1741` | realtime 返回设备与舞台扩展类别；upload 才追加 `_loadedDeviceExtensions` 的独立模块 XML |
| 自有 adapter.registerModule/loadModule 与 library | realtime 时拒绝/禁用模块加载；修资源后该守卫仍会阻止编程模式加模块 |
| registerModule 就绪条件 | 要求模块 opcode 已在 flyout；若编程模式没有组合模块 XML，即使定义/生成器已经注册仍可能超时回滚 |
| deserializeProject 外部适配 | 已支持 validateProjectExtensions(...,true)，带模块归档先以 upload 注册、然后恢复原有 realtime；模式 UI v0.3 已覆盖此存储语义 |

按主控倾向建议：选板保留已选模式；只对模块注册所需的内部准备阶段使用受控的 upload 上下文，完成后恢复外层模式。失败、加载归档和主控切换恢复也保留原生 programMode 与当前代码草稿；不得为了显示模块永久改模式或把恢复当成用户额外编辑。

编程模式完整基础类别与独立模块类别的组合放在**GUI toolbox 构造/外部适配**中。可从自有 catalog、实际 loaded ID 与已加载 toolbox 函数生成当前设备 XML，再在 GUI getToolboxXML 的既有扩展边界合入；不要修改或替换 VM getBlocksXML/generateXMLfromBlockInfo 的源码/打包函数体。模块 ID 仍从运行时已提交状态读取，不另存一套权威 loaded 列表。

主控引脚/串口/数据如何合并显示由前端提案定稿，但只能改显示类别、顺序或分组标签；保留真实 opcode、参数、菜单值、生成器及已有积木连接。不能把 category id/opcode 改成板卡显示名来“合并”，否则已保存项目和注册表将断开。仍须保留各板真实 GPIO/输入输出限制。

编程模式可见/可拖动模块不意味着其 Arduino 上传代码已成为实时硬件驱动。真实舞台基础积木继续执行；上传模式继续真实生成 C/C++，没有硬件实时协议的模块不发送伪造硬件指令。该边界不需要打开串口或烧录验证。

## 6. 归档、API 与业务后端零变更

继续保留 project.json 原生 device、programMode、extensions、deviceExtensions、targets 和素材；`cfzn/editor.json` 保留模式 UI v0.3 的代码来源/手动草稿。不把资源 URL、版本 query、重试次数、函数对象、临时类别显示树或 loader 缓存写入归档。

项目 API 仅校验归档/素材并保存上传的完整字节；不负责拉取、执行或许可扩展脚本。当前 validator 不根据自有 catalog 过滤未知扩展 ID，前端在替换文档前负责实现可用性。后端不应新增 `/extensions` 路由、资源代理或强制模块版本字段。

新建/普通项目清除旧模块；跨五板切换保留兼容模块并按目标引脚重注册；未知或不兼容模块仍拒绝并保留原文档。加载失败回滚含真实积木、素材、模块、原模式与手动草稿，不能因修 loader 把完整 `.ob` 简化成 JSON。

3001 项目服务、3002 编译上传执行器、Web Serial 单一会话均保持现有边界。添加/展示扩展不自动请求串口、不启动 CLI、不安装固件。云端项目存储与客户端 USB 仍无直接通道。

## 7. 开发及生产验收建议

测试由主控后续派工；本轮 probe 不能替代修复后的验收。至少覆盖：

1. **真实 Vite dev**：独立端口启动实际配置（strictPort，不碰用户端口），在干净浏览器点选五板与六模块；捕获每个模块资源请求及响应，确认不含被错误注入的 import query，无 publicDir transform 错误。使用实际页面和真实积木/生成器，不只请求文件或隐藏 overlay。
2. **静态 dist**：构建后用独立静态服务器运行同一矩阵，确认 helper 与 24 文件随产物交付，JS MIME 正确，缺资源不被 SPA fallback 的 HTML 冒充成功。明确页面版本与 manifest 一致。
3. **缓存/失败**：模拟一次清单失败后手动重试、一个模块文件失败后手动重试、default 无效、注册函数抛错；失败不记已加载、不丢原程序，不出现 register* 全局槽竞争。生产与开发分别验证，不以 Node data-URL 单测代替。
4. **模式/类别**：编程模式选板后基础类别与真实舞台运行保留；六模块可按冻结规则加入并呈现独立类别；上传有真实生成器。切换来回不丢手动代码、不改串口会话，不将模块展示算作实时硬件通过。
5. **板型与恢复**：至少两个有不同引脚约束的主控间反复切换，核对菜单、生成代码和原积木参数；两个模块并存且一个无积木时完整保存/恢复；programMode realtime + deviceExtensions 的归档在全新 iframe 中恢复，历史归档仍可读。
6. **后端边界**：已有项目 API 的归档字节保存、冲突/revision 语义保留；不新增业务 API。现有后端测试不因纯前端修复全量重复，补充实际归档 round-trip 作为本次集成证据即可。
7. **VM 限制**：确认新 hooks 全部属于 GUI src/ 范围、原 VM 模块字节未改；保留已有外部注册适配。无实物测试的结果明确是 UI/自动化验证。

开发文件归属为 apps/web 的 loader/public helper、openblock.html、prepare、adapter/library/toolbox GUI hooks 及对应前端验证；共享契约由主控发布，独立测试仍归 tests。后端应用及依赖无需实施改动。

本轮仅新增本设计文件。隔离进程均已关闭；无产品代码修改、用户服务操作或新增物理硬件结论。
