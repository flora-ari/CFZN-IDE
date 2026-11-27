# 主控选择页：资源/SDK 状态与真实缓存

2026-11-26。按主控最新冻结方案收口，**仅主控板选择页，功能模块页完全不改**。只写本设计，不调用共享 REA/Craft、不改产品、VM、HTTP、Link 或跨 iframe 信封，不新增 SW/全离线方案。

## 已确认映射

主控现网 Mind+ bundle SHA 为 `cf38db76a2536009779256943bfd3c4c59c68256bc12a9b74dcf4926f0907f9d`。只读既有 [S](../../.runtime/mindplus-resource-cache-20261126/00-variable-S.txt)、[V](../../.runtime/mindplus-resource-cache-20261126/03-variable-V.txt)、[Wa](../../.runtime/mindplus-resource-cache-20261126/18-variable-Wa.txt) 切片：builtin/local dev.json 与远端版本目录合并决定 isDownloaded；需原生资源且 Link 在线的缺失版本才显示 downloadicon，needLink 另态；下载/解压并完成声明的 core/libs 后才提交本地索引。首次成功只刷新库，不自动选板。

CFZN 分开记录三个事实：

- **公开编辑资源**：固定 GUI/静态资源、设备描述及外部注册实现随 [prepare](../../apps/web/scripts/prepare-openblock.mjs) 交付，由既有 manifest/内容摘要 URL/HTTP 缓存实际消费。SDK missing 不能记成这些预置编辑资源不存在，也不新增伪 Mind+ ZIP 目录或浏览器 downloaded 布尔值。
- **本机编译环境**：由 Link 当前实例的目录、能力和真实任务判定。本轮主控卡片的编译环境灰层/下载入口使用这一事实，文案仍明确“编译环境”；公开资源已预置不等于可编译。
- **已选主控**：取 adapter.currentDevice，沿用选中边框。与资源可用性、编译环境就绪分别判断，不以蓝勾表示三者。

## 最小前端规则

