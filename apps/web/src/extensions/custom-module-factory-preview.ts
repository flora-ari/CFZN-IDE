import type * as React from 'react';
import { normalizeDeviceId } from './catalog';
import { deviceDescriptions } from './device-registration';
import {
  customArgumentDefault, customBlockJson, customPinMenus, customToolboxBlock, fillCustomTemplate,
  isStatementShape, pinMenu, pinUnavailable, validateCustomModuleBlock,
  type CustomModuleAppearance, type CustomModuleBlock, type CustomModuleDefinition,
} from './custom-module-definition';
import { makeFactoryDialog } from './factory-dialog';
import { createFactoryWorkspace, factoryBlocklyMedia } from './factory-workspace';

export type FactoryReact = Pick<typeof React, 'createElement' | 'useState' | 'useEffect' | 'useLayoutEffect' | 'useRef' | 'useMemo'>;
type Options = [string, string][];
type BoardDescriptions = Awaited<ReturnType<typeof deviceDescriptions>>;
export type PinOptions = Record<string, Options>;

let boardDescriptions: Promise<BoardDescriptions> | undefined;
const loadDescriptions = () => boardDescriptions ??= deviceDescriptions().catch(error => {
  boardDescriptions = undefined;
  throw error;
});

function pinOptionsFor(descriptions: BoardDescriptions | null, board: string | undefined): PinOptions {
  const pin = board ? descriptions?.[board]?.find(category => category.id === 'pin') : undefined;
  return Object.fromEntries(Object.values(customPinMenus).map(opcode => {
    const block = pin?.blocks?.find((item: any) => 'arduino_pin_' + item.opcode === opcode);
    const menu = pin?.menus?.[block?.arguments?.PIN?.menu];
    const items = Array.isArray(menu) ? menu : menu?.items;
    const options = (items ?? []).map((item: any): [string, string] => typeof item === 'object'
      ? [String(item.text), String(item.value)] : [String(item), String(item)]);
    return [opcode, options];
  }));
}

export function validateFactoryBlock(block: CustomModuleBlock) {
  return validateCustomModuleBlock(block);
}

const previewOpcode = 'cfzn_custom_factory_preview';
const svgNamespace = 'http://www.w3.org/2000/svg';
let previewSequence = 0;

