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
import { CCraftLink, mountLinkGuide } from './ccraft-link';
import type { SerialOptions } from './serial';
import type { ComponentType, ReactNode } from 'react';
import './native-hardware.css';

function windowsLinkDownloadUrl() {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform;
  return /^win/i.test(platform)
    ? import.meta.env.VITE_CCRAFT_LINK_DOWNLOAD_URL || '/downloads/CCraft-Link-Setup.exe'
    : undefined;
}

export function createNativeLink() {
  const link = new CCraftLink(import.meta.env.VITE_HARDWARE_BASE_URL || 'http://127.0.0.1:3002/api/v1/hardware');
  const guide = mountLinkGuide(link, windowsLinkDownloadUrl());
  let ControlSlot: ComponentType<{ nativeControls: ReactNode }> | undefined;

  function renderControls(React: typeof import('react'), nativeControls: ReactNode) {
    if (!ControlSlot) ControlSlot = function LinkControls({ nativeControls }) {
      const [online, setOnline] = React.useState(link.state.status === 'ready');
      const button = React.useRef<HTMLButtonElement>(null);
      React.useLayoutEffect(() => {
        const update = () => {
          const ready = link.state.status === 'ready';
          const restoreFocus = ready && button.current && button.current === document.activeElement;
          setOnline(ready);
          if (restoreFocus) queueMicrotask(() => document.querySelector<HTMLElement>('[data-cfzn-link-restored-focus]')?.focus());
        };
        const stopLink = link.subscribe(update);
        update();
        return stopLink;
      }, []);
      if (online) return nativeControls;
      return React.createElement('button', {
        type: 'button', className: 'ccraft-link-connect', ref: button, onClick: guide.connect,
        'aria-haspopup': 'dialog',
      }, '连接 Link');
    };
    return React.createElement(ControlSlot, { nativeControls });
  }

  return {
    link, renderControls,
    allowFirmwareUpload() {
      if (link.state.status === 'ready') return true;
      link.showGuide(); void link.check(); return false;
    },
  };
}

export function nativeHardware(link: CCraftLink, vm: any, source: () => HardwareSource, getStore: () => any, modeSwitching = () => false, mutationGuard = () => '') {
  const base = link.base;
  const downloadUrl = windowsLinkDownloadUrl();
  const localSerial = new LocalSerialLike(base);
  const serialSources = new SerialSources(localSerial, (navigator as Navigator & { serial?: SerialLike }).serial);
  const session = new HardwareSession(serialSources);
  const hardware = new HardwareController(session, source, base, () => vm.stopAll());
  hardware.setLinkGuard(link);
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { hardware.toolchains.dispose(); localSerial.dispose(); }
  });
  localSerial.setReadyGuard(() => hardware.ensureLinkReady(false));
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
  const openConnect = async () => {
    await hardware.ensureLinkReady();
    hardware.assertDocumentIdle();
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
    if (!hardware.toolchains.busy) await hardware.ensureLinkReady();
    dispatchModal('uploadProgress'); void hardware.refresh();
  };
  const devicePanel = new SerialDevicePanel(hardware, serialSources, connect, disconnect);
  const uploadProgress = new UploadProgressModel(hardware);
  const start = async (upload: boolean) => {
    await hardware.ensureLinkReady();
    dispatchModal('uploadProgress');
    return uploadProgress.start(upload);
  };
  const nativeUpload = () => {
    void start(true).catch(() => undefined);
  };
  let refreshedInstance: string | undefined;
  let wasMissing = link.state.status === 'missing';
  const syncLinkReady = () => {
    if (link.state.status === 'missing') { wasMissing = true; return; }
    if (link.state.status !== 'ready') return;
    const currentInstance = link.state.health?.instanceId;
    const needsRefresh = wasMissing || !refreshedInstance || (!!currentInstance && refreshedInstance !== currentInstance);
    refreshedInstance = currentInstance ?? 'ready';
    wasMissing = false;
    if (!needsRefresh) return;
    // Refresh capabilities, toolchains, and device list on initial ready or recovery.
    queueMicrotask(() => {
      void hardware.refresh(); void session.refresh('local');
    });
  };
  link.subscribe(syncLinkReady);
  syncLinkReady();

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
      R.createElement(Progress, { start, onClose: props.oncloseUploadProgress, downloadUrl,
        openBoardLibrary: () => { props.oncloseUploadProgress(); dispatchModal('deviceLibrary'); } }));
  }
  return { hardware, session, terminalModel, openConnect, disconnect, openProgress, nativeUpload, start, renderConnection, renderProgress,
    renderTools: (R: any) => R.createElement('span', { className: 'cfzn-hardware-tools-group' },
      R.createElement('button', { type: 'button', className: 'cfzn-hardware-tools', onClick: () => { void openProgress().catch(() => undefined); } }, '编译 / 烧录设置')),
  };
}
