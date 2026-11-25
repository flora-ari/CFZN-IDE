# 编辑器强刷冷启动独立验收

2026-11-24（Asia/Shanghai）。**最终冻结 stage、聚焦回归及部署后正式 HTTPS 编码验收全部通过，未发现阻塞项。主控已发布 20261124T092948Z-cfe8ac8d；本地补测 READY 中位数观察改善 22.39%，不作公网同幅度承诺。**

最终包：`build/deploy/20261124T092948Z-cfe8ac8d/bundle`；基线：已发布的 `20261124T081631Z-cfe8ac8d/bundle`。最终 fast GUI 为 `openblock-gui.0f3346f8af93e2a9.js`，SHA-256 `0f3346f8af93e2a988f5afb23ac870389e60acb2ee021692c5401c83eb9c1d55`。本结论针对该冻结 stage，没有用工作区 dist 的其他版本替代。

## 独立执行结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 最终 stage 全模块严格不变量与保护字节 | 通过，差异模块 0 | [完整结果](evidence/cold-start-performance-20261124/metadata-0f3346f8af93e2a9-passed.json) |
| 最终包隔离、原图、HTML 与压缩表示 | 通过 | [范围审计](evidence/cold-start-performance-20261124/release-isolation-audit-20261124T092948Z-cfe8ac8d.json) |
| 生成器与实际受控 factory 执行 | 4 / 4 通过 | [执行输出](evidence/cold-start-performance-20261124/focused-gui-tests.txt) |
| 音频依赖行为与精确补丁回归 | 8 / 8 通过 | [执行输出](evidence/cold-start-performance-20261124/audio-regression-tests.txt) |
| 独立校验器的拒绝/接受边界 | 9 / 9 通过 | [执行输出](evidence/cold-start-performance-20261124/token-guard-tests.txt) |

恢复后 21 项聚焦测试全部通过。暂停前最终 stage 的完整严格校验实际已完成并落盘；恢复后复核其 candidate 目录、零差异及通过标志，并重新核对冻结 GUI 和归档摘要。已通过且未变的整包检查没有重复执行。暂停时中止的进程不计为测试通过，也没有采用作废候选或中间浏览器结果。

没有重跑全量前后端或旧工厂矩阵，也没有再次执行整份上游的优化重建测试；独立直接对最终交付字节进行全模块核对。整页 GUI/VM 在浏览器中的初始化和实际可编辑由主控负责，Node 语法编译及受控 factory 执行不能替代完整浏览器验收。

## 严格 AST、原始 token 与许可

[独立夹具](cold-start-performance-20261124.mjs) 从唯一外层 Webpack CallExpression 数组定位 1,959 个槽位，只在各槽 AST 前导范围读取标记，嵌套数字注释不能切出假模块。模块 1169 明确为 OmittedExpression。

逐模块核对最终与基线：

- 全部 178 个 VM、15 个 Blockly 按原清单哈希逐字节一致。
- 520 音频依赖、237 / 435 整个嵌套表及内部、1169 空槽、1958 包尾入口保持原字节；legacy GUI 完整哈希不变。
- 41,164 个函数的名称、参数、generator/async 标记，以及全体标识符、常量、AST 结构与 3,030,922 个真实可执行 parser token 一致。
- 字符串、正则、template 原始拼写属于 token 核对范围；AST 结构另检出相同 token 在 return 换行、前缀/后缀自增中的 ASI 语义差异。614 处内嵌许可原文计数/摘要和三份独立 LICENSE / LICENSE.MIT / TRADEMARK 不变。
- 外层 bootstrap 前后字节一致，仅允许移除已经失效的外部 sourceMappingURL 注释，不改初始化边界。

生成器源码审查确认改为打印原 parser token，只处理 gap trivia；用相邻 token 扫描避免粘连，先尝试删除换行，AST 不等价时改为保留换行，不可靠结果拒绝或原样保留。输出后再次比较原 token、内部签名、标识符与 AST，而非只依赖工具选项。准备指纹包含 lexical/optimizer/HTML helper、保护名单和 TypeScript 工具版本，并核验必需输出及快/legacy 摘要。

JSDoc 边界曾在测试侧造成一次误报，已具体定位并修正：[证据](evidence/cold-start-performance-20261124/jsdoc-boundary-evidence.json)。模块 6 的四个 `/** @class */` 被 TypeScript 表示为注释子节点，其中的 `class` 是伪 Identifier，不是执行 token；排除该注释子树后，两份实际 token 流逐项相同。许可仍独立核对。新增回归明确验证普通/JSDoc trivia 可以变化，而真实名称、参数、常量、literal、ASI 和许可变化仍被拒绝，未放宽这些不变量。

