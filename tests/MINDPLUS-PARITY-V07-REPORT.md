# Mind+ parity v0.7 独立验收报告

2026-11-12 10:54 Asia/Shanghai。既定五项功能的独立 dev/dist 验收完成；搜索发现的 undo/redo 缺陷经主控局部修复后复验通过。最终选定证据合并去重为 **68 项检查通过**（含各组 pageerror 检查）。这不是完整 Mind+ 或实体硬件等价声明。

## 最终冻结及版本沿用

最终 GUI SHA256：`C0C8A51D40D0EEE40C84541601915CC83D1454BF2D35ADFDF320F016CF1699B3`。
Editor SHA256：`9D1FC47EEBFA3242C64554044965DE6C6BC2D7FB168007B7693C3A33AE323B2B`。
CSS SHA256：`C3A8F4AEE438E128C6968B34538472D29AA3998A6A784574EEFF19F02347B091`。

最终七个 manifest 文件逐项独立复核相符，见 evidence/parity-v07/final-verification.json。初始 GUI 为 `8F5A87B80FAB2F82955E4DC9B4A22040EBAB49E3374FBC676AB8B43C253CC01C`；局部重冻只改 GUI updateToolbox 的同步 recordUndo 保存/恢复。保存、服务、终端及 dev 原有加载筛选证据依主控授权沿用初始冻结，未冒称重跑。其余 app、editor、CSS、helper、shortcut 字节未变。

开发交付的初始 build、91/91 单测及局部 undo-fix-build PASS 保存在 apps/web/evidence/mindplus-parity-v07；这是开发证据。局部 GUI 修复后没有重跑无关的全部 91 单测，不作相反声明。

## 独立浏览器结果

每组使用新 Edge context、自建随机 loopback 端口和私有项目存储。真实项目 POST/PUT/PATCH 调用现有 apps/api/dist/createApp。Vite dev 和冻结静态 dist 均真实加载。硬件能力/作业和 Web Serial 明确模拟，未调用实体端口或编译器。

证据目录均位于 tests/evidence/parity-v07/，每个目录有 results/network/page-errors/console-errors/environment 和失败或最终截图。

| 功能 | dev | dist | 选定最终证据目录 |
| --- | --- | --- | --- |
| 快捷保存 | 7/7 PASS，初始冻结沿用 | 7/7 PASS，初始冻结沿用 | 02-31-29-369Z-dev-save；02-32-14-334Z-dist-save |
| 原生积木搜索 | 8/8 PASS，局部重冻 | 8/8 PASS，局部重冻 | 02-51-12-011Z-dev-search 中七项 PASS + 02-52-15-375Z-dev-search 的字段/下拉替代结果；02-52-04-723Z-dist-search |
| 本机服务分层 | 9/9 PASS，初始冻结沿用 | 9/9 PASS，初始冻结沿用 | 02-32-03-879Z-dev-service；02-31-01-149Z-dist-service |
| 共享终端 | 5/5 PASS，初始冻结沿用 | 5/5 PASS，初始冻结沿用 | 02-30-01-959Z-dev-terminal；02-28-48-928Z-dist-terminal |
| 已加载筛选 | 5/5 PASS，原四项沿用 + 新舞台补验 | 5/5 PASS，局部重冻 | 02-31-11-986Z-dev-loaded + 02-52-32-823Z-dev-loaded；02-42-58-541Z-dist-loaded + 02-49-42-620Z-dist-loaded |

以上目录名称均带前缀 `2026-11-12T`。最终选定运行的 page-errors.json 均为空；诊断组刻意制造离线/协议/端口失败，相关网络错误不伪装成产品 pageerror。

### 保存

真实 iframe 标题最后编辑后 Ctrl+S 首次 POST；父页面焦点 Ctrl+S 后续 PUT；原生积木 text 字段及原生注释最后输入入档；实际 Monaco 键入手稿保存在 cfzn/editor.json；父页面主动移焦后仍留父页面。repeat/composing/Alt/Shift 不额外写入。真实独立 API 外部 PATCH 提升 revision，随后快捷保存返回 412，保全本地 VM 图并显示冲突恢复入口。ZIP 含 project.json、实际素材文件和手稿；不是截图推断保存成功。

### 搜索及有效撤销/重做

中文/英文匹配、明确无结果、清除/Escape/关闭类别恢复、三轮重建无主状态/图/XML/undo 污染；没有持续 indexing。真实动态变量、列表及含 `%n`、`%s` 参数的过程进入原生 flyout。用 Playwright mouse down/move/up 真正拖出 procedures_call，VM 登记真实调用，保留 mutation、数字与字符串 shadow；没有用索引内部数组替代 UI 验证。

