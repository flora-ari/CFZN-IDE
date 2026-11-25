import { invalid, tooLarge } from '../common/api-error';
import controllerCatalog from '../common/controller-catalog.json';
import { libraryReferences, type ArduinoLibraryReference } from '../arduino-libraries/library-input';

export const CUSTOM_MODULE_ID = /^custom[0-9a-f]{32}$/;
export const MAX_CUSTOM_MODULE_BYTES = 128 * 1024;

const devices = new Set<string>(controllerCatalog);
const placeholder = /\{\{([A-Z][A-Z0-9_]{0,23})\}\}/g;
const inputTypes = [
  'number', 'text', 'dropdown', 'value', 'statement', 'textValue', 'numberValue', 'boolean',
  'digitalOutputPin', 'digitalInputPin', 'analogInputPin',
] as const;

type ModuleInputType = typeof inputTypes[number];

interface ModuleInput {
  name: string;
  type: ModuleInputType;
  defaultValue?: string | number | boolean;
  options?: [string, string][];
}

interface ModuleBlock {
  key: string;
  message: string;
  shape: 'command' | 'reporter' | 'boolean' | 'hat';
  inputs: ModuleInput[];
  code: string;
}

export interface CustomModuleDefinition {
  schemaVersion: 1;
  name: string;
  description: string;
  version: string;
  author: string;
  type: 'sensor' | 'actuator' | 'function';
  supportDevice: string[];
  blocks: ModuleBlock[];
  definitions: string;
  setup: string;
  appearance?: { color: string; secondaryColor: string };
  libraries?: ArduinoLibraryReference[];
}

export interface CustomModuleRecord {
  id: string;
  definition: CustomModuleDefinition;
  createdAt: string;
}

function record(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !fields.includes(key))) {
    throw invalid('Provide an object containing only supported fields.', path);
  }
  return value as Record<string, unknown>;
}

function field(value: unknown, path: string, limit: number, required = false): string {
  if (typeof value !== 'string' || value.length > limit ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value) || (required && !value.trim())) {
    throw invalid(`Provide ${required ? 'nonempty text' : 'text'} up to ${limit} characters.`, path);
  }
  return value;
}

const placeholdersIn = (value: string) => Array.from(value.matchAll(placeholder), (match) => match[1]);

function validateInput(value: unknown, path: string): ModuleInput {
  const input = record(value, path, ['name', 'type', 'defaultValue', 'options']);
  const name = field(input.name, `${path}.name`, 24, true);
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw invalid('Use an uppercase parameter ID.', `${path}.name`);
  const type = inputTypes.find((candidate) => candidate === input.type);
  if (!type) throw invalid('Select a supported parameter type.', `${path}.type`);
  const hasDefault = Object.hasOwn(input, 'defaultValue');

  if (type === 'dropdown') {
    if (hasDefault) {
      throw invalid('Dropdown parameters use an options list.', `${path}.defaultValue`);
    }
    if (!Array.isArray(input.options) || !input.options.length || input.options.length > 30) {
      throw invalid('Provide 1 to 30 dropdown options.', `${path}.options`);
    }
    const options = input.options.map((option: unknown, index): [string, string] => {
      const optionPath = `${path}.options.${index}`;
      if (!Array.isArray(option) || option.length !== 2) {
        throw invalid('Provide a display label and a code value.', optionPath);
      }
      return [field(option[0], `${optionPath}.0`, 80, true), field(option[1], `${optionPath}.1`, 160, true)];
    });
    if (new Set(options.map(([, code]) => code)).size !== options.length) {
      throw invalid('Dropdown code values must be unique.', `${path}.options`);
    }
    return { name, type, options };
  }

  if (Object.hasOwn(input, 'options')) throw invalid('Only dropdown parameters use options.', `${path}.options`);
  const defaultPath = `${path}.defaultValue`;
  // Legacy inputs accept null as omission. The new inputs only default when the field is absent.
  const legacyDefault = type === 'number' || type === 'text' || type === 'value';
  const useFallback = !hasDefault || (legacyDefault && input.defaultValue == null);
  if (type === 'number' || type === 'numberValue') {
    const defaultValue = useFallback ? 0 : input.defaultValue;
    if (typeof defaultValue !== 'number' || !Number.isFinite(defaultValue)) {
      throw invalid('Provide a finite numeric default value.', defaultPath);
    }
    return { name, type, defaultValue };
  }
  if (type === 'text' || type === 'textValue' || type === 'value') {
    const fallback = type === 'value' ? '0' : '';
    const defaultValue = useFallback ? fallback : input.defaultValue;
    return { name, type, defaultValue: field(defaultValue, defaultPath, 512) };
  }
  if (type === 'boolean') {
    const defaultValue = useFallback ? false : input.defaultValue;
    if (typeof defaultValue !== 'boolean') throw invalid('Provide a Boolean default value.', defaultPath);
    return { name, type, defaultValue };
  }
  if (hasDefault) throw invalid('This parameter type has no default value.', defaultPath);
  return { name, type };
}

