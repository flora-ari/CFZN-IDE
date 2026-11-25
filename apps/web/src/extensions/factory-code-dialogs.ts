import type { CustomModuleBlock, CustomModuleDefinition } from './custom-module-definition';
import { previewCode, type FactoryReact } from './custom-module-factory-preview';
import { makeFactoryCodeEditor } from './factory-code-editor';
import { makeFactoryDialog } from './factory-dialog';

type SharedProps = { readOnly: boolean; onClose(): void };
type HeaderValues = Pick<CustomModuleDefinition, 'definitions' | 'setup'>;
type HeaderProps = SharedProps & HeaderValues & {
  initialTab?: keyof HeaderValues;
  onApply(values: HeaderValues): void;
};
type BlockProps = SharedProps & {
  block: CustomModuleBlock;
  definition: CustomModuleDefinition;
  pins: Parameters<typeof previewCode>[2];
  initialTab?: 'logic' | 'sample';
  onApply(code: string): void;
};

export function makeFactoryCodeDialogs(R: FactoryReact, NativeEditor: any) {
  const h = R.createElement;
  const Dialog = makeFactoryDialog(R);
  const Editor = makeFactoryCodeEditor(R, NativeEditor);
  const actions = ({ readOnly, onClose }: SharedProps, onSave: () => void) => [
    h('button', { key: 'close', type: 'button', className: 'cfzn-factory-dialog-button', onClick: onClose }, readOnly ? '关闭' : 'Cancel'),
    !readOnly && h('button', { key: 'ok', type: 'button', className: 'cfzn-factory-dialog-button cfzn-factory-dialog-primary', onClick: onSave }, 'OK'),
  ];
  const tab = (label: string, open: boolean, onClick: () => void) =>
    h('button', { type: 'button', 'aria-pressed': open, onClick }, label);

  function HeaderCodeDialog({ definitions, setup, readOnly, initialTab = 'definitions', onClose, onApply }: HeaderProps) {
    const [tabId, setTab] = R.useState(initialTab);
    const [draft, setDraft] = R.useState({ definitions, setup });
    const label = tabId === 'definitions' ? '全局声明和头文件' : 'setup() 初始化';
    return h(Dialog, { id: 'cfzn-factory-headers', size: 'code', title: '生成器头文件 / 全局片段', onClose,
      actions: actions({ readOnly, onClose }, () => onApply(draft)) },
    h('div', { className: 'cfzn-factory-code-tabs', role: 'group', 'aria-label': '公共代码区域' },
      tab('全局声明和头文件', tabId === 'definitions', () => setTab('definitions')),
      tab('setup() 初始化', tabId === 'setup', () => setTab('setup'))),
    h(Editor, { key: tabId, label, value: draft[tabId], readOnly, theme: 'vs-dark', height: 400,
      onChange: value => setDraft(previous => ({ ...previous, [tabId]: value })) }));
  }

  function BlockCodeDialog({ block, definition, pins, readOnly, initialTab = 'logic', onClose, onApply }: BlockProps) {
    const [tabId, setTab] = R.useState(initialTab);
    const [code, setCode] = R.useState(block.code);
    const [ready, setReady] = R.useState(false);
    const insert = R.useRef<((text: string) => void) | null>(null);
    return h(Dialog, { id: 'cfzn-factory-block-logic', size: 'code', title: 'Arduino 生成器：' + block.key, onClose,
      actions: actions({ readOnly, onClose }, () => onApply(code)) },
    h('div', { className: 'cfzn-factory-code-tabs', role: 'group', 'aria-label': '积木代码区域' },
      tab('Arduino C++', tabId === 'logic', () => setTab('logic')),
      tab('生成示例', tabId === 'sample', () => setTab('sample'))),
    tabId === 'logic' ? h('div', null,
      !readOnly && block.inputs.length !== 0 && h('div', {
        className: 'cfzn-factory-actions cfzn-factory-code-insert', role: 'group', 'aria-label': '插入积木参数',
      }, block.inputs.map(({ name }) => h('button', {
        key: name, type: 'button', className: 'cfzn-factory-dialog-button', disabled: !ready,
        'aria-label': '插入参数 ' + name, onClick: () => insert.current?.('{{' + name + '}}'),
      }, '{{' + name + '}}'))),
      h(Editor, { label: '积木代码', value: code, readOnly, theme: 'vs-dark', height: 400, onChange: setCode,
        onInsertReady: apply => { insert.current = apply; setReady(true); } }))
      : h('div', { 'data-cfzn-custom-code-preview': '' }, h(Editor, {
        label: '默认参数生成的 Arduino 示例', value: previewCode(definition, { ...block, code }, pins),
        readOnly: true, theme: 'vs-dark', height: 400,
      })));
  }

  return { BlockCodeDialog, HeaderCodeDialog };
}
