# CFZN-IDE 网站部署

本项目将 Windows 本地构建的前端和后端部署到 Linux 服务器。Nginx 提供前端静态文件并代理 `/api/`，后端由 Node.js 与 systemd 运行。完整操作说明见 [更新打包上传.txt](../更新打包上传.txt)。

## 当前部署配置

| 配置项 | 当前值 |
| --- | --- |
| 本地项目 | `D:\CFZN\CFZN-IDE` |
| 服务器与 SSH | `root@8.138.226.239:22` |
| 网站 | `https://ide.xiaodaiyang.top/` |
| 编辑器 | `https://ide.xiaodaiyang.top/openblock.html` |
| 项目根目录 | `/home/wwwroot/cfzn-ide/` |
| 公网入口 | Nginx 80/443，HTTP 跳转 HTTPS |
| 后端 | 仅绑定 `127.0.0.1`，从 `9111–9199` 选择空闲端口 |
| 服务 | `cfzn-ide.service`，使用独立 `cfzn-ide` 账号 |

SSH 密码在终端提示时输入，不保存在文件或部署包中。

发布包为至少 1 KiB 且可有效压缩的文本静态文件生成 `.gz` 副本，保留原始文件及时间。IDE HTTPS 站点使用 gzip（支持时优先 gzip_static），按 Accept-Encoding 协商响应并带 Vary，API 代理不启用本次压缩。固定 URL 保留 no-cache/ETag 条件校验，哈希 assets 保持一年缓存；浏览器仍请求原来的 `.js` 等 URL。此处理不改变解压后的 VM/Blockly 字节。

2026-11-24 起，准备脚本还输出保留受保护模块原字节的摘要 GUI 文件，首页 preload 与编辑器 script 指向同一 URL。打包为该文件离线生成 `.br`；安装器先核对文件名摘要及两种压缩副本解码一致，再生成仅针对该哈希路径的 br / gzip / identity 路由。Nginx 无需 Brotli 模块，编码表示的 ETag 分开，Vary 和既有安全头保留，压缩副本路径不直接公开。原 GUI 保留兼容，正常构建无需手改 HTML。

## 当前发布状态

2026-11-24 已成功发布 `20261124T092948Z-cfe8ac8d`，包含首次加载的严格词法压缩、摘要 GUI 提前下载与静态 Brotli。安装退出码为 `0`，服务器与公网 HTTPS、首页、编辑器及 API 检查通过；当前 API 绑定 `127.0.0.1:9111`。GUI 原文为 17,619,329 B，br 为 3,753,908 B，gzip 为 4,662,697 B；各表示解码一致，条件请求 304。受控网络冷启动中位数 9.976 → 7.742 秒，性能环境和浏览器宿主限制见 [主控发布记录](../docs/editor-cold-start-release-20261124.md)。本次从上一线上包隔离构建，没有发布并行 CCraft Link/API 修改。

早期 `20261123T014854Z-cfe8ac8d` 的证书失败及回滚已由后续成功发布取代，不需要再恢复该旧发布。新版本应重新构建打包；中断恢复仅对同一次发布按下文说明执行。

## 准备环境

- 本机需要 Node.js >=22.12、npm、Git、Windows OpenSSH 的 `ssh`/`scp` 和 `tar`。首次配置依赖时在项目根目录执行 `npm run setup`。
- 服务器需要 Linux/systemd，活动的 `nginx.service`，且主配置包含 `/etc/nginx/conf.d/*.conf`。
- 域名 A 记录应指向 `8.138.226.239`，清理指向错误地址的 AAAA 记录；服务器 80/443 和部署电脑到服务器的 SSH 端口需可访问。
- 服务器需要 Node.js >=22.12、npm、Bash、curl、OpenSSL、ss、tar、sha256sum、getent、flock、runuser、useradd、timeout 等部署命令，并能下载 npm 生产依赖。
- 缺少合适的 Node.js/npm 时，脚本尝试 `/home/wwwroot/harness-ota/runtime/node-v24.14.0-linux-x64/bin`；为 IDE 单独保存 Node 可执行文件。
- 需有站点有效证书，或已有 `/root/.acme.sh/acme.sh` 可通过 HTTP 验证申请证书。续期依赖服务器实际配置的 acme.sh 定时任务，需单独核查。
- 现有 `/home/wwwroot/cfzn-ide/` 必须有本项目管理标记。脚本拒绝覆盖非本项目管理的配置文件。

