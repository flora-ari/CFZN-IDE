import { controllerTypes, modules, supportsModule, typeNames } from './catalog';
import { removalMessage } from './removal';
import type { ExtensionAdapter } from './adapter';
import './library.css';

// Native Library owns search and modal layout; optional slots use the iframe's React 16.
export function makeLibraryRenderer(getAdapter: () => ExtensionAdapter) {
  let Component: any;
  const types: Record<string, string> = { stage: 'all', controllers: 'all', modules: 'all' };
  const loadedFilters: Record<string, boolean> = { stage: false, controllers: false, modules: false };
  return (R: any, Library: any, props: any, stageCatalog: any[], nativeDevices: boolean) => {
    Component ??= function ExtensionLibrary({ nativeProps, stageCatalog, nativeDevices }: any) {
      const adapter = getAdapter();
      const [chosenCategory, setCategory] = R.useState(nativeDevices ? 'controllers' : adapter.currentDevice() && !adapter.isRealtimeMode() ? 'modules' : 'stage');
      const category = nativeDevices ? 'controllers' : chosenCategory;
      const [supportedOnly, setSupportedOnly] = R.useState(false);
      const [stageEntries, setStageEntries] = R.useState(stageCatalog);
      const [, refresh] = R.useState(0);
      const [error, setError] = R.useState('');
      const selects = R.useRef(new Map<string, HTMLButtonElement>()), allButton = R.useRef(null);
      const deviceId = adapter.currentDevice(), busy = adapter.status.busy;
      R.useEffect(() => adapter.subscribe(() => refresh((n: number) => n + 1)), [adapter]);
      R.useEffect(() => { if (!deviceId) setSupportedOnly(false); }, [deviceId]);
      R.useEffect(() => {
        let mounted = true;
        nativeProps.vm.extensionManager.getExtensionsList([...stageCatalog]).then((data: any) => { if (mounted && data) setStageEntries(data); });
        return () => { mounted = false; };
      }, []);
      const deviceName = (id: string) => nativeProps.deviceData.find((item: any) => item.deviceId === id)?.name ?? id;
      const moduleName = (id: string) => modules.find(item => item.extensionId === id)?.name ?? id;
      const keyboardActivate = (event: any) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); event.stopPropagation(); event.currentTarget.click();
        }
      };
      const act = async (run: () => Promise<void>, focus?: string) => {
        setError('');
        try { await run(); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
        refresh((n: number) => n + 1);
        if (focus) setTimeout(() => { const button = selects.current.get(focus); if (button?.isConnected) button.focus(); else allButton.current?.focus(); }, 0);
      };
      const changeCategory = (value: string) => { setCategory(value); setError(''); };
      const button = (label: string, value: string) => R.createElement('button', { key: value, type: 'button',
        className: 'cfzn-extension-category', 'aria-pressed': category === value, onKeyDown: keyboardActivate, onClick: () => changeCategory(value) }, label);
      const isControllers = category === 'controllers';
      const complete = isControllers ? nativeProps.deviceData.filter((item: any) => item.deviceId != null && item.deviceId !== 'null' && item.hide !== true) : category === 'modules' ? modules : stageEntries;
      const typeOf = (item: any) => isControllers ? controllerTypes[item.deviceId] : item.type;
      const available = new Set(complete.map(typeOf).filter(Boolean));
      const selectedType = types[category] ?? 'all';
      const isLoaded = (item: any) => isControllers ? deviceId === item.deviceId : category === 'modules' ? adapter.loaded().includes(item.extensionId) : nativeProps.vm.extensionManager.isExtensionLoaded(item.extensionURL || item.extensionId);
      const filtered = complete.filter((item: any) => (category === 'stage' || selectedType === 'all' || typeOf(item) === selectedType) &&
        (!loadedFilters[category] || isLoaded(item)) &&
        (category !== 'modules' || !supportedOnly || !deviceId || supportsModule(item, deviceId)));
      const data = filtered.map((item: any) => {
        if (!isControllers && category !== 'modules') return { ...item, rawURL: item.iconURL || '/static/favicon.ico',
          isLoaded: isLoaded(item), disabled: busy || item.disabled };
        const kind = isControllers ? 'controller' : 'module', id = isControllers ? item.deviceId : item.extensionId, key = kind + '-' + id;
        const selected = isLoaded(item);
        const compatible = isControllers || supportsModule(item, deviceId), disabled = busy || !!item.disabled || !compatible;
        const removal = adapter.removalState({ kind, id }), reason = removalMessage(removal, item.name, moduleName);
        const compatibility = isControllers ? '' : !deviceId ? '未选择主控板' : compatible ? '兼容当前主控' : '不支持当前主控';
        const support = isControllers ? '' : '支持：' + item.supportDevice.map(deviceName).join('、');
        const descriptionId = 'cfzn-card-info-' + key;
        const select = R.createElement('button', { type: 'button', className: 'cfzn-card-select', 'aria-label': item.name,
          'aria-pressed': selected, 'aria-disabled': !!disabled, 'aria-describedby': descriptionId, disabled: busy, onKeyDown: keyboardActivate,
          ref: (node: HTMLButtonElement | null) => { if (node) selects.current.set(key, node); else selects.current.delete(key); },
          onClick: () => { if (!disabled) void act(() => isControllers ? adapter.selectController(item) : adapter.loadModule(id)); } });
        const footer = R.createElement('div', { className: 'cfzn-card-footer' },
          R.createElement('div', { className: 'cfzn-card-actions' }, R.createElement('span', { className: 'cfzn-card-state' }, selected ? isControllers ? '当前主控' : '已添加' : ''),
            selected && R.createElement('button', { type: 'button', className: 'cfzn-card-remove', 'aria-label': '移除 ' + item.name,
              disabled: !removal.allowed, title: reason || '从当前项目移除', 'aria-describedby': descriptionId, onKeyDown: keyboardActivate,
              onClick: (event: any) => { event.stopPropagation(); void act(() => isControllers ? adapter.clearController(id) : adapter.removeModule(id), key); } }, '移除')),
          R.createElement('span', { id: descriptionId, className: 'cfzn-card-info' }, selected && reason ? reason : support));
        return { ...item, featured: true, rawURL: item.iconURL, disabled, isLoaded: selected,
          cfznCard: { key, selected, select, footer, badge: compatibility && R.createElement('span', { className: 'cfzn-card-compatibility', title: support }, compatibility) } };
      });
      const clearFilters = (clearSearch: () => void) => { types[category] = 'all'; loadedFilters[category] = false; setSupportedOnly(false); refresh((n: number) => n + 1); clearSearch(); };
      const dependencies = deviceId && adapter.removalState({ kind: 'controller', id: deviceId }).reason === 'modules-loaded';
      const controls = R.createElement('div', { className: 'cfzn-extension-controls', 'data-hardware': isControllers || category === 'modules' ? 'true' : 'false' },
        R.createElement('div', { className: 'cfzn-extension-main-row' }, !nativeDevices && R.createElement('div', { className: 'cfzn-extension-categories', role: 'group', 'aria-label': '扩展分类' },
          button('舞台扩展', 'stage'), button('主控扩展', 'controllers'), button('模块扩展', 'modules')),
          R.createElement('label', { className: 'cfzn-supported-filter' }, R.createElement('input', { type: 'checkbox', checked: loadedFilters[category], onKeyDown: keyboardActivate,
            onChange: (event: any) => { loadedFilters[category] = event.target.checked; refresh((n: number) => n + 1); } }), '已加载'),
          category === 'modules' && R.createElement('label', { className: 'cfzn-supported-filter' }, R.createElement('input', { type: 'checkbox', checked: supportedOnly,
            disabled: !deviceId, onKeyDown: keyboardActivate, onChange: (event: any) => setSupportedOnly(event.target.checked) }), '支持当前主控'),
          R.createElement('span', { className: 'cfzn-extension-status' + (deviceId ? ' cfzn-current-controller' : ''), role: 'status' }, busy ? '正在' + adapter.status.label + '…' : deviceId ? '当前主控：' + deviceName(deviceId) : '未选择主控板'),
          category === 'modules' && !deviceId && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate, onClick: () => changeCategory('controllers') }, '选择主控'),
          dependencies && isControllers && !nativeDevices && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate, onClick: () => changeCategory('modules') }, '前往模块扩展'),
          nativeDevices && deviceId && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', disabled: !adapter.removalState({ kind: 'controller', id: deviceId }).allowed,
            onKeyDown: keyboardActivate, onClick: () => { void act(() => adapter.clearController(deviceId)); } }, '取消当前主控')),
        category !== 'stage' && R.createElement('div', { className: 'cfzn-extension-types', role: 'group', 'aria-label': '扩展类型' },
          ...['all', ...Object.keys(typeNames).filter(key => available.has(key))].map(key => R.createElement('button', { key, type: 'button', className: 'cfzn-extension-type',
            ref: key === 'all' ? allButton : undefined, 'aria-pressed': selectedType === key, onKeyDown: keyboardActivate, onClick: () => { types[category] = key; refresh((n: number) => n + 1); } }, typeNames[key]))),
        (error || adapter.status.error) && R.createElement('span', { className: 'cfzn-extension-error', role: 'alert' }, error || adapter.status.error),
        adapter.status.recovery && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate, onClick: () => {
          const url = URL.createObjectURL(new Blob([adapter.status.recovery!])); const link = document.createElement('a'); link.href = url; link.download = 'OpenBlock-恢复备份.ob'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } }, '下载恢复备份'));
      return R.createElement(Library, { id: nativeDevices ? 'deviceLibrary' : 'extensionLibrary', title: nativeDevices ? '选择主控' : '选择扩展',
        autoClose: false, data, filterable: true, tags: category === 'stage' ? [] : null, isUnloadble: false, categoryControls: controls,
        cfznResetKey: category, renderEmpty: (clearSearch: () => void) => R.createElement('div', { className: 'cfzn-extension-empty', role: 'status' },
          '没有符合筛选条件的扩展', R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate, onClick: () => clearFilters(clearSearch) }, '清除筛选')),
        onRequestClose: busy ? () => {} : nativeProps.onRequestClose,
        onItemSelected: (item: any) => { if (item && !item.disabled) void act(() => isControllers ? adapter.selectController(item) : category === 'modules' ? adapter.loadModule(item.extensionId) : adapter.selectStage(item)); } });
    };
    return R.createElement(Component, { nativeProps: props, stageCatalog, nativeDevices });
  };
}
