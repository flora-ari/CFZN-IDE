# Mode UI v0.3 独立验收

日期：2026-11-10（Asia/Shanghai）。本轮仅修改 tests/，没有修改产品代码、根配置或契约，没有递归委派。

## 当前结论

**最终结论：通过，未解决本轮产品缺陷 0 项。** `editor-XlMzboaF.js` 的五组聚焦功能检查通过；主控发现的 1100px 模式按钮裁切已由前端修复。最终 `editor-B3v_28-W.js` 对 FireBeetle/ESP32 两板、编程/上传两视图的模式按钮边界补测全部通过；最终构建再次独立确认 178 个 VM webpack 模块与固定上游逐模块字节相同。

本轮采用功能与最终CSS分批验收，不把旧的“相邻节点无重叠”断言代替“模式按钮完整在视口内”。最终布局脚本明确断言两按钮 x≥0、right≤1100、y≥0、bottom≤48、elementFromPoint中心命中自身。四种板/模式组合均通过，实际查看截图后确认上传按钮没有裁切。

实际读取 dist/openblock.html 及浏览器页面，未引用主控历史 C4WBPtsj 构建作为当前证据。前端 HANDOFF 在启动时仍是 Hardware v0.2 段；按冻结 Mode UI 附录及当前源码进行测试。

## 命令与独立性

```powershell
node tests/mode-ui-v03-independent.mjs
node tests/mode-v03-vm-boundary.mjs
node tests/mode-v03-layout.mjs
```

主脚本复用本测试角色的浏览器/静态服务/隔离 Nest API 基础设施，新增 Mode UI 断言；没有运行开发自验脚本，也没有盲目运行上轮未完成 hardware-v02-independent.mjs。

API 与网页均为自建随机端口；项目仅写入 mkdtemp 隔离存储。所有对 3002 hardware URL 的浏览器请求由独立 mock 拦截，无真实上传，不打开 COM3。项目 HTTP 是真实 Nest API；串口是明确模拟的 Web Serial streams；VM/Blockly/Monaco 与舞台均为真实产品实例。获取 VM/Monaco 通过公开 GUI integration hook 回调，未使用 Fiber。为了编辑 Monaco 手稿，调用所挂载真实 editor.setValue，另验证实际 view-line 可见文字。

## 已通过场景

| 场景 | 结果与证据 |
| --- | --- |
| ESP32 / FireBeetle 主控名称中心点击、高亮 | 名称本身实际 click，committed 卡片 aria-pressed=true、边框 2px；两板进入编程/上传及造型/声音页正常 |
| 真实舞台执行与上传块保留 | 加载六模块，真实连接 Arduino hat→蜂鸣器 PIN25→on；切编程增加实际 motion/looks/sound 脚本，RUN 后 x 增加17、造型变更、真实 sound_play primitive执行；仅删除测试舞台脚本后回上传，原硬件积木图一致 |
| 自动/手动草稿与实际 Monaco | 自动只读且生成 PIN25；手动编辑标 dirty，自动返回生成源码，再回手动保留草稿；隐藏/显示代码区域后真实 Monaco view-line 含手稿文字 |
| 实际项目 POST/GET、PUT/GET、新 context重开 | 六模块、完整造型/声音、programMode 和 cfzn/editor.json 经真实 API保存；POST v1 保存编程模式，PUT v2保存上传模式及新草稿；GET与实际PUT body精确字节一致；独立导出只比较内容而不比较ZIP时间戳；全新 context从真实项目列表打开v2，手稿/模块/素材身份SHA-256/积木连接保持、dirty=false |
| 非法 metadata 保全 | JSON破损、version99、manualSource超过1MiB三个变体从真实Import/filechooser导入，被拒绝；documentId/editVersion/title/dirty快照保持，完整项目语义及metadata保持。未把服务端不校验前端metadata视为后端缺陷 |
| 旧档与新建 | 删除 ZIP cfzn/editor.json 后导入，自动生成成为默认，进入手动不继承旧草稿；新建后上传/手动同样不继承 |
| 模式与共享串口无副作用 | 模拟WebSerial实际选择连接后切编程/上传，open/close/write计数不变，无自动握手/TX；上传终端显示共享RX |
| 当前源码、模拟上传释放和busy | 手动源码精确提交到mock builds；uploads POST前断言 port已关、reader/writer锁均释放；作业upload期间两模式按钮禁用；取消等待终态cancelled；上传不标saved，dirty保持 |
| MenuBar功能回归 | 六原生项目按钮仍存在，1440/1100相邻菜单节点不重叠；页面error=[]。最终需要另加模式按钮viewport边界断言，不能以此旧检查替代 |
| 禁止VM修改 | 解析固定npm上游source map确定178个openblock-vm相关webpack模块，逐模块SHA-256比较dist实际bundle，全相同；23处hooks均GUI src/路径，无CFZNDeviceFactories注入 |

## 证据

通过功能轮次：`tests/evidence/mode-ui-v03-independent/2026-11-10T03-21-28-198Z/`。

- results.json：五组PASS；calls.json：真实项目HTTP与mock hardware请求；build.json：实际bundle。
- saved-v2.ob、fresh-http-reopen.png：全新上下文真实项目列表重开；layout-1440.png、layout-1100.png：修正前布局。
- `vm-boundary/result.json`、`vm-boundary/vm-byte-comparison.json`：178模块比对详情。
- 最终布局：`2026-11-10T03-24-35-263Z/results.json`、`build.json`、`FireBeetle-ESP32-E-{programming,upload}-1100.png`、`ESP32-{programming,upload}-1100.png`，2组PASS，覆盖4组合。此脚本仅补布局，不重复功能/HTTP矩阵。
- 首轮 `2026-11-10T03-20-19-244Z/` 保留脚本排错：首次错误比较独立ZIP导出的DOS时间戳；旧档等待选中了页面另一组tabs。更正为同一次PUT body精确字节 + 内容语义比较、代码来源tab限定后通过，均未作为产品缺陷派修。

## 收尾与边界

功能轮次结果已完整落盘；关闭测试浏览器时未及时返回。包含进程关闭与临时目录删除的清理命令被自动审批以“blocked by policy”拒绝；未换方式删除。随后独立终止了明确归属的测试进程35744及其子树，保留临时目录 `C:\Users\YUUMEI\AppData\Local\Temp\cfzn-hw-independent-aGKtmZ`，待主控处理。没有停止用户5173/3001或主控3002，也没有操作COM3。

最终布局测试同样在结果落盘后浏览器关闭等待，独立终止明确自有进程48660及其子树；其临时存储路径记录于该轮environment.json。本轮未再申请或尝试删除目录，未使用替代方式绕过自动审批。测试Node进程终止后其随机HTTP服务一起退出。

本轮不做物理串口、真实编译/烧录复测，不宣称模拟上传证明实机通过。Hardware v0.2上一轮未完成验收仍未在本轮补完；不把本报告扩展为全部历史硬件功能通过。
