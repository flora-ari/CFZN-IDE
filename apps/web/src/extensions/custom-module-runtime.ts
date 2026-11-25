import type { ModuleEntry } from './catalog';
import type { BuiltinFunctions } from './builtin-resources';
import { currentPinOptions, customArgumentDefault, customBlockJson, customToolboxBlock, defaultCustomAppearance,
  fillCustomTemplate, isStatementShape, pinMenu, pinUnavailable, type CustomModuleInput, type CustomModuleRecord } from './custom-module-definition';

const opcodeFor = (id: string, key: string) => id + '_' + key;

export function customModuleEntry(record: CustomModuleRecord): ModuleEntry {
  const { id, definition } = record;
  return {
    extensionId: id, categoryId: id, name: definition.name, description: definition.description,
    version: definition.version, iconURL: '/branding/ccraft-icon.svg', type: definition.type,
    tags: [id, definition.author, definition.type, '自定义模块'], supportDevice: definition.supportDevice,
    blockModes: ['upload'], opcodes: definition.blocks.map(block => opcodeFor(id, block.key)),
  };
}

export function customModulePinFields(records: CustomModuleRecord[]) {
  const byOpcode = new Map<string, Map<string, string>>();
  for (const { id, definition } of records) for (const block of definition.blocks) {
    const fields = new Map<string, string>();
    for (const input of block.inputs) {
      const menu = pinMenu(input.type);
      if (menu) fields.set(input.name, menu);
    }
    if (fields.size) byOpcode.set(opcodeFor(id, block.key), fields);
  }
  return byOpcode;
}

function generatedArgument(input: CustomModuleInput, Blockly: any, block: any) {
  const Arduino = Blockly.Arduino;
  if (['value', 'textValue', 'numberValue', 'boolean'].includes(input.type)) {
    return Arduino.valueToCode(block, input.name, Arduino.ORDER_ATOMIC) || customArgumentDefault(input);
  }
  if (input.type === 'statement') return Arduino.statementToCode(block, input.name) || '';
  const value = block.getFieldValue(input.name) ?? input.defaultValue ?? '';
  const menu = pinMenu(input.type);
  if (menu && !currentPinOptions(Blockly, menu).some(([, pin]) => pin === String(value))) {
    throw new Error(pinUnavailable(input.name));
  }
  return input.type === 'text' ? JSON.stringify(String(value)) : String(value);
}

export function customModuleParts(record: CustomModuleRecord): BuiltinFunctions {
  const { id, definition } = record;
  const appearance = definition.appearance ?? defaultCustomAppearance;
  return {
    toolbox() {
      const xml = document.implementation.createDocument(null, 'category');
      const category = xml.documentElement;
      category.setAttribute('id', id);
      category.setAttribute('name', definition.name);
      category.setAttribute('colour', appearance.color);
      category.setAttribute('secondaryColour', appearance.secondaryColor);
      for (const block of definition.blocks) {
        category.appendChild(customToolboxBlock(xml, block, opcodeFor(id, block.key)));
      }
      return new XMLSerializer().serializeToString(category);
    },
    translations: Blockly => Blockly,
    blocks(Blockly) {
      for (const block of definition.blocks) {
        const opcode = opcodeFor(id, block.key);
        Blockly.Blocks[opcode] = {
          init(this: any) { this.jsonInit(customBlockJson(block, opcode, Blockly, appearance)); },
        };
      }
      return Blockly;
    },
    generator(Blockly) {
      const Arduino = Blockly.Arduino;
      for (const spec of definition.blocks) {
        const inputs = new Map(spec.inputs.map(input => [input.name, input]));
        Arduino[opcodeFor(id, spec.key)] = (block: any) => {
          if (spec.shape === 'hat') Arduino.includes_.arduino = '#include <Arduino.h>';
          if (definition.definitions) Arduino.definitions_[id] = definition.definitions;
          if (definition.setup) Arduino.setups_[id] = definition.setup;
          const code = fillCustomTemplate(spec.code, name => generatedArgument(inputs.get(name)!, Blockly, block));
          return isStatementShape(spec.shape) ? code && code.trimEnd() + '\n' : [code, Arduino.ORDER_NONE];
        };
      }
      return Blockly;
    },
  };
}
