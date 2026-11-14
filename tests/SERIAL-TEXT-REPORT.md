# 串口文本分片独立验收

## 最新：删除父串口抽屉后的定向回归（2026-11-10 13:43）

**通过：构建 `editor-BwMW-OWc.js`，上传终端 3/3，五按钮最小页面检查 1/1。** 父 `SerialPanel`/serial action/drawer 已删除，原双终端检查中的父抽屉用例明确退休；未新建替代入口，未改上传模式终端实现。

- `tests/serial-text-independent.mjs` 移除父抽屉 UI 操作和断言、父层 HARDWARE_STATE 事件监听；需要状态时使用保留的 GET_HARDWARE_STATE 查询。上传终端仍检查 h即时、ello CR拼接、跨chunk LF不另空行、重复hello、中文逐byte、prompt、HEX rawchunks、清空/换session、pause丢弃。
- `tests/menu-five-buttons.mjs` 实际页面断言项目/新建/导入/导出/保存精确五项及project-status，整个iframe无serial-button，上传模式终端及连接按钮仍在。
- `tests/native-project-toolbar.mjs` 仅维护直接受删除影响的五按钮断言，退休旧“native Serial→父抽屉Connect”用例；没有全仓修改其它历史脚本。

执行：`node tests/menu-five-buttons.mjs`、`node tests/serial-text-independent.mjs`。均退出0，没有运行模式/上传/API完整矩阵。

证据：`tests/evidence/menu-five-buttons/2026-11-10T05-43-18-138Z/results.json` 及截图；`tests/evidence/serial-text-independent/2026-11-10T05-43-18-076Z/results.json`、`build.json`、`upload-terminal-hello.png`、`session-and-pause.png`。

两个自建浏览器/随机HTTP/API服务正常关闭，各自临时存储正常删除，无清理拒绝。未碰用户服务、COM3或真实硬件。本次仅模拟WebSerial文本UI回归，不代表重新实测硬件。

## 历史：父抽屉移除前的双终端验收

2026-11-10，Asia/Shanghai。**3/3 聚焦组通过，未解决本缺陷相关问题 0 项。** 实际构建 `editor-BK6uPSqw.js` / `editor-B0PxROSH.css`。

命令：`node tests/serial-text-independent.mjs`。

真实 Edge、实际产品 iframe/上传区与父串口抽屉，模拟 Web Serial ReadableStream 按指定分片 enqueue；未运行开发自验脚本、模式/API/上传全套矩阵。通过原生主控库选择 ESP32，真实“选择串口”点击授权模拟端口。仅测试目录有修改。

| 检查 | 结果 |
| --- | --- |
| 两终端 `h` 即时显示，随后 `ello\r` 补为同一行，单独 `\n` 不产生空行 | PASS |
| 连续重复 `hello\r\n` 各自一行，无 RX h / RX ello 拆分 | PASS |
| 中文 UTF-8 每次只输入一个 byte，最终为完整“中文”，无替换字符 | PASS |
| 无换行 `> ` / `prompt>` 即时出现 | PASS |
| 切 HEX 后逐 byte 中文为原始 E4/B8/AD/E6/96/87，后续 `3E 20` 保持真实 chunk bytes | PASS |
| 收到未完成 UTF-8 后清空，后续 prompt 不继承旧 decoder 尾部 | PASS |
| old + 未完成 UTF-8 后断开/新 session，再到 new：两行 old/new，不跨会话拼接 | PASS |
| 上传区 pause 期间 DROP 被丢弃，恢复后 before/after 分行；父抽屉持续接收为 beforeDROPafter | PASS |
| 页面 JS 异常 | 无 |

证据：[最终结果](evidence/serial-text-independent/2026-11-10T03-59-59-719Z/results.json)、[实际构建](evidence/serial-text-independent/2026-11-10T03-59-59-719Z/build.json)、[两个终端 hello 截图](evidence/serial-text-independent/2026-11-10T03-59-59-719Z/both-terminals-hello.png)、[会话/暂停截图](evidence/serial-text-independent/2026-11-10T03-59-59-719Z/session-and-pause.png)。已实际查看 hello 截图，两个真实终端均为三行完整 hello。

首轮 `2026-11-10T03-58-50-850Z` 保留为脚本排错：父抽屉覆盖上传区时点击其清空被真实遮挡，未强制点击。脚本改为关闭抽屉→实际操作上传控件→重新打开抽屉对照，最终通过；非产品缺陷。

两个脚本进程均正常退出，退出前明确断开模拟串口，关闭自建浏览器、随机静态服务及隔离 API，并删除各自临时目录。本轮无清理审批拒绝，未执行终止进程与删除目录组合命令。没有操作用户5173/3001/3002或COM3，没有烧录、真实串口或物理波特率复测；本报告是显示层分片问题的模拟流/UI验证，不声称硬件重新通过。