集中调整 [board-toolchain-card.ts](../../apps/web/src/board-toolchain-card.ts)，[library.ts](../../apps/web/src/extensions/library.ts#L161) 继续只在 isControllers 时接入。功能模块的 UI、资源加载器、兼容性和已添加状态均不变。

| 本机编译环境状态 | 判定 | 主控卡片 |
| --- | --- | --- |
| ready | 本实例新鲜目录/能力相符，确认环境已就绪，非仍在校验 | 普通卡片；controls=null，无下载 icon、蓝勾、灰层或占位 |
| missing | 本实例新鲜目录明确 missing 且 installable，能力未确认 ready | 浅灰+独立右上下载；原主体给下载引导，成功刷新后用户再点击才选板 |
| 对应失败/取消可 retry | 本实例、目标 profile/plan 的真实终态，当前目录仍允许准备且环境未就绪 | 同位置浅灰+重试下载，简短原因，不污染别的卡片 |
| busy / unknown 提交 / cancelling | 实际原任务或经验证的共享 plan 关系 | 沿用真实任务覆层、阶段与取消；未知总量不定进度，不能用下载 100% 冒充 ready |
| unknown / offline / legacy / 无 Profile / unsupported | 当前证据不足或不支持准备 | 中性正常卡，无假 missing 灰层或下载图标；必要短提示，保留原离线选板能力 |

删除当前 `!confirmedReady` 统一盖灰和 ready 画勾的分支；`installable` 只表示允许准备，不能单独推出 missing。目录与能力矛盾时重新对账，不以 `tc.error` 网络失败当下载失败，也不重复 POST。离线时旧任务仍可显示“结果待确认”的任务覆层，其余历史 missing 不冒充新鲜判定。保留此前授权的自动准备、一键编译续接、目标/当前配置隔离、共享任务身份和全部串口/作业守卫。

浅灰仅改用 Mind+ 参考 `hsla(0,0%,84.7%,.4)`；沿用 [现有绝对定位层](../../apps/web/src/extensions/library.css#L129)。原 width/height/grid、图文/metadata/帮助和选中边框不改，不增加 footer/min-height/空占位，不裁说明。下载/帮助/取消维持键盘与窄屏可达。

## 实际差距与必要内部标记

[ToolchainPreparation](../../apps/web/src/toolchain-preparation.ts#L54) 当前已有 instanceId/lifetime、目录/任务缓存及对账；断线保留旧 catalog，换实例清 catalog/job。`lastCatalog` 是开始请求的时间，并非成功校验标记。[HardwareController](../../apps/web/src/hardware-controller.ts#L175) 已有 serviceGeneration/实例检查，但仍暂存旧 profiles；没有足够的“这份能力/目录属于哪次有效连接”的证据供卡片 mapper 使用。仅凭 localService=online 和旧 profile flags 会短暂错判。

建议只加内部观察元数据/只读 getter，不改公开响应：

- `observationEpoch`：断线、恢复、换实例时变化；旧内容可保留展示但标 stale。在途响应携带发起 epoch，迟到响应不得恢复 fresh。
- `catalogEvidence={instanceId,epoch,successfulSequence}`：GET toolchains 成功解析且仍属当前观察后才提交；失败、开始请求或旧 epoch 响应不能刷新成功证据。
- `capabilitiesEvidence={instanceId,epoch,successfulSequence}`：沿用现有 generation/AbortController，仅当前成功能力响应可更新。mapper 只有两路均属当前实例/epoch、目标 profile/plan 关系有效且不矛盾时才认定 ready/missing。

同实例短暂离线保留旧快照便于恢复，但不继续当作 fresh；恢复后合并刷新两路。换实例、读取到 plan/Profile 配置变化时旧关联失效，不能把旧失败/ready/进度套给新版本；能力/目录请求互相不同步时先 unknown。成功 sequence 各自独立，不要求两路数字相等，也不增加持续 per-card 轮询。库重开可合并只读刷新，控制器生命周期内保持原任务观察，不重新启动准备。

## 真缓存：复用已有层，补恢复验证

主控已确认 Link 0.1.5 存在 archive/core/receipt 持久缓存与恢复路径。前端观察器的 catalog 是内存快照，不是第二个磁盘缓存。本轮没有发现必须新增独立板资源缓存层的具体证据；优先补已有真实持久数据跨 executor 恢复验证，由 Link 主控在隔离根完成：

1. executor A 在独立临时数据根准备成功，记录实际 archive/core/receipt/计划身份并关闭；executor B 用同一数据根和新 instanceId 启动，只读恢复后目录/能力应为 ready。记录下载请求计数，已验证完整环境不再次下载；网页新观察器确认结果后无 prepare POST、无假 missing。
2. 分别验证“只有归档无完整安装/receipt”不能 ready；“完整 core+有效 receipt、归档被清理”不应仅因归档缺失破坏已验证环境；坏 core/receipt、不同版本/plan、失败/取消的暂存内容不能复用成 ready。恢复检查按实际索引/摘要执行，不用单个标记文件存在代替。
3. 关库重进只退订/恢复 UI；新页面观察器以目录/能力重建状态，不依赖浏览器存储。真实编译另记证据，模拟目录返回 ready 不能证明 SDK 可编译。

测试不得写用户安装目录或缓存，不打开实体串口、不为验收重新下载真实大 SDK。若隔离验证揭示现有恢复缺陷，由 Link 主控修补其原路径；没有缺口就不额外重打本机软件。后续确需非预置资源包时，先给可信清单、实际消费链和缺失证据，再另行冻结，当前不扩为新资源 API 或通用浏览器缓存系统。

## 五个 Profile 与二十卡

[完整目录](../../apps/api/src/common/controller-catalog.json) 仍为 20 卡；[当前 Profile](../../apps/api/src/hardware/config.ts#L19) 仅 `arduinoUno/uno-avr`、`arduinoEsp32S3/esp32s3-default`、`aijiteESP32S3/aijite-esp32s3-default`、`arduinoEsp32/esp32-4mb-dio`、`firebeetleEsp32E/firebeetle-esp32e-4mb` 五项。其余 15 卡（含 Leonardo）无编译 Profile，不表示预置编辑资源缺失，也不能猜与 Uno 共用 AVR 即可编译。无 Profile 继续中性可编辑，不能伪造下载和二十板烧录能力。

聚焦验收：ready 无下载 DOM；仅 fresh missing/真实可重试失败灰显；unknown/离线/无 Profile 无假下载；真实未知提交仍保持任务覆层；重连/换实例/plan 无陈旧结果回写；库重进/新观察器复用已有目录不 POST、同计划只一原任务；20 卡矩形与原内容不变、功能模块页零行为/样式改动；串口互斥、取消与编译续接回归。UI 模拟、真实几何与 Link 持久缓存/编译分开报告。
