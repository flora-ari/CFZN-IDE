# 作品名与项目工具组整体靠右聚焦验收

2026-11-10，Sol low，Edge headless。最终 editor-CrSKtmGm.css SHA256 CADD3AB820E12F68B04ECC727A39246F4143769D16FBE8AC84C4041A66EEE17B；editor-oEvEZYYX.js。最终1组通过，未发现本轮产品缺陷。

| 窗口宽度 | main-menu与作品名之间空白 | 作品名→工具组 | 工具组→tail | tail右边界 |
| --- | --- | --- | --- | --- |
| 1440 | 36.984px | 6px | 6px既有margin | 1440 |
| 2560 | 1156.984px | 6px | 6px既有margin | 2560 |
| 800 | 0 | 6px | 6px既有margin | 800 |
| 1000 | 0 | 6px | 6px既有margin | 1000 |

桌面增加的1120px完整进入作品名前空白，tail margin-inline-start实测0；工具组与tail间无额外伸缩空白。桌面作品名容器188px、输入180px，五项目按钮和状态保留。四种尺寸MenuBar均48px；工具组无纵向溢出，scrollbar高度与thumb圆角仍6px。

800px横向wheel后scrollLeft191，逐次真实Tab依次访问五按钮，到保存时scrollLeft115且完整可见。1000px横向wheel后scrollLeft9，五按钮原已完整可见，Tab到保存无需滚动。宽屏工具组clientWidth=scrollWidth=302，无额外bar。浏览器pageerror为0。

最终证据：tests/evidence/project-tools-right-align/2026-11-10T08-13-08-578Z/results.json；2560顶部截图menu-2560.png。首次fixture错误假定1440空白应大于100px，实际布局只需剩余空白位于作品名前，已纠正为正值并验证2560相对增加1120px；原证据保留。

复用隔离浏览器/API helper，未执行历史API、串口、消息或导出回归，未修改产品。随机端口测试环境正常退出、临时项目目录清理；临时检查脚本移除。不操作用户5173/3001/3002及COM3硬件。
