import { createHash } from 'node:crypto';

// These exact fragments belong to the pinned official release, not an arbitrary minified bundle.
// Source locations are retained here so upgrading the release is an explicit review.
export const upstreamSha256 = 'eb3f8ee4d4e4ce89ffff1b9aec0e4154b66d0044d79cdb1e6e97c7dcef0e6cb9';
const patches = [
  {
    source: 'src/components/menu-bar/menu-bar.jsx / one local brand image for both native overflow states',
    before: `alt: "OpenBlock",
        className: classnames_default()(menu_bar_default.a.openblockLogo, menu_bar_defineProperty({}, menu_bar_default.a.clickable, typeof this.props.onClickLogo !== 'undefined')),
        draggable: false,
        src: this.state.isOverflow ? this.props.logoSmall : this.props.logo,`,
    after: `alt: window.CFZNOpenBlock ? "CFZN IDE" : "OpenBlock",
        className: classnames_default()(menu_bar_default.a.openblockLogo, menu_bar_defineProperty({}, menu_bar_default.a.clickable, typeof this.props.onClickLogo !== 'undefined')),
        draggable: false,
        "data-cfzn-brand-logo": window.CFZNOpenBlock ? true : undefined,
        src: window.CFZNOpenBlock ? "/branding/IDE.png" : this.state.isOverflow ? this.props.logoSmall : this.props.logo,`,
  },
  {
    source: 'src/containers/blocks.jsx / compose native base and external hardware categories',
    before: `return Object(make_toolbox_xml["a" /* default */])(false, device, target.isStage, target.id, dynamicBlocksXML, this.props.isRealtimeMode, targetCostumes[targetCostumes.length - 1].name, stageCostumes[stageCostumes.length - 1].name, targetSounds.length > 0 ? targetSounds[targetSounds.length - 1].name : '');`,
    after: `var nativeToolbox = Object(make_toolbox_xml["a" /* default */]);
        var toolboxArgs = [false, device, target.isStage, target.id, dynamicBlocksXML, this.props.isRealtimeMode, targetCostumes[targetCostumes.length - 1].name, stageCostumes[stageCostumes.length - 1].name, targetSounds.length > 0 ? targetSounds[targetSounds.length - 1].name : ''];
        return window.CFZNOpenBlock ? window.CFZNOpenBlock.composeToolbox(nativeToolbox, toolboxArgs, this.props.locale) : nativeToolbox.apply(null, toolboxArgs);`,
  },
  {
    source: 'src/containers/blocks.jsx / capture readonly category event before palette filtering',
    before: 'var deviceId = extensionInfo.deviceId,\n          categoryInfoArray = extensionInfo.categoryInfoArray;',
    after: 'var deviceId = extensionInfo.deviceId,\n          categoryInfoArray = extensionInfo.categoryInfoArray;\n      if (window.CFZNOpenBlock) window.CFZNOpenBlock.captureController(extensionInfo, this.props.vm.getLocale(), this.props.vm.runtime.getDevice().deviceId);',
  },
  {
    source: 'src/containers/blocks.jsx / rebuild flyout on mode change without recycling stale disabled blocks',
    before: 'this.workspace.updateToolbox(this.props.toolboxXML);',
    after: `var cfznResetFlyout = window.CFZNOpenBlock && this._cfznFlyoutRealtime !== this.props.isRealtimeMode;
        if (cfznResetFlyout) this.workspace.getFlyout().setRecyclingEnabled(false);
        var cfznToolboxEvents = this.ScratchBlocks.Events;
        var cfznToolboxRecordUndo = cfznToolboxEvents.recordUndo;
        if (window.CFZNOpenBlock) cfznToolboxEvents.recordUndo = false;
        try { this.workspace.updateToolbox(window.CFZNOpenBlock ? window.CFZNOpenBlock.paletteToolbox(this.workspace, this.props.toolboxXML) : this.props.toolboxXML); }
        finally {
          cfznToolboxEvents.recordUndo = cfznToolboxRecordUndo;
          if (cfznResetFlyout) this.workspace.getFlyout().setRecyclingEnabled(true);
        }
        this._cfznFlyoutRealtime = this.props.isRealtimeMode;`,
  },
  {
    source: 'src/containers/blocks.jsx / attach isolated palette search after native workspace injection',
    before: 'this.workspace = this.ScratchBlocks.inject(this.blocks, workspaceConfig);',
    after: 'this.workspace = this.ScratchBlocks.inject(this.blocks, workspaceConfig);\n      if (window.CFZNOpenBlock) window.CFZNOpenBlock.attachPaletteSearch(this.ScratchBlocks, this.workspace, this.props.toolboxXML, this.requestToolboxUpdate.bind(this));',
  },
  {
    source: 'src/containers/blocks.jsx / detach only the disposed palette workspace',
    before: 'this.detachVM();\n      this.workspace.dispose();',
    after: 'if (window.CFZNOpenBlock) window.CFZNOpenBlock.detachPaletteSearch(this.workspace);\n      this.detachVM();\n      this.workspace.dispose();',
  },
  {
    source: 'src/containers/blocks.jsx / native category and scroll restoration after toolbox queue',
    before: 'queue.forEach(function (fn) {\n        return fn();\n      });',
    after: 'queue.forEach(function (fn) {\n        return fn();\n      });\n      if (window.CFZNOpenBlock) window.CFZNOpenBlock.paletteDidUpdate(this.workspace);',
  },
  {
    source: 'src/containers/blocks.jsx / native React palette search portal',
    before: 'external_react_default.a.createElement(external_react_default.a.Fragment, null, /*#__PURE__*/external_react_default.a.createElement(DroppableBlocks,',
    after: 'external_react_default.a.createElement(external_react_default.a.Fragment, null, window.CFZNOpenBlock ? window.CFZNOpenBlock.renderPaletteSearch(external_react_default.a) : null, /*#__PURE__*/external_react_default.a.createElement(DroppableBlocks,',
  },
  {
    source: 'src/containers/blocks.jsx / defer archive workspace XML until all module definitions are registered',
    before: 'if (this.props.vm.editingTarget && !this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id]) {',
    after: 'if (window.CFZNOpenBlock && window.CFZNOpenBlock.deferWorkspaceUpdate()) return;\n      if (this.props.vm.editingTarget && !this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id]) {',
  },
  {
    source: 'src/containers/blocks.jsx / session owns applied baud, board defaults do not overwrite it',
    before: 'if (dev.defaultBaudRate) {\n          this.props.onSetBaudrate(dev.defaultBaudRate);',
    after: 'if (dev.defaultBaudRate && !window.CFZNOpenBlock) {\n          this.props.onSetBaudrate(dev.defaultBaudRate);',
  },
  {
    source: 'src/containers/blocks.jsx / stable GUI listener guards workspace stack clicks',
    matches: 3,
    before: 'this.props.vm.blockListener',
    after: '(window.CFZNOpenBlock ? window.CFZNOpenBlock.blockListener(this.props.vm) : this.props.vm.blockListener)',
  },
  {
    source: 'src/containers/controls.jsx / stage green flag checks unsupported mixed scripts',
    before: 'value: function handleGreenFlagClick(e) {\n      e.preventDefault();',
    after: 'value: function handleGreenFlagClick(e) {\n      e.preventDefault();\n      if (!e.shiftKey && window.CFZNOpenBlock && !window.CFZNOpenBlock.canRunStage()) return;',
  },
  {
    source: 'src/containers/stage.jsx / stage mouse entry does not start unsafe sprite or broadcast scripts',
    matches: 2,
    before: "this.props.vm.postIOData('mouse', data);",
    after: "if (!window.CFZNOpenBlock || window.CFZNOpenBlock.allowStageInput()) this.props.vm.postIOData('mouse', data);",
  },
  {
    source: 'src/lib/vm-listener-hoc.jsx / stage key entry checks unsupported mixed scripts',
    before: "// Don't capture keys intended for Blockly inputs.\n        if (e.target !== document && e.target !== document.body) return;",
    after: "// Don't capture keys intended for Blockly inputs.\n        if (e.target !== document && e.target !== document.body) return;\n        if (window.CFZNOpenBlock && !window.CFZNOpenBlock.allowStageInput()) return;",
  },
  {
    source: 'src/components/library-item/library-item.jsx / controller title selects card, footer retains help link',
    before: 'className: library_item_default.a.libraryItemName,\n        href: this.props.learnMore,\n        rel: "noopener noreferrer",\n        target: "_blank",\n        onClick: this.props.onClickLearnMore ? this.props.onClickLearnMore : null',
    after: 'className: library_item_default.a.libraryItemName,\n        href: this.props.deviceId ? undefined : this.props.learnMore,\n        rel: "noopener noreferrer",\n        target: "_blank",\n        onClick: this.props.deviceId ? null : this.props.onClickLearnMore ? this.props.onClickLearnMore : null',
  },
  {
    source: 'src/components/menu-bar/menu-bar.jsx / two explicit buttons at original mode position',
    before: `}, /*#__PURE__*/external_react_default.a.createElement(index_es["a" /* FormattedMessage */], {
        defaultMessage: "Program Mode",
        id: "gui.menu-bar.programMode"
      }), /*#__PURE__*/external_react_default.a.createElement(react_switch_default.a, {
        className: menu_bar_default.a.programModeSwitch,
        onChange: this.handleProgramModeSwitchOnChange,
        checked: !this.props.isRealtimeMode,
        disabled: this.props.isToolboxUpdating || !this.props.isSupportSwitchMode,
        height: 25,
        width: 45,
        onColor: this.props.isToolboxUpdating || !this.props.isSupportSwitchMode ? '#888888' : '#008800',
        offColor: this.props.isToolboxUpdating || !this.props.isSupportSwitchMode ? '#888888' : '#FF8C1A',
        uncheckedIcon: false,
        checkedIcon: false
      }))`,
    after: `}, window.CFZNOpenBlock ? window.CFZNOpenBlock.renderModeControls(external_react_default.a) : null)`,
  },
  {
    source: 'src/components/hardware/hardware.jsx / real native CodeEditor inside upload workspace',
    before: 'var hardware_HardwareComponent = function HardwareComponent(props) {',
    after: 'var hardware_HardwareComponent = function HardwareComponent(props) {\n  if (window.CFZNOpenBlock) return window.CFZNOpenBlock.renderUploadWorkspace(external_react_default.a, containers_code_editor, props);',
  },
  {
    source: 'src/components/hardware-header/hardware-header.jsx / remove duplicate bottom header',
    before: 'var hardware_header_HardwareHeaderComponent = function HardwareHeaderComponent(props) {',
    after: 'var hardware_header_HardwareHeaderComponent = function HardwareHeaderComponent(props) {\n  if (window.CFZNOpenBlock) return null;',
  },
  {
    source: 'src/components/menu-bar/menu-bar.jsx / selected controller label',
    before: 'this.props.deviceName ? /*#__PURE__*/external_react_default.a.createElement("span", null, this.props.deviceName)',
    after: 'this.props.deviceName ? /*#__PURE__*/external_react_default.a.createElement("span", { "data-cfzn-current-device": true }, this.props.deviceName)',
  },
  {
    source: 'src/containers/blocks.jsx / external UI mode choice does not fabricate device capabilities',
    before: 'if (supportUploadMode && supportRealtimeMode) {\n          this.props.onSetSupportSwitchMode(true);',
    after: 'if (window.CFZNOpenBlock) { this.props.onSetSupportSwitchMode(true); } else if (supportUploadMode && supportRealtimeMode) {\n          this.props.onSetSupportSwitchMode(true);',
  },
  {
    source: 'src/containers/blocks.jsx / preserve retained draft during actual runtime mode change',
    before: "this.props.onSetCodeEditorValue('');\n        this.onProgramModeUpdate();",
    after: "if (!window.CFZNOpenBlock) this.props.onSetCodeEditorValue('');\n        this.onProgramModeUpdate();",
  },
  {
    source: 'src/containers/blocks.jsx / use original Arduino generator with truthful errors',
    before: 'value: function onCodeNeedUpdate() {\n      if (this.props.isCodeEditorLocked) {',
    after: 'value: function onCodeNeedUpdate() {\n      if (window.CFZNOpenBlock) { if (!this.props.isRealtimeMode) window.CFZNOpenBlock.generateCode(this.ScratchBlocks, this.workspace); return; }\n      if (this.props.isCodeEditorLocked) {',
  },
  {
    source: 'src/containers/connection-modal.jsx / native modal shell, external serial body',
    before: 'return /*#__PURE__*/external_react_default.a.createElement(connection_modal_ConnectionModalComponent, {\n        connectingMessage:',
    after: `if (window.CFZNOpenBlock && window.CFZNOpenBlock.supportsHardware(this.props.deviceId)) return window.CFZNOpenBlock.renderConnection(external_react_default.a, containers_modal, this.props);
      return /*#__PURE__*/external_react_default.a.createElement(connection_modal_ConnectionModalComponent, {
        connectingMessage:`,
  },
  {
    source: 'src/containers/hardware-header.jsx / use actual current code, single controller',
    before: 'value: function handleUpload() {\n      if (this.props.peripheralName) {',
    after: `value: function handleUpload() {
      if (window.CFZNOpenBlock && window.CFZNOpenBlock.supportsHardware(this.props.deviceId)) { window.CFZNOpenBlock.openHardware(); return; }
      if (this.props.peripheralName) {`,
  },
  {
    source: 'src/components/hardware-header/hardware-header.jsx / compile settings in native header',
    before: 'className: hardware_header_default.a.uploadGroup\n  }, /*#__PURE__*/external_react_default.a.createElement("div", {',
    after: 'className: hardware_header_default.a.uploadGroup\n  }, window.CFZNOpenBlock && window.CFZNOpenBlock.renderHardwareTools(external_react_default.a), /*#__PURE__*/external_react_default.a.createElement("div", {',
  },
  {
    source: 'src/containers/upload-progress.jsx / subscribed state, cached logs, no false timeout',
    before: '))(upload_progress_UploadProgress));\n// EXTERNAL MODULE: ./src/components/telemetry-modal/telemetry-modal.css',
    after: `))(function (props) { return window.CFZNOpenBlock && window.CFZNOpenBlock.supportsHardware(props.deviceId) ? window.CFZNOpenBlock.renderHardwareProgress(external_react_default.a, containers_modal, props) : external_react_default.a.createElement(upload_progress_UploadProgress, props); }));
// EXTERNAL MODULE: ./src/components/telemetry-modal/telemetry-modal.css`,
  },
  {
    source: 'src/components/menu-bar/menu-bar.jsx / preserve native root ref and add scoped host',
    before: 'className: classnames_default()(this.props.className, menu_bar_default.a.menuBar),\n        componentRef: this.containerRef',
    after: 'className: classnames_default()(this.props.className, menu_bar_default.a.menuBar),\n        "data-cfzn-menu-host": true,\n        componentRef: this.containerRef',
  },
  {
    source: 'src/components/menu-bar/menu-bar.jsx / direct project controls before tailMenu',
    before: '})), /*#__PURE__*/external_react_default.a.createElement("div", {\n        className: menu_bar_default.a.tailMenu',
    after: '})), window.CFZNOpenBlock && window.CFZNOpenBlock.renderProjectTools(external_react_default.a), /*#__PURE__*/external_react_default.a.createElement("div", {\n        className: menu_bar_default.a.tailMenu',
  },
  {
    source: 'src/components/menu-bar/menu-bar.jsx / omit only redundant native File entry',
    before: 'this.props.canManageFiles && /*#__PURE__*/external_react_default.a.createElement("div", {\n        className: classnames_default()(menu_bar_default.a.menuBarItem, menu_bar_default.a.hoverable, menu_bar_defineProperty({}, menu_bar_default.a.active, this.props.fileMenuOpen)),',
    after: 'this.props.canManageFiles && !window.CFZNOpenBlock && /*#__PURE__*/external_react_default.a.createElement("div", {\n        className: classnames_default()(menu_bar_default.a.menuBarItem, menu_bar_default.a.hoverable, menu_bar_defineProperty({}, menu_bar_default.a.active, this.props.fileMenuOpen)),',
  },
  {
    source: 'src/components/menu-bar/menu-bar.jsx / remove duplicate project download icon beside title',
    before: `, this.props.canManageFiles && /*#__PURE__*/external_react_default.a.createElement(sb3_downloader, null, function (className, downloadProjectCallback) {
        return /*#__PURE__*/external_react_default.a.createElement("div", {
          className: classnames_default()(menu_bar_default.a.menuBarItem, menu_bar_default.a.hoverable),
          onClick: _this7.getSaveToComputerHandler(downloadProjectCallback)
        }, /*#__PURE__*/external_react_default.a.createElement("img", {
          className: menu_bar_default.a.saveIcon,
          src: icon_save_default.a
        }));
      })`,
    after: '',
  },
  {
    source: 'src/components/library/library.jsx / filterBar optional child',
    before: 'className: library_default.a.filterBar\n      }, this.props.filterable &&',
    after: 'className: library_default.a.filterBar\n      }, this.props.categoryControls, this.props.filterable &&',
  },
  {
    source: 'src/components/library-item/library-item.jsx / featured-card keyboard semantics',
    before: 'this.props.hidden ? library_item_default.a.hidden : null),\n        onClick: this.props.onClick',
    after: `this.props.hidden ? library_item_default.a.hidden : null),
        role: this.props.cfznCard ? undefined : "button",
        tabIndex: this.props.cfznCard ? undefined : this.props.disabled ? -1 : 0,
        "aria-disabled": this.props.cfznCard ? undefined : !!this.props.disabled,
        "aria-pressed": this.props.cfznCard ? undefined : !!this.props.isLoaded,
        "data-cfzn-controller-selected": this.props.deviceId && this.props.isLoaded ? "true" : undefined,
        "data-cfzn-library-card": this.props.cfznCard && this.props.cfznCard.key,
        "data-cfzn-selected": this.props.cfznCard && this.props.cfznCard.selected ? "true" : undefined,
        "aria-label": !this.props.cfznCard && typeof this.props.name === "string" ? this.props.name : undefined,
        onKeyDown: function (event) { if (!this.props.cfznCard && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) this.props.onClick(event); }.bind(this),
        onClick: this.props.cfznCard ? undefined : this.props.onClick`,
  },
  {
    source: 'src/components/library/library.jsx / optional disabled reason forwarding',
    before: 'disabled: dataItem.disabled,\n          extensionId: dataItem.extensionId,',
    after: 'disabled: dataItem.disabled,\n          disabledReason: dataItem.disabledReason,\n          cfznCard: dataItem.cfznCard,\n          extensionId: dataItem.extensionId,',
  },
  {
    source: 'src/containers/library-item.jsx / optional disabled reason forwarding',
    before: 'disabled: this.props.disabled,\n        extensionId: this.props.extensionId,',
    after: 'disabled: this.props.disabled,\n        disabledReason: this.props.disabledReason,\n        cfznCard: this.props.cfznCard,\n        extensionId: this.props.extensionId,',
  },
  {
    source: 'src/components/library-item/library-item.jsx / truthful optional disabled reason',
    before: 'className: library_item_default.a.comingSoonText\n      }, /*#__PURE__*/external_react_default.a.createElement(index_es["a" /* FormattedMessage */], {',
    after: 'className: library_item_default.a.comingSoonText\n      }, this.props.disabledReason || /*#__PURE__*/external_react_default.a.createElement(index_es["a" /* FormattedMessage */], {',
  },
  {
    source: 'src/components/library-item/library-item.jsx / optional sibling card selection and compatibility slot',
    before: 'className: library_item_default.a.featuredImageContainer\n      }, this.props.disabled ?',
    after: 'className: library_item_default.a.featuredImageContainer\n      }, this.props.disabled && !this.props.cfznCard ?',
  },
  {
    source: 'src/components/library-item/library-item.jsx / selection sibling spans the full card body',
    before: 'onClick: this.props.cfznCard ? undefined : this.props.onClick\n      }, /*#__PURE__*/external_react_default.a.createElement("div", {\n        className: library_item_default.a.featuredImageContainer',
    after: 'onClick: this.props.cfznCard ? undefined : this.props.onClick\n      }, this.props.cfznCard && this.props.cfznCard.select, this.props.cfznCard && this.props.cfznCard.badge, /*#__PURE__*/external_react_default.a.createElement("div", {\n        className: library_item_default.a.featuredImageContainer',
  },
  {
    source: 'src/components/library-item/library-item.jsx / optional sibling card footer',
    before: 'id: "gui.extensionLibrary.notLoaded"\n      })))) : null) :',
    after: 'id: "gui.extensionLibrary.notLoaded"\n      })))) : null, this.props.cfznCard && this.props.cfznCard.footer) :',
  },
  {
    source: 'src/components/library/library.jsx / optional native search reset on partition change',
    before: 'value: function componentDidUpdate(prevProps, prevState) {\n      if (prevState.filterQuery',
    after: 'value: function componentDidUpdate(prevProps, prevState) {\n      if (this.props.cfznResetKey !== undefined && this.props.cfznResetKey !== prevProps.cfznResetKey) this.handleFilterClear();\n      if (prevState.filterQuery',
  },
  {
    source: 'src/components/library/library.jsx / optional filtered empty result slot',
    before: '}, this.state.loaded ? this.getFilteredData().map(function (dataItem, index) {',
    after: '}, this.state.loaded && this.props.renderEmpty && this.getFilteredData().length === 0 ? this.props.renderEmpty(this.handleFilterClear) : null, this.state.loaded ? this.getFilteredData().map(function (dataItem, index) {',
  },
  {
    source: 'src/containers/blocks.jsx / reset public Blockly device view on native removal',
    before: 'this.props.onDeviceSelected(null, null, null);',
    after: 'this.props.onDeviceSelected(null, null, null);\n        if (window.CFZNOpenBlock) this.ScratchBlocks.Device.setDevice(null, null);',
  },
  {
    source: 'src/containers/blocks.jsx / select a surviving category after removal',
    before: 'var currentCategoryPos = this.workspace.toolbox_.getCategoryPositionById(categoryId);',
    after: 'if (window.CFZNOpenBlock) categoryId = window.CFZNOpenBlock.fallbackCategory(this.workspace, categoryId, this.props.toolboxXML);\n      var currentCategoryPos = this.workspace.toolbox_.getCategoryPositionById(categoryId);',
  },
  {
    source: 'src/containers/language-selector.jsx / prevent locale remount during an extension transaction',
    before: 'var newLocale = e.target.value;\n\n      if (this.props.messagesByLocale[newLocale]) {',
    after: 'var newLocale = e.target.value;\n      if (window.CFZNOpenBlock && !window.CFZNOpenBlock.canChangeLocale()) return;\n      if (this.props.messagesByLocale[newLocale]) {',
  },
  {
    source: 'src/containers/blocks.jsx / coordinate native locale refresh with removal commands',
    before: 'this.props.vm.setLocale(this.props.locale, this.props.messages).then(function () {',
    after: 'var cfznLocaleDone = window.CFZNOpenBlock ? window.CFZNOpenBlock.beginLocaleUpdate() : function () {};\n      this.props.vm.setLocale(this.props.locale, this.props.messages).finally(cfznLocaleDone).then(function () {',
  },
  {
    source: 'src/containers/extension-library.jsx / render boundary',
    before: 'var extensionLibraryThumbnailData = [];\n      var device = this.props.deviceData.find',
    after: `if (window.CFZNOpenBlock) return window.CFZNOpenBlock.renderLibrary(external_react_default.a, library_library, this.props, libraries_extensions, false);
      var extensionLibraryThumbnailData = [];
      var device = this.props.deviceData.find`,
  },
  {
    source: 'src/containers/device-library.jsx / render boundary (preserve official boards)',
    before: 'var deviceLibraryThumbnailData = this.props.deviceData.map',
    after: `if (window.CFZNOpenBlock) return window.CFZNOpenBlock.renderLibrary(external_react_default.a, library_library, this.props, libraries_extensions, true);
      var deviceLibraryThumbnailData = this.props.deviceData.map`,
  },
  {
    source: 'src/lib/libraries/devices/index.jsx / mutable metadata registration',
    before: 'var makeDeviceLibrary = function makeDeviceLibrary() {',
    after: `window.CFZNDeviceMetadata = deviceData;
var makeDeviceLibrary = function makeDeviceLibrary() {`,
  },
];

