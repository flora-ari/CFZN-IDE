import { modules, normalizeDeviceId } from './catalog.ts';

interface PaletteBlock { xml: string; opcode: string; filter?: string[]; modes?: string[]; hidden: boolean }
interface PaletteGroup { id: string; name: string; color1?: string; color2?: string; icon?: string; status: boolean; blocks: PaletteBlock[] }
const coreIds = new Set(['motion', 'looks', 'sound', 'event', 'control', 'sensing', 'operators', 'data', 'procedures']);
export const uploadOnlyBoards = new Set(['arduinoEsp32', 'arduinoEsp32S3', 'aijiteESP32S3', 'firebeetleEsp32E']);

// Recomputable GUI presentation only. Runtime committed device/module IDs remain authoritative.
export class ToolboxPresentation {
  private controller?: { id: string; locale: string; groups: PaletteGroup[] };
  private moduleXML = new Map<string, string>();
  private rendered = { deviceId: '', xml: '' };
  private controllerMenus: string[] = [];
  capture(info: any, locale: string, currentDeviceId?: string) {
    let deviceId = info.deviceId, categories = info.categoryInfoArray;
    if (!deviceId) {
      // Native locale refresh events omit deviceId. Associate only a complete refresh of the
      // already known controller groups with the actual current board; stage events do not qualify.
      const current = this.controller, id = normalizeDeviceId(currentDeviceId ?? '');
      if (!current || current.id !== id) return;
      const groups = new Set(current.groups.map(group => group.id));
      if (!groups.size || ![...groups].every(groupId => categories.some((category: any) => category.id === groupId))) return;
      deviceId = id; categories = categories.filter((category: any) => groups.has(category.id));
    }
    this.controller = { id: normalizeDeviceId(deviceId), locale,
      groups: categories.map((category: any) => ({ id: category.id, name: category.name,
        color1: category.color1, color2: category.color2, icon: category.menuIconURI || category.blockIconURI,
        status: !!category.showStatusButton,
        blocks: category.blocks.map((block: any) => ({ xml: block.xml, opcode: block.json?.type ?? '',
          filter: block.info?.filter ? [...block.info.filter] : undefined,
          modes: block.info?.programMode ? [...block.info.programMode] : undefined, hidden: !!block.info?.hideFromPalette })),
      })) };
    this.controllerMenus = categories.flatMap((category: any) => [...(category.menus ?? []), ...Object.values(category.customFieldTypes ?? {}).map((field: any) => field.scratchBlocksDefinition)]
      .map((block: any) => block?.json?.type ?? block?.type).filter(Boolean));
  }
  setModule(id: string, xml: string) { this.moduleXML.set(id, xml); }
  removeModule(id: string) { this.moduleXML.delete(id); }
  controllerOpcodes(id: string) { return new Set(this.controller?.id === id ? [...this.controllerMenus, ...this.controller.groups.flatMap(group => group.blocks.map(block => block.opcode).filter(Boolean))] : []); }
  reset() { this.controller = undefined; this.controllerMenus = []; this.moduleXML.clear(); this.rendered = { deviceId: '', xml: '' }; }
  plan(deviceId: string, locale: string, isStage: boolean, realtime: boolean, loaded: string[]) {
    const board = this.controller?.id === deviceId && this.controller.locale === locale ? this.controller : undefined;
    const groups = board?.groups.map(group => ({ ...group, blocks: group.blocks
      .filter(block => !block.hidden && (!block.filter || block.filter.includes(isStage ? 'stage' : 'sprite')) &&
        (!block.modes || block.modes.includes(realtime ? 'realtime' : 'upload') || realtime && block.modes.includes('upload')))
      .map(block => ({ ...block, disabled: realtime && (uploadOnlyBoards.has(deviceId) || !!block.modes && !block.modes.includes('realtime')) })) }))
      .filter(group => group.blocks.some(block => !!block.opcode)) ?? [];
    return { controller: groups.length ? { id: `cfzn-controller-${deviceId}`, groups } : undefined,
      modules: [...new Set(loaded)].flatMap(id => this.moduleXML.has(id) ? [{ id, xml: this.moduleXML.get(id)!, disabled: realtime }] : []) };
  }
  unsupportedOpcodes(deviceId: string) {
    const opcodes = new Set(modules.flatMap(entry => entry.opcodes));
    if (this.controller?.id === deviceId) for (const group of this.controller.groups) for (const block of group.blocks) {
      if (block.opcode && (uploadOnlyBoards.has(deviceId) || block.modes && !block.modes.includes('realtime'))) opcodes.add(block.opcode);
    }
    return opcodes;
  }
  hasModule(deviceId: string, id: string, opcodes: string[]) {
    if (this.rendered.deviceId !== deviceId) return false;
    const categoryId = modules.find(entry => entry.extensionId === id)?.categoryId;
    const xml = new DOMParser().parseFromString(this.rendered.xml, 'application/xml');
    const category = Array.from(xml.getElementsByTagName('category')).find(item => item.getAttribute('id') === categoryId);
    const visible = new Set(Array.from(category?.getElementsByTagName('block') ?? []).map(block => block.getAttribute('type')));
    return opcodes.every(opcode => visible.has(opcode));
  }
  compose(native: (...args: any[]) => string, args: any[], locale: string) {
    const [initial, device, stage, targetId, dynamic, realtime, ...names] = args;
    const deviceId = device?.deviceId ?? '';
    const loaded: string[] = args[9] ?? [];
    const plan = this.plan(deviceId, locale, stage, realtime, loaded);
    const controller = this.controller;
    const removed = new Set([...(controller && controller.id === deviceId ? controller.groups.map(group => group.id) : []),
      ...modules.flatMap(entry => [entry.extensionId, entry.categoryId])]);
    const unique = new Map<string, { id: string; xml: string }>();
    for (const category of dynamic ?? []) if (!removed.has(category.id) && category.xml && !unique.has(category.id)) unique.set(category.id, category);
    const core = [...unique.values()].filter(entry => coreIds.has(entry.id));
    const base = native(initial, device, stage, targetId, core, realtime, ...names.slice(0, 3));
    const parser = new DOMParser(), serializer = new XMLSerializer();
    const xml = parser.parseFromString(base, 'application/xml'), root = xml.documentElement;
    const node = (tag: string) => xml.createElementNS(root.namespaceURI, tag);
    const appendXML = (text: string, disabled?: boolean) => {
      const fragment = parser.parseFromString(`<xml>${text}</xml>`, 'application/xml');
      if (fragment.getElementsByTagName('parsererror').length) throw new Error('扩展类别 XML 无效。');
      for (const child of Array.from(fragment.documentElement.children)) {
        if (disabled && child.tagName === 'category') {
          const label = fragment.createElement('label'); label.setAttribute('text', '仅上传模式：切换上传模式后编辑、生成并烧录'); child.prepend(label);
        }
        if (disabled !== undefined) for (const block of [child, ...Array.from(child.getElementsByTagName('block'))]) if (block.tagName === 'block') block.setAttribute('disabled', String(disabled));
        root.appendChild(xml.importNode(child, true));
      }
    };
    if (plan.controller) {
      const category = node('category'), first = plan.controller.groups[0];
      category.setAttribute('id', plan.controller.id); category.setAttribute('name', device.name || deviceId);
      if (first.color1) category.setAttribute('colour', first.color1);
      if (first.color2) category.setAttribute('secondaryColour', first.color2);
      if (first.icon) category.setAttribute('iconURI', first.icon);
      if (plan.controller.groups.some(group => group.status)) category.setAttribute('showStatusButton', 'true');
      if (plan.controller.groups.some(group => group.blocks.some(block => block.disabled))) {
        const label = node('label'); label.setAttribute('text', '灰色积木仅上传模式可用'); category.appendChild(label);
      }
      for (const group of plan.controller.groups) {
        const label = node('label'); label.setAttribute('text', group.name); category.appendChild(label);
        for (const block of group.blocks) {
          const fragment = parser.parseFromString(`<xml>${block.xml}</xml>`, 'application/xml');
          for (const child of Array.from(fragment.documentElement.children)) {
            if (child.tagName === 'block') child.setAttribute('disabled', String(block.disabled));
            category.appendChild(xml.importNode(child, true));
          }
        }
        category.appendChild(node('sep'));
      }
      root.appendChild(node('sep')); root.appendChild(category);
    }
    for (const entry of plan.modules) { root.appendChild(node('sep')); appendXML(entry.xml, entry.disabled); }
    if (realtime) for (const entry of unique.values()) if (!coreIds.has(entry.id)) { root.appendChild(node('sep')); appendXML(entry.xml); }
    const result = serializer.serializeToString(root);
    this.rendered = { deviceId, xml: result }; return result;
  }
}
