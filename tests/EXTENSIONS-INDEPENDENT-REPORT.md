# 主控 / 模块扩展独立验收

日期：2026-11-06，Asia/Shanghai。测试角色，仅修改 `tests/`。

**最终结论：本轮扩展契约的必需场景通过，未解决产品缺陷 0 项。** 独立发现 2 项主控切换实质缺陷，已由前端修复并独立回归。最终复测对象为 5174 上包含 `assets/editor-DmlIsIFJ.js` 的生产构建；采用分批定向复测，未为得到单次全绿而重复全量旧测试。

## 环境与隔离

- Windows、Node 24、Playwright、本机 Edge 无头浏览器；生产预览 `http://127.0.0.1:5174`。
- `extensions-independent.mjs` 创建独立 Nest API（随机端口）与 OS 临时存储，浏览器 `/api` 请求转发到该真实 API，结束后关闭并删除本次目录。不终止或修改用户 5173/3001 服务与项目。
- 每组失败/恢复测试使用独立浏览器上下文。通过显式、版本化 Library hook 获取真实 VM，通过其公开 runtime 事件获取真实 Blockly；未使用 React Fiber 或替代 VM。
- 后端既有 build/typecheck/6 项 HTTP 用例及前端开发自验按交接复用，未重复全量旧套件。

## 已确认缺陷及修复验收

下面复现步骤描述修复前行为。原证据保存在 `evidence/extensions-switch-before-fix/`；修复后同脚本的两个场景均为 PASS，见 `evidence/extensions-switch-repro/repro.json`。

- E1 修复后具体提示 `activeBuzzer_init` 的引脚 3 不受 Aijite 支持；E2 具体提示 Uno 不支持 `arduino_serial_multiSerialPrint`。
- 两次拒绝后，原通用 ESP32-S3、模块、完整积木 JSON 和 dirty 状态均保持。拒绝后导出至新上下文重新导入，仍能生成原引脚 3 / `Serial.println(42)`，并可继续修改为引脚 4 / `Serial.println(43)`。

### E1：从通用 ESP32-S3 的 IO3 切到 Aijite 未被拒绝

最小脚本：`node tests/extensions-switch-repro.mjs`。

1. 全新上下文，从原扩展库选择通用 ESP32-S3，加载有源蜂鸣器。
2. 连接 Arduino 启动帽与蜂鸣器初始化，参数 `PIN=3`。
3. 选择 Aijite ESP32-S3。
4. 实际成功切换，原参数保留为 3，生成 `int activeBuzzerPin = 3;`，未提示不兼容。

预期：目标 Aijite 排除 IO3，应拒绝并保全通用 ESP32-S3 项目。证据：`evidence/extensions-switch-repro/repro.json` 的 `pin3`、`pin3-after-switch.png`。

### E2：ESP32 专用串口块切到 Uno，被当前 iframe 的定义缓存掩盖

同一最小脚本的 `serial` 场景：

1. 全新上下文选通用 ESP32-S3，加载蜂鸣器；建立启动帽 → `arduino_serial_multiSerialPrint`（输入 42）。
2. 切到 Arduino Uno 被允许，当前 iframe 仍生成 `Serial.println(42)`。
3. 导出完整 `.ob`，在第二个全新上下文通过顶部导入。
4. 页面只呈现启动帽，生成代码的 `setup()` 为空；工作区保留的同名未知块缺少原输入/实现。

预期：切换前发现目标板缺少 opcode，具体报错并保留原项目。证据：`serial-after-switch.ob`、`serial-fresh-reopen.png`、`repro.json` 的 `serial.reopened`。首轮遭该切换污染后，未知 ID 失败恢复曾暴露其嵌套串口/传感器块消失；干净 Aijite 项目的未知 ID 恢复复测通过，因此不将其独立报告为第三个缺陷。

## 已通过的独立检查

