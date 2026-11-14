# 模块库角标定位独立验收报告

日期：2026-11-12。冻结后执行；未改产品。有效 dev/dist 两组共 6 PASS、0 FAIL，各 0 pageerror。

| 环境 | 隔离地址 | 结果 | 清理 |
| --- | --- | --- | --- |
| dev | http://127.0.0.1:50797 | 3 PASS / 0 FAIL | browser/context关闭；监听退出=True；temp删除=True |
| dist | http://127.0.0.1:61881 | 3 PASS / 0 FAIL | browser/context关闭；监听退出=True；temp删除=True |

2560px 宽屏六列一行，800px 窄屏两列三行。六张模块卡的角标都是外卡直接子节点；计算 top/right 均为 0px；相对外卡边框 top/right 实测均为 2px，等于卡片边框。未选择主控板、兼容当前主控、不支持当前主控三种状态定位一致，pointer-events:none、z-index:3。实际点击 FireBeetle ESP32-E、加载有源蜂鸣器、移除有源蜂鸣器和切换 Micro:bit 均通过；选中属性加载时存在、移除后消失。

Logo 仍为 /branding/IDE.png，alt=CFZN IDE，120×40px；编程模式/上传模式入口均保留。

本轮未实测浏览器缩放。首 dist fixture 打开非persistent headless Edge 的 edge://settings 后页面/context关闭，后续报 target page/context closed，非定位断言失败。错误证据保留于 tests/evidence/badge-alignment/2026-11-12T05-54-59-664Z-dist/；该组资源清理后删除 settings 尝试，仅复跑有效 dev/dist 两短组。本轮只验证真实viewport宽窄布局，不引用前轮Logo缩放证据。

API全部模拟拦截；navigator.serial空设备且禁止requestPort，硬件/用户端口3001、3002、5173拦截，非本轮网络阻断。未操作COM3、用户服务、旧temp；无真实硬件测试。

最终SHA256与冻结值一致：

- `assets/editor-BYzD-xt1.js`：`9D1FC47EEBFA3242C64554044965DE6C6BC2D7FB168007B7693C3A33AE323B2B`
- `assets/editor-BYnA3_tl.css`：`DB20BD560C64108CBB498301BF570AD5897393B6048B6D4A1799C45ACF49B90E`
- `openblock-vendor/openblock-gui.js`：`534E11D74533CF04D869E94FCFFC4D96BDB945236358542B654D1B0DEC2EFDA9`
- `branding/IDE.png`：`18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F`

有效证据（含结果、请求、pageerror、环境、清理和gray-2560/gray-800/unsupported截图）：

- `F:\CFZN\CFZN-IDE\tests\evidence\badge-alignment\2026-11-12T05-55-47-884Z-dev`
- `F:\CFZN\CFZN-IDE\tests\evidence\badge-alignment\2026-11-12T05-55-34-736Z-dist`
