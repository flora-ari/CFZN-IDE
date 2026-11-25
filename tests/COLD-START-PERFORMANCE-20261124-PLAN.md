# 编辑器冷启动独立验收准备

2026-11-24（Asia/Shanghai）。**契约“编辑器强刷冷启动优化”已冻结；夹具准备完成，等待交付，尚无性能改进通过结论。** 不改产品、不运行浏览器/CDP、不启动服务或操作串口。仅主控负责相同 800 KiB/s 条件下的真实浏览器测试。

## 基线和验收指标

固定线上发布基线为 `20261124T081631Z-cfe8ac8d/bundle/web`，GUI SHA-256 为 `1bb1133602dfc5044f00404ea246321ad4bec5071a9baa482ec6fa8356ffb0d2`。以该隔离发布目录比较，不能把含并行 Link 开发的当前 dist 当成基线或直接发布。

主要指标是**同等网络/设备/缓存条件下，从导航开始到父页面收到有效 READY、实际可编辑的时间**。READY 仍须在真实 GUI/VM 初始化、默认项目完成、defaultArchive 就绪后产生。HTTP 完整下载、LCP、加载遮罩隐藏、提高超时、gzip 等级或理论带宽换算均不能替代该指标。

主控前次线上观测首页直接 TLS 约 0.065s、GUI 下载约 6.89s 是诊断背景；与设计或历史记录中的其他秒数不混为同一对照样本。当前没有证据表明默认项目需等待公网素材，不把该推测当成优化依据。

## 元数据夹具

[cold-start-performance-20261124.mjs](cold-start-performance-20261124.mjs) 只读检查文件，输出到本轮 evidence 目录。准备阶段运行 baseline；候选仅在主控交付后通过 `COLD_CANDIDATE_WEB_DIR` 显式指定。

```powershell
node tests/cold-start-performance-20261124.mjs
# 冻结后，将环境变量设为主控交付的候选 web 目录再运行；不默认使用工作区 dist。
```

记录原文实际字节、现成 gzip/br 表示字节和解压哈希、两 HTML 引用/预加载/脚本顺序、当前 favicon 体积、用户原图及顶部 Logo、三份许可和模块 520 哈希。逐个复核 178 个 VM / 15 个 Blockly 的原模块字节，不允许整包压缩顺便改写保护模块。脚本执行 JS 语法编译但**不执行 GUI**，输出明确标记该边界；体积检查不自行授予冷启动通过结论。

实际传输按最终服务器选用的 Content-Encoding 和传输字节评价；所有压缩副本必须解压回同一原文。800 KiB/s 按 819,200 B/s 计算的 GUI 理想传输时间仅作背景，不代表页面共享带宽下的总加载、解析或 READY 时间。不能只比较 gzip level。

## 冻结后独立检查

1. 按最终允许的改动审查准备指纹、精确模块边界、可重复构建和产物缺失检查；全体保护模块与许可字节不变。音频模块若原字节保留，记录哈希；若冻结允许安全压缩它，必须对候选实际模块重跑手势/在途去重/拒绝恢复/清理行为，不能只搜索修复标记。
2. 候选实际 GUI 可解析，并完成有意义的实际模块执行和启动错误/重试、晚 READY/旧来源隔离回归；完整真实 GUI 执行与可编辑仍由主控浏览器证明，不以 Node 语法检查冒充。
3. 根据冻结方案核对首页/iframe 相同 preload URL、as、credentials/CORS 与原执行顺序；真实是否复用、是否双下载由主控 ResourceTiming/请求记录判定，不能从标签推断。若没有该方案则不添加此项。
4. 保留已发布音频手势修复、顶部 Logo 和用户 favicon 原文件。若新增小图标，允许只改图标引用，原图字节保留；核对新小图标格式/体积及视觉验收来源，不宣称 favicon 每减少一字节就等量减少 READY。
5. 后端/发布若涉及 HTTP/2 或编码协商，只按冻结范围核对配置、模块能力、identity 回退、Vary/Content-Type/ETag/304、压缩副本哈希和已有边界。不能把协商成功当成编辑器已经更快。最终发布逐文件对照线上基线，排除并行 Link/API 变更。

## 主控真实浏览器证据要求