- 原 extension 按钮打开原生全屏 Library；三分类在原 filter bar 内；查询与分类互不重置；未选主控六卡禁用且有提示；1440/768/390 下分类键盘与搜索可操作、可滚到最后卡片。已实际查看三个截图。窄屏筛选栏按设计横向滚动。
- 三个卡片选择真实 VM 设备；Aijite 数字/模拟/触摸及六模块 PIN 菜单无 IO3；通用 ESP32-S3 对应菜单包含 IO3；选择操作标记 dirty。
- 六模块全部真实 block definition、flyout、Arduino generator 存在；模块重复选择不新增资源请求、不增加 dirty 版本；全部使用稳定旧 opcode。
- 实际组合条件、语句与双层注释，编辑引脚 4/5/6/2/7/8 和状态 LOW；生成 GPIO 初始化/读写、雾化切换、PIR 布尔、火焰与水滴数字/模拟和正确保留内部代码的嵌套注释。证据 `all-modules.ino`。
- 顶部 UI 首次 POST、修改后 PUT（revision 2），下载 GET 与本次实际提交包精确字节一致；全新浏览器上下文从项目列表打开后 dirty=false，完整设备/模式/模块/积木连接及参数保持。
- VM 原生归档含 Aijite + 六模块，水滴模块已加载但无放置块；顶部实际下载的 `.ob` 文件再次导入并核对，普通项目及新建清理均验证。
- 逐个逻辑身份（舞台/角色名与索引 → 造型/声音名与索引）核对素材引用存在、实际字节 SHA-256、大小和元数据，3 SVG 与 2 WAV 保持；不依赖 ZIP 原始文件名或无身份哈希集合。映射见 `asset-identity-map.json`。
- 干净上下文的未知主控、模块及舞台 ID 导入均报具体 ID、原项目语义与素材字节保持；旧别名 `aijiteEsp32S3` 规范为 canonical；普通与新项目清理主控/模块。
- 中断实际 `atomizer/generator.mjs` 请求后显示雾化模块失败，完整原项目恢复；解除中断后重试成功。延迟真实资源时点击顶部保存被 busy 拒绝，无 POST/PUT；快速重复点击不重复注册。另在导入六模块归档时中断实际 `raindropSensor/generator.mjs`，报错并恢复原项目的设备、模块、块连接、参数及素材字节；截图为 `actual-import-resource-failure-rollback.png`。
- 共同数字引脚 4 + 六模块，Aijite → Uno → 通用 ESP32-S3 → Aijite 三次切换均保留模块、连接/参数并继续生成原代码。原设备菜单在有积木时会先给出“工作区不是空的”提示，阻止打开库；这一实际 UI 保护及 VM 对 Micro:bit 的不兼容模块拒绝均验证，原项目保持。
- 不支持的 Micro:bit 下“支持当前主控”过滤隐藏六模块，取消过滤后显示但禁用；Uno 实时模式提示/切上传工作；浏览舞台分类不改模式，已加载模块时拒绝回实时模式。
- 原版 pen/music 通过原库加载，真实 VM 执行 pen clear/down/up、music tempo/drum，角色实际 x 从 0 到 23；`stage-execution.json` 记录真实 primitive 调用。
- 本轮资源请求均同源 `/cfzn-extensions/`，无旧 IDE 文件路径及 20112 模块资源请求，未触发页面 JS 异常。文档源码登记清单与实际四个 ESM 注册函数及本地资源路径相符。

## 最终证据与重跑

