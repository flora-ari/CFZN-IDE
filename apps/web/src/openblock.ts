import { ARCHIVE_MIME, archiveName, envelope, isEnvelope, isProjectToolbarState } from './editor-protocol';
import type { EditorSnapshot, ProjectArchive } from './editor-protocol';
import { installDeviceMetadata } from './extensions/aijite';
import { installExtensionAdapter } from './extensions/adapter';
import type { ExtensionAdapter } from './extensions/adapter';
import { makeLibraryRenderer } from './extensions/library';
import { nativeProjectToolbar } from './native-project-toolbar';
import { nativeHardware } from './native-hardware';
import { controllerIds } from './extensions/catalog';
import { ModeController } from './mode-controller';
import { modeUi } from './mode-ui';
import { installSaveShortcut } from './save-shortcut';
import { PaletteSearch } from './palette-search';
import { SEARCH_CATEGORY } from './palette-index';
import { addEditorMetadata, readEditorMetadata, defaultEditorMetadata } from './editor-archive';
import { ToolboxPresentation, uploadOnlyBoards } from './extensions/toolbox-presentation';
import { executionGraphs, unsafeStageOpcode } from './extensions/stage-execution';

interface GuiState {
  projectChanged: boolean;
  projectTitle: string;
  projectState: { loadingState: string };
  vmStatus: { running: boolean };
  mode?: { isFullScreen: boolean; isPlayerOnly: boolean };
  modals?: Record<string, boolean>;
  code: { codeEditorValue: string };
}

interface GuiStore {
  getState(): { scratchGui: GuiState };
  subscribe(listener: () => void): () => void;
  dispatch(action: { type: string; [name: string]: unknown }): void;
}

interface OpenBlockVm {
  runtime: any;
  loadProject(bytes: ArrayBuffer): Promise<void>;
  saveProjectSb3(): Promise<Blob>;
  toJSON(): string;
  greenFlag(): void;
  stopAll(): void;
  on(event: string, listener: () => void): void;
}

const upstream = window as unknown as {
  GUI?: { default: unknown; AppStateHOC(component: unknown): unknown; setAppElement(element: HTMLElement): void };
  React?: { createElement(component: unknown, props: object): unknown };
  ReactDOM?: { render(element: unknown, container: HTMLElement): { store: GuiStore } };
};

const defaultTitle = '未命名项目';
const origin = window.location.origin;
const projectAction = 'scratch-gui/project-state/';
const modalAction = 'scratch-gui/modals/';
const bootMessage = document.getElementById('boot-message')!;
let vm: OpenBlockVm;
let store: GuiStore;
let defaultArchive: ArrayBuffer;
let ready = false;
let loading = false;
let documentId = 0;
let editVersion = 0;
let savedVersion = 0;
let lastTitle = '';
let lastRunning = false;
let nativeNew = false;
let changedQueued = false;
let updatingPersistedTitle = false;
let extensions: ExtensionAdapter;
let hardwareUi: ReturnType<typeof nativeHardware>;
let modes: ModeController;
const toolbox = new ToolboxPresentation();
const guardedListeners = new WeakMap<object, (event: any) => void>();
let executionWarning = '';
let passiveWarning = '';
let localePending = 0;
const modeViews = modeUi(() => modes, () => hardwareUi);
let lastToolbarHidden = false;
function documentDisabled() {
  const gui = store?.getState().scratchGui;
  return !ready || loading || nativeNew || !!extensions?.status.busy || !!modes?.transitioning ||
    !!hardwareUi?.hardware.busy || !!hardwareUi?.session.operation || !!(gui?.mode?.isFullScreen || gui?.mode?.isPlayerOnly) ||
    Object.values(gui?.modals ?? {}).some(Boolean);
}
const projectTools = nativeProjectToolbar({
  editorView: () => {
    const gui = store?.getState().scratchGui;
    const player = !!(gui?.mode?.isFullScreen || gui?.mode?.isPlayerOnly);
    return { player, hidden: player || Object.values(gui?.modals ?? {}).some(Boolean),
      disabled: documentDisabled() };
  },
  action: action => {
    if (action !== 'projects' && (projectTools.state.documentActionsDisabled || loading || nativeNew || !ready)) return;
    send('PROJECT_TOOLBAR_ACTION', { action });
  },
  import: chooseImport,
});
installSaveShortcut(document, () => projectTools.request('save'), () => projectTools.canRequest('save'));
const paletteSearch = new PaletteSearch(() => JSON.stringify([documentId, (vm as any)?.editingTarget?.id,
  (vm as any)?.getLocale(), modes?.editorMode, extensions?.currentDevice(), extensions?.loaded(), editVersion]), () => !documentDisabled());

