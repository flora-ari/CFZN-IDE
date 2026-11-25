import { HardwareSession } from './hardware-session';
import { HardwareController } from './hardware-controller';
import { NativeSerialSocket } from './native-serial-socket';
import { controllerIds } from './extensions/catalog';
import type { HardwareSource } from './hardware-controller';
import type { SerialLike } from './serial';
import { makeConnectionView } from './connection-modal';
import { TerminalModel } from './terminal-model';
import { makeUploadProgressView, UploadProgressModel } from './upload-progress';
import { LocalSerialLike, SerialSources } from './local-serial';
import { SerialDevicePanel } from './serial-device-panel';
import { CCraftLink, downloadLinkInstaller, mountLinkGuide } from './ccraft-link';
import type { SerialOptions } from './serial';
import './native-hardware.css';

export function nativeHardware(vm: any, source: () => HardwareSource, getStore: () => any, modeSwitching = () => false, mutationGuard = () => '') {
  const base = (import.meta as any).env.VITE_HARDWARE_BASE_URL || 'http://127.0.0.1:3002/api/v1/hardware';
  const localSerial = new LocalSerialLike(base);
  const serialSources = new SerialSources(localSerial, (navigator as Navigator & { serial?: SerialLike }).serial);
  const session = new HardwareSession(serialSources);
  const hardware = new HardwareController(session, source, base, () => vm.stopAll());
  const downloadUrl = (import.meta as any).env.VITE_CCRAFT_LINK_DOWNLOAD_URL || '/downloads/CCraft-Link-Setup.exe';
  let storage: Storage | undefined;
  try { storage = sessionStorage; } catch { /* Download deduplication remains in memory. */ }
  const link = new CCraftLink(base, fetch, () => downloadLinkInstaller(downloadUrl), storage);
  hardware.setLinkGuard(link);
  localSerial.setReadyGuard(() => hardware.ensureLinkReady());
  const disposeGuide = mountLinkGuide(link, downloadUrl);
  window.addEventListener('pagehide', disposeGuide, { once: true });
  window.addEventListener('pagehide', () => localSerial.dispose(), { once: true });
  hardware.setMutationGuard(mutationGuard);
  const terminalModel = new TerminalModel(session, () => !hardware.protocolRequested && !source().realtime);
  // Capture the original transport constructor without opening a connection or altering VM code.
  const OriginalSocket = vm.runtime.getScratchLinkSocket('BLE').constructor;
  let activeSocket: NativeSerialSocket | undefined;
  let synchronizingNative = false;
  vm.configureScratchLinkSocketFactory((type: string) => {
    if (type !== 'SERIALPORT' || !controllerIds.includes(source().deviceId as any)) return new OriginalSocket(type);
    activeSocket = new NativeSerialSocket(hardware, () => !source().programming || source().deviceId === 'arduinoUno', modeSwitching, () => !synchronizingNative);
    activeSocket.discoverySource = 'local';
    return activeSocket;
  });
  const dispatchModal = (modal: string) => getStore().dispatch({ type: 'scratch-gui/modals/OPEN_MODAL', modal });
  const dispatchName = (name: string | null) => getStore().dispatch({ type: 'scratch-gui/connection-modal/setName', peripheralName: name });
  const syncNative = () => {
    if (synchronizingNative) return;
    const store = getStore(), gui = store?.getState().scratchGui; if (!gui) return;
    synchronizingNative = true;
    try {
      const name = session.status === 'open' ? session.ports.find(p => p.id === session.portId)?.label ?? 'Web Serial' : null;
      if (gui.connectionModal.peripheralName !== name) dispatchName(name);
      if (gui.hardwareConsole.baudrate !== String(session.options.baudRate)) store.dispatch({ type: 'scratch-gui/hardware-console/setBaudrate', baudrate: String(session.options.baudRate) });
      const deviceId = source().deviceId;
      if (!session.operation && !hardware.busy && session.status !== 'open' && deviceId && vm.getPeripheralIsConnected(deviceId)) vm.disconnectPeripheral(deviceId);
    } finally { synchronizingNative = false; }
  };
  hardware.subscribe(syncNative);
  vm.on('PERIPHERAL_CONNECTED', () => queueMicrotask(syncNative));
  let restoreEntry: 'connection' | 'upload' | undefined;
  const openConnect = async () => {
    restoreEntry = 'connection';
    await hardware.ensureLinkReady();
    restoreEntry = undefined;
    hardware.assertIdle();
    const id = source().deviceId;
    if (!controllerIds.includes(id as any)) throw new Error('请先从主控扩展选择支持的主控。');
    if (!vm.runtime.peripheralExtensions[id!]) throw new Error(`主控 ${id} 的串口实现尚未注册。`);
    dispatchModal('connectionModal');
  };
  const connect = async (id: string, options: SerialOptions = session.options) => {
    await hardware.ensureLinkReady();
    hardware.assertIdle();
    const deviceId = source().deviceId;
    if (!vm.runtime.peripheralExtensions[deviceId!]) throw new Error('当前主控的串口实现尚未注册。');
    if (session.portId || vm.getPeripheralIsConnected(deviceId)) {
      await hardware.applySerialSettings({ browserPortId: id, options }); return;
    }
    if (activeSocket) activeSocket.discoverySource = 'local';
    vm.scanForPeripheral(deviceId, true); // Initial native transport only; never rescan an active connection.
    if (activeSocket) activeSocket.connectionOptions = options;
    vm.connectPeripheral(deviceId, id, options.baudRate);
    if (!activeSocket?.connectionTask) throw new Error('原生串口适配尚未就绪，请重试。');
    await activeSocket.connectionTask;
  };
  const disconnect = async () => {
    hardware.assertIdle();
    await session.close(); vm.disconnectPeripheral(source().deviceId); return hardware.snapshot();
  };
  const openProgress = async () => {
    restoreEntry = 'upload';
    await hardware.ensureLinkReady();
    restoreEntry = undefined;
    dispatchModal('uploadProgress'); void hardware.refresh();
  };
  const devicePanel = new SerialDevicePanel(hardware, serialSources, connect, disconnect);
  const uploadProgress = new UploadProgressModel(hardware);
  const start = async (upload: boolean) => {
    restoreEntry = 'upload';
    await hardware.ensureLinkReady();
    restoreEntry = undefined;
    dispatchModal('uploadProgress');
    return uploadProgress.start(upload);
  };
  const nativeUpload = () => {
    void start(true).catch(() => undefined);
  };
  let wasMissing = false;
  link.subscribe(() => {
    if (link.state.status === 'missing') wasMissing = true;
    if (link.state.status !== 'ready' || !wasMissing) return;
    wasMissing = false;
    const entry = restoreEntry; restoreEntry = undefined;
    // Recover only the UI and device capabilities. A previous upload click is never replayed.
    queueMicrotask(() => {
      void hardware.refresh(); void session.refresh('local');
      if (entry) dispatchModal(entry === 'connection' ? 'connectionModal' : 'uploadProgress');
    });
  });
  void link.check();

  let Connection: any, Progress: any;
  function renderConnection(R: any, Modal: any, props: any) {
    if (!controllerIds.includes(props.deviceId)) return null;
    Connection ??= makeConnectionView(R, devicePanel);
    const name = props.deviceData.find((device: any) => device.deviceId === props.deviceId)?.name || props.deviceId;
    return R.createElement(Modal, { className: 'cfzn-hardware-modal cfzn-connection-modal', headerClassName: 'cfzn-connection-header', contentLabel: `连接 ${name}`, id: 'connectionModal', onRequestClose: props.onCancel },
      R.createElement(Connection));
  }
  function renderProgress(R: any, Modal: any, props: any) {
    Progress ??= makeUploadProgressView(R, uploadProgress);
    return R.createElement(Modal, { className: 'cfzn-hardware-modal cfzn-upload-modal', headerClassName: 'cfzn-upload-header', contentLabel: '编译与上传', id: 'uploadProgress', onRequestClose: props.oncloseUploadProgress },
      R.createElement(Progress, { start, onClose: props.oncloseUploadProgress }));
  }
  return { hardware, session, terminalModel, openConnect, disconnect, openProgress, nativeUpload, start, renderConnection, renderProgress,
    renderTools: (R: any) => R.createElement('button', { type: 'button', className: 'cfzn-hardware-tools', onClick: () => { void openProgress().catch(() => undefined); } }, '编译 / 烧录设置'),
  };
}
