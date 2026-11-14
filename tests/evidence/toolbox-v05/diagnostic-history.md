# Toolbox v0.5 独立验收（进行中）

2026-11-11，Sol low。最终editor-D_pU3iT4.js冻结版本；本轮独立Vite dev与静态dist，随机端口、临时Vite cacheDir和匿名API目录。未操作COM3/真实硬件/用户服务，未修改产品。

## 阻断项：编程模式归档恢复丢失独立Arduino硬件链

dev与dist均复现。干净iframe真实导入完整.ob，导入成功提示后等待1.5秒，原15个块只剩qa-flag/qa-move，Arduino帽qa-hat及其硬件链缺失。曾额外等待10秒仍无法恢复。当前目标仍为原默认sprite，并非切到了stage或旧示例；六模块ID、素材仍在。已交主控前端排查，等待新冻结产物后定点重验，暂不能验收通过。

最小证据目录：tests/evidence/toolbox-v05/2026-11-11T03-45-39-633Z/。dev-repro-before-project.json / dev-repro-after-project.json / dev-repro-state.json / dev-repro-after.ob，dist对应文件同名。输入归档：tests/evidence/toolbox-v05/2026-11-11T03-43-14-476Z/dev-complete.ob（dist亦有）。目录results.json保留语义差异。

## 已通过的独立范围

完整轮tests/evidence/toolbox-v05/2026-11-11T03-41-47-408Z/：dev与dist的正常六模块链、helper无效default/网络失败/重试/缓存、纯Scratch真实位移19与独立Arduino共存、parent RUN/绿旗/stackclick/键盘混合执行阻断及上传键盘编辑无反复警告、六模块真实代码与参数变化/跨板不兼容拒绝/Aijite排除IO3、真实UI manifest失败和资源失败不丢文档及可重试、注册抛错完整归档回滚后显式重试，均通过。六模块编程实际flyout禁用，上传逐一启用并鼠标拖出，返回编程/上传状态恢复。178 VM模块逐模块字节比较通过，GUI hooks为src作用域。

该轮11项通过、2项归档失败，不将通过项代替整体验收。locale/target刷新、更完整custom-call/运行中修改保护及归档API后续步骤正在补齐；归档导入阻断前未执行到的API恢复不记为通过。

## 测试fixture修正记录

初期类别ID错误假设event/data/procedures，已按真实原生events/variables/myBlocks修正；翻译占位符改用稳定categoryId操作flyout；拖拽标记在每次选择前清理；helper独立页声明UTF-8；前置正常链失败时不再运行依赖XML用例；XML安装等待VM事件同步。早期级联错误不当作产品缺陷。保留原始证据。

脚本tests/toolbox-v05-independent.mjs；未给--run-final不启动服务。各已结束轮次正常关闭测试服务、浏览器并清理自身临时目录。最终报告待修复重验更新。

## 追加问题与等待状态（旧freeze）

独立dist证据tests/evidence/toolbox-v05/2026-11-11T03-49-19-705Z/dist-locale-failure.json：六模块编程已加载，stage→sprite后通过原生SELECT_LOCALE action切英文，基础类与六模块类保留，cfzn-controller-firebeetleEsp32E消失，等待10秒仍不恢复；项目device仍为FireBeetle。已报主控，待修复确认。

stage目标原生motion类别应保留“舞台不可使用运动类积木”说明但无运动块，不应断言类别完全消失；该fixture已按原生行为修正。另一dev轮在前端修复写入adapter/openblock期间被Vite HMR整页刷新中断，此轮作废。语言英文等待应核对真实Blockly消息而非XML中的翻译占位符，该fixture亦已修正。

主控通知前端确认归档缺陷根因并修复中。当前无测试服务存活，不启动新产品矩阵，等待新freeze；旧缺陷仍未标记解决。脚本已准备新增custom-call/运行中新增unsupported停止、注册回滚保留手稿、API POST及PUT精确归档哈希，最终产物再执行。

## 新freeze复验进度（editor-PDao8tJd）

新GUI SHA42E0FDDF...5480；editor SHA A3D5E263...9567。tests/evidence/toolbox-v05/2026-11-11T03-58-16-980Z/ 中dev/dist最小归档复现、normalChain（含target/locale）、helper、stage自定义调用/运行中保护、带手稿注册失败rollback重试及178VM均已通过。旧两项缺陷在新freeze定点均不再复现。

新问题待隔离复核：tests/evidence/toolbox-v05/2026-11-11T04-00-35-523Z/failure-2.png，FireBeetle六模块、清空workspace后切Aijite，提示未能同步到编辑器，并出现主控注册正在进行/恢复备份失败。已排除旧fixture过早读状态，等待45秒仍失败；将追加只含换板的干净页面最小用例。该坏session未完成API回环，归档API测试已改用独立fresh source，以免级联。

## 换板顺序缺陷最小复现确认（新freeze，尚未通过）

干净dist最小用例通过：FireBeetle加六模块、空工作区直接切Aijite成功；独立source页面完整编程归档的真实API POST/PUT/GET及新页面项目列表重开通过（tests/evidence/toolbox-v05/2026-11-11T04-05-22-800Z/，具体最终目录见相应运行时间目录）。

干净dist增加顺序后失败：FireBeetle六模块 → stage/sprite及中英中 → 上传放硬件脚本 → Uno兼容拒绝 → 清空workspace并等待VM删除同步 → Aijite。等待45秒仍失败，错误含arduinoEsp32S3未能同步、主控注册正在进行、恢复原项目失败。最小目录tests/evidence/toolbox-v05/2026-11-11T04-06-21-854Z/，dist-crossboard-before.ob、dist-crossboard-failure.json、failure-1.png。原始precheck拒绝后旧项目仍存在，后续Aijite切换才失败。该问题不是“所有换板均失败”，也未标记修复。

脚本最小筛选：CFZN_TOOLBOX_CASE=crossboard diagnostic，CFZN_TOOLBOX_SURFACE=dist，CFZN_DIAGNOSTIC_SEQUENCE=1，再执行--run-final。无需先跑正常矩阵。当前自建服务均结束并清理临时目录，等待主控处理新缺陷；dev独立API回环及四板编程palette补测仍待稳定冻结后完成。


## 根因只读确认

2026-11-11T04-09-37-502Z/dist-locale-binding-references.json：干净dist加载FireBeetle六模块后，中→英→中，每次sameVm=true，但sameLoadProject=false、sameLoadDeviceURL=false。只保存和比较函数引用，没有替换VM函数。canonical仍FireBeetle、六模块ID不变。这直接支持同一VM在locale重挂载后被重复安装外部adapter，交主控最小修bindVm幂等。

2026-11-11T04-08-57-111Z/的dev/dist-board-trace.json将记录每次用户board request、runtime/GUI/Blocklycanonical、mode、targets、deviceKeys、loadedIDs、DOM忙状态和错误（只读轮询+事件监听）。未修改VM方法或executor。干净简化切板PASS不用于抹去此前顺序FAIL。
