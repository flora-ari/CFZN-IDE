# CFZN-IDE v0.1 后端接口设计提案

状态：设计提案已交付；2026-11-06。本文仅设计，不包含服务实现。

> 实现以 [`../api-contract.md`](../api-contract.md) 的主控冻结契约为准，覆盖本文原始建议中的差异：单项响应为 `{project: ...}`，metadata 增加 `format: 'openblock'`；ETag 为引号内 revision；名称至多 100 字符；压缩包上限 20 MiB、project.json 上限 5 MiB；对应错误码采用 `PRECONDITION_REQUIRED`、`PAYLOAD_TOO_LARGE`、`INVALID_PROJECT`。主控另接受 GET content 可选 If-Match。本文后面的存储提交顺序、前端保存时序和适配边界仍供实现参考。

## 1. 结论与范围

采用 Node.js + TypeScript + NestJS（Express adapter），提供本机匿名项目 REST API。以 JSON 元数据和完整 OpenBlock 项目归档保存项目；重启服务后可继续列出、打开、修改、删除和导出。默认监听 `127.0.0.1`，前端通过开发代理访问 `/api/v1`。这是单进程、本机共享项目空间；所有访问该实例的浏览器看到同一批项目，不按浏览器或人划分数据。

本轮不记录用户、不做登录鉴权、不连接 Python 大后端、SQL 或 OSS。Web Serial 连接、授权、读写与终端显示全部在浏览器，后端不枚举或连接用户电脑串口，也不设计串口 WebSocket/设备 REST 服务。

核心接口只有项目列表、创建、元数据、重命名、完整内容替换和删除。导入复用创建，导出复用内容读取，不增加缩略图、历史版本、多人协作、搜索或分页服务。

## 2. 格式依据：原生 `.ob`，兼容 `.sb3` 输入

已核对 OpenBlock 官方源码：

- `openblock-vm/src/virtual-machine.js` 的 `saveProjectSb3()` 使用 ZIP，写入 `project.json`、`serializeSounds()` 和 `serializeCostumes()` 返回的全部文件，返回 Blob，MIME 为 `application/x.openblock.ob`。
- 同文件的 `loadProject(input)` 接受 ArrayBuffer，并经解析器将项目 JSON 和 ZIP 中的素材交给反序列化流程。
- `openblock-gui/src/containers/sb3-downloader.jsx` 调用该函数，但下载后缀为 `.ob`，不是 `.sb3`。

因此 API 使用通用 `/content` 路径。原生导出扩展名为 `.ob`，接受 `.ob` 和 `.sb3` 归档输入；接受 `.sb3` 表示容器结构可读，不承诺所有 Scratch/OpenBlock 扩展在其他编辑器中可运行。服务端保留上传的归档原始字节，不重打包、不删除未识别的 JSON 字段或 ZIP 项。

仅存 Blockly XML、blocks 对象或 `vm.toJSON()` 会丢失素材二进制，不满足本项目要求。新建项目同样先由前端载入 OpenBlock 默认项目，再调用 `vm.saveProjectSb3()`，将有效完整包交给后端；后端不维护第二套默认积木项目模板。

## 3. HTTP 契约

统一前缀 `/api/v1`。成功 JSON 不增加 `data` 包装。UTF-8 JSON；日期为 UTC ISO 8601；项目 ID 由服务端生成 UUID。请求不包含 owner、userId、token、存储路径或 OSS key。

| 方法与路径 | 请求 | 成功响应 | 语义 |
| --- | --- | --- | --- |
| `GET /projects` | 无 | `200 { items: ProjectMetadata[] }` | 按 updatedAt 降序、id 升序排序；空列表返回 items 空数组 |
| `POST /projects` | multipart：必填 `name`、单个 `file` | `201 ProjectMetadata`，Location、ETag | 新建或导入，保存完整包后才成功；revision 为 1 |
| `GET /projects/:id` | 无 | `200 ProjectMetadata`，ETag | 读取元数据 |
| `PATCH /projects/:id` | JSON `{ "name": "新名字" }`，必填 If-Match | `200 ProjectMetadata`，ETag | 仅重命名；成功时 revision 加 1 |
| `GET /projects/:id/content` | 可选 If-Match | `200` 完整归档字节，ETag | 打开或导出，同一内容接口 |
| `PUT /projects/:id/content` | raw `application/octet-stream`，必填 If-Match | `200 ProjectMetadata`，ETag | 原子替换完整包，保留 name、createdAt；revision 加 1 |
| `DELETE /projects/:id` | 必填 If-Match | `204`，无响应体 | 删除项目及归档 |

