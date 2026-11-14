# 扩展库 v0.6 独立验收

2026-11-11，Sol low。**本冻结产物32项独立检查PASS，FAIL 0，pageerror 0，未解决本轮产品缺陷0。** 实际隔离Vite dev与静态dist均覆盖七类风险；分组执行，没有重建产品或沿用开发自验作为独立结果。

## 冻结与汇总

editor-u0ep3dyT.js SHA256：F9A7726421441A4439E277E27F4EE83D8D513060BE090AAB2958D42EA52C3E75。

GUI SHA256：D2FB1A1FA791E6DF812918C2153235931647DAEAD16F8922C9747A8D41BAE4AF；helper：A2564C8772E19271635F1A935D3516CEABA305D26B63672C3E81632049348207；integration：72d3568d38b08e5a4d54f601281e13ca75b6b94520d8565c49db405fedb4efc5。测试后重新核对hash。

完整汇总：tests/evidence/library-v06/acceptance-summary.json（32个唯一检查名、各run、结果与临时目录清理状态）；冻结hash：frozen-artifacts.json。脚本tests/library-v06-independent.mjs，需--run-frozen才执行，可用CFZN_LIBRARY_CASE和CFZN_LIBRARY_SURFACE定点筛选。没有产品源码修改、递归委派或用户服务操作。

## 实测矩阵

| 风险组 | dev / dist | 独立证据 |
| --- | --- | --- |
| 原生目录与呈现 | PASS / PASS | 无板六灰右上角标、12px字号；真实类型3传感器/2执行器/1功能模块和5板；类型与搜索交集、空结果清除、分区类型记忆/切分区清搜索；支持默认全部、清板后重置。原生Micro:bit实际不支持六模块，支持筛选产生空结果，不改目录矩阵 |
| 选中与移除生命周期 | PASS / PASS | 真实已加模块data-selected、蓝色2px/rgb(76,151,255)、已添加和移除可见；主体重复点击无副作用；独立Enter移除/焦点回主体；一次editVersion+1；已无模块no-op、未知ID拒绝。移除重加/再移除/换Aijite重加后菜单无IO3；当前工具箱类别被移除后回退到存在类别，无幽灵 |
| 全目标引用与依赖 | PASS / PASS | stage、实际duplicateSprite生成的另一原始角色、游离/disabled块、过程定义中引用均拒绝；当前角色空并不绕过。设备菜单shadow置于纯Scratch父块也拒绝清板；Arduino启动帽拒绝。任何已加载模块（即使无块）阻止清板。每次拒绝项目JSON和GET_STATE不变 |
| 两模式完整清板 | PASS / PASS | 编程/上传各清板一次，runtime/Redux/Blockly均原生null、旧类消失；完整目标非素材字段深比较，块连接/参数、变量值42、列表alpha/7、pen/music、五项素材内容、三个原生监视器和完整手稿保留；原programMode不变。清板前先API保存为clean，清板documentId保持且dirty一次，期间无API写入 |
| 原生监视器及归档API | PASS / PASS | 通过实际Blockly checkbox点击创建data_variable、data_listcontents、music_getTempo三个watcher，未写私有monitor Map。清板后全部保持；显式保存仍PUT原active项目ID，revision仅该保存+1；真实POST创建、PUT/GET文件字节SHA一致，新页面项目列表重开两种mode及全部内容保持，重开clean |
| 故障与忙/串口守卫 | PASS / PASS | 真实候选已清板后一次性抛错，真实完整备份rollback恢复FireBeetle、块/变量列表/三个watcher/素材/手稿，GET_STATE完全不变，恢复原入口后显式重试成功。延迟真实模块资源时直接remove/clear拒绝、locale hook拒绝、文档不变，释放后加载完成。明确Web Serial double关闭失败仍保留sessionId/browserPortId，清板拒绝；普通文本连接移除未用模块不开关端口，无第二open或授权 |
| v0.5及VM边界 | PASS / PASS | 中英中同VM/loadProject/loadDeviceURL引用不变，单主控与模块类保留；纯Scratch实际x+13、独立Arduino帽共存，混合RUN明确拒绝。固定上游178个VM webpack模块逐字节相同，42个hook均src范围，无factory注入 |

178模块证据：tests/evidence/mode-ui-v03-independent/vm-boundary/result.json和vm-byte-comparison.json，本冻结重新执行。没有跑无关硬件、串口文本、全后端矩阵。

## 关键文件与截图

- 目录/生命周期/引用：2026-11-11T07-00-23-579Z/；真实另一原始角色与unknown拒绝：07-13-09-937Z/；当前类别移除回退：07-14-51-424Z/（准确run由acceptance-summary.json的对应检查指向）。
- 两模式清板、三个原生watcher、API新页回环：2026-11-11T07-05-31-956Z/，四份*-clear-programming/upload.ob及PNG。dev/dist对应结果都列出nativeMonitors=3、sameActiveId和postPutGetExact（该字段实际覆盖POST创建及PUT/GET精确读回，未单独断言初次POST后的GET哈希）。
- 故障/守卫/v0.5：2026-11-11T07-07-36-708Z/（dist）及07-09-07-200Z/（dev），*-rollback.json说明注入点和真实加载顺序[null,firebeetleEsp32E]。
- **真正选中态**：07-10-51-270Z/dist-selected-before-remove.png；07-09-07-200Z/dev-selected-before-remove.png。selected-state.json含2px蓝边断言；*-library-800.png含窄屏可达性。早期07-00-23的selected-remove.png实为卸载后状态，不作为选中态证据。
- 筛选记忆/支持重置：07-10-51-270Z/与07-11-20-903Z/。所有上述相对日期目录均位于tests/evidence/library-v06/。

## 注入与未执行边界

正常内容/引用/监视器/归档/匿名API均为真实浏览器、原生Blockly/VM及项目服务。变量和列表通过公开Blockly createVariable产生正常事件；三个watcher通过真实flyout checkbox鼠标点击产生。测试块通过公开XML工作区接口作为输入；没有伪造私有monitor record、替换executor/primitive或修改VM源码/打包字节。

故障用例仅在独立context临时包装公开vm.loadProject入口：首个原生候选加载完成后抛受控异常，第二次原生加载执行真实backup恢复；finally还原原函数。串口测试为EventTarget/ReadableStream/WritableStream浏览器double，测试已授权虚拟设备、禁止requestPort；不属于实机证据。硬件3002请求由浏览器路由隔离，未编译/烧录、未连接COM3。

当前六模块没有原生watcher菜单，未制造模块watcher来宣称“实际模块监视器拒绝”通过；该扫描分支有removal.ts只读核对及开发单测，独立原生监视器实证为变量/列表/音乐watcher的清板保全。内部stale expectedDeviceId回调竞态、双重rollback失败锁定和真实硬件作业/协议占有未执行，不计入32项PASS。

## 清理

全部9轮自建浏览器、Vite、静态服务与匿名API已正常退出；每轮临时匿名项目和独立Vite cacheDir均已删除。按environment.json收集本轮所有随机dev/dist/API端口核对，剩余owned listening ports=0。未启停或写入用户5173/3001/3002服务，无实体硬件操作。
