# 积木工厂编辑弹窗后端设计

## 评审结论

现有私有模块路由和 `schemaVersion: 1` 可以承载这次弹窗调整。当前仓库的服务端校验器已接受三个新类型、严格校验默认值，并允许积木 ID 含下划线。前端的类型、草稿校验与读取 API 响应共用旧解析器，运行时目前也只为 `value` 读取子块。前端需同步更新解析、真实积木定义、工具箱影子和 Arduino 生成。目录读取使用 `items.map(parseCustomModuleRecord)`，混用旧前端会因单个新记录解析失败而打不开整个目录。前后端应在同一次发布支持新定义。 [服务端校验](../../apps/api/src/custom-modules/definition.ts) · [前端校验](../../apps/web/src/extensions/custom-module-definition.ts) · [目录读取](../../apps/web/src/extensions/custom-modules-api.ts) · [运行时](../../apps/web/src/extensions/custom-module-runtime.ts)

## 旧工厂与现有作品

旧工厂 `Modify Block` 允许插入标签、文本参数、数字参数、布尔参数和下拉参数。确认时从声明工作区读取顺序和默认值。标签对应积木文字中的普通文本，积木的参数仍按 `message` 中 `{{NAME}}` 的顺序展示。旧工厂的下拉默认值通过调整选项顺序实现，自定义输入用英文逗号分项，设备来源只列出三种引脚接口。 [弹窗](<D:/CFZN/D-Coding/D-Coding/1、自主软件/2、积木工厂软件/源码/aijite-blocks-factory_release/aijite-blocks-factory_release/src/App.jsx:2653>) · [下拉默认项](<D:/CFZN/D-Coding/D-Coding/1、自主软件/2、积木工厂软件/源码/aijite-blocks-factory_release/aijite-blocks-factory_release/src/App.jsx:794>)

旧工厂的文本和数字是可连接表达式的插口，分别带原生 `text` / `math_number` 默认影子。旧工厂的预览定义为布尔参数添加 `check: 'Boolean'`，导出用的 `formatArg0ForBlocksJs` 漏掉了 `check`，工具箱也只输出空槽。CFZN 按主控草案在预览和实际注册积木都应用 Boolean 检查，并为生成器提供无连接的布尔默认值。历史 CFZN 的 `text` 和 `number` 按 Blockly 字段写入 `.ob`，`value` 和 `statement` 按原插口存储。编辑历史模块时原样保留这些输入类型、字段名和默认值，显式替换参数才改变结构。保存编辑稿会获得新的模块版本 ID，已有作品仍按原 ID 读取原快照。 [旧参数定义](<D:/CFZN/D-Coding/D-Coding/1、自主软件/2、积木工厂软件/源码/aijite-blocks-factory_release/aijite-blocks-factory_release/src/App.jsx:2032>) · [旧导出定义](<D:/CFZN/D-Coding/D-Coding/1、自主软件/2、积木工厂软件/源码/aijite-blocks-factory_release/aijite-blocks-factory_release/src/utils/code-builder.js:341>) · [旧工具箱影子](<D:/CFZN/D-Coding/D-Coding/1、自主软件/2、积木工厂软件/源码/aijite-blocks-factory_release/aijite-blocks-factory_release/src/utils/code-builder.js:424>) · [现有积木 JSON](../../apps/web/src/extensions/custom-module-definition.ts) · [不可变快照](../../apps/api/src/custom-modules/local-module.store.ts)

## 契约增量建议

继续使用现有私有模块 API 和 `schemaVersion: 1`，新增三种参数类型。保留既有 24 积木、每块 10 参数、128 KiB 和占位符检查。积木 ID 允许首个小写字母后出现下划线，符合旧工厂 `newblock_` 的命名，仍限制 1–32 字符且同模块唯一。参数 ID 校验沿用现有规则。 [定义校验](../../apps/api/src/custom-modules/definition.ts)

| 参数类型 | JSON 默认值 | 预览与生成 |
| --- | --- | --- |
| `textValue` | 可选字符串，缺省 `""`，最多 512 字符 | 可连接输入，影子为 `text` / `TEXT`。连接块交给 Arduino 生成器，空输入回退到转义后的 C++ 字符串。 |
| `numberValue` | 可选有限 JSON 数字，缺省 `0` | 可连接输入，影子为 `math_number` / `NUM`。连接块优先，空输入使用数值字面量。 |
| `boolean` | 可选 JSON `true` 或 `false`，缺省 `false` | Boolean 插口，连接块优先，空插口使用字面量 `true` 或 `false`。 |
| `dropdown` | `options: [显示名, 代码值][]` 的第一项 | 沿用 1–30 项和代码值唯一等验证。弹窗选择默认项时将它移动到首位。逗号分隔输入属于编辑操作。 |
| `digitalOutputPin`、`analogInputPin`、`digitalInputPin` | 新拖出的积木由当前主控对应菜单初始化 | 复用现有动态字段映射，并从作品恢复每个块实例选择的代码值。定义中只持久化参数 ID 和引脚类型。 |