## 首次部署与新代码发布

在本机 PowerShell 执行：

```powershell
cd D:\CFZN\CFZN-IDE
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Deploy-Ide.ps1 -Server 8.138.226.239 -SshUser root
```

每次完整部署生成新的发布编号：本地 `npm run build` → 打包 → SSH/SCP 上传 → 服务器校验与安装生产依赖 → 证书准备 → 选择空闲 API 端口 → 启动服务 → Nginx 检查与平滑重载 → 服务器 HTTPS 和部署电脑公网检查。

上传包含前端 `dist`、后端 `dist`、后端 `package.json`/lockfile 和 `release.json`。服务器不构建前端；后端依赖使用 `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` 安装。发布切换保留 `data/`；配置自动回滚不代替数据备份。

### 使用本机代理

在本机 PowerShell 中添加 `-ProxyPort 7897`，通过 Clash 的 HTTP 或 mixed 端口建立 HTTP CONNECT 隧道。SSH、SCP 和发布后的公网 HTTPS 验证均使用这个代理；服务器上的 npm、证书申请和本地健康检查仍使用服务器网络。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Deploy-Ide.ps1 -ProxyPort 7897 -ManifestPath .\build\deploy\<发布编号>\manifest.json
```

`-ProxyHost` 默认 `127.0.0.1`，不传 `-ProxyPort` 时保留直连。无需额外安装代理客户端依赖，不修改全局 SSH 配置。代理必须支持 CONNECT 到服务器 SSH 端口；仅支持 SOCKS 的端口不适用。仍由 OpenSSH 正常检查主机密钥并提示输入密码。此配置不改变执行环境的网络权限，受限沙箱中不能用代理绕过网络限制。

## 打包、复用与续接

只构建和打包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Deploy-Ide.ps1 -PackageOnly
```

产物在 `build/deploy/<发布编号>/`。将以下示例的 `<发布编号>` 替换为实际值：

```powershell
# 上传已经构建的部署包。
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Deploy-Ide.ps1 -ManifestPath .\build\deploy\<发布编号>\manifest.json

# 包已上传、SSH 断开，续接原任务并读取结果。
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Deploy-Ide.ps1 -Resume -ManifestPath .\build\deploy\<发布编号>\manifest.json

# 已有非零失败结果，显式归档失败记录并重新安装。
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Deploy-Ide.ps1 -Resume -RetryFailed -ManifestPath .\build\deploy\<发布编号>\manifest.json
```

普通 `-Resume` 不自动重试失败结果；`-RetryFailed` 必须与 `-Resume` 和 `-ManifestPath` 一起使用。安装通过临时 systemd 服务独立运行，SSH 断开不代表服务器任务结束。若 `/tmp` 包已被清理，使用完整部署流程生成新的发布编号重新部署。

`manifest.json` 保存包的本机绝对路径；移动项目后应重新打包或确认该路径仍有效。已成功的发布不能使用失败恢复覆盖；有新代码时应生成新的发布。

| PowerShell 参数 | 用途 |
| --- | --- |
| `-Server` | SSH 目标服务器，默认 `8.138.226.239`；站点域名与服务器安装目录仍由安装脚本固定 |
| `-SshUser` | SSH 账号，默认 `root`；其他账号需要免密码 sudo |
| `-SshPort` | SSH 端口，默认 `22` |
| `-ProxyHost` | HTTP CONNECT 代理地址，默认 `127.0.0.1` |
| `-ProxyPort` | HTTP 或 mixed 代理端口，例如 `7897`；默认 `0` 表示直连 |
| `-PackageOnly` | 只本地构建打包，或校验指定清单，不连接服务器 |
| `-ManifestPath` | 复用指定清单及部署包 |
| `-Resume` | 复用服务器已上传的包，续接原安装任务 |
| `-RetryFailed` | 对已记录失败的任务显式重试，需同时指定续接和清单 |

## 服务器布局与 Nginx

