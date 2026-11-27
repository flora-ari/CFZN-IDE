# 主板卡片编译环境独立验收（2026-11-26）

结论：可部署，未发现产品阻断。冻结候选逻辑回归、资产、已执行的隔离浏览器场景及后补实际组件渲染/回调断言通过。认证生产包新增的两项浏览器视觉检查受工具超时限制，以下明确区分证据层级，不声明全部浏览器场景通过。

## 候选与隔离

按 api-contract.md 顶部契约验收。实际浏览器使用冻结 dist 的独立副本 `.runtime/board-card-independent-20261126/stage`，未读取后来重建的 dist。editor-BnahkY0T.js SHA256 为 `4a5b839b71808b2dd05169198b51ed323641b9b1597a8899531e8db2ad06ec2d`，CSS editor-8taSoHxD.css。最终认证生产包尚需主控核对自身引用和视觉。

独立随机回环端口 53690，仅内存 mock Link/toolchains/ports；fetch 重定向到同源 mock，CSP 限制连接同源，没有代理真实 3002、启动 Link、下载 SDK、打开串口或烧录。

## 自动与源码检查

`node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/toolchain-preparation.test.ts`：13/13 通过。覆盖当前主控自动准备、A 下载不改变 B 的主控/profile/端口/源码、完成不自动选择、串口占用守卫、不同计划互斥、共享计划不重复 POST、编译/上传自动续接、取消/离线/上下文改变终止续接、丢失响应核对、未知任务结果、失败显式重试和两种模式无代码/未选板/无端口下载。

`node tests/board-toolchain-card-20261126.mjs`：通过。冻结源码及三项产物摘要匹配，复用既有 upstream 摘要逐模块核对 178 VM / 15 Blockly 原字节；Logo PNG SHA256 仍为 `c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2`。mock 日志仅 1 次 prepare，无 build/upload/serial POST。

源码审查：library 挂载只刷新并订阅，卸载返回退订函数；不取消 job。下载/取消按钮 stopPropagation，取消另核对最新 job/profile 身份。ready 后卡片提示不阻止选择；离线/未知服务不锁住原始目录。顶部两处准备 badge 与 upload 详细安装区已移除；保留简短就绪提示和真实编译上传日志。上述属于结构检查，不等于全部实际渲染已验。

## 实际隔离浏览器

CUA 实际装载完整冻结 GUI，1280×720，编程模式：选择 Uno 后点击 Aijite ESP32-S3 的下载按钮；当前选择保持 Uno，目标蓝色卡片出现灰遮罩、25% 进度和可见取消按钮，按钮未被原选择层截获。目录仍有 20 张主板卡。异计划 FireBeetle 下载按钮禁用并说明等待。mock 改为未知总量后，实际 DOM 显示“下载中”，progress 的 value/max 均不存在，无伪百分比。返回编辑后顶部无准备展示块。

证据：`tests/evidence/board-toolchain-card-20261126/s3-downloading.png`、`top-with-background-download.png`、`mock-calls.json`、`independent-summary.json`。

随后 CUA 会话重置，原 IAB provider 消失；重新盘点只有用户 Chrome，因此停止浏览器操作。尚未实际浏览器验证关库重进、取消/失败后重试、成功后再次手选、上传弹窗视觉及键盘焦点；这些行为已有相应逻辑回归或源码检查，但不得冒充浏览器通过。未作实体下载、Link 或串口结论。

## Mind+ 证据边界

前端映射采用 Craft 源码证据 `ev_2ced46f3435ea47a3e3a4e369c2d5105a660f2e88a40899c2ff8dd37d44a1606`：独立下载完成只刷新卡片，随后显式点击才加载。REA 已调用但语义 worker 缺 sha256Hex，未成功生成语义图。本轮没有再次逆向或扩展无关矩阵。

## 认证生产包补验尝试

收到主控补验指令后，独立 mock 服务改为只读精确生产包 `build/deploy/20261126T033018Z-48e345c3/bundle/web`，随机回环端口 58790，自有 PID 10148。CUA 创建新的 Chrome 测试标签（sessionName `🧪 卡片验收`）返回具体阻断：`Timed out waiting for tab 1700810979 to navigate to http://127.0.0.1:58790/.` 按主控要求立即停止，不延伸浏览器排查。两项新增视觉验收均未执行；未将超时计为产品失败。自有 mock 服务 PID 10148 已停止。创建调用超时，未获得可关闭的标签句柄；若该空白测试标签残留，其 ID 为 1700810979，未操作用户原有标签。

按主控收口要求改以实际组件补验：`node tests/board-library-callback-20261126.mjs` 通过。直接导入冻结源码导出的 makeLibraryRenderer，以真实 React / ReactDOMServer 渲染（仅 TypeScript 转译和 CSS 空模块加载，无产品逻辑替身）。调用渲染产生的真实下载/卡片回调；缺环境时点击卡片不选择，独立下载一次后 current 仍 Uno，完成并重新渲染仍未调用 selectController 或 onRequestClose，autoClose=false；随后显式调用 S3 卡片点击回调才选择 S3 一次，不重复下载。adapter/hardware 为内存 fake，焦点和布局不在 SSR 覆盖内。证据 `library-callback.json`、`library-ready-render.html`。

上传补验来自主控，非本分支独立执行：`.runtime/board-card-upload-render-verification.mjs` / `board-card-upload-render-results.json` 三场景 PASS。实际 React SSR 准备态无安装大块、原始安装日志和空等待日志框，保留简短状态及取消；build 保留真实编译日志；upload 保留日志、错误、端口控件。该证据同样不等于浏览器视觉或真实 SDK 验证。结合既有 CUA 灰遮罩与按钮命中证据，本轮无需因浏览器 provider 故障阻断交付。
