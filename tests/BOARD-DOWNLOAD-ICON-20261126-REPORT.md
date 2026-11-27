# 右上下载图标独立审查（2026-11-26）

最终结论：此前无等高网格的源码阻断已解除，当前冻结 UI 候选未发现发布阻断，可准备生产编译。实际浏览器几何及真实 ESP32 下载仍未验证，不能据本报告宣称真实下载修好。

现有定向回归 `node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/toolchain-preparation.test.ts`：14/14 通过，包含新增全部卡片 icon 状态槽，以及两模式/离线/共享计划/编译续接保护。通过这些行为测试不能消除下述布局缺口。

## 原问题记录（下述旧候选已修复）

`apps/web/src/extensions/library.css` 仍有 `[data-cfzn-library-card] { height:auto!important }`。开发抽取的原生 CSS 同时为 featured-item `height:auto`，featured-text 高度声明被注释，description 为普通 block，line-height:1.375rem。当前没有统一说明区域或全目录等高约束，因此长短说明会改变后续 metadata/帮助的纵坐标；即使 flex stretch 拉齐同一行外框，也不能保证跨行 20 卡等高及内容对齐。需前端修正后复核，不能用移除 footer 就推断所有卡同高。

开发 `.runtime/board-card-icon-20261126/make-layout.mjs` 的 measurement 仅把每个样本与它自己的 baseline 比较；未比较短/长样本之间尺寸，也未覆盖全 20 卡。fixture 另加 `.native-grid { align-items:stretch }`，不能据此证明生产目录全部等高。该测试的 pass 即使成立，也只证明同一主板状态间不跳动。

## 已确认的结构改善与限制

library 实际产物数据中 controllers 的 footer 现在为 null，下载 decoration 放入 badge；不再生成原新增底部 actions/info 空白。download-layer、veil、icon、preparation、note 都为绝对定位，不参与卡片流内高度。icon 为 36×36、top/right 8px；veil pointer-events:none，icon pointer-events:auto；缺 Profile 使用禁用状态及说明，不伪造下载能力。原生图片、说明、metadata 和帮助数据仍保留。此处为源码和生成组件结构审查，不宣称实际浏览器命中/几何通过。

未再次尝试浏览器：已收到开发 CUA 无法可靠确认 URL 的拒绝，按要求不换驱动绕过。真实 ESP32 prepare 由 Link 主控独占，现场 activeJob=null、missing/无绑定仅是诊断起点；本报告不声称真实任务已修好。

## 冻结等高修复复核

以 `.runtime/board-card-icon-20261126/candidate.json` 为最终身份：editor-CEd-R6SL.js SHA256 `7916c135274b217c35a1e7046bcd3dd77485c604f0460265a4b8cbf68e52e363`，editor-2FWVdJTS.css SHA256 `7b97349bb0c72cbc11dd420d3355331c2a1ecfef9ec0ce161299f5879dd7f2ef`。library.css 摘要 `33846ce80504b5ef9e1d02a9a21063927d47e937b23b0a182efb1eaead0adfc6`，library.ts `89a9ac35839e979d4b9a15016f95256db36ab6e9d94611884634d20fc768e77c`，board-toolchain-card.ts `66221c2a8ee7109ab20f52a8f5e1c0eb5a28845605ce049a15f9ec7a1d3d570f`。

library 的 controllers 路径现统一使用 cfznRenderGroups → `.cfzn-controller-grid`。该网格 `height:max-content`、`grid-auto-rows:1fr`、`align-items:stretch`，所有隐式行按最大内在内容统一高度；保留卡片 `height:auto` 在这个网格下已不是旧 flex 布局的阻断。图片仍为 186px 区域 object-fit:contain，说明保持普通文档流，无新 clamp、line-clamp 或固定说明高度裁切；内容增高由全网格统一承接。没有按 profile 筛除目录，全部主控走同一路径。此结论是布局规则审查，未实际测量 20 卡的像素边界或文字溢出。

独立将开发生成器复制到自有 `.runtime/board-icon-independent-20261126` 执行，使用实际 NativeCard 与实际 makeLibraryRenderer/React SSR，生成 baseline/missing/busy/failed/ready/unsupported/offline 共 7×3 卡，覆盖短说明、跨行长名称与完整长说明、较少 metadata。生成成功且无 controller footer 节点。新版 fixture 增加不同样本之间的 uniform 断言，不再只和各自 baseline 比较；这条浏览器 measurement 未执行，不报告 uniform=true 实测。长说明原文仍在生成 HTML 中。

