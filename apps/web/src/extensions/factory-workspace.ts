export const factoryBlocklyMedia = '/static/blocks-media/';

// Pinned Blockly uses shared focus, selection and floating fields across all injected workspaces.
export function createFactoryWorkspace(Blockly: any, host: HTMLElement, options: Record<string, unknown> & { toolbox?: Element | string | null }) {
  const main = Blockly.mainWorkspace;
  const selected = Blockly.selected;
  const clipboard = Blockly.clipboardXml_;
  const clipboardSource = Blockly.clipboardSource_;
  const cacheReferences = Blockly.Field.cacheReference_;
  const bounds = Blockly.DropDownDiv.boundsElement_;
  const defaultToolbox = Blockly.Blocks.defaultToolbox;
  let workspace: any;
  Blockly.Events.disable();
  try {
    // Match the native declaration editor: suppress the built-in toolbox fallback
    // while injecting a workspace that explicitly requests no toolbox.
    if (options.toolbox === null) Blockly.Blocks.defaultToolbox = null;
    workspace = Blockly.inject(host, { media: factoryBlocklyMedia, sounds: false, ...options });
  } finally {
    if (options.toolbox === null) Blockly.Blocks.defaultToolbox = defaultToolbox;
    Blockly.mainWorkspace = main;
    while (Blockly.Field.cacheReference_ > cacheReferences) Blockly.Field.stopCache();
    Blockly.Events.enable();
  }
  const owns = (owner: any) => {
    const source = owner?.sourceBlock_?.workspace;
    return source === workspace || source?.targetWorkspace === workspace;
  };
  const closeFields = () => {
    if (owns(Blockly.WidgetDiv.owner_)) Blockly.WidgetDiv.hide(true);
    if (owns(Blockly.DropDownDiv.owner_)) Blockly.DropDownDiv.hideWithoutAnimation();
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && (owns(Blockly.WidgetDiv.owner_) || owns(Blockly.DropDownDiv.owner_))) {
      const input = Blockly.FieldTextInput.htmlInput_;
      if (input && owns(Blockly.WidgetDiv.owner_)) input.value = input.defaultValue;
      closeFields();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target;
    const editing = target instanceof Element && target.closest('input, textarea, select, [contenteditable=true], .blocklyWidgetDiv, .blocklyDropDownDiv');
    if (editing || !(target instanceof Node)) return;
    const nativeWorkspace = host.contains(target) && Blockly.mainWorkspace === workspace;
    if (!nativeWorkspace && (event.key === 'Backspace' || event.key === 'Delete' || event.ctrlKey || event.metaKey)) {
      event.stopPropagation();
    }
  };
  host.ownerDocument.defaultView?.addEventListener('keydown', keys, true);
  return {
    workspace, closeFields,
    dispose() {
      host.ownerDocument.defaultView?.removeEventListener('keydown', keys, true);
      Blockly.Events.disable();
      try {
        closeFields();
        workspace.cancelCurrentGesture?.();
        workspace.dispose();
      } finally {
        Blockly.mainWorkspace = main;
        Blockly.DropDownDiv.setBoundsElement(bounds);
        Blockly.clipboardXml_ = clipboard;
        Blockly.clipboardSource_ = clipboardSource;
        if (selected?.workspace && Blockly.selected !== selected) selected.select();
        Blockly.Events.enable();
      }
    },
  };
}
