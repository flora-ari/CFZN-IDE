# v0.7 独立测试准备

状态：仅准备，等待主控最终冻结和启动许可；未运行产品、浏览器或实体硬件。依据 docs/api-contract.md 顶部 v0.7 与 docs/design/mindplus-parity-acceptance.md。

## 隔离环境

- 复用本地 @playwright/test、Edge、Vite 与 apps/api/dist/app.js；不安装依赖、不重建产品。
- 每次有界组自建随机 loopback 端口项目 API/存储、Vite middleware dev 和静态 dist 服务；新独立浏览器 context，不触及用户 5173/3001/3002。
- 运行器添加 --run-frozen 门槛，按 surface=dev/dist、group=save/search/service/terminal/loaded 分组；每组关闭所属浏览器/API/Vite/HTTP。
- 测试硬件请求全部拦截；serial fixture 只在新 context 安装，明确 SIMULATED，不调用物理 requestPort。新临时资源仅清理本组创建的路径，旧 REA profile 不触碰。
- 既有 library-v06-independent.mjs 复用启动/桥接/完整归档解析方法；serial-text-independent.mjs 复用连接入口和真实流模拟方法；mode-v03-vm-boundary.mjs 复用 VM 映射字节比较，并补 Blockly bundle 与 GUI-only hook 核对。

## 有界组与证据

1. save-basic：真实父页面与 iframe 按键；首 POST、后 PUT、每次按键唯一请求、revision/ETag；标题最后字符、积木原生字段、注释及 Monaco 手稿提交后解包归档核对。save-guards：repeat/composing/Alt/Shift/模态/busy，412 恢复与另存为，焦点和选区。
2. search-native：真实入口中文/英文/空结果，动态变量/列表/带参数过程、主控与模块、禁用/菜单/shadow。原生 flyout 块 SVG 真实鼠标拖至主 workspace，检查 VM 块字段、mutation、shadow、Arduino 生成。search-lifecycle：locale/目标/主控/模块/模式变化与旧结果隔离、Escape/清除/关闭/原类别移除回退。比较 GET_STATE、归档完整块图/监视器/素材/手稿、undo 和纯舞台运行状态。
3. service：UI 点击检测，模拟在线/离线/协议/结构/缺 core/ports 单独失败/超时/乱序；比较 WebSerial、显式 profile/OS port、dirty/source/job，断言无 POST。运行中作业健康失败另组使用有限 fixture job poll 验证，不访问编译器。
4. terminal：模拟正常连接/收发，UTF8 和 CRLF 分块、失败写入不记 TX；切模式、隐藏、locale 重挂后日志/草稿/收发格式/行尾/pause 保留；隐藏 RX、暂停丢弃、容量、清空、跨 session；reader/writer/open 计数唯一和协议占用边界。
5. loaded：三分区默认未勾选、真实已加载状态、类型/关键词/兼容交集、加载/移除立即刷新、取消筛选不卸载、空结果清除、分区记忆；两主控入口共享筛选。保持20目录、五按钮、模式 UI、引用保护及焦点回退，无 dirty。

每组独立 results/network/pageerror/consoleerror/截图/归档语义 JSON；分别标注 dev、dist、模拟证据。最终记录冻结文件哈希、构建/单测交付、VM/Blockly 比较及清理结果，不把历史验收或开发冒烟当本轮结果。

## 待主控交付

- 明确最终冻结、允许启动；源文件/产物清单与最终 hash、构建和单测输出。
- 最终 GUI 搜索入口/输入/结果计数和分类恢复挂点；终端 native console 与 upload 视图的实际入口；locale UI 或既有 Redux 切换路径。
- 当前结构可由原生 GUI renderLibrary 捕获 VM、既有 DEVICE_EXTENSION_ADDED 定义回调捕获 Blockly；仅用于状态观察/fixture，验收动作使用原生 UI/鼠标，搜索成功不依赖内部索引数组。
- fixture 模块已准备：tests/parity-v07-fixtures.mjs；只导出模拟串口与可切换能力诊断路由，导入不启动任何环境。
