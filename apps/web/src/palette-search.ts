import './palette-search.css';
import { SEARCH_CATEGORY, matchPaletteEntries, semanticPaletteXML, changesPaletteTemplates } from './palette-index.ts';
import type { PaletteEntry } from './palette-index.ts';

interface Binding { B: any; workspace: any; isolated: any; refresh(): void; stop(): void }

// The pinned headless Block cannot render colours or generate SVG argument shadows.
// Only the index copy is adjusted; result templates always retain their original XML.
function indexCopy(node: Element, B: any) {
  const copy = node.cloneNode(true) as Element;
  [copy, ...Array.from(copy.querySelectorAll('block, shadow'))].forEach(block => block.removeAttribute('disabled'));
  for (const mutation of Array.from(copy.querySelectorAll('mutation[generateshadows="true"]'))) {
    const block = mutation.parentElement!;
    const ids = JSON.parse(mutation.getAttribute('argumentids') || '[]');
    mutation.setAttribute('generateshadows', 'false');
    // Same argument split and shadow DOM builder as the pinned native ProcedureUtils.
    const parts = (mutation.getAttribute('proccode') || '').split(/(?=[^\\]%[nbs])/).map(part => part.trim());
    let argument = 0;
    for (const part of parts) if (part.startsWith('%')) {
      const kind = part[1], id = ids[argument++];
      if (!id || kind === 'b' || Array.from(block.children).some(child => child.tagName.toLowerCase() === 'value' && child.getAttribute('name') === id)) continue;
      const value = copy.ownerDocument.createElement('value'); value.setAttribute('name', id);
      value.append(B.ScratchBlocks.ProcedureUtils.buildShadowDom_(kind)); block.append(value);
    }
  }
  return copy;
}
export class PaletteSearch {
  private binding?: Binding;
  private subscribers = new Set<() => void>();
  private baseXML = '';
  private context = '';
  private generation = 0;
  private entries: PaletteEntry[] | null = null;
  private indexing = false;
  private query = '';
  private opened = false;
  private error = '';
  private previous?: { category: string; offset: number };
  private restore = false;
  private focus: 'input' | 'toggle' | null = null;
  private Component: any;
  private getContext: () => string;
  private allowed: () => boolean;
  constructor(getContext: () => string, allowed: () => boolean) { this.getContext = getContext; this.allowed = allowed; }

