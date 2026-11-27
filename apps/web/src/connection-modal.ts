import type { SerialDevicePanel, SerialDeviceRow } from './serial-device-panel.ts';

export function makeConnectionView(R: any, panel: SerialDevicePanel) {
  return function ConnectionView() {
    const [, update] = R.useState(0);
    R.useEffect(() => { const stop = panel.subscribe(() => update((value: number) => value + 1)); void panel.refresh(); return stop; }, []);
    return renderConnectionPanel(R, panel);
  };
}

export function renderConnectionPanel(R: any, panel: SerialDevicePanel) {
  const hardware = panel.hardware, state = hardware.snapshot(), local = panel.sources.local, rows = panel.rows;
  const labels = ['设备名称', '端口', '波特率', '状态', '操作'];
  const run = (action: () => Promise<unknown>) => { void action().catch(() => undefined); };
  const operationBlocked = !!hardware.serialDisabledReason;
  const cell = (label: string, ...children: any[]) => R.createElement('td', null, R.createElement('span', { className: 'cfzn-connection-field' }, label), ...children);
  const row = (device: SerialDeviceRow) => R.createElement('tr', { key: device.id, 'data-port-id': device.id, 'data-source': device.source, 'data-active': device.active },
    cell('设备名称', device.name, R.createElement('small', null, device.source === 'local' ? '本机直连' : '保留的已有连接')),
    cell('端口', device.port),
    cell('波特率', device.source === 'local' ? R.createElement('input', { type: 'text', inputMode: 'numeric', value: device.draftBaud, list: 'cfzn-device-baud-rates', disabled: operationBlocked,
      'aria-label': `${device.name} ${device.port} 波特率`, onChange: (event: any) => panel.edit(device.id, event.target.value) }) : String(state.options.baudRate),
    R.createElement('small', null, device.source === 'local' ? `已保存 ${device.savedBaud}${device.appliedBaud === undefined ? '' : ` · 实际 ${device.appliedBaud}`}` : state.connection === 'open' ? '实际波特率' : '最后应用的波特率')),
    cell('状态', R.createElement('span', { className: device.active && state.connection === 'open' ? 'cfzn-connection-ok' : '' }, device.status),
      device.error && R.createElement('p', { role: 'alert', className: 'cfzn-connection-row-error' }, device.error)),
    cell('操作', R.createElement('div', { className: 'cfzn-connection-row-actions' },
      device.source === 'local' && R.createElement('button', { type: 'button', disabled: device.active ? !!device.blocked : operationBlocked, title: device.active ? device.blocked || undefined : undefined,
        onClick: () => run(() => device.active ? panel.apply(device.id) : panel.save(device.id)) }, device.active ? '应用' : '保存偏好'),
      R.createElement('button', { type: 'button', disabled: !!(device.active ? device.disconnectBlocked : device.blocked), title: (device.active ? device.disconnectBlocked : device.blocked) || undefined,
        onClick: () => run(() => device.active ? panel.disconnectRow(device.id) : panel.activate(device.id)) }, device.active ? state.connection === 'open' ? '断开' : '重试断开' : state.browserPortId ? '切换连接' : '连接'))));
  return R.createElement('div', { className: 'cfzn-hardware cfzn-connection', 'data-testid': 'hardware-connect', 'data-ui': true },
    R.createElement('div', { className: 'cfzn-connection-body' },
      R.createElement('section', { className: 'cfzn-connection-service', 'aria-label': '本机串口服务', 'data-status': local.status },
        R.createElement('strong', { role: 'status' }, `本机串口服务：${({ unknown: '尚未检测', checking: '检测中', online: '可用', offline: '状态待确认', legacy: '需更新', unavailable: '不可用' })[local.status]}`),
        R.createElement('button', { type: 'button', disabled: local.status === 'checking', onClick: () => { void panel.refreshLocal(); } }, '重新检测'),
        R.createElement('p', null, local.message)),
      R.createElement('div', { className: 'cfzn-connection-controls' },
        R.createElement('span', null, '本机直连'),
        R.createElement('button', { type: 'button', disabled: state.scanning || local.status === 'checking', onClick: () => { void panel.refreshLocal(); } }, '刷新设备')),
      R.createElement('datalist', { id: 'cfzn-device-baud-rates' }, ...[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(rate => R.createElement('option', { key: rate, value: String(rate) }))),
      R.createElement('div', { className: 'cfzn-connection-table' }, R.createElement('table', { 'aria-label': '串口设备' },
        R.createElement('thead', null, R.createElement('tr', null, ...labels.map(label => R.createElement('th', { key: label, scope: 'col' }, label)))),
        R.createElement('tbody', null, ...rows.map(row), !rows.length && R.createElement('tr', null, R.createElement('td', { colSpan: 5, className: 'cfzn-connection-empty' },
          state.scanning || local.status === 'checking' ? '正在刷新设备列表…' : local.confirmed ? '本机服务暂未列出串口，可刷新检测。' : '本机设备列表尚未确认，请重新检测。'))))),
      hardware.serialDisabledReason && R.createElement('p', { role: 'status', className: 'cfzn-connection-note' }, hardware.serialDisabledReason),
      R.createElement('p', { className: 'cfzn-connection-note' }, '每行保存自己的波特率；保存偏好不会打开设备。关闭面板保留当前连接。')));
}
