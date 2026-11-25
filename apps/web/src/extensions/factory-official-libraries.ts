import type * as React from 'react';
import type { ArduinoLibraryReference } from './custom-module-definition';
import type { FactoryReact } from './custom-module-factory-preview';
import { makeFactoryDialog } from './factory-dialog';

interface OfficialLibrary {
  name: string;
  author: string;
  description: string;
  versions: { version: string; architectures: string[] }[];
}
type SearchState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; items: OfficialLibrary[] }
  | { status: 'error'; message: string };

function isOfficialLibrary(value: unknown): value is OfficialLibrary {
  if (!value || typeof value !== 'object') return false;
  const { name, author, description, versions } = value as OfficialLibrary;
  return typeof name === 'string' && !!name && typeof author === 'string' && typeof description === 'string' &&
    Array.isArray(versions) && versions.length > 0 && versions.every(item =>
      item && typeof item.version === 'string' && !!item.version &&
      Array.isArray(item.architectures) && item.architectures.every(arch => typeof arch === 'string'));
}

async function searchLibraries(query: string, signal: AbortSignal): Promise<OfficialLibrary[]> {
  let response: Response;
  try {
    const params = new URLSearchParams({ q: query });
    response = await fetch('/api/v1/arduino/libraries/search?' + params, { signal, credentials: 'same-origin' });
  } catch {
    throw new Error('无法连接 Arduino 库搜索服务。');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message || 'Arduino 库搜索失败（' + response.status + '）。');
  }
  if (!Array.isArray(body?.items) || !body.items.every(isOfficialLibrary)) {
    throw new Error('Arduino 库搜索结果格式无效。');
  }
  return body.items;
}

const catalogKey = (name: string) => name.toLowerCase();

