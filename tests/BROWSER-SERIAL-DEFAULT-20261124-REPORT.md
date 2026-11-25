# 浏览器串口默认入口独立验收

日期：2026-11-24（Asia/Shanghai）。结论：**通过，未发现阻塞项。**

依据主控冻结的 `docs/api-contract.md`《浏览器串口默认入口（2026-11-24）》。本轮新增测试及证据单独保存在 `tests/`，未覆盖上一轮串口设备面板报告或证据，未修改产品实现。

## 执行结果

| 检查 | 通过数 | 证据 |
| --- | --- | --- |
| 新增独立前端跨层验证 | 8 / 8 | [脚本](browser-serial-default-20261124.mjs)、[结构化结果](evidence/browser-serial-default-20261124/independent-checks.json) |
| 浏览器默认入口及本机串口聚焦回归 | 33 / 33 | [执行输出](evidence/browser-serial-default-20261124/frontend-regressions.txt) |

共 41 项通过。命令在项目根目录执行：

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --test tests/browser-serial-default-20261124.mjs
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/browser-serial-default.test.ts apps/web/test/local-serial.test.ts
```

没有重复后端 52 项、前端全量 149 项、生产构建或旧工厂矩阵；这些开发方结果属于交接信息，不计入独立执行数。

## 独立跨层结果

测试直接导入实际 `SerialSources`、`HardwareSession`、`HardwareController`、`SerialDevicePanel`、`NativeSerialSocket` 及连接面板渲染函数。模拟对象实现真实 SerialLike 外观和浏览器 Streams；许可对象按对象身份区分，三个浏览器端口使用相同 VID/PID。请求替身仅计数并拒绝，未调用真实 fetch。本机来源缓存专项使用带 local 元数据的假串口对象，没有本机 HTTP 或物理串口操作。

- 支持 Web Serial 时默认 browser。模拟组件挂载、卸载重开、刷新和原生 discover 均只枚举浏览器许可对象；本机枚举、HTTP、requestPort、open 计数均为 0。原生 discoverySource 指定 browser 时，即使缓存来源为 local，也不会扫描本机。已有行 activate 直接打开选定许可对象，无 requestPort；该行 57600 配置准确传入。
- 从实际渲染的“连接新设备”按钮调用 onClick，在 requestPort 中断言仍位于原始同步点击栈。重复调用同一按钮不会增加许可请求；许可等待期间旧连接不关闭。选择新对象后只打开一次，使用 115200；选择已知对象使用其独立的 38400 草稿，原连接的 9600 已保存偏好保留。同目标再次连接不会重复打开。
- NotFoundError 取消和 SecurityError 拒绝均保留旧连接、19200 实际配置及另一行 57600 草稿，没有自动重试、目标打开或旧连接关闭。拒绝原因在浏览器来源反馈区域可见。
- 许可等待期间分别加入 busy、实时协议和项目变更守卫，选择返回后均被再次拦截；原连接保持、目标打开次数为 0。选择前 busy/协议占用也阻止弹窗。真实共享会话的关闭失败保留活动行，阻止再弹选择器；重试断开成功后才清除占用。
- 本机缓存和本机活动对象在浏览器刷新时保留，浏览器刷新不新增本机 HTTP；另一来源活动行及本机服务提示可见。切换来源不重置行波特率，组件重开不把手动选择的 local 重置为 browser。浏览器许可列表变空时仍保留其活动对象；迟到 getPorts 结果不能抹掉刚选中并连接的对象。
- Web Serial 不可用时默认 local，使用本机枚举路径；“连接新设备”明确拒绝，不尝试浏览器许可或伪造授权。
- 五列表头为“设备名称｜端口｜波特率｜状态｜操作”；逐行前四列没有操作按钮，第五列保留两个操作。没有独立“授权浏览器串口”按钮，只有一个“连接新设备”入口。浏览器来源隐藏非活动本机 Failed to fetch 信息，同时显示本来源枚举错误。

33 项已有定向回归另覆盖本机旧服务/重启/离线、明确 null/held-false/held-true 打开错误、缺失或外来快照、关闭失败、RX 去重与缺口、TX 分块/丢失确认不重发、逐行偏好和释放期限。包含开发方的“本机请求未完成时浏览器枚举仍独立完成”场景。

## 最终产物与受保护字节

最终 `openblock.html` 引用 `editor-DKjvixSe.js` 与原 CSS `editor-D-1o8Rs6.css`。新编辑器产物包含“连接新设备”，不含旧“授权浏览器串口”按钮文案；源码保留显式来源传给原生 discover 的接线。编辑器 SHA-256 记录在结构化证据中。

GUI SHA-256：`78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5`。

从固定上游归档只读提取原 GUI，对照清单逐个比较全部 178 个 VM、15 个 Blockly 模块的完整内容及哈希，全部一致；`LICENSE`、`LICENSE.MIT`、`TRADEMARK` 与上游原字节一致。public 与 dist 的用户 PNG 均保留 SHA-256 `c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2`。

## 证据边界

以上为真实前端对象配合模拟许可/Streams 的 Node 验证，以及元素树结构验证。它证明调用顺序、次数、参数和会话恢复；没有真实浏览器授予权限、系统选择器、USB 收发或浏览器几何验收。没有启动本机服务、操作物理串口、访问公网、使用外部浏览器自动化或部署。实际页面和实体证据由主控负责，本轮未把上一轮的实体或视口结果当成新入口的通过证据。

主控另行提供本轮真实本机生产页证据：[browser-observation.json](evidence/browser-serial-default-20261124/browser-observation.json)、[默认面板截图](evidence/browser-serial-default-20261124/default-browser-panel.jpg)。独立测试方只读核对记录，未覆盖这两份文件，也未计入上述 41 项：1280×720 下默认 browser、无独立授权按钮、未运行 3002 时无顶部本机错误，来源切换及重开保留 browser；弹窗 x=190、y=16、right=1090、bottom=704，位于视口内。该 IAB origin 没有已授权对象；点击新设备进入等待选择，但宿主无法操作系统选择器，主控已取消，没有物理 open，**不构成新设备实机连接通过**。公网 Chrome 建页控制超时，未计为线上 UI 通过。

本轮测试首次运行全部通过，独立验收交付冻结。
