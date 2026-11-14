import type { ModeController } from './mode-controller';
import type { nativeHardware } from './native-hardware';
import { encodeSerialInput, formatHex } from './serial';
import './mode-ui.css';

export function modeUi(getMode: () => ModeController, getHardware: () => ReturnType<typeof nativeHardware>) {
  let Controls: any, Workspace: any, Terminal: any;
  const initial = new Set<() => void>();
  function useMode(R: any) {
    const mode = getMode(); const [, update] = R.useState(0);
    R.useEffect(() => {
      const render = () => update((n: number) => n + 1); initial.add(render);
      const stop = mode?.subscribe(render); return () => { initial.delete(render); stop?.(); };
    }, [mode]);
    return mode;
  }
  function renderControls(R: any) {
    Controls ??= function Controls() {
      const mode = useMode(R);
      if (!mode) return null; // MenuBar renders before the GUI onVmInit lifecycle callback.
      return R.createElement('div', { className: 'cfzn-mode-controls', role: 'group', 'aria-label': '工作区模式', 'data-testid': 'mode-controls' },
        ...(['programming', 'upload'] as const).map(value => R.createElement('button', { key: value, type: 'button',
          'aria-pressed': mode.editorMode === value, title: mode.disabledReason || '',
          disabled: !!mode.disabledReason, onClick: () => { void mode.chooseMode(value); } }, value === 'programming' ? '编程模式' : '上传模式')),
        (mode.error || mode.disabledReason) && R.createElement('span', { role: mode.error ? 'alert' : 'status', className: 'cfzn-mode-message' }, mode.error || mode.disabledReason));
    };
    return R.createElement(Controls);
  }
  function terminal(R: any) {
    Terminal ??= function SharedTerminal() {
      const ui = getHardware(), { hardware, session, terminalModel } = ui;
      const [state, setState] = R.useState(hardware.snapshot());
      const [terminalState, setTerminalState] = R.useState(terminalModel.snapshot());
      const { logs, input, sendMode, receiveMode, newline, baud, message, paused } = terminalState;
      const log = R.useRef(null);
      const setMessage = (value: string) => terminalModel.setMessage(value);
      R.useEffect(() => {
        const stopHardware = hardware.subscribe(() => setState(hardware.snapshot()));
        const stopTerminal = terminalModel.subscribe(() => setTerminalState(terminalModel.snapshot()));
        setState(hardware.snapshot()); setTerminalState(terminalModel.snapshot());
        return () => { stopHardware(); stopTerminal(); };
      }, []);
      R.useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [logs]);
      const run = (fn: () => any) => { void Promise.resolve().then(fn).catch(e => setMessage(String(e))); };
      return R.createElement('section', { className: 'cfzn-upload-serial', 'aria-label': '上传串口终端', 'data-testid': 'upload-terminal' },
        R.createElement('div', { className: 'cfzn-terminal-heading' }, R.createElement('strong', null, '串口终端'),
          R.createElement('span', { role: 'status' }, state.connection === 'open' ? `已连接 · ${state.options.baudRate}` : state.message || '未连接'),
          R.createElement('button', { disabled: !!hardware.serialDisabledReason, onClick: () => run(() => state.browserPortId ? ui.disconnect() : ui.openConnect()) }, state.browserPortId ? '断开' : '连接串口'),
          R.createElement('button', { 'aria-pressed': paused, onClick: () => { terminalModel.setPaused(!paused); } }, paused ? '继续' : '暂停'),
          R.createElement('button', { onClick: () => { terminalModel.clear(); } }, '清空')),
        R.createElement('div', { className: 'cfzn-terminal-log', ref: log, role: 'log', 'aria-label': '共享串口记录' },
          ...(receiveMode === 'hex' ? logs.byteChunks.map((row: any) => ({ ...row, content: formatHex(new Uint8Array(row.bytes)) })) : logs.textRows.map((row: any) => ({ ...row, content: row.text })))
            .map((row: any) => R.createElement('div', { key: row.id }, R.createElement('span', null, `${row.direction} `), row.content))),
        R.createElement('div', { className: 'cfzn-terminal-options' },
          R.createElement('label', null, '波特率 ', R.createElement('input', { 'aria-label': '上传串口波特率', type: 'number', min: 1, max: 4294967295, value: baud, disabled: !!hardware.serialDisabledReason || state.use === 'protocol', onChange: (e: any) => terminalModel.setBaud(e.target.value) })),
          R.createElement('button', { disabled: !!hardware.serialDisabledReason || state.use === 'protocol', onClick: () => run(() => hardware.applySerialSettings({ options: { ...session.options, baudRate: Number(baud) } })) }, '应用'),
          R.createElement('label', null, '接收 ', R.createElement('select', { 'aria-label': '上传串口接收格式', value: receiveMode, onChange: (e: any) => terminalModel.setReceiveMode(e.target.value) }, R.createElement('option', { value: 'text' }, '文本'), R.createElement('option', { value: 'hex' }, 'HEX')))),
        R.createElement('form', { className: 'cfzn-terminal-send', onSubmit: (e: any) => {
          e.preventDefault(); run(async () => { hardware.assertIdle(); if (getMode().protocolActive) throw new Error('实时硬件协议占用串口。');
            const bytes = encodeSerialInput(input, sendMode, newline), sessionId = session.sessionId; await session.write(bytes); if (terminalModel.appendSent(bytes, sessionId)) setMessage(''); });
        } },
        R.createElement('input', { 'aria-label': '上传串口发送内容', placeholder: sendMode === 'hex' ? '41 42 0A' : '发送内容', value: input, onChange: (e: any) => terminalModel.setInput(e.target.value) }),
        R.createElement('select', { 'aria-label': '上传串口发送格式', value: sendMode, onChange: (e: any) => terminalModel.setSendMode(e.target.value) }, R.createElement('option', { value: 'text' }, '文本'), R.createElement('option', { value: 'hex' }, 'HEX')),
        R.createElement('select', { 'aria-label': '上传串口行尾', value: newline, onChange: (e: any) => terminalModel.setNewline(e.target.value) }, ...['none', 'LF', 'CR', 'CRLF'].map(n => R.createElement('option', { key: n, value: n }, n === 'none' ? '无行尾' : n))),
        R.createElement('button', { type: 'submit', disabled: !!hardware.serialDisabledReason || state.connection !== 'open' || state.use === 'protocol' }, '发送')),
        (message || state.serialError) && R.createElement('p', { role: 'alert' }, message || state.serialError));
    };
    return R.createElement(Terminal);
  }
  function renderWorkspace(R: any, CodeEditor: any, props: any) {
    Workspace ??= function UploadWorkspace({ native }: any) {
      const mode = useMode(R), ui = getHardware();
      const [state, setState] = R.useState(ui.hardware.snapshot());
      const [shown, setShown] = R.useState(true);
      const editor = R.useRef(null), editorHost = R.useRef(null);
      R.useEffect(() => ui.hardware.subscribe(() => setState(ui.hardware.snapshot())), []);
      R.useLayoutEffect(() => {
        const host = editorHost.current;
        const layout = () => { if (host?.clientWidth && host?.clientHeight) editor.current?.layout({ width: host.clientWidth, height: host.clientHeight }); };
        const observer = new ResizeObserver(layout); if (host) observer.observe(host);
        requestAnimationFrame(layout); return () => observer.disconnect();
      }, [shown]);
      return R.createElement('aside', { className: 'cfzn-upload-workspace', 'data-testid': 'upload-workspace', 'aria-label': '上传工作区' },
        R.createElement('div', { className: 'cfzn-upload-heading' },
          R.createElement('button', { className: 'cfzn-upload-primary', disabled: state.busy || !!mode.generationError && mode.codeMode === 'generated', onClick: ui.nativeUpload }, '↑ 上传到设备'),
          R.createElement('button', { disabled: state.busy, onClick: ui.openProgress, 'aria-label': '编译和设备设置' }, '设置 / 编译'),
          R.createElement('button', { 'aria-pressed': shown, onClick: () => { setShown(!shown); setTimeout(() => window.dispatchEvent(new Event('resize')), 0); } }, `${shown ? '▣' : '□'} 代码区`),
          R.createElement('span', null, 'Arduino C')),
        !state.deviceId && R.createElement('p', { className: 'cfzn-upload-guidance' }, '尚未选择主控，请从主控扩展选择后配置设备。'),
        R.createElement('div', { className: 'cfzn-code-area', hidden: !shown },
          R.createElement('div', { className: 'cfzn-code-tabs', role: 'tablist', 'aria-label': '代码来源' },
            ...(['generated', 'manual'] as const).map(value => R.createElement('button', { key: value, role: 'tab', 'aria-selected': mode.codeMode === value,
              disabled: state.busy, onClick: () => mode.chooseCode(value) }, value === 'generated' ? '自动生成' : '手动编辑'))),
          mode.codeMode === 'manual' && R.createElement('div', { className: 'cfzn-code-association' }, `手稿 · 当前主控：${({ arduinoUno: 'Arduino Uno', arduinoEsp32: 'ESP32', arduinoEsp32S3: 'ESP32-S3', aijiteESP32S3: 'Aijite ESP32-S3', firebeetleEsp32E: 'FireBeetle ESP32-E' } as any)[state.deviceId || ''] || '未选择'} · 切板后请核对源码`),
          mode.generationError && mode.codeMode === 'generated' && R.createElement('p', { role: 'alert' }, mode.generationError),
          R.createElement('div', { className: 'cfzn-native-monaco', ref: editorHost }, R.createElement(CodeEditor, {
            width: '100%', value: mode.selectedSource, language: 'cpp', theme: mode.codeMode === 'generated' ? 'readOnlyTheme' : 'vs',
            options: { ...native.codeEditorOptions, readOnly: mode.codeMode === 'generated' || state.busy || !!mode.disabledReason, automaticLayout: true },
            editorWillMount: native.onCodeEditorWillMount, editorDidMount: (instance: any) => {
              editor.current = instance; native.onCodeEditorDidMount(instance);
              requestAnimationFrame(() => { const host = editorHost.current; if (host?.clientWidth && host?.clientHeight) instance.layout({ width: host.clientWidth, height: host.clientHeight }); });
            },
            onChange: (value: string) => mode.editManual(value),
          }))),
        state.busy && R.createElement('p', { role: 'status', className: 'cfzn-upload-job' }, `硬件作业：${state.job?.state || '等待创建'} · ${state.use}`),
        terminal(R));
    };
    return R.createElement(Workspace, { native: props });
  }
  return { renderControls, renderWorkspace, refresh: () => initial.forEach(fn => fn()) };
}