`POST` 的 multipart 文件字段固定叫 `file`；文件名允许 `.ob`/`.sb3`（大小写不敏感），MIME 只是提示，以归档内容检查为准。`PUT` 是原始二进制，不是 JSON/base64 或 multipart。前端 `FormData` 由浏览器生成 Content-Type/boundary；不要手写 boundary。

`GET /content` 响应：

```http
Content-Type: application/x.openblock.ob
Content-Disposition: attachment; filename="project.ob"; filename*=UTF-8''...
Content-Length: <归档实际字节数>
ETag: "<project-id>:<revision>"
Cache-Control: no-store
```

`filename*` 从项目名安全编码并添加 `.ob`；ASCII fallback 固定 `project.ob`，不得把未处理的名字放进响应头或磁盘路径。浏览器通过 fetch 读取 ArrayBuffer 打开时，attachment 不会阻碍程序读取。元数据响应也使用 `Cache-Control: no-store`。同源开发代理优先；确需直连时 CORS 只允许已配置的开发前端 origin，并允许 If-Match、暴露 ETag。

### ProjectMetadata

```json
{
  "id": "fc85ba38-bdb3-4cca-b97a-9c9ac0df4408",
  "name": "LED 闪烁",
  "revision": 3,
  "createdAt": "2026-11-06T09:00:00.000Z",
  "updatedAt": "2026-11-06T09:05:00.000Z",
  "sizeBytes": 14208
}
```

`revision` 为从 1 开始的安全整数；每次成功 PATCH/PUT 都递增，即使提交内容相同。`sizeBytes` 是归档压缩后的字节长度，重命名不改变此字段。名称先 trim，须包含 1–120 个 Unicode 码点，允许中文和同名项目，拒绝控制字符。PATCH 未知字段、空 body、非字符串 name 返回 400。内部元数据可额外保存 schemaVersion 和归档文件引用，但这些字段不出现在 HTTP 响应。

### 并发与客户端流程

ETag 使用强标签 `"<id>:<revision>"`，客户端保存服务器返回的完整值，不自行拆装。PATCH、PUT、DELETE 缺少 If-Match 返回 428；标签过期返回 412，不修改任何已提交文件。v0.1 只接受一个具体强 ETag；不支持 `*`、弱标签或标签列表，非法格式返回 400。不存在的项目优先返回 404。

服务端的版本检查和提交必须在同一个项目写锁内，不能先检查、放锁再落盘。单进程使用按项目 ID 的异步互斥即可；无需 Redis、分布式锁或数据库事务。

前端打开：GET 元数据 → 使用该 ETag 请求 GET content → `vm.loadProject(arrayBuffer)`。GET content 的 If-Match 是可选读前提：提供时版本不匹配同样返回 412，前端重新获取两者，避免元数据和包来自不同保存时刻。不提供时直接返回最新完整包及其 ETag。

前端保存：`vm.saveProjectSb3()` → PUT content + 当前 ETag → 用返回的完整 metadata/ETag 更新状态。保存完成后，只有编辑状态仍与本次序列化快照一致才清除 dirty 标记；若上传期间又编辑，仍保留待保存状态。首次保存使用 POST；导入文件可直接 POST 为新项目；导出直接下载 GET content。重命名与保存对同一项目串行发出，前一次响应更新版本后再发下一次。

412 时保留当前编辑内容，提示重新打开或另存为新项目；不要自动覆盖远端版本。网络中断后的 PUT 不盲目重发：先 GET 确认当前版本。POST 无幂等键，重复提交会创建新 ID；前端提交中禁用重复点击，v0.1 不引入幂等记录表。

## 4. 错误体与输入限制

