# 部署页启动超时的后端与发布设计

2026-11-23（Asia/Shanghai）。本轮只读分析，供主控冻结及实施。

**优先修正 IDE 站点的大脚本传输，API 业务无需改动。** 主控已观察到完整 HTTPS GUI 下载超过 45 秒，本地生产版正常。当前桥接器从创建起计时 45 秒，而 iframe 依次加载 React、ReactDOM 和 GUI 脚本，随后才运行编辑器模块、加载默认作品并发送 READY。这条计时覆盖资源传输与编辑器初始化。[启动计时](../../apps/web/src/editor-bridge.ts)、[脚本顺序](../../apps/web/openblock.html)、[READY 发送](../../apps/web/src/openblock.ts)

本会话对当前本地 `apps/web/dist/openblock-vendor/openblock-gui.js` 做了内存压缩测量。原始为 **22,663,813 字节**，gzip level 6 后为 **5,480,123 字节**，减少 **75.8%**；解压后与原文件逐字节一致。原文件 SHA-256 为 `779645f288c17a3ffc4c181908a681d203e410387026ccbf202dc571a6ea359d`。这些是本地产物数据，线上传输效果由主控验证。[当前本地 GUI 产物](../../apps/web/dist/openblock-vendor/openblock-gui.js)

发布脚本在 IDE 的 HTTPS `server` 中直接提供静态文件，`/api/` 才代理到 Node。当前模板没有显式 gzip 设置；`.html`、`.mjs` 和兜底静态位置使用 `expires -1`，`/assets/` 使用 `expires 1y`。`proxy_read_timeout 120s` 仅作用于 API 代理，GUI 下载由静态位置提供。[站点模板](../../deploy/install-server.sh)

主控已检查服务器实际配置 `/etc/nginx/conf.d/ide.xiaodaiyang.top.conf`，确认没有开启 gzip。域名映射到服务器 loopback 的 HTTPS 请求携带 gzip 协商，仍返回原始 22,663,813 字节和空 Content-Encoding。主控同时记录 load 为 0.00、可用内存约 4.8 GB、磁盘空闲约 17 GB，IDE 与 Nginx active，公共首页和 API 的 TTFB 约 40ms。结合大 GUI 公网下载超过 45 秒，首要处理对象已收敛为 GUI 传输。

最小发布方案是在 `ide.xiaodaiyang.top` 的 HTTPS `server` 内启用 gzip 与 gzip_static，并在既有 `/api/` 位置明确 `gzip off`，使本次调整集中于站点静态响应。主控已确认 Nginx 1.20.1 编译包含 `--with-http_gzip_static_module`，可直接消费构建期压缩副本。建议参数如下，现有路由和 MIME 规则继续沿用，尤其保留 `.mjs` 的 JavaScript 类型。

```nginx
gzip on;
gzip_static on;
gzip_vary on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types application/javascript text/javascript text/css application/json image/svg+xml application/wasm;
etag on;
```

Nginx gzip 支持在 `server` 层配置，并为符合条件的 HTML 默认启用压缩，`gzip_types` 补齐脚本等静态类型。`gzip_vary on` 提供 `Vary: Accept-Encoding`，让缓存区分压缩和原始表示。以当前 gzip 能力实施即可，配置通过后重新加载 Nginx 由主控执行。[Nginx gzip 文档](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)

构建预压缩在 `deploy/package.mjs` 复制完成的 `stage/web` 内生成相邻 `.gz`，先覆盖较大的 `.js`、`.mjs` 和 `.css`，压缩级别使用本地已测的 6。保留原文件，gzip 解压后校验其大小和 SHA-256 与原文件一致，压缩副本的修改时间与原文件对齐，再随同整包发布。请求原 URL 且支持 gzip 时由 `gzip_static on` 提供副本，缺少副本的文本响应继续使用动态压缩。客户端使用原路径，稳定 URL 的缓存策略继续校验更新。[打包入口](../../deploy/package.mjs)、[Nginx gzip_static 文档](https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html)

缓存按当前资源身份设置，避免站点升级时出现旧 GUI 与新适配器混用。

