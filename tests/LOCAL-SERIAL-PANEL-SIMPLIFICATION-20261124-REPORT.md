# 本机串口面板精简独立验收

日期：2026-11-24（Asia/Shanghai）。结论：**通过，未发现阻塞问题。**

依据主控最新冻结的 `docs/api-contract.md`《本机串口面板精简》及 `docs/design/local-serial-panel-simplification-frontend.md`。本节最新规则覆盖此前浏览器默认入口规则，历史报告不作为本轮交互要求。

## 聚焦回归

执行现有本机及底层浏览器兼容测试，**31 / 31 通过**（本机 20 项、兼容文件 11 项，含子用例）：

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/local-serial.test.ts apps/web/test/browser-serial-default.test.ts
```

文件名 `browser-serial-default.test.ts` 沿用历史名称，其当前内容已按本机精简规则更新，实际覆盖构造/打开/刷新/discover 固定 local、旧句柄释放及内部兼容。本轮没有新增镜像单测、重复全部 152 项前端测试、重跑后端或旧工厂矩阵。开发方 typecheck/build/全量结果为交接信息，不计入上述独立执行数。

执行输出：[frontend-regressions.txt](evidence/local-serial-panel-20261124/frontend-regressions.txt)。代码、产物和字节审查证据：[source-protection-review.json](evidence/local-serial-panel-20261124/source-protection-review.json)。

## 验收结果

- **固定本机目录。** Panel source 为 readonly local，构造同步设置 SerialSources 为 local；refresh 始终走 refreshLocal，并显式调用 session.refresh('local')。SerialSources 默认 local，NativeSerialSocket 默认 discoverySource 为 local，原生接线创建及初次连接也显式固定 local。现有测试确认组件挂载、刷新及 discover 不调用浏览器 requestPort / getPorts，不自动 open；即使底层缓存已有两个浏览器许可对象，普通候选也不显示或被默认 discover 重复通知。
- **入口删除完整。** 连接视图已移除来源切换、首次授权说明、连接新设备、浏览器来源空列表与授权错误区。只有静态“本机直连”区域名，保留本机服务状态、重新检测及刷新。空列表只提示检测本机目录，不引导授权。代码审查确认视图不引用 setSource、connectNewDevice 或 browserFeedback；最终编辑器不含“连接新设备”和旧“已授权设备会自动显示”说明。
- **原有行功能保留。** 现有结构回归确认列顺序仍为设备名称、端口、波特率、状态、操作；本机行保留各自输入和保存/应用，连接、切换、断开均在最后一列。双设备偏好、刷新保留、应用/切换失败恢复、忙守卫、旧服务和枚举错误均通过相关回归。没有按 VID/PID 将浏览器对象合并为 OS 端口。
- **旧浏览器占用可见、可释放。** rows 保留 local 行与真正 active 行；旧活动浏览器行标记“保留的已有连接”，波特率只读，没有输入、保存偏好或应用按钮。open 时仅有最右“断开”，关闭失败后仍显示占用和“重试断开”；忙时释放被拦截，确认关闭成功后该行移除。现有模拟验证本机离线刷新不关闭旧流、不重新授权，普通浏览器缓存行不出现；本机活动流也不会因显式兼容缓存刷新被切断。
- **兼容边界保留。** 底层 requestPort、显式 browser 枚举、内部连接选择与 VM 适配实现仍在。相关回归验证显式兼容路径的首次手势、取消/拒绝、重复选择、状态变化守卫及迟到枚举。这些属于内部兼容测试，不是面板重新提供浏览器授权入口。没有为删减 UI 强制关闭或隐藏待释放所有权。

## 最终产物与受保护字节

`openblock.html` 引用 `editor-sqHyfw8P.js` / `editor-A53goq4q.css`，与冻结交付一致。

| 资源 | SHA-256 |
| --- | --- |
| editor-sqHyfw8P.js | `71d786a1c5d9ed83bc5e7887b8b135b016bcdaf771a0b806b8d9072137065f71` |
| editor-A53goq4q.css | `d04aa6eda109f15eb038ebb70d21c456dcd4703b0c5bc218026f066b01d6b8dd` |
| GUI | `78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5` |
| 用户 PNG（public / dist） | `c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2` |

从固定上游归档只读提取原 GUI，对照既有清单逐个比较 **178 个 VM、15 个 Blockly** 模块完整内容及哈希，全部一致。`LICENSE`、`LICENSE.MIT`、`TRADEMARK` 与上游原字节一致。

## 证据边界与交付

独立执行仅运行现有 Node 模拟回归，审查代码、元素树及构建产物。五列和最右操作属于结构证据，不能替代真实浏览器可见性、视口滚动或实体串口验收；历史浏览器截图没有计为本轮通过证据。

主控另行提供本轮真实生产页只读证据：[browser-observation.json](evidence/local-serial-panel-20261124/browser-observation.json)、[local-panel.jpg](evidence/local-serial-panel-20261124/local-panel.jpg)。主控报告默认本机，浏览器切换/首次说明/连接新设备均不可见，仅有 1 行真实 OS COM3，五列表头正确；1280×720 弹窗 bottom=704，完整位于视口内。COM3 显示其他窗口占用，主控未点击连接/断开或修改波特率，也未重启用户服务。这属于主控的 UI 与真实目录证据，不计入上述 31 项；旧浏览器句柄释放仍只由本轮模拟回归及源码审查证明，没有实体释放测试。独立测试方未覆盖这两份文件。

未启动浏览器或本机服务、访问真实 3002 / 公网、操作 COM3、重启或清理 PID 72632，未执行编译烧录或部署。仅新增本报告和本轮证据目录，未修改产品实现或历史报告。独立验收交付冻结。
