export type RemovalTarget = { kind: 'module' | 'controller'; id: string };
export interface RemovalState {
  selected: boolean; allowed: boolean;
  reason?: 'busy' | 'in-use' | 'modules-loaded' | 'serial-owned' | 'unsupported' | 'stale';
  detail?: string;
  references?: { targetName: string; count: number }[];
  dependentModuleIds?: string[];
}

const get = (record: any, key: string) => typeof record?.get === 'function' ? record.get(key) : record?.[key];
export function extensionReferences(runtime: any, opcodes: ReadonlySet<string>) {
  const references: { targetName: string; count: number }[] = [];
  for (const target of runtime.targets) {
    if (target.isOriginal === false) continue;
    const count = target.blocks.getAllIds().filter((id: string) => opcodes.has(target.blocks.getBlock(id)?.opcode)).length;
    if (count) references.push({ targetName: target.getName(), count });
  }
  const monitors = new Map<string, any>();
  runtime.getMonitorState().forEach((record: any, id: string) => monitors.set(get(record, 'id') ?? id, record));
  const blocks = runtime.monitorBlocks;
  for (const id of blocks.getAllIds()) if (blocks.getBlock(id)?.isMonitored && !monitors.has(id)) monitors.set(id, null);
  let count = 0;
  for (const [id, record] of monitors) {
    const pending = [id], seen = new Set<string>(); let used = opcodes.has(get(record, 'opcode'));
    while (pending.length) {
      const next = pending.pop()!; if (seen.has(next)) continue; seen.add(next);
      const block = blocks.getBlock(next); if (!block) continue;
      used ||= opcodes.has(block.opcode);
      if (block.next) pending.push(block.next);
      for (const input of Object.values(block.inputs ?? {}) as any[]) { if (input.block) pending.push(input.block); if (input.shadow) pending.push(input.shadow); }
    }
    if (used) count++;
  }
  if (count) references.push({ targetName: '监视器', count });
  return references;
}
export function removalMessage(state: RemovalState, name: string, names: (id: string) => string = id => id) {
  if (state.allowed) return '';
  if (state.reason === 'in-use') return `${name}仍被引用：${state.references?.map(ref => `${ref.targetName} ${ref.count}处`).join('、')}。请先移除相关积木或监视器。`;
  if (state.reason === 'modules-loaded') return `请先移除模块：${state.dependentModuleIds?.map(names).join('、')}。`;
  if (state.reason === 'serial-owned') return state.detail || '请先在连接弹窗断开串口，再移除主控。';
  if (state.reason === 'stale') return '当前主控已变化，请重新选择要移除的主控。';
  return state.detail || (state.reason === 'busy' ? '当前操作尚未完成，请稍后移除。' : '此条目暂不支持移除。');
}