| 资源 | 处理 |
| --- | --- |
| `/`、`index.html`、`openblock.html` | 继续采用 `expires -1`，入口每次校验更新。 |
| `/openblock-vendor/openblock-gui.js`、React/ReactDOM、manifest、设备描述、固定路径 helper 和模块 `.mjs` | 稳定 URL 继续采用 `expires -1`。确认静态响应带 ETag 或 Last-Modified，浏览器条件请求可得到 304。GUI 冷加载使用 gzip。 |
| `/assets/` 下构建生成的内容哈希资源 | 沿用现有一年缓存。长缓存范围限定为可证明内容随 URL 改变的文件。 |
| 固定 URL 的品牌资产及其它静态文件 | 沿兜底位置校验更新，与当前发布的入口和 GUI 保持对应。 |
| `/api/`、项目归档与私有模块 | 沿现有业务响应的 Cache-Control 及 revision 规则处理，采用原代理路径。 |

`expires -1` 会生成 `Cache-Control:no-cache`，允许客户端保存响应并在后续校验后复用。稳定 GUI URL 的暖加载应检查 304 或已校验的浏览器缓存复用。调整时直接利用 `expires` 和静态 ETag，避免额外添加重复 Cache-Control。Nginx 的 `add_header` 在下级定义时会影响父级继承，最终响应还须保留当前站点的 `nosniff`、Referrer-Policy 和 `serial/usb` Permissions-Policy。[Nginx 缓存头文档](https://nginx.org/en/docs/http/ngx_http_headers_module.html)、[Nginx 静态 ETag](https://nginx.org/en/docs/http/ngx_http_core_module.html#etag)、[已有站点头](../../deploy/install-server.sh)

API 启动阶段初始化项目和私有模块存储目录，并创建 Nest 应用。Arduino 库索引对象在启动时创建，实际远程索引读取由后续查询触发。该项目 API 入口也不初始化独立的硬件执行器。部署脚本先通过本机 PID/端口和 `/api/v1/health` 检查 API，再发布最终静态站点配置。当前证据指向 GUI 传输，应先验证压缩和 READY 时序；若健康响应或编辑器默认作品加载另有异常，再按对应请求定位。[API 初始化](../../apps/api/src/app.ts)、[项目 API 入口](../../apps/api/src/main.ts)、[库索引](../../apps/api/src/arduino-libraries/library-index.ts)、[部署健康检查](../../deploy/install-server.sh)

现有发布验收只请求首页、编辑器 HTML、health 和私有模块目录，这可以验证证书和路由，完整 GUI 的传输时间尚需加入主控本次验收证据。建议记录以下数据。

- 同一 GUI URL 在 `Accept-Encoding:gzip` 和 `identity` 下的状态、Content-Type、Content-Encoding、Vary、Cache-Control、ETag/Last-Modified、传输字节数、TTFB 和完整下载时间。大文件需完成下载，压缩响应解压后的 SHA-256 应匹配发布产物。
- 冷缓存真实浏览器从导航到 GUI 下载完成、脚本执行、默认作品加载和 READY 的时间，确认实际进入可编辑页面。暖缓存记录 GUI 的条件请求/304，以及同一发布版本的资源对应关系。
- HTML 能及时校验更新，哈希资源仍可长缓存，私有模块及项目 API 保持原有存储与版本行为。API health 可独立成功，GUI 请求继续由 Nginx 静态服务提供。
- 同一服务器其他站点的配置和响应不受本次 IDE `server` 内参数影响，IDE 的原安全头、正确 `.mjs` MIME 及缺失资源 404 行为正常。

回滚由主控在实施时按现有站点文件管理执行。先备份 IDE 的 Nginx 配置，应用仅该站点的候选改动，通过 `nginx -t` 后重新加载。若传输、缓存或页面行为回退，恢复该站点原配置，再校验并重新加载。此配置试验可沿用当前前端发布和 API 进程。验收通过后，将相同配置同步到 `deploy/install-server.sh` 的 IDE 模板，确保下一次发布沿用已验证行为。[现有配置备份与回滚](../../deploy/install-server.sh)

本方案的压缩与 HTTP 传输不会改变解码后的 GUI 内容，VM/Blockly 字节验证继续对原始或解码后产物执行。45 秒计时的前端体验由主控与前端设计协调，验收要记录真实 READY，不能仅凭延长等待时间判定问题解决。

本轮只新增设计文档和本地内存测量，未修改脚本、配置或服务，未访问浏览器或服务器。服务器观测由主控提供。线上实施、预压缩打包及后续证据采集由主控统一进行，后端开发可按零业务变更交接。