原 a4c534 候选确有内部函数/参数改名及常量折叠，已作废；[原始具体证据](evidence/cold-start-performance-20261124/candidate-a4c534b8-binding-failure.json)保留。旧 token 遍历曾混入非执行 JSDoc，其历史总差异数不再用于最终候选判断。最终权威结果为本报告链接的 `0f3346...-passed.json`，不是历史 failure 文件。

## 有效字节、引用和隔离范围

| 表示 | 基线字节 | 最终字节 | 变化 |
| --- | ---: | ---: | ---: |
| identity JS | 22,664,720 | 17,619,329 | 减少 22.26% |
| gzip | 5,480,379 | 4,662,697 | 减少 14.92% |
| br | 无对应基线表示 | 3,753,908 | 另加实际表示 |

以上是文件/传输表示体积，**不是 READY、可编辑时间或整页提速百分比**。

最终文件名的 16 位摘要取最终 identity SHA-256，不取 gzip/br。首页 preload 与 iframe 执行 script 使用同一 hash URL、as=script 和一致请求模式；原 React → ReactDOM → inline 别名 → GUI → loader 的执行依赖保留。直接编辑器页不强制额外 preload。是否真实复用响应、是否重复下载必须由主控浏览器证明。

逐文件范围审计：基线 2,259 文件，最终 2,263 文件，2,253 文件完全相同；36 个 API 文件全部相同。变化限于两 HTML 快 URL/preload、快 GUI 及其表示、必要 manifest/release/compression 元数据；旧 app/editor、其他资源和 legacy GUI 不变，没有混入并行 Link 修改。manifest 去除 fastGui/guiOptimizer/coldStartPatch 后与基线相同。287 份 .gz/.br 均逐个解压回对应 identity。

顶部 Logo 和用户 favicon 的原字节/引用保持基线，SHA-256 分别为 `c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2`、`c4375f067f4da96b6fb4b14a6c4ede4df0bb7a440f840e35c9a33680557292cb`。

归档 SHA-256 为 `a49afbc3913a3e641fc32feddf237f0a1431060effa34802ca78e08d46369941`，与交付 manifest 一致。

## 编码服务与真实性能证据边界

独立 deploy 源码/生成配置审查及 19 个选择边界通过：[结果](evidence/cold-start-performance-20261124/deploy-source-review.json)。Bash heredoc 变量、三个 location 的安全头/Vary、内部表示、gzip_static 能力分支与严格文件名检查正确。选择遵循已明确的正 q 中 br > gzip > identity 服务器偏好，不假称按不同正 q 权重排名。

主控另提供 [私有 Nginx QA 摘要](evidence/editor-cold-start-20261124/transport-qa-summary.json)：Nginx 1.20.1 的 75,000 B 合成 fixture 验证 23 编码/q 样例、HEAD、表示独立 ETag/304、跨表示 200、私有路径和缺 br 时 404 不误带 Content-Encoding。该测试 master 已退出，未 reload 生产。这是主控实测，不计入本独立任务的 Node 测试数，不能替代最终文件的线上字节或浏览器 READY。

主控已提供冻结最终包三个新 origin 5180 / 5181 / 5182 的 [READY 记录](evidence/editor-cold-start-20261124/browser-after-1.json)、[第二次](evidence/editor-cold-start-20261124/browser-after-2.json)、[第三次](evidence/editor-cold-start-20261124/browser-after-3.json) 和 [请求记录](evidence/editor-cold-start-20261124/browser-after-requests.json)。独立只读核对结果见 [coordinator-browser-evidence-review.json](evidence/cold-start-performance-20261124/coordinator-browser-evidence-review.json)：每个 origin 恰好 1 个完整 br GUI 响应、3,753,908 B，iframe transferSize=0，复用 parent preload，无双下载。

iframe 导航到现有真实 READY 的三次值为 8,351 / 7,742 / 7,674 ms，中位数 7,742 ms；父页面 topReadyMs 为 8,628 / 7,825 / 7,770 ms，中位数 7,825 ms。两者计时起点不同，不混算。该 fixture 只给 GUI 响应限速至 800 KiB/s，其他资源未统一限速；候选使用新 origin 且完整下载。按主控最新说明，测试客户端曾重建工具绑定，仅确定同一机器和 IAB 类型，未严格控制浏览器进程一致性、CPU 调度或编译/code cache；不采用比较文件中仍残留的“同一进程、未重启”旧表述。

