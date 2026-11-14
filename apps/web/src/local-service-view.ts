import type { HardwareController } from './hardware-controller';

export function renderLocalService(R: any, hardware: HardwareController, state: ReturnType<HardwareController['snapshot']>) {
  const service = state.localService;
  const label = { unknown: '尚未检测', checking: '检测中', online: '在线', offline: '离线', incompatible: '协议不兼容' }[service.status];
  return R.createElement('section', { className: 'cfzn-local-service', 'aria-label': '本机编译服务', 'data-status': service.status },
    R.createElement('strong', { role: 'status' }, `本机编译服务：${label}`),
    R.createElement('button', { type: 'button', disabled: service.status === 'checking', onClick: () => { void hardware.checkLocalService(); } }, service.status === 'unknown' ? '检测本机服务' : '重新检测'),
    R.createElement('p', null, service.message),
    service.status !== 'online' && R.createElement('small', null, '浏览器串口可独立连接。本机编译服务请按项目说明启动。'));
}
