# 主控状态与缓存独立验收准备

依据 api-contract.md 顶部 Mind+ 主控状态缓存契约，仅主控选择页。等待开发冻结后执行；使用 fake HTTP/Link 实例，不启动服务、SDK、串口或真实 prepare。

- 实际 React 输出矩阵：当前实例确认 ready 完全没有 download/check/占位；明确 missing+installable 才灰层和可下载按钮；unknown/offline/legacy/noProfile/unsupported 中性，不借 selected 或随包编辑资源判断 SDK。选中边框保持独立。失败/取消只在对应当前任务允许重试。
- 缓存跨对象：mock 持久目录 ready，销毁并重建 ToolchainPreparation/HardwareController，再读同目录；关库重进保持 ready、prepare POST=0。对每次读取记录实例及请求计数，避免只验证已有内存布尔值。
- 实例与竞态：A 的 caps/catalog/旧失败关联在 B 上失效；延迟 A 响应不得污染 B。B 未确认前既不 ready 也不 missing；caps/catalog 矛盾应重新对账而不自动重复准备。
- 保留 busy/共享 plan、字节/无总量、取消失败、串口互斥与编译续接的必要定向回归。主控目录 20 卡、无 footer、绝对覆层/等高规则保持；功能模块实际组件输出不套主板 Profile 灰层。
- 证据分层：真实 React/对象与 mock HTTP 不等于浏览器几何或真实 SDK。既有 CUA 拒绝不换驱动绕过；真实跨 executor 持久缓存由 Link 主控独占取证。记录候选 source/产物摘要，另写新验收报告，不覆盖前轮结论。