function send(type: string, payload?: unknown, requestId?: string, transfer: Transferable[] = []) {
  if (window.parent !== window) window.parent.postMessage(envelope(type, payload, requestId), origin, transfer);
}

function snapshot(): EditorSnapshot {
  const gui = store.getState().scratchGui;
  return {
    title: gui.projectTitle || defaultTitle,
    dirty: editVersion !== savedVersion,
    running: gui.vmStatus.running,
    documentId,
    editVersion,
  };
}

function notifyChanged() {
  if (!ready || loading || nativeNew || changedQueued) return;
  changedQueued = true;
  queueMicrotask(() => {
    changedQueued = false;
    if (!loading && !nativeNew) send('CHANGED', snapshot());
  });
}

function setGuiDirty(changed: boolean) {
  if (store.getState().scratchGui.projectChanged !== changed) {
    store.dispatch({ type: 'scratch-gui/project-changed/SET_PROJECT_CHANGED', changed });
  }
}

function setGuiTitle(title: string) {
  store.dispatch({ type: 'projectTitle/SET_PROJECT_TITLE', title });
}

function watchStore() {
  const gui = store.getState().scratchGui;
  const toolbarHidden = !!(gui.mode?.isFullScreen || gui.mode?.isPlayerOnly) || Object.values(gui.modals ?? {}).some(Boolean);
  if (toolbarHidden && !lastToolbarHidden && projectTools.state.drawer) {
    // Close the active parent drawer through its existing toggle intent before a native overlay takes priority.
    send('PROJECT_TOOLBAR_ACTION', { action: projectTools.state.drawer });
  }
  lastToolbarHidden = toolbarHidden;
  projectTools.refresh();
  paletteSearch.syncContext();
  hardwareUi?.hardware.changed();
  const titleChanged = gui.projectTitle !== lastTitle;
  const runningChanged = gui.vmStatus.running !== lastRunning;
  lastTitle = gui.projectTitle;
  lastRunning = gui.vmStatus.running;
  if (!ready || loading) return;
  if (gui.projectState.loadingState === 'FETCHING_NEW_DEFAULT') nativeNew = true;
  if (nativeNew) return;
  if (titleChanged && !updatingPersistedTitle) {
    editVersion++;
    setGuiDirty(true);
  }
  if (titleChanged || runningChanged) notifyChanged();
}

