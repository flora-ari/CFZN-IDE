# 创客账号、MinIO 与项目 API 独立验收

2026-11-25 测试分支会话。本地复用了 `VITE_IDE_AUTH=true` 的生产构建和 NestJS 编译产物。Edge、临时服务端口、数据库及测试数据均隔离。

## 浏览器

- Edge 1280×720 与 API 替身验证通过。直接打开编辑器先进入登录页，登录后显示账号并载入真实编辑器。云端列表、64 MiB + 1 字节文件的输入拦截、失效后恢复会话、写入只在用户手动重试时再次发送、换号拦截、导出当前作品和退出均通过。SSO 兑换前已清除地址栏查询参数，正常票据只发一次兑换请求，重复参数显示回门户入口。页面异常数为 0。
- 首次浏览器检查发现固定顶部的超限提示截获「保存」按钮点击。前端将认证页面的提示移至底部，使用包含更改的 `style-mcTh1B-_.css` 复验后，鼠标保存、恢复和换号流程通过。
- 另以同源的真实 NestJS 服务连接生产前端，创客账号及对象存储使用测试替身。错误密码留在登录页。Alpha 登录后通过原生工具栏保存真实 OpenBlock 工程，下载内容和测试对象存储中的字节完全相同。退出后访问项目返回 401。Bravo 在同一浏览器登录后读取列表为空，读取 Alpha 的项目返回 404，用旧账号请求头访问返回 409。页面异常数为 0。

## 后端 HTTP

- 仓库中的聚焦测试 18/18 通过，含认证和账户项目 3 项、旧项目 API 6 项、私有模块 9 项。真实 NestJS HTTP 路由通过了 Cookie 属性与路径、刷新轮换、登出、门户预检、旧票据撤销、并发单次兑换、匿名上传先返回 401、换号头先返回 409、归属隔离、版本冲突、失败写入保留旧归档、重启回收以及归档字节一致性。POST 和 PUT 均接受 67,108,864 字节并拒绝多 1 字节。首轮曾因 Cookie 断言要求属性相邻失败，测试修正后复跑通过。
- 另以独立 HTTP 检查确认 PUT 缺少 `If-Match` 返回 428，非法版本返回 400 `INVALID_IF_MATCH`，已有文件和版本照常读取。紧邻 64 MiB 的边界使用有效 ZIP 工程，测试没有以无效文件代替。
- SSO 续期有契约差异。发票请求仅携带门户 access，当前实现把 SSO 会话的 IDE access 和 refresh 都限定在该上游 token 剩余有效期内。使用有效期 3 秒的合成门户 token 实测，兑换成功，IDE refresh 的 Cookie 也只签发最多 3 秒，到期后刷新返回 401。标准密码登录的刷新轮换通过。

本次使用测试替身覆盖创客账号和对象存储接口。真实 MinIO、线上创客账号、生产代理配置和实体设备由主控侧另行验收。

## 复验命令

```powershell
node --test apps/api/test/maker-ide.test.cjs apps/api/test/api.test.cjs apps/api/test/custom-modules.test.cjs
node .runtime/maker-independent-browser.mjs
node .runtime/maker-browser-with-api.mjs
$env:NODE_PATH = (Resolve-Path apps/api/node_modules).Path
node --test .runtime/maker-independent-http.cjs
```