| 项目 | 路径或行为 |
| --- | --- |
| 当前发布 | `/home/wwwroot/cfzn-ide/current` → `releases/<发布编号>` |
| 前端静态目录 | `/home/wwwroot/cfzn-ide/current/web/` |
| 后端入口 | `/home/wwwroot/cfzn-ide/current/api/dist/main.js` |
| 项目和模块数据 | `/home/wwwroot/cfzn-ide/data/` |
| 独立 Node 运行时 | `/home/wwwroot/cfzn-ide/runtime/` |
| 配置备份 | `/home/wwwroot/cfzn-ide/backups/<发布编号>/`；重试使用独立的 `-retry-<时间>-<进程号>` 目录 |
| 服务配置 | `/etc/systemd/system/cfzn-ide.service` |
| 环境变量 | `/etc/cfzn-ide.env` |
| 站点配置 | `/etc/nginx/conf.d/ide.xiaodaiyang.top.conf` |
| 证书和私钥 | `/etc/nginx/ssl/ide.xiaodaiyang.top/{fullchain.pem,privkey.pem}` |
| 临时上传与日志 | `/tmp/cfzn-ide-<发布编号>/` |
| 安装任务 | `cfzn-ide-deploy-<发布编号>.service` |

Nginx 的 `root` 指向 `current/web`，`location /api/` 代理到实际选定的 API 端口，并保留原请求 Host。安装生成的环境变量包括：

```dotenv
NODE_ENV=production
PORT=<本次自动选择的端口>
PROJECT_DATA_DIR=/home/wwwroot/cfzn-ide/data
CUSTOM_MODULE_ORIGINS=https://ide.xiaodaiyang.top
```

选端口发生在证书处理后、启动服务前，同时检查 TCP 监听和 Nginx 引用；启动后核对端口属于 IDE 服务主进程。实际端口以日志和 `/etc/cfzn-ide.env` 为准，无需向公网开放。

Nginx 重载后，脚本使用新的本地直连请求校验 HTTPS，最多重试 30 次，保留证书信任链和域名校验，要求 HTTP 200 和健康接口 `status: ok`。若持续失败，会在回滚前输出磁盘证书与实际服务证书摘要。重试机制不代表过期证书的根因已经查明。

## 验收与故障定位

整套部署成功应出现：

```text
Server installation exit code: 0
Deployment verified: https://ide.xiaodaiyang.top
```

证书签发、Nginx 语法检查或重载成功只是中间步骤。安装脚本检查首页、`/openblock.html`、`/api/v1/health` 和 `/api/v1/custom-modules`，随后 PowerShell 再检查相同公网地址。还应在浏览器验证积木编辑、保存、重新打开及自定义模块。

本机 PowerShell 访问检查：

```powershell
curl.exe --noproxy "*" --http1.1 -I --connect-timeout 10 --max-time 20 https://ide.xiaodaiyang.top/
Invoke-RestMethod https://ide.xiaodaiyang.top/api/v1/health
```

先执行 `ssh root@8.138.226.239` 登录服务器，再在服务器 Bash 中诊断：

```bash
release=20261123T014854Z-cfe8ac8d
tail -n 100 "/tmp/cfzn-ide-$release/install.log"
cat "/tmp/cfzn-ide-$release/install.exit"
systemctl status cfzn-ide --no-pager
journalctl -u cfzn-ide -n 80 --no-pager
nginx -t
cat /etc/cfzn-ide.env
ss -lntp
```

缺少 `install.exit` 时，结合安装任务状态和日志判断；失败重试会把旧记录归档为 `install.failed-<时间与进程号>.log/.exit`。若日志显示回滚，服务和站点配置可能已按部署前状态撤销。

证书问题需比较安装文件与 SNI 实际服务的证书，并检查 Nginx 监听和日志；命令见根目录部署说明。`ERR_HTTP2_PROTOCOL_ERROR` 截图不能单独确定原因。证书续期需核查实际 timer 或 cron 定时项，不能只依赖首次签发结果。

本地部署辅助检查（模拟 SSH、HTTP、TLS 和端口场景，不连接生产服务器）：

```powershell
node --test deploy/test-server.mjs
node --test deploy/test-ssh-proxy.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\test-resume.ps1 -ManifestPath .\build\deploy\20261123T014854Z-cfe8ac8d\manifest.json
```

## 设备与数据边界

Web Serial 连接访问者电脑上的开发板。编译、烧录依赖同一电脑运行的本机硬件服务，默认 `127.0.0.1:3002`；需允许准确的网站 Origin 并按 [硬件说明](../apps/api/HARDWARE.md) 配置浏览器和本机服务。网站上线不能替代实机烧录验收。

当前作品 API 使用匿名共享存储，自定义模块按浏览器会话隔离。此部署流程不引入登录、注册或账号归属系统。