function bindVm(value: OpenBlockVm) {
  // Native locale providers remount the GUI while retaining its VM. Keep one adapter/session
  // and subscription set; the remounted GUI owns its new workspace and rendering callbacks.
  if (vm === value && extensions) return;
  vm = value;
  extensions = installExtensionAdapter(vm, installDeviceMetadata(window), {
    getStore: () => store,
    isProjectLoading: () => loading || nativeNew || !ready,
    isHardwareBusy: () => !!(hardwareUi?.hardware.busy || hardwareUi?.session.operation),
    operationBlockedReason: () => modes?.transitioning ? '模式正在切换，请稍候。' : localePending ? '语言正在更新，请稍候。' : '',
    clearBlockedReason: () => hardwareUi?.session.portId || hardwareUi?.session.sessionId || modes?.protocolActive ? '请先在连接弹窗断开串口，再移除主控。' : '',
    presentation: toolbox,
    archiveSave: archive => addEditorMetadata(archive, modes.metadata()),
    onChanged: () => {
      if (!ready || loading || nativeNew) return;
      editVersion++;
      setGuiDirty(true);
      notifyChanged();
    },
  });
  modes = new ModeController(vm, () => store, () => !ready || loading || nativeNew ? '项目正在加载，请稍候。' :
    hardwareUi?.hardware.busy ? '硬件作业进行中，请等待完成或取消并等待工具退出。' :
    hardwareUi?.session.operation ? '串口操作进行中，请稍候。' :
    extensions.status.busy ? `正在${extensions.status.label}，请稍候。` : '', () => {
      if (!ready || loading || nativeNew || extensions.suppressChanges) return;
      editVersion++; setGuiDirty(true); notifyChanged();
    });
  const rawLoad = vm.loadProject.bind(vm);
  vm.loadProject = async bytes => {
    // Native startup also accepts its embedded JSON object; user archives are ZIP ArrayBuffers.
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : ArrayBuffer.isView(bytes) ? new Uint8Array((bytes as ArrayBufferView).buffer) : null;
    const metadata = data?.[0] === 0x50 && data?.[1] === 0x4b ? readEditorMetadata(data.buffer as ArrayBuffer) : defaultEditorMetadata();
    toolbox.reset();
    await rawLoad(bytes);
    await modes.restore(metadata);
  };
  hardwareUi = nativeHardware(vm, () => ({ deviceId: extensions.currentDevice(), moduleIds: extensions.loaded(),
    realtime: modes.protocolActive, programming: modes.editorMode === 'programming',
    generationError: modes.codeMode === 'generated' ? modes.generationError : '',
    code: modes.selectedSource, documentId, editVersion }), () => store, () => modes.transitioning || extensions.status.busy,
    () => !ready || loading || nativeNew ? '项目正在加载，请稍候。' : modes.transitioning ? '模式正在切换，请稍候。' : extensions.status.busy ? `正在${extensions.status.label}，请稍候。` : '');
  modeViews.refresh();
  vm.on('PROGRAM_MODE_UPDATE', () => { modes.nativeUpdated(); });
  modes.subscribe(() => { projectTools.refresh(); paletteSearch.syncContext(); });
  extensions.subscribe(() => modes.nativeUpdated());
  hardwareUi.hardware.subscribe(() => { projectTools.refresh(); modes.publish(); });
  extensions.subscribe(projectTools.refresh);
  vm.on('PROJECT_CHANGED', () => {
    if (!ready || loading || nativeNew || extensions?.suppressChanges) return;
    if (vm.runtime.isRealtimeMode() && store.getState().scratchGui.vmStatus.running && stageViolation()) canRunStage();
    editVersion++;
    setGuiDirty(true);
    notifyChanged();
  });
}

function stageViolation(clickedId?: string): string | null {
  if (!vm.runtime.isRealtimeMode()) return '请切换到编程模式运行舞台；硬件程序请在上传模式生成并烧录。';
  const graphs = executionGraphs(vm), id = extensions.currentDevice() ?? '';
  const unsupported = toolbox.unsupportedOpcodes(id);
  if (uploadOnlyBoards.has(id)) for (const graph of graphs) for (const block of Object.values(graph.blocks)) if (block.opcode.startsWith('arduino_')) unsupported.add(block.opcode);
  const editingIndex = vm.runtime.targets.indexOf((vm as any).editingTarget);
  if (clickedId) {
    let block: any = (vm as any).editingTarget?.blocks.getBlock(clickedId);
    while (block?.parent) block = (vm as any).editingTarget.blocks.getBlock(block.parent);
    if (block?.opcode === 'event_whenarduinobegin') return 'Arduino 启动脚本仅用于上传模式，请切换模式后生成并烧录。';
  }
  const opcode = unsafeStageOpcode(graphs, unsupported, clickedId ? { graph: editingIndex, id: clickedId } : undefined);
  return opcode ? `积木 ${opcode} 仅上传模式可用。请切换上传模式，或将硬件程序放在独立的 Arduino 启动脚本中，再运行纯舞台程序。` : null;
}
function canRunStage(clickedId?: string) {
  if (!vm || !extensions) return true;
  const reason = stageViolation(clickedId);
  if (!reason) { if (executionWarning && modes.error === executionWarning) { modes.error = ''; modes.publish(); } executionWarning = ''; passiveWarning = ''; return true; }
  passiveWarning = reason;
  vm.stopAll(); executionWarning = reason; modes.error = reason; modes.publish();
  return false;
}
function allowStageInput() {
  if (!vm || !extensions || !vm.runtime.isRealtimeMode()) return false;
  const reason = stageViolation();
  if (!reason) { passiveWarning = ''; return true; }
  if (passiveWarning !== reason) canRunStage();
  return false;
}

function nextFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function bootFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  bootMessage.textContent = `OpenBlock 启动失败：${message}`;
  send('BOOT_ERROR', { message });
}

async function projectLoaded() {
  // The GUI callback occurs during a React 16 commit; allow its own title/dirty updates to settle.
  await nextFrame();
  if (loading) return;
  if (!ready) {
    try {
      defaultArchive = await (await vm.saveProjectSb3()).arrayBuffer();
      lastTitle = store.getState().scratchGui.projectTitle;
      setGuiDirty(false);
      ready = true;
      projectTools.refresh();
      modes.publish();
      bootMessage.hidden = true;
      send('READY', snapshot());
    } catch (error) {
      bootFailure(error);
    }
  } else if (nativeNew) {
    documentId++;
    editVersion++;
    savedVersion = editVersion;
    setGuiDirty(false);
    nativeNew = false;
    send('REPLACED', snapshot());
  }
}

const importInput = document.createElement('input');
importInput.type = 'file';
importInput.accept = '.ob,.sb3';
importInput.hidden = true;
importInput.dataset.testid = 'project-file-input';
document.body.append(importInput);
importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      send('IMPORT_ERROR', { message: '文件超过 20 MiB。' });
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      send('IMPORT_REQUEST', { bytes, name: file.name }, undefined, [bytes]);
    } catch (error) {
      send('IMPORT_ERROR', { message: String(error) });
    }
});
function chooseImport() {
  if (!ready || loading || nativeNew || projectTools.state.documentActionsDisabled || extensions?.status.busy || hardwareUi?.hardware.busy || hardwareUi?.session.operation) return;
  importInput.click();
}

async function loadProject(bytes: ArrayBuffer, title: string, dirty = false) {
  hardwareUi.hardware.assertIdle();
  extensions.assertIdle();
  readEditorMetadata(bytes); // Validate the sidecar before loading state, backup or VM stop/replacement.
  if (loading || nativeNew || store.getState().scratchGui.projectState.loadingState !== 'SHOWING_WITHOUT_ID') {
    throw new Error('编辑器正在加载项目，请稍后重试。');
  }
  loading = true;
  let backup: ArrayBuffer | undefined;
  let applied = false;
  try {
    store.dispatch({ type: `${projectAction}START_LOADING_VM_FILE_UPLOAD` });
    store.dispatch({ type: `${modalAction}OPEN_MODAL`, modal: 'loadingProject' });
    vm.stopAll();
    // Deserialization may have cleared the active VM before reporting a broken file.
    backup = await (await vm.saveProjectSb3()).arrayBuffer();
    await vm.loadProject(bytes);
    setGuiTitle(title);
    documentId++;
    editVersion++;
    savedVersion = dirty ? editVersion - 1 : editVersion;
    applied = true;
  } catch (error) {
    const message = typeof error === 'object' && error && 'message' in error ? error.message : error;
    if (backup) {
      try { await vm.loadProject(backup); }
      catch (rollback) {
        const recoveryMessage = `读取项目失败：${String(message)}；恢复原项目失败：${String(rollback)}。请从扩展库下载恢复备份后重新打开编辑器。`;
        extensions.preserveRecovery(backup, recoveryMessage);
        throw new Error(recoveryMessage);
      }
    }
    throw new Error(`无法读取 OpenBlock 项目：${String(message)}`);
  } finally {
    store.dispatch({ type: `${projectAction}${applied ? 'DONE_LOADING_VM_WITHOUT_ID' : 'RETURN_TO_SHOWING'}` });
    store.dispatch({ type: `${modalAction}CLOSE_MODAL`, modal: 'loadingProject' });
    await nextFrame();
    setGuiDirty(editVersion !== savedVersion);
    loading = false;
    modes.publish();
    notifyChanged();
  }
  return snapshot();
}

