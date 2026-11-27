# 主控卡片编译环境：两阶段最小方案

2026-11-26。仅本地架构设计，不占用 REA/CraftAnything、不修改产品、VM、Link 或 HTTP。按主控转交的开发取证：Mind+ 首次下载成功只刷新库，之后再次点击才 loadDevice；版本切换另有等待下载路径。本轮采用“下载→可选择→用户点击原选板事务”，**不自动提交主控或关闭库**。证据：线上 main SHA `cf38db76a2536009779256943bfd3c4c59c68256bc12a9b74dcf4926f0907f9d`，Wa UTF16 `[14410518,14421021)`，Craft `ev_2ced46f3435ea47a3e3a4e369c2d5105a660f2e88a40899c2ff8dd37d44a1606`；本分支未独立逆向。

| 文件/现方法 | 最小变化 |
| --- | --- |
| [library.ts](../../apps/web/src/extensions/library.ts#L144) `makeLibraryRenderer`、卡片 select/footer | 注入 getHardware，订阅 hardware 状态；主控卡加独立下载/取消/重试与灰遮罩。主体选择仍调用 adapter.selectController；下载动作 stopPropagation，不触发选板 |
| [hardware-controller.ts](../../apps/web/src/hardware-controller.ts#L230) prepareDisabledReason/prepareToolchain | 增内部 `prepareForDevice(deviceId)` 与只读目标状态查询。按 capabilities 的首个匹配默认 Profile 解析目标，验证 Profile 确属目标；不得调用 configure、改当前 profileId/deviceId 或先装载 VM 来取得目标 Profile |
| [toolchain-preparation.ts](../../apps/web/src/toolchain-preparation.ts#L54) prepare/refresh/snapshot | 保持唯一准备观察器、提交未知对账、取消和终态能力刷新。已有同实例同 plan 的任务复用观察，不重复 POST；终态仅刷新目录/能力，不回调选板 |
| [adapter.ts](../../apps/web/src/extensions/adapter.ts#L285) selectController/transaction | 原有兼容检查、归档备份、切板与回滚不变；不把下载塞进 transaction 的 prepare 阶段或持有 adapter.status.busy 等下载，避免 mutationGuard 自锁与关闭库被禁 |
| [native-hardware.ts](../../apps/web/src/native-hardware.ts#L24)、[upload-progress.ts](../../apps/web/src/upload-progress.ts#L60) | 删除 createNativeLink.renderControls 和 renderTools 两处下载 badge；上传窗移除 renderToolchain 详细安装块/安装日志，准备阶段不显示空的大日志框。保留编译/上传自身日志与取消，至多一行“准备中，可到主控库查看”及入口 |

## 状态与事件规则

1. **下载和选择分离。** 在线、已有明确目标默认 Profile、支持安装且尚未 ready 时，卡片显示下载入口；主体点击提示先下载并 return。下载点击经过项目/模式/作业空闲、Link、目标 installable 和现有串口持有检查，再调用已有 `/toolchains/prepare {profileId}`。已有串口只提示先断开，不暗中 close。下载、失败、取消、成功均不改当前作品、蓝边主控和脏状态；ready 后用户主体点击才走原事务。无 Profile、Link 离线、旧 Link/不支持下载时保留原离线选板能力并明确编译不可用，不能把 20 板目录全部强制按五 Profile 门槛禁用。
2. **按任务归卡片。** 先由 capabilities 的 `profile.id→deviceId` 映射真实任务所属卡片，再用 catalog 的 profileId/planId 表示准备计划；不能拿当前 hardware.profileId 给全部卡片套同一进度。键由 Link instanceId、profileId、planId 和已知 jobId 组成，未知 job 时标“提交/结果待确认”。同 plan 的其他可安装卡片只标“共享环境准备中”，不伪造独立任务；仍需验证目标 installable 与实际计划绑定，不能仅凭 plan 相同覆盖自定义配置。不同 plan 忙时拒绝新下载、不排后台队列。成功后刷新所有受共享计划影响的 Profile，按各自真实能力恢复选择。
3. **灰遮罩与取消。** 显示真实 resolving/downloading/installing/validating/cancelling；仅下载 totalBytes>0 时显示下载百分比，未知或 0 总量用不定进度，不能把下载 100% 当环境就绪。遮罩只覆盖对应卡片，取消/重试为同级可聚焦控件，不被原 select 覆层截获；错误只归对应 Profile/job，不把全局错误复制给所有卡片。取消调用现有 toolchains.cancel，待终态/释放确认后才允许新任务，取消未确认仍显示忙。
4. **离库与恢复。** library 卸载仅退订 UI，不 dispose 工具链观察器、不自动取消任务；重新打开按现有 snapshot 恢复。Link 离线显示等待确认，不能当失败/成功；同实例恢复先对账，实例变化丢弃旧 job 关联再读目录/能力。特别注意 waitUntilIdle 在离线时也会 resolve，不能单凭它认定 ready。既有当前主控后台任务照样映射卡片，不在顶部新增提示；安装终态与能力刷新确认才恢复 ready。
5. **保留一键编译续接。** HardwareController.validateStart/run 的显式“准备→编译/上传”流程继续，保留 source/documentId/editVersion/profile/port 检查及取消后不续接；准备前还需捕获 instanceId，续接确认仍为原实例，不能用重启后的 ready 冒充旧任务成功。把“正在准备当前 Profile”的判定抽为同实例/同 plan 共用判断，在 validateStart 与 run 两处一致使用，避免共享 core 的不同 profileId 被误判成其他任务或再次 POST。卡片取消实际任务会使原编译等待失败/停止，不能继续执行。准备进度虽不在上传窗展开，用户的取消入口与当前 pendingAction 仍有效。

## 主控需要冻结的边界

- **自动触发策略（主控最终决定）：** 保留此前用户明确授权的当前主控 maybeAutoPrepare、重连等既有自动准备触发，本轮仅迁移其进度展示，不因 UI 删改撤销原能力。既有任务与显式卡片下载共用同一观察器、互斥和任务归属；卡片显式下载仍只刷新 ready，不 selectController、不关闭库。用户显式编译调用 run 内的自动准备与续接继续有效。
- **跨 iframe 零新增消息/字段：** 现 library、adapter、HardwareController 均在编辑器 iframe，直接注入/订阅即可。保留现 GET_HARDWARE_STATE：`deviceId/profileId` 始终表示当前已提交主控/配置，`toolchain.profileId/job.profileId/planId` 表示准备目标，二者可以不同；logs 不新增父层广播。目标查询/准备方法只是 iframe 内部接口。若主控决定另增跨 iframe 动作，需先冻结，不能由开发自行扩充。
- **门槛范围与关闭行为：** 只对在线可安装的目标 Profile 使用“未下载禁止加载”；其他主控仍可离线编辑。下载成功只刷新卡片，不调用 selectController/onRequestClose，不新增版本选择或猜测 Link 未提供的编译器版本。

验收最小集：目标 A 下载期间当前 B/作品/Profile 不变；成功后再点击 A 才原事务切板；双击仅一 POST、串口持有不关闭、共享 plan 一任务/分别刷新、失败/取消/未知结果不伪 ready；关库重进、断线/实例切换和当前板旧后台任务状态准确；无 Profile/离线仍可选板；编译一键续接及中途取消各一次；顶部无下载 badge、上传无安装大块/日志、卡片鼠标/键盘/窄屏不挡取消；保护模块原字节继续核对。

本轮只新增本设计文件；真实操作时机以开发证据和主控最终契约为准。
