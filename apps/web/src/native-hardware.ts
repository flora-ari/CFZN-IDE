import { HardwareSession, describeError } from './hardware-session';
import { HardwareController } from './hardware-controller';
import { NativeSerialSocket } from './native-serial-socket';
import { controllerIds } from './extensions/catalog';
import type { HardwareSource } from './hardware-controller';
import type { SerialLike } from './serial';
import { makeConnectionView } from './connection-modal';
import { TerminalModel } from './terminal-model';
import { renderLocalService } from './local-service-view';
import type { SerialOptions } from './serial';
import './native-hardware.css';

export function nativeHardware(vm: any, source: () => HardwareSource, getStore: () => any, modeSwitching = () => false, mutationGuard = () => '') {
  const session = new HardwareSession((navigator as Navigator & { serial?: SerialLike }).serial);
  const hardware = new HardwareController(session, source,
    (import.meta as any).env.VITE_HARDWARE_BASE_URL || 'http://127.0.0.1:3002/api/v1/hardware', () => vm.stopAll());
  hardware.setMutationGuard(mutationGuard);
  const terminalModel = new TerminalModel(session, () => !hardware.protocolRequested && !source().realtime);
  // Capture the original transport constructor without opening a connection or altering VM code.
  const OriginalSocket = vm.runtime.getScratchLinkSocket('BLE').constructor;
  let activeSocket: NativeSerialSocket | undefined;
  let synchronizingNative = false;
  vm.configureScratchLinkSocketFactory((type: string) => {
    if (type !== 'SERIALPORT' || !controllerIds.includes(source().deviceId as any)) return new OriginalSocket(type);
    activeSocket = new NativeSerialSocket(hardware, () => !source().programming || source().deviceId === 'arduinoUno', modeSwitching, () => !synchronizingNative);
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
  const openConnect = () => {
    hardware.assertIdle();
    const id = source().deviceId;
    if (!controllerIds.includes(id as any)) throw new Error('请先从主控扩展选择支持的主控。');
    if (!vm.runtime.peripheralExtensions[id!]) throw new Error(`主控 ${id} 的串口实现尚未注册。`);
    dispatchModal('connectionModal');
  };
  const connect = async (id: string, options: SerialOptions = session.options) => {
    hardware.assertIdle();
    const deviceId = source().deviceId;
    if (!vm.runtime.peripheralExtensions[deviceId!]) throw new Error('当前主控的串口实现尚未注册。');
    if (session.portId || vm.getPeripheralIsConnected(deviceId)) {
      await hardware.applySerialSettings({ browserPortId: id, options }); return;
    }
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
  const openProgress = () => { dispatchModal('uploadProgress'); void hardware.refresh(); };
  const start = (upload: boolean) => { hardware.start(upload); openProgress(); };
  const nativeUpload = () => {
    if (hardware.profileId && hardware.portId) {
      try { start(true); return; } catch (e) { hardware.error = describeError(e); }
    }
    hardware.error = source().deviceId ? '请在设置中选择主控 Profile 和本机烧录端口，再编译并上传。' : '请先从主控扩展选择主控，再配置本机烧录端口。';
    openProgress();
  };

  function component(R: any, render: (state: ReturnType<typeof hardware.snapshot>, setError: (text: string) => void, error: string) => any, mount?: () => void) {
    return function HardwareView() {
      const [state, update] = R.useState(hardware.snapshot());
      const [error, setError] = R.useState('');
      R.useEffect(() => { const stop = hardware.subscribe(() => update(hardware.snapshot())); update(hardware.snapshot()); mount?.(); return stop; }, []);
      return render(state, setError, error);
    };
  }
  let Connection: any, Progress: any;
  function renderConnection(R: any, Modal: any, props: any) {
    if (!controllerIds.includes(props.deviceId)) return null;
    Connection ??= makeConnectionView(R, hardware, connect, disconnect);
    const name = props.deviceData.find((device: any) => device.deviceId === props.deviceId)?.name || props.deviceId;
    return R.createElement(Modal, { className: 'cfzn-hardware-modal cfzn-connection-modal', contentLabel: `连接 ${name}`, id: 'connectionModal', onRequestClose: props.onCancel },
      R.createElement(Connection));
  }
  function renderProgress(R: any, Modal: any, props: any) {
    Progress ??= component(R, (state, setError, error) => {
      const profiles = state.profiles.filter(p => p.deviceId === state.deviceId);
      const profile = profiles.find(p => p.id === state.profileId);
      const configure = (profileId: string, portId: string) => { try { hardware.configure(profileId, portId); setError(''); } catch (e) { setError(describeError(e)); } };
      const run = (upload: boolean) => { try { start(upload); setError(''); } catch (e) { setError(describeError(e)); } };
      return R.createElement('div', { className: 'cfzn-hardware', 'data-testid': 'hardware-progress' },
        renderLocalService(R, hardware, state),
        R.createElement('div', { className: 'cfzn-hardware-row' },
          R.createElement('label', null, '主控 / Profile ', R.createElement('select', { value: state.profileId, disabled: state.busy,
            onChange: (e: any) => configure(e.target.value, state.portId) },
          R.createElement('option', { value: '' }, '请选择主控 Profile'), ...profiles.map(p => R.createElement('option', { key: p.id, value: p.id }, `${p.label} · ${p.chip}`)))),
          R.createElement('button', { disabled: state.busy, onClick: () => { void hardware.refreshUploadPorts(); } }, '刷新烧录端口')),
        profile && R.createElement('p', null, profile.fqbn, profile.reason && ` · ${profile.reason}`),
        R.createElement('label', null, '本机烧录端口 ', R.createElement('select', { value: state.portId, disabled: state.busy,
          onChange: (e: any) => configure(state.profileId, e.target.value) }, R.createElement('option', { value: '' }, '请明确选择 OS 端口'),
        ...state.ports.map(p => R.createElement('option', { key: p.portId, value: p.portId }, p.displayName)))),
        state.portError && R.createElement('p', { role: 'alert', className: 'cfzn-hardware-error' }, `烧录端口：${state.portError}`),
        R.createElement('p', { role: 'status' }, state.busy ? `正在${({ build: '编译', releasing: '释放串口', upload: '上传', restoring: '恢复原终端' } as any)[state.use] || '等待工具退出'}${state.job?.state === 'cancelling' ? ' · 正在取消，等待进程退出' : ''}` : state.job ? `${state.job.kind === 'build' ? '编译' : '上传'}：${state.job.state}` : '使用当前代码编辑器内容；无需先保存项目。'),
        R.createElement('div', { className: 'cfzn-hardware-error', role: 'alert' }, error || state.error || state.job?.error?.message),
        state.restoreError && R.createElement('p', { className: 'cfzn-hardware-error' }, state.restoreError),
        R.createElement('pre', { className: 'cfzn-hardware-log', role: 'log' }, state.logs.map(line => line.text).join('')),
        R.createElement('div', { className: 'cfzn-hardware-row' },
          R.createElement('button', { disabled: state.busy || !profile?.compileAvailable, onClick: () => run(false) }, '编译检查'),
          R.createElement('button', { disabled: state.busy || !profile?.uploadAvailable || !state.portId, onClick: () => run(true) }, '编译并上传'),
          R.createElement('button', { disabled: !state.busy || state.job?.state === 'cancelling', onClick: () => { void hardware.cancel(); } }, '取消作业'),
          R.createElement('button', { onClick: props.oncloseUploadProgress }, state.busy ? '隐藏（作业继续）' : '关闭')));
    });
    return R.createElement(Modal, { className: 'cfzn-hardware-modal', contentLabel: '编译与上传', id: 'uploadProgress', onRequestClose: props.oncloseUploadProgress }, R.createElement(Progress));
  }
  return { hardware, session, terminalModel, openConnect, disconnect, openProgress, nativeUpload, start, renderConnection, renderProgress,
    renderTools: (R: any) => R.createElement('button', { type: 'button', className: 'cfzn-hardware-tools', onClick: openProgress }, '编译 / 烧录设置'),
  };
}
