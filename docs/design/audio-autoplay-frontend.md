# AudioContext 解锁：冻结契约核对

2026-11-24。只读核对 [主控 AudioContext 契约](../api-contract.md#audiocontext-解锁与警告洪泛修复2026-11-24主控冻结)。结论：现有冻结范围足够，无需扩大音频架构；仅精确修复独立依赖，产品实现由已派前端任务负责。

## 源码证据

当前准备产物 `.runtime/web-openblock/openblock-vendor/openblock-gui.js` 模块 520 是带 MIT 声明的 `node_modules/startaudiocontext/StartAudioContext.js`。其 `onStarted.checkLoop` 在 context 非 running 时先排下一帧，再无用户手势调用 context.resume；首次进入也立即调用，因此主控/开发已复现 120 帧产生 121 次 resume。用户约 29 万条警告的反馈与该无界路径一致，具体总数不由本设计复测。

scratch-audio 构造处经包装模块 1534 调用 520；GUI `src/lib/audio/shared-audio-context.js` 也直接引用 520。只改 GUI 单个调用点不足以覆盖音频引擎。该独立依赖不等于 openblock-vm 模块，允许的修复例外仅限此精确模块；不修改 VM、Blockly、AudioEngine 初始化顺序或全局 AudioContext 原型。

## 最小实现核对项

- **完成监听代替轮询。** onStarted 以 `statechange` 观察 running，先注册监听再核对当前 state，覆盖注册间隙；已 running 立即完成。该监听只检查状态，不调用 resume，不创建 rAF/定时重试。每个 StartAudioContext 注册的成功 Promise 与 callback 最多完成一次。
- **解锁只发生于真实手势。** 原有 tap 入口及必要的鼠标/键盘入口在同步事件栈内尝试，校验 isTrusted，并在支持时校验 userActivation.isActive；不将调用移入微任务、定时器或 effect。touch 拖动、重复按键及不产生激活的事件不能成为重试循环。保留 iOS 静音 buffer 兼容时，也只在这一次真实手势尝试里创建/播放。
- **按上下文去重。** 用模块内 WeakMap 或等效记录合并同一 context 的状态监听和在途 resume；多个消费者保留各自回调和元素范围，不因合并丢失监听目标。单次手势序列触发多个事件时，已有在途尝试不重复调用；resume 拒绝有处理，解除在途标记，留待下次真实手势再试，不后台重试。以实际 running 判断成功，不能仅因 resume Promise fulfilled 就假报可播放。
- **清理不伪造成功。** running 后移除 statechange/tap/key 监听并完成成功语义；closed/页面卸载后终止监听、临时静音节点与在途记录，不再恢复，不调用成功 callback。原接口没有取消结果，关闭时不可通过未处理的 Promise.reject 新增控制台洪泛；可在清理后保留未完成的“等待首次 running”Promise。浏览器最初创建受限上下文的单次策略提示不等于本轮持续洪泛。
- **保护检查的精确例外。** [准备 hooks](../../apps/web/scripts/openblock-hooks.mjs) 保留固定上游 SHA、唯一片段/模块匹配和原许可声明。[字节核对脚本](../../apps/web/scripts/verify-upstream-bytes.mjs) 现有 `source` 必须以 src/ 开头的断言，应仅增加本依赖精确路径的允许项，不能整体放宽为任意 node_modules；178 个 VM、15 个 Blockly 模块继续逐字节一致。

上述是冻结契约的实现落点补充，不需要新增公共接口、全局音频管理器、console 过滤或浏览器策略变更。Chrome 要求受限上下文在用户交互后恢复；Web Audio 规范以状态变化表达运行状态。[Chrome 官方说明](https://developer.chrome.com/blog/autoplay#web-audio) · [Web Audio 规范](https://www.w3.org/TR/webaudio/)

## 验收闭合

独立依赖对照测试：无手势 120 帧原版 121 次、修复后 0 次 resume；合成事件 0 次；同 context 多注册/重复手势在途只尝试一次；拒绝后下一真实手势可重试；running 完成一次并清监听；closed/卸载无继续调用或未处理拒绝；多 context 相互独立。保留 Promise/callback 和元素绑定行为，不写只验证替换文本存在的测试。

真实浏览器由主控在默认策略下验证：空闲观察不持续增长相同警告，首次可信点击及键盘操作后声音预览和积木播放可用，运行中的音频行为无回归。构建保护字节检查通过后再验收线上资源，不能以 mock 或被放宽的自动播放策略代替。此设计没有运行浏览器、音频、服务或实体串口。
