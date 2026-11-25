import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareController } from '../src/hardware-controller.ts';
import { HardwareSession } from '../src/hardware-session.ts';
import { UploadProgressModel, renderUploadProgress } from '../src/upload-progress.ts';
import type { HardwareSource } from '../src/hardware-controller.ts';
import type { HardwareJob, HardwareProfile } from '../src/hardware-types.ts';

type Element = { type: string; props: Record<string, any>; children: any[] };
const R = { createElement: (type: string, props: any, ...children: any[]): Element => ({ type, props: props ?? {}, children }) };
function elements(root: Element): Element[] {
  return [root, ...root.children.filter(value => value && typeof value === 'object').flatMap(elements)];
}
const text = (root: Element): string => root.children.map(value => value && typeof value === 'object' ? text(value) : typeof value === 'string' ? value : '').join('');
const button = (root: Element, label: string) => elements(root).find(node => node.type === 'button' && text(node) === label)!;
async function until(done: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!done()) { assert.ok(Date.now() < deadline, 'expected mock job to finish'); await new Promise(resolve => setImmediate(resolve)); }
}
async function fixture() {
  const current: HardwareSource = { deviceId: 'arduinoEsp32', code: 'void setup(){} void loop(){}', documentId: 1, editVersion: 1, moduleIds: [], realtime: false };
  const profiles: HardwareProfile[] = ['esp32', 'esp32-alt'].map(id => ({ id, deviceId: 'arduinoEsp32', label: id, chip: 'esp32', fqbn: 'esp32:esp32:esp32', compileAvailable: true, uploadAvailable: true, realtimeAvailable: false }));
  profiles.push({ ...profiles[0], id: 'uno', deviceId: 'arduinoUno', chip: 'avr', fqbn: 'arduino:avr:uno' });
  let ports = [{ portId: 'COM-MOCK', displayName: 'Mock port' }];
  let jobState: HardwareJob['state'] = 'succeeded', unknownSubmission = false;
  const calls: { path: string; method: string; body?: any }[] = [];
  const job = (kind: HardwareJob['kind'], state: HardwareJob['state']): HardwareJob => ({ id: kind, kind, state, stage: state === 'running' ? kind === 'build' ? 'compiling' : 'uploading' : 'complete',
    deviceId: 'arduinoEsp32', profileId: 'esp32', sourceHash: 'mock', createdAt: '2026-11-23T00:00:00Z',
    ...(state === 'failed' ? { error: { code: 'MOCK_FAILED', message: '真实模拟作业失败' } } : {}) });
  const session = new HardwareSession();
  const request: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path.endsWith('/capabilities')) return Response.json({ protocolVersion: 1, executionHost: 'local', profiles, toolchain: { cliVersion: 'mock', description: 'mock' } });
    if (path.endsWith('/ports')) return Response.json({ items: ports });
    if (init?.method === 'POST') {
      if (unknownSubmission) throw new TypeError('mock response lost');
      return Response.json({ job: job(path.endsWith('/builds') ? 'build' : 'upload', 'running') });
    }
    return Response.json({ job: job(path.endsWith('/build') ? 'build' : 'upload', jobState), logs: [{ index: 0, stream: 'stderr', text: '保留作业日志\n' }], nextLog: 1 });
  };
  const hardware = new HardwareController(session, () => current, 'http://mock/api', () => {}, request, async () => {});
  const model = new UploadProgressModel(hardware);
  const view = (onClose = () => {}) => renderUploadProgress(R, model, { start: upload => { model.start(upload); }, onClose });
  await hardware.refresh(); hardware.changed();
  return { hardware, session, model, current, profiles, calls, view,
    removePorts: () => { ports = []; }, failJobs: () => { jobState = 'failed'; }, loseSubmission: () => { unknownSubmission = true; } };
}
const posts = <T extends { method: string }>(calls: T[]) => calls.filter(call => call.method === 'POST');