function scopeSvgIds(svg: SVGSVGElement) {
  const prefix = 'cfzn-preview-' + ++previewSequence + '-';
  const ids = new Map<string, string>();
  for (const node of svg.querySelectorAll('[id]')) {
    ids.set(node.id, prefix + node.id);
    node.id = prefix + node.id;
  }
  for (const node of svg.querySelectorAll('*')) {
    for (const attr of node.attributes) {
      if (attr.localName === 'href' && attr.value.startsWith('#')) {
        const id = ids.get(attr.value.slice(1));
        if (id) attr.value = '#' + id;
      } else if (attr.value.includes('url(#')) {
        attr.value = attr.value.replace(/url\(#([^)]+)\)/g, (reference, id) => ids.has(id) ? 'url(#' + ids.get(id) + ')' : reference);
      }
    }
  }
}

export function renderFactoryBlock(
  host: HTMLElement, Blockly: any, block: CustomModuleBlock, pinOptions: PinOptions, appearance?: CustomModuleAppearance,
) {
  const document = host.ownerDocument;
  const scratch = document.createElement('div');
  scratch.className = 'cfzn-factory-preview-measurement';
  host.replaceChildren(scratch);
  const main = Blockly.mainWorkspace;
  const oldDefinition = Blockly.Blocks[previewOpcode];
  const cacheReferences = Blockly.Field.cacheReference_;
  let workspace: any;
  Blockly.Events.disable();
  try {
    const previewBlock = validateFactoryBlock({ ...block, code: isStatementShape(block.shape) ? '' : '0' });
    const json = customBlockJson(previewBlock, previewOpcode, { Device: {
      getPinOptions: (opcode: string) => pinOptions[opcode],
    } }, appearance);
    Blockly.Blocks[previewOpcode] = { init(this: any) { this.jsonInit(json); } };
    workspace = Blockly.inject(scratch, { readOnly: true, sounds: false, scrollbars: false, media: factoryBlocklyMedia });
    Blockly.mainWorkspace = main;
    const xml = document.implementation.createDocument(null, 'xml');
    const preview = Blockly.Xml.domToBlock(customToolboxBlock(xml, previewBlock, previewOpcode), workspace);
    preview.render(false);
    const root = preview.getSvgRoot() as SVGGElement;
    const bounds = root.getBBox();
    const svg = document.createElementNS(svgNamespace, 'svg');
    svg.setAttribute('class', 'blocklySvg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', String(Math.ceil(bounds.width + 32)));
    svg.setAttribute('height', String(Math.ceil(bounds.height + 32)));
    svg.setAttribute('viewBox', [bounds.x - 16, bounds.y - 16, bounds.width + 32, bounds.height + 32].join(' '));
    const defs = workspace.getParentSvg().querySelector('defs');
    if (defs) svg.append(defs.cloneNode(true));
    svg.append(root.cloneNode(true));
    scopeSvgIds(svg);
    host.append(svg);
  } finally {
    try {
      workspace?.dispose();
    } finally {
      scratch.remove();
      Blockly.mainWorkspace = main;
      if (oldDefinition) Blockly.Blocks[previewOpcode] = oldDefinition;
      else delete Blockly.Blocks[previewOpcode];
      // The pinned inject() starts a field measurement cache without closing it.
      while (Blockly.Field.cacheReference_ > cacheReferences) Blockly.Field.stopCache();
      Blockly.Events.enable();
    }
  }
}

export function previewCode(definition: CustomModuleDefinition, block: CustomModuleBlock, pins: PinOptions) {
  const inputs = new Map(block.inputs.map(input => [input.name, input]));
  const missingPins = new Set<string>();
  const fragment = fillCustomTemplate(block.code, name => {
    const input = inputs.get(name);
    if (!input) return '{{' + name + '}}';
    const menu = pinMenu(input.type);
    if (menu) {
      const value = pins[menu]?.[0]?.[1];
      if (value !== undefined) return value;
      missingPins.add(name);
      return '';
    }
    return customArgumentDefault(input);
  });
  if (missingPins.size) return [...missingPins].map(name => '// ' + pinUnavailable(name)).join('\n');
  const indent = (code: string) => code ? '  ' + code.trimEnd().replaceAll('\n', '\n  ') + '\n' : '';
  const declarations = definition.definitions ? definition.definitions.trimEnd() + '\n\n' : '';
  const sample = isStatementShape(block.shape) || !fragment.trim() ? fragment : '(void)(' + fragment.trim() + ');';
  const setup = indent(definition.setup) + (block.shape === 'hat' ? indent(sample) : '');
  const loop = block.shape === 'hat' ? '' : indent(sample);
  return declarations + 'void setup() {\n' + setup + '}\n\nvoid loop() {\n' + loop + '}';
}

export function useFactoryPreviewPins(R: FactoryReact, definition: CustomModuleDefinition, currentDevice: string | null) {
  const [descriptionError, setDescriptionError] = R.useState(false);
  const [descriptions, setDescriptions] = R.useState<BoardDescriptions | null>(null);
  const [chosenBoard, setChosenBoard] = R.useState('');
  const currentBoard = normalizeDeviceId(currentDevice ?? '');
  const boards = definition.supportDevice;
  const board = boards.includes(chosenBoard) ? chosenBoard : boards.includes(currentBoard) ? currentBoard : boards[0];
  const hasPins = definition.blocks.some(block => block.inputs.some(input => pinMenu(input.type)));
  const shouldLoad = !!board;
  R.useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    setDescriptionError(false);
    void loadDescriptions().then(value => {
      if (active) setDescriptions(value);
    }).catch(() => {
      if (active) setDescriptionError(true);
    });
    return () => { active = false; };
  }, [shouldLoad]);
  const pins = R.useMemo(() => pinOptionsFor(descriptions, board), [descriptions, board]);
  return { pins, board, setChosenBoard, hasPins, descriptionError };
}

let workspaceSequence = 0;

