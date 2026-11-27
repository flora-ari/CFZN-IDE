# 游客编辑器后端审核

日期为 2026-11-25，供主控冻结本轮契约。结论是现有认证版项目 API 已具备所需拒绝边界，游客进入、真实编辑、本地导入和本地导出可由前端实现。此提案依据当前源码只读审核，运行验收需由开发和测试阶段完成。

## 服务端边界

认证版 [应用装配](../../apps/api/src/app.ts) 使用 `prepareIde` 返回的 `IdeProjectsController`，并在项目请求解析及控制器前挂载 `/api/v1/projects` 的 `authorizeProject`。认证版的路由由该控制器提供，旧匿名 `ProjectsController` 仅在本地模式装配。[生产配置](../../apps/api/src/ide/config.ts) 要求 `IDE_AUTH_MODE=maker`。

[项目守卫](../../apps/api/src/ide/integration.ts) 对所有项目请求调用 `auth.principal`。[身份解析](../../apps/api/src/ide/auth.ts) 验证 IDE access Bearer 或 Cookie、会话记录、到期时间、nonce 和创客平台当前用户，成功后把内部 owner 放进 `response.locals.idePrincipal`。控制器取得该 owner 并传给 [MinIO 项目存储](../../apps/api/src/ide/projects.ts)，每次查询均带所有者条件。缺少、无效、到期或已退出的访问凭据返回 `401 UNAUTHORIZED`。仅有 refresh Cookie 也须先走原认证恢复流程，项目守卫自身不会把它作为访问凭据。

| 项目操作 | 实际入口 | 游客的服务端结果 |
| --- | --- | --- |
| 列表 | `GET /api/v1/projects` | 无有效访问凭据时 `401 UNAUTHORIZED` |
| 创建、导入后服务器保存、另存 | `POST /api/v1/projects`，multipart | 同上，认证检查在文件解析及入库前执行 |
| 单项元数据 | `GET /api/v1/projects/:id` | 同上 |
| 服务器下载、打开、已保存项目导出 | `GET /api/v1/projects/:id/content` | 同上，MinIO 对象流在鉴权后读取 |
| 内容更新 | `PUT /api/v1/projects/:id/content` | 同上，认证检查在 raw body 解析及归档校验前执行 |
| 服务器重命名 | `PATCH /api/v1/projects/:id` | 同上 |
| 删除 | `DELETE /api/v1/projects/:id` | 同上 |

前端批量删除逐项调用 `DELETE`，批量导出逐项读取 content，均落在上表的守卫下。带有效身份的写请求继续经过写入资格、同源和账号匹配检查，账号切换由 `X-IDE-Account-ID` 检测。身份服务不可用时访问失败，应用装配保持认证模式。游客功能沿用这些接口和权限判断。

## 主动进入游客时的前端请求边界

主控确定入口为 `/?mode=guest`，前端从当前顶层 URL 在认证检查前判定游客状态，独立于生产 `IDE_AUTH_MODE`。同一浏览器已有有效 HttpOnly 登录 Cookie 时，服务端收到 Cookie 仍按对应账号授权。游客标识表达当前页面选择，不改变 Cookie 的服务端身份。游客路径直接挂载真实编辑器，跳过 `resolveIdeUser`、`bindIdeUser`、会话刷新、焦点检查和 BroadcastChannel 认证监听。页面通过 URL 保留游客选择，进入该路径无需读取或注销浏览器已有账号。

项目能力在前端请求入口检查。游客模式下，`projectsApi` 的 list、get、content、create、save、rename、remove 在 `fetch` 前拒绝，避免有效 Cookie 被意外带入请求。应用操作入口同时使用该能力状态控制项目抽屉、保存、另存、批量删除、批量导出、冲突重载及快捷键。原生菜单、父子页面消息、重试和错误恢复也收敛到同一判断。现有 `App` 在没有 `account` 时仍可调用项目 API，因此只传 `<App />` 尚不足以完成游客模式。

游客当前作品的导出使用 `EXPORT_PROJECT` 得到完整归档并下载 Blob。本地导入使用文件读取和 `LOAD_PROJECT`，新建使用 `NEW_PROJECT`，未保存标题通过 `SET_TITLE` 更新。这些路径可以直接使用现有编辑器。导出后保存状态仍表示本次作品的服务器保存情况，保留离页未保存提示。当前导入成功文案“点击保存后将加入项目列表”需随游客状态调整，提示通过导出保留作品。

用户随后选择登录时，前端先处理未保存作品，再进入明确的认证入口。登录后的服务器保存由用户发起。游客入口参数不参与服务端 owner 解析，直接调用现有项目 API 仍按实际有效凭据判断。自定义模块、Arduino 库索引和本机硬件服务具有各自的访问路径，本轮“游客无项目服务器请求”应对项目及自动认证请求进行验收。

## 必要验收

1. 测试使用本地认证 fixture，对表中全部七类实际请求验证无凭据、伪造凭据、到期凭据和已退出凭据均返回 `401 UNAUTHORIZED`。覆盖尾斜杠和正常项目 ID。请求中自报 owner、userId 或 guest 也无法获取访问资格。确认响应保持现有错误格式和 `Cache-Control: no-store`。
2. 使用有效归档及有效项目 ID验证拒绝请求未创建或更新项目记录、MinIO 对象、revision 或名称，DELETE 后原对象仍可由原账号访问。对 POST、PUT 验证鉴权优先于上传解析，防止把 `400` 或 `415` 当作认证拒绝的证据。
3. 在本地认证 fixture 使用两个独立账号复核原有隔离，另一账号查询、读取、改名、更新和删除指定项目返回 `404 NOT_FOUND`。有效 Cookie 加不匹配的 `X-IDE-Account-ID` 保持 `409 ACCOUNT_CHANGED`，跨源 Cookie 写保持 `403 FORBIDDEN`。有效账号操作通过，以确认游客入口未影响正常保存链路。fixture 中模拟的身份和对象存储在报告中注明。
4. 无 Cookie 进入游客并真实编辑，导入和导出包含积木、连接、造型、声音及编辑器代码草稿的完整作品，导出后重新导入核对内容。记录整个过程的项目请求为零，自动 me、refresh 请求为零。保存快捷键、原生保存、抽屉和冲突操作无法触发服务器请求。
5. 先登录，再主动通过登录页的“游客进入”打开编辑器，保留有效登录 Cookie，重复上述操作并确认项目及自动认证请求为零。焦点切换、广播账号变化、刷新和另一个标签登录也应保持当前游客选择。有效 Cookie 的直接手工 API 调用仍按账号授权，该情况与页面发起请求的验收分别核对。

现有后端测试已覆盖一个未认证 PUT 在 body 解析前返回 401，以及认证账号的隔离、封禁、存储失败和竞争写。上述全方法游客拒绝矩阵与有效 Cookie 的页面请求验证是本轮需要补齐的证据。
