# 顶部品牌 Logo 最小前端提案

日期：2026-11-12。仅只读调查与设计，未复制图片、改产品源码、构建或打开浏览器。公共接口、HTTP、后端、归档均零变化；不改VM、Blockly、模式切换或其他UI。

## 根因证据

- 固定上游包为 `openblock-gui-0.1.0-prerelease.20250611102354.tgz`。已只读解出其原始 `dist/openblock-gui.js` 核对：MenuBar 默认 `logo` 是字标，`logoSmall` 是 `openblock-logo-small.svg`；渲染为 `src: this.state.isOverflow ? this.props.logoSmall : this.props.logo`。
- 两分支使用**同一个img、同一个openblockLogo类**，不是两个独立的 `-sm` 样式类。原生CSS只给该类 `height:1.6rem`。`checkOverflow()` 根据菜单 `scrollWidth > clientWidth` 更新状态；窗口resize先恢复非溢出状态，再延迟300ms重新检测。切换依据是JS溢出检测，不是直接由Logo媒体查询选择图片。
- 当前 `apps/web/src/native-project-toolbar.css:61` 在宽屏将该img设为 `width:120px;height:auto`；第65行窄屏也设 `height:auto`、只有max-width。它们覆盖原生高度约束，且对切到小图标后的同一img继续生效。宽度配合auto高度会按当前资源固有比例计算高度，能解释用户截图中的图标放大和溢出；窄屏也缺少明确高度上限。
- 当前 `scripts/openblock-hooks.mjs` 没有品牌Logo替换。此处与已验收的标题/工具组/右侧模式布局无关，不应通过改整条菜单高度或移动工具组修复。
- 本轮没有浏览器缩放复现；以上是用户截图现象与固定上游、当前样式链的静态归因，不冒充UI复测。

## 最小替换与布局

1. 开发时将 `F:/Desktop/IDE.png` **原样复制**为 `apps/web/public/branding/IDE.png`。源文件当前为275981字节，主控已确认1318×509 PNG；不裁剪、重采样、去底或重新编码。复制后核对源与项目内文件SHA-256一致。
2. 浏览器只使用同源URL **`/branding/IDE.png`**，代码/HTML/运行配置不引用Desktop绝对路径或file URL。换电脑只需项目中的该资源，不再依赖原桌面文件。
3. 在固定GUI的 `src/components/menu-bar/menu-bar.jsx` 图片渲染片段做一个精确GUI hook：仅将上面的大小图src选择替换为该URL，使两种溢出状态都使用同一资源；给该img加稳定标记如 `data-cfzn-brand-logo`。保留其原有class、draggable=false及onClickLogo，不改isOverflow检测或其他菜单分支。该hook需唯一匹配并沿现有准备流程失败即报错；不修改全局OpenBlock资产或舞台嵌入Logo。
4. 用稳定标记约束图片盒，例如 **120×32 CSS px**，`object-fit:contain; object-position:center; max-width:120px; max-height:32px; flex-shrink:0`，使原图完整等比显示。img盒本身即受限盒，无需新增一层撑高菜单的包装；保留原生父项的垂直居中。图片比例与盒比例不同允许留空，不拉伸、不使用cover裁字。
5. 删除/替换现有两处Logo `height:auto` 覆盖，避免旧宽屏/窄屏规则再次生效。其余媒体查询及菜单样式保持原样。不以全局img选择器影响设备、语言、截图等图标。
6. 保持原生MenuBar **48 CSS px**。标题、五项目按钮、保存状态、右侧“编程模式/上传模式”的位置、样式、文案和逻辑全部保留。Logo不参与无上限flex拉伸，不通过提高菜单高度容纳图片。
7. alt可改为“IDE”与新品牌一致。保留原有点击回调及已有键盘路径；若该实例没有onClickLogo，不新增虚假跳转或操作。若实例可点击，键盘Enter/Space应与同一回调一致，不因图片替换丢失焦点/可访问名称，也不改变点击目的。

## 现有资产链路与最小改动面

`scripts/prepare-openblock.mjs` 已递归fingerprint `apps/web/public`（第32行），并将其复制到生成public目录（第123行）；Vite的publicDir指向 `.runtime/web-openblock/`。因此可沿现有准备流程得到dev下 `/branding/IDE.png` 及dist中的同路径文件，不另建资源服务或额外loader。

建议只新增项目PNG、上述精确GUI hook及Logo范围CSS；在prepare的 `requiredOutputs` 补 `branding/IDE.png`，使缓存命中时也检查该资源存在，缺失能按既有准备流程修复。无需改Vite配置或MenuBar其他逻辑。资产来源和原样复制摘要可在前端现有交接文档记录。

## 开发后聚焦验收

- dev与静态dist的 `/branding/IDE.png` 均返回PNG；项目资产、生成资源、dist资源与源图SHA-256一致；仅保留项目资产时仍能加载，产物无Desktop/file URL依赖。
- 1440/2560宽屏、1000/800窄屏及断点附近，正常与菜单溢出两状态均为相同本地URL，不再出现原橙色小图标。缩放80%/100%/125%/150%并等待resize检测完成，检查img边界不超菜单、MenuBar仍为48 CSS px；不只比较截图中的物理像素高度。
- 保证完整图像无裁切/拉伸，点击及适用的键盘操作保持；项目按钮、标题间距、原滚动条和右侧模式工具组不移位。核对新增hook仅GUI片段，VM/Blockly字节不变。

本轮到此交设计；源码实施、构建和真实UI验收由主控后续派工。
