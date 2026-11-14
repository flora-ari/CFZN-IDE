# 主控扩展 / 模块扩展：后端接口与存储提案

状态：供主控与前端设计对齐，尚未成为公共契约。日期：2026-11-06（Asia/Shanghai）。

本次只检查源码和本地已下载的官方资源包；没有修改业务代码、公共契约、旧项目，没有安装依赖、启动服务、运行测试或操作硬件。

## 1. 建议结论

**本期无需新增 API，无需修改 `apps/api/` 的业务实现或存储结构。** 将经过整理的自有主控描述、模块目录和脚本作为前端静态资源随站点发布；项目继续通过现有 POST / PUT / GET content 保存、读取完整 `.ob` 归档。

当前官方 OpenBlock 已将主控、编程模式、已加载模块写入 `project.json`。后端现有校验器不会过滤这些字段，本地存储原样写入归档字节。新增分类、模块注册、主控兼容检查及加载恢复属于前端 OpenBlock 集成职责。

不增加 `/extensions`、`/devices`、插件上传、扩展市场、资源代理、编译或烧录接口；不迁入旧项目的 20112 桌面资源服务。一期仍为匿名本地项目存储，不引入用户、Python 主后端、SQL、OSS 或 WebSocket。模块内用于设备的 MicroPython 代码与未来 Python 主后端是两回事。

用户已确认“先内置旧 IDE 扩展并提供代码接入方式”，不做界面扩展包导入。因此维护方将资源加入仓库中的静态目录、登记并随站点发布，不增加运行时插件上传接口。首批具体清单由前端设计调查并交主控确定。

## 2. 当前实现证据

以下路径相对 `F:/CFZN/CFZN-IDE`；行号是本次只读核查时的位置。

| 证据 | 核查结果 | 对本需求的含义 |
| --- | --- | --- |
| `apps/api/src/projects/project-archive.validator.ts:42,69` | 检查 ZIP、CRC、根 `project.json`、`targets` 和引用的造型/声音；限制 20 MiB 压缩包、100 MiB 展开内容、5 MiB project.json；不对白名单之外的 JSON 字段进行重建或删除 | `device`、`programMode`、`extensions`、`deviceExtensions` 均可随完整归档保存；不需要新增 DTO |
| `apps/api/src/projects/projects.controller.ts:57,118` | POST/PUT 调用校验器后将同一个 Buffer 传给 store | 后端不需要理解主控型号或加载扩展代码 |
| `apps/api/src/projects/local-project.store.ts:52,61,92` | 直接读取、写入归档 Buffer；元数据记录归档文件引用，替换包后切换元数据指针 | 原有版本检查、提交语义、重启持久化适用扩展项目 |
| `apps/api/src/projects/project-store.ts` | 公开 Project 仅含 id/name/revision/format/sizeBytes/createdAt/updatedAt | 不向项目列表增加主控或模块字段，避免归档和 metadata 出现两份状态 |
| `apps/web/src/openblock.ts:101,168,212` | dirty 主要监听 `PROJECT_CHANGED`；导出调用 `vm.saveProjectSb3()`；打开调用 `vm.loadProject()`，失败尝试恢复备份包 | 分类操作需进入真实 VM 状态并通知 dirty；恢复链路也必须使用新的静态模块目录 |
| `apps/web/scripts/prepare-openblock.mjs` | 当前锁定 GUI `0.1.0-prerelease.20250611102354`，准备同源官方 GUI 与 static 资源 | 在前端现有资源准备/集成层接入自有目录，不依赖开发机的旧项目路径 |

还只读解析了 `.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz` 内 `package/dist/openblock-gui.js.map` 的 `sourcesContent`，核对的是当前发布包所含源码，不以旧项目行为替代当前基线：

| source map 内源码路径 | 行号与事实 |
| --- | --- |
| `node_modules/openblock-vm/src/serialization/sb3.js` | 557：`device = runtime.getDevice()`；579：`programMode`；582：`extensions = getLoadedScratchExtension()`；585：`deviceExtensions = getLoadedDeviceExtension()` |
| `node_modules/openblock-vm/src/engine/runtime.js` | 2597：将已加载模块放入 Map；2629：返回 Map 的全部 key。因此模块即使尚未放置积木，也有原生保存依据 |
| `node_modules/openblock-vm/src/virtual-machine.js` | 464 起：归档包含 project.json、造型及声音；599 起兼容字符串和对象形式的 device；607–614：先设备，再 targets/普通扩展，再设备模块 |
| `node_modules/openblock-vm/src/extension-support/extension-manager.js` | 13：资源根仍为 `http://127.0.0.1:20112/`；414：从 locale JSON 获取模块目录；460：按 extensionId 查目录、加载脚本并注册 |
| 同上 | 350：设备必须有可解析的 VM 实现；切换设备会清除当前扩展；内置设备含 `arduinoEsp32S3`，未见旧项目新增的 `aijiteESP32S3`、`aijiteEsp32S3`、`canmvK230` 注册 |
| `src/containers/extension-library.jsx` | 83、172：原库按实时/上传模式选择普通扩展或设备模块；156：兼容性依据 supportDevice、deviceExtensionsCompatible 或 `*` |

