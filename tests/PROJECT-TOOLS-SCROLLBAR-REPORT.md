# 项目工具组滚动条聚焦验收

2026-11-10，Sol low，Edge headless。最终 editor-C1Cpk8eD.css SHA256：6BD624A530DCD93C55491D58953ADF69BCBE1FCB91DCF368192610392AD7A333。仅复用现有隔离浏览器设施执行临时检查，未改产品、未跑历史回归。

结果：聚焦检查通过。

| 窗口宽度 | 工具组client/scroll宽 | 横向wheel后scrollLeft | Tab至保存后scrollLeft |
| --- | --- | --- | --- |
| 800 | 111 / 302 | 191 | 115 |
| 1000 | 293 / 302 | 9 | 0（五按钮本已可见，仅状态区溢出） |
| 1440 | 302 / 302 | 0，无多余bar | 无需滚动 |
| 390 | 72 / 302 | 230 | 169 |

800/1000/390逐次Tab可聚焦项目、新建、导入、导出、保存，每个获得焦点时完整进入工具组可视区。所有尺寸MenuBar高度48px，标题到工具组6px。工具组scrollHeight=clientHeight=48，无纵向溢出；窄屏overflow-y:hidden，宽屏overflow:visible且内容无溢出。390原菜单整体宽度问题不纳入本轮修复，工具组本身仍可滚动。

浏览器computed style确认横条高度6px、thumb圆角6px、灰色rgba(144,147,153,.3)、透明轨道；悬停时读取到灰色.5。CSS伪元素选择器均限定.cfzn-project-tools，箭头隐藏。真实Tab后保存按钮焦点轮廓可见（截图），未改变其他区域滚动条。Edge验证WebKit分支；非WebKit thin回退仅作源码核对，未执行跨引擎测试。

最终证据：tests/evidence/project-tools-scrollbar/2026-11-10T08-07-34-315Z/results.json；截图scrollbar-800.png。首次断言错误要求1000px保存也必须发生滚动，已按实际五按钮可见条件纠正；保留原始证据。临时检查文件已移除，无新增长期测试框架。

隔离随机端口服务正常退出、临时项目目录已清理。未操作用户5173/3001/3002、COM3或硬件。