业务错误和框架错误统一为以下结构；不得把磁盘绝对路径、异常堆栈放进 message。

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "项目已被其他窗口更新，请重新打开或另存为新项目。",
    "details": { "currentRevision": 4 }
  }
}
```

`error.code` 是客户端判断依据；message 可本地化；details 仅在有用时存在。

| HTTP | code | 触发条件 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 名称、ID、请求字段、multipart 形态或 If-Match 格式非法；details 可含 field |
| 404 | `PROJECT_NOT_FOUND` | 项目不存在或已删除 |
| 412 | `REVISION_CONFLICT` | If-Match 与当前版本不匹配；details 含 currentRevision |
| 413 | `PROJECT_TOO_LARGE` | 压缩归档、解压内容、project.json 或 ZIP 项数超出上限 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 请求 Content-Type 不支持，或 POST 文件后缀不是 .ob/.sb3 |
| 422 | `INVALID_PROJECT_ARCHIVE` | ZIP/JSON 无法解析、缺 project.json、必要结构错误、素材引用缺失 |
| 428 | `REVISION_REQUIRED` | 修改/删除未提供 If-Match |
| 500 | `STORAGE_ERROR` | 文件读写失败、已存文件损坏或不完整；保留此前已提交版本 |
| 500 | `INTERNAL_ERROR` | 其他未预料错误 |

建议默认值（产品选择，可通过服务端配置集中调整）：

| 项目 | 默认上限 |
| --- | --- |
| 单个压缩归档 | 25 MiB（26,214,400 字节） |
| ZIP 总解压字节 | 100 MiB |
| 单个 project.json 解压后 | 8 MiB |
| ZIP 文件项数量 | 2,000 |
| JSON 重命名请求体 | 8 KiB |
| multipart | 1 个文件、1 个 name 文本字段；name 字段 UTF-8 至多 1 KiB |

超限在提交前拒绝。对上传流本身设置大小限制，而不是等全部读取后才检查。Multer 可将 POST 文件流式写入本地临时目录；PUT 以有界流写入同目录。ZIP 校验时同样累计实际解压字节，不只相信中央目录声明。

校验只做保全归档与可读性的必要检查：ZIP 可完整读取、恰好一个根级 project.json、JSON 根为对象且有 targets 数组、其 costume/sound 资源引用在包内存在。根据 `md5ext`，或 `assetId + '.' + dataFormat` 找到素材，允许多个目标引用同一文件。未知项目字段、设备字段、扩展 ID 保留；不套用过严的 Scratch-only schema，也不在后端执行 VM 或扩展代码。

归档不展开到项目目录。检查 ZIP 项名，拒绝绝对路径、`..` 路径段、反斜杠路径及重复项名，避免歧义；不从浏览器文件名或 ZIP 项名构造磁盘写入路径。不要增加内容审查、病毒扫描或未提出的素材转码流程。

## 5. 本地存储与提交规则

配置 `PROJECT_DATA_DIR`，开发默认项目根目录下 `.runtime/project-data`，由服务启动时解析为绝对路径。该目录不进入 git。磁盘路径只由服务端 UUID 和固定文件名组成。下面的层级用路径表表达：

| 路径 | 用途 |
| --- | --- |
| `<data>/projects/<id>/metadata.json` | 当前项目元数据；包含 schemaVersion=1、公开字段和 archiveFile 引用 |
| `<data>/projects/<id>/<archive-uuid>.ob` | 当前完整项目包；不可变文件，保存时生成新文件 |
| `<data>/tmp/<upload-uuid>` | 未提交上传/校验文件，随机名 |
| `<data>/trash/<delete-uuid>` | 删除时临时移入的项目目录；不对外展示，无恢复功能 |

不建立全局 JSON 索引，列表扫描项目目录读取 metadata.json，避免保存项目时还要同步第二份索引。此实现面向本地小规模项目，不提供跨进程或多副本共享目录的写入保证。

**创建/保存事务的可见边界：** 上传并校验临时包 → 获得项目写锁 → 校验当前 revision → 将包移到该项目的新归档名 → 写完整临时元数据 → 同文件系统 rename 替换 metadata.json → 返回成功。元数据指针切换前旧项目仍可用；切换后只读取新包。新建项目可先在临时目录准备完整项目目录，再 rename 到 projects/<id>，未完成目录不得出现在列表里。

重命名只原子替换元数据，继续引用原包。旧包在提交后删除；若请求提交前失败，清理本次临时文件且保持旧 metadata。删除在锁内检查版本后，将整个项目目录 rename 到 trash，再进行删除；项目随 rename 从可见列表消失，清理失败不能让其重新出现。重启时清理未提交临时文件、trash 和未被 metadata 引用的旧归档，不提供历史版本接口。

这些规则避免普通保存失败或进程中断形成新元数据搭配旧素材；不宣称防断电数据库级持久性。实现应在 Windows 本地磁盘上验证 rename 行为。读取内容时先取得该次 metadata 对应的文件句柄，防止随后清理旧包导致正在读取的请求失效。

## 6. 模块与未来适配边界

推荐 NestJS 项目内部结构：

| 路径 | 职责 |
| --- | --- |
| `apps/api/src/projects/projects.controller.ts` | HTTP、DTO、ETag 和响应头 |
| `apps/api/src/projects/projects.service.ts` | 创建、重命名、保存、删除、revision 规则 |
| `apps/api/src/projects/project-store.ts` | 项目存储接口及内部记录类型 |
| `apps/api/src/projects/local-project.store.ts` | JSON + 归档文件、锁和提交顺序 |
| `apps/api/src/projects/project-archive.validator.ts` | .ob/.sb3 ZIP 与素材完整性检查 |
| `apps/api/src/common/api-exception.filter.ts` | 统一错误体 |
| `apps/api/src/config.ts` | 数据目录、端口、大小限制、允许的 origin |

保留一个 `ProjectStore` 抽象即可，覆盖 list/read/readContent/create/rename/replaceContent/delete；更新操作接收 expectedRevision，并要求适配器原子比较和提交。Controller 不引用 fs，不知道磁盘路径；Service 不直接引用 OSS SDK。v0.1 无需同时抽象元数据库、对象仓库、用户仓库和事务协调器。

将来收到 Python 大后端的真实用户信息、存储位置及调用约定后，再定义可信请求上下文与身份校验，确定 metadata 的归属权来源、项目列表查询来源、OSS 凭证/签名 URL 模式及所有权验证，然后新增相应 ProjectStore 适配器。不能直接信任前端自报 userId，不能现在猜测 Python URL、JWT 字段、bucket 命名或永久凭证。

现有匿名项目不会自动属于未来第一个登录者。是否迁移及绑定给谁，由之后的产品和 Python 契约确定；当前仅保证可完整导出迁移。前端仍调用同一组项目接口，不依赖本地存储路径，因此后续替换存储无需改写编辑器 VM 保存方式。

## 7. v0.1 验收契约

必须使用含自定义造型和声音的真实 OpenBlock 导出 fixture，不能只用空 blocks JSON 证明保存成功。

1. POST 完整 fixture → 201/revision=1 → 列表含该 ID → GET content 与上传字节完全一致；重启后仍一致。
2. 下载包可由实际 OpenBlock VM 打开，积木、角色/设备、自定义造型、声音都保留。此项由浏览器集成测试或明确的人工验收完成，服务端测试不能代替真实 VM 打开。
3. PUT 修改后的完整包 → revision=2 → 导出与第二个包一致；PATCH 名称 → revision=3，包字节和 createdAt 不变。
4. 同一 revision 并发两次 PUT，恰好一次成功、另一次 412；错误请求不覆盖成功请求；缺 If-Match 返回 428。
5. 上传缺 project.json、损坏 ZIP、缺引用素材或超限包时拒绝，并可继续下载此前已保存的包。
6. 模拟提交前文件写入失败，旧 metadata 和旧包仍匹配；元数据切换后的重启仍读取新包。
7. DELETE 正确版本 → 204；随后详情/content 返回 404、列表不含该项；删除不存在 ID 返回 404。
8. 导入 `.sb3` 与原生 `.ob` 均走 POST；不改写未知项目字段，导出为完整 `.ob`。

## 8. 主控冻结项

已与主控对齐：`.ob` 原生包、`.sb3` 输入兼容、POST multipart(name+file)、PUT raw octet-stream、GET/PUT `/content`、PATCH 仅名称、修改返回完整 metadata、简单 items 列表、localhost 匿名共享存储。

剩余实现选择可由主控直接裁决，无需向用户增加确认步骤：采用本文建议的大小限制；ETag 具体格式；数据目录默认路径；归档校验库。若时间有限，保留完整包、文件提交原子性及并发版本检查，优先删减非必要 UI 展示，而不是退化为只存积木 JSON。

## 9. 核对来源

- [OpenBlock VM：virtual-machine.js](https://github.com/openblockcc/openblock-vm/blob/main/src/virtual-machine.js)，本次读取文件 blob SHA `d278803993756d5799fccf097758393e0fb459fb`；重点为 loadProject、saveProjectSb3、toJSON。
- [OpenBlock GUI：sb3-downloader.jsx](https://github.com/openblockcc/openblock-gui/blob/main/src/containers/sb3-downloader.jsx)，本次读取文件 blob SHA `f7da72070ba8443559a697fdac105c92b7f0c502`；默认下载 `.ob`。
- [NestJS 官方文件上传文档](https://docs.nestjs.com/techniques/file-upload)，支持 Express 的 FileInterceptor/Multer、文件数量和大小限制以及磁盘暂存。具体依赖版本由实现阶段锁定，本文不依赖新版本专属存储 API。

格式与 VM 行为来自源码核实；接口、限制、提交策略和模块划分为本项目设计建议，不是 OpenBlock 官方后端协议。