export function makeOfficialLibraryPicker(R: FactoryReact) {
  const h = R.createElement;
  const Dialog = makeFactoryDialog(R);

  function SearchResult({ item, installed, disabled, onAdd }: {
    item: OfficialLibrary; installed?: ArduinoLibraryReference; disabled: boolean; onAdd(item: ArduinoLibraryReference): void;
  }) {
    const [version, setVersion] = R.useState(() =>
      item.versions.find(entry => entry.version === installed?.version)?.version ?? item.versions[0].version);
    const selected = item.versions.find(entry => entry.version === version);
    return h('li', { className: 'cfzn-factory-library-result' },
      h('div', { className: 'cfzn-factory-library-description' },
        h('div', { className: 'cfzn-factory-library-title' }, h('strong', null, item.name),
          h('span', null, 'by ', item.author || '—')),
        installed && h('span', { className: 'cfzn-factory-library-tag' }, '已添加'),
        item.description && h('p', { className: 'cfzn-factory-hint' }, item.description),
        selected && selected.architectures.length > 0 && h('p', { className: 'cfzn-factory-hint' },
          '支持架构 ' + selected.architectures.join('、'))),
      h('div', { className: 'cfzn-factory-library-version' },
        h('label', { className: 'cfzn-factory-field' },
          h('select', { value: version, 'aria-label': item.name + ' 版本', disabled,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setVersion(event.currentTarget.value) },
          item.versions.map(entry => h('option', { key: entry.version, value: entry.version }, entry.version)))),
        h('button', { type: 'button', className: 'cfzn-factory-dialog-button cfzn-factory-library-install', disabled: disabled || !selected || installed?.version === version,
          'aria-label': (installed ? '更换版本 ' : '添加 Arduino 库 ') + item.name,
          onClick: () => { if (selected) onAdd({ name: item.name, version: selected.version }); } }, installed ? '更换版本' : '添加')));
  }

  return function OfficialLibraryPicker({ libraries, readOnly, pending, onChange }: {
    libraries: ArduinoLibraryReference[]; readOnly: boolean; pending: boolean; onChange(libraries: ArduinoLibraryReference[]): void;
  }) {
    const [open, setOpen] = R.useState(false);
    const [query, setQuery] = R.useState('');
    const [search, setSearch] = R.useState<SearchState>({ status: 'idle' });
    const active = R.useRef<AbortController | null>(null);
    const field = R.useRef<HTMLInputElement>(null);
    const toggle = R.useRef<HTMLButtonElement>(null);
    R.useEffect(() => () => active.current?.abort(), []);

    const resetSearch = () => {
      active.current?.abort();
      setSearch({ status: 'idle' });
    };
    const closeSearch = () => {
      resetSearch();
      setQuery('');
      setOpen(false);
    };
    const runSearch = async () => {
      const term = query.trim();
      if (!term || pending) return;
      active.current?.abort();
      const request = new AbortController();
      active.current = request;
      setSearch({ status: 'loading' });
      try {
        const items = await searchLibraries(term, request.signal);
        if (!request.signal.aborted) setSearch({ status: 'ready', items });
      } catch (error) {
        if (!request.signal.aborted) setSearch({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    };
    const addLibrary = (item: ArduinoLibraryReference) => {
      const key = catalogKey(item.name);
      const installed = libraries.some(library => catalogKey(library.name) === key);
      onChange(installed ? libraries.map(library => catalogKey(library.name) === key ? item : library) : [...libraries, item]);
    };
    return h('section', { className: 'cfzn-factory-panel', 'aria-labelledby': 'cfzn-factory-library-heading' },
      h('h3', { id: 'cfzn-factory-library-heading' }, 'Arduino 官方库'),
      !readOnly && h('button', { type: 'button', className: 'cfzn-factory-button', ref: toggle,
        disabled: pending, 'aria-haspopup': 'dialog',
        onClick: () => setOpen(true) }, '从 Arduino 官方库中添加'),
      open && h(Dialog, { id: 'cfzn-factory-library-search', size: 'library', title: 'Arduino 库管理器索引', onClose: closeSearch,
        initialFocus: field, returnFocus: toggle }, h('div', { className: 'cfzn-factory-library-search' },
        h('div', { className: 'cfzn-factory-field-row cfzn-factory-library-search-bar' },
          h('label', { className: 'cfzn-factory-field' }, h('span', { className: 'cfzn-factory-sr-only' }, '搜索 Arduino 库'),
            h('input', { type: 'search', ref: field, value: query, maxLength: 100, disabled: pending,
              placeholder: '例如 SD、Servo、Ethernet…',
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => { setQuery(event.currentTarget.value); resetSearch(); },
              onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void runSearch();
                }
              } })),
          h('button', { type: 'button', className: 'cfzn-factory-dialog-button cfzn-factory-dialog-primary', disabled: pending || !query.trim() || search.status === 'loading',
            onClick: () => void runSearch() }, '搜索')),
        search.status === 'idle' && h('p', { className: 'cfzn-factory-library-prompt' }, '输入关键词后点击搜索，可在下拉框中选择版本。'),
        search.status === 'loading' && h('p', { className: 'cfzn-factory-hint', role: 'status' }, '正在搜索 Arduino 库…'),
        search.status === 'error' && h('div', { className: 'cfzn-factory-library-search' },
          h('p', { className: 'cfzn-factory-inline-error', role: 'alert' }, search.message),
          h('button', { type: 'button', className: 'cfzn-factory-button', disabled: pending, onClick: () => void runSearch() }, '重试搜索')),
        search.status === 'ready' && (search.items.length
          ? h('ul', { className: 'cfzn-factory-library-results', 'aria-label': 'Arduino 库搜索结果' },
            search.items.map(item => {
              const installed = libraries.find(library => catalogKey(library.name) === catalogKey(item.name));
              return h(SearchResult, { key: item.name, item, disabled: pending || (libraries.length >= 24 && !installed), onAdd: addLibrary, installed });
            }))
          : h('p', { className: 'cfzn-factory-library-prompt', role: 'status' }, '没有匹配的 Arduino 库。')))),
      !readOnly && libraries.length >= 24 && h('p', { className: 'cfzn-factory-hint' }, '已选满 24 个库。移除一个库后可以添加。'),
      libraries.length
        ? h('ul', { className: 'cfzn-factory-library-list', 'aria-label': '已选 Arduino 库' },
          libraries.map((library, index) => h('li', { key: library.name },
            h('span', null, library.name, ' ', h('code', null, library.version)),
            !readOnly && h('button', { type: 'button', className: 'cfzn-factory-button cfzn-factory-danger', disabled: pending,
              'aria-label': '移除 Arduino 库 ' + library.name,
              onClick: () => {
                onChange(libraries.filter((_, position) => index !== position));
                (open ? field.current : toggle.current)?.focus();
              } }, '移除'))))
        : h('p', { className: 'cfzn-factory-hint' }, '尚未选择 Arduino 库。'));
  };
}