function validateBlock(value: unknown, index: number): ModuleBlock {
  const path = `definition.blocks.${index}`;
  const block = record(value, path, ['key', 'message', 'shape', 'inputs', 'code']);
  const key = field(block.key, `${path}.key`, 32, true);
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) {
    throw invalid('Start the block key with a lowercase letter, followed by lowercase letters, digits or underscores.', `${path}.key`);
  }
  const shape = block.shape;
  if (shape !== 'command' && shape !== 'reporter' && shape !== 'boolean' && shape !== 'hat') {
    throw invalid('Select a supported block shape.', `${path}.shape`);
  }
  if (!Array.isArray(block.inputs) || block.inputs.length > 10) {
    throw invalid('Provide at most 10 inputs per block.', `${path}.inputs`);
  }
  const inputs = block.inputs.map((input, inputIndex) => validateInput(input, `${path}.inputs.${inputIndex}`));
  const names = new Set(inputs.map((input) => input.name));
  const isStatement = shape === 'command' || shape === 'hat';
  if (names.size !== inputs.length || (!isStatement && inputs.some((input) => input.type === 'statement'))) {
    throw invalid('Use unique inputs and place statement inputs on command or hat blocks.', `${path}.inputs`);
  }
  const message = field(block.message, `${path}.message`, 300, true);
  const displayed = placeholdersIn(message);
  if (displayed.length !== names.size || new Set(displayed).size !== names.size ||
      displayed.some((name) => !names.has(name))) {
    throw invalid('Use each input once as a {{NAME}} placeholder in the block message.', `${path}.message`);
  }
  const code = field(block.code, `${path}.code`, 8192, !isStatement);
  if (placeholdersIn(code).some((name) => !names.has(name))) {
    throw invalid('Code placeholders must refer to inputs on this block.', `${path}.code`);
  }
  return { key, message, shape, inputs, code };
}

export function validateModuleDefinition(value: unknown): CustomModuleDefinition {
  const definition = record(value, 'definition', [
    'schemaVersion', 'name', 'description', 'version', 'author', 'type', 'supportDevice', 'blocks', 'definitions', 'setup',
    'appearance', 'libraries',
  ]);
  if (definition.schemaVersion !== 1) throw invalid('Unsupported definition version.', 'definition.schemaVersion');
  const type = definition.type;
  if (type !== 'sensor' && type !== 'actuator' && type !== 'function') {
    throw invalid('Select a supported module type.', 'definition.type');
  }
  const supportDevice = definition.supportDevice;
  if (!Array.isArray(supportDevice) || !supportDevice.length ||
      new Set(supportDevice).size !== supportDevice.length ||
      supportDevice.some((id) => typeof id !== 'string' || !devices.has(id))) {
    throw invalid('Select distinct supported controllers.', 'definition.supportDevice');
  }
  if (!Array.isArray(definition.blocks) || !definition.blocks.length || definition.blocks.length > 24) {
    throw invalid('Provide 1 to 24 blocks.', 'definition.blocks');
  }
  const blocks = definition.blocks.map(validateBlock);
  if (new Set(blocks.map((block) => block.key)).size !== blocks.length) {
    throw invalid('Use unique block keys.', 'definition.blocks');
  }
  let appearance: CustomModuleDefinition['appearance'];
  if (Object.hasOwn(definition, 'appearance')) {
    const colors = record(definition.appearance, 'definition.appearance', ['color', 'secondaryColor']);
    const { color, secondaryColor } = colors;
    if (typeof color !== 'string' || typeof secondaryColor !== 'string' ||
        !/^#[a-f0-9]{6}$/i.test(color) || !/^#[a-f0-9]{6}$/i.test(secondaryColor)) {
      throw invalid('Provide two hex colors in #RRGGBB format.', 'definition.appearance');
    }
    appearance = { color, secondaryColor };
  }
  return {
    schemaVersion: 1,
    name: field(definition.name, 'definition.name', 80, true).trim(),
    description: field(definition.description, 'definition.description', 500),
    version: field(definition.version, 'definition.version', 32, true).trim(),
    author: field(definition.author, 'definition.author', 80),
    type,
    supportDevice,
    blocks,
    definitions: field(definition.definitions, 'definition.definitions', 8192),
    setup: field(definition.setup, 'definition.setup', 8192),
    ...(appearance ? { appearance } : {}),
    ...(Object.hasOwn(definition, 'libraries') ? { libraries: libraryReferences(definition.libraries, 'definition.libraries', 24) } : {}),
  };
}

export function moduleFromBody(body: unknown): CustomModuleDefinition {
  const definition = validateModuleDefinition(record(body, 'body', ['definition']).definition);
  if (Buffer.byteLength(JSON.stringify({ definition })) > MAX_CUSTOM_MODULE_BYTES) {
    throw tooLarge('The module definition exceeds 128 KiB.');
  }
  return definition;
}
