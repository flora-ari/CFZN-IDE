// Read the pinned boards' pure description getters. Never construct their peripheral classes.
export const modulePinOpcodes: Record<string, string> = {
  activeBuzzer_init: 'arduino_pin_setDigitalOutput', atomizer_init: 'arduino_pin_setDigitalOutput',
  pirSensor_init: 'arduino_pin_readDigitalPin', flameSensor_readDigital: 'arduino_pin_readDigitalPin',
  raindropSensor_readDigital: 'arduino_pin_readDigitalPin', flameSensor_readAnalog: 'arduino_pin_readAnalogPin',
  raindropSensor_readAnalog: 'arduino_pin_readAnalogPin',
};

interface DeviceBlock {
  fields: Map<string, string[]>;
}
export type DeviceCapabilities = Map<string, DeviceBlock>;

export function deviceCapabilities(factories: Record<string, () => any>, id: string, type: string): DeviceCapabilities {
  const Device = factories[id]?.();
  if (!Device?.prototype?.getInfo) throw new Error(`无法读取目标主控 ${id} 的积木描述。`);
  const categories = Device.prototype.getInfo.call(Device.prototype);
  return capabilitiesFromInfo(categories, type, id);
}
export function capabilitiesFromInfo(categories: any[], type: string, id: string): DeviceCapabilities {
  const result: DeviceCapabilities = new Map();
  for (const category of categories) {
    for (const [name, menu] of Object.entries(category.menus ?? {}) as [string, any][]) {
      const items = Array.isArray(menu) ? menu : menu?.items;
      if (Array.isArray(items)) result.set(`${type}_${category.id}_menu_${name}`, {
        fields: new Map([[name, items.map((item: any) => String(typeof item === 'object' ? item.value : item))]]),
      });
    }
    for (const block of category.blocks ?? []) {
      if (typeof block !== 'object' || !block?.opcode ||
        (block.programMode && !block.programMode.includes('upload'))) continue;
      const fields = new Map<string, string[]>();
      for (const [name, argument] of Object.entries(block.arguments ?? {}) as [string, any][]) {
        if (!argument.menu) continue;
        const menu = category.menus?.[argument.menu];
        const items = Array.isArray(menu) ? menu : menu?.items;
        if (!Array.isArray(items)) throw new Error(`目标主控 ${id} 的 ${block.opcode}.${name} 不是静态菜单。`);
        fields.set(name, items.map((item: any) => String(typeof item === 'object' ? item.value : item)));
      }
      result.set(`${type}_${category.id}_${block.opcode}`, { fields });
    }
  }
  return result;
}

export function assertControllerCompatible(targets: any[], sourceType: string | null, targetType: string | null,
  target: DeviceCapabilities, targetName: string) {
  for (const sprite of targets) {
    for (const block of Object.values(sprite.blocks?._blocks ?? {}) as any[]) {
      const deviceBlock = sourceType && block.opcode.startsWith(`${sourceType}_`);
      const moduleMenu = modulePinOpcodes[block.opcode];
      if (block.opcode === 'event_whenarduinobegin' && targetType !== 'arduino') {
        throw new Error(`无法切换到 ${targetName}：现有积木 event_whenarduinobegin 不受目标主控支持。原项目保持不变。`);
      }
      const descriptor = target.get(moduleMenu || block.opcode);
      if ((deviceBlock || moduleMenu) && !descriptor) {
        throw new Error(`无法切换到 ${targetName}：现有积木 ${block.opcode} 不受目标主控支持。原项目保持不变。`);
      }
      if (!descriptor || (!deviceBlock && !moduleMenu)) continue;
      for (const [field, values] of descriptor.fields) {
        // Module definitions borrow only the board's PIN menu, not its LEVEL/other arguments.
        if (moduleMenu && field !== 'PIN') continue;
        const value = block.fields?.[field]?.value;
        if (value !== undefined && !values.includes(String(value))) {
          throw new Error(`无法切换到 ${targetName}：现有积木 ${block.opcode} 的${field === 'PIN' ? '引脚' : field} ${String(value)} 不受目标主控支持。原设备、积木和参数保持不变。`);
        }
      }
    }
  }
}

export function pinMenusMatch(Blockly: any, target: DeviceCapabilities) {
  return ['arduino_pin_setDigitalOutput', 'arduino_pin_readDigitalPin', 'arduino_pin_readAnalogPin'].every(opcode => {
    const expected = target.get(opcode)?.fields.get('PIN');
    const actual: string[] = Blockly.Device.getPinOptions(opcode).map((option: any[]) => String(option[1]));
    return !!expected?.length && actual.length === expected.length && expected.every(value => actual.includes(value));
  });
}
