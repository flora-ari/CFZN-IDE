# CCraft IDE 与创客后端接口对齐

## 实施边界

现有 CFZN-IDE NestJS 提供同源 `/api/v1/ide/` 和 `/api/v1/projects`，按附件实现对外协议。Nest 通过创客平台现有认证端点核验登录与门户 Bearer，并复用其用户 ID 与资料。Nest 管理 IDE 会话、SSO 票据、项目归属与配额，项目归档写入服务器 MinIO。旧的自定义模块、Arduino 库、健康检查和本机硬件继续走各自已有入口。附件原文中的 Django 应用、私有磁盘归档和两条反代规则是提供方实现示例。本轮实现以用户明确指定的 NestJS、现有 Maker 账号和 MinIO 为准。[接口文档](<C:/Users/flora/Documents/xwechat_files/wxid_rvfqo48ircxo22_fddf/msg/file/2026-11/ide-integration-api.md>)

Maker `/api/v1/ide/…` 返回 404 符合此拓扑。预发布核实 Maker 现有 `/api/v1/auth/` 里的登录和当前用户接口、可用于验证门户 Bearer 的真实路径、身份字段与受限账号信号。MinIO 内网地址、私有 bucket、服务账号权限和健康检查由主控核实。上线验收需确认 Nest 使用实际账号服务，并从指定 MinIO bucket 读回真实测试归档。

## 后端契约

| 边界 | 统一规则 |
| --- | --- |
| 身份与用户信息 | 登录把账号密码提交给配置的 Maker 登录端点，拿到其验证结果和用户资料；门户发票时以 Maker 的当前用户端点验证传入 Bearer。以 Maker 用户 ID 的确定性表示作项目 owner。/me 返回取自 Maker 的 UserSerializer 资料；核对真实响应形状再定解析。需要保存的会话快照只包含必要公开字段，不同步密码、账号表或权限表。若 Maker 支持查询当前账号状态则用它刷新公开资料与受限状态，凭据失效和连接失败区分处理。 |
| IDE 会话 | 密码登录和票据兑换均可签发 IDE 自有凭据，附件的响应字段和 Cookie 属性保持一致。门户 Bearer 仅用于发票，不依赖它取得 Maker 刷新凭据。IDE 受保护接口优先验证自身签发的 Bearer，再使用 IDE access Cookie；验证签名、用途、期限与有效会话。将 `cfzn_ide_refresh` 或 JSON refresh 绑定 IDE 会话，服务端只保存可用于比较的摘要，轮换时原子失效旧凭据。退出撤销 refresh、清除两种 Cookie，失败不可报告成功建立会话。会话默认 access 120 分钟、refresh 7 天。 |
| 单次 SSO | `POST /api/v1/ide/auth/sso-ticket/` 用 Maker Bearer 校验真实账号，再发 90 秒随机票据，持久记录摘要、owner、过期时间和消费状态。每个账号同一时刻只有最新票据有效。兑换原子消费，两个并发兑换至多成功一次，无效票据统一返回 `401 INVALID_SSO_TICKET`。门户入口使用配置的 IDE HTTPS origin。门户若直接由浏览器跨域发票，只对该路径允许已配置门户 Origin 的 `OPTIONS` / `POST` 和 `Authorization` / `Content-Type` 请求头，禁止跨域 Cookie。服务器调用直接传门户 Bearer。 |
| 写入来源与限流 | 对依赖浏览器 Cookie 的写操作校验配置的确切 IDE Origin，含登录、刷新、退出、SSO 兑换和 multipart 写入；使用有效 Bearer 的接口调用按对应认证路径执行。保留附件的登录、发票和项目限流，项目大请求在读取请求体前校验身份及请求来源。Maker 网络或协议故障不会被当作密码错误或匿名访问。接口错误统一保留 `{error:{code,message}}` 和约定状态。 |
| MinIO 对象与项目元数据 | 归档对象以服务端生成的不可猜测新 key 存入私有 bucket。每次保存上传完整新对象，保存 `size`、SHA-256、MIME、owner、版本与对象指针。持久元数据提交后才报告成功和清理旧对象。并发冲突或元数据提交失败时仍能读到旧完整归档。重启后继续清理时，先确认对象没有活动引用。下载经 Nest 鉴权和版本检查，再从 MinIO 获取相同版本的 ZIP 字节，返回 ETag、`nosniff`、`no-store` 和附件头。并发保存时固定该次下载的版本及对象，避免旧对象先被清理导致合法下载失败。 |
| 并发和归属 | 每次查询先按服务端验证的 owner 限制范围，未知或其他账号项目返回同一 404。创建和保存按 owner 序列化检查配额；同一项目写入在同一提交点比较 `If-Match`、核对并切换版本和指针。单实例部署可复用文件元数据的持久原子替换模式，并由 owner 锁保护账户总额，项目元数据独立于旧匿名目录。若运行多实例，使用共享事务数据库或等价跨进程条件提交。删除先提交元数据不可见，再重试移除对象。仅 PUT 内容递增 revision，PATCH 改名只更新时间。默认单项目 64 MiB、每用户总额 1 GiB、项目数 200。 |