原生字段编辑器保持 FIELDKEEP，随后真实变量变更触发重索引，350ms 后输入仍打开、值未变。原生 looks_gotofrontback.FRONT_BACK 下拉也在动态重索引后保持打开及相同内容。最终记录保留本体字段/菜单，没有修改 Blockly prototype。

有效 undo/redo 独立闭环：真实 text 字段 BEFORE_UNDO→AFTER_REDO，Undo 形成非空 redo；query/clear/Escape/close 后两栈 toJson 逐项一致，GET_STATE/VM 图/XML 一致；实际 Redo 回 AFTER_REDO，实际 Undo 回 BEFORE_UNDO。见 undo-redo-preservation.json。

ESP32 注释模块实际加载并能搜到真实 moreComments 积木。真实 native 模板 arduino_serial_multiSerialPrint（NO/VALUE.text/EOL）接到实际原生 Arduino 启动帽，workspaceToCode 的 FIRST_PARAMETER→SECOND_PARAMETER 改变实际生成代码；编程模式搜索保留 disabled=true 且含 value 的原始结果 XML，未被索引启用。见 disabled-value-results.json / parameter-generation.json。

locale 控制采用相同非空 motion 图、固定 IDs 和 x439.5/y201.5。无搜索 en↔zh-cn 控制组与带搜索处理组的最终完整 VM 图相等；每一次搜索前后完整 snapshot（含 editVersion/undo/XML/VM）严格一致。首次原生 locale 控制自身有 editVersion +1、重复处理为 0，原始值保留在 locale-control.json；未将原生首次 locale 行为误判为搜索污染，也未放宽单次搜索无损断言。

### 服务和终端

服务 UI 实测 online、网络 offline、错误 protocol/structure、缺 core、仅 ports 失败、有界 timeout；服务状态独立于 Web Serial、显式端口和当前文档。普通健康检查只发 GET。专门模拟 running build/poll/cancel：健康离线后 job 仍 running/busy；取消仍占有直到模拟后端实际终态，不产生假退出。更底层 epoch/乱序机制引用交付的 30 单测，不另宣称全部由浏览器重演。

终端使用正常连接入口和模拟 ReadableStream/WritableStream：逐字节 UTF-8、成功 TX、隐藏期 RX、切模式后日志/发送草稿/格式/行尾保留、暂停丢弃、en/zh-cn remount 保留、open/reader/writer 始终各一、显式清空保留连接、拒绝写入不记 TX。没有将模拟端口称作 COM3。

### 已加载

主控/模块按真实 currentDevice/VM loaded 状态过滤；默认全部、各分类记忆、模块加载/移除立即刷新，取消过滤不卸载，空结果清除恢复；native device 菜单和 extension 主控入口共用过滤且完整目录 20 项。过滤操作不增加 dirty。

舞台通过原生画笔卡片 image 实际加载 pen；manager.loaded 包含 pen。勾选已加载后仅画笔、音乐消失；原生关键词与已加载交集无结果可清除全部筛选，音乐恢复，pen 仍加载，纯过滤 GET_STATE 不变。dev/dist 均有独立 PASS。

## 缺陷与测试工具归因

初始搜索工具箱刷新向主 undoStack 塞入 toolBoxFinish(recordUndo=true)，空图三轮从 2→12，破坏 redo。主控确认并派局部 GUI try/finally 修复；最终有效 Undo/Redo 闭环通过。原证据 02-30-23-462Z-dist-search/undo-events.json 保留。

测试工具早期失误均保留失败证据，并由具体原因修正后短复验替代：连续 flyout 的隐藏分类块不能当可见结果；动态变量 XML 必须 type；静态 .mjs MIME 不能是 octet-stream；舞台名称是 learnMore 链接并 stopPropagation，实际 card image 才加载；原 motion_goto.TO 是 value/menu shadow，不能 getField；游离打印块不生成启动代码，必须接原生启动帽。上述 fixture 失败不计产品缺陷，不并入最终 PASS。

## 字节边界与清理

独立运行 tests/parity-v07-boundary.mjs：从固定上游 tgz 重新读取原始 bundle，与最终 dist 按模块 exact bytes 比较，178 VM/15 Blockly 全相同；身份来自开发 sourcemap 清单，字节比较独立执行。全部 hook source 均在 GUI src。见 independent-upstream-byte-comparison.json。

最终 36 个本轮临时存储/缓存目录均不存在，所有记录随机 HTTP/API 端口均无监听，浏览器/Vite/HTTP/API 均由 finally 关闭。final-verification.json 中七个冻结文件 hash 全相符、remainingTemps/randomPortListeners 为空。没有启停用户 5173/3001/3002，没有打开 COM3，没有触碰旧 REA 临时 profile。

范围为本轮五项和指定短回归，不扩大为所有主控/素材/硬件/远程市场的完整组合矩阵；真实硬件及完整 Mind+ 功能等价未验收。
