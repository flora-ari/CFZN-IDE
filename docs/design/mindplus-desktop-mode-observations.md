# Mind+ 桌面模式界面调查

日期：2026-11-10。用户要求从已启动进程定位安装路径，用 D:/rea 调查模式、代码区和上传入口。本轮参考其交互职责，产品代码由 CFZN 外部适配层实现。

## 来源与范围

- Win32_Process 返回运行程序 D:/mindplus dev/Mind+/Mind+.exe；资源包为 resources/app.asar，408465379 字节。
- 包声明版本 1.8.1-202506121900，release 1.8.1 RC3.0。ASAR SHA256：48c783ff8b907f98728179b9abf8311b5e4d05db7a570165101147f9b0ee1f59。
- 只读检查 ASAR 清单后定位 dist/chunks/d499c0b3eabcd3c5bbad.chunk.js（60021929 字节）。未修改安装目录、未执行提取代码、未调用 Mind+ 烧录。
- REA 6.8.0 发布运行时位于 D:/rea/.published-runtime，独立 Node 24.22.1 位于本项目 .runtime/rea-tools。

## REA 结果

原 ASAR 按 package.json、electron/main.js、上述 renderer 选定分析，renderer 达到 180000 ms provider deadline。部分证据 ev_b79494273240cff8eb88e8dbdc0406e4ba4f2890cee3197a79ec47c1fba9ec17 保存在 .runtime/mindplus-mode/rea-summary.json；未重复同一请求。

随后将以下六个原始 webpack 模块表达式原文取出，仅外包数组使独立 JavaScript 语法完整，输入 .runtime/mindplus-mode/selected。原文哈希和变换说明在 selected-provenance.json；源模块偏移在 selected-modules.json，3220 原文另单独保存。REA 对此目录成功完成静态分析，父证据 ev_f21eb46f42189ee79953f8750b7d4a0f560a811fe378ff326cf57d14a70b7885，完整 selected-evidence.json、摘要 selected-summary.json。六文件均已处理；语义节点/未知数限额导致图覆盖 partial，不声称完整逆向或实际运行追踪。

## 已核对的行为

| 模块 | 静态事实 | CFZN 应采用的职责 |
| --- | --- | --- |
| 2321 / 2322 | interfaceIndex/activeInterface 独立选择 Scratch、Arduino、Python 页面；模式改变更新语言与活动视图 | 双模式显示状态单独管理；本轮只有编程/上传，不增加 Python |
| 3464 | pageChange 先 cacheProject，再 disposeBoard，再切换界面；busy 状态可禁用点击 | 保留作品/草稿；硬件任务期间不允许冲突切换，但不照搬其私有 VM 方法 |
| 3219 / 3220 | 自动生成/手动编辑标签通过 isWrite 与 setArduinoCodeIsWrite 选择来源 | 区分积木生成代码和手动草稿，不以禁用开关代替明确标签 |
| 3054 | burnCode = isWrite ? writeCode : code；compileAndBurn 先检查主板/端口并 closeCommSerialport，然后 sendBurnMsg；区分编译和上传、真实日志与错误 | 新按钮走已有 HardwareController，当前来源代码快照、串口独占、真实结果与取消机制继续复用 |

## 实施边界

保留 OpenBlock 蓝色菜单、真实积木/舞台、六个项目按钮。主控描述用深蓝底粗体白字，卡片以实际已提交 deviceId 高亮蓝边。上传右栏按参考图安排顶端上传与设置、自动/手动代码区、下方串口与发送栏；隐藏舞台角色控件，编程模式恢复它们。

不复制 Mind+ VM 或固件；不修改 openblock-vm 源码/打包模块。舞台编程能力不等于 ESP32 实时硬件协议能力。手写代码和选择来源必须通过外部归档层随完整 .ob 保存，原后端 HTTP 保持不变。具体以 docs/api-contract.md 新附录为准。
