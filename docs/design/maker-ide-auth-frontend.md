# 创客平台账号、SSO 与服务端项目：前端最小方案

> 用户澄清前的初稿。最终同源认证和项目请求由 IDE NestJS 提供，见 [主控冻结契约](../api-contract.md#创客账号minio-与项目-api2026-11-25-主控冻结)。

2026-11-25。主控会话 `01a21045-9e41-7a42-96d2-09242981eb1d`。接口依据附件 [ide-integration-api.md](<C:/Users/flora/Documents/xwechat_files/wxid_rvfqo48ircxo22_fddf/msg/file/2026-11/ide-integration-api.md>)（2026-11-24）；本轮账号接入要求覆盖第一阶段匿名存储限制。仅设计，最终公共契约由主控冻结。

采用附件推荐的同源 Cookie 方式：前端请求 `/api/v1/ide/auth/…` 与 `/api/v1/projects…`，不保存响应 access/refresh，不读写 HttpOnly Cookie，不把令牌传入编辑器 iframe。仅这两个前缀接创客后端；原 custom-modules、Link/hardware 路由和外部 VM/Blockly 原字节保持各自边界。

## 1. 当前缺口与实际挂点

| 现代码 | 本轮需要补齐 |
| --- | --- |
| [main.tsx](../../apps/web/src/main.tsx#L1) 直接挂 App，[App.tsx](../../apps/web/src/App.tsx#L27) 无登录态 | 轻量页面分发和唯一会话协调器；首页/登录/SSO 与编辑器分离 |
| [App 项目操作](../../apps/web/src/App.tsx#L83) 全部依赖 bridge/READY | 编辑器继续复用；主页列表/重命名/删除单独调用共享客户端，不能复用会因没有 VM 而直接返回的 action |
| [api.ts](../../apps/web/src/api.ts#L1) 使用 sizeBytes/format，错误提示“本地 API” | 适配附件 size、可选详情字段和平台服务文案，保留相对 URL 与 If-Match |
| [App 冲突分支](../../apps/web/src/App.tsx#L88) 只识别 REVISION_CONFLICT | 新增附件 412/REVISION_MISMATCH，继续保留“重新载入/另存为新项目” |
| [App 导入](../../apps/web/src/App.tsx#L127)、[iframe 导入](../../apps/web/src/openblock.ts#L300) 均限制 20 MiB，保存前未检查大小 | 共享 64 MiB 常量，导入读文件前、导出归档提交前和远端载入前检查 |
| [项目抽屉](../../apps/web/src/App.tsx#L288) 写“本机”及 LOCAL WORKSPACE | 改为当前账号项目，退出/换账号立即清列表与项目关联 |
| [index.html](../../apps/web/index.html#L6) 静态 preload 大 GUI | 首页/登录/SSO 不应白下载大 GUI；进入已鉴权编辑器路径再开启现有预加载与 iframe |

## 2. 页面、账号信息与直接入口

建议冻结以下最小路由，不引入新路由框架或第二套编辑器：

| 路径 | 行为 |
| --- | --- |
| `/` | 轻量主页：会话检测、账号名称/角色、进入编辑器和我的项目。登录后读取账号项目列表；未登录显示登录入口，不显示上个账号缓存 |
| `/login` | 创客平台用户名/密码表单，提交 `POST /api/v1/ide/auth/login/`；不新增注册体系。成功确认当前用户后回主页或安全的站内编辑器目标 |
| `/sso?ticket=…` | 专用票据兑换状态页，先走兑换，不被一般未登录守卫抢先跳走。成功按附件 location.replace('/') |
| `/editor`、`/editor?project=<opaque-id>` | 检测/恢复会话后挂现有 App；深链接保留项目 ID。先得到 READY，再按现有 get→content→LOAD_PROJECT 路径打开一次，旧意图/旧账号响应不得加载 |
| 顶层 `/openblock.html` | 作为内部 iframe 入口保留；若被用户直接顶层访问，早期引导回 `/editor`，不让用户进入缺少账号与项目父控制器的孤立编辑器。被正常 iframe 嵌入时不二次登录/刷新 |

服务器需支持上述页面深链接刷新，但 API/静态文件未命中继续真实失败，不能统一回 HTML。next/returnTo 仅允许明确站内主页或编辑器路径，保留合法 project 参数；拒绝外域、协议相对地址及不受支持路径，SSO 不接受任意外部回跳。

账号显示优先 display_name，其次 username；role 仅显示后台真实值，不据此伪造写权限，头像无接口时用本地字母/图标。编辑器账号菜单放进现有原生蓝色 MenuBar 的外部 GUI 挂点，不新增重复顶栏；可复用 [native-project-toolbar](../../apps/web/src/native-project-toolbar.ts) 相邻渲染位置，通过父层受校验消息只传显示信息/会话状态，动作回父层处理。必要的 account 状态和 home/logout 动作由主控扩展 [editor-protocol](../../apps/web/src/editor-protocol.ts#L18) 并同步两端验证；不把平台完整 user/token 塞进 GUI session 或 VM。原 CCraft Logo 新标签打开官网行为保留。

## 3. 唯一会话协调、过期与退出

新增父层 auth 模块/Provider，集中持有 checking、authenticated、refreshing、unauthenticated、unavailable 和当前 user；启动合并 `/me/` 请求。网络失败/5xx 显示会话检测失败与重试，不能当成未登录无限跳转。Cookie 请求显式 same-origin、no-store；密码只留表单内存，错误作为文本显示。

- `/me/` 或项目请求返回 **401 UNAUTHORIZED** 时，合并一次 `POST /auth/refresh/ {}`，成功重新 `/me/` 确认身份，再对原请求最多重试一次。login/exchange/refresh/logout 自身不进入这个拦截循环；INVALID_CREDENTIALS、INVALID_SSO_TICKET、403、配额及版本冲突都分别处理。
- 请求捕获 user.id/authEpoch、项目/documentId 和原 revision。仅确认仍为同一账号时才允许续期后的原请求重试；换账号不能自动把旧内容保存到新账号。FormData/ArrayBuffer 请求需可重建；仅收到明确 401 可走上述重试，网络中断/超时不能盲重放创建、保存、删除或兑换。
- 同页 single-flight 不足以应对跨标签 refresh 轮换。建议用同源 Web Locks 串行 refresh/login/logout/exchange；等待锁后先复查 `/me/`，若别页已刷新则复用，不再消耗旧 refresh。BroadcastChannel 仅广播会话已变化，其他页重新 `/me/`，不广播令牌/密码/票据，也不把消息广播当互斥锁。Web Locks 不可用时至少保留单页合并并在不确定/轮换失败后要求重新登录，不用无限刷新伪装并发成功；由主控后端确认是否提供刷新并发容错。[Web Locks 规范](https://w3c.github.io/web-locks/)
- 每次退出/身份变更递增 authEpoch，取消/忽略旧列表、打开、保存回调；Abort 不证明服务端没写入，不自动重发。按账号清 items/active/listError 等缓存，重置项目关联，防 A 的响应更新 B 的保存状态。
- 编辑中会话过期且无法续期时，保留 iframe、未保存作品及导出能力，在父层显示重新登录；不能强制 location 跳转销毁 VM。重新登录同账号后由用户再次明确保存；账号变化需明确提示，旧作品只可由用户确认另存为新账号项目，不沿用旧 projectId。
- 主动退出复用未保存确认/导出与现有操作守卫，写入或硬件任务未结束时不以退出强制中断。确认后 POST logout，成功清用户、账号列表/关联和编辑内容，再 replace 到登录页；取消退出保留现场。退出请求失败不得宣称服务器已注销，展示重试。另一页退出时本页隐藏私有项目列表并进入过期状态，未保存作品保留以便导出。

## 4. SSO 一次性票据与并发

`/sso` 从 URL 捕获非空单个 ticket 到内存，立即 history.replaceState 移除票据参数，并使该页不向第三方泄露 referrer；不挂 GUI、不写 storage/日志。每个文档对该票据只有一个兑换 Promise，防双 effect/重渲染/按钮重复 POST；与其他会话变更共用上节互斥。收到 exchange 2xx 后 `/me/` 确认账号并 replace('/')，不能依赖旧缓存用户显示成功。

90 秒过期、已用、上一票被新票作废等统一按 INVALID_SSO_TICKET 提示“请从创客平台重新进入”并提供账号登录入口，不自动再次兑换。网络结果未知也不重放一次性 ticket；旧 Cookie 的 `/me/` 成功只能证明存在旧会话，不能冒称本次 SSO 已成功。失败不主动注销仍有效的旧账号。跨标签会话变更后核对真实当前身份，旧兑换页回调不能重写新账号 UI；浏览器 Cookie 共享造成的身份变化必须如实显示。

## 5. 服务端项目与 64 MiB

保留现有 get/content/create/save/rename/remove 路径、multipart 新建和完整 `.ob` 字节；ID 不透明，不加数字/UUID 限制。增加小型 DTO 适配层：服务端 size 映射客户端 sizeBytes，format 可在客户端固定为 openblock，列表不要求未提供的 createdAt/详情字段。PATCH 后采用返回值，**不自行 revision+1**；只有 PUT content 增版本。If-Match 继续按带引号 revision 发送；412/REVISION_MISMATCH 保留旧作品，重新载入仍要确认丢弃修改，另存创建新 ID。

保留 [saveProject](../../apps/web/src/App.tsx#L143) 捕获 documentId/editVersion 与 [MARK_SAVED](../../apps/web/src/openblock.ts#L407) 语义，只在服务器确认、账号和文档仍匹配后标已保存；编辑期间又有修改仍 dirty。内容保存成功但名称同步失败时保留已确认 revision，并清楚显示部分成功，不能抹回旧版本。404 不泄露他人项目，不回退匿名目录；403 ACCOUNT_RESTRICTED 保留阅读/编辑/导出并解释不可写；413 的单文件超限与 STORAGE_QUOTA_EXCEEDED、409 PROJECT_LIMIT_REACHED 分开；429 不循环请求。非 JSON 代理错误也给可读反馈。

共享 `MAX_PROJECT_BYTES = 64 * 1024 * 1024 = 67,108,864`，单位文案统一 **64 MiB**：

- File 导入先检查 File.size，超过上限在 arrayBuffer 前反馈；iframe 原生导入入口和父层二次校验都使用同一常量，移除两处旧 20 MiB。
- create/save 在 EXPORT_PROJECT 后、HTTP 前检查实际 archive.bytes.byteLength；大于上限不给服务端发请求，也不 MARK_SAVED、不丢当前作品。恰好 64 MiB 允许，空/损坏归档按真实原因拒绝。
- 远端打开先看 metadata.size，再看实际响应字节，超限不传 LOAD_PROJECT；服务端仍最终执行大小、总额度和数量校验。不能用项目列表估算代替服务端额度决定。
- 部署按附件为项目上传留 multipart 余量（80m），后端项目上限 64 MiB；前端限制不能替代代理/服务端设置，也不改硬件代码/串口队列的独立上限。

主页与应用内“我的项目”共用账号项目客户端。删除提示改为“删除该账号保存的项目”，不再声称仅本机；本轮不额外加入自动保存定时器。

## 6. 已有数据入口与主控需核实的接口细节

替换同路径代理不会自动迁移现有匿名项目。默认保留旧数据与备份，由主控先盘点/导出原 `.ob`，用户通过已有“导入→保存”归入自己的账号；主页给出该入口说明，不把匿名文件自动归给首次登录者，也不为迁移公开旧匿名目录。新增账号项目通过主页列表、编辑器抽屉和站内深链接进入；刷新后从后端重新读取，不能靠内存模拟持久化。

附件未展示 `/me/` 的精确响应包络、refresh 成功体和 Cookie 写操作的 CSRF 要求。建议续期不依赖 refresh body，统一再取 `/me/`；由主控/后端对实际 UserSerializer 样例与 Origin/CSRF 要求做一次核对，前端按确认的 schema/头实现，不猜额外端点或绕过校验。账户/项目认证封装只服务平台接口，不能全局拦截 fetch，把本机 Link/硬件错误变成登录跳转。

## 7. 聚焦验收

1. 首页、`/login`、`/sso`、`/editor?project=…` 和顶层 openblock 直接访问/刷新均有确定结果；登录/SSO 页不挂大 GUI。登录成功显示真实账号；无效密码、受限账号、限流、网络不可用与未登录区分，无重定向循环和外部 returnTo。
2. 同页并发 401 只刷新一次；同源两标签同时过期、轮换、登录/退出/SSO 交错仍确认真实身份。SSO 双 effect、无票、90 秒过期、已用、旧票失效、丢响应均不重复兑换或误报旧账号成功。
3. 编辑中续期失败保住工作区与导出；取消退出保留作品；确认退出/换账号后旧项目列表及迟到响应不泄露、不 MARK_SAVED。新账号必须明确另存，不能重放旧 projectId 写入。
4. 同账号重新登录/新标签从服务端列出并读取已保存 `.ob`，完成新建、Ctrl+S、修改保存、重命名（revision 不增）、删除及深链接；另一个账号不可读取，412 冲突不覆盖原内容，部分保存失败保留真实 revision。
5. 20 MiB 以上且小于/等于 64 MiB 的有效作品可导入与保存；64 MiB+1 在读文件/发上传前拦住；空文件、代理非 JSON 413、配额、数量上限分别正确。边界 mock 与真实大归档往返分开报告，核对二进制、资产、编辑脏状态和无重复请求。
6. 旧匿名数据保留和导入流程、API 两前缀反代、HttpOnly Cookie/no-store、保护模块字节与原生菜单/串口/音频/冷启动回归由主控综合验收；前端不因用户认证发送额外串口/烧录操作。

仅新增本设计文件；未修改实现、依赖、服务、浏览器或服务器。
