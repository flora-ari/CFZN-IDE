# 音频解锁与标签页图标发布

日期：2026-11-24（Asia/Shanghai）。已发布到 https://ide.xiaodaiyang.top/ 。

## 结果

旧 `startaudiocontext` 独立依赖在音频上下文 suspended 时每动画帧调用 resume，导致用户报告的重复策略警告。本次仅替换固定模块 520 内部实现：状态事件确认 running，可信用户激活时同步恢复，同上下文合并监听与在途尝试，失败等待下次手势，完成/关闭/卸载清理。保留原 Promise/可选 callback、静音解锁兼容和初始化顺序。没有修改 VM、Blockly、全局 AudioContext/console 或浏览器策略。最初创建受限上下文仍可能有浏览器自身的单次提示。

新增项目资产 `apps/web/public/branding/ccraft-tab-icon.png`，与用户提供 PNG 原字节一致，1,657,390 字节，SHA-256 `c4375f067f4da96b6fb4b14a6c4ede4df0bb7a440f840e35c9a33680557292cb`。首页和编辑器两份 HTML 使用新 PNG favicon，顶部 Logo 原字节保留。

## 验证

- 前端 typecheck、生产 build、全部 171 项测试通过，其中 8 项音频聚焦测试。
- 独立行为场景、生产资源与最终发布包审计通过，见 [独立报告](../tests/AUDIO-AUTOPLAY-20261124-REPORT.md)。178 个 VM、15 个 Blockly、三份许可字节一致。
- 主控真实浏览器对照加载原始依赖：未操作时 native AudioContext 仍为 suspended，resume 调用从 25 增到 3501；原始页面随后关闭。
- 主控加载修复后的实际生产依赖，native AudioContext 和阻止状态夹具在空闲观察期间均为 suspended、恢复调用保持 0。真实鼠标点击与独立键盘页面操作后均为 running，恢复调用各 1，测试音源启动各 1，错误数组为空。见 [浏览器记录](../tests/evidence/audio-autoplay-20261124/browser-harness.json)。未放宽自动播放策略，夹具不伪装为真实原生上下文结果。
- 主控实际最终 IDE 生产包正常启动，两份 DOM favicon 引用均正确；声音编辑器啁啾资源可编辑并预览，播放控件进入“停止”状态。见 [IDE 浏览器记录](../tests/evidence/audio-autoplay-20261124/ide-browser.json) 和 [截图](../tests/evidence/audio-autoplay-20261124/ide-sound-preview.jpg)。未测量扬声器实际可听输出，未直接执行工作区积木声音链，不将其报告为实测通过。
- 线上 HTTPS 首页/编辑器/入口 JS/CSS/新旧 PNG 与最终发布包逐字节一致，API health 正常；GUI gzip 下载解压后 SHA 与本地相同，条件请求 304。见 [线上核对](../tests/evidence/audio-autoplay-20261124/deployed-verification.json)。
- 线上 IAB 页面自动读取再次超时，未记作线上真实浏览器完整验收。源码行为、本机真实生产包与线上字节相等分别有证据；HTTP 成功不替代线上渲染结论。

## 发布范围

工作区同时存在独立 CCraft Link 集成改动，本次以已核对与线上相符的 `20261124T025043Z-cfe8ac8d` 生产包为基线，仅合入已重新构建的音频 GUI、favicon PNG 与两 HTML 图标标记，避免带入尚在并行开发的 Link 行为。独立审计最终 2,259 文件中 2,250 与基线相同，全部 36 个 API 文件原字节一致；其它差异仅为上述文件、vendor manifest 发布补充和压缩/发布元数据。所有 284 个 gzip 副本均解压一致。

- 发布：`20261124T081631Z-cfe8ac8d`。
- 包 SHA-256：`ee3f4bdf8594fd9d602850e9f2797997308bc65f635540d3fd06561822085ca5`。
- GUI SHA-256：`1bb1133602dfc5044f00404ea246321ad4bec5071a9baa482ec6fa8356ffb0d2`。
- 服务器发布目录：`/home/wwwroot/cfzn-ide/releases/20261124T081631Z-cfe8ac8d`，原版本已备份。

仅清理本次主控创建的 QA 进程，不操作用户串口或 CCraft Link 服务。用户保存作品后重新加载页面即可取得新资源；旧控制台历史记录不会因部署自动清空。