test('missing port feedback clears through the rendered selector and only explicit retry builds and uploads once', async () => {
  const { model, hardware, calls, view } = await fixture();
  assert.throws(() => model.start(true), /明确选择/);
  assert.match(text(view()), /上次上传未开始：请先明确选择/);
  assert.equal(posts(calls).length, 0);
  const selector = elements(view()).find(node => node.type === 'select' && node.props.value === '')!;
  selector.props.onChange({ target: { value: 'COM-MOCK' } });
  assert.equal(hardware.portId, 'COM-MOCK');
  const ready = view();
  assert.equal(model.message, '');
  assert.match(text(ready), /当前配置已就绪，点击“编译并上传”/);
  assert.equal(button(ready, '编译并上传').props.disabled, false);
  assert.equal(posts(calls).length, 0);
  const [body, footer] = ready.children as Element[];
  assert.equal(body.props.className, 'cfzn-upload-body');
  assert.equal(footer.props.className, 'cfzn-upload-actions');
  assert.equal(elements(footer).filter(node => node.type === 'button').length, 4);
  assert.equal(elements(footer).some(node => node.props.role === 'log'), false);
  button(ready, '编译并上传').props.onClick();
  await until(() => !hardware.busy);
  assert.deepEqual(posts(calls).map(call => call.path), ['/api/builds', '/api/uploads']);
  assert.deepEqual(posts(calls)[1].body, { buildId: 'build', portId: 'COM-MOCK' });
  assert.equal(hardware.job?.state, 'succeeded');
});

test('external connection configuration, profile changes and board changes invalidate old feedback even while closed', async () => {
  const { model, hardware, current, calls, view } = await fixture();
  assert.throws(() => model.start(true), /明确选择/);
  assert.match(model.message, /明确选择/); // Reopening with unchanged configuration retains the relevant cause.
  hardware.configure('esp32', 'COM-MOCK'); // Same controller path as the separate connection modal.
  assert.equal(model.message, '');
  assert.doesNotMatch(text(view()), /上次上传未开始/);
  model.configure('esp32', '');
  assert.throws(() => model.start(true), /明确选择/);
  hardware.configure('esp32-alt', '');
  hardware.configure('esp32', '');
  assert.equal(model.message, '', 'returning to an earlier configuration cannot resurrect feedback');
  assert.throws(() => model.start(true), /明确选择/);
  current.deviceId = 'arduinoUno'; hardware.changed();
  current.deviceId = 'arduinoEsp32'; hardware.changed();
  assert.equal(model.message, '');
  assert.equal(posts(calls).length, 0);
});

test('invalid configuration and retry show one latest cause while capability recovery clears a resolved startup failure', async () => {
  const { model, hardware, current, profiles, calls, view } = await fixture();
  assert.throws(() => model.start(true), /明确选择/);
  assert.throws(() => model.configure('esp32', 'removed-port'), /已消失/);
  assert.equal(hardware.portId, '');
  assert.match(model.message, /^设置未完成：.*已消失/);
  current.generationError = '代码生成失败：mock';
  assert.throws(() => model.start(true), /代码生成失败/);
  assert.match(model.message, /^上次上传未开始：代码生成失败：mock$/);
  assert.doesNotMatch(text(view()), /已消失|明确选择本机烧录端口/);
  current.generationError = '';
  hardware.configure('esp32', 'COM-MOCK');
  profiles[0].compileAvailable = false; profiles[0].reason = 'No toolchain configured for this profile.';
  await hardware.refresh();
  assert.throws(() => model.start(true), /尚未配置本机工具链/);
  assert.match(model.message, /No toolchain configured/);
  profiles[0].compileAvailable = true; delete profiles[0].reason;
  await hardware.refresh();
  assert.equal(model.message, '');
  assert.match(text(view()), /当前配置已就绪/);
  assert.equal(posts(calls).length, 0);
});

