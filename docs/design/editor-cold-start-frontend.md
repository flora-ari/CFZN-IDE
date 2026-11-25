# 编辑器冷启动：最小性能改进

2026-11-24。只读前端提案；主控负责网络测量、契约冻结与发布。不增加超时，不提前隐藏加载态，不修改 178 个 VM、15 个 Blockly 模块原字节。

## 已确认的关键路径

当前线上基线为音频/favicon 热修复 `20261124T081631Z-cfe8ac8d`。[发布证据](../../tests/evidence/audio-autoplay-20261124/deployed-verification.json) 的 GUI 原文为 22,664,720 B、gzip 为 5,480,379 B，完整 HTTP 下载 7.89 秒；这是主控测量，不等于浏览器可编辑时间。

[首页](../../apps/web/index.html) 只静态引用外层 React 应用，iframe 由 App 挂载后才出现；GUI 资源因此晚于外层 JS 才被发现。[编辑器 HTML](../../apps/web/openblock.html) 执行顺序为 React 16 → ReactDOM 16 → inline 全局别名 → GUI → module-loader → 编辑器模块。classic script 的执行/解析确实串行，但浏览器预扫描器通常能提前并行获取后续静态 script，不能据标签顺序断言所有网络下载串行。Vite 产物已把编辑器 module/modulepreload 放进 head。[浏览器预扫描说明](https://web.dev/articles/preload-scanner)

GUI 执行后才创建真实编辑器/VM、加载默认项目；[projectLoaded](../../apps/web/src/openblock.ts#L267) 还会等待一帧并保存完整默认归档，之后才发送 READY。此段包含 CPU、资源解码和归档准备，当前没有分段耗时，不能把所有等待归因于下载。

[prepare](../../apps/web/scripts/prepare-openblock.mjs) 把固定上游 GUI 经许可挂点处理后原样写入 publicDir，再由 Vite 复制；应用 assets 约 200 KB，GUI 并未进入 Vite 模块图。上游现有异步 chunks/libraries 已复制到 static，不能把发布包全部文件数当成首屏请求数。根目录正在并行集成 CCraft Link；当前 dist 的 editor-BOyJi7tG.js 与线上 editor-sqHyfw8P.js 不同，不可直接用根目录最新全量 build 替代线上基线。

## 推荐先冻结的最小交付

| 项目 | 边界与预期 |
| --- | --- |
| 提前发现 GUI | 在首页 head 增加同源 `rel=preload as=script`，URL 与 iframe 的 GUI script src 完全一致。先保持原 classic 执行顺序；不加全局 async/defer，尤其不能让 inline 别名先于 React 执行。可给直接访问的编辑器页同一 preload。实测父页面和 iframe 是否复用同一次响应，核对 URL、as、credentials/CORS 模式，避免双下载；若实际不复用，撤销跨文档预加载方案。 |
| 小尺寸专用图标 | 当前两页 favicon 指向 1,657,390 B 原 PNG。保留用户原文件字节，新增视觉相同的专用 32/48/64px PNG 或 ICO，仅两页 icon 引用改用小文件，建议总大小不超过数十 KB。favicon 不直接阻塞 READY，但会增加首访请求和带宽竞争，不能声称减少该文件大小就等量缩短启动。 |
| 压缩传输 | 继续 gzip_static、正确 Vary/Content-Type/ETag 和 identity 回退。主控先核对 Nginx 是否支持 Brotli 静态表示；支持时可同时发布 .br/.gz/原文，按 Accept-Encoding 协商，解压摘要一致。不为本轮另换服务器或强装模块；不支持 br 时保留 gzip。 |
| 真实分段数据 | 在外部 bootstrap/编辑器集成记录资源发现、GUI 可用、GUI mount、默认项目 loaded、defaultArchive 完成及父页面 READY。用 ResourceTiming 看网络，用实际 Performance 录制看主线程解析/执行与长任务；不简单把两个时间点相减当成全部解析耗时。不增加用户跟踪或新的 HTTP/iframe 公共协议。 |

建议先实施“更早开始同一 GUI 下载 + 专用小图标”，配合主控已具备条件的压缩表示优化；记录同网络下的冷启动对照再确定收益。仅增加 iframe 内 preload 的收益可能很小，因为现有预扫描已可发现它，优先验证首页跨文档提前发现这一段。

### 压缩的本地内存试算

本次读取与线上相同 SHA-256 `1bb1133602dfc5044f00404ea246321ad4bec5071a9baa482ec6fa8356ffb0d2` 的 GUI，在内存中压缩/解压，未写产品文件：

| 表示 | 字节 | 相对当前 gzip |
| --- | ---: | ---: |
| gzip level 6（与线上一致） | 5,480,379 | 基线 |
| gzip level 9 | 5,448,711 | 减少 0.58% |
| Brotli quality 5 | 4,845,368 | 减少 11.59% |
| Brotli quality 8 | 4,667,997 | 减少 14.82% |

所有表示解压后与原文相同。仅提高 gzip 等级收益很小；Brotli 可减少传输，但解压后仍有 22.66 MB JavaScript 需要处理，不能据此承诺整体启动同比缩短。压缩在构建/发布阶段完成，不让用户请求承担高等级压缩开销。

## 分块、缓存和 READY 的范围

- **分块暂不作为第一轮修复。** Vite manualChunks 无法拆分 publicDir 里的独立 GUI 文件；重新打包/整体 minify 会改变 VM/Blockly 字节。手工拆 webpack bootstrap 与模块会扩大装载和全局依赖风险，暂不实施。继续保留现有上游懒加载 chunks；若主线程录制证实某个 GUI 专属可选功能阻塞，再另提精确 GUI 挂点的按需加载，不能盲删模块或预加载全部扩展。
- **缓存分场景。** 当前稳定 GUI URL 的 no-cache + ETag 支持普通回访 304，已有摘要应用 assets 保持长缓存。内容摘要 GUI 文件名与 immutable 可减少普通回访校验，但清缓存/强制刷新仍可能全量下载，本轮不以缓存命中替代冷启动优化。若后续采用摘要 URL，按最终真实 GUI 字节生成，所有 preload/script 引用一致，旧 URL 保留兼容；由主控决定是否另立小变更，不混进本轮最小交付。
- **保持真正 READY。** 先测默认项目和 defaultArchive；不删除初始化/归档准备来制造更早成功，也不把 defaultArchive 延迟成用户已编辑后的快照。若该段确有主导耗时，再单独冻结可保持“新建作品”正确性的方案。
- **预压缩产物一致。** 压缩副本由本次最终 GUI 生成，纳入打包缺文件检查；别把已改 GUI 与旧 .gz/.br 混发。prepare 缓存仍以输入 fingerprint 和必需输出校验，源代码变化不依赖用户强刷才发现；新图标纳入 public 指纹和输出检查。

## 验收与隔离发布

以线上音频/favicon 热修复包为基线，在隔离目录应用允许的 HTML、专用图标、可选压缩表示和必要测量改动。禁止带入根目录未发布的 Link 检测、安装引导或 API 文件。既有启动错误、显式重试、用户音频解锁和 favicon 品牌保持正确；178 VM、15 Blockly 与许可字节继续逐一核对。

至少区分：首次空缓存、浏览器强制刷新、普通暖启动三类。同网络/机器记录导航到 GUI 请求、传输完成、真实 READY 和首次可编辑的时间，建议每类至少三次并列出中位数及单次异常。确认 GUI 没有重复下载、首屏没有意外外网依赖/资源错误，默认项目完整且保存/重开、新建、舞台执行与声音预览正常。HTTP 下载成功、缓存 304 和本地生产页通过分别报告，不冒充线上完整可编辑验收。

本轮只新增设计与内存压缩测量，没有修改产品、操作浏览器/服务器或启动服务。

## 补充复核：快速 GUI 与固定 hash 路由

主控补充已确认 H2 协商成功，协议设置无需更改；非保护模块保留许可去空白的试算节省 gzip 16.2%。认可第一轮改为“内容摘要快速 GUI + 首页同 URL preload + legacy GUI 兼容”。这一批准以最终快速文件的语义与字节检查为条件，替代上文暂缓分块的范围描述；不做任意模块拆分或依赖重排。最小风险点如下：

1. **核对真正被执行的新文件。** 使用 JavaScript 语法工具处理允许的非保护模块，不用正则全局删空白/注释，保留模块边界、许可原文和 webpack 装载顺序。178 VM/15 Blockly 对固定上游逐字节核对，音频模块 520 对已发布热修复逐字节核对。当前 verify-upstream-bytes 脚本硬编码 legacy 路径，必须另对 HTML 实际引用的快速 GUI 执行同等检查；只检查原路径不能覆盖新产物。
2. **最终字节决定 URL。** 文件名摘要从处理后的最终 JS 生成；首页 preload、iframe script 必须完全相同且请求模式匹配。新文件放原 vendor 目录，避免相对 chunk/worker 路径漂移，实际点开原有懒加载功能验证。同步更新 prepare 输入指纹/必需输出和压缩副本；legacy 原路径继续可取。旧 sourceMappingURL 若已失配，应移除或生成正确映射，不能继续关联旧偏移。
3. **静态 br 不能只匹配 br 子串。** 无需安装模块即可由固定路由交付预压缩表示，但必须按完整 Accept-Encoding/q 值选择。至少覆盖无请求头、br、gzip、identity、br;q=0、br;q=0.000、gzip;q=0、带空格与顺序变化、通配符和所有可接受表示均被排除（应 406）。显式 br;q=0 不能被通配符或大小写/子串匹配重新启用。只能提供客户端允许的表示；实现不可靠时回退现有 gzip，不用“现代浏览器通常支持”替代协商。
4. **编码、缓存与响应头一致。** 原始/压缩三份解压后相同，但 Content-Encoding 与实际文件必须一致，Content-Type 仍是 JavaScript；Vary:Accept-Encoding 覆盖 200/304，ETag 随表示区分或使用适当弱校验。核对 br 的条件请求不会让 identity/q=0 请求误复用不可接受的编码，HEAD 与 GET 一致。固定 hash 路由保留已有安全头，配置局部 add_header/内部映射不能意外丢失继承；源文件不存在返回真实 404。
5. **以启动收益验收。** 体积减少不等于已量得可编辑时间下降；继续对比无缓存到 READY、主线程执行及资源重复请求，验证原生 GUI、积木/声音、保存/重开和动态 chunks。从线上基线隔离交付，保持 Link/API 未发布改动在包外。新 hash 资源先可用再切 HTML，保留旧引用所需文件以便旧页/回滚。

本次只复核设计风险，未审计尚未提供的快速生成器或 Nginx 实现；上述测试通过后再由主控认定可发布。
