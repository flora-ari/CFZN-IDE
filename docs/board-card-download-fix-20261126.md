# ESP32 下载与主板卡片修正

2026-11-26，已编译并部署。本记录区别于同日此前的卡片进度迁移，记录真实下载修复及新版本发布。

## 用户要求

ESP32 编译环境进入下载后无法完成；恢复原卡片布局，删除底部新增的整块下载区域，在右上角提供下载图标。未下载使用浅灰层，下载各阶段不改变卡片大小，所有主控使用一致尺寸与样式。

## 实际下载取证

Link 主控在原运行实例 `ead7c8eb-644d-4c63-b738-cafeff6d5b3d` 上唯一提交 `esp32-4mb-dio`，任务 `22ef5635-f795-467f-9112-aefeabe8508d`。RISC-V 包期望 259,712,666 B，实际文件持续增长，约 50 KiB/s；独立官方 URL 的 1 MiB Range 对照约 65 KiB/s。单包预计超过一小时，当前全安装 30 分钟硬上限存在中断健康慢下载的缺口。CLI 的原 `--json` 调用还未提供下载中日志，网页只得到 installing。

官方中国索引中 11 个 ESP32 归档与冻结计划逐项同大小、同 SHA；同 RISC-V 资产 1 MiB Range 实测约 1.86 MB/s。仅采用匹配的传输地址，不切换 `-cn` 编译器版本或 FQBN。完整资源下载仍需单独验证，范围测速不等于冷下载成功。

方案确定后主控于 `2026-11-26T05:57:26.313Z` 通过既有取消接口结束旧慢速任务，终态为 cancelled/complete。这是主动取消，不能归因成自然超时。原配置备份、部分归档、POST 和轮询日志保存在 `D:/CFZN/CCraft Link/docs/evidence/esp32-live-download-retry-20261126/`；官方索引逐项比对见同项目 `docs/evidence/esp32-cn-exact-matches-20261126.json`。

Link 主控继续负责官方源优先、真实进度、活动超时、空缓存完整准备、归档校验、能力刷新和真实 ESP32 编译。预计需要 0.1.5 本机软件；网页更新本身不能替换已安装 runtime。实体串口和烧录未参与。

后续真实冷任务 `efa370d1-0a99-414c-91e6-4f784b9decc9` 在此前不存在的独立目录 `D:/CCLQ015-a15c7e` 启动，初始 verifiedCacheBytes=0，17 组件总量 878,894,784 B。任务自然 succeeded，经历 downloading → installing → validating → complete，耗时约 8 分 43 秒，全 17 档大小及 SHA 通过，同一 executor 四个 ESP32 Profile 热刷新为就绪。普通 ESP32 实际编译生成 BIN、分区 BIN 和 ELF 并通过核验；再次准备约 2 秒完成，无重复安装。该验收使用真实全冷网络传输，区别于旧版本仅有缓存准备的结论；未操作实体串口或刷写。

## 卡片修正与验证

原前端开发删除 controller footer，将下载图标、灰层、阶段和错误提示放到绝对定位层。独立检查指出原 height:auto 不能保证跨行等高，已退回补充统一网格规则与跨卡片断言。

最终 UI 源码已加入主控专用 `grid-auto-rows: 1fr` 网格，以最长完整内容决定统一高度；模块和舞台目录不使用该规则。前端 193 项回归、19 项定向、类型与构建通过。独立测试补验 14 项、真实 React 的 7 种状态 × 3 种内容输出、最终源文件摘要及 GUI 字节一致性通过，原跨行等高阻断已解除。源码冻结见 `.runtime/board-card-icon-20261126/candidate.json`；独立证据见 `tests/evidence/board-icon-20261126/`。

真实冷测试早期低于 1% 的进度会取整为 0%，因此再补真实“已下载／总量”及进度条可读文本，未知总量只显示已下载字节。增量经 15 项定向、类型检查和独立 React 6 状态核对，只有 downloading 使用字节，不沿用到安装/校验阶段；覆层尺寸规则不变。认证生产构建和独立资源核对随后重新完成。

