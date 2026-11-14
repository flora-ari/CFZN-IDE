# 顶部 Logo：资源与后端边界

日期：2026-11-12。角色：后端接口设计。范围：只读核对与设计；未复制资产、修改产品、构建或启动服务。

## 结论

本需求只需项目内静态资源与前端 Logo 展示调整，**后端、HTTP API、依赖和项目归档格式均无需改动**。保留 VM、Blockly 和顶部实时/上传模式切换现状。

`F:/Desktop/IDE.png` 仅是本次导入来源；开发阶段将它原字节复制进项目资产，建议落点 `apps/web/public/cfzn-brand/ide-logo.png`，最终名称由主控统一。页面通过站点资源 URL（当前根路径部署为 `/cfzn-brand/ide-logo.png`）加载，不能使用 `F:/Desktop/IDE.png`、`file://`、桌面软链接或每次启动读取外部图片。换电脑时随项目携带该资产源文件；部署时随 `dist` 携带产物，不需要原 F 盘路径。

## 已核对的现有链路

| 环节 | 当前实现与本次接入方式 |
| --- | --- |
| 资产源 | `apps/web/scripts/prepare-openblock.mjs:15` 将 `apps/web/public` 定为 `publicSource`；新增 PNG 放在此目录的品牌子目录。 |
| 生成缓存 | 同脚本第 23–38 行递归计算文件名与文件内容指纹，包含 `publicSource`；首次新增或后续替换图片会改变准备清单指纹。 |
| 准备输出 | 同脚本第 123 行将 `publicSource` 递归复制到生成目录，第 135 行发布为项目内 `.runtime/web-openblock`。无需增加专用图片复制逻辑。 |
| 启动与构建 | `apps/web/package.json` 的 `predev`、`prebuild` 均执行现有 `prepare:openblock`。已有 dev 进程不会仅因改动原始 public 文件自动重跑这一步；开发方需按既有流程准备资源，不以手工改生成目录作为最终交付。 |
| Vite 服务与产物 | `apps/web/vite.config.ts:7` 将 `.runtime/web-openblock` 设置为 `publicDir`。当前安装 Vite 的 `dist/node/chunks/config.js:33581–33583` 从 publicDir 复制到 outDir，第 33616 行默认 `copyPublicDir: true`，项目未覆盖此值；因此同相对路径进入 `apps/web/dist`。同文件第 8449 行包含 PNG 的 `image/png` 映射。 |

准备目录由脚本相对于自身文件位置推导，配置也使用 `import.meta.url` 定位；本次不引入绝对磁盘路径。仅修改 `.runtime` 或 `dist` 会在下次准备/构建时丢失，不能作为资源源文件方案。

## 原图与展示约束

已只读检查来源文件：PNG 签名正确，1318×509，275981 字节，SHA-256 为 `18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F`。该值是本次来源快照，复制时应再次比较。

当前 `apps/web/src/native-project-toolbar.css:60–65` 只在媒体查询内设宽度/最大宽度 120px 与 `height: auto`；新图按 120px 宽显示时高度约 46.34px，不能据此保证不撑栏。建议前端在现有 Logo 范围内同时限制菜单栏可用高度与最大宽度，按原始比例完整显示（`object-fit: contain`，避免独立拉伸横纵方向），检查父容器的高度和占位；具体尺寸由前端设计与主控统一。不要通过修改整条 MenuBar 高度或模式切换区域解决 Logo 尺寸问题。

## 实施后的聚焦验证建议

1. 比较来源 PNG、项目 `public/cfzn-brand/ide-logo.png`、`.runtime/web-openblock/cfzn-brand/ide-logo.png` 与 `apps/web/dist/cfzn-brand/ide-logo.png` 的长度、SHA-256，确认四者原字节一致；资源源文件必须随项目交付。
2. 在获派测试的隔离 dev 与 dist HTTP 环境请求该 URL，确认 200、`Content-Type: image/png`，并比较响应体哈希与项目源 PNG。区分真实图片与 SPA 回退 HTML；MIME 映射的源码核对不代替实际 HTTP 验收。
3. 检查浏览器图片成功解码，显示宽高比约为 1318/509；覆盖宽屏与窄屏，菜单栏高度保持原值，Logo 不裁切、不撑栏，原按钮与模式切换可用。
4. 确认运行引用和准备配置无桌面绝对路径依赖；正常项目准备/构建仅以项目内 PNG 为输入。VM/Blockly 模块字节及模式切换保持既有边界，复用现有定点核对流程。

上述均是后续验收建议，本分支本轮未运行构建、HTTP 请求、浏览器或硬件测试。
