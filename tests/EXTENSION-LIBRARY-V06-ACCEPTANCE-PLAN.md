# 扩展库 v0.6 独立验收准备

2026-11-11；仅准备，等待主控“冻结可跑”。没有启动浏览器、Vite、API、构建或硬件。以docs/api-contract.md v0.6为准，已读取两侧设计、adapter/removal/library及verify-library-v06.mjs。开发自验不代替独立结果。

脚本tests/library-v06-independent.mjs已写入：双环境/匿名API/独立cacheDir和清理、公开UI与bridge、稳定卡片选择器、类型搜索/灰角标、键盘移除重加换板、跨目标游离/禁用/过程引用拒绝、Arduino帽引用拒绝、两模式清板归档/手稿/dirty/documentId对比。node --check通过。无--run-frozen会退出，避免误测旧产物。

## 最终分组

1. **目录与UI**：无板六灰色右上角标；兼容/不支持真实状态；蓝2px提交选中；主体重复选择幂等，移除为同级独立键盘目标；动作不冒泡。目录类型3/2/1和主控board，无伪类。类型∩关键词∩支持过滤、默认全部、无板禁用支持框、清板重置、各分区记忆及原生切分区清搜索。真实原生板如Micro:bit用于不支持，不篡改支持矩阵。小屏仅核对本轮搜索/类型/移除可达。
2. **无引用模块生命周期**：移除→重加→移除→换Aijite→重加重新注册pin菜单，无IO3；其余类保留、选择类回退、焦点可用；单次editVersion+1，重复/未知/过期/拒绝不修改原有dirty或API revision。模块依赖阻止清板，独立入口与原生manager wrapper一致。六模块无声明相互依赖，不虚构。
3. **引用完整性**：stage/另一原始角色、游离/disabled、过程定义/调用/输入、真实设备菜单shadow；运行时所有原始target检查，拒绝前后项目JSON/GET_STATE完全不变。原生checkbox实际创建monitor，观察runtime monitorState/monitorBlocks和导出monitors；不直接set私有Map、不伪造monitor record来当原生证据。六模块未提供原生监视器UI时如实列能力边界，监视器保全用原生变量/列表和可监视舞台扩展；需硬件监视器引用时优先用原生公开monitor事件链并明确注入来源。
4. **清主控完整事务**：先真实添加pen等舞台扩展、Scratch块/连接/字段、原生变量/列表及其checkbox watcher、可用扩展watcher、五素材、手稿。编程和上传分别清板，仅device变原生null且deviceExtensions空，其他完整内容/原mode/editor.json保持；documentId/父active/revision不变，成功dirty一次。无主控类别/幽灵类别，硬件操作明确缺目标；手工C++不自动重写。
5. **故障与操作守卫**：延迟真实module资源进入busy时直接命令清板/移除/模式/locale被拒绝，释放后完成；一次性故障可在清板调用的公开loadProject入口拦截（测试专用、保存原引用、finally恢复）模拟候选已加载后失败，真实完整backup rollback保全手稿/块/监视器和dirty。不能改VM源码/执行器/primitive/getter。必要双失败走recovery，不误报成功。授权Port用明确浏览器测试double，关闭失败保留portId/sessionId，清板拒绝且不启动第二owner；普通文本连接移除未用模块不开关端口。无COM3、无实体授权/编译上传。
6. **归档与API/关键v0.5**：清板/移除后的完整.ob新iframe导入，真实匿名API POST/PUT/GET精确file bytes SHA、新页面重开；原native字段和metadata保留，无filter/selected/removal状态入档。语言往返同VM及方法引用稳定，单主控/模块类与基础类、真实舞台执行/unsupported警告核心；不重跑无关串口/后端全套。
7. **VM边界与最终报告**：固定上游178模块逐字节比较，GUI hook仅src。报告tests/EXTENSION-LIBRARY-V06-REPORT.md按dev/dist和实际覆盖/模拟硬件分开，保留错误与重测，不把准备或开发结果写成PASS。

## 执行与fixture约束

- 真Vite读取实际配置/源码/publicDir，自己的随机端口和临时cacheDir；dist独立随机静态服务。项目请求到本轮临时匿名API；hardware3002全部route模拟/拦截，不访问用户服务。
- native舞台card accessible name含描述，用稳定名/前缀或实际卡片定位，不能硬套精确短名；空结果div内部有清除按钮，不假设纯文本；视口外卡片先scrollIntoView。
- 选择/卸载/clear后等待runtime、Redux、Blockly和原始块事件队列一致，不用旧workspace句柄；尤其清空必须等待VM原始非shadow块数为0。所有fault只放新context，失败不级联到API用例。
- 当前准备脚本后四类的原生监视器、串口double/故障、完整API组合和v0.5相关driver将在最终交付接口确认后补完再跑；现阶段未宣称这些已执行。
