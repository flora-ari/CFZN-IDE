import { profileUnavailableReason } from './hardware-controller.ts';
import type { HardwareController } from './hardware-controller.ts';
import type { HardwareSnapshot } from './hardware-types.ts';
import { describeError } from './hardware-session.ts';
import { renderLocalService } from './local-service-view.ts';

type Configuration = Pick<HardwareSnapshot, 'deviceId' | 'profileId' | 'portId'>;
type Feedback = Configuration & { kind: 'upload' | 'compile' | 'configure'; reason: string };

// Startup feedback belongs to one attempted configuration, independently of real job diagnostics.
export class UploadProgressModel {
  readonly hardware: HardwareController;
  private feedback?: Feedback;
  private listeners = new Set<() => void>();
  constructor(hardware: HardwareController) {
    this.hardware = hardware;
    hardware.subscribe(() => { this.synchronize(); this.publish(); });
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private publish() { this.listeners.forEach(fn => fn()); }
  private synchronize() {
    const state = this.hardware.snapshot(), feedback = this.feedback;
    if (feedback && (feedback.deviceId !== state.deviceId || feedback.profileId !== state.profileId || feedback.portId !== state.portId ||
      (feedback.kind !== 'configure' && this.hardware.startDisabledReason(feedback.kind === 'upload') !== feedback.reason))) this.feedback = undefined;
  }
  get message() {
    this.synchronize();
    const feedback = this.feedback;
    return feedback ? ({ upload: '上次上传未开始：', compile: '上次编译未开始：', configure: '设置未完成：' }[feedback.kind] + feedback.reason) : '';
  }
  private failed(kind: Feedback['kind'], error: unknown) {
    const { deviceId, profileId, portId } = this.hardware.snapshot();
    this.feedback = { deviceId, profileId, portId, kind, reason: describeError(error) };
  }
  configure(profileId: string, portId: string) {
    try { this.hardware.configure(profileId, portId); this.feedback = undefined; }
    catch (e) { this.failed('configure', e); throw e; }
    finally { this.publish(); }
  }
  start(upload: boolean) {
    this.feedback = undefined;
    try {
      const result = this.hardware.start(upload);
      if (result instanceof Promise) return result.catch(e => { this.failed(upload ? 'upload' : 'compile', e); this.publish(); throw e; });
      return result;
    }
    catch (e) { this.failed(upload ? 'upload' : 'compile', e); throw e; }
    finally { this.publish(); }
  }
}

export function makeUploadProgressView(R: any, model: UploadProgressModel) {
  return function UploadProgress(props: { start: (upload: boolean) => unknown; onClose: () => void }) {
    const [, update] = R.useState(0);
    R.useEffect(() => {
      const stop = model.subscribe(() => update((version: number) => version + 1));
      update((version: number) => version + 1); void model.hardware.refresh(); return stop;
    }, []);
    return renderUploadProgress(R, model, props);
  };
}

export function renderUploadProgress(R: any, model: UploadProgressModel, props: { start: (upload: boolean) => unknown; onClose: () => void }) {
  const hardware = model.hardware, state = hardware.snapshot();
  const profiles = state.profiles.filter(p => p.deviceId === state.deviceId);
  const profile = profiles.find(p => p.id === state.profileId);
  const compileReason = hardware.startDisabledReason(false), uploadReason = hardware.startDisabledReason(true);
  const readiness = state.busy ? '作业进行中' : state.localService.status !== 'online' ? '等待本机服务' : compileReason ? '待就绪' : state.portError ? '端口待检测' : !state.portId ? '待选 OS 端口' : uploadReason ? '待就绪' : '已就绪';
  const configure = (profileId: string, portId: string) => { try { model.configure(profileId, portId); } catch { /* The model presents the actual configuration failure. */ } };
  const run = (upload: boolean) => { try { void Promise.resolve(props.start(upload)).catch(() => undefined); } catch { /* The model presents the latest startup failure. */ } };
  return R.createElement('div', { className: 'cfzn-hardware cfzn-upload-progress', 'data-testid': 'hardware-progress' },
    R.createElement('div', { className: 'cfzn-upload-body' },
      renderLocalService(R, hardware, state),
      R.createElement('section', { className: 'cfzn-upload-readiness', 'aria-label': '编译上传准备状态' },
        R.createElement('p', { role: 'status' }, `终端：${state.connection === 'open' ? '已连接' : state.browserPortId ? '待释放' : '未连接'} · 编译上传：${readiness}`),
        R.createElement('small', null, '终端连接用于收发；烧录需本机编译服务和明确的 OS 端口。'),
        uploadReason && R.createElement('p', { role: 'status', className: 'cfzn-hardware-error' }, uploadReason)),
      R.createElement('div', { className: 'cfzn-hardware-row' },
        R.createElement('label', null, '主控 / Profile ', R.createElement('select', { value: state.profileId, disabled: state.busy,
          onChange: (e: any) => configure(e.target.value, state.portId) },
        R.createElement('option', { value: '' }, '请选择主控 Profile'), ...profiles.map(p => R.createElement('option', { key: p.id, value: p.id }, `${p.label} · ${p.chip}`)))),
        R.createElement('button', { disabled: state.busy, onClick: () => { void hardware.refreshUploadPorts(); } }, '刷新烧录端口')),
      profile && R.createElement('div', null,
        R.createElement('p', null, profile.fqbn),
        R.createElement('p', { role: 'status' }, `编译：${profile.compileAvailable ? '可用' : '不可用'} · 上传：${profile.uploadAvailable ? '可用' : '不可用'}`),
        (!profile.compileAvailable || !profile.uploadAvailable) && R.createElement('p', { role: 'alert', className: 'cfzn-hardware-error' }, profileUnavailableReason(profile, true))),
      R.createElement('label', null, '本机烧录端口 ', R.createElement('select', { value: state.portId, disabled: state.busy,
        onChange: (e: any) => configure(state.profileId, e.target.value) }, R.createElement('option', { value: '' }, '请明确选择 OS 端口'),
      ...state.ports.map(p => R.createElement('option', { key: p.portId, value: p.portId }, p.displayName)))),
      state.portError && R.createElement('p', { role: 'alert', className: 'cfzn-hardware-error' }, `烧录端口：${state.portError}`),
      R.createElement('p', { role: 'status' }, state.busy ? `正在${({ build: '编译', releasing: '释放串口', upload: '上传', restoring: '恢复原终端' } as any)[state.use] || '等待工具退出'}${state.job?.state === 'cancelling' ? ' · 正在取消，等待进程退出' : ''}` : state.job ? `${state.job.kind === 'build' ? '编译' : '上传'}：${state.job.state}` : '使用当前代码编辑器内容；无需先保存项目。'),
      model.message && R.createElement('p', { className: 'cfzn-hardware-error', role: 'alert' }, model.message),
      R.createElement('div', { className: 'cfzn-hardware-error', role: 'alert' }, state.error || state.job?.error?.message),
      state.restoreError && R.createElement('p', { className: 'cfzn-hardware-error' }, state.restoreError),
      R.createElement('pre', { className: 'cfzn-hardware-log', role: 'log' }, state.logs.map(line => line.text).join(''))),
    R.createElement('div', { className: 'cfzn-upload-actions' },
      R.createElement('p', { role: 'status', className: uploadReason ? 'cfzn-upload-blocked' : 'cfzn-upload-ready' }, uploadReason ? `编译上传：${uploadReason}` : '当前配置已就绪，点击“编译并上传”。'),
      !compileReason && uploadReason && R.createElement('p', { className: 'cfzn-upload-hint' }, '可先使用“编译检查”；上传需完成上述准备。'),
      R.createElement('div', { className: 'cfzn-hardware-row' },
        R.createElement('button', { disabled: !!compileReason, title: compileReason || undefined, onClick: () => run(false) }, '编译检查'),
        R.createElement('button', { disabled: !!uploadReason, title: uploadReason || undefined, onClick: () => run(true) }, '编译并上传'),
        R.createElement('button', { disabled: !state.busy || state.job?.state === 'cancelling', onClick: () => { void hardware.cancel(); } }, '取消作业'),
        R.createElement('button', { onClick: props.onClose }, state.busy ? '隐藏（作业继续）' : '关闭'))));
}