基线/候选使用相同浏览器、机器、页面 URL、网络限速与延迟，交替执行以减少机器或网络漂移；条件允许时各至少 3 次，保留单次值及中位数，不删除无解释的异常值。明确区分首次空缓存、强制刷新、普通暖启动；暖缓存结果不能证明用户要求的首次强刷加速。

每次记录：release/GUI 哈希、缓存处理方式、800 KiB/s 是否真实生效、导航起点、GUI 请求开始与完成、有效 READY、首次可编辑验证、所用时钟 timeOrigin、资源错误与请求列表。跨 iframe 与父页面时间需换算同一时钟，不能直接相减不同 frame 的 performance.now。记录实际协议和编码、传输/解码字节、缓存标记、重复 GUI 下载及外网依赖；多资源共享限速需真实观测，不能把单个资源理想时间当总耗时。

真实回归需确认默认项目完整、积木可编辑与舞台执行、保存/重开与新建默认归档、音频预览、失败资源重试；串口/刷写不属于冷启动验证。物理可听声音、线上冷启动、本地限速和 Node 模拟证据分别表述。若真实 READY 改善不明显，报告实际结论，不用更长超时或更早隐藏遮罩作为通过理由。

最终冻结后补独立报告，分别列出体积变化、实际执行回归和主控浏览器时间证据。当前仅准备夹具与基线，没有运行候选验收。

## 冻结契约补充与当前准备结果

以下按最新冻结契约收敛前面的提案性备选项：不重绘用户图标，favicon 引用和原字节保持基线；保留 legacy GUI 全文，仅另加 identity 摘要命名的快 GUI。H2 已在线，不计作重新开启的收益。候选必须由主控明确交付，不推断工作区已完成。

元数据夹具已用独立 TypeScript AST 定位唯一外层 Webpack CallExpression 的 1,959 槽数组，再依据各槽 AST 范围内的标记取模块。嵌套数字注释不能成为顶层分割点。已在原基线完成验证，记录 41,164 个函数签名；1169 明确为 OmittedExpression，准备阶段曾发现空槽没有普通 getStart trivia，已按相邻 AST 槽范围修正夹具，未修改产品。

候选检查已准备：178 VM / 15 Blockly 模块原字节；额外保护 520、237、435（包含内部表）、1169、1958 与不可靠槽原字节；所有顶层模块的函数名称/参数、生成器/async 标志及 Identifier 序列摘要；legacy 原文不变；快 GUI 的 16 位名称取最终 identity SHA-256；两页 preload 与执行 script 使用相同 URL、as=script 及一致 crossorigin 模式。准备指纹/helper/名单/工具版本审查和实际执行留待交付。

[cold-start-encoding-20261124.mjs](cold-start-encoding-20261124.mjs) 已准备实际 HTTP 检查，尚未连接服务。必须由主控提供 `COLD_ENCODING_URL`（严格快 GUI URL）及 `COLD_CANDIDATE_WEB_DIR` 才能执行；使用 node:http/https 原始响应，避免 fetch 自动解压。覆盖大小写/空白、合法 q=0 和最小正值、非法 q、br/gzip/identity、通配符及显式拒绝、406、HEAD、各表示 304/跨表示 ETag、Vary/安全头、缺文件与私有路径。内部路径别名可用 `COLD_INTERNAL_ENCODING_PATHS_JSON` 补入。选择遵循主控明确的**可接受正 q 中 br > gzip > identity 服务器偏好**，不强行按不同正 q 权重排名。

已只读审查 deploy helpers 并执行纯 Bash 配置生成，**未执行 Nginx、安装器主体或部署**。`bash -n`、`set -u` 下 heredoc 变量保留、3 个 location 的 Vary/安全头、两私有表示、gzip_static 能力分支、非法文件名拒绝及 19 个生成正则选择样例均通过。证据：[deploy-source-review.json](evidence/cold-start-performance-20261124/deploy-source-review.json)、[map 配置](evidence/cold-start-performance-20261124/generated-negotiation-maps.conf)、[location 配置](evidence/cold-start-performance-20261124/generated-negotiation-locations.conf)。当前未发现源码/生成配置阻塞项；实际 HEAD/304/状态头行为仍须主控私有 QA Nginx 或明确交付端点证明，不能由这些模拟正则结果替代。
