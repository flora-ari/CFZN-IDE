# 积木定义弹窗独立验收

2026-11-18（北京时间）。生产构建 `editor-B3qINhuN.js` 的 18 项独立检查通过，页面异常为 0。测试使用 Microsoft Edge 157.0.4341.60、随机回环端口上的真实 Nest 应用和临时数据目录。官方库搜索由真实 API 解析包含 Servo 1.2.1 和 1.2.2 的固定官方索引样本。

| 范围 | 检查 |
| --- | --- |
| 新增与编辑 | 编程模式无板时从空表开始。Function、Output、Boolean、Hat 都打开 540px 的 Modify Block，并显示真实 Blockly 声明、五个新增按钮、默认展开的参数区与 Block ID。OK 后才入表。Cancel、关闭按钮和 Escape 放弃本次修改并归还焦点。重复 ID 留在弹窗内报错。Edit 保留原行和已提交的生成器代码。 |
| 声明积木颜色 | 四种声明区均无空工具箱或飞出面板。浏览器截图中，每种积木的左右内部采样区均以主色 `#2718ff` 为主，SVG 保留辅色 `#f10087` 描边。生成预览依然可从工具箱实际拖入积木。 |
| 参数与引脚 | 在原生字段内直接改名，通过 Blockly 垃圾桶删去中间数字参数。相邻文本、数字与布尔默认值保留。自定义 CSV 默认项将显示名和代码值整对移到首位。设备引脚模式覆盖数字输出、模拟输入和数字输入，三个实际下拉列表与 Uno 的可信引脚映射一致。 |
| 独立弹窗 | Arduino 头文件和 setup() 在独立遮罩内使用 Monaco。行内积木逻辑用另一遮罩，验证 Cancel、OK 和只读生成示例。“Arduino 库管理器索引”使用独立遮罩，点添加或更换才提交精确版本。 |
| 真实 Blockly 与 Arduino | 在生成预览实际把积木从工具箱拖入独立工作区。关闭后编辑状态和项目 JSON 一致，临时积木类型清除。在主工作区拖出模块积木，验证文本及数字原生 shadow、Boolean 连接限制，去掉 shadow 验证默认值回退，连接三个子块后用 Arduino 生成器读取实际子块代码。 |
| 保存与恢复 | 私有版本保存返回 201，并保存精确引脚来源和 Servo 版本。真实作品 HTTP 上传和下载字节一致。作品只引用不可变模块 ID。隐藏旧版本后，同一所有者在新页面仍能恢复原积木、连接和素材。断开覆盖默认值的子块后，文本和数字 shadow 以原 ID、原值再现，Arduino 生成器重新使用 `"hello"` 和 `7`。 |
| 旧格式与会话隔离 | 旧格式归档 fixture 包含原来的数字字段、文本字段和显示名与代码值不同的下拉字段。通过真实 API 打开、生成、导出并验证默认项编辑。第二个浏览器上下文的目录为空，读取其他会话的模块版本返回 404，打开引用项目失败时保留当前内容。 |
| 窄屏与工作台 | 640px 工作台上下排列，验证桌面设置和积木表能独立滚动。390 × 844 下弹窗和遮罩无横向溢出。底层 OpenBlock 文档的既有宽度超出在开关弹窗前后一致，iframe body 隐藏横向溢出。 |

早期构建 `editor-Cyvoi-Fo.js` 能保存含三个子块的作品，但同一所有者另页打开时报“模块项目积木未能完整恢复”。附件保留了故障时的完整归档、原模块定义和错误画面。修复构建已用同样的存取路径重新验证，保存时带有被子块遮住的文本和数字默认积木。 [故障归档](../.runtime/custom-module-independent/same-owner-reopen.ob) · [对应的私有模块定义](../.runtime/custom-module-independent/same-owner-definition.json) · [修复前错误](../.runtime/custom-module-independent/same-owner-reopen.png)

复跑命令为 `node tests/custom-module-independent.mjs`。运行结束关闭自建服务、浏览器并删除临时项目目录。本轮覆盖浏览器编辑、C++ 生成和存取，硬件编译、烧录及实体串口未执行。

- [运行结果](../.runtime/custom-module-independent/result.json)
- [Modify Block 数字和引脚设置](../.runtime/custom-module-independent/modify-block-pin-settings.png)
- [Modify Block 390px](../.runtime/custom-module-independent/modify-block-390.png)
- [独立 Blockly 预览试拖](../.runtime/custom-module-independent/factory-preview-drag.png)
- [Arduino 库管理器索引](../.runtime/custom-module-independent/factory-library.png)
