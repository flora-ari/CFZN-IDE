# 上传端口恢复与可见操作栏独立验收

2026-11-23（Asia/Shanghai）。冻结产物为 `editor-CBb0ccAP.js` / `editor-D5NDjZiN.css`。启动恢复逻辑通过独立自动验证，相关 Node 测试 45 项与原生入口模拟 4 组全部通过。真实浏览器几何尚未验收。

| 场景 | 结果与证据 |
| --- | --- |
| 首次缺端口后恢复 | 通过实际 nativeUpload 入口产生缺端口提示，经实际渲染的端口选择器回调选择有效模拟端口，提示立即消失并显示“当前配置已就绪”。这时 POST 数量为 0，只有显式点击“编译并上传”才发出一次 builds 和一次 uploads，模拟终态 succeeded。 |
| 跨入口、关闭后重开与换板 | 模型关联设备、Profile、OS 端口及当次原因。直接经共享 controller 配置端口的连接入口路径、Profile 更换和主控往返都使旧提示失效。配置不变时相关原因保留，返回先前选择不使旧提示复活。 |
| 不同错误替换 | 无效端口配置被拒绝且实际 portId 保持原值，反馈更新为设置失败。再次启动产生的生成失败替换旧原因。工具链从不可用恢复后，已解决的旧启动失败消失。协议错误仍由当前服务状态显示。 |
| 启动就绪与守卫 | 就绪文本和按钮通过与实际 start 共用的检查派生。覆盖空代码、生成失败、编程/实时模式、忙、串口操作、残留串口所有者、失效 Profile、设备不匹配、编译/上传能力及从清单消失的 OS 端口。拒绝场景未提交作业。 |
| 结果保全 | 模拟真实作业进入 failed 后，修改选择与重新检测仍保留 job、error、日志和 restoreError。提交响应丢失时保持 busy 和“提交结果未知”，再次启动或改配置均被拒绝，隐藏弹窗也不释放作业所有权。取消与轮询中断仍由既有硬件测试覆盖。 |
| 原生入口集成 | 更新上一轮模拟夹具以加载真实 UploadProgressModel 和 makeUploadProgressView。14 类上传前失败、5 种能力/端口按钮组合及实际重新检测回调通过。按本轮契约将“恢复后保留历史启动失败”的旧断言改为提示消失，同时继续断言实际作业错误与日志保留。 |
| 操作栏结构与样式 | 元素树中四个操作按钮位于正文外的 actions 区，日志留在正文内。源码和冻结 CSS 包含视口高度约束、正文滚动、操作栏及标题不收缩、FQBN/错误换行规则。这些属于静态和结构核对。 |

浏览器尝试使用 cua_repl 创建独立隐藏 IAB 页 `about:blank`，15 秒后工具返回 `js execution timed out; kernel reset`。未取得可操作页面。1366×768、1024×600、800×600 下按钮可见性、文字实际换行、正文滚动后的按钮位置、键盘可达及缩放均未完成真实浏览器验证，需由主控的部署页验收补齐。没有生成本轮几何截图。

主控另行提供真实 IAB 新草稿的观察结果。在实际 1280×720 视口内，无端口上传提示可复现，选 COM3 后立即消失并出现就绪文案。操作按钮底边为 688px，弹窗底边为 704px，均位于视口内。该结果来自主控，独立测试会话没有操作该页面。主控尝试设置其他视口后，实际尺寸仍为 1280×720，因此这些请求尺寸未计为多视口通过，其余低高度和缩放缺口保留。

模拟脚本将当前 native-hardware.ts 转译到内存，使用真实 controller、session、上传 model 和渲染函数，React hook/元素树及不相关浏览器集成为夹具。构建和上传请求全部返回模拟作业，不连接实际执行器。本轮未启动临时网页服务，未取得实体串口所有权，未执行编译器或硬件写入。

复验命令如下。

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --test apps/web/test/hardware.test.ts apps/web/test/local-service.test.ts apps/web/test/upload-progress.test.ts
node --experimental-strip-types --disable-warning=ExperimentalWarning tests/hardware-upload-feedback-20261123.mjs
```

- [45 项前端测试输出](evidence/upload-port-recovery-20261123/frontend-node-tests.txt)
- [4 组原生入口模拟](evidence/upload-port-recovery-20261123/native-entry-simulation.json)
- [冻结产物哈希、静态样式检查和浏览器缺口](evidence/upload-port-recovery-20261123/scope-and-dist.json)
- [更新后的原生入口验证脚本](hardware-upload-feedback-20261123.mjs)
