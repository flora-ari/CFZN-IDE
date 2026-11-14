# 两个主控入口目录一致性独立验收

2026-11-11，Sol low。**最终7/7 PASS，FAIL 0，pageerror 0，未解决本轮产品问题0。** 真实隔离Vite dev与静态dist各3组，另做VM字节边界；不重建产品，不重复v0.6归档/硬件/API全量矩阵。

冻结editor-pi1Qp4cx.js SHA256：C51710B097867E3146015325833DD8C10076F55D367D1EFDDEC76B35C3DCB1E6。测试后重核匹配。GUI D2FB1A1FA791E6DF812918C2153235931647DAEAD16F8922C9747A8D41BAE4AF、helper A2564C8772E19271635F1A935D3516CEABA305D26B63672C3E81632049348207均保持v0.6。

## 结果

| 聚焦范围 | dev | dist | 实测内容 |
| --- | --- | --- | --- |
| 实际入口与完整元数据 | PASS | PASS | 底部扩展按钮→主控扩展，与顶部原生device-icon菜单实际鼠标点击进入；各20个有序可见主控。逐项ID、名称、图标URL、已本地化说明、aria-disabled一致，并与注册nativeProps.deviceData按契约排除null/undefined/'null'/hide:true后的有序投影一致；非五板15项全部保留，无空取消命令卡片 |
| 搜索/类型/清除 | PASS | PASS | 两入口都可点全部/主控板；Arduino、ESP32、Arduino Nano、无结果查询的有序ID相同。主控板类型只匹配已有五板可信元数据，配合ESP32查询结果相同；空结果清除恢复完整20项及空查询。未知类型Arduino Nano在全部和名称搜索中保留，不被猜成board。整个浏览/筛选GET_STATE不变 |
| 选择同步及短守卫 | PASS | PASS | 扩展入口实际选Arduino Nano，经原生VM路径完成；顶部入口同项选中，重复选择不增加editVersion且保持mode。再在上传模式经顶部选FireBeetle，扩展入口同步选中且upload不变；重复点击仍幂等。Nano下六模块均实际不支持、没有新增支持矩阵。加载蜂鸣器后顶部移除与取消主控均禁用，直接原生wrapper拒绝清板且GET_STATE不变；显式移除模块后顶部取消成功，空身份三处同步、dirty一次、upload保持，扩展入口无幽灵选中 |
| VM边界 | PASS | PASS | 固定上游178个VM webpack模块逐字节一致，42个hook均src/ GUI范围，无factory注入 |

15个五板之外可见ID：arduinoNano、arduinoLeonardo、arduinoMega2560、arduinoUnoR4Minima、arduinoUnoR4Wifi、arduinoEsp8266NodeMCU、arduinoK210MaixDock、arduinoK210Maixduino、arduinoRaspberryPiPico、arduinoRaspberryPiPicoW、arduinoRaspberryPiPico2、arduinoRaspberryPiPico2W、microbit、microbitV2、makeyMakey。

## 证据

最终目录：tests/evidence/controller-catalog-consistency/2026-11-11T08-10-52-878Z/。

- results.json：7项最终结果；dev/dist-catalog-metadata.json：原生目录oracle及两个实际DOM逐项快照；dev/dist-filters.json：各查询/类型有序ID。
- dev-extension-all.png、dev-top-all.png、dist-extension-all.png、dist-top-all.png：两条真实入口卡片截图。读取现有renderLibrary props仅用于观察注册目录，没有直接调用renderLibrary(nativeDevices=true)、伪造原生入口或用Redux打开设备模态。
- page-errors.json为空；environment.json记录独立dev/dist/API地址及实际dist HTML。cleanup-and-hashes.json在上一级记录两轮清理及最终hash。
- tests/evidence/mode-ui-v03-independent/vm-boundary/result.json与vm-byte-comparison.json：本冻结重新执行的178模块比较。
- 脚本：tests/controller-catalog-consistency.mjs；运行node tests/controller-catalog-consistency.mjs --run-frozen。

首轮08-09-47-046Z目录保留原始fixture失败：description是React Intl元素，错误直接与DOM中文字符串比较；修正oracle使用当前locale消息/原生defaultMessage，并继续做两入口DOM说明逐项比较后通过。filterCase同样规范化。产品未因此修改；首轮非五板选择/同步/移除/兼容及VM检查已通过。历史v0.6“五主控”断言由本轮新需求覆盖，旧脚本/报告保历史，不当作本轮产品失败。

## 范围与清理

使用真实Vite配置/源码/publicDir、独立临时cacheDir和随机端口，dist另起随机静态服务；项目读请求指向本轮临时匿名API。硬件3002请求全部浏览器route隔离，navigator.serial禁止授权，不执行编译、烧录或真实串口操作；不把选择原生板称为硬件验证。

两轮自建浏览器、Vite、静态服务、匿名API均正常退出，临时目录均删除；按记录端口核对，owned listening ports剩余0。未操作用户5173/3001/3002、COM3或产品源码，仅tests内脚本/报告/证据改动。