## 3. 旧项目资源格式与迁入边界

旧项目根：`F:/CFZN/D-Coding/aijite-editor-release/aijite-editor-release`。以下均为只读检查。

### 3.1 主控是设备描述加 VM 实现

`packages/aijite-gui/src/lib/libraries/devices/index.jsx` 提供 `deviceId`、`type`、名称、图片、支持模式/语言、连接提示、可选 `deviceExtensionsCompatible` 等展示与适配信息。`packages/aijite-vm/src/extension-support/extension-manager.js` 的 builtinDevices 决定该 ID 是否真的能实例化。

因此只添加卡片、图片或一个静态 JSON 条目，不能让不存在的主控实现可用。

发现需要主控裁决的身份差异：

- 旧 GUI 第 149–150 行的 ESP32-S3 和第 221–222 行的 AijiteESP32S3，均为 `deviceId: 'arduinoEsp32S3'`。旧归档若只记录这个 ID，无法反推用户点的是哪张卡片；应按通用 ESP32-S3 导入，不猜测为 Aijite。
- 旧 VM 同时注册 `aijiteESP32S3`、`aijiteEsp32S3`。`packages/aijite-vm/src/devices/aijiteEsp32S3/aijiteEsp32S3.js:1–32` 继承 ESP32-S3，但过滤 IO3 的普通、模拟、触摸引脚菜单，内部 DEVICE_ID 为 `aijiteESP32S3`。它与通用板存在可见行为差异，不能仅改名宣称完全兼容。
- 当前 VM 的 `analysisRealDeviceId` 支持 `品牌_内置ID` 形式，用下划线后的第二段选择内置实现。它可用于行为完全相同的派生描述，但不会自动实现 Aijite 的引脚差异，也不是可随意使用多段下划线的通用命名规范。
- `canmvK230` 是旧 VM 的额外设备实现，当前官方包未注册。若进入首批可用清单，前端需完成对应适配；不能只把其 ID/图片搬进目录。

建议对自有板使用唯一且稳定的 ID。Aijite 可优先评估以旧类的 `aijiteESP32S3` 为规范 ID，并在前端处理已有大小写别名；最终 ID 和适配方法由主控与前端冻结。后端对此无特殊分支。

### 3.2 模块是目录资源，不是一个可原样上传的项目包

抽查 `external-resources/extensions/dht/` 与 `external-resources/extensions/LED/`：

| 文件或字段 | 用途 |
| --- | --- |
| `index.js` | CommonJS 元数据工厂；含 extensionId、version、supportDevice、author、名称/描述、图标、脚本相对路径、tags |
| `blocks.js` | 注册 Blockly 积木定义 |
| `toolbox.js` | 提供工具箱 XML |
| `generator.js` | 注册 Arduino 等代码生成器；不等同于浏览器 VM 实时执行实现 |
| `translations.js`、`msg.json` | 界面和积木文案 |
| `assets/` | 模块卡片等静态图片 |
| `lib/`（如 dht） | 设备侧库源码；dht 中有 DHT.h/DHT.cpp，不是网页需要在 API 执行的代码 |

旧 `packages/aijite-resource/src/extension.js:16` 在服务端执行目录内 index 工厂，生成语言目录；第 51–53 行把 `library` 改为本机绝对路径，供旧工具链/上传器使用。旧 `src/server.js` 同时提供静态文件与 `/:type/:locale` 目录服务。网页版本应在前端构建/整理资源时生成同等目录，使用站点 URL；不得复制旧机绝对路径作为可用编译能力。

当前与旧 VM 的模块加载器均通过全局注册函数交接 `toolbox/blocks/translations/generator`，并更新 runtime 的已加载模块集合。前端适配需要保留这套注册结果和 GUI 事件，不能只插入图片或只往模块清单写一个 ID。加载会重置共享的全局注册函数，应沿用按模块串行安装的语义，避免同时加载多个模块互相覆盖。

现有样例质量并不一致：

- dht 的 `generator.js` 确有 DHT include、初始化和温湿度读取生成逻辑，可以作为“有完整资源结构”的候选样例；本轮未验证其在当前编辑器中的运行或硬件行为。
- LED 的 `generator.js:8–9` 在同一作用域重复 `const PIN`，第 10、14、18、22 行仍返回 TODO。`blocks.js` / toolbox 也重复使用 PIN 字段。它需要先修复并验证，不能以旧仓库存在为依据列为已完成模块。

