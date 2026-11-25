# 串口设备面板独立验收

日期：2026-11-24（Asia/Shanghai）。结论：**独立逻辑与跨端验收通过，未发现阻塞问题。**

依据 `docs/api-contract.md`《本机串口设备列表与行内设置》及《打开失败结果核对补充》，对照两侧 `serial-device-panel-*.md` 设计。仅新增本报告、`tests/serial-device-panel-20261124.mjs` 和本轮 `tests/evidence/` 证据；未修改产品实现。

## 执行结果

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 新增独立跨端验证 | 5 / 5 通过 | 真实 Nest HTTP，注入假串口驱动，实际 LocalSerialLike → HardwareSession → HardwareController → SerialDevicePanel |
| 前端定向回归 | 20 / 20 通过 | `apps/web/test/local-serial.test.ts`，包含子用例 |
| 后端定向回归 | 6 / 6 通过 | 官方 SerialPortMock、Origin/隐私、输入边界、打开失败、丢失响应、编译/上传互斥 |
| 固定资源边界 | 通过 | 最终编辑器入口、GUI SHA-256、178 个 VM / 15 个 Blockly 模块、3 份上游许可、PNG |

执行命令（项目根目录）：

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --test tests/serial-device-panel-20261124.mjs
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/local-serial.test.ts
node --test --test-name-pattern="official MockBinding|binds clients|failed opens|aborted open response|compilation retains|serial validation" apps/api/test/serial.test.cjs
```

本轮合计 31 项通过，未重跑全部 136 项前端或 52 项 API 测试，未执行旧工厂矩阵。开发方全量检查结果为交接信息，不计入本报告独立执行数。

## 真实 HTTP 与模拟驱动证据

测试使用 `createHardwareApp` 的真实编译产物，在 `127.0.0.1:0` 由系统分配端口。显式注入 driver、目录 provider 和空工具链发现结果；没有加载物理串口 binding。每组运行使用系统临时目录，退出时关闭前端会话、本机应用并核验临时路径后删除。没有监听 3001 / 3002 / 5173。

- 两个端口 `MOCK_A` / `MOCK_B` 使用相同 VID/PID；分别保存 9600 / 57600。保存、刷新、重建面板和适配器均未打开端口；两个偏好没有互相覆盖。未保存草稿在刷新后保留。空编译能力不影响本机串口可连接。
- 显式连接 A 后，服务驱动收到正确路径及 9600 配置。通过真实 HTTP 接收 `[0,10,13,128,255,5,6]`，前端读游标推进至 5；并发调用写入按序号 1、2 到达驱动。重复提交序号 1 的相同载荷得到确认，未再次写入驱动。
- 切换列表来源保留活动连接行；连接 B 时先释放 A，B 按自己的 57600 配置打开，同时只有一个编辑器活动端口。断开后两句柄均关闭。硬件忙时，另一行连接和 TX 均被守卫拦截。
- 枚举后被其他客户端抢占，真实打开失败返回 `details.session:null`，前端清除不确定占用；另一客户端释放后重新检测恢复可连接。驱动打开失败返回 `held:false` 时同样清除占用。
- 驱动迟迟未完成打开导致 504，返回有效 `held:true` 快照；前端保留该行和可关闭会话，另一行被拦截。迟到打开且关闭失败时仍保留占用；显式重试断开成功后才清除，随后可以重新连接。
- 故意丢弃真实服务的打开响应及首次核对响应，再显式断开：3 次 HTTP 提交使用完全相同 UUID 与载荷，后端仅创建 1 个驱动句柄并最终释放，没有另开会话。
- 在真实 capabilities 响应上移除新 serial 字段模拟旧服务，仍通过真实 `/ports` 显示两行；直连显示更新提示并被禁用。恢复新能力只恢复列表，不自动打开。
- 以实际渲染函数生成元素树，核对五列顺序，每行前四列没有操作按钮、第五列包含两个操作；没有额外全局波特率下拉或设备大图。此项是结构验证，不是浏览器几何测量。

结构化证据：[independent-checks.json](evidence/serial-device-panel-20261124/independent-checks.json)。独立脚本：[serial-device-panel-20261124.mjs](serial-device-panel-20261124.mjs)。

## 定向回归与接口审查

前端 20 项覆盖独立保存键（服务 URL + 规范端口、本页浏览器对象身份）、浏览器授权同步手势、切换及应用失败恢复旧实际配置、RX 重叠去重/缺口停流、关闭失败保留占用、低波特率 TX 分块/忙守卫、TX 响应丢失不重发、明确 null/held-false/held-true 结果、缺失或外来错误快照继续保留不确定状态、旧服务/离线/重启失效、退出页面关闭和核对期限。波特率草稿、已保存值与实际应用值分开保留，失败不会把草稿当成成功配置。

后端 6 项通过官方 MockBinding 验证 RX 游标可重放、真实 write/drain 确认与 TX 去重；验证 Origin 与实例绑定、其他会话隐私及不同端口并行；覆盖非规范 Base64、64 KiB 字节上限、额外字段/选项/查询、96 KiB 请求边界；覆盖失败结果的同 UUID 重试、终态当前快照、取消响应恢复及预条件 null；验证已有 RX 在编译期间保留，新打开/TX 被拦截，上传占用到工具确认退出。

源码与后端编译产物审查确认：

- 新接口为 `/serial/clients`、`/serial/devices`、`/serial/sessions` 与会话的状态/read/write/close。serial 请求必须使用精确允许的 Origin；除创建客户端外要求 token。loopback Host、`no-store`、CORS token 请求头、JSON-only、96 KiB / 禁止请求解压均在统一入口执行；普通接口继续使用原 7 MiB 解析边界。
- 客户端 token 绑定 Origin 与当前实例；deviceRef 由服务签发，路径及观测身份变化会失效，打开前在保留锁内重新枚举。设备不按 VID/PID 或列表位置配对。
- `HardwareOwnership` 同步保留串口事务、TX 与 CLI 互斥；释放只有在句柄确认关闭后完成。普通编译不主动切断已有 RX，上传不能接管其他客户端占用。
- `/uploads` 在源码与 dist 中仍严格使用 `{buildId, portId}`。本轮串口偏好不进入上传请求、项目存储或生成代码。
- `native-hardware.ts` 为本机/浏览器来源创建同一个 HardwareSession；NativeSerialSocket 和 TerminalModel 订阅这个会话的字节，未新增第二个物理 reader。初次连接仍经原生 VM 适配入口，切换/应用复用共享会话；面板卸载只取消视图订阅，pagehide 才释放适配器。

## 最终产物与受保护字节

最终 `openblock.html` 引用 `editor-BLAc7Bpd.js` 和 `editor-D-1o8Rs6.css`。

GUI SHA-256：`78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5`。

从固定上游归档只读提取原 GUI，并逐个比较 178 个 VM 和 15 个 Blockly 模块的完整内容；同时复核原有清单哈希，全部一致。`LICENSE`、`LICENSE.MIT`、`TRADEMARK` 与归档逐字节一致。

`public/branding/ccraft-logo.png` 与最终 dist PNG 均为原用户图片哈希：`c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2`。

## 证据边界与交付

本报告的网络与 Nest 路由是真实执行，端口与驱动是模拟的；浏览器来源、错误快照异常等扩展边界由定向模拟回归覆盖。独立验收没有启动浏览器、操作物理 COM3、连接用户服务、执行硬件烧录或部署。实际设备驱动、原生 VM 在真实页面中的连接、视口裁切与最右按钮可见性，以及部署验证由主控单独验收，不能以元素树/CSS 断言替代。

主控在独立验收收尾时另行提供以下已完成结果，**属于主控提供的实机/浏览器证据，不计入上述 31 项独立执行数**：COM3 在 115200 / 9600 真实打开、接收并释放；本机生产页 `127.0.0.1:5173` 行内连接、应用 9600、恢复 115200、断开通过；1280×720、1366×768、1528×728、1920×910 视口弹窗均在视口内且操作位于最右列，360×640 可通过内部滚动到达操作。主控说明未进行 TX 或刷写固件。独立测试方未重复这些实体或浏览器操作，后续部署仍由主控负责。

首次新增脚本运行有两处夹具假设需要校正：外部客户端释放后应刷新缓存行，以及上游第三份许可实际名为 `LICENSE.MIT`。修正测试后 5 组全部通过，未改产品实现。当前没有需要开发返修的阻塞项，独立测试交付冻结。
