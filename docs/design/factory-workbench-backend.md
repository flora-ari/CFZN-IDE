# 自定义工厂 Arduino 库后端设计提案

## 本地源码与现有链路

- 旧工厂源码 `D:/CFZN/D-Coding/D-Coding/1、自主软件/2、积木工厂软件/源码/aijite-blocks-factory_release/aijite-blocks-factory_release/persist-plugin.js`。`loadArduinoLibraryIndexList`（211 行）读 Arduino Library Manager 固定索引并缓存 30 分钟。搜索（636 行）匹配名称、作者和一句描述，按名称及作者分组，显示不同版本和支持架构。安装（666、457 行）接收客户端传来的 ZIP URL，通过来源域名检查后解包，处理 ZIP 公共根目录，将库文件写入插件目录的 `lib`。沿用搜索、版本选择和插件私有依赖语义。现有写入逻辑接受 URL、自动跳转、缺少 SHA-256 核验，还会替换同名目录，直接复用会破坏版本固定和下载边界。
- 主业务 Nest 应用监听 3001，私有模块的匿名访问签发 Cookie，作用域 `/api/v1/custom-modules`。`local-module.store.ts` 为每个所有者保存不可变的版本快照，现有作品引用版本 ID。硬件 Nest 进程单独监听回环地址 3002。`hardware/executor.ts` 校验一个源代码请求，随后在短路径 `jobs/<id>` 建立 sketch 和构建目录。编译参数已有逐项传 `--library` 的能力。`hardware/toolchain.ts` 已把 Arduino CLI 的可写数据、用户目录、缓存和临时目录与源安装隔离。上传复用成功构建和已核验的产物，编译依赖应在构建时完成。
- 2026-11-18 实际读取 Arduino 索引。`library_index.json` 返回 200，内容为 60,781,328 字节。`.json.gz` 返回同一 JSON，通过 HTTP gzip 编码传输，Node `fetch` 自动解码。当日有 56,242 条版本记录，全部归档 URL 使用 `https://downloads.arduino.cc`，13,643 条记录含 `dependencies`。实际下载 `Servo@1.2.2`，129,523 字节，SHA-256 与索引相符，归档根下的 `library.properties` 声明 `name=Servo`、`version=1.2.2` 和 AVR 架构。`Adafruit AHTX0@2.0.6` 有三项传递依赖，`stl_allocator@1.2.0` 有最低版本约束。 [Arduino 库索引](https://downloads.arduino.cc/libraries/library_index.json) [Servo 官方索引归档](https://downloads.arduino.cc/libraries/github.com/arduino-libraries/Servo-1.2.2.zip)
- `D:/Mind+Link/Mind+ Link/tool/arduino-cli.exe` 本机可执行，版本为 `git-snapshot`（`2c1d71e`），`compile --help` 显示支持 `--library`、`--libraries` 和 `--jobs`。真实编译仍需有可用 core/tool 的本机配置，设计核对未运行编译或烧录。

## 建议契约

1. 主 Nest 应用增加 `GET /api/v1/arduino/libraries/search?q=...`，返回 `{items:[{name,author,description,versions:[{version,architectures}]}]}`。按名称、作者和描述进行不区分大小写的包含匹配，并优先显示精确名称。对查询长度、组数和返回版本数设明确上限，先分组再截断。版本号以索引原字符串传递，按版本规则显示降序。官方目录可能包含 `Contributed` 等分类，文案写“Arduino 库管理器”或“Arduino 官方索引”，前者所列库可由社区维护。仅返回元数据，不返回包 URL 或磁盘路径。请求为空时可返回空列表，页面引导输入关键词。
2. 私有模块定义可选 `libraries: Array<{name:string,version:string}>`，既有定义没有该字段时视为没有库依赖。复用现有模块新增、读取、隐藏和恢复接口。模块快照保存精确版本，变更选择随新模块 ID 发布。可用索引核对新发布库的精确组合，旧快照读取不依赖在线查询。作者用于展示，索引安装身份为精确 `name + version`。如果索引中相同键指向不同哈希，拒绝不明确的条目。版本号不加 `latest`、范围、URL 或路径。
3. `POST /api/v1/hardware/builds` 可选 `libraries`，结构同上。前端从本次 Arduino 源代码生成涉及的已加载私有模块快照汇总，继续单独传既有六个内置 `moduleIds`。同名同版本合并，同名不同版本在提交及执行端均报冲突，明确两个固定版本。继续使用既有源码哈希；陈旧构建判断也纳入依赖选择。验收需要覆盖代码内容一致但依赖版本改变的情况。硬件进程只接收公开目录的库标识，服务端自行验证精确版本、来源和文件，私有作品记录由 3001 的匿名 Cookie 保护。两个进程无需交换私有模块 Cookie、浏览器路径或所有者标识。现有 `uploads` 请求与响应保持现约定。

## 搜索到真实编译

1. 在 `apps/api` 内复用一个 Arduino 目录实现，由搜索和执行两侧各自调用。固定 HTTPS 索引端点，保持 30 分钟缓存和并发请求合并。流式限制解压后的索引大小，当前 61 MB 的体积需要至少 96 MiB 容量。使用请求超时和最后一次有效索引，服务重启且网络不可用时返回可识别错误。只保留所需字段，防止浏览器加载整份目录。搜索请求失败与空结果独立表达。
2. 每个构建先用索引快照将名称、精确版本解析为 `url`、`checksum`、`size` 和架构。校验 HTTPS、原点 `https://downloads.arduino.cc`、`/libraries/` ZIP 路径、无用户凭据。禁止重定向或逐跳验证同原点及路径。按索引给出的 SHA-256 和内容大小核对真实字节。禁止 HTTP 请求传入源 URL、下载目录和编译参数。限制库数量、单个及合计下载字节、单个及合计解包字节、文件数量和下载超时，所有网络和解包步骤响应作业取消。下载失败、包校验失败、版本缺失和冲突均在 job 状态中带相应诊断，不回退到最新版。
3. 复用仓库已有 `yauzl`。只解包到作业目录下暂存路径，验证所有文件名及平台路径，拒绝绝对路径、反斜杠、父目录、符号链接、Windows 设备名和备用数据流、大小写重复路径及文件/目录冲突。在全部 ZIP 内容验证后，识别直属 `library.properties` 或合法公共根目录，并核验 `name`、`version`。完整保留源码、头文件及其他有效文件字节。为库根路径给正常且较短的 Arduino 库目录名，始终从服务端构造路径，避免旧 Windows AVR GCC 的 `MAX_PATH`。每个独立库根以 `--library <path>` 传给已有编译执行器。CLI 对该参数指定的库赋予最高候选优先级，体系结构的实际编译仍以指定 FQBN、当前 core 和编译输出为准。将具体 `name`、`version`、SHA-256 与现有 `result.json` 一起记录，编译日志保留选定库版本。 [Arduino CLI 编译参数](https://arduino.github.io/arduino-cli/0.34/commands/arduino-cli_compile/) [Arduino 库选择规则](https://arduino.github.io/arduino-cli/1.4/sketch-build-process/#dependency-resolution)
4. 最小实现使用作业内通过 SHA-256 核验的官方索引 ZIP，先实现可明确选择的直接库。传递依赖需要固定版本。若首交付不做自动解析，前端允许同模块选多项，执行端检查索引及包根 `library.properties` 的 `depends`，如有未选传递依赖或已选版本不满足约束，明确提示名称及约束；已选齐的依赖走相同下载和 `--library` 路径。对无法识别的约束也给明确诊断，不能以“已安装”掩盖依赖缺失。索引已存在带范围的依赖，版本比较须区分 Arduino 支持的运算符和普通字符串排序。若主控要求自动解析，基于单一索引快照求解全部范围和冲突，在模块版本存储中一并锁定选定版本及哈希。 [Arduino 库元数据和版本约束](https://arduino.github.io/arduino-cli/1.4/library-specification/#version-constraints)
5. CLI 安装方案可以用 `lib install Name@Version --no-deps` 和受控的独立 CLI 用户、数据和下载目录，且应固定同一索引快照。现有每工具链共用的 `user` 目录不能作为安装目的地，两次作业选不同版本会互相改写。直接 ZIP 方案沿用现有 `--library`，对 URL、下载字节和隔离的验证更直接。用户 Arduino sketchbook、板卡源安装、通用 CLI 库目录以及 OpenBlock VM 不属于写入范围。 [Arduino CLI 安装命令](https://arduino.github.io/arduino-cli/0.34/commands/arduino-cli_lib_install/) [Arduino CLI 目录配置](https://arduino.github.io/arduino-cli/1.1/configuration/)

## 最小验收

- 通过真实 Arduino 索引找到 `Servo`，界面可选择 `1.2.2` 而非默认最新；发布、保存、隐藏后恢复时仍读取此版本，第二个会话读取不到私有模块版本。
- 准备真实可用的 AVR profile，使用 `#include <Servo.h>`、`Servo` 实例和 `attach()` 生成并编译出 HEX，核对构建所用 `Servo@1.2.2`、ZIP 哈希和 `--library` 所指向的作业目录。用另一作业请求 `Servo@1.3.0` 验证两个版本没有彼此覆盖。同时验证旧请求省略 `libraries` 仍有效。必要时用单次真实编译建立证据，已产出 HEX 不代表实体烧录成功。
- 坏校验和、跳转、危险 ZIP 项、同名不同版本、缺少传递依赖和取消均走明确错误及清理路径。验收记录区分真实索引检索、实际编译、作业参数测试和实体硬件验证。
