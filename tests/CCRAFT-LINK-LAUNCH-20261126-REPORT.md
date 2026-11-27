# CCraft Link 网页唤起与只读故障检查

2026-11-26（Asia/Shanghai）。**网页候选的模拟/源码验收通过；真实进程启动及用户故障根因尚未通过。未触发协议、启动或关闭实例、打开串口或部署。**

## 网页候选

只读核对当前 `apps/web/src/ccraft-link.ts`，对照本轮交付前的隐藏 iframe 实现，而未把整个工作区历史 diff 当成本轮改动。新逻辑删除隐藏 iframe，通过原始点击同步设置 `(host.top ?? host).location.href = 'ccraft-link://launch'`；两个入口复用同一函数，没有先 await health 或定时器。ready 时直接返回，仅有效 health 能令引导关闭。同步导航异常被捕获，继续检测；界面保留手动打开、本地网络权限和离线编辑说明。没有把发出 URI 请求当成启动成功。

现有 11 项定向测试及新增 3 项独立模拟全部通过：

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/ccraft-link.test.ts
node --experimental-strip-types --disable-warning=ExperimentalWarning --test tests/link-launch-20261126.mjs
```

独立脚本 [link-launch-20261126.mjs](link-launch-20261126.mjs) 使用实际 CCraftLink / mountLinkGuide，fake top.location setter 只记录调用，绝不触发 Windows 协议。覆盖两个原始手势入口、无 iframe、已存在未保存编辑 DOM 保留、同步导航 throw 后继续检测、有效 health 后关闭引导并恢复焦点、ready 不重复唤起、无安装包平台不派发协议，以及 dispose 只移除自有 DOM/监听、停止后续探测。既有测试另覆盖 3 秒超时、旧响应、轮询及设备/作业守卫。证据：[前端输出](evidence/link-launch-20261126/frontend-tests.txt)、[独立输出](evidence/link-launch-20261126/independent-tests.txt)。

这些结果证明模拟 DOM 和调用顺序，不证明真实顶层 custom-scheme 导航一定保留编辑器，也不证明浏览器外部应用确认、ShellExecute、单实例恢复或 health 真实进程链路。现有成功 health 均为模拟响应，未查询实际 3002。前端候选是兼容性改进，不能表述为修复了当前“开始菜单也无法启动”的根因。

## Windows 只读证据

查询时间范围：**2026-11-19 10:30:33 至 2026-11-26 10:30:33，UTC+08:00**。Application 日志 ID 1000/1001 共 80 条，对事件 XML 按 CCraft 匹配为 0。没有可归属的故障模块、异常码或事件时间可报告。系统 WER ReportArchive / ReportQueue 目录可读，匹配 CCraft 的报告目录均为 0；当前用户对应的两个 WER 路径不存在或不可访问。

**未检出事件不能证明无崩溃或无 loader 早退。** 没有扩大枚举其他用户应用日志。一次补充查询因 PowerShell 括号错误未执行；已修正并成功完成以上有界查询，成功输出保存在 [windows-readonly.txt](evidence/link-launch-20261126/windows-readonly.txt)。

开始菜单 `C:/Users/flora/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/CCraft Link.lnk`：目标 `D:/CCraft Link/ccraft-link.exe` 存在，参数为空，工作目录 `D:/CCraft Link`。仅通过 COM 读取快捷方式字段，没有调用 Save、Run 或启动目标。

实际安装 EXE 的只读身份：

- FileVersion / ProductVersion：0.1.3。
- 大小：11,020,288 B；LastWrite：2026-11-25 16:40:56 +08:00。
- SHA-256：`aa34f4294056f1f3249d32723b4302a2a8d7e1dd46f773ee9fdb76fbdec8c4ab`。
- 当前用户协议注册命令：`"D:\CCraft Link\ccraft-link.exe" "%1"`。

注册、文件存在和版本资源不证明二进制可运行，也不能由当前源码推断此 EXE 接受哪种 URI。无尾斜杠/尾斜杠、参数规范化及该安装 EXE 与源码的实际行为差异，仍待 native 主控或用户手动运行证据。

## native 与真实浏览器边界

主控已说明自动启动请求被自动审批策略拒绝，本任务没有用脚本、MCP、浏览器协议或自动确认绕过。用户反馈开始菜单手动启动也失败，因此不能预设 iframe 是根因。

native 主控另报告纯日志测试 EXE 退出码 0xC0000139，解释为入口点未找到，且未启动 Link 本体；这是另一测试二进制的证据，不是本报告独立运行结果，也不证明安装的 0.1.3 EXE 同根因。本任务没有重复 loader 测试或实例操作。

真实浏览器与实际启动链路尚未验收。后续如需用户手动验证，须经规定 takeover 交接并等待用户归还控制；当前没有发起 CUA 或要求用户操作。仅修改 tests 文件，未改产品源码、VM、注册表或服务。**可报告网页模拟回归通过，不能报告用户启动问题已经修复。**
