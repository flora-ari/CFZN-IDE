# 顶部品牌资源

`public/branding/IDE.png` 由用户于2026-11-12提供，导入来源为 `F:/Desktop/IDE.png`。原PNG字节直接复制，没有裁剪、重编码、缩放或重新生成；此来源记录不新增或推定第三方许可。

- 原始尺寸：1318×509。
- 文件大小：275981字节。
- SHA256：`18C9295EDA2562707124E7A562ECB683BA19F60BF23A7038B7FB5A92F267D75F`。

运行时只使用同源 `/branding/IDE.png`，不读取桌面文件或磁盘路径。现有prepare流程将项目资源复制到 `.runtime/web-openblock/branding/IDE.png`，Vite再复制到 `dist/branding/IDE.png`；该PNG列入prepare缓存的requiredOutputs检查。

原生MenuBar仍使用同一img，CFZN实例在正常/溢出状态都引用该资源，保留原class、draggable与onClickLogo。图片盒固定120×40 CSS像素，最大尺寸相同，object-fit:contain等比居中完整显示，不改变48像素菜单栏及其他控件。PNG文件内部留白和透明区域按原图保留。
