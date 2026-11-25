import type * as React from 'react';
import { isStatementShape, pinMenu, pinUnavailable, validateCustomModuleBlock,
  type CustomModuleAppearance, type CustomModuleBlock, type CustomModuleInput,
  type CustomModuleInputType } from './custom-module-definition';
import type { FactoryReact, PinOptions } from './custom-module-factory-preview';
import { makeFactoryDialog } from './factory-dialog';
import { createFactoryWorkspace } from './factory-workspace';

const pinTypes = {
  digitalOutputPin: '数字输出引脚',
  analogInputPin: '模拟输入引脚',
  digitalInputPin: '数字输入引脚',
} as const;
type PinType = keyof typeof pinTypes;
const defaultChoices: [string, string][] = [['A', 'A'], ['B', 'B']];
const additions = [
  { type: 'label', title: '添加文本', symbol: '文本' },
  { type: 'textValue', title: '添加文本变量', symbol: 'TXT' },
  { type: 'numberValue', title: '添加数字变量', symbol: 'X' },
  { type: 'boolean', title: '添加布尔变量', symbol: 'BOOL' },
  { type: 'dropdown', title: '添加下拉框变量', symbol: 'DROPDOWN' },
] as const;
const typeLabels: Record<CustomModuleInputType, string> = {
  textValue: '文本', numberValue: '数字', boolean: '布尔', dropdown: '下拉框',
  text: '文本字段', number: '数字字段', value: '值输入', statement: '语句输入',
  ...pinTypes,
};

interface DropdownDraft {
  mode: 'custom' | 'device';
  pin: PinType;
  options: [string, string][];
  labels: string;
  defaultOption: string;
}
interface ParameterDraft {
  originalName?: string;
  type: CustomModuleInputType;
  value: string | boolean;
  dropdown?: DropdownDraft;
}
interface ParameterRow {
  id: string;
  name: string;
  draft: ParameterDraft;
}
type DeclarationPart = ({ label: string } | { parameter: ParameterRow }) & { newPart: boolean };

function parameterDraft(input: CustomModuleInput, existing: boolean): ParameterDraft {
  const { type } = input;
  const pin = pinMenu(type) ? type as PinType : undefined;
  const options = input.options ?? defaultChoices;
  const value = type === 'boolean' ? input.defaultValue === true :
    String(input.defaultValue ?? (type === 'value' || type === 'number' || type === 'numberValue' ? '0' : ''));
  return {
    originalName: existing ? input.name : undefined, type, value,
    dropdown: (pin || type === 'dropdown') ? {
      mode: pin ? 'device' : 'custom', pin: pin ?? 'digitalOutputPin', options,
      labels: options.map(([label]) => label).join(', '), defaultOption: options[0][1],
    } : undefined,
  };
}

function dropdownChoices(labels: string, previous: DropdownDraft): DropdownDraft {
  const names = labels.split(',').map(label => label.trim()).filter(Boolean);
  // Keep the original label/code pairs for entries that are still present.
  const retained = new Map<string, string[]>();
  for (const [label, code] of previous.options) {
    if (!retained.has(label)) retained.set(label, []);
    retained.get(label)!.push(code);
  }
  const options = names.map((label): [string, string] => [label, retained.get(label)?.shift() ?? label]);
  const defaultOption = options.some(([, code]) => code === previous.defaultOption) ? previous.defaultOption : options[0]?.[1] ?? '';
  return { ...previous, labels, options, defaultOption };
}

function applyParameter({ name, draft }: ParameterRow): CustomModuleInput {
  const { dropdown, type, value } = draft;
  if (dropdown) {
    if (dropdown.mode === 'device') return { name, type: dropdown.pin };
    const index = dropdown.options.findIndex(([, option]) => dropdown.defaultOption === option);
    const options = index > 0
      ? [dropdown.options[index], ...dropdown.options.filter((_, position) => position !== index)] : dropdown.options;
    return { name, type: 'dropdown', options };
  }
  if (type === 'statement') return { name, type };
  if (type === 'number' || type === 'numberValue') {
    const number = String(value).trim();
    return { name, type, defaultValue: number ? Number(number) : 0 };
  }
  return { name, type, defaultValue: value };
}

function declarationParts(Blockly: any, root: any, drafts: Map<string, ParameterDraft>, additions: Set<string>): DeclarationPart[] {
  return root.inputList.map((input: any) => ({
    newPart: additions.has(input.name),
    ...(input.type === Blockly.DUMMY_INPUT ? { label: input.fieldRow[0].getValue() } : {
      parameter: { id: input.name, name: input.connection.targetBlock().getFieldValue('TEXT'), draft: drafts.get(input.name)! },
    }),
  }));
}