async function handle(type: string, payload: unknown): Promise<unknown> {
  if (type === 'GET_STATE') return snapshot();
  const hw = hardwareUi.hardware;
  if (type === 'GET_HARDWARE_STATE') return hw.snapshot();
  if (type === 'OPEN_HARDWARE_CONNECT') { hardwareUi.openConnect(); return hw.snapshot(); }
  if (type === 'DISCONNECT_HARDWARE') return hardwareUi.disconnect();
  if (type === 'HARDWARE_CANCEL') return hw.cancel();
  if (type === 'HARDWARE_COMPILE' || type === 'HARDWARE_UPLOAD') {
    const selection = payload as any;
    if (selection && (typeof selection !== 'object' || (selection.profileId !== undefined && typeof selection.profileId !== 'string') || (selection.portId !== undefined && typeof selection.portId !== 'string'))) throw new Error('硬件目标无效。');
    if (selection?.profileId || selection?.portId) hw.configure(selection.profileId ?? hw.profileId, selection.portId ?? hw.portId);
    hardwareUi.start(type === 'HARDWARE_UPLOAD'); return hw.snapshot();
  }
  if (loading || nativeNew) throw new Error('编辑器正在加载项目，请稍后重试。');
  switch (type) {
    case 'NEW_PROJECT': return loadProject(defaultArchive, defaultTitle);
    case 'LOAD_PROJECT': {
      const { bytes, title, dirty } = payload as { bytes: ArrayBuffer; title: string; dirty?: boolean };
      if (!(bytes instanceof ArrayBuffer) || typeof title !== 'string') throw new Error('项目数据格式无效。');
      return loadProject(bytes, title, dirty);
    }
    case 'EXPORT_PROJECT': {
      if (documentDisabled()) throw new Error('编辑器正在处理其他操作，请完成后再保存。');
      extensions.assertIdle();
      const { title, editVersion: captured, documentId: capturedDocument } = snapshot();
      const archive: ProjectArchive = {
        title,
        editVersion: captured,
        documentId: capturedDocument,
        fileName: archiveName(title),
        mimeType: ARCHIVE_MIME,
        bytes: await (await vm.saveProjectSb3()).arrayBuffer(),
      };
      if (documentId !== capturedDocument || editVersion !== captured) throw new Error('归档期间项目已变化，请重新保存当前版本。');
      return archive;
    }
    case 'MARK_SAVED': {
      const { documentId: savedDocument, editVersion: captured } = payload as Pick<EditorSnapshot, 'documentId' | 'editVersion'>;
      if (savedDocument === documentId && Number.isSafeInteger(captured) && captured <= editVersion && captured >= savedVersion) {
        savedVersion = captured;
        setGuiDirty(editVersion !== savedVersion);
        notifyChanged();
      }
      return snapshot();
    }
    case 'SET_TITLE': {
      const { title, persisted } = payload as { title: string; persisted?: boolean };
      if (typeof title !== 'string') throw new Error('项目名称无效。');
      updatingPersistedTitle = persisted === true;
      try { setGuiTitle(title); } finally { updatingPersistedTitle = false; }
      return snapshot();
    }
    case 'GET_PROJECT_JSON': return { json: vm.toJSON() };
    case 'RUN': if (!canRunStage()) throw new Error(executionWarning); vm.greenFlag(); return snapshot();
    case 'STOP': vm.stopAll(); return snapshot();
    default: throw new Error(`未知编辑器操作：${type}`);
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== origin || event.source !== window.parent || !isEnvelope(event.data)) return;
  const { type, payload, requestId } = event.data;
  if (type === 'PROJECT_TOOLBAR_STATE') {
    if (isProjectToolbarState(payload)) { projectTools.update(payload); paletteSearch.syncContext(); }
    return;
  }
  if (type === 'HELLO') {
    if (ready) send('READY', snapshot());
    return;
  }
  if (!ready || typeof requestId !== 'string') return;
  void handle(type, payload).then((result) => {
    const transfer = type === 'EXPORT_PROJECT' ? [(result as ProjectArchive).bytes] : [];
    send('RESPONSE', { ok: true, result }, requestId, transfer);
  }, (error: unknown) => {
    send('RESPONSE', { ok: false, error: { code: 'EDITOR_ERROR', message: error instanceof Error ? error.message : String(error) } }, requestId);
  });
});

