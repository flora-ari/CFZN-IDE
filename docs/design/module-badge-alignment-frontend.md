# 模块兼容角标对齐前端设计

日期：2026-11-12（Asia/Shanghai）。角色：前端设计；仅源码只读核对与本文档交付。主控已批准直接卡片子节点方案，并冻结 `top: 0; right: 0`，以卡片内侧紧贴 2px 边框。最终实施以 `docs/api-contract.md` 顶部本轮附录为准。

## 根因与证据

- `apps/web/src/extensions/library.ts:61-75` 根据真实主控及兼容状态构造同一个 `.cfzn-card-compatibility`，三种文案为“未选择主控板”“兼容当前主控”“不支持当前主控”。这里仅供应 React16 节点，没有按图片计算位置。
- `apps/web/scripts/openblock-hooks.mjs:241-244` 将 `cfznCard.badge` 插入原生 `featuredImageContainer`，因此角标属于图片容器；`246-248` 已将 `cfznCard.select` 插在外卡根节点，`251-253` 将 footer 保持为根节点末尾子节点。
- 固定上游 GUI 的实际卡片组件为 `src/components/library-item/library-item.jsx`。当前产物 `apps/web/dist/openblock-vendor/openblock-gui.js:343976-343990` 可直接复核上述节点关系。上游卡片类 `.library-item_library-item_1DcMO` 是 `display:flex; flex-direction:column; align-items:center; position:relative`，featured 卡片宽度上限 300px、`padding:0; overflow:hidden`；图片容器 `.library-item_featured-image-container_1KIHG` 另有 `position:relative`，没有固定宽度或横向拉伸约束。上游 CSS 位于同一产物 `316679`。
- `apps/web/src/extensions/library.css:38-48` 给硬件图片容器固定 186px 高度与居中布局，并保留 `object-fit:contain`，没有把该容器固定为卡片全宽。图片比例及固有尺寸可影响容器横向尺寸。`80` 已将带 `data-cfzn-library-card` 的外卡定位为 relative；但 `87` 的角标 `position:absolute; top:8px; right:8px` 会优先采用更近的图片容器作为定位包含块。故右边距实际相对图片容器，不能保证相对每张卡片外框一致。

当前结构与目标结构：

```text
当前 [data-cfzn-library-card]          目标 [data-cfzn-library-card]
  .cfzn-card-select                     .cfzn-card-select
  featuredImageContainer (relative)     .cfzn-card-compatibility
    .cfzn-card-compatibility            featuredImageContainer (relative)
    img                                  img
  原生名称、说明、元数据                 原生名称、说明、元数据
  .cfzn-card-footer                     .cfzn-card-footer
```

## 最小修改点

产品修改范围仅 `apps/web/scripts/openblock-hooks.mjs` 与 `apps/web/src/extensions/library.css`。`library.ts` 的文案、目录兼容判断、React16 构造、加载及移除动作均无需修改。

1. 在 `openblock-hooks.mjs` 的 `optional sibling card selection and compatibility slot` 精确 GUI hook 中，删除图片容器子节点处的 `this.props.cfznCard && this.props.cfznCard.badge,`；仍保留 `this.props.disabled && !this.props.cfznCard ?`，避免硬件卡片重新出现原生黄色 Coming Soon。
2. 在紧接着的 `selection sibling spans the full card body` hook 中，将 `cfznCard.badge` 插在 `cfznCard.select` 后、`featuredImageContainer` 前，成为卡片根的直接子节点。生成目标片段为：

   ```js
   onClick: this.props.cfznCard ? undefined : this.props.onClick
   }, this.props.cfznCard && this.props.cfznCard.select,
      this.props.cfznCard && this.props.cfznCard.badge,
      /*#__PURE__*/external_react_default.a.createElement("div", {
     className: library_item_default.a.featuredImageContainer
   }, this.props.disabled && !this.props.cfznCard ?
   ```

   沿用现有上游 SHA 校验、每处精确命中一次的检查及生成流程；只改 GUI 挂点，不手工修改生成产物，不接触 VM 或 Blockly 模块。
