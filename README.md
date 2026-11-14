# CFZN-IDE

创客平台 IDE 第一阶段：OpenBlock 原版编辑器、匿名本地项目管理和浏览器 Web Serial 串口调试。

## 运行

要求 Node.js 22.12 或更新版本。当前开发环境为 Windows / Node.js 24。

```powershell
cd F:\CFZN\CFZN-IDE
npm run setup
npm run dev
```

编辑器地址：<http://127.0.0.1:5173>。API 地址：<http://127.0.0.1:3001/api/v1/health>。

前端与后端各自维护 package.json/lockfile，避免 OpenBlock 历史依赖影响 NestJS。详细 OpenBlock 准备步骤由 `apps/web/README.md` 补充。

## 开发与协作

- `apps/web/`：React + TypeScript 外层、同源 OpenBlock 编辑器、串口终端。
- `apps/api/`：NestJS + TypeScript API、匿名项目文件存储。
- `docs/api-contract.md`：主控冻结的统一接口契约，优先于设计提案。
- `docs/design/`：前后端接口设计提案与上游验证结论。
- `docs/control.md`：持续主控记录、变更和验收进度。
- `tests/`：前后端联调测试。

```powershell
npm run typecheck
npm run build
npm test
```

扩展独立浏览器验收使用已运行的网站和已构建的 API，自动创建临时 API 与测试存储。默认网站地址为 `http://127.0.0.1:5174`；若使用上面的开发服务，可执行：

```powershell
$env:CFZN_TEST_URL = 'http://127.0.0.1:5173'
npm run test:e2e
Remove-Item Env:CFZN_TEST_URL
```

## 本阶段范围

完整项目采用 OpenBlock `.ob` 归档，包含积木、造型与声音；支持兼容的 `.sb3` 导入。第一阶段的项目保存在本地 API 数据目录，无用户注册、登录或归属信息。Python 大后端完成后再确定身份与 OSS 存储契约并替换存储适配层。

串口通过 Chrome/Edge 的 Web Serial 连接用户电脑上的设备，需要 localhost 或 HTTPS 和用户点击授权。硬件 v0.2 采用同一浏览器串口会话与单独的本地 Arduino CLI 编译/烧录服务；支持情况以工具配置和实际能力响应为准，不承诺任意板卡。

本地硬件服务与项目后端分开启动：

```powershell
cd F:\CFZN\CFZN-IDE
$env:HARDWARE_CONFIG = '你的本机硬件配置文件绝对路径'
npm run hardware
```

硬件服务默认监听 `127.0.0.1:3002`；配置说明由 [后端说明](apps/api/README.md) 提供。前端默认使用 `http://127.0.0.1:3002/api/v1/hardware`，可用 `VITE_HARDWARE_BASE_URL` 指定本机端点。项目服务部署到 Nginx 服务器后，硬件服务仍需在插有 USB 开发板的用户电脑上运行；服务器的串口不是用户电脑的 COM3。部署的 HTTPS 页面还需允许本地网络访问并配置允许的页面 Origin，不能将本机 HTTP 测试视为全部远程浏览器部署验证。

## 原生项目操作

项目、新建、导入、导出、保存这五个按钮及保存状态位于 OpenBlock 原生蓝色菜单栏内，同一行显示，外层独立 app-bar 和菜单下方额外区域均移除。重复的原生“文件”菜单删除，其他原生菜单与项目标题保留；项目列表通过右侧抽屉打开，串口终端保留在上传模式下方。新建、导入和保存结果通过浮动消息显示，不占用菜单栏上方高度。

保存状态区分“未保存项目”“未保存的更改”和“已保存 · vN”。保存期间继续编辑会保留未保存状态；导出文件不会将项目标记为已保存。可通过原生标题编辑项目名称，窄屏下也可在项目抽屉使用“重命名当前项目”。

构建前后端后，可用 `npm run test:toolbar -- --placement` 运行 MenuBar 位置修正的独立浏览器验收；`npm run test:toolbar` 为完整工具栏回归。脚本使用随机端口、临时 API 和独立项目目录，结束后关闭自己创建的服务；不向用户正在运行的本地项目服务写入测试数据。位置修正的 4 组结果及历史完整回归见 [工具栏测试报告](tests/NATIVE-PROJECT-TOOLBAR-REPORT.md)。

## 主控与模块扩展

通过编辑器左下角原版“添加扩展”按钮进入扩展库，在筛选栏切换“舞台扩展”“主控扩展”“模块扩展”。先选择主控，再加入兼容模块；“支持当前主控”用于筛选当前可用模块。

