# Connection modal v0.4 独立验收

2026-11-10，Asia/Shanghai。**最终产品检查通过，未解决本轮产品缺陷 0 项。** 6组核心 + 1组busy入口补测 + 上传终端3组文本回归通过。全部是实际Edge/UI与模拟WebSerial/硬件HTTP，不是实机验收。

最终构建：`editor-CpXKUff0.js` SHA256 `8FD114EE3ED20D9260C8502540148881969008DAD67144F9D9DE3D32300965D5`；CSS `editor-O6lxRObp.css` SHA256 `C1490F336CE015531F7EC8C9F08EA1CDE431B3F1F8DD90C5E39088051ABA022C`，与主控冻结值一致。

## 命令与边界

```powershell
node tests/connection-v04-independent.mjs
$env:CFZN_HW_CASE='busy hardware'
node tests/connection-v04-independent.mjs
Remove-Item Env:CFZN_HW_CASE
node tests/serial-text-independent.mjs
node tests/mode-v03-vm-boundary.mjs
```

新增独立脚本复用本测试角色已有基础设施，未运行后转述前端自验脚本。随机静态/API端口，项目临时目录；所有3002请求均拦截，模拟双端口相同VID/PID，mock open会拒绝双owner，close会检查reader/writer锁释放。没有操作用户5173/3001/3002、COM3、固件或真实HTTP上传。仅改tests和报告，未递归委派。

## 通过结果

| 验证 | 实际断言 |
| --- | --- |
| 原生入口/标题/授权表 | 实际点击MenuBar连接图标打开Modal，标题为连接FireBeetle ESP32-E；两个真实mock授权记录识别CP210x、浏览器编号不冒充COM；已授权行连接requestPort=0 |
| 添加授权/取消 | 只有添加新设备点击调用requestPort，记录userActivation=true；取消后原sessionId保持；刷新授权枚举故障不伪造断线，恢复刷新可继续使用 |
| 波特率事务/同步 | Modal→57600，上传终端和原生Redux均同步；同值Apply不增加open/close；上传终端→38400，再开Modal/Redux均为38400 |
| OS端口独立 | 两个OS设备与浏览器端口相同VID/PID，初始portId空；用户选择OS-B后硬件设置同步，再由设置选择OS-A反向同步；无USB猜配 |
| 切口/恢复/关闭失败 | A→B时A先关闭，B只打开一次；A目标open失败后恢复B及旧38400，显示已恢复；B关闭失败保留待释放，A opens不增加，提供重试断开；全程maxOwners=1 |
| 无硬件服务/拔出 | 拦截3002为网络失败，浏览器授权口仍成功打开；关闭Modal不掉线；模拟真正port disconnect事件后session清空，VM getPeripheralIsConnected=false、Redux peripheralName=null |
| busy实际入口 | 模拟running build，隐藏进度后实际点击原生连接入口，无新增pageerror/requestPort或serial变更；取消等待终态后释放占用。不是只检查桥接报错 |
| 响应式/资产 | 1440与390Modal完整在视口内；390四列和连接按钮可见，已实际查看；idle/scanning插画、成功/失败rings与串口图标均为同源本地资源；失败真实显示连接失败及错误、重试操作 |
| 旧功能聚焦 | 五项目按钮保留；上传终端h/ello CR/LF、重复hello、逐byte中文、prompt、raw HEX、clear/session隔离、pause丢弃3/3；仅授权按钮名改为添加新设备，不扩大历史矩阵 |
| VM约束 | 最终GUI bundle中178个VM模块逐模块字节与固定上游相同，23个hook均GUI，未发现CFZNDeviceFactories注入 |

协议守卫边界：本轮使用FireBeetle上传模式的实际terminal能力，不将ESP32编程视图视为Firmata所有权；未模拟完整Uno固件握手或声称真实协议已验证。协议限制源码分支按冻结契约保留，未人为伪造VM握手状态来获得“协议通过”。本轮没有重跑全部编译上传/模式/项目HTTP矩阵。

## 独立证据

- 核心6组：`tests/evidence/connection-v04-independent/2026-11-10T06-39-45-187Z/results.json`、calls.json、build.json、connected-table.png、held-failure.png、modal-1440.png、modal-390.png。
- busy补测：`2026-11-10T06-41-31-265Z/results.json`，实际入口非disabled，真实点击后无错误且无串口变更。中间`06-40-52-034Z`仅为脚本fixture排错：单独筛选busy时Modal未开却执行close，修正可见性前置后补测通过，不是产品缺陷。
- 文本：`tests/evidence/serial-text-independent/2026-11-10T06-42-03-622Z/`，3组PASS，最终构建记录与截图。
- VM：`tests/evidence/mode-ui-v03-independent/vm-boundary/`，本轮重新执行生成178模块比较结果。

## 收尾

脚本结果均已落盘。部分浏览器close长时间等待，先记录自有PID/command再仅终止本次测试进程树：34780核心、43072文本；另两个busy运行33356/35764收尾时已退出。未使用停止进程+删除目录组合命令，没有触碰用户服务。本轮临时目录未另行强删，存在性以environment.json路径及收尾核查为准；没有重试历史被拒绝删除的目录。

收尾核查：核心 `C:\Users\YUUMEI\AppData\Local\Temp\cfzn-hw-independent-FdUJsO` 与文本 `...\cfzn-hw-independent-STjmUr` 保留；两次busy目录U4SFNZ/6qFLIo已不存在。无本轮清理审批拒绝，未再次尝试删除。

本报告不构成物理WebSerial、真实波特率变更、编译/烧录或实板拔出的通过结论。