省略 `defaultValue` 时服务端写入类型默认值。显式提供 `null`、布尔字符串或数字字符串应返回现有 `400 VALIDATION_ERROR` 及准确字段路径。前端在弹窗确认时把数字文本转换为有限数，把布尔选择转换为 JSON 布尔值。保留合法的 `0`、`false` 和空字符串，类型判断使用字段存在性。下拉只接受 `options`，其余类型均拒绝 `options`，语句和引脚参数拒绝 `defaultValue`。这些规则与当前服务端一致。旧工厂的 mutation、XML、菜单键或可执行生成器无需进入模块快照。 [定义校验](../../apps/api/src/custom-modules/definition.ts)

两个新文本、数字插口沿用旧工厂的无类型限制声明，布尔插口使用 `check: 'Boolean'`。工具箱与预览通过同一份积木规格构造原生影子，XML 字段通过节点 `textContent` 写入，保留引号及 XML 保留字符。生成优先复用 Arduino `valueToCode` 的子块表达式与优先级，空槽使用类型默认值。布尔空槽由生成器产生 `true` 或 `false`，不插入文本或数字影子。用实际拖入项目的块验证这些定义，覆盖影子编辑、嵌入子块、拔出后恢复影子及保存重开。 [现有运行时](../../apps/web/src/extensions/custom-module-runtime.ts) · [现有预览](../../apps/web/src/extensions/custom-module-factory-preview.ts)

已有自定义下拉的显示名与代码值可以不同，例如 `[['打开','HIGH'],['关闭','LOW']]`。直接确认弹窗或只改默认项时须保留配对，按代码值识别默认项并稳定前移，已保存的块实例继续使用归档中的选值。编辑选项后若原默认项仍在则保留，否则用第一项。逗号分隔仅是弹窗录入方式，已有配对的往返不能依赖把显示名重新映射成代码值。自定义与设备来源之间切换仅写弹窗草稿，确认后的定义只保存当前分支的合法字段。 [旧下拉逻辑](<D:/CFZN/D-Coding/D-Coding/1、自主软件/2、积木工厂软件/源码/aijite-blocks-factory_release/aijite-blocks-factory_release/src/App.jsx:881>) · [现有双值测试样例](../../apps/api/test/custom-modules.test.cjs:20)

设备引脚映射由前端固定为 `digitalOutputPin → arduino_pin_setDigitalOutput`、`analogInputPin → arduino_pin_readAnalogPin`、`digitalInputPin → arduino_pin_readDigitalPin`。实际 Blockly 字段从已提交的主控读取列表，工厂预览从受信任的主控描述取得菜单，换板校验用同一映射对照目标主控。Uno 的 `A0` 是代码值，ESP32 的显示名和数字代码值可不同。当前工厂预览和积木定义在菜单缺失时有 `0` 回退，运行时直接取字段值。建议在契约明确菜单缺失或字段值超出当前主控候选时给出可读错误，真实 GPIO `0` 仅在可信菜单含该代码值时有效。无主控时仍可编辑和保存定义，由现有适配器在实际向作品添加时验证主控兼容。后端验证参数枚举及字段，主控引脚数据由已有设备描述负责。 [主控兼容检查](../../apps/web/src/extensions/controller-compatibility.ts) · [工厂主控预览](../../apps/web/src/extensions/custom-module-factory-preview.ts) · [加载守卫](../../apps/web/src/extensions/adapter.ts)

## 主控契约建议

首页附录已覆盖新增枚举和生成行为。建议补上严格默认值与字段互斥规则、下拉配对与旧实例选值保留、缺失主控菜单的处理，并同步修正下方“私有自定义模块”一节中的旧 key 正则、形状及输入枚举，或显式引用最新附录。实现范围集中在前端解析和运行，后端沿已具备的定义校验与版本存储补聚焦验收。

## 验收

- 保存带下划线积木 ID 的新版本，核对缺省及显式 `""`、`0`、`false`、`true`、负数和小数，重启服务后从列表及详情读取并与旧版本共存。沿用同所有者读取和跨所有者返回 404 的检查。
- 核对错误默认值类型、重复下拉代码、设备引脚自带默认值或选项、请求包含 `devicePinKey` 被拒绝，错误带字段路径且目录无新项。
- 用旧 `.ob` 验证文本和数字字段、通用值插口和语句输入。按原快照打开后编辑另存新模块版本，再用原作品验证同一模块 ID 仍可加载原定义。
- 新增积木通过真实 Blockly 验证文本和数字影子、原生布尔连接及空槽默认，在 Arduino 生成结果检查 `""`、`0`、`false`、`true` 和含中文、引号、反斜杠及 XML 保留字符的文本，验证连接后优先取子块表达式，导出和重开后影子与实际连接仍可用。
- 默认项重排并保留显示名和代码值，复开后验证首位默认，已有实例选择保持。同弹窗分别验证切换来源后取消和确认。对比两块兼容主控的三种可信引脚列表，缺菜单时报错，换板遇到不支持的已有选值时保留原作品。

本次只完成源码评审，表中验收交由开发和测试角色执行。
