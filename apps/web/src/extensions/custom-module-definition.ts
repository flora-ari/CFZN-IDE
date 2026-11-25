import { selectableControllerIds } from './catalog.ts';

export const CUSTOM_MODULE_ID = /^custom[0-9a-f]{32}$/;
export const customPinMenus = {
  digitalOutputPin: 'arduino_pin_setDigitalOutput',
  digitalInputPin: 'arduino_pin_readDigitalPin',
  analogInputPin: 'arduino_pin_readAnalogPin',
} as const;

export type CustomModuleInputType = 'number' | 'text' | 'dropdown' | 'value' | 'statement'
  | 'textValue' | 'numberValue' | 'boolean' | keyof typeof customPinMenus;
export interface CustomModuleInput {
  name: string;
  type: CustomModuleInputType;
  defaultValue?: string | number | boolean;
  options?: [string, string][];
}
export interface CustomModuleBlock {
  key: string;
  message: string;
  shape: 'command' | 'reporter' | 'boolean' | 'hat';
  inputs: CustomModuleInput[];
  code: string;
}
export interface ArduinoLibraryReference { name: string; version: string }
export interface CustomModuleAppearance { color: string; secondaryColor: string }
export interface CustomModuleDefinition {
  schemaVersion: 1;
  name: string;
  description: string;
  version: string;
  author: string;
  type: 'sensor' | 'actuator' | 'function';
  supportDevice: string[];
  blocks: CustomModuleBlock[];
  definitions: string;
  setup: string;
  appearance?: CustomModuleAppearance;
  libraries?: ArduinoLibraryReference[];
}
export interface CustomModuleRecord { id: string; definition: CustomModuleDefinition; createdAt: string }

const placeholder = /\{\{([A-Z][A-Z0-9_]{0,23})\}\}/g;
const inputTypes: readonly string[] = ['number', 'text', 'dropdown', 'value', 'statement', 'textValue',
  'numberValue', 'boolean', ...Object.keys(customPinMenus)];

function object(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + '的格式无效。');
  return value as Record<string, unknown>;
}

function field(value: unknown, label: string, limit: number, required = false) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value) || (required && !value.trim())) {
    throw new Error(label + '无效，长度上限为 ' + limit + ' 个字符。');
  }
  return value;
}

const namesIn = (text: string) => Array.from(text.matchAll(placeholder), match => match[1]);
export const isStatementShape = (shape: CustomModuleBlock['shape']) => shape === 'command' || shape === 'hat';
export const defaultCustomAppearance: CustomModuleAppearance = { color: '#7152c4', secondaryColor: '#6042ad' };