不建议无差别搬入整个 external-resources 目录。首批应由主控确定具体主控、模块及对应能力：真实积木编辑、代码生成、VM 实时执行、编译、烧录、硬件通信分别说明。模块仅有 generator 时，不承诺点击绿旗能驱动物理设备。

## 4. 最小完整的数据与调用方案

### 4.1 前端静态目录

目录可以直接随前端模块打包，也可以构建为同源静态 JSON；具体文件布局归前端，不形成 `/api/v1` 接口。

必要信息沿用已有命名：

- 主控：稳定 `deviceId`、设备框架 `type`、支持的 programMode/programLanguage、展示信息、可选 `deviceExtensionsCompatible`，以及实际可用的加载实现。
- 模块：稳定 `extensionId`、资源 `version`、`supportDevice`、展示信息，以及 blocks/toolbox/generator/translations 的站点资源定位。首批只暴露已移植可用的条目。
- “主控扩展 / 模块扩展”是目录分类；已选主控与已加载模块的权威状态在 VM。当前筛选标签、搜索词不需要进入项目归档。

路径由本次站点部署推导，不存开发机 F 盘路径、不硬编码站点域名、不要求 20112 服务在线。继续使用原 loadDeviceExtension 时，要注意它会把非完整 HTTP(S) URL 拼到 20112：仅给 `/extensions/...` 相对路径不足以完成迁移。前端应统一适配资源根/目录加载，或将本地条目解析为当前 origin 的完整 URL。

这项适配必须在编辑器初始化时安装，覆盖库中点击加载和 `vm.loadProject()` 内部恢复两条路径。不能仅替换扩展弹窗数据而让恢复项目仍请求旧桌面端口。

### 4.2 项目内容沿用原生字段

示意为完整 `project.json` 中的一部分，不是可独立上传的项目：

```json
{
  "device": { "deviceId": "arduinoEsp32S3", "type": "arduino" },
  "programMode": "upload",
  "extensions": [],
  "deviceExtensions": ["dht"]
}
```

| 字段 | 语义与恢复规则 |
| --- | --- |
| `device` | 一个已选主控；本期多选模块、单选主控。使用 VM 实际 device 对象，兼容旧字符串 device + deviceType 形式 |
| `programMode` | `realtime` 或 `upload`。这里 upload 表示编辑/生成模式，不表示本网站已提供烧录服务 |
| `extensions` | 普通 Scratch/OpenBlock 扩展，与设备模块集合分开 |
| `deviceExtensions` | 已加载设备模块的 ID 数组，包括尚未放置积木的模块；由 runtime 注册成功后形成 |
| `targets`、造型/声音引用及素材 | 继续由原生归档完整保存，不退化为积木 JSON |

资源脚本、图标、C++ 库、模块 version 并不会因为放入静态目录而自动写进 `.ob`。当前 VM 保存的是 ID 引用，归档携带项目内容与素材；重新打开还需要站点提供兼容 ID 的扩展实现。因此本期固定首批资源版本，并保持已有 ID/opcode/字段/菜单值含义稳定；不要把同一 ID 静默替换为不兼容实现。暂不增加逐项目锁版本字段或第二份选择状态，后续确有多版本需求再交主控变更契约。

通用 `.sb3` 或旧 `.ob` 缺少设备/模块字段时沿用普通项目加载；新建、打开普通项目应清除上一项目的设备和模块状态，不能合并残留选择。选中主控、模块不是外设连接授权，不保存实际端口句柄、串口许可、会话日志或用户信息；重新打开不会自动连串口、执行程序或烧录。

### 4.3 保存与恢复时序

1. 选择主控：前端检查该主控已有可用实现，完成 VM 设备选择、GUI 状态和编程模式更新。切换主控会清空上游扩展集合；前端应提示会影响现有模块，并按确定规则重新加载仍兼容的模块。若现有积木依赖将被移除的模块，首期可阻止切换或卸载并说明原因，不能静默遗失积木后报告成功。
2. 加入模块：检查当前主控、模式、supportDevice 与兼容别名；加载所有必要资源并注册真实积木/生成器后，才把操作显示为完成。重复加入应保持一个实例。
3. 主控、模块集合、模式成功改变时，前端同步 dirty/editVersion；当前 `runtime.setDevice`、`addDeviceExtension` 自身只是更新数据，不能假设它们一定触发现有 bridge 的 `PROJECT_CHANGED`。加载/恢复期间继续抑制用户修改标记。
4. 保存等待本次加载操作结束，用 `vm.saveProjectSb3()` 导出完整包；首次 POST，后续 PUT + If-Match。不同时向另一接口提交主控/模块选择，不由后端补写 project.json。
5. 打开沿用 GET metadata → 带可选 If-Match 的 GET content；在替换当前项目之前，前端确认所引用主控/模块能由本地目录解析，并给出缺失/不兼容的具体 ID。然后按现有 VM 流程恢复设备 → targets/普通扩展 → 串行设备模块 → GUI 工具箱和选中状态。
6. 某资源不存在或加载失败，应拒绝本次打开并保留/恢复原编辑项目，使用现有 editor 错误通路提示原因；不能悄悄跳过模块后标记加载或保存成功。现有 `openblock.ts` 已有备份恢复逻辑，需由前端验证其覆盖扩展失败场景。