顶部主控入口与扩展页共用完整的 20 项可见主控目录；自有硬件适配包括 Arduino Uno、ESP32、FireBeetle ESP32-E、ESP32-S3、Aijite ESP32-S3，其他原生条目保留其原有能力。普通 ESP32 与 ESP32-S3 是不同芯片目标；CP210x 仅是 USB 串口桥，不能据此选择 S3。FireBeetle 适配提供板级引脚别名，不能将发现串口视为原厂板型鉴定或 Mind+ 实时固件兼容。模块为有源蜂鸣器、雾化模块、人体红外、火焰传感器、水滴传感器、积木注释。Aijite 使用独立设备 ID，并沿用旧设备实现排除 IO3 的引脚菜单。

这些硬件模块提供真实积木编辑及 Arduino 代码生成，主控、模式和已加载模块随完整 `.ob` 项目保存。扩展源码和图片随网站发布，不需要运行旧 IDE 或 20112 扩展资源服务。编译使用所选 profile 的工具链；烧录使用用户明确选择的本机串口，并先释放浏览器串口。新 ESP32 项为上传模式和普通串口，不包含已验证的 Mind+ 实时固件迁移。实际验收范围以 `docs/control.md` 和本轮测试报告为准。

本轮提供仓库代码接入方式，不包含界面扩展包导入或远程扩展市场。后续登记主控与模块见 [代码接入说明](apps/web/EXTENSIONS.md)，资源来源见 [前端说明](apps/web/README.md)；统一范围和验收要求见 [接口契约的扩展附录](docs/api-contract.md)。本轮 14 组独立验收结果与证据见 [测试报告](tests/EXTENSIONS-INDEPENDENT-REPORT.md)。

## 编程模式与上传模式

原生蓝色菜单右侧提供“编程模式”和“上传模式”。编程模式显示原版舞台、角色、造型和声音；上传模式显示 Arduino 代码编辑器、上传入口和共享串口终端。切换视图保留当前主控、积木和模块，不会为 ESP32 自动刷入实时固件。

“自动生成”显示积木生成的只读代码；首次进入“手动编辑”复制当前代码，此后保留手稿。切回自动生成不会清除手稿。保存或导出完整 `.ob` 时，代码来源和手稿一同保存；打开旧项目默认为自动生成。上传使用当前选中的代码来源，成功上传不代表项目已保存。

点击“上传到设备”前，需要在“设置 / 编译”中选择可用工具配置和本机串口。下方串口终端与原有连接入口共用同一会话；编译、烧录与终端收发的状态分别显示。ESP32 的舞台编程界面可用，不代表已经实现 Mind+ 实时硬件协议。

本轮真实项目存储、界面和模拟串口验收范围见 [Mode UI v0.3 测试报告](tests/MODE-UI-V03-REPORT.md)。未将本轮模拟上传记录为实机烧录复测。

## 编辑辅助与本机服务

`Ctrl+S`（Mac 也可用 `Cmd+S`）调用原有项目保存。积木区的“搜索”按当前积木的实际文字查找，包含当前主控、已加载模块、变量和自制积木；结果仍为可以拖入工作区的原生积木。“清除”、关闭或 Escape 返回原分类。扩展页的“已加载”只筛选列表，取消勾选不会卸载扩展；顶部和扩展页的主控入口共用筛选状态。

“本机编译服务”检测与浏览器串口连接分别显示。服务在线但缺少主控 core 时，该工具配置仍不可用；烧录端口枚举失败也不会断开浏览器串口。终端的有界日志、发送草稿、格式、行尾和暂停状态随当前编辑器保留，切换模式或语言不隐式清空；刷新整个页面会重置这些临时显示状态。

Mind+ Link 是在用户电脑运行的本机连接程序，为网页提供设备和工具访问能力。当前 CFZN 使用 Web Serial 与独立本机执行器，并未发布自有 Link 安装器，也不调用 Mind+ 的私有 Link 协议。后续封装边界与调查依据见 [Link 调查说明](docs/design/mindplus-link-web-boundary.md)，功能对照与交付范围见 [Mind+ 功能对照](docs/MINDPLUS-FUNCTION-PARITY.md)。

## 上游来源

OpenBlock GUI：<https://github.com/openblockcc/openblock-gui>。保留官方 UI 和上游许可，不修改 VM 内核。具体固定版本和资源映射见前端文档。

当前实现与实测结果见 `docs/control.md`；开发过程中的运行说明以实际交付校验结果更新。
