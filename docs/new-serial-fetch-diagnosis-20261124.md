# 新串口刷新请求失败诊断

日期：2026-11-24（Asia/Shanghai）。本轮仅诊断，未修改产品或重新部署。

用户先报告新设备未显示，随后确认曾在手动刷新时收到 `Failed to fetch`。再次刷新后 COM4 出现，用户截图显示 USB-SERIAL CH340 (COM4) 已连接，实际波特率 115200。因此，缺少热插拔自动刷新可以解释旧列表，但不能单独解释此前手动刷新的网络错误。

## 已验证

- Windows 识别 CH340 COM4，设备问题代码 0。之前的 COM3 已拔出。
- 本机硬件服务 PID 72632 持续监听 `127.0.0.1:3002`，未重启。现有日志无崩溃信息；预期 API 错误并不一定写入该日志。
- 连接前的 open/read/close 检查成功，未发送应用字节或烧录固件。见 `../tests/evidence/new-serial-diagnosis-20261124/service-open.json`。
- 原前端适配器、会话和面板模型通过真实本机服务枚举到 COM4。此项是 Node 侧集成检查，不能替代浏览器的权限与网络检查。见 `../tests/evidence/new-serial-diagnosis-20261124/frontend-adapter-list.json`。
- 带 `https://ide.xiaodaiyang.top` Origin 的串口预检返回 204，允许精确 Origin、令牌请求头及 Private Network 响应头。连续 12 次只读设备枚举全部返回 200，耗时 2–4 毫秒。见 `../tests/evidence/new-serial-diagnosis-20261124/fetch-stability.json`。
- 用户连接建立后，所有诊断仅枚举目录；COM4 对诊断客户端显示 `other-client`，未连接、断开或抢占该设备。

## 源码与结论边界

刷新目录依次访问 `/capabilities`、必要时 `/serial/clients`、`/serial/devices`。原生 fetch 的拒绝信息会直接出现在“无法确认本机串口列表”提示中；现有实现没有保留失败阶段、URL、耗时或浏览器阻止原因。

可读取的 HTTP 错误会显示错误码；8 秒超时有中文超时提示。`Failed to fetch` 仅说明浏览器未取得可供应用读取的响应，不能据此区分连接故障、跨域拒绝或浏览器本地网络访问限制。允许 Origin 的当前预检成功，且同一页面后来已经连接，未发现持续的固定配置错误。

浏览器诊断接口未能读取用户现有 IDE 标签页，最终返回 Debugger unattached。没有获得失败时的 Console/Network 记录，无法锁定历史请求的具体根因，也没有将 Node 请求成功记作真实浏览器网络策略验证通过。

删除 Web Serial 授权区域没有移除本机 HTTP 枚举或连接；这条路径不使用浏览器串口授权。浏览器本地网络访问许可是另一项权限。当前没有证据表明删除授权区域导致本次失败。

本次未修补或放宽跨域/权限规则，未修改 VM、后台服务或用户的当前连接。若问题复发，优先记录失败请求的 URL、方法、浏览器 Network 错误与 Console 原文，再决定修复；仅凭现有错误不把某一候选原因当作已确认结论。
