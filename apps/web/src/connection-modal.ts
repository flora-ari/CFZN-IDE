import type { HardwareController } from './hardware-controller';
import type { SerialOptions } from './serial';
import { describeError } from './hardware-session';
import { renderLocalService } from './local-service-view';

const assets = '/cfzn-connection/';
const phases = { authorizing: '等待浏览器选择串口', connecting: '正在连接设备', switching: '正在切换串口设置', closing: '正在断开设备', restoring: '正在恢复原连接' };

export function makeConnectionView(R: any, hardware: HardwareController,
  connect: (id: string, options: SerialOptions) => Promise<void>, disconnect: () => Promise<unknown>) {
  return function ConnectionView() {
    const [state, update] = R.useState(hardware.snapshot());
    const [baud, setBaud] = R.useState(String(state.options.baudRate));
    const [error, setError] = R.useState('');
    R.useEffect(() => {
      const stop = hardware.subscribe(() => update(hardware.snapshot()));
      void hardware.session.refresh(); void hardware.refresh(); return stop;
    }, []);
    R.useEffect(() => { setBaud(String(state.options.baudRate)); }, [state.options.baudRate, state.serialOperation]);
    const blocked = hardware.serialDisabledReason || (state.use === 'protocol' ? '实时硬件协议占用串口，请先断开协议连接。' : '');
    const held = state.browserPortId !== null && state.connection !== 'open' && !state.serialOperation;
    const disabled = !!blocked || held || state.connection === 'unsupported';
    const options = () => {
      if (!/^\d+$/.test(baud.trim())) throw new Error('波特率请输入 1–4294967295 的整数。');
      const rate = Number(baud); if (rate < 1 || rate > 0xffffffff) throw new Error('波特率请输入 1–4294967295 的整数。');
      return { ...state.options, baudRate: rate };
    };
    const run = (action: () => Promise<unknown>) => {
      setError('');
      try { void action().catch((e: unknown) => setError(describeError(e))).finally(() => setBaud(String(hardware.session.options.baudRate))); }
      catch (e) { setError(describeError(e)); }
    };
    const connected = state.connection === 'open';
    const failure = !connected && !state.serialOperation && (state.connection === 'error' || state.connection === 'unsupported' || !!state.scanError);
    const changing = state.serialOperation && state.serialOperation !== 'authorizing';
    const text = state.serialOperation ? phases[state.serialOperation as keyof typeof phases] : connected ? state.serialError ? '已恢复原连接' : '连接成功' : state.scanning ? '正在刷新设备列表' : failure ? state.connection === 'unsupported' ? '浏览器不支持串口' : state.connection === 'error' ? '连接失败' : '设备列表刷新失败' : '请选择设备进行连接';
    const detail = state.serialOperation ? '请等待本次操作完成。' : connected ? `串口已打开 · ${state.options.baudRate} baud` : state.connection === 'unsupported' ? '此浏览器不支持 Web Serial，请使用 Chrome 或 Edge。' : state.serialError || state.scanError || state.message || '从已授权设备连接，或添加新设备完成浏览器授权。';
    return R.createElement('div', { className: 'cfzn-hardware cfzn-connection', 'data-testid': 'hardware-connect', 'data-ui': true },
      renderLocalService(R, hardware, state),
      R.createElement('div', { className: 'cfzn-connection-controls' },
        R.createElement('label', null, '终端波特率', R.createElement('input', { type: 'text', inputMode: 'numeric', list: 'cfzn-baud-rates', value: baud, disabled, 'aria-label': '连接波特率', onChange: (e: any) => setBaud(e.target.value) })),
        R.createElement('datalist', { id: 'cfzn-baud-rates' }, ...[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(rate => R.createElement('option', { key: rate, value: String(rate) }))),
        R.createElement('button', { disabled, onClick: () => run(() => hardware.applySerialSettings({ options: options() })) }, '应用'),
        R.createElement('button', { disabled, className: 'cfzn-connection-add', onClick: () => {
          setError('');
          try {
            const requestedOptions = options();
            // No await, scan or HTTP request before the browser authorization call.
            void hardware.chooseSerialPort().then(id => id ? connect(id, requestedOptions) : undefined).catch((e: unknown) => setError(describeError(e)));
          } catch (e) { setError(describeError(e)); }
        } }, '添加新设备')),
      R.createElement('div', { className: 'cfzn-connection-table' },
        R.createElement('table', { 'aria-label': '已授权串口设备' },
          R.createElement('thead', null, R.createElement('tr', null, ...['设备名称', '端口', '状态', '操作'].map(label => R.createElement('th', { key: label, scope: 'col' }, label)))),
          R.createElement('tbody', null, !state.browserPorts.length ? R.createElement('tr', null, R.createElement('td', { colSpan: 4, className: 'cfzn-connection-empty' }, state.scanning ? '正在刷新已授权设备…' : '尚未选择串口。')) :
            state.browserPorts.map((port: any) => {
              const active = port.id === state.browserPortId, pending = port.id === state.pendingBrowserPortId;
              return R.createElement('tr', { key: port.id, 'data-port-id': port.id, 'data-active': active },
                R.createElement('td', null, port.name), R.createElement('td', null, port.label),
                R.createElement('td', { className: active && connected ? 'cfzn-connection-ok' : '' }, pending && state.serialOperation ? '连接中' : active ? connected ? '已连接' : held ? '待释放' : '切换中' : '可连接'),
                R.createElement('td', null, R.createElement('button', { disabled: active ? !!hardware.serialDisabledReason : disabled,
                  onClick: () => run(() => active ? disconnect() : connect(port.id, options())) }, active ? held ? '重试断开' : '断开' : connected ? '切换' : '连接')));
            })))),
      R.createElement('div', { className: 'cfzn-connection-list-footer' },
        R.createElement('span', null, '浏览器授权编号不代表系统 COM 端口'),
        R.createElement('button', { disabled: !!state.serialOperation || state.scanning, onClick: () => { setError(''); void hardware.session.refresh(); } }, '刷新设备')),
      R.createElement('div', { className: 'cfzn-connection-upload-port' },
        R.createElement('label', null, '本机烧录端口', R.createElement('select', { value: state.portId, disabled: !!hardware.serialDisabledReason || !state.profileId,
          'aria-label': '连接弹窗本机烧录端口', onChange: (e: any) => { try { hardware.configure(state.profileId, e.target.value); setError(''); } catch (e) { setError(describeError(e)); } } },
        R.createElement('option', { value: '' }, '请明确选择 OS 端口'), ...state.ports.map((port: any) => R.createElement('option', { key: port.portId, value: port.portId }, port.displayName)))),
        R.createElement('button', { type: 'button', disabled: state.busy, onClick: () => { void hardware.refreshUploadPorts(); } }, '刷新烧录端口'),
        state.portError && R.createElement('span', { role: 'alert', className: 'cfzn-connection-service-note' }, `烧录端口：${state.portError}`)),
      (error || connected && state.serialError || blocked || state.scanError) && R.createElement('p', { className: 'cfzn-connection-feedback', role: error || state.serialError ? 'alert' : 'status' }, error || state.serialError || blocked || state.scanError),
      R.createElement('section', { className: `cfzn-connection-result ${failure ? 'is-failure' : ''}`, 'data-testid': 'connection-result', 'data-state': state.serialOperation || (connected ? 'connected' : failure ? 'error' : state.scanning ? 'scanning' : 'idle') },
        connected && !state.serialOperation || failure ? R.createElement('div', { className: 'cfzn-connection-rings', 'aria-hidden': true }, R.createElement('span', { className: 'cfzn-connection-serial-icon' })) :
          changing ? R.createElement('div', { className: 'cfzn-connection-searching', 'aria-hidden': true }, R.createElement('img', { src: `${assets}searching.48df3abf.png`, alt: '' }), R.createElement('span', { className: 'cfzn-connection-serial-icon' })) : R.createElement('img', { className: 'cfzn-connection-scan', src: `${assets}scan-sp.43a795b2.svg`, alt: '' }),
        R.createElement('strong', { role: 'status' }, text), R.createElement('p', null, detail),
        connected && !state.serialOperation && R.createElement('small', null, state.use === 'protocol' ? '协议就绪状态由原生固件握手另行确认。' : '串口可收发数据，未验证主控实时固件。')));
  };
}
