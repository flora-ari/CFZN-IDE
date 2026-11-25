# CCraft 品牌替换的后端与归档边界

2026-11-23（Asia/Shanghai）。后端只读设计核对，交主控冻结。

**本轮可按前端品牌变更实施，后端业务无需改动。** 前端页面标题、启动提示、iframe 可访问名称、编辑器就绪/关闭/导入错误、Logo 与替代文本统一使用 CCraft。启动文案采用“正在启动 CCraft 编辑器…”。现有后端按请求中的作品名保存作品，产品品牌不参与项目身份、格式或作业逻辑。[编辑器页面](../../apps/web/openblock.html)、[父页面](../../apps/web/index.html)、[桥接提示](../../apps/web/src/editor-bridge.ts)、[编辑器错误](../../apps/web/src/openblock.ts)、[项目输入](../../apps/api/src/projects/project-input.ts)

前端默认作品名为“未命名项目”，服务端要求请求提供合法 `name`。用户已有作品名称应按原值展示和保存。`archiveName()` 的无可用标题回退名目前为 `OpenBlock.ob`，可改成 `CCraft.ob`；扩展库恢复备份名目前为 `OpenBlock-恢复备份.ob`，可改成 `CCraft-恢复备份.ob`。正常导出继续按作品名称命名。后端下载头中的通用 `project.ob` 和按作品名编码的 `filename*` 继续沿用。[默认作品名](../../apps/web/src/openblock.ts)、[导出名称](../../apps/web/src/editor-protocol.ts)、[恢复备份](../../apps/web/src/extensions/library.ts)、[下载响应](../../apps/api/src/projects/projects.controller.ts)

API 错误目前主要是通用项目、校验、归档和硬件诊断文案。服务端 `OpenBlock` 相关命中集中在格式枚举、MIME 常量和媒体类型提示。例如 415 消息中的 `application/x.openblock.ob` 是调用者可使用的媒体类型，应保持准确。页面里的“无法读取 OpenBlock 项目”“OpenBlock 启动失败”等由前端生成，直接在前端改为 CCraft 即可。已有错误码和 `{error:{code,message,details?}}` 响应继续复用。[API 常量](../../apps/api/src/config.ts)、[服务端错误](../../apps/api/src/common/api-error.ts)、[媒体类型校验](../../apps/api/src/projects/projects.controller.ts)、[前端错误入口](../../apps/web/src/openblock.ts)

以下内部兼容标识需继续沿用。

| 范围 | 保留内容及原因 |
| --- | --- |
| 父页与 iframe 消息 | `protocol:'cfzn.openblock'`、`version:1`、现有消息类型和载荷字段、`requestId`、same-origin/source 校验。两侧握手与请求分发依赖这些值。可见错误文本可以改品牌。 |
| HTTP 与存储格式 | `/api/v1/projects` 等现有路由、`Project.format:'openblock'`、`OPENBLOCK_MEDIA_TYPE` 对应的 `application/x.openblock.ob`，以及可接受的 `application/octet-stream`。本地存储会校验格式值。 |
| 完整归档 | `.ob` 导出及兼容 `.sb3` 导入、根 `project.json`、目标/积木和造型声音素材、`device`、`programMode`、`extensions`、`deviceExtensions`，以及 `cfzn/editor.json` 的版本、代码模式与手稿。品牌文字不触发作品迁移。 |
| 编辑与保存状态 | `documentId`、`editVersion`、dirty、项目 UUID、revision/ETag 与 If-Match。品牌显示更新继续作为界面展示处理。 |
| 资源及挂点 | `/openblock.html`、`/openblock-vendor/`、`window.CFZNOpenBlock`、`window.CFZNDeviceMetadata`、已有 CSS/DOM 标识和源码匹配片段。新 Logo 可经品牌资源入口接入，现有加载与适配路径继续工作。 |
| 包、构建和引擎 | `openblock-gui`、`openblock-vm`、相关第三方包名、固定版本/完整性校验及来源记录。GUI 的可见品牌按精确挂点调整，VM 和 Blockly 的源码及打包模块继续逐字节核对。 |
| 硬件与私有模块 | 已注册设备/扩展 ID、profile、FQBN、schemaVersion 和代码 opcode。品牌替换沿现有真实执行、恢复和所有者访问路径使用这些身份。 |

边界依据为当前桥接、项目存储和准备实现。[消息协议](../../apps/web/src/editor-protocol.ts)、[消息验证](../../apps/web/src/editor-bridge.ts)、[格式校验](../../apps/api/src/projects/local-project.store.ts)、[归档帮助层](../../apps/web/src/editor-archive.ts)、[精确 GUI 挂点](../../apps/web/scripts/openblock-hooks.mjs)、[资源准备](../../apps/web/scripts/prepare-openblock.mjs)

第三方许可继续保留原始项目名称、版权归属和条款。准备脚本会把固定上游的 `LICENSE`、`LICENSE.MIT`、`TRADEMARK` 复制到 `openblock-vendor`，同时保留 React/ReactDOM 的许可证及 `cfzn-extensions` 中随附的许可和来源记录。部署打包复制完整前端 dist，这条携带链应一并验收。随附 `TRADEMARK` 对 Devil Bird 图形另有说明，CCraft 品牌资产应采用自己的 Logo，许可文件中的 OpenBlock 名称和归属继续按原文提供。[许可复制](../../apps/web/scripts/prepare-openblock.mjs)、[上游商标文件](../../.runtime/web-openblock/openblock-vendor/TRADEMARK)、[已有扩展来源记录](../../apps/web/vendor/SOURCES.md)、[部署打包](../../deploy/package.mjs)

主控冻结后，前端与独立测试聚焦以下检查即可。

- 检查页面标题、启动/失败/未就绪/关闭/导入文案、iframe 名称、Logo 及 alt、无标题回退下载名和恢复备份名中的 CCraft 显示。
- 真实父页与 iframe 握手成功，打开、导入、编辑、保存、导出及失败恢复保持可用。旧 `.ob` / `.sb3` 和已有本地项目可继续加载，完整素材及手稿保留。
- 比对请求中的协议值、MIME、`format`、归档结构和 revision 行为，确认纯品牌展示不使作品 dirty。
- 核对构建产物中的许可原文、来源记录和第三方模块身份，VM/Blockly 字节边界通过。

本轮只新增本设计文件，未修改实现或运行测试。界面品牌覆盖范围与最终 Logo 资产由前端设计和主控确定。