interface BlockDialogProps {
  block: CustomModuleBlock;
  existing: boolean;
  otherKeys: readonly string[];
  appearance: CustomModuleAppearance;
  Blockly: any;
  pins: PinOptions;
  onClose(): void;
  onApply(block: CustomModuleBlock): void;
}

export function makeFactoryBlockDialog(R: FactoryReact) {
  const h = R.createElement;
  const Dialog = makeFactoryDialog(R);
  const button = (label: string, onClick: () => void, props: React.ButtonHTMLAttributes<HTMLButtonElement> & React.Attributes = {}) =>
    h('button', { type: 'button', className: 'cfzn-factory-dialog-button', onClick, ...props }, label);

  function Defaults({ row, pins, update }: { row: ParameterRow; pins: PinOptions; update(draft: ParameterDraft): void }) {
    const { id, name, draft } = row;
    const controlId = 'cfzn-factory-default-' + id;
    const dropdown = draft.dropdown;
    const patchDropdown = (updates: Partial<DropdownDraft>) => update({ ...draft, dropdown: { ...dropdown!, ...updates } });
    const change = (event: React.ChangeEvent<HTMLInputElement>) => update({ ...draft, value: event.currentTarget.value });
    const labels = (label: string, control: React.ReactNode) => h('label', { className: 'cfzn-factory-field' }, label, control);
    let control: React.ReactNode;
    if (dropdown) {
      const source = pinMenu(dropdown.pin)!;
      control = h('div', { className: 'cfzn-declare-options' },
        h('div', { className: 'cfzn-declare-toolbar', role: 'group', 'aria-label': name + ' 下拉选项来源' },
          button('自定义（英文逗号分隔）', () => patchDropdown({ mode: 'custom' }), {
            'aria-pressed': dropdown.mode === 'custom',
            className: 'cfzn-factory-dialog-button' + (dropdown.mode === 'custom' ? ' cfzn-factory-dialog-primary' : ''),
          }),
          button('设备引脚列表', () => patchDropdown({ mode: 'device' }), {
            'aria-pressed': dropdown.mode === 'device',
            className: 'cfzn-factory-dialog-button' + (dropdown.mode === 'device' ? ' cfzn-factory-dialog-primary' : ''),
          })),
        dropdown.mode === 'device'
          ? h('div', null, labels('选择设备引脚类型', h('select', {
            value: dropdown.pin, onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
              patchDropdown({ pin: event.currentTarget.value as PinType }),
          }, Object.entries(pinTypes).map(([pin, label]) => h('option', { value: pin, key: pin }, label)))),
          !pins[source]?.length && h('p', { className: 'cfzn-factory-hint', role: 'status' }, pinUnavailable(name)))
          : h('div', { className: 'cfzn-declare-options' },
            labels('选项（英文逗号分隔）', h('input', {
              className: 'cfzn-factory-dialog-input', value: dropdown.labels, onChange: event =>
                patchDropdown(dropdownChoices(event.currentTarget.value, dropdown)),
            })),
            labels('默认选项', h('select', {
              value: dropdown.defaultOption, onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                patchDropdown({ defaultOption: event.currentTarget.value }),
            }, dropdown.options.map(([label, code], index) => h('option', { value: code, key: index }, label))))));
    } else if (draft.type === 'statement') {
      control = h('span', { className: 'cfzn-factory-hint' }, '由连接的语句积木提供');
    } else if (draft.type === 'boolean') {
      control = h('select', { id: controlId, className: 'cfzn-factory-dialog-input', value: String(draft.value),
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => update({ ...draft, value: event.currentTarget.value === 'true' }) },
      h('option', { value: 'false' }, 'false'), h('option', { value: 'true' }, 'true'));
    } else {
      const numeric = draft.type === 'number' || draft.type === 'numberValue';
      control = h('input', { id: controlId, className: 'cfzn-factory-dialog-input', value: String(draft.value), onChange: change,
        maxLength: numeric ? 32 : 512, placeholder: numeric ? '0' : undefined, inputMode: numeric ? 'decimal' : 'text' });
    }
    const displayType = dropdown ? 'dropdown' : draft.type;
    return h('div', { className: 'cfzn-declare-default-row' },
      h('label', { htmlFor: controlId }, name, h('span', null, '（' + typeLabels[displayType] + '）')), control);
  }

  return function FactoryBlockDialog({ block, existing, otherKeys, appearance, Blockly, pins, onClose, onApply }: BlockDialogProps) {
    const host = R.useRef<HTMLDivElement>(null);
    const controller = R.useRef<{ add(type: typeof additions[number]['type'], symbol: string): void; read(): DeclarationPart[] } | null>(null);
    const [key, setKey] = R.useState(block.key);
    const [rows, setRows] = R.useState<ParameterRow[]>([]);
    const [error, setError] = R.useState('');
    const [ready, setReady] = R.useState(false);
    const drafts = R.useRef(new Map<string, ParameterDraft>()).current;

    R.useLayoutEffect(() => {
      const element = host.current;
      if (!element || !Blockly) return;
      let local: ReturnType<typeof createFactoryWorkspace> | undefined;
      let observer: ResizeObserver | undefined;
      let frame = 0;
      let wheel: ((event: WheelEvent) => void) | undefined;
      const dispose = () => {
        if (wheel) element.removeEventListener('wheel', wheel, true);
        cancelAnimationFrame(frame);
        observer?.disconnect();
        controller.current = null;
        local?.dispose();
        drafts.clear();
      };
      try {
        local = createFactoryWorkspace(Blockly, element, {
          toolbox: null, scrollbars: true,
          zoom: { controls: false, wheel: false, startScale: .9, minScale: .12, maxScale: 3, scaleSpeed: 1.05 },
        });
        const { workspace, closeFields } = local;
        const root = workspace.newBlock('procedures_declaration');
        root.setMovable(false);
        root.setDeletable(false);
        root.contextMenu = false;
        root.setPreviousStatement(block.shape === 'command');
        root.setNextStatement(isStatementShape(block.shape));
        if (!isStatementShape(block.shape)) {
          const boolean = block.shape === 'boolean';
          root.setOutputShape(boolean ? Blockly.OUTPUT_SHAPE_HEXAGONAL : Blockly.OUTPUT_SHAPE_ROUND);
          root.setOutput(true, boolean ? 'Boolean' : 'Number');
        }
        root.setInputsInline(true);
        root.setColour(appearance.color, appearance.secondaryColor, appearance.secondaryColor);
        const appendInput = (input: CustomModuleInput) => {
          const id = Blockly.utils.genUid();
          const kind = input.type === 'boolean' ? 'b' : input.type === 'number' || input.type === 'numberValue' ? 'n' : 's';
          const slot = root.appendValueInput(id);
          const editor = root.createArgumentEditor_(kind, input.name);
          slot.connection.connect(editor.outputConnection);
          drafts.set(id, parameterDraft(input, existing && block.inputs.includes(input)));
        };
        const appendLabel = (label: string) => root.addProcedureLabel_(label);
        const inputs = new Map(block.inputs.map(input => [input.name, input]));
        for (const piece of block.message.split(/(\{\{[A-Z][A-Z0-9_]{0,23}\}\})/)) {
          const input = inputs.get(piece.slice(2, -2));
          if (input && piece.startsWith('{{') && piece.endsWith('}}')) appendInput(input);
          else if (piece) appendLabel(piece);
        }
        if (!root.inputList.length) appendLabel(Blockly.Msg.PROCEDURE_DEFAULT_NAME || '积木名称');
        root.initSvg();
        root.render();

        const appended = new Set<string>();
        const read = () => declarationParts(Blockly, root, drafts, appended);
        const syncRows = () => setRows(read().flatMap(part => 'parameter' in part ? [part.parameter] : []));
        const center = () => {
          Blockly.svgResize(workspace);
          workspace.resizeContents();
          workspace.zoomToFit();
          if (workspace.scale > .9) workspace.setScale(.9);
          workspace.centerOnBlock(root.id);
        };
        const fit = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            if (element.clientWidth && !Blockly.WidgetDiv.isVisible()) center();
          });
        };
        root.removeFieldCallback = (field: any) => {
          if (root.inputList.length <= 1) return;
          const input = root.inputList.find((item: any) => item.fieldRow.includes(field) ||
            item.connection?.targetBlock()?.getField('TEXT') === field);
          if (!input) return;
          closeFields();
          Blockly.Events.disable();
          try {
            input.connection?.targetBlock()?.dispose(false, false);
            root.removeInput(input.name);
            drafts.delete(input.name);
            appended.delete(input.name);
          } finally { Blockly.Events.enable(); }
          syncRows();
          fit();
        };
        controller.current = {
          read: () => { closeFields(); return read(); },
          add(type, symbol) {
            closeFields();
            if (type === 'label') appendLabel('label text');
            else {
              const names = new Set(read().flatMap(part => 'parameter' in part ? [part.parameter.name] : []));
              if (names.size >= 10) return;
              let name = symbol, suffix = 2;
              while (names.has(name)) name = symbol + suffix++;
              appendInput({ name, type });
            }
            appended.add(root.inputList.at(-1).name);
            root.initSvg();
            root.render();
            syncRows();
            cancelAnimationFrame(frame);
            center();
            root.focusLastEditor_();
          },
        };
        workspace.addChangeListener((event: any) => {
          if (event.type === Blockly.Events.CHANGE && event.element === 'field') syncRows();
        });
        wheel = event => {
          event.preventDefault();
          event.stopPropagation();
          const metrics = workspace.getMetrics();
          workspace.zoom(metrics.viewWidth / 2, metrics.viewHeight / 2, -event.deltaY / 50);
        };
        element.addEventListener('wheel', wheel, { passive: false, capture: true });
        observer = new ResizeObserver(fit);
        observer.observe(element);
        syncRows();
        setReady(true);
        fit();
      } catch (failure) {
        dispose();
        setError(failure instanceof Error ? failure.message : String(failure));
        return;
      }
      return dispose;
    }, [Blockly]);

    const apply = () => {
      if (!controller.current) return;
      try {
        const parts = controller.current.read();
        const inputs = parts.flatMap(part => 'parameter' in part ? [applyParameter(part.parameter)] : []);
        // Preserve existing spacing and literal text. New adjacent fragments need one separator.
        let message = '';
        for (const part of parts) {
          const text = 'label' in part ? part.label : '{{' + part.parameter.name + '}}';
          if (part.newPart && message && text && !/\s$/.test(message) && !/^\s/.test(text)) message += ' ';
          message += text;
        }
        if (otherKeys.includes(key)) throw new Error('同一个模块内的积木 ID 必须唯一。');
        const next = validateCustomModuleBlock({ ...block, key, inputs, message, code: isStatementShape(block.shape) ? '' : '0' });
        const names = new Map(parts.flatMap(part => 'parameter' in part && part.parameter.draft.originalName
          ? [[part.parameter.draft.originalName, part.parameter.name] as const] : []));
        const code = block.code.replace(/\{\{([A-Z][A-Z0-9_]{0,23})\}\}/g, (match, name) =>
          names.has(name) ? '{{' + names.get(name) + '}}' : match);
        onApply({ ...next, code });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    };
    return h(Dialog, { title: 'Modify Block', id: 'cfzn-factory-modify-block', onClose,
      actions: [
        button('Cancel', onClose, { key: 'cancel' }),
        button('OK', apply, { className: 'cfzn-factory-dialog-button cfzn-factory-dialog-primary', key: 'ok', disabled: !ready }),
      ] },
    h('div', { className: 'cfzn-declare-workspace', ref: host, 'aria-label': '积木声明工作区' }),
    h('div', { className: 'cfzn-declare-toolbar cfzn-declare-insert', role: 'group', 'aria-label': '添加积木片段' },
      additions.map(({ type, title, symbol }) => button(title, () => controller.current?.add(type, symbol), {
        key: type, disabled: !ready || type !== 'label' && rows.length >= 10,
      }))),
    h('details', { className: 'cfzn-declare-defaults', open: true },
      h('summary', null, '参数默认值'),
      h('div', { className: 'cfzn-declare-default-body' },
        h('p', { className: 'cfzn-factory-hint' }, '设置积木拖出时的参数默认值。'),
        rows.length ? rows.map(row => h(Defaults, { key: row.id, row, pins, update: draft => {
          drafts.set(row.id, draft);
          setRows(current => current.map(item => item.id === row.id ? { ...item, draft } : item));
        } })) : h('p', { className: 'cfzn-factory-hint' }, '暂无参数'))),
    h('div', { className: 'cfzn-declare-block-id' },
      h('p', { className: 'cfzn-factory-hint' }, '* 积木参数名字需要唯一'),
      h('label', null, 'Block ID', h('input', { className: 'cfzn-factory-dialog-input', value: key, spellCheck: false,
        maxLength: 32, onChange: event => setKey(event.currentTarget.value),
      }))),
    error && h('p', { className: 'cfzn-factory-inline-error', role: 'alert' }, error));
  };
}
