# 创客账号、SSO 与项目持久化接入提案

> 用户澄清前的初稿。最终采用 IDE NestJS 实现及 MinIO 存储，见 [主控冻结契约](../api-contract.md#创客账号minio-与项目-api2026-11-25-主控冻结)。

2026-11-25（Asia/Shanghai）。主控：`01a21045-9e41-7a42-96d2-09242981eb1d`。仅设计，公共契约由主控冻结。

## 结论与证据范围

采用附件推荐的同源分流：IDE 静态页面继续由现站点提供，`/api/v1/projects` 及其子路径、`/api/v1/ide/` 交给创客平台后端。账号校验、Cookie/JWT、SSO 票据、项目归属与持久化均由创客后端负责；Nest 不再为这两类生产请求自建一份用户或存储实现。本轮用户明确要求接入账号，已进入原“第一阶段匿名存储”之后的新阶段。

附件明确写明“IDE 侧无需自建用户体系或对象存储”。其实现方案为数据库元数据加 `IDE_PROJECT_ROOT` 私有目录，默认 `<backend>/private/ide-projects`，并非已经确认接入 OSS。**存储能力由创客后端提供，IDE 本轮不直连 OSS、不申请上传凭证、不拼接公开文件 URL。** 若创客后端以后改用 OSS，应在既有鉴权下载/保存接口内部完成，不让前端依赖其实现。

依据为用户提供的 [ide-integration-api.md](<C:/Users/flora/Documents/xwechat_files/wxid_rvfqo48ircxo22_fddf/msg/file/2026-11/ide-integration-api.md>)、本仓库源码与发布脚本。本仓库没有附件所述 `maker-platform-back/apps/ide` 源码；对可访问的 `D:/CFZN` 文件目录检索也未找到其 `auth_views.py` 或 `manage.py`。因此附件中数据库行锁、票据消费、配额、私有文件原子替换及测试数量属于提供方声明，不能写成已审计或已联调通过。

主控给出的公网 `/api/v1/ide/auth/me/` 返回 404 是当前接入差异。按附件，路由存在但未登录应返回 `401 UNAUTHORIZED`；404 不能解释为正常未登录。需主控核对实际 upstream、运行版本、URL 注册与代理路径，不能靠前端假用户、吞掉 404 或回落匿名存储掩盖。仅迁移数据库不能证明该路由已注册。

## 项目契约兼容性

当前 [项目客户端](../../apps/web/src/api.ts) 已使用相同方法、相对路径、multipart `name`/`file`、完整二进制内容和带引号 `If-Match`。请求主体可复用，但附件“项目客户端保持不变”的结论不能直接覆盖当前源码，以下差异需要主控冻结：

| 项目 | 当前 CFZN 实现 | 附件创客契约及最小适配 |
| --- | --- | --- |
| ID | Nest 要求 UUID | 创客为不透明 hashid。前端继续 encodeURIComponent，不验证 UUID；生产请求不能再经过本地 projectId 校验 |
| 大小字段 | `sizeBytes` | 创客为 `size`。前端网络边界明确转换，兼容保留的本地 `sizeBytes`；不要把缺失字段静默变为 0 |
| 其他元数据 | `format: openblock`、createdAt/updatedAt | 创客为 contentType/checksum/savedAt 等；客户端模型区分列表摘要与详情，format 可在适配层按归档协议固定，不要求提供方增加旧字段 |
| 列表 | 本地返回完整 Project | 附件例子仅 id/name/revision/size/updatedAt。列表展示不应依赖未承诺的 createdAt、checksum 等详情字段 |
| 重命名 revision | 本地 rename 调用 advance，revision +1 | 创客仅 PUT 内容 +1，PATCH 不增版本。客户端接受响应的实际 revision，不自行 +1，不改变提供方语义 |
| 版本冲突 | `412 REVISION_CONFLICT` | 创客 `412 REVISION_MISMATCH`；前端同时识别两个明确 code，保留重新载入或另存为，不能静默覆盖 |
| If-Match | 本地 PUT/PATCH/DELETE 必填；GET 内容可选 | 创客仅 PUT 必填，PATCH/DELETE 可选。客户端仍给所有现有写操作携带带引号版本，不降低并发保护 |
| 错误码 | PROJECT_NOT_FOUND、INVALID_PROJECT、STORAGE_ERROR 等 | 创客 NOT_FOUND、EMPTY_PROJECT、INVALID_IF_MATCH、UNAUTHORIZED、配额/限流等。沿统一 error.code/message 显示；401、412、413 分别处理，不把业务错误改成网络错误 |
| 归档上限 | 前后端 20 MiB；站点 21m | 本轮统一单项目 **67,108,864 字节（64 MiB，含边界）**，具体入口见下节 |

证据：[当前本地项目接口](../../apps/api/src/projects/projects.controller.ts)、[元数据类型](../../apps/api/src/projects/project-store.ts)、[ID 与前置条件](../../apps/api/src/projects/project-input.ts)、[本地版本推进](../../apps/api/src/projects/local-project.store.ts)、[错误码](../../apps/api/src/common/api-error.ts)。当前 UI 实际只展示名称、revision、updatedAt，但类型断言并不会自动转换提供方字段。

项目仍为完整 `.ob`/兼容 `.sb3` ZIP，MIME 保留 `application/x.openblock.ob`；下载经鉴权接口取得二进制，不能仅保存 project.json。保留素材、设备声明、外部编辑器元数据和代码草稿原内容，不修改 VM、Blockly 或内部协议。附件未承诺当前 Nest 的 ZIP/CRC/引用完整性、100 MiB 解压量、5 MiB project.json 校验；生产路由绕过 Nest 后这些校验不会自动继承，应列为提供方联调确认项，不能宣称已保留。

## 登录、账号与会话边界

同源请求明确使用 `credentials: same-origin`，不存储响应中的 access/refresh，不向本机硬件地址附带平台令牌。附件 Cookie 为 `cfzn_ide_access`（Path `/api/`，120 分钟）和 `cfzn_ide_refresh`（Path `/api/v1/ide/auth/`，7 天），HttpOnly、SameSite=Lax，生产 Secure；同源部署 Cookie Domain 建议留空。Cookie 域、路径和清除参数由创客后端统一管理。[Fetch 凭据规则](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)

| 动作 | 同源路径与约定 |
| --- | --- |
| 登录 | POST `/api/v1/ide/auth/login/`，JSON `{username,password}`；成功写 Cookie，读取 user 后按目标页进入 |
| 当前账号 | GET `/api/v1/ide/auth/me/`；以服务端认证结果为准，不解码 JWT 冒充登录态 |
| 票据入口 | 门户用门户 Bearer 调 POST `/api/v1/ide/auth/sso-ticket/`，IDE 不代门户生成凭证 |
| 兑换 | IDE `/sso?ticket=...` 调 POST `/api/v1/ide/auth/exchange/`，JSON `{ticket}`；一次性、90 秒，兑换成功后确认会话并 replace 到首页 |
| 刷新 | POST `/api/v1/ide/auth/refresh/`，同源依赖 refresh Cookie；成功后重新确认会话，无需保存 JSON token |
| 退出 | POST `/api/v1/ide/auth/logout/`，清 Cookie并撤销 refresh；成功后清客户端账号/项目引用，保留未保存作品的处理机会 |

附件只说明 me 使用门户 UserSerializer，未给完整响应包裹及头像字段；登录示例已给 user.id/username/display_name/role。联调需取得真实 me 与 refresh 的 JSON 形状、用户 ID 类型和可选头像字段，再冻结适配；不能凭空依赖 `{user: ...}` 或 avatar_url。角色可用于显示，不由浏览器决定项目授权。附件没有承诺个人资料修改、注册、密码重置接口，本轮不发明这些接口。

会话检测区分 401 未登录、403 受限、404 接口未部署、5xx/网络不可用。仅受保护请求的 `401 UNAUTHORIZED` 可触发一次集中刷新；同页请求共用一个刷新事务，避免轮换 refresh 竞争。登录失败、无效 SSO 票据不进入刷新循环；多标签刷新竞争需与提供方实际策略联调。读请求刷新后最多重试一次；新建/保存等写操作若结果不明，不自动重放，保留 dirty/导出并允许用户确认重试，避免重复新建。

SSO 页读取后立即从地址栏移除 ticket，不将 ticket/token 写入项目、本地存储或错误日志；入口查询参数的访问日志需由主控做最小化处理。票据兑换结果不明时先核对 me，不循环消费旧票据。账号切换、退出及鉴权失效时使旧异步项目请求失效，清除旧账户列表/active 引用；未保存字节不能自动写入另一个账户。必须保留导出或重新登录恢复的路径，不能重载编辑器丢稿。

附件 Cookie 鉴权未说明 CSRF 方案。HttpOnly/SameSite 不足以证明登录、refresh、logout、multipart 新建及其他写入已覆盖同站跨子域请求。主控需让提供方明确实际 CSRF/Origin 校验与前端所需头；若要求 CSRF token，应按已部署契约补齐获取/提交方式，不通过关闭全局校验接通。反代 Host 与 HTTPS 转发设置也应一致。[Django 官方 CSRF 说明](https://docs.djangoproject.com/en/5.2/ref/csrf/)

## 同源分流与大小限制

当前 [发布脚本](../../deploy/install-server.sh) 将全部 `/api/` 交给 Nest，`client_max_body_size 21m`；普通路径为 `try_files ... =404`。最小发布改动如下，由主控实施：

- 用 `location = /api/v1/projects` 与 `location ^~ /api/v1/projects/` 精确覆盖项目根及子路径；`location ^~ /api/v1/ide/` 覆盖平台认证。三个 location 使用同一已验证 Maker upstream，无 URI 后缀的 proxy_pass，原样保留路径、查询参数、方法、请求体、Cookie、If-Match 与响应 Set-Cookie/ETag。附件的 127.0.0.1:8801 仅为候选，真实端口由主控核实，不能照抄成事实。[Nginx proxy_pass 规则](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
- 保留准确 Host、X-Forwarded-Proto、来源头；提供方需许可 IDE Host，并正确识别代理后的 HTTPS。不启用 API 缓存，不将 401/404/5xx 改成首页，也不在 Maker 故障时转投 Nest 匿名项目接口。项目与认证通过同一个 upstream，避免 Cookie 有效但项目存储仍匿名。
- 仅项目 location 使用 `client_max_body_size 80m` 作为 multipart 余量及附件建议的有界传输超时；**64 MiB 文件边界由创客后端执行**。若需浏览器稳定读取超大请求错误，可在这些 location 为 Nginx 413 单独返回统一 JSON，但不能修改应用自身的配额错误。认证接口不需要提高请求体上限。
- `/login`、`/sso` 及约定尾斜杠仅映射到前端入口，避免当前静态 404；不要给 `/api/` 加 SPA fallback。认证路径按附件使用尾斜杠；项目根及子路径需真实支持有/无尾斜杠，POST/PUT/PATCH 不经 301/302 改写。
- `/api/v1/health`、custom-modules、arduino-libraries 等保留现有 Nest 路由；硬件继续请求用户机器的 3002 或现有 Link 路径，不把服务器 USB 作为用户设备。本轮不重启或接管硬件会话。
- 本地开发/预览的 [Vite 代理](../../apps/web/vite.config.ts) 当前也把 `/api` 全发到 3001；账户联调必须显式设置等价分流或使用同源联调站点。开发来源的 Host/Cookie/Secure 条件须与提供方协调，不能用生产账号测试时临时全局关闭 Secure。

前端的 [App 导入检查](../../apps/web/src/App.tsx) 与 [原生编辑器导入检查](../../apps/web/src/openblock.ts) 都硬编码 20 MiB，须共同调到 64 MiB；保存导出也应在发请求前检查最终归档大小。若本地匿名模式继续支持同一上限，Nest 的 [MAX_ARCHIVE_BYTES](../../apps/api/src/config.ts)、raw 解析、multipart 限制和 [归档错误文案](../../apps/api/src/projects/project-archive.validator.ts) 同步更新；不要扩大模块、串口数据或硬件源码限额。线上项目流量经 Maker，不经过这些 Nest 检查。

## 现有匿名项目与其他资源

当前匿名项目不是浏览器 IndexedDB 项目库，而是 `PROJECT_DATA_DIR/projects/<UUID>/` 中的服务器文件，默认 `.runtime/project-data`；现有 Nest 没有用户归属。切换前由主控备份实际持久目录及其配置，保留旧归档和元数据，不能将所有旧项目自动归给首次登录者，也不能依据客户端提交 userId 认领。

账户项目与旧匿名项目分开处理。已确认归属的旧作品可经受控导出后，由用户明确导入自己的账户，走现有 POST 创建新 ID/revision；保留原件，不后台批量搬迁、删除或覆盖。若保留开发用匿名模式，应由明确部署/构建模式选择，不能在 401、404 或网络失败时自动回退，也不新增公开匿名历史库入口。生产改路由后旧项目暂不在账户列表显示，不等于文件丢失，须在迁移说明中说清。

custom-modules 当前使用自己的浏览器身份 Cookie 与私有目录，接口虽预留服务端验证的身份适配器，平台登录不会自动把模块转成账号资产。本轮不将客户端账号 ID 当可信模块 owner，也不将项目归档里引用的模块声明当授权。旧模块数据、并行 Link 文件和相关 API 保持既有边界。[模块身份入口](../../apps/api/src/custom-modules/module-access.ts)

发布回滚需同时考虑路由与数据：保留旧 Nest 匿名目录、Maker 数据库及私有文件，不做双写。回滚前端版本时仍保留账户接口及新项目数据，不通过开放匿名接口“恢复可用”；由主控确认兼容版本或临时只读，避免将两个项目库互相覆盖。`/api/v1/health` 仍只证明 Nest 存活，不能作为平台认证/存储已就绪的证据。

## 交接与验收

主控先冻结提供方响应结构、精确 upstream/路径、Cookie/CSRF 策略和上述适配规则；服务器版本与代理核实通过后再切流。Nest 本轮不新增登录、SSO、账号或 OSS 代理业务；若保留匿名模式的 64 MiB 支持，后端开发仅需范围明确的归档限额调整及文案同步。前端负责真实账号页、SSO 页、会话适配、元数据/冲突兼容和两处导入限额；根发布脚本与代理由主控负责。

验收至少覆盖：匿名 me 返回约定 401、真实登录/刷新/退出、SSO 成功/过期/复用失败、账号切换不串项目、他人项目读写 404、完整归档重开、PUT revision 递增而 PATCH 不递增、412 不丢稿、64 MiB 成功与 +1 字节 413、配额/限流、重启持久化、无斜杠写入不重定向，以及 custom-modules/硬件原路径正常。无真实凭据或提供方接口未部署的项明确留待主控联调，不能用 mock 通过替代生产接通结论。

本轮仅新增此设计文档，未修改实现、配置、依赖或服务，未访问服务器和物理串口。