test('readiness shares startup guards and refuses a removed OS port without submitting', async () => {
  const { hardware, session, current, profiles, calls, view, removePorts } = await fixture();
  hardware.configure('esp32', 'COM-MOCK');
  const blocked = (reason: RegExp) => {
    const progress = view();
    assert.equal(button(progress, '编译并上传').props.disabled, true);
    assert.match(button(progress, '编译并上传').props.title, reason);
    assert.doesNotMatch(text(progress), /当前配置已就绪/);
    assert.throws(() => hardware.start(true), reason);
  };
  current.programming = true; blocked(/上传模式/); current.programming = false;
  current.realtime = true; blocked(/上传模式/); current.realtime = false;
  current.generationError = '生成失败'; blocked(/生成失败/); current.generationError = '';
  current.code = ''; blocked(/代码为空/); current.code = 'void setup(){}';
  hardware.setMutationGuard(() => '正在切换项目'); blocked(/切换项目/); hardware.setMutationGuard(() => '');
  hardware.busy = true; blocked(/作业仍在进行/); hardware.busy = false;
  session.operation = 'switching'; blocked(/串口操作/); session.operation = null;
  session.portId = 'held'; session.status = 'error'; blocked(/串口仍被持有/); session.portId = null; session.status = 'disconnected';
  hardware.profileId = 'old'; blocked(/Profile 已失效/); hardware.profileId = 'esp32';
  profiles[0].uploadAvailable = false; await hardware.refresh(); blocked(/上传工具不可用/);
  profiles[0].uploadAvailable = true; await hardware.refresh();
  removePorts(); await hardware.refreshUploadPorts();
  assert.equal(hardware.portId, 'COM-MOCK'); blocked(/烧录端口已失效/);
  assert.equal(posts(calls).length, 0);
});

test('selection and health checks preserve actual failed job diagnostics, logs and terminal restore errors', async () => {
  const { model, hardware, calls, view, failJobs } = await fixture();
  hardware.configure('esp32', 'COM-MOCK'); failJobs();
  model.start(true); await until(() => !hardware.busy);
  const failedJob = hardware.job;
  assert.match(text(view()), /真实模拟作业失败/);
  hardware.restoreError = '终端恢复失败：mock';
  hardware.error = '作业执行错误：mock';
  const logs = [...hardware.logs];
  model.configure('esp32-alt', 'COM-MOCK'); await hardware.refresh();
  assert.equal(hardware.job, failedJob);
  assert.equal(hardware.job?.state, 'failed');
  assert.equal(hardware.error, '作业执行错误：mock');
  assert.equal(hardware.restoreError, '终端恢复失败：mock');
  assert.deepEqual(hardware.logs, logs);
  const rendered = text(view());
  assert.match(rendered, /作业执行错误：mock/); assert.match(rendered, /终端恢复失败：mock/); assert.match(rendered, /保留作业日志/);
  assert.equal(posts(calls).length, 1);
});

test('an unknown submission keeps ownership and its error when retry or configuration is attempted', async () => {
  const { model, hardware, calls, view, loseSubmission } = await fixture();
  hardware.configure('esp32', 'COM-MOCK'); loseSubmission();
  model.start(true); await until(() => hardware.error.includes('提交结果未知'));
  assert.equal(hardware.busy, true);
  const error = hardware.error, logs = [...hardware.logs];
  assert.throws(() => model.start(true), /作业仍在进行/);
  assert.throws(() => model.configure('esp32-alt', 'COM-MOCK'), /作业仍在进行/);
  await hardware.refresh();
  assert.equal(hardware.busy, true); assert.equal(hardware.profileId, 'esp32');
  assert.equal(hardware.error, error); assert.deepEqual(hardware.logs, logs);
  let hidden = false;
  const progress = view(() => { hidden = true; });
  assert.match(text(progress), /提交结果未知/); assert.doesNotMatch(text(progress), /当前配置已就绪/);
  button(progress, '隐藏（作业继续）').props.onClick();
  assert.equal(hidden, true); assert.equal(hardware.busy, true);
  assert.equal(posts(calls).length, 1);
});
