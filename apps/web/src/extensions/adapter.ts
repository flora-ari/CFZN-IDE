import { controllerIds, modules, normalizeDeviceId, supportsModule, validateProjectExtensions } from './catalog';
import { assertControllerCompatible, capabilitiesFromInfo, modulePinOpcodes, pinMenusMatch } from './controller-compatibility';
import { deviceRegistration, deviceDescriptions } from './device-registration';
import { BuiltinResources } from './builtin-resources';
import type { BuiltinFunctions } from './builtin-resources';
import type { ToolboxPresentation } from './toolbox-presentation';
import { archiveWithoutController } from '../editor-archive';
import { extensionReferences, removalMessage } from './removal';
import type { RemovalTarget, RemovalState } from './removal';

// The pinned React 16/VM bundle has no TypeScript declarations. Keep this boundary local.
export type NativeVm = any;
export interface ExtensionStatus { busy: boolean; label: string; error: string; recovery?: ArrayBuffer }
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20));
async function until(test: () => boolean, message: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { if (test()) return; } catch { /* A native toolbox rebuild is still pending. */ }
    await pause();
  }
  throw new Error(message);
}

function toolboxForDevice(xml: string, Blockly: any) {
  const document = new DOMParser().parseFromString(`<xml>${xml}</xml>`, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('模块工具箱 XML 无效。');
  for (const field of document.querySelectorAll('field[name="PIN"]')) {
    const opcode = field.parentElement?.getAttribute('type') || '';
    const menu = modulePinOpcodes[opcode];
    if (!menu) continue;
    const options: string[][] = Blockly.Device.getPinOptions(menu);
    // Old Uno-oriented toolboxes contain empty/A0 defaults that do not exist on ESP32-S3.
    // Choose a valid default for new blocks; imported/edited block values are never rewritten here.
    if (!options.some(option => String(option[1]) === field.textContent)) field.textContent = String(options[0][1]);
  }
  return Array.from(document.documentElement.children).map(child => new XMLSerializer().serializeToString(child)).join('');
}

export function installExtensionAdapter(vm: NativeVm, devices: any[], options: {
  getStore(): any;
  onChanged(): void;
  isProjectLoading(): boolean;
  isHardwareBusy?(): boolean;
  operationBlockedReason?(): string;
  clearBlockedReason?(): string;
  presentation: ToolboxPresentation;
  archiveSave?(archive: Promise<Blob>): Promise<Blob>;
}) {
  const runtime = vm.runtime;
  const manager = vm.extensionManager;
  const rawDevice = deviceRegistration(vm, manager.loadDeviceURL.bind(manager));
  const nativeSave = vm.saveProjectSb3.bind(vm);
  const rawSave = () => options.archiveSave ? options.archiveSave(nativeSave()) : nativeSave();
  const rawDeserialize = vm.deserializeProject.bind(vm);
  const rawUnload = manager.unloadDeviceExtension.bind(manager);
  const rawMode = runtime.setRealtimeMode.bind(runtime);
  let descriptions: Record<string, any[]> = {};
  const descriptionsReady = deviceDescriptions().then(value => { descriptions = value; });
  const boardDescription = (id: string) => capabilitiesFromInfo(descriptions[id], 'arduino', id);
  let restoring = 0;
  let deferredWorkspace = 0;
  let internal = 0;
  let blocks: any;
  const resources = new BuiltinResources();
  let status: ExtensionStatus = { busy: false, label: '', error: '' };
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach(listener => listener());
  const currentDevice = () => runtime.getDevice().deviceId as string | null;
  const loaded = (): string[] => runtime.getLoadedDeviceExtension();
  const changed = () => { if (!restoring && !options.isProjectLoading()) options.onChanged(); publish(); };

  function assertIdle() {
    const blocked = options.operationBlockedReason?.(); if (blocked) throw new Error(blocked);
    if (options.isHardwareBusy?.()) throw new Error('硬件作业进行中，请等待完成后再切换主控或项目。');
    if (status.recovery) throw new Error('项目恢复失败，请先下载恢复备份并重新打开编辑器。');
    if (status.busy) throw new Error(`正在${status.label}，请完成后再保存或切换项目。`);
  }

  async function transaction<T = undefined>(label: string, run: (prepared: T, backup: ArrayBuffer) => Promise<void>, prepare?: () => Promise<T>, validate?: () => void) {
    assertIdle();
    if (options.isProjectLoading()) throw new Error('项目正在加载，请稍后操作扩展。');
    status = { busy: true, label, error: '' };
    publish();
    let backup: ArrayBuffer | undefined;
    let entered = false;
    try {
      const prepared = await prepare?.();
      validate?.();
      backup = await (await rawSave()).arrayBuffer();
      validate?.();
      internal++; entered = true;
      vm.stopAll();
      await run(prepared as T, backup!);
      status = { busy: false, label: `${label}完成`, error: '' };
      changed();
    } catch (error) {
      let message = `${label}失败：${error instanceof Error ? error.message : String(error)}`;
      if (backup && entered) {
        try { await vm.loadProject(backup.slice(0)); }
        catch (rollback) {
          message += `；恢复原项目失败：${String(rollback)}。请下载恢复备份。`;
          status = { busy: false, label: '', error: message, recovery: backup };
          publish();
          throw new Error(message);
        }
      }
      status = { busy: false, label: '', error: message };
      publish();
      throw new Error(message);
    } finally { if (entered) internal = Math.max(0, internal - 1); }
  }

  function categoryIds() {
    const xml = options.getStore()?.getState().scratchGui.toolbox.toolboxXML ?? '<xml/>';
    return new Set(Array.from(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('category')).map(node => node.getAttribute('id')!));
  }
  const moduleName = (id: string) => modules.find(entry => entry.extensionId === id)?.name ?? id;
  function removalState(target: RemovalTarget, locked = false): RemovalState {
    const entry = target.kind === 'module' ? modules.find(module => module.extensionId === target.id) : devices.find(device => device.deviceId === target.id && target.id !== 'null');
    const selected = target.kind === 'module' ? loaded().includes(target.id) : currentDevice() === target.id;
    if (!entry) return { selected, allowed: false, reason: 'unsupported' };
    if (!selected) return target.kind === 'controller' && currentDevice() ? { selected, allowed: false, reason: 'stale' } : { selected, allowed: true };
    const blocked = options.operationBlockedReason?.();
    if ((!locked && (status.busy || restoring || internal)) || status.recovery || options.isProjectLoading() || options.isHardwareBusy?.() || blocked) {
      return { selected, allowed: false, reason: 'busy', detail: blocked };
    }
    const dependents = target.kind === 'controller' ? loaded() : loaded().filter(id => modules.find(module => module.extensionId === id)?.dependencies?.includes(target.id));
    if (dependents.length) return { selected, allowed: false, reason: 'modules-loaded', dependentModuleIds: dependents };
    if (target.kind === 'controller') {
      const reason = options.clearBlockedReason?.(); if (reason) return { selected, allowed: false, reason: 'serial-owned', detail: reason };
    }
    const opcodes = target.kind === 'module' ? new Set([...(entry.opcodes ?? []), ...(entry.menuOpcodes ?? [])]) : options.presentation.controllerOpcodes(target.id);
    if (target.kind === 'controller') {
      if (!opcodes.size) return { selected, allowed: false, reason: 'unsupported', detail: '当前主控积木描述尚未就绪，请稍后重试。' };
      opcodes.add('event_whenarduinobegin');
    }
    const references = extensionReferences(runtime, opcodes);
    return references.length ? { selected, allowed: false, reason: 'in-use', references } : { selected, allowed: true };
  }
  function requireRemoval(target: RemovalTarget, locked = false) {
    const state = removalState(target, locked);
    if (!state.allowed) throw new Error(removalMessage(state, target.kind === 'module' ? moduleName(target.id) : '当前主控', moduleName));
    return state;
  }
  async function removeModule(id: string) {
    const target: RemovalTarget = { kind: 'module', id };
    if (!requireRemoval(target).selected) return;
    await transaction(`移除模块 ${moduleName(id)}`, async () => {
      const keep = categoryIds(), category = modules.find(module => module.extensionId === id)!.categoryId; keep.delete(category);
      rawUnload(id); options.presentation.removeModule(id); vm.emitWorkspaceUpdate();
      await until(() => !loaded().includes(id) && !categoryIds().has(category) && [...keep].every(category => categoryIds().has(category)), '模块分类未能完整更新。');
    }, undefined, () => { requireRemoval(target, true); });
  }
  async function clearController(expectedDeviceId: string) {
    const target: RemovalTarget = { kind: 'controller', id: normalizeDeviceId(expectedDeviceId) };
    if (!requireRemoval(target).selected) return;
    await transaction('移除主控', async (_prepared, backup) => {
      const realtime = runtime.isRealtimeMode();
      await vm.loadProject(archiveWithoutController(backup));
      rawMode(realtime); vm.emitWorkspaceUpdate();
      // Keep queued native Blockly reconstruction events inside this one editing transaction.
      await pause();
      await until(() => currentDevice() === null && options.getStore().getState().scratchGui.device.deviceId === null &&
        ![...categoryIds()].some(id => id.startsWith('cfzn-controller-')), '主控未能完整移除。');
    }, undefined, () => { requireRemoval(target, true); });
  }

  function captureBlocks() {
    runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: (Blockly: any) => { blocks = Blockly; return Blockly; } });
    if (!blocks) throw new Error('积木编辑器尚未就绪，请切换回代码页后重试。');
    return blocks;
  }

  async function deviceReady(id: string) {
    await until(() => options.getStore()?.getState().scratchGui.device.deviceId === id,
      `主控 ${id} 未能同步到编辑器。`);
    const Blockly = blocks || captureBlocks();
    const target = controllerIds.includes(id as typeof controllerIds[number]) ? boardDescription(id) : undefined;
    await until(() => Blockly.Device.getDeviceId() === id &&
      (!target || pinMenusMatch(Blockly, target)),
    `主控 ${id} 的引脚工具箱未就绪。`);
    return Blockly;
  }

  async function registerModule(id: string, prepared?: BuiltinFunctions) {
    const entry = modules.find(item => item.extensionId === id);
    if (!entry) throw new Error(`此网站没有模块实现：${id}`);
    if (!supportsModule(entry, currentDevice())) throw new Error(`${entry.name}不支持当前主控，请先选择兼容的 Arduino 主控。`);
    if (manager.isDeviceExtensionLoaded(id)) return;
    const parts = prepared ?? await resources.prepare(id);
    for (const part of Object.values(parts)) if (typeof part !== 'function') throw new Error(`${entry.name}缺少注册函数。`);
    const Blockly = await deviceReady(currentDevice()!);
    const xml = toolboxForDevice(parts.toolbox(), Blockly);
    runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: parts.translations, defineGenerators: parts.generator, defineBlocks: parts.blocks });
    await until(() => entry.opcodes.every(opcode => Blockly.Blocks[opcode] && typeof Blockly.Arduino[opcode] === 'function'), `${entry.name}的积木或生成器未能注册。`);
    options.presentation.setModule(id, xml);
    runtime.addDeviceExtension(id, xml, undefined);
    vm.emitWorkspaceUpdate();
    await until(() => options.presentation.hasModule(currentDevice()!, id, entry.opcodes), `${entry.name}未能呈现在工具箱类别中。`);
  }

  async function loadDevice(device: any, requireToolbox = true) {
    const id = normalizeDeviceId(device.deviceId);
    options.presentation.reset();
    if (id === 'null') { await rawDevice(device); return; }
    if (!devices.some(item => item.deviceId === id)) throw new Error(`此网站没有主控实现：${id}`);
    await rawDevice({ ...device, deviceId: id });
    // Native deserialization installs targets *after* the device. Waiting for a flyout here
    // would deadlock that lifecycle; module registration waits after installTargets instead.
    if (requireToolbox) await deviceReady(id);
    else await until(() => options.getStore()?.getState().scratchGui.device.deviceId === id,
      `主控 ${id} 未能同步到编辑器。`);
  }

  async function selectController(device: any) {
    if (device.deviceId === 'null' || device.deviceId === null) { if (currentDevice()) await clearController(currentDevice()!); return; }
    assertIdle();
    await descriptionsReady;
    const id = normalizeDeviceId(device.deviceId);
    if (currentDevice() === id) return;
    const retain = loaded();
    const incompatible = retain.filter(moduleId => !supportsModule(modules.find(item => item.extensionId === moduleId)!, id));
    if (incompatible.length) throw new Error(`无法切换到 ${device.name}：当前模块 ${incompatible.join('、')} 不支持此主控。请另存项目或新建项目后选择。`);
    // Reject before rawSave/stopAll/rawDevice or any toolbox event. Cached Blockly factories and
    // the current flyout describe the old board, so neither is evidence of target compatibility.
    const target = controllerIds.includes(id as typeof controllerIds[number]) ? boardDescription(id) : new Map();
    assertControllerCompatible(runtime.targets, runtime.getDevice().type, device.type, target, device.name);
    const stageExtensions: string[] = runtime.getLoadedScratchExtension();
    const realtime = runtime.isRealtimeMode();
    await transaction(`选择主控 ${device.name}`, async prepared => {
      await loadDevice(device);
      if (runtime.isRealtimeMode() !== realtime) rawMode(realtime);
      await deviceReady(id);
      for (const extension of stageExtensions) await manager.loadExtensionURL(extension);
      for (const moduleId of retain) await registerModule(moduleId, prepared.get(moduleId));
      vm.emitWorkspaceUpdate();
    }, async () => new Map(await Promise.all(retain.map(async moduleId => [moduleId, await resources.prepare(moduleId)] as const))));
  }

  async function loadModule(id: string) {
    assertIdle();
    if (manager.isDeviceExtensionLoaded(id)) return;
    const entry = modules.find(item => item.extensionId === id);
    if (!entry) throw new Error(`此网站没有模块实现：${id}`);
    // Validate before snapshotting or stopping the previous editable project.
    if (!supportsModule(entry, currentDevice())) throw new Error(`${entry.name}需要兼容主控，请先选择主控。`);
    await transaction(`加载模块 ${entry.name}`, prepared => registerModule(id, prepared), () => resources.prepare(id));
  }

  manager.getDeviceList = async () => undefined; // makeDeviceLibrary retains every official built-in board + Aijite.
  manager.getDeviceExtensionsList = async () => modules.map(entry => ({ ...entry, isLoaded: manager.isDeviceExtensionLoaded(entry.extensionId) }));
  manager.loadDeviceURL = (device: any) => restoring ? loadDevice(device, false) : selectController(device);
  manager.loadDeviceExtension = (id: string) => restoring ? registerModule(id) : loadModule(id);
  manager.unloadDeviceExtension = (id: string) => {
    if (restoring || internal) return rawUnload(id);
    return removeModule(id);
  };
  runtime.setRealtimeMode = (realtime: boolean) => {
    if (restoring || internal) return rawMode(realtime);
    if (options.isHardwareBusy?.()) {
      status = { ...status, error: '硬件作业进行中，请等待工具退出后再切换模式。' }; publish(); return;
    }
    if (status.busy) {
      status = { ...status, error: '主控或模块正在更新，请稍后切换模式。' };
      publish(); return;
    }
    if (runtime.isRealtimeMode() !== realtime) { rawMode(realtime); changed(); }
  };
  vm.saveProjectSb3 = () => { assertIdle(); return rawSave(); };
  vm.deserializeProject = async (project: any, zip: any) => {
    await descriptionsReady;
    const normalized = validateProjectExtensions(project, devices.map(device => device.deviceId), true);
    const stageIds = normalized.extensions ?? [];
    for (const id of Array.isArray(stageIds) ? stageIds : []) {
      if (!['pen', 'music', 'text2speech', 'translate', 'videoSensing', 'makeymakey', 'coreExample'].includes(id)) {
        throw new Error(`此网站没有舞台扩展实现：${String(id)}。当前项目未替换。`);
      }
    }
    const withModules = normalized.deviceExtensions?.length > 0;
    let completed = false;
    restoring++;
    if (withModules) deferredWorkspace++;
    publish();
    try {
      // Register upload-only modules using the supported setup, then restore native programMode.
      const result = await rawDeserialize(withModules ? { ...normalized, programMode: 'upload' } : normalized, zip);
      if (currentDevice()) await deviceReady(currentDevice()!);
      if (normalized.programMode === 'realtime' || normalized.programMode === 'upload') rawMode(normalized.programMode === 'realtime');
      if (!status.busy) status = { busy: false, label: '', error: '' };
      completed = true;
      return result;
    }
    finally {
      if (withModules) deferredWorkspace--;
      try {
        // Toolbox updates may proceed during registration. Rebuild the actual workspace only
        // after every module definition exists, avoiding partial XML loads and queued deletes.
        if (completed && withModules) {
          const target = vm.editingTarget;
          const xml = new DOMParser().parseFromString(`<xml>${target.blocks.toXML(target.comments)}</xml>`, 'application/xml');
          const expected = Array.from(xml.querySelectorAll('block, shadow')).map(block => ({ id: block.getAttribute('id')!, type: block.getAttribute('type')! }));
          vm.emitWorkspaceUpdate();
          // Native Blockly events are queued. Confirm after that queue has had a turn, before
          // the import can report success, and let the existing archive rollback handle failure.
          await pause();
          await until(() => expected.every(block => target.blocks.getBlock(block.id)?.opcode === block.type &&
            blocks.getMainWorkspace().getBlockById(block.id)?.type === block.type), '模块项目积木未能完整恢复，正在恢复原项目。');
        }
      } finally { restoring--; publish(); }
    }
  };

  return {
    assertIdle, selectController, loadModule, currentDevice, loaded, removeModule, clearController, removalState, refreshViews: publish,
    get blocks() { return blocks; },
    get suppressChanges() { return status.busy || restoring > 0; },
    get deferWorkspaceUpdate() { return deferredWorkspace > 0; },
    get status() { return status; },
    preserveRecovery(recovery: ArrayBuffer, error: string) {
      status = { busy: false, label: '', error, recovery };
      publish();
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isRealtimeMode: () => runtime.isRealtimeMode() as boolean,
    async switchUploadMode() {
      await transaction('切换 Arduino 上传模式', async () => { rawMode(false); await deviceReady(currentDevice()!); });
    },
    async selectStage(item: any) {
      assertIdle();
      const id = item.extensionId;
      if (!id || item.disabled) return;
      if (manager.isExtensionLoaded(id)) return;
      await transaction(`加载舞台扩展 ${typeof item.name === 'string' ? item.name : id}`, async () => {
        await manager.loadExtensionURL(item.extensionURL || id);
      });
    },
  };
}

export type ExtensionAdapter = ReturnType<typeof installExtensionAdapter>;