export function patchOpenBlock(original) {
  if (patches.some(patch => !patch.source.startsWith('src/'))) throw new Error('VM source hooks are prohibited; use the external adapter.');
  if (createHash('sha256').update(original).digest('hex') !== upstreamSha256) {
    throw new Error('OpenBlock hook input hash mismatch. Review the pinned upstream release before upgrading.');
  }
  let patched = original;
  for (const patch of patches) {
    if (patched.split(patch.before).length !== (patch.matches ?? 1) + 1) throw new Error(`OpenBlock hook match count changed: ${patch.source}`);
    patched = patched.split(patch.before).join(patch.after);
  }
  return patched;
}

export function moduleSource(source, kind) {
  const functions = { blocks: 'registerBlocks', generator: 'registerGenerators', toolbox: 'registerToolboxs', translations: 'registerBlocksMessages' };
  const name = functions[kind];
  if (!name || !source.includes(`function ${name} (`)) throw new Error(`Missing explicit module function for ${kind}`);
  // Keep the upstream implementation, remove only its classic-script/CommonJS export scaffolding.
  return source.replace(/if \(typeof module !== 'undefined'\) \{\s*module\.exports = \{getInterfaceTranslations\};\s*\}/g, '')
    // The pinned Blockly category parser requires hex; this is the identical old buzzer colour.
    .replaceAll('rgb(185,67,255)', '#B943FF')
    .replace(/^exports = \w+;\s*$/gm, '') + `\nexport default ${name};\n`;
}
