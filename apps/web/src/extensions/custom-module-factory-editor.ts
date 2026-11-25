import type * as React from 'react';
import { typeNames, type ControllerOption } from './catalog';
import {
  defaultCustomAppearance, pinMenu, type CustomModuleBlock, type CustomModuleDefinition,
} from './custom-module-definition';
import {
  makeFactoryPreview, makeFactoryWorkspacePreview, useFactoryPreviewPins, type FactoryReact,
} from './custom-module-factory-preview';
import { makeFactoryBlockDialog } from './factory-block-dialog';
import { makeFactoryCodeDialogs } from './factory-code-dialogs';
import { makeOfficialLibraryPicker } from './factory-official-libraries';

const shapes = {
  command: { label: 'Function', description: '指令', message: '执行操作', code: '' },
  reporter: { label: 'Output', description: '返回值', message: '读取数值', code: '0' },
  boolean: { label: 'Boolean', description: '布尔值', message: '条件成立？', code: 'false' },
  hat: { label: 'Hat', description: '帽子', message: '当 Arduino 启动时', code: '' },
} satisfies Record<CustomModuleBlock['shape'], { label: string; description: string; message: string; code: string }>;
const shapeIds = Object.keys(shapes) as CustomModuleBlock['shape'][];
const labelClassName = 'cfzn-factory-field';

function firstFreeId(prefix: string, ids: string[]) {
  let suffix = 1;
  while (ids.includes(prefix + suffix)) suffix++;
  return prefix + suffix;
}

function newBlock(blocks: CustomModuleBlock[], shape: CustomModuleBlock['shape'], Blockly: any): CustomModuleBlock {
  return {
    key: firstFreeId('newblock_', blocks.map(block => block.key)),
    message: Blockly?.Msg.PROCEDURE_DEFAULT_NAME || shapes[shape].message, shape, inputs: [], code: shapes[shape].code,
  };
}

export type FactoryPanel =
  | { kind: 'definitions' | 'preview' }
  | { kind: 'new'; shape: CustomModuleBlock['shape'] }
  | { kind: 'edit' | 'logic'; index: number };

interface EditorProps {
  definition: CustomModuleDefinition;
  moduleId?: string;
  readOnly: boolean;
  pending: boolean;
  currentDevice: string | null;
  deviceName(id: string): string;
  controllerOptions: ControllerOption[];
  Blockly: any;
  panel: FactoryPanel | null;
  setPanel(panel: FactoryPanel | null): void;
  confirmRemoveBlock(block: CustomModuleBlock, remove: () => void): void;
  onChange(definition: CustomModuleDefinition): void;
  submit?(event: React.FormEvent<HTMLFormElement>): void;
}

