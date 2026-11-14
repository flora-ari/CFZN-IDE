export interface ExecutionBlock { opcode: string; next?: string | null; inputs?: Record<string, { block?: string | null; shadow?: string | null }>; mutation?: { proccode?: string } }
export interface ExecutionGraph { roots: string[]; blocks: Record<string, ExecutionBlock> }

export function unsafeStageOpcode(graphs: ExecutionGraph[], unsupported: ReadonlySet<string>, clicked?: { graph: number; id: string }): string | null {
  for (const [index, graph] of graphs.entries()) {
    const procedures = new Map<string, string>();
    for (const id of graph.roots) {
      const root = graph.blocks[id];
      if (root?.opcode !== 'procedures_definition') continue;
      const prototype = graph.blocks[root.inputs?.custom_block?.block ?? ''];
      if (prototype?.mutation?.proccode) procedures.set(prototype.mutation.proccode, id);
    }
    const seen = new Set<string>();
    const visit = (id?: string | null): string | null => {
      if (!id || seen.has(id)) return null; seen.add(id);
      const block = graph.blocks[id]; if (!block) return null;
      if (unsupported.has(block.opcode)) return block.opcode;
      const calls = block.opcode === 'procedures_call' ? procedures.get(block.mutation?.proccode ?? '') : undefined;
      for (const next of [block.next, calls, ...Object.values(block.inputs ?? {}).flatMap(input => [input.block, input.shadow])]) {
        const unsafe = visit(next); if (unsafe) return unsafe;
      }
      return null;
    };
    for (const rootId of graph.roots) {
      const root = graph.blocks[rootId];
      if (root?.opcode === 'event_whenarduinobegin' || root?.opcode === 'procedures_definition') continue;
      const unsafe = visit(rootId); if (unsafe) return unsafe;
    }
    if (clicked?.graph === index) { const unsafe = visit(clicked.id); if (unsafe) return unsafe; }
  }
  return null;
}

export function executionGraphs(vm: any): ExecutionGraph[] {
  return vm.runtime.targets.map((target: any) => {
    const roots = target.blocks.getScripts(), blocks: Record<string, ExecutionBlock> = {}, pending = [...roots];
    while (pending.length) {
      const id = pending.pop()!; if (blocks[id]) continue;
      const block = target.blocks.getBlock(id); if (!block) continue;
      blocks[id] = block;
      if (block.next) pending.push(block.next);
      for (const input of Object.values(block.inputs ?? {}) as any[]) { if (input.block) pending.push(input.block); if (input.shadow) pending.push(input.shadow); }
    }
    return { roots, blocks };
  });
}
