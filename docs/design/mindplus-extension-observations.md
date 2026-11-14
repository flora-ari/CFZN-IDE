# Mind+ 扩展分类观察

日期：2026-11-06。调查目标是理解分类、元数据与交互，不复制 Mind+ 实现代码。

## 实际观察

公开页面：https://ide.mindplus.top/realtime/projects/editor

- 浏览器实际入口类为 `ExtensionButton_btnContainer__2Os5v`，点击后出现舞台扩展、主控扩展、模块扩展。
- 选中类 `ExtensionLibraries_tabSelected__-g4AM`，普通类 `ExtensionLibraries_tab__HQe-9`；点击两项后选中态互换。
- 主控分类本次显示总数 15，模块分类本次显示总数 32。模块筛选栏额外出现“支持当前主控”。这些计数属于本次上游观察，不是 CFZN 的交付数量。
- 浏览器实际请求两套公开目录：
  - https://resource.mindplus.top/mindplus/realtime/devices/dev.json
  - https://resource.mindplus.top/mindplus/realtime/extensions/ext.json
- 主控目录条目包含 `id`、`name`、`author`、`version`、`main`、`cover`、`isDevice: true`，还有 `boardConfig`、固件与支持模式信息。
- 模块目录条目包含同类显示信息、`isDevice: false`、`supportDevices`（主控标识到版本约束的映射）、`isSupportStage` 等信息。
- 本次截图抓取时卡片资源仍在加载；分类和目录 JSON 已获得，不据此声称已完成上游硬件连接或运行测试。用户提供的截图展示了未连接 Mind+ Link 时的禁用状态。

## 对本项目的设计含义

分类不应仅改变卡片样式。主控选择、模块加载与模块适配主控是不同状态，应由真实 OpenBlock VM 的设备/扩展机制支撑；具体本地标识以 CFZN 的受控目录和统一契约为准。

沿用 OpenBlock 原版筛选栏与卡片样式，增加两个切换入口。无需复制 Mind+ 的远程市场、账户收藏、下载缓存或版本服务；当前项目范围保持匿名本地。

## 调查方法和限制

尝试运行 `node D:\rea\scripts\rea.mjs inspect-web-page --help`，CLI 因缺少编译后的运行文件退出，未修改该工具或安装新依赖。随后使用项目已有 Playwright 和本机 Chrome 检查公开页面、分类切换与网络请求。

原始观测、目录 JSON、截图及脚本保留在 `.runtime/mindplus-research/` 和 `.runtime/inspect-mindplus.mjs`。用户本次三张截图保存在 `docs/references/06-extension-entry.png`、`07-extension-library-before.png`、`08-mindplus-extension-tabs.png`。
