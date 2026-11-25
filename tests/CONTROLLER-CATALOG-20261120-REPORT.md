# 主控目录与工厂支持范围独立验收

2026-11-20（北京时间），生产构建 `editor-0hVWSKVB.js` 与隔离 Vite 开发实例均通过。本轮合计 7 组检查，Edge 157.0.4341.60 页面异常为 0。

| 范围 | Dist | Dev | 观察结果 |
| --- | --- | --- | --- |
| 两个主控入口 | 通过 | 通过 | 实际点击左下扩展入口与顶部设备入口，20 项 ID 顺序等于共享 JSON 清单，名称逐项等于历史已验收目录。主控页无“全部”“主控板”或类型控件。Nano、NodeMCU 搜索及清空恢复全部目录，当前模式按原生元数据筛选，已加载筛选能定位选中的 Nano。模块页选择“传感器”后切回主控页，20 项主控仍完整显示。 |
| 模块分类和内置兼容范围 | 通过 | 通过 | 模块页保留“全部、传感器、执行器、功能模块”。Nano 下全部浏览出现六个内置模块，均不可添加，各支持列表仍为五板范围，列表中没有 Nano。 |
| 工厂真实保存 | 通过 | 通过 | 当前主控 Nano 时打开新建工厂，20 个复选框名称和顺序与 IDE 未筛选目录一致，默认仅 Nano 勾选。创建无引脚参数的指令模板，代码为 `digitalWrite(13, HIGH);`。从界面点“保存模块”返回 201，按 ID 重读和详情均保留 Nano 范围。 |
| 创建新版本 | 通过 | 通过 | 从原记录创建新版本，按显示顺序逐项勾全 20 个主控后保存返回 201 和新 ID。返回的 `supportDevice` 顺序严格对应实际勾选顺序，逐项核对全部 ID。新 ID 重读与保存响应一致。 |
| 真实积木与作品恢复 | 通过 | 通过 | 加载 Nano 私有模块，从原生工具箱实际拖入积木，再通过 Blockly 工作区接口连接 Arduino 开始积木，生成 digitalWrite。工具栏保存完整 .ob 返回 201，HTTP 下载与提交字节一致。同一浏览器上下文新页面从项目列表打开，主控 Nano、私有模块 ID、真实积木 opcode、素材和生成代码均恢复。 |
| 五板记录与会话权限 | 通过 | 通过 | 构造原五板支持范围的 schemaVersion 1 模块，经真实 API 保存并按原数组重读。第二个隔离浏览器上下文目录为空，读取 Nano、全 20 项和五板记录的 ID 均返回 404。 |

工厂 checkbox 的 HTML value 使用浏览器默认值 `on`。测试通过界面标签和顺序逐项操作，并对比保存响应内相同顺序的真实 ID，验证控件与持久化 ID 的关联。

生产入口 SHA-256 为 `8d8675dc3037075ac65f7e209bd991f7627f73c58580fa243ea101fe7e2c07fd`，运行前后相同。两个网页实例通过保留 Host 的同源代理连接真实 Nest，测试存储和 Vite 缓存位于测试专用临时目录。运行结束关闭自建服务、浏览器并清理临时目录。覆盖范围为浏览器编辑、Arduino 生成和项目存取，实体硬件、编译与烧录未执行。

复跑命令为 `node tests/controller-catalog-20261120.mjs`。

- [运行记录和保存响应](evidence/controller-catalog-20261120/result.json)
- [生产主控目录](evidence/controller-catalog-20261120/dist-controllers.png)
- [生产工厂 20 项支持选择](evidence/controller-catalog-20261120/dist-factory20.png)
- [开发主控目录](evidence/controller-catalog-20261120/dev-controllers.png)
- [开发工厂 20 项支持选择](evidence/controller-catalog-20261120/dev-factory20.png)