  attach(B: any, workspace: any, xml: string, refresh: () => void) {
    this.detach();
    const listener = (event: any) => {
      if (changesPaletteTemplates(event.type)) this.invalidate();
    };
    workspace.addChangeListener(listener);
    workspace.getInjectionDiv().classList.add('cfzn-search-workspace');
    const isolated = new B.Workspace(); isolated.isFlyout = true; isolated.targetWorkspace = workspace;
    this.binding = { B, workspace, isolated, refresh, stop: () => {
      workspace.removeChangeListener(listener); workspace.getInjectionDiv().classList.remove('cfzn-search-workspace');
      B.Events.disable(); try { isolated.dispose(); } finally { B.Events.enable(); }
    } };
    this.baseXML = xml; this.context = this.getContext(); this.invalidate();
  }
  detach(workspace?: any) {
    if (workspace && workspace !== this.binding?.workspace) return;
    this.binding?.stop(); this.binding = undefined; this.generation++; this.indexing = false; this.entries = null; this.publish();
  }
  syncContext() {
    const next = this.getContext();
    if (next !== this.context) { this.context = next; this.invalidate(); }
    else this.publish();
  }
  private publish() { this.subscribers.forEach(fn => fn()); }
  private invalidate(refresh = true) {
    this.generation++; this.entries = null; this.indexing = false; this.error = '';
    if (this.query.trim()) void this.buildIndex();
    if (refresh) this.binding?.refresh(); this.publish();
  }
  private async buildIndex() {
    const binding = this.binding;
    if (!binding || this.entries || this.indexing || this.error || !this.query.trim()) return;
    const { B, workspace, isolated } = binding, generation = this.generation;
    const xml = this.baseXML;
    this.indexing = true; this.publish();
    const entries: PaletteEntry[] = [], seen = new Set<string>();
    let count = 0;
    try {
      B.Events.disable();
      try {
        isolated.getVariableMap().clear();
        for (const variable of workspace.getAllVariables()) isolated.createVariable(variable.name, variable.type, variable.getId());
      } finally { B.Events.enable(); }
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      for (const category of Array.from(document.getElementsByTagName('category'))) {
        if (category.id === SEARCH_CATEGORY) continue;
        const custom = category.getAttribute('custom');
        const callback = custom && workspace.getToolboxCategoryCallback(custom);
        const nodes: Element[] = callback ? callback(workspace) : Array.from(category.children);
        for (const node of nodes) {
          if (node.nodeType !== 1 || node.tagName.toLowerCase() !== 'block') continue;
          const categoryId = category.getAttribute('id') || category.getAttribute('name') || '';
          const key = categoryId + ':' + semanticPaletteXML(node);
          if (seen.has(key)) continue;
          seen.add(key);
          B.Events.disable();
          try {
            const block = B.Xml.domToBlock(indexCopy(node, B), isolated);
            entries.push({ text: block.toString(), xml: node.cloneNode(true) as Element, category: categoryId });
          } finally {
            try { for (const block of isolated.getTopBlocks(false)) block.dispose(false); }
            finally { B.Events.enable(); }
          }
          if (++count % 24 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (this.generation !== generation || this.binding !== binding) return;
          }
        }
      }
      if (this.generation === generation && this.binding === binding) this.entries = entries;
    } catch (error) {
      if (this.generation === generation && this.binding === binding) this.error = `积木索引未完成：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Keep this binding's workspace: Workspace.clear/dispose hides global field widgets.
      // It is disposed only with its GUI workspace, never on an asynchronous index completion.
      if (this.generation === generation && this.binding === binding) { this.indexing = false; this.publish(); binding.refresh(); }
    }
  }
  decorate(workspace: any, xml: string) {
    if (workspace !== this.binding?.workspace) return xml;
    const context = this.getContext();
    if (xml !== this.baseXML || context !== this.context) { this.baseXML = xml; this.context = context; this.invalidate(false); }
    if (!this.query.trim()) return xml;
    void this.buildIndex();
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const category = document.createElement('category');
    category.setAttribute('id', SEARCH_CATEGORY); category.setAttribute('name', '搜索结果'); category.setAttribute('colour', '#4c97ff');
    category.setAttribute('secondaryColour', '#3373cc');
    const label = document.createElement('label'); label.setAttribute('text', this.status()); category.append(label);
    const spacer = document.createElement('sep'); spacer.setAttribute('gap', '40'); category.append(spacer);
    for (const entry of matchPaletteEntries(this.entries ?? [], this.query)) category.append(document.importNode(entry.xml, true));
    document.documentElement.append(category);
    return new XMLSerializer().serializeToString(document.documentElement);
  }
  fallback(selected: string) { return this.query.trim() ? SEARCH_CATEGORY : selected === SEARCH_CATEGORY ? this.previous?.category ?? '' : selected; }
  afterUpdate(workspace: any) {
    if (workspace !== this.binding?.workspace) return;
    const toolbox = workspace.toolbox_;
    if (this.query.trim()) { toolbox.setSelectedCategoryById(SEARCH_CATEGORY); return; }
    if (!this.restore) return;
    this.restore = false;
    const selected = this.previous?.category;
    const categories = new DOMParser().parseFromString(this.baseXML, 'application/xml').getElementsByTagName('category');
    const exists = selected && Array.from(categories).some(category => category.id === selected);
    const id = exists ? selected : categories[0]?.getAttribute('id');
    if (id) {
      toolbox.setSelectedCategoryById(id);
      const offset = exists ? this.previous?.offset ?? 0 : 0;
      toolbox.setFlyoutScrollPos(toolbox.getCategoryPositionById(id) + Math.min(offset, toolbox.getCategoryLengthById(id)));
    }
  }
  private status() {
    const count = matchPaletteEntries(this.entries ?? [], this.query).length;
    return this.error || (this.indexing ? '正在索引积木…' : count ? `${count} 个匹配积木` : '没有匹配的积木');
  }
  private setQuery(query: string) {
    if (!this.allowed()) return;
    this.query = query;
    if (!query.trim()) this.restore = true;
    else void this.buildIndex();
    this.binding?.refresh(); this.publish();
  }
  render(R: any) {
    this.Component ??= () => {
      const [, update] = R.useState(0), input = R.useRef(null), toggle = R.useRef(null);
      R.useEffect(() => { const listener = () => update((n: number) => n + 1); this.subscribers.add(listener); return () => { this.subscribers.delete(listener); }; }, []);
      R.useLayoutEffect(() => { if (this.focus) { (this.focus === 'input' ? input : toggle).current?.focus(); this.focus = null; } });
      const host = this.binding?.workspace.getInjectionDiv();
      if (!host) return null;
      return (window as any).ReactDOM.createPortal(R.createElement('div', { className: 'cfzn-palette-search', 'data-ui': true },
        R.createElement('button', { type: 'button', ref: toggle, className: 'cfzn-search-toggle', disabled: !this.allowed(), 'aria-label': '搜索积木', 'aria-expanded': this.opened, onClick: () => {
          if (!this.opened) { const toolbox = this.binding!.workspace.toolbox_; this.previous = { category: toolbox.getSelectedCategoryId(), offset: toolbox.getCategoryScrollOffset() }; this.opened = true; this.focus = 'input'; }
          else { this.setQuery(''); this.opened = false; this.focus = 'toggle'; }
          this.publish();
        } }, '搜索'),
        this.opened && R.createElement('div', { className: 'cfzn-search-panel', onKeyDown: (event: KeyboardEvent) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.setQuery(''); this.opened = false; this.focus = 'toggle'; this.publish(); }
        } }, R.createElement('input', { ref: input, value: this.query, disabled: !this.allowed(), 'aria-label': '搜索当前积木文字', placeholder: '搜索当前积木', onChange: (event: any) => this.setQuery(event.target.value) }),
        R.createElement('button', { type: 'button', disabled: !this.allowed(), onClick: () => { this.setQuery(''); this.focus = 'input'; this.publish(); } }, '清除'),
        this.error && R.createElement('button', { type: 'button', disabled: !this.allowed(), onClick: () => this.invalidate() }, '重新索引'),
        R.createElement('button', { type: 'button', disabled: !this.allowed(), 'aria-label': '关闭积木搜索', onClick: () => { this.setQuery(''); this.opened = false; this.focus = 'toggle'; this.publish(); } }, '×'),
        R.createElement('span', { role: 'status', 'aria-live': 'polite' }, this.query.trim() ? this.status() : '输入积木上的文字'))), host);
    };
    return R.createElement(this.Component);
  }
}