| 验收组 | 最终结果 | 主要证据 |
| --- | --- | --- |
| 原库三分类、搜索、键盘、1440/768/390 滚动与缺主控提示 | PASS | `extensions-baseline/results.json`、`library-modules-*.png` |
| 三真实主控与数字/模拟/触摸 IO3 差异 | PASS | `controller-pins.json` |
| 六模块工具箱、真实块/生成器、菜单及重复选择 | PASS | `module-registration.json` |
| 鼠标真实拖新块、原下拉编辑 IO4 | PASS | `fix-validation-session-40925.json`、`mouse-drag-edited.png` |
| 条件/语句/嵌套注释组合代码 | PASS | `all-modules.ino`、`module-combinations.png` |
| 共同引脚切换与不兼容板保护 | PASS | `compatible-final-results.json`、`native-device-workspace-guard.png` |
| UI POST/GET、PUT/GET、fresh reopen、实际下载导入、素材身份 | PASS | `ui-export-final-results.json` 中 top toolbar 项、`asset-identity-map.json`、`ui-api-{created,updated}.ob`、`ui-export.ob`、`fresh-ui-api-reopen.png` |
| 未知三种 ID、别名、普通/新项目清理 | PASS | baseline 对应项；`fix-validation-session-40925.json` |
| 加载/导入真实资源失败回滚、重试、busy-save、快速点击 | PASS | `fix-validation-session-40925.json`、`actual-{resource,import-resource}-failure-rollback.png` |
| 当前主控支持过滤、模式提示和上传模式切换 | PASS | baseline 对应项 |
| 原 pen/music 实际 VM 执行 | PASS | `stage-execution.json`、`stage-pen-music-executed.png` |
| 本地资源与接入文档一致、无旧路径/20112 模块资源依赖 | PASS | `extensions-baseline/network.json`、`module-registration.json`；代码登记对照 |
| E1：IO3→Aijite 拒绝、保全、fresh reopen 后继续编辑 | PASS | `extensions-switch-repro/repro.json` 的 pin3 |
| E2：ESP32 串口→Uno 拒绝、保全、fresh reopen 后继续编辑 | PASS | `extensions-switch-repro/repro.json` 的 serial |

表中未指定目录的文件位于 `tests/evidence/extensions-independent/`。`ui-export-final-results.json` 保留当次运行中的历史选择器超时，只有 top toolbar 项属于该文件的最终结果；主控切换最终结果以 `compatible-final-results.json` 为准。`fix-validation-session-40925.json` 从该次已捕获进程 stdout 逐项归档，标明来源。`results.json` 是最后一次定向运行，不是全矩阵累计结果；`FAIL-*.png` 与 first-run/baseline 记录均作为过程证据保留，不能据其文件名将已修脚本问题再次判为产品失败。

完整复现：

```powershell
node tests/extensions-independent.mjs
node tests/extensions-switch-repro.mjs
```

定向示例（PowerShell）：

```powershell
$env:CFZN_TEST_FILTER = 'compatible controller switches|top toolbar'
node tests/extensions-independent.mjs
Remove-Item Env:CFZN_TEST_FILTER
```

`CFZN_TEST_URL` 可改预览地址，`CFZN_BROWSER` 可改主脚本浏览器路径；默认使用本机 Edge。主脚本需要 API build 产物、网页预览，不会安装依赖或停止已有服务。最小切换脚本只进行本地导入，不写 API。

## 脚本排错、清理与剩余限制

- 鼠标脚本曾在 flyout 动画结束前取坐标，后改为稳定后拖拽；IO4 改用旧 Blockly 的 `.goog-menuitem-content` 真实文本控件，最终已通过。实际组合项目用真实 Blockly XML API 建立连接，未把 XML 构建冒充鼠标操作。
- 导出重新导入曾只等 VM 设备清空，早于父界面 new action 完成；已增加外层按钮可用等待，实际下载文件导入复测通过。原设备菜单入口超时系原版上游“工作区非空”保护，按实际 DOM 更正断言后通过。两项均未作为新产品缺陷派修。
- 本次浏览器与临时 API 均已关闭，正常运行的临时存储均按脚本删除。一次中断运行遗留 `C:\Users\YUUMEI\AppData\Local\Temp\cfzn-independent-extensions-8CO4BS`；自动审批以策略阻止删除，未换工具绕过，目录保留。用户服务和项目未改；网页/后端业务代码、根配置和共享契约均未修改。
- 编译、烧录、USB/串口实机与传感器/执行器电气行为不在本轮，未验证，也未声称硬件通过。此轮未重跑历史串口 mock 单测。