## 前端契约

| 入口或行为 | 统一规则 |
| --- | --- |
| 首页 `/` | 先请求 `/api/v1/ide/auth/me/`。认证通过才挂载现有编辑器 iframe。401 尝试恢复会话后仍未认证则进入 `/login`，网络失败、404、5xx 显示服务不可用和重试。可继续保持已认证用户的 GUI 预加载速度。 |
| `/login` | 提交 `POST /api/v1/ide/auth/login/` 的 `{username,password}`。成功确认 Cookie 会话并返回 `/`。显示创客后端返回的昵称或用户名，账号信息仅保留在当前应用会话。认证页可独立加载，避免预下载编辑器大包。 |
| `/sso?ticket=…` | 本页读取一次票据，立即 `history.replaceState` 清除查询参数，再向 `/api/v1/ide/auth/exchange/` 提交 `{ticket}`。成功确认会话并 `location.replace('/')`。缺失、失效、复用均提供返回门户的路径。网络结果不明时先查 `me`，结合原会话确认结果。SSO 页面使用 `Referrer-Policy: no-referrer`，服务器访问日志避免记录票据参数。门户发票据使用门户 Bearer。 |
| 直接打开 `/openblock.html` | 正常同源 iframe 保留现有 URL、VM 和桥接。在 HTML 早期判断顶层打开并转到 `/`，让合法的直接访问也进入同一登录和项目流程；避免运行原来没有项目宿主的顶层编辑器。静态 HTML 返回 200 的发布检查可以继续使用。 |
| Cookie 与刷新 | 所有平台请求使用 `credentials: 'same-origin'` 与 `cache: 'no-store'`。Nest 设置生产 `Secure`、`HttpOnly`、`SameSite=Lax` 的 IDE 同源 Cookie。access 路径 `/api/`，refresh 路径 `/api/v1/ide/auth/`。仅 `me` 或项目认证 401 可触发 `POST /api/v1/ide/auth/refresh/`，单页共享一次刷新，完成后重新查 `me`。普通读请求最多重试一次，失败或结果未知的写请求保留待保存状态并交由用户重试。密码、JSON 令牌和票据由页面短暂使用。 |
| 会话过期、退出和切换账号 | 已挂载编辑器保留当前未保存内容和本地导出，暂停账户项目操作，提供重新登录。重新认证仅在用户 ID 相同的情况下恢复旧项目关联。退出调用 `/api/v1/ide/auth/logout/`，先处理未保存作品，再清空账号、项目列表和活动项目。跨标签会话变化应使其他标签重新核验 `me`，账号变化时作废旧列表和请求结果。跨标签恢复后应先核验账号再写。 |

启动与顶层入口由 [外壳](../../apps/web/src/App.tsx)、[首页](../../apps/web/index.html)、[编辑器 HTML](../../apps/web/openblock.html) 配合。附件明确登录响应带 `user.id`、`username`、`display_name` 等字段，未指定 `me` 的包裹。主控可冻结 `GET /api/v1/ide/auth/me/` 直接返回 `user` 对象，`id` 采用 Maker 已验证字段类型，登录与兑换响应保留附件的 `{access,refresh,expires_in,user}` 外层。

## 项目协议和限额