export function makeFactoryEditor(R: FactoryReact, NativeEditor: any) {
  const h = R.createElement;
  const Preview = makeFactoryPreview(R);
  const ModifyBlock = makeFactoryBlockDialog(R);
  const PreviewWorkspace = makeFactoryWorkspacePreview(R);
  const { BlockCodeDialog, HeaderCodeDialog } = makeFactoryCodeDialogs(R, NativeEditor);
  const LibraryPicker = makeOfficialLibraryPicker(R);
  const textField = (label: string, value: string, onChange: (value: string) => void, maxLength: number, options: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    h('label', { className: labelClassName }, label,
      h('input', { type: 'text', value, maxLength, ...options, onChange: event => onChange(event.currentTarget.value) }));
  const multiline = (label: string, value: string, onChange: (value: string) => void, options: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
    h('label', { className: labelClassName }, label,
      h('textarea', { value, ...options, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.currentTarget.value) }));
  const button = (label: string, onClick: () => void,
    options: React.ButtonHTMLAttributes<HTMLButtonElement> & React.Attributes & { 'data-factory-add-shape'?: string } = {}) =>
    h('button', { type: 'button', className: 'cfzn-factory-button', ...options, onClick }, label);
  const setAt = <T,>(items: readonly T[], index: number, item: T) => items.map((previous, position) => position === index ? item : previous);

  return function FactoryEditor({ definition, moduleId, readOnly, pending, deviceName, controllerOptions, currentDevice, Blockly, panel,
    setPanel, confirmRemoveBlock, onChange, submit }: EditorProps) {
    const appearance = definition.appearance ?? defaultCustomAppearance;
    const { pins, board, setChosenBoard, hasPins, descriptionError } = useFactoryPreviewPins(R, definition, currentDevice);
    const [rowIds, setRowIds] = R.useState(() => definition.blocks.map((_, index) => index));
    const nextRowId = R.useRef(rowIds.length);
    const panelIndex = panel && 'index' in panel ? panel.index : null;
    const headerOpen = panel?.kind === 'definitions';
    const locked = pending || readOnly;
    const closePanel = () => setPanel(null);
    const updateBlock = (index: number, updates: Partial<CustomModuleBlock>) => onChange({
      ...definition, blocks: setAt(definition.blocks, index, { ...definition.blocks[index], ...updates }),
    });
    const removeBlock = (index: number) => {
      confirmRemoveBlock(definition.blocks[index], () => {
        setRowIds(rowIds.filter((_, position) => position !== index));
        onChange({ ...definition, blocks: definition.blocks.filter((_, position) => position !== index) });
        if (panel && 'index' in panel) {
          if (panel.index === index) setPanel(null);
          if (panel.index > index) setPanel({ ...panel, index: panel.index - 1 });
        }
      });
    };
    const newShape = panel?.kind === 'new' ? panel.shape : null;
    const editingBlock = newShape ? newBlock(definition.blocks, newShape, Blockly)
      : panelIndex === null ? undefined : definition.blocks[panelIndex];
    const applyBlock = (block: CustomModuleBlock) => {
      if (newShape) {
        setRowIds([...rowIds, nextRowId.current++]);
        onChange({ ...definition, blocks: [...definition.blocks, block] });
      } else if (panelIndex !== null) updateBlock(panelIndex, block);
      closePanel();
    };
    const colorField = (label: string, name: keyof typeof appearance) =>
      h('label', { className: 'cfzn-factory-color' }, label,
        h('span', null,
          h('input', { type: 'color', value: appearance[name], disabled: locked,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange({
              ...definition, appearance: { ...appearance, [name]: event.currentTarget.value },
            }) }),
          h('code', null, appearance[name])));
    const missingPins = hasPins && definition.blocks.some(block => block.inputs.some(input => {
      const menu = pinMenu(input.type);
      return menu && !pins[menu]?.length;
    }));

    const submitWorkbench = (event: React.FormEvent<HTMLFormElement>) => {
      if (event.currentTarget.querySelector('.cfzn-factory-dialog-mask')) event.preventDefault();
      else submit?.(event);
    };
    return h('form', { id: 'cfzn-factory-editor', className: 'cfzn-factory-editor', onSubmit: submitWorkbench },
      h('aside', { className: 'cfzn-factory-settings', 'aria-label': '模块设置' },
        h('section', { className: 'cfzn-factory-panel', 'aria-labelledby': 'cfzn-factory-module-heading' },
          h('h3', { id: 'cfzn-factory-module-heading' }, '模块信息'),
          moduleId && h('div', { className: 'cfzn-factory-field cfzn-factory-module-id' }, '模块 ID', h('code', null, moduleId)),
          h('fieldset', { className: 'cfzn-factory-fields', disabled: locked },
            textField('模块名称', definition.name, name => onChange({ ...definition, name }), 80, { required: true, placeholder: '例如 温湿度传感器' }),
            multiline('模块说明', definition.description, description => onChange({ ...definition, description }), { rows: 2, maxLength: 500 }),
            textField('署名', definition.author, author => onChange({ ...definition, author }), 80),
            h('div', { className: 'cfzn-factory-field-row' },
              textField('版本', definition.version, version => onChange({ ...definition, version }), 32, { required: true }),
              h('label', { className: labelClassName }, '模块类型',
                h('select', { value: definition.type, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange({
                  ...definition, type: event.currentTarget.value as CustomModuleDefinition['type'],
                }) }, (['sensor', 'actuator', 'function'] as const).map(id => h('option', { key: id, value: id }, typeNames[id]))))),
            h('fieldset', { className: 'cfzn-factory-board-picker' },
              h('legend', null, '支持主控'),
              h('div', null, controllerOptions.map(({ deviceId: id, name }) => h('label', { key: id }, h('input', {
                type: 'checkbox', checked: definition.supportDevice.includes(id), onChange: event => {
                  const supportDevice = event.currentTarget.checked ? [...definition.supportDevice, id] : definition.supportDevice.filter(device => device !== id);
                  onChange({ ...definition, supportDevice });
                },
              }), name)))))),
        h('section', { className: 'cfzn-factory-panel', 'aria-labelledby': 'cfzn-factory-appearance-heading' },
          h('h3', { id: 'cfzn-factory-appearance-heading' }, '外观'),
          colorField('积木主色', 'color'), colorField('积木辅色', 'secondaryColor')),
        h('section', { className: 'cfzn-factory-panel', 'aria-labelledby': 'cfzn-factory-common-heading' },
          h('h3', { id: 'cfzn-factory-common-heading' }, 'Arduino 公共代码'),
          button(readOnly ? '查看头文件' : '编辑头文件', () => setPanel({ kind: 'definitions' }),
            { disabled: pending, 'aria-haspopup': 'dialog' })),
        h(LibraryPicker, { libraries: definition.libraries ?? [], readOnly, pending,
          onChange: libraries => onChange({ ...definition, libraries }) })),
      h('section', { className: 'cfzn-factory-panel cfzn-factory-blocks', 'aria-labelledby': 'cfzn-factory-block-heading' },
        h('div', { className: 'cfzn-factory-rail cfzn-factory-block-heading' },
          h('h3', { id: 'cfzn-factory-block-heading', tabIndex: -1 }, 'Block Definitions'),
          !readOnly && h('div', { className: 'cfzn-factory-actions', role: 'group', 'aria-label': '添加积木' },
            shapeIds.map(shape => button('+ ' + shapes[shape].label, () => setPanel({ kind: 'new', shape }), {
              key: shape, title: '添加' + shapes[shape].description + '积木', disabled: pending || !Blockly || definition.blocks.length >= 24, 'aria-haspopup': 'dialog',
              className: 'cfzn-factory-button cfzn-factory-add-shape', 'data-factory-add-shape': shape,
            })))),
        hasPins && h('div', { className: 'cfzn-factory-preview-controls' },
          board && h('label', { className: labelClassName }, '预览主控',
            h('select', { value: board, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setChosenBoard(event.currentTarget.value) },
              definition.supportDevice.map(id => h('option', { key: id, value: id }, deviceName(id))))),
          (!board || descriptionError || missingPins) && h('p', { className: 'cfzn-factory-hint', role: 'status' },
            board ? '预览缺少可用引脚，请选择或检查主控。' : '选择支持的主控后可预览引脚。')),
        h('div', { className: 'cfzn-factory-table-scroll' },
          h('table', { className: 'cfzn-factory-table', 'aria-labelledby': 'cfzn-factory-block-heading' },
            h('thead', null, h('tr', null, ['Op Code', 'Preview', 'Block Logic', 'Action'].map(title => h('th', { key: title, scope: 'col' }, title)))),
            definition.blocks.length === 0 && h('tbody', null,
              h('tr', null, h('td', { colSpan: 4, className: 'cfzn-factory-empty-row' }, '还没有积木。请选择一种积木形状添加。'))),
            definition.blocks.map((block, index) => {
              const name = block.key || '未命名积木';
              return h('tbody', { key: rowIds[index] },
                h('tr', { 'data-cfzn-factory-block': block.key, 'data-shape': block.shape },
                  h('th', { scope: 'row' }, h('code', null, name), h('span', { className: 'cfzn-factory-shape-name' }, shapes[block.shape].label)),
                  h('td', null, h(Preview, { appearance, block, Blockly, pins })),
                  h('td', null, button('代码', () => setPanel({ kind: 'logic', index }), {
                    'aria-label': '积木逻辑 ' + name, 'aria-haspopup': 'dialog', disabled: pending,
                  })),
                  h('td', null, !readOnly && h('div', { className: 'cfzn-factory-actions' },
                    button('Edit', () => setPanel({ kind: 'edit', index }),
                      { 'aria-label': 'Edit ' + name, disabled: pending || !Blockly, 'aria-haspopup': 'dialog' }),
                    button('Delete', () => removeBlock(index),
                      { 'aria-label': 'Delete ' + name, disabled: pending, className: 'cfzn-factory-button cfzn-factory-danger' })))));
            })))),
      headerOpen && h(HeaderCodeDialog, {
        definitions: definition.definitions, setup: definition.setup, readOnly: locked, onClose: closePanel,
        onApply: values => { onChange({ ...definition, ...values }); closePanel(); },
      }),
      panel?.kind === 'logic' && editingBlock && h(BlockCodeDialog, {
        block: editingBlock, definition, pins, readOnly: locked, onClose: closePanel,
        onApply: code => { updateBlock(panel.index, { code }); closePanel(); },
      }),
      (panel?.kind === 'new' || panel?.kind === 'edit') && editingBlock && h(ModifyBlock, {
        block: editingBlock, existing: panel.kind === 'edit', appearance, Blockly, pins, onClose: closePanel,
        onApply: applyBlock, otherKeys: definition.blocks.filter((_, index) => index !== panelIndex).map(block => block.key),
      }),
      panel?.kind === 'preview' && h(PreviewWorkspace, { Blockly, definition, appearance, pins, onClose: closePanel }));
  };
}
