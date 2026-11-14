const pins = [25, 26, 27, 0, 14, 13, 5, 2, 17, 16, 4, 12];
const analog = [36, 39, 34, 35, 15];
const labels = new Map([...pins.map((pin, i) => [String(pin), `D${i + 2} / IO${pin}`] as const),
  ...analog.map((pin, i) => [String(pin), `A${i} / IO${pin}`] as const)]);
export function derivedInfo(info: any[], id: string) {
  return info.map(category => ({ ...category, menus: category.menus && Object.fromEntries(
    Object.entries(category.menus).map(([key, menu]: [string, any]) => {
      if (!Array.isArray(menu?.items)) return [key, menu];
      const isPin = /pin/i.test(key);
      return [key, { ...menu, items: menu.items.filter((item: any) => {
        if (id === 'aijiteESP32S3') return item.text !== 'IO3' && String(item.value) !== '3';
        if (!isPin) return true;
        const value = String(item.value);
        if (/analog/i.test(key)) return analog.map(String).includes(value);
        if (/out/i.test(key)) return [...pins, 15].map(String).includes(value);
        return labels.has(value);
      }).map((item: any) => id === 'firebeetleEsp32E' && isPin ? { ...item, text: labels.get(String(item.value)) } : item) }];
    })) })).map(category => ({ ...category, blocks: category.blocks?.map((block: any) => {
      if (!block || typeof block !== 'object' || id !== 'firebeetleEsp32E') return block;
      return { ...block, arguments: block.arguments && Object.fromEntries(Object.entries(block.arguments).map(([key, argument]: [string, any]) => {
        const items = category.menus?.[argument.menu]?.items;
        if (!items?.length || items.some((item: any) => String(item.value) === String(argument.defaultValue))) return [key, argument];
        return [key, { ...argument, defaultValue: items[0].value }];
      })) };
    }) }));
}
export function firebeetleDevice(Base: any) {
  return class FirebeetleEsp32E extends Base {
    get DEVICE_ID() { return 'firebeetleEsp32E'; }
    getInfo() { return derivedInfo(super.getInfo(), this.DEVICE_ID); }
  };
}
