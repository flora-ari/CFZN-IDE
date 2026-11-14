# Mind+ 硬件调查（2026-11-07）

主控调查记录。当前重点是用户的普通 ESP32 / COM3，原 S3 选择不适用于该芯片。

## 实测与来源

- Windows 枚举：Silicon Labs CP210x USB to UART Bridge (COM3)。用户确认是 ESP32，并已允许用串口测试程序覆盖现有程序。
- 主控运行现有 OpenBlock Link 工具包的 esptool 3.0 `chip_id`、`flash_id`：ESP32-D0WD-V3 revision 3，40 MHz，Flash 4 MB。查询加载 RAM stub 并复位，不写 Flash；不能据此确定品牌或接线。
- 独立 Chrome 捕获 Mind+ realtime 页面：`ws://127.0.0.1:6601/` JSON-RPC，`getPathInfo`、`reportVersion`（2.0.7）、选择 FireBeetle ESP32-E 后 `serialList`。Link 根目录为 `D:/mindplus/Mind+ Link`。串口枚举是本地 Link 的行为，并非卡片本身实现的 USB 驱动。
- 原始网页捕获、脚本哈希和请求记录在 `.runtime/hardware-research/`。`realtime-observations.json` 的串口结果是捕获当时的状态，不能取代当前系统枚举。
- 上传页 main.412a2633.chunk.js 的 SHA-256 为 `5f3b17a297bd06470de266161264a5f7443806512451519e1bb37304dddc8c46`。静态调用链显示通过 Link `spawn` 本地 Arduino CLI，compile 和 upload 分开；串口对象通过 newSerialport/open/close/write 调用本地服务，传输配置含 6602。上传模式包未下载，首次浏览器选择被下载覆盖层阻挡，未在 Mind+ 执行编译或上传。

## 用户指定扩展包

实际本地包：`C:/Users/YUUMEI/AppData/Local/mind+/download/realtime/devices/dev-DFRobot-firebeetleEsp32E@0.0.3/`。

- config.json 声明 id `firebeetleEsp32E`、mode realtime、compatibilityId `fireBeetleEsp32E`、SKU DFR0654。
- boardConfig：`mindplus:esp32:fireBeetleEsp32E`，core version 0.0.2，索引 `https://resource.mindplus.top/mindplus/package/package_mindplus_index.json`。
- 入口 main.js（198011 字节），SHA-256 `eda85aade866c5f0b78d211ebfbfeed800a25fdf5249a6a32c12e70e8fd7c3ce`；实时固件 `firmware/firmata.bin`，另有分区产物。
- 这是 Mind+ 扩展运行时格式，不是 OpenBlock 的设备工厂接口。适配应复用 OpenBlock 已有普通 ESP32 类、独立板卡/引脚配置和本地编译流程；不能把 Mind+ main.js 直接执行后宣布兼容，也不能把串口打开当作实时协议握手成功。

## REA 记录

已按要求调用 D:/rea。首次缺 dist，系统 Node 24.16.0 不满足要求。主控下载并核对官方 SHA256 的独立 Node 24.22.1 到项目 `.runtime/rea-tools`，未修改全局 Node；安装 REA 锁定依赖，按其 native/windows/README.md 从同版 6.8.0 发布包恢复 Windows addon 后构建成功。

源码构建运行时完成了清单和 config 元数据读取，但 main.js 的 source-transfer 遇到 `Unknown native filesystem operation (Win32 87)`。部分 Evidence ID：`ev_602db18847b5380025557edb691e193373da7aef338a5521c88301ed8ba9047c`；错误记录 `rea-firebeetle-summary.json`，诊断 `rea-doctor.json`。未重复未改变的失败调用。

随后在 `D:/rea/.published-runtime/` 安装同版 6.8.0 的配套发布运行时，使用独立 Node 分析同一个原始包，成功退出。完整证据 `rea-firebeetle-published-evidence.json`（40,466,921 字节），摘要 `rea-firebeetle-published-summary.json`。父 Evidence ID：`ev_4d34acc07af8e3edfca9c0f058a4897a8680d5048ceb3194de1e67cff958980e`；包根摘要 `ef49739a03be6f1ece74cc1c918fe122a848dcf1ceac40a645ec16b74a817c67`。解析 1 个 JavaScript 文件、57,451 个 AST 节点，0 语法失败；语义图达到 20,000 节点/文件上限，别名展开亦有限制，覆盖为 partial，不能称完整证明所有调用行为。包入口未执行。普通源码核对和浏览器观测仍单独标注，不冒充 REA 运行时观察。

## 已确认的 CFZN 问题与实施决定

1. 固定 2025 GUI 请求 `/openblock/serialport`，2021 OpenBlock Link 仅注册 `/scratch/serialport`；原生扫描计时在 socket open 后才开始，连接失败可能持续等待。
2. CP210x 不是 S3 标识；当前实物是普通 ESP32。新增普通 ESP32 与 FireBeetle ESP32-E 适配，保留已有三主控。
3. 统一浏览器 Web Serial 会话管理原生连接、原生控制台和现有终端；单一本地 Arduino CLI 执行器编译/烧录。烧录前释放浏览器串口，不能双重占用。
4. 上传目标从本机代理枚举明确选择，不能只按 VID/PID 推断浏览器端口对应 COM3。云端项目服务不能枚举用户电脑串口。
5. 先验证当前普通 ESP32 的编译、烧录、复位、测试标识回读和双向通信；其他板无实物不得记为实测通过。Mind+ 实时固件兼容必须另有协议与实机证据。