归档中包含未知扩展 ID 不等于服务器收到坏 ZIP。可用性检查属于编辑器；后端仍可保存、下载该包，不因静态目录尚无该模块返回 422。服务端字节保全也不表示 VM 会保留所有未知字段或任意附加 ZIP 文件：项目经编辑器重新序列化后只能保证其支持的原生状态和素材，不能宣称额外自定义 sidecar 会自然保留。

## 5. 对现有公共契约的影响

| 范围 | 建议 |
| --- | --- |
| URL、请求体、Project 响应结构 | 不变；无扩展 API，PATCH 仍只改 name |
| 归档类型、大小限制、原样存储 | 不变；模块代码不随项目上传，不需要因此提高限制 |
| ETag、revision、If-Match | 不变；主控/模块修改在下次完整保存时作为同一个项目版本提交 |
| 后端错误 | 不变；422 INVALID_PROJECT 用于归档结构/素材问题，413 用于原有限制。缺模块、错主控、脚本加载失败通过前端现有 EDITOR_ERROR/界面加载错误表达 |
| 本地目录和 ProjectStore | 不变；将来 Python/OSS 替换仍面对完整归档，无需先设计独立扩展仓库 |
| 公共文档 | 建议主控补充原生设备/模块字段含义、静态 ID 依赖、兼容边界和本轮验收；本文不自行修改或升版 `docs/api-contract.md` |

如果开发中发现后端拒收一个满足现有归档约束的真实扩展项目，应提交具体 fixture、报错与所违反规则给主控，按证据定位；目前没有发现需要扩展校验白名单或增加服务的理由。

## 6. 主控需对齐的决定

1. 首批主控、模块清单和每项交付能力；LED 等不完整样例是否修复后纳入，K230/Aijite 专有行为是否在本期实现。
2. 自有主控的规范 ID、已有大小写别名、supportDevice 兼容关系；旧 `arduinoEsp32S3` 包不自动认定为 Aijite，新的自有主控须能准确保存恢复。
3. 静态资源加载层须覆盖初次点击及打开项目，移除对 20112 的运行依赖；后端无开发增量，原项目 API 保持不变。
4. 主控切换/模块卸载对现有积木的规则，以及加载失败时保留当前项目的行为。由前端统一 dirty、模式、工具箱及选中态。
5. 落实用户已确认的仓库代码登记与发布流程，提供主控/模块的接入位置和样例说明，不做界面扩展包导入；首批资源 version 在站点发布中固定，不承诺归档内携带插件或跨任意版本编辑器执行。

## 7. 后续验收建议（本轮未执行）

- 真实选中主控、加载两个兼容模块，其中一个不放积木；保存后检查原生字段，再打开确认主控、模式、两个模块、实际积木参数和自定义素材全部恢复。
- 上述完整包经 POST → GET、PUT → GET 保持字节一致，并沿用现有 API 重启、过期 If-Match 与失败保存保护检查。需要增补测试时由测试会话持有 `tests/`，不由本设计会话创建。
- 在关闭旧桌面资源服务的环境中，首次打开扩展库和直接打开已保存项目均能加载本次自有资源；核对没有针对该模块的 20112 请求。
- 主控/模块选择自身即可触发待保存状态；加载中不能导出半完成集合；打开无硬件字段的项目后不残留上个项目的模块。
- 缺失模块、未知主控、资源脚本失败和不兼容模块均得到明确提示，当前项目不被静默覆盖。对旧重复主控 ID、大小写别名和普通 `.sb3` 分别核查。
- 对纳入首批的模块检查真实积木注册及其声明的执行/生成能力；生成代码、串口终端、编译、烧录和实体传感器读数分别验收。**本轮没有进行实际硬件测试，不声称硬件功能通过。**

结论边界：以上保存恢复能力来自当前代码链路的静态核查，迁入自有资源后的浏览器行为仍需开发和测试阶段验证。建议先沿用原生归档与既有 API，实现前端资源和 VM 状态的完整闭环。