3. 将现有 `.cfzn-card-compatibility` 规则收窄为稳定业务选择器 `[data-cfzn-library-card] > .cfzn-card-compatibility`，只把 `top` 与 `right` 改为 `0`。外卡现有 `position:relative` 与 2px 边框已足够，不增加包装节点。保留 `left:auto`、1px `#c7cbd2` 灰边、`#f2f3f5` 浅灰底、`#60656f` 字色、2px 圆角、4px×8px 内边距、12px 字体、1.4 行高、原最大宽度、`z-index:3` 与 `pointer-events:none`。三种兼容文案统一采用此位置。

几何定义：卡片 `getBoundingClientRect()` 为 `c`、角标为 `b`，卡片计算边框为 `borderTopWidth` / `borderRightWidth`。目标 `b.top = c.top + borderTopWidth`，`b.right = c.right - borderRightWidth`；当前均为 2 CSS px 边框，容许最多 1 CSS px 的浮点测量误差。角标位于边框内侧，保留卡片原生圆角裁切，不负偏移盖住选中边框。

## 层级、交互与边界

主体选择按钮仍为根节点绝对铺满、z-index 2；角标 z-index 3 且不接收指针，点击其覆盖区域继续命中主体选择，不添加可聚焦元素。footer、移除按钮与原生教程链接保持 z-index 4；移除仍在底部，不移入右上角。名称、图像尺寸及 contain、蓝色选中边框、当前主控/已添加状态、忙状态、错误提示、筛选和焦点恢复沿用现状。

主控卡片的 compatibility 为空，因此不会新增角标；舞台扩展不供应 cfznCard，原生 Coming Soon、链接及其他渲染不受该可选分支影响。保留 Logo、原生菜单 48px、项目五按钮及保存状态、顶部实时/上传模式控件。没有公共接口、后端业务、HTTP、归档、目录支持矩阵、依赖、硬件或串口改动。

## 有界验收

开发完成后执行现有类型检查与构建。独立测试按冻结产物在隔离真实 dev、静态 dist 各做以下聚焦检查，不重新跑无关硬件或完整归档矩阵：

| 场景 | 必要证据 |
| --- | --- |
| 无主控的六模块 | 通过真实扩展入口进入模块分类；六角标均为外卡直接子节点且 `offsetParent === card`，图片容器内没有遗留角标；逐卡记录上述上下/右侧边距，截取整体截图，不能只数文本数量 |
| 不同图片与响应布局 | 至少覆盖宽屏多列、窄屏换行以及放大后有效 CSS 宽度变化；全部当前可见模块按自身卡框测量，不比较跨列的绝对 right 坐标；图片显示不变形/裁切，角标完整可读 |
| 三种兼容状态 | 无板、选择现有支持板、选择现有非支持原生板，分别核对三种真实文案及同一几何关系；不伪改 supportDevice 矩阵 |
| 选择、加载、移除 | 支持板下通过卡片主体加载一个无引用模块，核对已添加/蓝框及独立移除按钮；角标覆盖区域点击符合原主体语义，移除点击/键盘不触发添加；无主控/不支持仍不可添加 |
| 其他状态与固定边界 | 舞台/主控分类及 Coming Soon 无新增角标；Logo、五按钮/保存状态和顶部模式保留。核对 hook 改动仅 GUI library-item，178 VM 与 15 Blockly 模块逐字节保持原基线 |

测试环境拦截硬件请求并使用自身端口/浏览器，页面异常须为空；不操作用户 5173/3001/3002 服务、不请求串口授权、不访问 COM3、不编译烧录。

本设计回合未修改产品源码或产物，未启动服务、浏览器或测试，没有将源码结论写成浏览器/硬件验收通过。