function validateAppearance(value: unknown): CustomModuleAppearance {
  const appearance = object(value, '积木颜色');
  const color = field(appearance.color, '积木颜色', 7, true);
  const secondaryColor = field(appearance.secondaryColor, '积木描边', 7, true);
  if (![color, secondaryColor].every(hex => /^#[0-9a-f]{6}$/i.test(hex))) throw new Error('颜色须为六位十六进制值。');
  return { color, secondaryColor };
}

function validateLibraries(value: unknown): ArduinoLibraryReference[] {
  if (!Array.isArray(value) || value.length > 24) throw new Error('模块最多选择 24 个 Arduino 库。');
  const libraries = value.map(item => {
    const library = object(item, 'Arduino 库');
    const name = field(library.name, '库名称', 120, true);
    const version = field(library.version, '库版本', 64, true);
    if (name !== name.trim() || !/^[a-z0-9][a-z0-9_.+ -]*$/i.test(name) || !/^\d[0-9a-z.+_-]*$/i.test(version)) {
      throw new Error('请选择 Arduino 库及其精确版本。');
    }
    return { name, version };
  });
  if (new Set(libraries.map(library => library.name.toLowerCase())).size !== libraries.length) throw new Error('同名 Arduino 库只能选一个版本。');
  return libraries;
}

function validateInput(value: unknown): CustomModuleInput {
  const input = object(value, '积木参数');
  const name = field(input.name, '参数 ID', 24, true);
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('参数 ID 必须以大写字母开头，只能包含大写字母、数字和下划线。');
  if (typeof input.type !== 'string' || !inputTypes.includes(input.type)) throw new Error('参数类型无效。');
  const type = input.type as CustomModuleInputType;
  if (type === 'dropdown') {
    if (Object.hasOwn(input, 'defaultValue')) throw new Error('下拉参数的默认值由选项顺序决定。');
    if (!Array.isArray(input.options) || !input.options.length || input.options.length > 30) throw new Error('下拉参数需要 1 至 30 个选项。');
    const options = input.options.map((option): [string, string] => {
      if (!Array.isArray(option) || option.length !== 2) throw new Error('下拉选项格式无效。');
      return [field(option[0], '选项名称', 80, true), field(option[1], '选项值', 160, true)];
    });
    if (new Set(options.map(([, option]) => option)).size !== options.length) throw new Error('同一下拉框的选项值必须唯一。');
    return { name, type, options };
  }
  if (Object.hasOwn(input, 'options')) throw new Error('只有下拉参数可以设置选项。');
  const defaultValue = (fallback: string | number | boolean) => Object.hasOwn(input, 'defaultValue') ? input.defaultValue : fallback;
  if (type === 'number' || type === 'numberValue') {
    const value = defaultValue(0);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('数字默认值必须是有限数。');
    return { name, type, defaultValue: value };
  }
  if (type === 'text' || type === 'value' || type === 'textValue') {
    return { name, type, defaultValue: field(defaultValue(type === 'value' ? '0' : ''), '参数默认值', 512) };
  }
  if (type === 'boolean') {
    const value = defaultValue(false);
    if (typeof value !== 'boolean') throw new Error('布尔默认值必须是 true 或 false。');
    return { name, type, defaultValue: value };
  }
  if (Object.hasOwn(input, 'defaultValue')) throw new Error('此参数类型无法设置默认值。');
  return { name, type };
}

export function validateCustomModuleBlock(value: unknown): CustomModuleBlock {
  const block = object(value, '积木');
  const key = field(block.key, '积木 ID', 32, true);
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) throw new Error('积木 ID 必须以小写字母开头，只能包含小写字母、数字和下划线。');
  const shape = block.shape;
  if (shape !== 'command' && shape !== 'reporter' && shape !== 'boolean' && shape !== 'hat') throw new Error('积木形状无效。');
  if (!Array.isArray(block.inputs) || block.inputs.length > 10) throw new Error('每块积木最多支持 10 个参数。');
  const inputs = block.inputs.map(validateInput);
  const names = new Set(inputs.map(input => input.name));
  if (names.size !== inputs.length) throw new Error('同一积木的参数 ID 必须唯一。');
  if (!isStatementShape(shape) && inputs.some(input => input.type === 'statement')) throw new Error('语句参数需要指令或帽子积木。');
  const message = field(block.message, '积木文字', 300, true);
  const messageNames = namesIn(message);
  if (messageNames.length !== inputs.length || new Set(messageNames).size !== names.size || messageNames.some(name => !names.has(name))) {
    throw new Error('积木文字中每个参数须使用一次 {{参数ID}}。');
  }
  const code = field(block.code, '积木代码', 8192, !isStatementShape(shape));
  if (namesIn(code).some(name => !names.has(name))) throw new Error('代码占位符引用了未定义的参数。');
  return { key, message, shape, inputs, code };
}

export function validateCustomModuleDefinition(value: unknown): CustomModuleDefinition {
  const v = object(value, '模块定义');
  if (v.schemaVersion !== 1) throw new Error('自定义模块定义版本不受支持。');
  if (v.type !== 'sensor' && v.type !== 'actuator' && v.type !== 'function') throw new Error('请选择模块类型。');
  if (!Array.isArray(v.supportDevice) || !v.supportDevice.length ||
    new Set(v.supportDevice).size !== v.supportDevice.length ||
    v.supportDevice.some(id => !selectableControllerIds.includes(id))) throw new Error('请选择有效的支持主控。');
  if (!Array.isArray(v.blocks) || !v.blocks.length || v.blocks.length > 24) throw new Error('模块需要 1 至 24 块积木。');
  const blocks = v.blocks.map(validateCustomModuleBlock);
  if (new Set(blocks.map(block => block.key)).size !== blocks.length) throw new Error('同一个模块内的积木 ID 必须唯一。');
  const definition: CustomModuleDefinition = {
    schemaVersion: 1, name: field(v.name, '模块名称', 80, true).trim(),
    description: field(v.description, '描述', 500), version: field(v.version, '模块版本', 32, true).trim(),
    author: field(v.author, '署名', 80), type: v.type, supportDevice: [...v.supportDevice], blocks,
    definitions: field(v.definitions, '全局代码', 8192), setup: field(v.setup, '初始化代码', 8192),
    ...(v.appearance === undefined ? {} : { appearance: validateAppearance(v.appearance) }),
    ...(v.libraries === undefined ? {} : { libraries: validateLibraries(v.libraries) }),
  };
  if (new TextEncoder().encode(JSON.stringify({ definition })).length > 128 * 1024) throw new Error('模块定义超过 128 KiB。');
  return definition;
}

export function parseCustomModuleRecord(value: unknown): CustomModuleRecord {
  const item = object(value, '私有模块');
  if (typeof item.id !== 'string' || !CUSTOM_MODULE_ID.test(item.id) || typeof item.createdAt !== 'string') {
    throw new Error('私有模块记录无效。');
  }
  return { id: item.id, createdAt: item.createdAt, definition: validateCustomModuleDefinition(item.definition) };
}

export function pinMenu(type: CustomModuleInputType) {
  return Object.hasOwn(customPinMenus, type) ? customPinMenus[type as keyof typeof customPinMenus] : undefined;
}

const shapeExtension = { command: 'shape_statement', reporter: 'output_number', boolean: 'output_boolean', hat: 'shape_hat' } as const;
export const pinUnavailable = (name: string) => '参数 ' + name + ' 缺少可用引脚，请选择或检查当前主控。';

export function currentPinOptions(Blockly: any, menu: string): [string, string][] {
  try {
    return (Blockly?.Device?.getPinOptions(menu) ?? []).map(([label, value]: [string, string | number]) => [label, String(value)]);
  } catch {
    // Native getPinOptions throws while the board's flyout is missing or rebuilding.
    return [];
  }
}

export function customArgumentDefault(input: CustomModuleInput): string {
  if (input.type === 'statement') return '';
  if (input.type === 'dropdown') return input.options?.[0]?.[1] ?? '';
  if (input.type === 'text' || input.type === 'textValue') return JSON.stringify(input.defaultValue ?? '');
  return String(input.defaultValue ?? (input.type === 'boolean' ? false : 0));
}

export function customBlockJson(block: CustomModuleBlock, opcode: string, Blockly?: any, appearance = defaultCustomAppearance) {
  const args = new Map(block.inputs.map(input => [input.name, input]));
  const args0: object[] = [];
  const message0 = block.message.replaceAll('%', '%%').replace(placeholder, (_match, name) => {
    const input = args.get(name)!;
    const menu = pinMenu(input.type);
    if (menu) {
      const options = currentPinOptions(Blockly, menu);
      args0.push({ type: 'field_dropdown', name, options: options.length ? options : [['无可用引脚', '']] });
    } else if (input.type === 'dropdown') args0.push({ type: 'field_dropdown', name, options: input.options });
    else if (input.type === 'number') args0.push({ type: 'field_number', name, value: input.defaultValue ?? 0 });
    else if (input.type === 'text') args0.push({ type: 'field_input', name, text: input.defaultValue ?? '' });
    else if (input.type === 'statement') args0.push({ type: 'input_statement', name });
    else args0.push({ type: 'input_value', name, ...(input.type === 'boolean' && { check: 'Boolean' }) });
    return '%' + args0.length;
  });
  return { type: opcode, message0, args0, colour: appearance.color, colourSecondary: appearance.secondaryColor,
    colourTertiary: appearance === defaultCustomAppearance ? '#50358e' : appearance.secondaryColor,
    extensions: [shapeExtension[block.shape]] };
}

export function customToolboxBlock(xml: Document, block: CustomModuleBlock, opcode: string) {
  const element = xml.createElement('block');
  element.setAttribute('type', opcode);
  for (const input of block.inputs) {
    if (input.type !== 'textValue' && input.type !== 'numberValue') continue;
    const text = input.type === 'textValue';
    const value = xml.createElement('value');
    value.setAttribute('name', input.name);
    const shadow = xml.createElement('shadow');
    shadow.setAttribute('type', text ? 'text' : 'math_number');
    const field = xml.createElement('field');
    field.setAttribute('name', text ? 'TEXT' : 'NUM');
    field.textContent = String(input.defaultValue ?? (text ? '' : 0));
    shadow.appendChild(field);
    value.appendChild(shadow);
    element.appendChild(value);
  }
  return element;
}

export function fillCustomTemplate(code: string, parameter: (name: string) => string) {
  return code.replace(placeholder, (_match, name) => parameter(name));
}