try {
  const { GUI, React, ReactDOM } = upstream;
  if (!GUI || !React || !ReactDOM) throw new Error('官方编辑器资源未加载。');
  installDeviceMetadata(window);
  (window as any).CFZNOpenBlock = { renderLibrary: makeLibraryRenderer(() => extensions), renderProjectTools: projectTools.render,
    captureController: (info: any, locale: string, deviceId?: string) => toolbox.capture(info, locale, deviceId),
    composeToolbox: (native: (...args: any[]) => string, args: any[], locale: string) => toolbox.compose(native, [...args, extensions?.loaded() ?? []], locale),
    deferWorkspaceUpdate: () => extensions?.deferWorkspaceUpdate ?? false,
    canChangeLocale: () => !extensions?.status.busy && !loading && !nativeNew && !modes?.transitioning,
    beginLocaleUpdate: () => { localePending++; return () => { localePending--; extensions?.refreshViews(); }; },
    fallbackCategory: (workspace: any, selected: string, xml: string) => {
      selected = paletteSearch.fallback(selected);
      if (selected === SEARCH_CATEGORY) return selected;
      const ids = Array.from(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('category')).map(node => node.getAttribute('id'));
      if (ids.includes(selected)) return selected;
      const fallback = ids[0]; if (fallback) workspace.toolbox_.setSelectedCategoryById(fallback); return fallback;
    },
    attachPaletteSearch: (B: any, workspace: any, xml: string, refresh: () => void) => paletteSearch.attach(B, workspace, xml, refresh),
    detachPaletteSearch: (workspace: any) => paletteSearch.detach(workspace),
    paletteToolbox: (workspace: any, xml: string) => paletteSearch.decorate(workspace, xml),
    paletteDidUpdate: (workspace: any) => paletteSearch.afterUpdate(workspace),
    renderPaletteSearch: (R: any) => paletteSearch.render(R),
    canRunStage,
    allowStageInput,
    blockListener: (value: any) => {
      if (!guardedListeners.has(value)) guardedListeners.set(value, event => {
        if ((event.type === 'ui' && event.element === 'stackclick' || event.type === 'stackclick') && !canRunStage(event.blockId)) return;
        value.blockListener(event);
      });
      return guardedListeners.get(value);
    },
    renderModeControls: (R: any) => modeViews.renderControls(R),
    renderUploadWorkspace: (R: any, CodeEditor: any, props: any) => modeViews.renderWorkspace(R, CodeEditor, props),
    generateCode: (B: any, workspace: any) => modes?.generate(B, workspace),
    supportsHardware: (id: string) => (controllerIds as readonly string[]).includes(id),
    openHardware: () => hardwareUi.nativeUpload(),
    renderHardwareTools: (R: any) => hardwareUi?.renderTools(R),
    renderConnection: (R: any, Modal: any, props: any) => hardwareUi.renderConnection(R, Modal, props),
    renderHardwareProgress: (R: any, Modal: any, props: any) => hardwareUi.renderProgress(R, Modal, props),
  };
  const mount = document.getElementById('editor')!;
  GUI.setAppElement(mount);
  const App = GUI.AppStateHOC(GUI.default);
  store = ReactDOM.render(React.createElement(App, {
    projectId: '0',
    projectHost: `${origin}/openblock-vendor/projects`,
    // Optional Scratch library assets retain the upstream public asset host.
    projectTitle: defaultTitle,
    canSave: false,
    canCreateNew: false,
    canEditTitle: true,
    isTelemetryEnabled: false,
    showTelemetryModal: false,
    onVmInit: bindVm,
    onProjectLoaded: projectLoaded,
    onStartSelectingFileUpload: chooseImport,
  }), mount).store;
  store.subscribe(watchStore);
  projectTools.refresh();
} catch (error) {
  bootFailure(error);
}