本轮浏览器工具因无法可靠确认 Windows 当前 URL 拒绝继续。已保存真实 GUI 组件、原样式和候选组件生成的隔离页面，但尚无实际渲染几何或截图；SSR 和源码规则检查不能冒充视觉验收。

## 发布状态

Link 最终生产交付 `D:/CFZN/CCraft Link/release/0.1.5/CCraft-Link-Setup.exe`，53,313,236 B，SHA `d95f9d4a498ad032bebaab0a614d12e4a6b6029cb03aef3adc5d38f0e1ff7d5d`。`DELIVERY.json` 标记 ready-for-IDE-production-release，生产身份、0.1.5、qa=false。主控已重新计算实际安装包长度及 SHA，并同步到源码和 dist 的固定下载及最新元数据；未自动安装或替换用户本机实例。

主控已完成 `VITE_IDE_AUTH=true` 正式构建，4 个源码文件与候选冻结完全一致。最终认证版本为 `editor-BatrKq4c.js`，226,131 B，SHA `933350f2569283b92bb406e272d9c411f5e0157e8e18701a3ed59942b495e9d3`；CSS 为 `editor-2FWVdJTS.css`，41,055 B，SHA `7b97349bb0c72cbc11dd420d3355331c2a1ecfef9ec0ce161299f5879dd7f2ef`。完整 GUI 摘要仍为 `6894755e27261ca3f03fc239a9b0d64bacf2269e9dc5f1e9bd2f289860621420`。构建记录见 `.runtime/board-card-icon-20261126/production-build.json`。

已部署 `20261126T062621Z-48e345c3`，API `127.0.0.1:9112`，网站 `https://ide.xiaodaiyang.top/`。发布归档 SHA `fd4092607f92b6ac68476cd41f262561221ce22d9fadb104e4d75ccda3405cc5`，认证启用。部署器退出 0；Nginx 切换时首次 health 502，经内置重试后通过。首页、编辑器、API、私有模块、登录和 SSO 均通过检查。

主控公网重新下载最终 JS/CSS 和完整安装包：所有摘要与本地发布及冻结交付一致，0.1.5 为 53,313,236 B。结果见 `build/deploy/20261126T062621Z-48e345c3/board-icon-verification-online.json`。独立测试补验入口和资源摘要、ok/maker/minio health、登录及游客静态入口、最新元数据及 64 字节 Range 206/缓存头通过，见 `tests/BOARD-DOWNLOAD-ICON-20261126-REPORT.md`。公网补验属于 HTTP 与字节检查，不代表浏览器视觉或本机新版本安装验证。

固定下载 `https://ide.xiaodaiyang.top/downloads/CCraft-Link-Setup.exe`，版本清单为同目录 `CCraft-Link-latest.json`。下载修复在本机 runtime，用户需要覆盖安装 0.1.5 后使用；本轮没有自动安装、启动或替换现有本机 .14 实例。

## 旧下载清理

在公网完整安装包核验通过后，再核对服务器 current 指向本发布及 0.1.5 文件实际长度/SHA，然后删除下列五个旧发布中的 `web/downloads/CCraft-Link-Setup.exe`。每个删除前都验证为元数据所述 0.1.3、53,244,889 B、SHA `119ac89f4d2b104defacdb5a1c0912a983b8fea471fa2f03fdd5ca97d252f762`，合计 266,224,445 B：

- `20261125T090320Z-48e345c3`
- `20261126T011739Z-48e345c3`
- `20261126T012636Z-48e345c3`
- `20261126T025155Z-48e345c3`
- `20261126T033018Z-48e345c3`

仅清理旧发布的安装文件，保留其他发布资源、配置备份和项目数据。本地 Link 0.1.3/0.1.4 冻结文件保留。服务器清理脚本为 `.runtime/cleanup-replaced-link-downloads.cjs`，先验证路径不越出 releases、文件非符号链接及当前版本正确，再执行精确文件删除；返回 deleted/exit 0。