[恢复后基线 1](evidence/editor-cold-start-20261124/resumed-before-1.json)、[基线 2](evidence/editor-cold-start-20261124/resumed-before-2.json)、[基线 3](evidence/editor-cold-start-20261124/resumed-before-3.json) 为 10,564 / 9,976 / 9,832 ms，中位数 9,976 ms；每次均完整下载旧 GUI 的 5,480,379 B gzip。相对候选 7,742 ms，中位数减少 2,234 ms，约 **22.39%**，已独立复算并记入证据复核 JSON。[performance-comparison.json](evidence/editor-cold-start-20261124/performance-comparison.json) 已使用这组数值；环境文字的边界按主控最新更正解释。此为本机样本观测，不是严格隔离 CPU/编译缓存的因果实验或公网端到端保证。

暂停前基线及约 35% 的探索性差值不再用作最终改善幅度，旧 a4c534 及标记 intermediate 的记录也不用于最终结论。不把 LCP、加载遮罩提前隐藏或增加超时作为 READY。

主控另报告真实生产包可拖拽积木并执行，角色 x 从 0 变 10；造型界面正常；声音播放入口进入“停止”状态；保存成功，新建回到 x=0 后从列表重开恢复 x=10 和积木，console error/warn 为空，截图为 [editor-regression.jpg](evidence/editor-cold-start-20261124/editor-regression.jpg)。这是主控提供的浏览器功能证据，独立任务未操作浏览器、不计入 21 项 Node 测试，也不把按钮状态当成物理可听声音测量。

## 部署后正式 HTTPS 验收

主控确认最终包部署完成并明确授权后，独立执行 [HTTP verifier](cold-start-encoding-20261124.mjs)，实际退出码 0，**26 组逻辑检查全部通过**。正式 URL 为 [快 GUI](https://ide.xiaodaiyang.top/openblock-vendor/openblock-gui.0f3346f8af93e2a9.js)，COLD_ENCODING_CONNECT_IP=8.138.226.239；URL Host/SNI 及正常 TLS 证书验证均保持启用，仅 lookup 使用指定 IP（含 options.all 支持），没有改 DNS/hosts。

证据：[encoding-http-checks.json](evidence/cold-start-performance-20261124/encoding-http-checks.json)、[执行摘要](evidence/cold-start-performance-20261124/encoding-http-output.txt)。验证内容：

- br / gzip / identity 的完整原始 HTTP 响应按编码解压后，与冻结 stage 的 identity 字节逐一相同；Content-Type、Content-Length、Vary 及安全头正确，无双重压缩。
- 编码/参数大小写与空白、最小合法正 q、合法 q=0/0.000、非法 q、精确 token、通配符与显式拒绝、服务器正 q 偏好和全部拒绝的 406 均正确；406 不误带 Content-Encoding。
- 三种表示 HEAD 均为 200 且无 body，长度与对应 GET 一致。各自 If-None-Match 为 304 且无 body，三个 ETag 各不相同；另一表示 ETag 不误命中，实际返回 200。HEAD / 304 的 Vary 和安全头通过。
- 不存在的 hash 文件及对 .br / .gz 私有表示的直接请求均为 404，没有误带 Content-Encoding；无 Accept-Encoding 的默认回退正确。

缺失线上 .br 的测试没有通过移除文件实施，仍引用主控专用私有 Nginx fixture 的缺文件结果。本轮线上只读请求，没有修改服务器配置、文件或服务。该测试验证协议与字节正确性，没有采样公网编辑器 READY，也不把总执行时长当作公网冷启动计时。

## 可复用命令与交付

```powershell
node --test tests/cold-start-token-guards-20261124.mjs
node tests/cold-start-performance-20261124.mjs D:\CFZN\CFZN-IDE\build\deploy\20261124T092948Z-cfe8ac8d\bundle\web
node tests/cold-start-release-audit-20261124.mjs D:\CFZN\CFZN-IDE\build\deploy\20261124T092948Z-cfe8ac8d\bundle
node --experimental-strip-types --disable-warning=ExperimentalWarning --test --test-name-pattern="AST table slots|whitespace compaction|original token printing|home preload" apps/web/test/gui-cold-start.test.ts
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/audio-unlock.test.ts
```

本轮仅修改 tests 夹具/报告/证据，未改产品或 deploy 实现，没有运行浏览器/CDP、操作本机硬件服务或串口，没有执行部署或重启用户服务。部署后仅按主控授权访问正式 HTTPS 快 GUI。**独立验收完成：本地与正式 HTTPS 均通过；22.39% 是有测量限制的本地样本改善，不是公网 READY 保证。**
