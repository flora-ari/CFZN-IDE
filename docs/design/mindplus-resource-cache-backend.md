# Mind+ 主板资源缓存的后端边界

2026-11-26（Asia/Shanghai）。本轮只读设计；最终交互与契约由主控冻结。

## 最小结论

优先采用 **零新增后端/API** 的方案：公开主板/内置扩展资源继续由 IDE 固定版本静态资源提供，网页负责缓存命中、资源完整性与卡片展示；本机编译环境继续以 Link 的 `/toolchains`、准备任务和 `/capabilities` 为准。账号与私有作品保留当前 Nest/Maker/MinIO 路径，不承担机器 SDK 缓存或公开资源下载状态。

必须分清“编辑器资源已取得”“工具链已验证就绪”“作品已加载此主板”三个事实。它们可以同时出现在一张卡片，但不能共用一个持久化 `downloaded=true`。浏览器本地标记、账号登录和项目里的 deviceId 均不能证明本机已安装工具链；SDK 就绪也不能证明浏览器已取得当前版本的积木、生成器和图标。

Mind+ 的有/无资源卡片外观及缓存路径，以主控本轮取证为准。已有 [静态映射记录](../../.runtime/mindplus-board-selection-20261126/mapping.md) 仅证明按设备版本合并任务、首次下载后刷新目录、再次点击才选板；没有证明其资源位于 localStorage、IndexedDB、浏览器 HTTP 缓存或本机 Link。不能把上轮静态片段写成已运行缓存验收。本轮不访问共享 REA/Craft 会话，原生缓存调查由 Link 主控负责。

## 当前代码事实

| 范围 | 当前实现与事实来源 | 本轮缓存边界 |
| --- | --- | --- |
| 完整主板目录 | 原生可见目录与共享可信 20 项 ID；目录不是已安装清单 | 不能用五个硬件 Profile 缩减目录，或把没有 Profile 的主板统一标为资源缺失 |
| 主板描述 | `/openblock-vendor/device-descriptions.json`；派生板通过外部适配生成描述 | 这是引脚/兼容描述，不是 compiler/core，也不能单独证明所有主板执行资源齐全 |
| 公开内置模块 | 六模块、每模块 toolbox/translations/generator/blocks 四份 mjs；固定静态 helper 执行 import | 函数可复用，换板仍须重新注册，不缓存旧板动态引脚或已生成 toolbox 当作新板事实 |
| 当前准备缓存 | BuiltinResources 读取 manifest；helper 用 `integrationSha256:id` 合并 Promise，失败删除，retry 区分失败重试 | 这是页面内代码/请求复用，尚未实现一套可验证的跨页面主板资源下载账本 |
| 私有模块 | `/api/v1/custom-modules` 鉴权读取；adapter 的 customRecords 是页面内 Map | 不进入公开资源缓存；作品仅保存不可变模块 ID，不内嵌私有定义 |
| 编译环境 | Link 可信 Profile/plan、任务终态、能力热刷新 | 浏览器仅观察；本机磁盘资源是否存在及可用由 Link 判定 |

依据：[主板与模块目录](../../apps/web/src/extensions/catalog.ts)、[主板注册与描述](../../apps/web/src/extensions/device-registration.ts)、[公开资源协调](../../apps/web/src/extensions/builtin-resources.ts)、[实际模块加载器](../../apps/web/public/cfzn-extensions/module-loader.js)、[扩展事务与页面缓存](../../apps/web/src/extensions/adapter.ts)、[构建版本与必要产物](../../apps/web/scripts/prepare-openblock.mjs)。当前主板选择走既有设备加载与兼容事务，并没有为每个主板新增一个独立下载 API；不能为已随固定包交付的内容制造虚假下载过程。

## 浏览器公开资源缓存建议

先复用当前静态资源、HTTP 缓存与版本去重。若本轮前端要增加显式持久缓存，只允许缓存构建发布的公开资源白名单，以 origin、集成版本、资源身份为键；设备资源身份使用可信 deviceId，内置模块使用 moduleId，不能使用用户输入 URL、路径或账号 token。静态资源是否完整、是否可实际加载，由白名单所列必要文件和加载结果确认；图片或描述命中不等于整个主板资源完整。

`manifest.integrationSha256` 是构建输入版本指纹，不是每个文件的内容哈希；现有 `?v=...` 也是加载器版本键，不会让服务器自动保存旧版本文件。若需逐文件摘要或完整资源组，可在构建时扩展公开静态 manifest，由主控冻结结构；这属于静态发布数据，不必增加业务 API。当前没有每主板完整资源清单时，先复用已确认资源，不凭名称猜路径或承诺完整离线可用。

写入缓存应在所有必要资源成功后才提交该资源组的完成标记；失败不能覆盖旧完整版本。切版本、清除缓存、存储额度不足或缓存被浏览器回收后重新检查，不能仅凭 localStorage 记录显示已缓存。浏览器同源缓存可供游客和账号编辑器复用公开文件，账号切换无需重下公共资源；设备选择、工具链任务和用户归档不写进公共缓存。

