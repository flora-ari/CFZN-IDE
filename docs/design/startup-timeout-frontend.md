# CCraft 启动超时的最小优化

2026-11-23。只读核对前端、当前生产产物与发布记录。主控补充实测首页及 API TTFB 约 40ms，带 `Accept-Encoding:gzip` 请求 GUI 仍收到 22663813 字节，响应缺少 Content-Encoding。上线服务和公网实际浏览器由主控负责验证。

## 已确认的启动链与问题

外层 React 挂载 iframe 后创建 EditorBridge，此时立刻开始 45 秒启动计时。iframe 依次解析加载 React 16、ReactDOM 16、GUI 大脚本、静态模块 helper，再执行 Vite 的编辑器模块。当前 GUI 为 parser-blocking classic script。编辑器模块检查 GUI 对象并挂载真实编辑器，只有默认项目加载、完整默认归档准备成功后才隐藏遮罩并发送 READY。父页面在 READY 时清计时器。此前 HELLO 和 iframe load 后 HELLO 的补发已能覆盖监听早晚的差异，继续复用。 [Bridge](../../apps/web/src/editor-bridge.ts#L25) · [iframe 页面](../../apps/web/openblock.html#L13) · [项目就绪](../../apps/web/src/openblock.ts#L266)

当前发布 GUI 原文 22663813 字节，SHA-256 为 `779645f288c17a3ffc4c181908a681d203e410387026ccbf202dc571a6ea359d`。本次仅在内存中做 Node gzip level 6 试压，得到 5480123 字节，约原体积的 24.18%，解压与原文完全相同。2 Mbps 下单纯传输理论耗时分别约 90.7 秒和 21.9 秒，还需叠加连接、其他资源及浏览器解析初始化时间。此计算说明传输优化幅度，不能作为线上启动耗时证明。

已存发布证据显示 HTML 和固定路径 GUI 为 `Cache-Control:no-cache`，Vite 带摘要的 assets 是一年缓存。no-cache 可保存后校验，首次访问仍需完整 GUI 下载。GUI 路径未带内容摘要，每次访问也需要重新验证。上次发布记录已注明 GUI 首个 45 秒下载超时，延长读取后才完成字节校验。 [线上文件记录](../../tests/evidence/ccraft-branding-20261123/deployed-verification.json) · [发布说明](../ccraft-branding-release-20261123.md)

还有两项反馈问题。45 秒超时只调用外层 onBootError，iframe 仍在加载。之后 READY 可以正常到达，但 App.receive 仅更新快照，先前 error notice 会继续显示，造成已就绪仍提示超时。GUI 下载前的脚本错误也发生在 openblock.ts 执行之前，其 try/catch 尚未安装，当前只能等通用超时。 [超时与 READY](../../apps/web/src/editor-bridge.ts#L29) · [父页面回调](../../apps/web/src/App.tsx#L225) · [快照接收](../../apps/web/src/App.tsx#L43)

## 建议冻结的最小交付

| 位置 | 实施规则 |
| --- | --- |
| 静态传输 | 优先给生产 JavaScript 启用正确 gzip 响应。推荐构建产物旁生成同名 .gz，Nginx 以 gzip_static 选择，或由部署配置动态 gzip。浏览器始终请求 .js，响应保持 JavaScript Content-Type，按协商返回 Content-Encoding:gzip、Vary:Accept-Encoding，解压后 SHA-256 与原始 GUI 一致。普通不接受压缩的客户端仍能取到原字节。构建打包或 Nginx 配置由主控指派，不改变 VM/Blockly 内容。 |
| 缓存与发布 | 按主控最新收敛，本轮保持 GUI 稳定 URL 和 `no-cache + ETag`，HTML 继续校验，现有 Vite assets 摘要缓存继续使用。GUI 与对应 .gz 由同次构建、同次发布交付，防止旧压缩副本覆盖新原文；静态 .js 未命中返回真正 404。内容摘要 URL 可改善重复访问校验成本，留待后续，当前不新增 HTML transform、manifest 或 URL 迁移。 |
| 依赖顺序 | 保留 React→ReactDOM→GUI→helper→编辑器挂载的依赖关系。第一轮优化使用压缩与缓存，避免为了并行把现有 script 全加 async 而产生全局变量未就绪。模块请求在 Vite dist 中已会从 head 提前下载，按实际瀑布图决定额外 preload 的收益。 |
| 真实失败 | 在 iframe 的关键依赖之前安装轻量错误监听，捕获明确的关键 script/link 资源加载失败，以及这些启动脚本的执行错误；初始化和默认项目归档失败继续走现有 bootFailure。用现有同源协议包络发送 BOOT_ERROR，立即显示资源或初始化的可读原因，清除启动计时器，不再等 45 秒。监听只服务启动，READY 后停用，避免把无关图片或运行期异常判为启动失败。 |
| 慢加载 | 从 bridge 构造起 45 秒仍未 READY 时，仅显示“编辑器加载较慢，仍在等待，请稍候”，继续等候同一 iframe。内部回调或启动状态区分 slow 与 error，不能继续复用 onBootError 表示慢加载；不新增跨 iframe 协议类型，不改现有 RPC 的 45 秒操作超时。 |
| 未就绪截止 | 建议从同一起点 180 秒仍未 READY 时显示“编辑器尚未就绪，可重新加载”，允许显式重试。它表示等待截止，不能声称已定位网络、服务器或 GUI 故障；真实 BOOT_ERROR 有自己的明确原因。截止不自动重载或停止页面，当前尝试晚到的真实 READY 仍可恢复。180 秒是建议默认值，由主控冻结，并用压缩后的冷启动证据检验。 |
| 成功恢复 | READY 是启动成功的唯一判据，清除本次两个启动计时器及启动专用提示，再按现有流程接收项目状态、启用工具栏。App 使用独立 startupNotice/启动状态承载这些提示，业务 notice 原样保留；不能在每次 CHANGED/onState 时清通用 notice。加载、初始化、项目准备可显示真实阶段，不伪造百分比。 |
| 重试 | 首次尚未 READY 的截止/失败界面提供显式“重新加载编辑器”，销毁旧 bridge、两个计时器和监听后重建 iframe。旧实例事件不得影响新尝试；重试成功只保留一个有效 bridge。已经 READY 后沿用现有未保存检查和硬件任务守卫，不把启动重试入口用于重建工作中的编辑器。 |

主控已确认 Nginx 支持 gzip_static，并负责仅 IDE 站点的 gzip 与构建预压缩。前端保持既有脚本依赖顺序，新增预压缩产物应纳入构建缺文件检查；gzip 必须从本次最终 GUI 原文生成。压缩属于发布表示，验收继续核对解压字节及现有 VM/Blockly 模块字节。 [准备与缓存](../../apps/web/scripts/prepare-openblock.mjs#L18) · [生产 HTML](../../apps/web/dist/openblock.html) · [上游字节核对](../../apps/web/scripts/verify-upstream-bytes.mjs)

## 同轮追加的 Logo 官网入口

用户最新要求左上角 CCraft Logo 打开 `https://maker.xiaodaiyang.top/`。现有“官网”控件的 GUI 挂点已经同步调用 `window.open(url,'_blank','noopener,noreferrer')`。Logo 复用同一目标和同步用户手势行为，推荐在原生 Logo 处使用真实链接 `target="_blank" rel="noopener noreferrer"`，可访问名称为“CCraft 官网”，Tab 可聚焦、Enter 可触发。正常和 overflow 两分支使用同一个点击目标和 PNG，保持现有 120×40 展示。打开官网新页时当前作品和编辑器继续留在原页。 [现有官网行为](../../apps/web/scripts/openblock-hooks.mjs#L30) · [Logo 挂点](../../apps/web/scripts/openblock-hooks.mjs#L7)

## 聚焦验收

1. 发布后用真实 gzip 协商核对 GUI 的 Content-Encoding、Vary、Content-Type、传输大小及解压后摘要。确认压缩首访的实际完整下载时间，按同一网络条件记录首次冷启动 READY、初始化阶段和浏览器错误。首页/API 正常或文件能下载只覆盖各自检查。
2. GUI 稳定 URL 保持 no-cache 与有效 ETag，同版本校验命中返回 304；变更 GUI 后取回新字节及相匹配的压缩副本。现有 Vite 摘要资源保持长缓存，首页/iframe HTML 正常重新校验。
3. 延迟 GUI 超过 45 秒显示慢加载，晚到 READY 清启动提示；延迟至建议 180 秒显示未就绪截止，晚到 READY 仍可恢复。模拟 GUI 404、启动脚本执行错误、编辑器模块失败及默认项目准备失败，立即出现对应 BOOT_ERROR 原因。设置一条保存错误后验证 READY 不误清该业务 notice。显式重试成功仅保留一个有效 bridge，两次计时器与旧消息均失效；READY 后延迟运行不再触发启动提示。
4. 真正启动后执行舞台积木、保存及重开，继续保持实际归档与模式功能。核对 178 个 VM、15 个 Blockly 模块逐字节相同，gzip 解压字节也与该 GUI 原文件相同。
5. 鼠标点击 Logo 和键盘 Enter 在正常/overflow 布局均打开指定官网新标签，原编辑内容与保存状态保持。按原有“官网”入口再验证一次相同行为。

本轮只交设计和内存压缩测量。部署配置、源码修改与浏览器运行由主控冻结后分派。