- 客户端继续使用相对 `/api/v1/projects`、multipart `name` / `file`、完整二进制归档、MIME `application/x.openblock.ob`、`encodeURIComponent(id)` 和带引号的 `If-Match`。项目 ID 为不透明且非自增的公开值。带与不带斜杠的项目请求应由 Nest 处理。下载的原始 `ArrayBuffer` 继续交给 `LOAD_PROJECT`。现有方法见 [项目客户端](../../apps/web/src/api.ts)。
- 列表含 `id`、`name`、`revision`、`size`、`updatedAt`。详情含附件列出的 `checksum`、`contentType`、`createdAt`、`savedAt` 等字段，网络层将 `size` 归一为 IDE `sizeBytes`，兼容明确开发模式的历史字段。PUT 必须携带 `If-Match`，缺失返回 428。GET 内容、PATCH、DELETE 允许省略，现有客户端继续发送；错误码为 `412 REVISION_MISMATCH`，前端同时识别原先的 `REVISION_CONFLICT`，保留“重新载入”和“另存为”。状态以真实响应为准。412、413、认证失效、配额和网络故障保留当前编辑。继续复用旧 Nest 归档结构校验，保持完整 ZIP、素材与编辑器元数据，核对有意义的 64 MiB 合法归档能通过现有展开量等规则。
- 单归档上限 **67,108,864 字节（64 MiB，含边界）**。编辑器文件选择和外壳导入在读入前判断 `File.size`，项目新建和 PUT 前判断 `ArrayBuffer.byteLength`，本地导出仍可用。将前端两处旧 20 MiB 检查统一到一处常量。Nest 的 multipart、raw 解析以及应用实际读取字节数同时受限。最大值 + 1 返回 `413 PAYLOAD_TOO_LARGE`，总额拒绝保留 `STORAGE_QUOTA_EXCEEDED`，空归档使用 `400 EMPTY_PROJECT`。Nginx 项目位置允许 80m 以容纳 multipart。现有位置见 [外壳](../../apps/web/src/App.tsx)、[原生导入](../../apps/web/src/openblock.ts)、[本地项目接口](../../apps/api/src/projects/projects.controller.ts)。
- 旧项目按原 `PROJECT_DATA_DIR` 在切换前备份。匿名 UUID 无账户归属，生产列表只显示已认证账号的项目。归属确认后可受控导出 `.ob` 并由用户导入自己的账户，新建账号项目，原件继续保留。私有自定义模块按既有浏览器会话认定归属。生产启动应明确启用账号项目模式，缺配置即报错；仅显式本地开发或测试可启用历史匿名模式。[本地存储](../../apps/api/src/projects/local-project.store.ts) · [模块归属](../../apps/api/src/custom-modules/module-access.ts)

## 部署和验收

1. **预发布检查。** 核实 Maker 现有账号接口和 MinIO 私有 bucket，备份原匿名目录，并为新版项目元数据配置持久位置。Nest 生产配置使用 IDE 的 HTTPS Origin、`IDE_SSO_ENTRY_URL=https://ide.xiaodaiyang.top/sso`、安全 Cookie、Maker 认证地址和专用 MinIO 凭据，通过服务端环境注入。先验证 Nest 匿名 me 和项目列表返回 JSON `401 UNAUTHORIZED`，再用真实测试账号验证密码登录、SSO、归档往返和对象落点。模拟接口可用于本地构建和交互验收。
2. **按原部署脚本发布。** 整段 `/api/` 保留到现有 Nest 服务。`location = /api/v1/projects` 和 `location ^~ /api/v1/projects/` 使用同一个 Nest upstream，仅提高请求体为 80m 并设置上传超时，完整透传版本头、Cookie、`Set-Cookie`、状态和 ETag；认证请求走普通 Nest location。`/login`、`/sso` 及其约定尾斜杠各自映射静态入口。Vite 开发和预览继续把 `/api` 代理给 Nest。站点改动落在发布脚本，切换前运行 `nginx -t`。[安装脚本](../../deploy/install-server.sh) · [PowerShell 发布入口](../../deploy/Deploy-Ide.ps1) · [Vite 配置](../../apps/web/vite.config.ts)
3. **加独立发布检查。** 保留 `/api/v1/health` 和 `/api/v1/custom-modules` 检查，另测登录和 SSO 页面及 `me`、项目列表匿名的约定 401。安装器验证预期 401 的状态与 `error.code`，这部分纳入现有回滚触发范围，并从公网复核同一入口。用真实浏览器验证登录与账号展示、缺失及失效 SSO、直接打开原编辑器 URL、主动退出及恢复、项目新建、保存、重开、重命名和删除。确认 Maker 同一身份经密码及 SSO 进入同一项目库，并测两用户越权 404、并发写 412、配额、64 MiB 和超出一字节。核对实际 MinIO 对象、返回内容 SHA-256 与重启后读取。保留其他 IDE API 回归结果。
4. **回滚。** 保留之前的 IDE `current`、Nginx、服务配置与账号项目元数据和 MinIO 对象。首次切转在接受真实用户写入前可由现有脚本还原版本。切转后需要回退时，优先使用仍支持账号项目的已验证版本，必要时暂停写入后修复。保留已经提交的项目及归属供恢复。

主控在 `docs/api-contract.md` 冻结后的事项按文件归属交前后端开发，再进入独立验收。当前文件为接口对齐提案。
