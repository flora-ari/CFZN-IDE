# AudioContext 与 favicon 独立验收

日期：2026-11-24（Asia/Shanghai）。**源码、新 production build 和最终隔离发布包独立验收全部通过，未发现发布包范围阻塞项。**

依据 `docs/api-contract.md`《AudioContext 解锁与警告洪泛修复》及 `docs/design/audio-autoplay-frontend.md`。测试直接执行固定上游和交付包中的独立 startaudiocontext 模块 520，没有替代其实现、屏蔽 console、修改浏览器策略或操作真实音频设备。

## 执行结果

| 检查阶段 | 结果 | 证据 |
| --- | --- | --- |
| 交付源码独立行为验证 | 8 / 8 通过 | [source-checks.json](evidence/audio-autoplay-20261124/source-checks.json)、[输出](evidence/audio-autoplay-20261124/source-tests.txt) |
| 现有音频聚焦回归 | 8 / 8 通过 | [frontend-audio-tests.txt](evidence/audio-autoplay-20261124/frontend-audio-tests.txt) |
| 新 production build 独立行为及资源验证 | 9 / 9 通过 | [independent-checks.json](evidence/audio-autoplay-20261124/independent-checks.json)、[输出](evidence/audio-autoplay-20261124/production-tests.txt) |

源码和 production 阶段重复执行同一组行为场景以核对实际交付模块，不将其合计为互不重复的覆盖数。未重跑前端全部 171 项、后端或旧工厂矩阵；开发方全量检查为交接信息。

独立脚本：[audio-autoplay-20261124.mjs](audio-autoplay-20261124.mjs)。项目根目录执行：

```powershell
$env:AUDIO_SOURCE_ONLY='1'
try { node --test tests/audio-autoplay-20261124.mjs } finally { Remove-Item Env:AUDIO_SOURCE_ONLY }
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/audio-unlock.test.ts
node --test tests/audio-autoplay-20261124.mjs
```

## 行为证据

- 固定归档原始模块在注册时即调用一次 resume，继续驱动 120 个模拟动画帧后合计 **121 次 resume、121 次 rAF 请求，仍留 1 个待执行帧**。交付模块在相同无手势观察中为 **0 resume、0 rAF、0 定时器**，且没有提前调用成功回调。
- 合成 isTrusted=false 事件和可信但 userActivation.isActive=false 的事件均不恢复。可信激活手势在同步调用栈中调用 resume；实际状态切换 running 后才完成 Promise 和可选 callback，各注册最多完成一次，并清除手势及 statechange 监听。resume Promise 先 fulfilled、状态仍 suspended 时，不伪造成功。
- 同一 context 多次注册会合并元素范围与在途恢复。向两个注册目标发手势仍只有一次在途 resume，各自成功回调均保留。拒绝已被处理，不触发后台帧/定时重试，下一次真实手势能再次尝试并成功。
- 已 running 的 context 立即成功，不 resume；已 closed 的 context 不 resume、不产生未处理拒绝。尝试期间关闭后清监听且不假报成功。页面 pagehide 清理等待中的另一个 context；多个 context 的完成、次数和回调彼此独立。
- 默认 body、指定 Element、数组、NodeList、选择器和 jQuery-like 元素输入均保留 Promise 与可选 callback 接口。现有 8 项聚焦回归补充触摸拖动、修饰键/重复键过滤、无可选 activation API、同步 resume 抛错、静音节点清理、再次 suspended 后注册及精确补丁失败闭合。

## 修复边界与资源

只读审查确认准备脚本引入 `audio-unlock-hook.mjs`，按固定模块 520 的原 body SHA-256、模块唯一性、factory 唯一性做校验；保留 UMD/原始 MIT 声明。现有回归确认变动仅在该模块，移动/篡改/重复输入均拒绝。准备输入指纹包含该 helper，未修改全局 AudioContext 或 console，没有后台音频解锁循环。

当前新完整构建 GUI SHA-256：`1bb1133602dfc5044f00404ea246321ad4bec5071a9baa482ec6fa8356ffb0d2`。`.runtime/web-openblock` 和 dist 中模块 520 完整内容一致。固定上游对照下，两份产物的 **178 个 VM、15 个 Blockly** 模块完整内容及清单哈希一致；三份 `LICENSE` / `LICENSE.MIT` / `TRADEMARK` 保留原字节。

