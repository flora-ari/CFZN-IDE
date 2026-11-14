# Toolbox v0.5 独立验收准备

2026-11-11；状态：只准备，等待主控最终产物通知，未启动服务或测试旧产物。以docs/api-contract.md末尾Toolbox v0.5为准。

复用tests/extensions-independent.mjs中的真实library/Blockly/归档语义比较，tests/menu-title-export.mjs隔离API与静态服务器生命周期，以及tests/mode-v03-vm-boundary.mjs的178模块边界比较。旧“编程模式不能加模块/强制切上传”断言不沿用。

## 执行设施

- Vite：使用apps/web现有vite.config.ts，程序化createServer覆盖port:0、strictPort:false及API proxy指向本轮隔离API；保留真实publicDir和Vite转换流程，不使用会掩盖public资源import问题的替代服务器。最终产物通知后才启动，不运行prepare/build覆盖前端产物。
- dist：独立随机端口静态服务，和dev使用独立干净浏览器上下文；资源错误/console/pageerror/Vite error websocket/overlay均采集。
- API：匿名临时目录+随机端口；浏览器拦截项目请求到隔离API。硬件请求阻止或明确模拟，禁止真实上传和Web Serial授权。正常退出并清理仅本轮目录。
- 观察边界：真实公开UI和现有cfzn.openblock bridge、既有GUI渲染hook获取VM/Blockly/Monaco；不修改VM方法/primitive实现来制造执行通过，不写产品代码。

## 七组验收

1. dev/dist初始、选FireBeetle、重复选择、sprite/stage切换与语言刷新：当前模式、原workspace不变；基础类别target正确；一个cfzn-controller类别且内含引脚/串口/数据，无重复；支持类别选择保留。
2. dev/dist真实点击六模块，两种模式均可加载；已提交ID/类别/定义/生成器一致，每模块独立类别。编程flyout显示仅上传模式并禁用，上传启用；无?import/publicDir错误、vite-error-overlay或部分loaded。截图编程基础+主控+多个模块，以及上传主控内分组。
3. 纯Scratch绿旗运行产生可观测sprite位移/变量结果；单独Arduino帽不阻止纯Scratch。mixed模块脚本经绿旗、stackclick、键盘/sprite或broadcast入口警告并无执行结果；覆盖custom-block调用和运行中新增unsupported的停止保护。调用parent RUN同样拒绝危险执行。
4. 上传真实连接六模块opcode，修改引脚/输入/状态后Arduino代码相应变化；换板重新注册菜单，Aijite排除IO3，兼容拒绝不丢旧内容，不把生成代码当硬件成功。
5. 含基础脚本/硬件脚本、多个模块（含未放块模块）、素材、手动草稿的编程模式完整.ob：实际UI导出、新iframe导入、隔离API POST/GET与保存/重开；语义与素材哈希及cfzn/editor.json保留，无loader URL/重试状态入档。
6. 干净上下文精确故障注入：manifest首请求失败后重试；单模块四资源之一失败；无效default与注册函数抛错必要组合。准备失败不替换document/归档，注册失败完整回滚；loaded IDs、定义、类别无半提交，解除故障后明确重试成功。用真实资源路径匹配，最终实现交付后确定，避免猜测接口。
7. 最终dist的GUI hooks均src范围，178个VM webpack模块与固定上游逐字节一致，保留独立报告；只在最终构建上执行。

最终报告tests/TOOLBOX-V05-REPORT.md分开列dev/dist结果、浏览器模拟与硬件边界、失败与重测。若dev未通过，不能用dist通过替代验收。当前无需前端新增测试接口，最终交付时按公开UI/bridge核对。

## 主控补充约定

- 静态helper：public/cfzn-extensions/module-loader.js；window.CFZNBuiltinModules.loadBuiltin(id,64hex,attempt)返回四个default函数的object。classic script先于editor执行，成功cache按version/module，失败清理，页面拒绝新version。
- 隔离Vite使用本轮临时cacheDir，避免与用户node_modules/.vite竞争；可用实际配置+middlewareMode、owned HTTP server监听127.0.0.1:0，保留真实源码/publicDir转换行为。
- hardware3002全部浏览器route模拟或拦截，不访问用户服务。helper无效default/失败重试可在独立context验证，同时保留真实UI失败不丢项目用例；不扩展为任意跨源loader测试。
