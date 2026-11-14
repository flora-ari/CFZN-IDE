# Toolbox v0.5 独立验收

2026-11-11，测试角色Sol low。**最终相关短链15/15通过，未解决本轮产品问题0。** 实际Vite dev与静态dist各7项，另做178个VM模块字节边界检查；两环境浏览器pageerror均为0。没有修改产品、操作COM3/实体硬件或启停用户5173/3001/3002服务。

## 最终冻结与证据

- editor-CaooKnKD.js SHA256：1863E2AFEB9C193AF439DD7618FD16212B34601ACE558F508D96318EEECF6091。
- GUI SHA256：42E0FDDF402A615EB60B13BBAC338AD4BAF473511D2590DDD0D9D4F599825480。
- helper SHA256：A2564C8772E19271635F1A935D3516CEABA305D26B63672C3E81632049348207；integration：197647b2811bd970b293a2e975e27e5d53fe43b31c77c2e101e39a19a0cefa09。
- 最终目录：tests/evidence/toolbox-v05/2026-11-11T04-14-49-884Z/，results.json、environment.json、network.json、page-errors.json及真实.ob。latest.json指向本轮。

## 实际验收

| 范围 | dev | dist | 验证结果 |
| --- | --- | --- | --- |
| 同VM语言绑定 | PASS | PASS | 中→英→中后VM对象、loadProject和loadDeviceURL三个引用均稳定，板卡/六模块保留 |
| 完整归档与API | PASS | PASS | 编程模式15块及连接/字段深比较，五项素材内容与元数据、六模块、完整手稿保留；新iframe导入、真实POST/PUT/GET精确文件字节SHA、新页面项目列表重开 |
| 原失败换板顺序 | PASS | PASS | 六模块FireBeetle→target/语言往返→上传硬件脚本→Uno兼容拒绝→真实清空VM→Aijite成功；完整board request/canonical/DOM loading轨迹保留 |
| 正常类别与真实flyout | PASS | PASS | 原生9基础类、恰一主控、每模块一类；stage运动类只保留原生说明而无运动块；locale刷新不重复/丢类；六模块编程禁用、上传启用并逐一鼠标拖出，模式往返恢复 |
| 四上传主控调色板 | PASS | PASS | FireBeetle/ESP32/ESP32-S3/Aijite依次保持编程模式，单主控类真实flyout受限，无虚构realtime能力 |
| 舞台执行保护 | PASS | PASS | 纯Scratch实际x增加19且独立Arduino帽共存；RUN、绿旗、stackclick、键盘混合脚本阻断；自定义过程调用拒绝；运行中加入unsupported停止；上传编辑Delete/方向键不反复弹警告 |
| 代码与兼容 | PASS | PASS | 六模块真实Arduino语句/表达式；引脚25→26改变代码；不兼容Uno拒绝保留块图；空工作区Aijite→FireBeetle往返；Aijite引脚菜单无IO3 |

VM检查：固定上游178个webpack模块逐字节一致；33个hook来源均src/ GUI范围，无factory注入。证据tests/evidence/mode-ui-v03-independent/vm-boundary/result.json和vm-byte-comparison.json，本最终轮重新执行。

两个完整导出分别49110/49114字节，均5项素材、realtime模式与6模块；ZIP生成大小差异不当作内容差异。API请求file字段或PUT原始body与GET返回按SHA精确比较，恢复项目按块图/字段/连接与素材内容语义比较。

最终正常链所有模块请求均无?import，iframe无vite-error-overlay。Vite使用真实配置、源码、publicDir与独立临时cacheDir；没有用静态服务器替代开发链路。

## 三个产品缺陷的关闭证据

| 缺陷 | 原始独立证据 | 最终关闭证据 |
| --- | --- | --- |
| 编程归档恢复删Arduino链 | 2026-11-11T03-45-39-633Z/dev/dist-repro-before/after-project.json，15块变2块 | 最终dev/dist independent archive API restore PASS，完整图/素材/手稿及新页面重开保持 |
| 语言刷新丢主控类别 | 2026-11-11T03-49-19-705Z/dist-locale-failure.json | 最终normalChain targetLocale中英中保留单主控和六模块 |
| 同VM被locale重挂载重复包装，后续换板及rollback重入 | 2026-11-11T04-09-37-502Z/dist-locale-binding-references.json；04-08-57-111Z/dev/dist-board-trace.json | 最终locale-binding-references全部same=true，原crossboard diagnostic dev/dist PASS；随后generator跨板往返PASS |

旧失败没有删除或改写为通过。完整排查过程留在tests/evidence/toolbox-v05/diagnostic-history.md。原生Arduino帽在编程模式的disabled是上游行为；未为测试修改其状态或将palette禁用写入项目。

## 沿用的故障证据与范围

资源加载helper未变，故障处理adapter/GUI自editor-PDao8tJd后未变，最终只增加同VM bindVm幂等。因此按主控要求沿用该冻结轮tests/evidence/toolbox-v05/2026-11-11T03-58-16-980Z/的dev/dist故障用例PASS：manifest失败后重试、单资源网络失败保持原项目/无partial loaded后重试、注册抛错完整归档rollback并保留手稿后显式重试，以及helper无效default/失败清缓存/重试/版本与ID白名单。该旧轮其他共享session同步失败不作为最终通过证据；最终相关核心已在独立新freeze页面全部复验。不重复历史串口、烧录、全API回归。

## 截图与清理

最终目录dev-programming.png / dist-programming.png：高视口基础类、单主控、六模块及真实舞台；dev-upload-controller.png / dist-upload-controller.png：单主控类内引脚/串口/数据分组及真实启用积木；dev-upload.png / dist-upload.png：六模块拖出状态。

所有自建浏览器、Vite、静态服务和匿名API均正常关闭，临时项目/cache目录已删除。仅tests内脚本/报告/证据修改，无递归委派。浏览器硬件请求被测试路由隔离，Web Serial请求被禁止；本报告不声称实体传感器、烧录或串口硬件通过。