本次新 favicon 与用户原始剪贴板 PNG 字节一致，大小 1,657,390 字节，SHA-256 为 `c4375f067f4da96b6fb4b14a6c4ede4df0bb7a440f840e35c9a33680557292cb`。public 和 dist 图片均匹配；源及 dist 两份 HTML 各只有一个 `rel="icon"`，`type="image/png"`，引用 `/branding/ccraft-tab-icon.png`。顶部 Logo 的 public / dist 原字节继续为 `c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2`，没有将 favicon 误替换为顶部标志。

## 最终隔离发布包

最终包：`build/deploy/20261124T081631Z-cfe8ac8d/bundle`。对照基线：`build/deploy/20261124T025043Z-cfe8ac8d/bundle`。主控已核对基线与线上 HTML 一致；独立测试方没有访问线上，独立审计仅对两份本地产物执行。

逐文件检查通过，详见 [release-audit.json](evidence/audio-autoplay-20261124/release-audit.json)：

- 基线 2,258 文件、最终 2,259 文件，2,250 文件完全相同，全部 **36 个 API 文件**逐字节相同。其他差异严格为：新 favicon PNG、两 HTML、GUI、vendor manifest、release/compression 元数据及 2 份 gzip 表示。没有删除文件或带入其他前端资源。
- GUI 模块 520 前后所有字节分别完全一致，只有该模块发生替换；最终 GUI 与已通过行为验证的当前 dist GUI 完全相同，SHA-256 为 `1bb1133602dfc5044f00404ea246321ad4bec5071a9baa482ec6fa8356ffb0d2`。因此该完整 build 中并行 Link 的其他入口、代码或 API 没有进入此次隔离包。
- 两 HTML 去除各自唯一 favicon 标签后，剩余全文与基线完全一致；最终标签为 `rel="icon" type="image/png" href="/branding/ccraft-tab-icon.png"`。旧 `editor-sqHyfw8P.js`、CSS 和其余前端文件保持基线字节。
- vendor manifest 除新增 releasePatch 外与基线 JSON 完全相同，releasePatch 的基线、模块 520、GUI 与 favicon 哈希均准确。最终顶部 Logo 与基线原字节相同，新 favicon 与用户原 PNG/public 原字节一致。
- 全部 **284 个网页 gzip 副本**解压后均与各自原文件逐字节一致。最终归档的两 HTML、GUI 和新 PNG 只读提取后与 stage 对应文件一致。

归档 `cfzn-ide.tar.gz` SHA-256 为 `ee3f4bdf8594fd9d602850e9f2797997308bc65f635540d3fd06561822085ca5`，与父目录 manifest 及主控交付值相同。

## 实测边界与交付

主控另行报告已在真实浏览器装载原始模块 520：native AudioContext 为 suspended，未操作时 resume 计数从 25 增至 3501，blocked fixture 也复现；对照页已关闭。主控保存的 [browser-harness.json](evidence/audio-autoplay-20261124/browser-harness.json) 记录实际生产依赖在默认策略下的修复对照：空闲 native / fixture resume 均为 0；鼠标与键盘激活后两者各恢复 1 次并到 running、tonesStarted=1、errors 为空。另有 [ide-browser.json](evidence/audio-autoplay-20261124/ide-browser.json)、[音频 harness 截图](evidence/audio-autoplay-20261124/audio-unlock-success.jpg) 和 [声音预览截图](evidence/audio-autoplay-20261124/ide-sound-preview.jpg)，记录隔离最终包两页新图标、声音预览进入“停止”状态及 audioLogs 为空。

这些是主控提供的真实浏览器证据，独立测试方仅只读核对记录，没有覆盖文件，也没有计入 Node 测试数。记录明确 `physicalAudibilityMeasured:false`，因此不宣称扬声器实际可听或完整声音积木播放已经测量；模拟 isTrusted/userActivation 也不能替代真实浏览器激活。最终线上资源与物理声音边界由主控明确。

本轮没有运行浏览器/Playwright/CDP、访问 3002 或物理串口，没有关闭或重启任何用户服务。仅新增、更新本轮 `tests/` 脚本、报告和证据，未修改产品实现。独立验收完成并冻结；真实声音与最终线上验收由主控负责，发布动作未由本测试任务执行。