如选 CacheStorage，注意它不会自动遵循 HTTP Cache-Control，也不会自动更新条目，浏览器可能回收其数据；白名单排除私有接口必须在代码中明确执行。现有 mjs 使用原生 import：单独执行 Cache.put 不会让 import 自动改从该缓存读取。前端须证明真实消费链路命中，继续沿受控加载入口，不增加任意 eval/Blob 代码执行或修改 VM。持久缓存不可用时给出真实失败/重试，不把写标记当作完成。[MDN Cache 官方说明](https://developer.mozilla.org/en-US/docs/Web/API/Cache)

不做全站 API 离线镜像，不把 `/api/`、项目内容、账号信息、私有模块、Link capabilities/ports/jobs/serial 响应或错误页加入该缓存。已有 `no-store` 继续保留，但不能靠它阻止显式 CacheStorage 写入。缓存清理只处理本功能拥有且版本明确的公开资源命名空间，不执行全 origin 清空。

## 账号、作品和私有模块

当前上线方案已由主控 [统一契约](../api-contract.md) 冻结为 Nest 提供 IDE 认证/项目 API、Maker 校验身份、私有 MinIO 保存项目对象；不沿用旧设计中“项目路径直接分流创客后端”的候选拓扑。项目依真实账户隔离，64 MiB、If-Match、ACCOUNT_CHANGED 及游客不请求项目 API 等边界保持。资源缓存不得存储账号 Cookie/JWT、SSO 票据、项目目录或 `.ob` 私有文件，也不能让游客从缓存读到先前账号项目。[生产项目认证](../../apps/api/src/ide/integration.ts)、[前端会话](../../apps/web/src/ide-auth.ts)

私有模块当前默认使用独立的服务端浏览器会话 Cookie 与 owner scope，账号登录不会自动将其改成 Maker 用户空间；仅显式注入服务端验证的 customModuleIdentity 后才使用账号 owner。客户端 userId、缓存键、项目里的模块 ID 都不是权限凭据。不得借本轮缓存静默改变模块归属，也不能向用户承诺当前模块已具备跨设备账号同步。[模块权限](../../apps/api/src/custom-modules/module-access.ts)、[应用装配](../../apps/api/src/app.ts)

私有模块网络读取继续 `credentials: same-origin` 与 `cache: no-store`，服务端按当前 owner 授权，其他 owner 返回 404。通用资源缓存应完全排除其完整定义和生成代码；不可变 ID 也不能让另一个 owner 绕过授权。当前 customRecords 只在页面内保留，重新打开作品前沿原流程解析缺失定义；不能把它扩大为全 origin 永久定义库或用持久旧数据覆盖 401/403/404。若未来需要私有模块离线跨页使用，必须另行冻结可信 owner 标识、会话失效/换号与撤权策略，现有页面缓存不是该功能的实现。[私有模块请求](../../apps/web/src/extensions/custom-modules-api.ts)、[模块存储](../../apps/api/src/custom-modules/local-module.store.ts)

“隐藏私有版本”与“移除已加载模块”仍是不同操作：隐藏只移出当前 owner 的列表，既有作品可由该 owner 读取旧版本。缓存失效不能把隐藏当成永久删除，目录读取也不能根据作品引用扩大权限。保留原始 `.ob` 字节、模块引用和事务回滚；主板公共资源准备不改变作品 dirty、选板或自动保存。

## 既有 Link 能力足够的范围

当前 `/toolchains` 返回登记 Profile 的 state/installable/planId 与 activeJobId；`POST /toolchains/prepare` 只接收 `{profileId}`，任务查询/取消与 `/capabilities` 足以支持现有 SDK 卡片准备、重进恢复、共享计划和实际能力刷新。既有 [ToolchainPreparation](../../apps/web/src/toolchain-preparation.ts) 与 [HardwareController](../../apps/web/src/hardware-controller.ts) 已按实例观察与同计划关联，不需要 Nest 代查磁盘、下载 SDK 或维护一份账号安装状态。

Link 离线、实例切换或仅有上次浏览器快照时，展示“待检测/上次状态”，不能显示已确认就绪。原实例任务成功后继续刷新 capabilities，再确认对应 Profile 的真实 compileAvailable/uploadAvailable；下载字节 100%、缓存归档存在、同 plan 的另一个任务成功，都不能单独代替该验证。共享 plan 只表示资源复用，不意味着所有设备/FQBN 相同，不能凭 VID/PID 推断板型。

卡片缓存/下载与选择分离：准备可信目标，不改当前 device、有效 Profile/port，不暗中断开会话，不自动烧录。关闭库只退订视图；409、响应未知和取消未确认沿既有对账与 busy 语义，不另建下载队列。本轮不取消此前明确授权的自动准备或显式编译后续接逻辑；具体触发按当前主控冻结。

## 什么证据才需要扩展接口

现阶段没有新增业务接口的必要证据。若主控证实 Mind+ 的“主板资源”是不同于 compiler/core 的原生独立包，且 CCraft 同一资源也确实只能由 Link 管理，现有 `/toolchains` 仅有 plan/profile 状态就不足以冒充那份资源目录。需先提交准确资源种类、版本/摘要、所在执行端、已有请求响应及网页必须查询的事实，再由 Link 主控决定是否在兼容接口中增加只读资源目录/状态；不先发明 `/cache`、任意文件读取或网页指定路径下载接口。

同样，用户若要求跨机器账号同步资源清单或私有模块离线持久化，那是额外产品与权限契约，不能从“缓存卡片”推导得出。公共静态 manifest 的扩展无需账号存储；SDK 原生状态仍以 Link 为权威，账号最多保存明确授权的偏好，不能保存机器 ready 真值。

交前端与独立测试关注真实冷/暖命中、缓存缺项与版本变化、失败不提前完成、清缓存后重检、公开资源账号/游客复用及私有接口从未写入公共缓存。缓存命中后仍需实际加载积木/生成器；Link 状态用隔离模拟验证时应明确范围，真实磁盘缓存、冷下载及编译由 Link 主控验收，不能用 UI 角标代替。

本轮仅新增本文档，未修改产品、VM、Link/native/API 源码，未启动服务、下载 SDK、操作物理串口或使用共享 REA/Craft 会话。
