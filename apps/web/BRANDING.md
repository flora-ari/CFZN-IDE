# 顶部品牌资源

`public/branding/IDE.png` 由用户于2026-11-12提供，导入来源为 `F:/Desktop/IDE.png`。原PNG字节直接复制，没有裁剪、重编码、缩放或重新生成；此来源记录不新增或推定第三方许可。

- 原始尺寸：1318×509。
- 文件大小：275981字节。
- SHA256：`18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F`。

历史版本运行时使用同源 `/branding/IDE.png`，不读取桌面文件或磁盘路径。prepare流程将项目资源复制到 `.runtime/web-openblock/branding/IDE.png`，Vite再复制到 `dist/branding/IDE.png`；该PNG仍列入prepare缓存的requiredOutputs检查，仅保留资源及来源记录，本轮不再作为产品标识引用。

历史版本的原生MenuBar使用同一img，在正常/溢出状态引用该PNG。图片盒固定120×40 CSS像素，最大尺寸相同，object-fit:contain等比居中完整显示，48像素菜单栏及其他控件保持原尺寸。PNG文件内部留白和透明区域按原图保留。

## CCraft 产品资源（2026-11-23）

本轮最初新增自主绘制的 `public/branding/ccraft-wordmark.svg` 和 `ccraft-icon.svg`。随后按用户最新指示，主要字标改用下述用户提供的PNG；自主wordmark仅保留历史资源，不再用于产品界面。独立icon继续用于小图，不引用第三方商标，也不加载网络字体。

- 用户PNG用于原生MenuBar正常/溢出状态以及全屏舞台的产品品牌入口，alt为CCraft，原菜单图片控件、点击属性与舞台操作保留。
- 图标用于两页favicon、私有模块通用图及舞台扩展缺失图片的fallback。真实设备/模块素材保持原图。
- 当前PNG与独立icon从public复制至 `.runtime/web-openblock/branding/`，随后由Vite分发至 `dist/branding/`，并列入prepare的requiredOutputs；缓存缺少文件时重新准备。
- 已保存/导入的作品标题、积木字符串、手动源码及素材不迁移。第三方LICENSE、TRADEMARK、版权及来源记录继续保留原文。
- 原生“维基”控件改为“官网”（繁中“官網”、英文“Website”），点击或键盘激活会以noopener/noreferrer新标签页打开 `https://maker.xiaodaiyang.top/`，保留当前编辑页及其内容。教程等其他帮助入口保持原目标。

## 用户提供的 CCraft 字标（2026-11-23，当前产品标识）

`public/branding/ccraft-logo.png` 逐字节复制自用户提供的 `C:/Users/flora/AppData/Local/Temp/codex-clipboard-969e63a3-55ec-423c-994d-9638a6f51ef3.png`。源PNG完整保留，没有裁切、重编码、重绘、颜色调整或修改栅格像素；运行时不读取临时文件。

- 原始尺寸：1448×1086，8位RGBA。
- 文件大小：495240字节。
- SHA256：`C927127553D58DCFDB4DE6487DA3A2C894266D6A78B9DE05D3E9535DA2D010C2`。
- 只读透明度检查：任意非零alpha像素边界为x45–1417、y98–996；alpha>16的主体及中文边界为x101–1353、y347–770，alpha>128边界为x103–1352、y348–768。外围包含大量透明留白及极低透明度散点。
- 顶栏及全屏品牌img直接引用同源 `/branding/ccraft-logo.png`。120×40 CSS像素展示框采用 `object-fit:cover; object-position:50% 53%`，等比缩放、不变形。对应源画布视口为x0–1448、y约319.767–802.433，完整包含主体及中文，仅在展示框中隐去外围留白和部分低alpha散点。原PNG全部像素仍在项目资产中。品牌img使用完整opacity，覆盖上游全屏图标的淡化样式。
- 不采用含外部image引用的SVG img包装，避免浏览器SVG图片模式禁用嵌套资源。favicon及通用小图继续使用同源 `ccraft-icon.svg`。