`node tests/board-icon-final-audit-20261126.mjs` 通过：最终源码/产物摘要匹配、整份 GUI 字节 `6894755e27261ca3f03fc239a9b0d64bacf2269e9dc5f1e9bd2f289860621420` 未变、7×3 实际 React 输出及无 footer 结构核对通过。14 项 toolchain 定向测试在本次等高修复后再跑通过；未重复全量 193 项。证据 `tests/evidence/board-icon-20261126/final-audit.json`。真实网络下载及安装/编译证据继续等待 Link 主控，不以此 UI 通过替代。

## 认证生产构建补验

`node tests/board-icon-production-audit-20261126.mjs` 通过。production-build.json 声明 ideAuth=true；4 个冻结源码/测试文件摘要与 candidate 一致，全部列出生产资产的实际摘要一致。openblock.html 正确引用认证版 editor-CGw3i-LJ.js（SHA256 `f061dc5a812800eca401a010c5734749272aa1bd784d962f6cd87a2ec4a762a8`）及原 CSS；index/openblock/login/sso 的本地资源引用存在。原完整 GUI 与实际引用的哈希 GUI 分别与上一冻结副本逐字节摘要一致，Logo/favicon 亦相同，因此沿用此前保护模块结果。证据 `tests/evidence/board-icon-20261126/production-audit.json`。这是只读构建与入口核对，没有额外登录、浏览器、服务、下载或部署操作；不重跑 193 项测试。

## 早期 0% 文案增量

board-toolchain-card.ts 新摘要 `5be73ea48ff430e9ce32b73fc612d8223faa52b72a31d3a136ad4acfd1eac76e`。独立命令 `node tests/board-icon-bytes-20261126.mjs` 通过，以实际 React SSR 验证 6 个状态：1,563,002 / 878,894,784 字节即使四舍五入为 0%，仍可见“已下载 1.5 MiB / 838.2 MiB”，progress 的 title/aria-valuetext 同步；未知总量只有已下载字节，没有百分比及 value/max；resolving/installing/validating/complete 不泄露上一阶段的下载字节或百分比。新增 small 保持在绝对定位 preparation/layer 内，CSS 摘要完全未变、无 footer。证据 `byte-progress-react.json`。未执行 build、全量测试或浏览器几何；本段不代表之前 editor-CGw3i-LJ.js 已包含增量，待主控重新生产构建后补核新入口。

随后主控重新认证生产构建，已独立重新执行 production audit 通过：最终入口为 editor-BatrKq4c.js，226131 B，SHA256 `933350f2569283b92bb406e272d9c411f5e0157e8e18701a3ed59942b495e9d3`；4 文件符合更新 candidate，HTML 实际引用新 JS，CSS、完整/哈希 GUI 和品牌原字节不变。production-audit.json 已刷新为本最终版本。该字节文案增量未发现 UI 发布阻断；真实 SDK 结论仍由 Link 主控提供。

## 部署后公网 HTTP 补验

发布 20261126T062621Z-48e345c3 后独立执行 `node tests/board-icon-public-20261126.mjs` 通过，使用默认 TLS 证书验证的 HTTPS GET。openblock.html 实际引用最终 editor-BatrKq4c.js / editor-2FWVdJTS.css，公网两资产原字节 SHA 与 production-build.json 一致。`/api/v1/health` 返回 200、status=ok/auth=maker/storage=minio；`/`、`/login.html`、实际游客入口 `/?mode=guest` 返回静态 HTML 200。这里只核 HTTP，不运行登录或游客编辑交互。

下载 metadata 返回 version=0.1.5、sizeBytes=53313236、sha256=`d95f9d4a498ad032bebaab0a614d12e4a6b6029cb03aef3adc5d38f0e1ff7d5d`。安装包仅请求 bytes=0-63，返回 206、64 B、Content-Range=bytes 0-63/53313236，前两字节 MZ；缓存和安全响应头保存在 `tests/evidence/board-icon-20261126/public-http.json`。没有重复完整 53 MB 下载，不独立宣称安装包全文件 SHA 已验证（主控负责）。最初测试夹具误假设 /guest.html 导致 404，随后按现有 ide-config.ts 修正为 /?mode=guest；该 404 不属于产品故障。未操作浏览器、真实项目、Link 或下载任务。
