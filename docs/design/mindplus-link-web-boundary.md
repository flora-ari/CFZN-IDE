# Mind+ 网页与 Link 职责

2026-11-12（Asia/Shanghai）。用户最新要求以网页版为首要参考，桌面适配后续开展。本轮没有启动 Mind+ Link 或连接开发板。

Link 是安装在用户电脑上的伴随程序。网页请求本机能力，由它执行串口、编译工具等受支持操作。连接 Link、连接串口和开发板固件握手是不同状态。IDE 部署到服务器后，Link 仍运行在开发板所连的用户电脑上。

## 当前网页证据

当日重新获取官网入口与 main.d8c89955.chunk.js，主脚本15096826字节，SHA256 cf38db76a2536009779256943bfd3c4c59c68256bc12a9b74dcf4926f0907f9d。配置命令地址 ws://127.0.0.1:6601、传输地址 ws://127.0.0.1:6602。

SelectSerial_WsConnectButton__3_-CQ 调用命令连接open。WebSocket打开后先getPathInfo，再reportVersion并检查支持版本，通过后才发布open。超时或版本不符则关闭并提示。Link就绪后另有设备连接入口，串口枚举调用serialList，数据走独立Serialport通道。这是源码静态事实，未作为握手或硬件运行成功证明。

四个原文外围函数共11306字节，经REA6.8.0处理，3249 AST节点、0解析失败，图覆盖partial。父证据 ev_9b0264fd46f4f7dc42bcfdc6d504d968817501e3d36a50cb94e14afb64e1c527。完整包 .runtime/mindplus-parity-20261112/link/rea-web-link-bundle.json；范围、原文哈希与包装说明在web-selected-provenance.json。

隔离浏览器尝试点击该按钮达到30000ms期限并返回cleanup_incomplete，CLI输出JSON不完整，不算成功运行证据，没有重跑。已终止自建CLI与浏览器并核对无活动进程。自动审批以blocked by policy拒绝临时profile递归清理，目录C:/Users/YUUMEI/AppData/Local/Temp/rea-browser-scenario-FptZBD暂留；记录runtime-attempt-cleanup.json。没有借用日常浏览器资料。

## 本地 Link 辅助证据

D:/mindplus/Mind+ Link 为2.0.7，ASAR SHA256 6d7d613ad32e527e4cb6e774b53737b4563783ea04361fec04974861dde61bee。桌面壳实际setConfig6601/6602并startListen，与网页相符。mind-link入口dist/link.js，随包有Arduino CLI；命令层含版本、枚举、文件及工具操作，传输层分流Serialport、child_process、node-pty、ssh、mqtt、udp。实现存在不等于已运行，也不表示CFZN必须复制全部通道。

包中一个未打包node-pty原生文件与ASAR声明哈希矛盾，REA首次拒绝；按明确恢复提示改record-and-continue静态记录，不执行或修复安装文件。桌面壳父证据ev_7f343574de1ca7a34bea3bcead83a36603d6cc21660df61d484fee30840318a6。另选实际mind-link目录8文件（含编译入口），REA处理76322字节、17278 AST节点、0解析失败，父证据ev_e4a286b659399b6432a170b539f329f8de22facac2f780c88fe07b108d414cc9；完整包link/rea-services-bundle.json。

## CFZN 封装边界

现有3002执行器已负责OS端口、编译上传、日志/取消及互斥；HardwareSession是Web Serial终端唯一owner。它具备Link的一部分职责，目前没有独立安装器/托盘，也不是Mind+协议兼容服务。

本轮先复用HTTP capabilities补服务检查和协议/能力诊断，与串口连接分开显示，不为模仿新增WebSocket或第二个owner。未来CFZN Link可封装当前执行器，再冻结软件版本、安装启动和浏览器权限策略。继续限制固定profile/命令、loopback和产品Origin；不让网页执行任意shell。若未来改为本机串口代理，须整体重设计单owner及烧录交接，不能与Web Serial同时开同一端口。