export function makeFactoryWorkspacePreview(R: FactoryReact) {
  const h = R.createElement;
  const Dialog = makeFactoryDialog(R);
  return function FactoryWorkspacePreview({ Blockly, definition, appearance, pins, onClose }: {
    Blockly: any; definition: CustomModuleDefinition; appearance: CustomModuleAppearance; pins: PinOptions; onClose(): void;
  }) {
    const host = R.useRef<HTMLDivElement>(null);
    const [error, setError] = R.useState('');
    R.useLayoutEffect(() => {
      const element = host.current;
      if (!element || !Blockly) return;
      const prefix = previewOpcode + '_' + ++workspaceSequence + '_';
      const temporary: string[] = [];
      let local: ReturnType<typeof createFactoryWorkspace> | undefined;
      let observer: ResizeObserver | undefined;
      const dispose = () => {
        observer?.disconnect();
        try { local?.dispose(); }
        finally { temporary.forEach(opcode => delete Blockly.Blocks[opcode]); }
      };
      try {
        const xml = element.ownerDocument.implementation.createDocument(null, 'xml');
        const category = xml.createElement('category');
        category.setAttribute('id', prefix);
        category.setAttribute('name', definition.name || '自定义积木');
        category.setAttribute('colour', appearance.color);
        category.setAttribute('secondaryColour', appearance.secondaryColor);
        for (const block of definition.blocks) {
          const spec = validateFactoryBlock({ ...block, code: isStatementShape(block.shape) ? '' : '0' });
          const opcode = prefix + spec.key;
          const json = customBlockJson(spec, opcode, { Device: { getPinOptions: (menu: string) => pins[menu] } }, appearance);
          Blockly.Blocks[opcode] = { init(this: any) { this.jsonInit(json); } };
          temporary.push(opcode);
          category.appendChild(customToolboxBlock(xml, spec, opcode));
        }
        xml.documentElement.appendChild(category);
        local = createFactoryWorkspace(Blockly, element, {
          toolbox: xml.documentElement, scrollbars: true, trashcan: true, zoom: { startScale: .75 },
        });
        const { workspace } = local;
        workspace.getFlyout().setRecyclingEnabled(false);
        const resize = () => Blockly.svgResize(workspace);
        observer = new ResizeObserver(resize);
        observer.observe(element);
        resize();
      } catch (failure) {
        dispose();
        setError(failure instanceof Error ? failure.message : String(failure));
        return;
      }
      return dispose;
    }, [Blockly, definition, appearance, pins]);
    const missingPins = definition.blocks.some(block => block.inputs.some(input => {
      const menu = pinMenu(input.type);
      return menu && !pins[menu]?.length;
    }));
    return h(Dialog, { title: '生成预览', id: 'cfzn-factory-workspace-preview', size: 'code', onClose,
      actions: h('button', { type: 'button', className: 'cfzn-factory-dialog-button', onClick: onClose }, '关闭') },
    missingPins && h('p', { className: 'cfzn-factory-hint', role: 'status' }, '预览缺少可用引脚，请选择或检查主控。'),
    h('div', { className: 'cfzn-factory-playground', ref: host, 'aria-label': 'Blockly 预览工作区' }),
    error && h('p', { className: 'cfzn-factory-inline-error', role: 'alert' }, error));
  };
}

const noPins: PinOptions = {};

export function makeFactoryPreview(R: FactoryReact) {
  const h = R.createElement;
  return function FactoryPreview({ appearance, block, Blockly, pins }: {
    appearance?: CustomModuleAppearance;
    block: CustomModuleBlock;
    Blockly: any;
    pins: PinOptions;
  }) {
    const host = R.useRef<HTMLDivElement>(null);
    const [error, setError] = R.useState('');
    const pinOptions = block.inputs.some(input => pinMenu(input.type)) ? pins : noPins;
    const { key, message, shape, inputs } = block;
    R.useLayoutEffect(() => {
      const element = host.current;
      if (!element || !Blockly) return;
      try {
        renderFactoryBlock(element, Blockly, { key, message, shape, inputs, code: '' }, pinOptions, appearance);
        setError('');
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
      return () => { element.replaceChildren(); };
    }, [Blockly, key, message, shape, inputs, pinOptions, appearance]);
    return h('div', { className: 'cfzn-factory-preview' },
      h('div', { className: 'cfzn-factory-preview-block', ref: host, 'data-cfzn-custom-block-preview': '',
        role: Blockly && !error ? 'img' : undefined, 'aria-label': '积木预览 ' + (key || '未命名积木') }),
      !Blockly ? h('p', { className: 'cfzn-factory-hint', role: 'status' }, '正在等待积木工作区…')
        : error && h('p', { className: 'cfzn-factory-inline-error' }, error));
  };
}
