import { supportsModule, typeNames, type ControllerOption, type LibraryMode } from './catalog';
import { factoryErrorMessage, makeCustomModuleFactory, type FactoryDirectory } from './custom-module-factory';
import { libraryLabel, matchesLibraryKeyword } from './library-keyword';
import { removalMessage } from './removal';
import type { ExtensionAdapter } from './adapter';
import type { HardwareController } from '../hardware-controller';
import { boardSelectionHint, renderBoardToolchain } from '../board-toolchain-card';
import './library.css';

type Category = 'controllers' | 'modules' | 'stage';
const defaultFilters = { type: 'all', loadedOnly: false, currentModeOnly: false };
const moduleGroups = [
  { id: 'loaded', label: '已加载' },
  { id: 'available', label: '可添加' },
  { id: 'unavailable', label: '暂不可用' },
] as const;

// Native Library owns search and modal layout; optional slots use the iframe's React 16.
export function makeLibraryRenderer(getAdapter: () => ExtensionAdapter, getHardware: () => HardwareController | undefined = () => undefined) {
  let Component: any;
  let Factory: ReturnType<typeof makeCustomModuleFactory>;
  const filters: Record<Category, typeof defaultFilters> = {
    controllers: { ...defaultFilters }, modules: { ...defaultFilters }, stage: { ...defaultFilters },
  };
  return (R: any, Library: any, props: any, stageCatalog: any[], nativeDevices: boolean, CodeEditor: any) => {
    Factory ??= makeCustomModuleFactory(R, CodeEditor);
    Component ??= function ExtensionLibrary({ nativeProps, stageCatalog, nativeDevices }: any) {
      const adapter = getAdapter();
      const hardware = getHardware();
      const [chosenCategory, setCategory] = R.useState('controllers');
      const category: Category = nativeDevices ? 'controllers' : chosenCategory;
      const filter = filters[category];
      const [showAllModules, setShowAllModules] = R.useState(false);
      const [stageEntries, setStageEntries] = R.useState(stageCatalog);
      const [, refresh] = R.useState(0);
      const [error, setError] = R.useState('');
      const [cardFeedback, setCardFeedback] = R.useState({ deviceId: '', message: '' });
      const [factoryOpen, setFactoryOpen] = R.useState(false);
      const [directory, setDirectory]: [FactoryDirectory, (state: FactoryDirectory) => void] =
        R.useState({ status: 'loading', items: [], error: '' });
      const factoryButton = R.useRef(null) as { current: HTMLButtonElement | null };
      const factoryBack = R.useRef(null) as { current: null | (() => void) };
      const restoreFactoryFocus = R.useRef(false);
      const directoryRequest = R.useRef(0);
      const selects = R.useRef(new Map<string, HTMLButtonElement>());
      const controlsRef = R.useRef(null) as { current: HTMLDivElement | null };
      const mounted = R.useRef(true);
      const committed = R.useRef(null);
      // While the adapter is rebuilding the runtime, keep displaying its last committed selection.
      if (!committed.current || !adapter.suppressChanges) {
        committed.current = { deviceId: adapter.currentDevice(), loadedIds: [...adapter.loaded()], realtime: adapter.isRealtimeMode() };
      }
      const { deviceId, loadedIds, realtime } = committed.current;
      const busy = adapter.status.busy;
      const mode: LibraryMode = realtime ? 'realtime' : 'upload';
      const isControllers = category === 'controllers', isModules = category === 'modules';
      const modules = adapter.moduleCatalog();
      const rerender = () => refresh((n: number) => n + 1);
      const refreshDirectory = async () => {
        const request = ++directoryRequest.current;
        setDirectory({ status: 'loading', items: [], error: '' });
        try {
          const items = await adapter.reloadCustomModules();
          if (directoryRequest.current === request) setDirectory({ status: 'ready', items, error: '' });
          return items;
        } catch (error) {
          if (directoryRequest.current === request) setDirectory({ status: 'error', items: [], error: factoryErrorMessage(error) });
          throw error;
        }
      };
      R.useEffect(() => adapter.subscribe(rerender), [adapter]);
      R.useEffect(() => {
        const stop = hardware?.subscribe(rerender);
        // A fresh library mount rehydrates existing tasks; it never submits a download.
        if (hardware) void hardware.refresh();
        return stop;
      }, [hardware]);
      R.useEffect(() => { mounted.current = true; return () => { mounted.current = false; directoryRequest.current++; }; }, []);
      R.useEffect(() => {
        if (isModules) void refreshDirectory().catch(() => {});
      }, [adapter, isModules]);
      R.useEffect(() => {
        if (factoryOpen) void refreshDirectory().catch(() => {});
      }, [adapter, factoryOpen]);
      R.useLayoutEffect(() => {
        if (!factoryOpen && restoreFactoryFocus.current) {
          restoreFactoryFocus.current = false;
          factoryButton.current?.focus({ preventScroll: true });
        }
      }, [factoryOpen]);
      R.useEffect(() => {
        let mounted = true;
        nativeProps.vm.extensionManager.getExtensionsList([...stageCatalog]).then((data: any) => { if (mounted && data) setStageEntries(data); });
        return () => { mounted = false; };
      }, []);
      const nameOf = (item: any, id: string) => libraryLabel(item?.name, nativeProps.intl.formatMessage) || id;
      const controllerRows = nativeProps.deviceData.filter((item: any) =>
        item.deviceId != null && item.deviceId !== 'null' && item.hide !== true);
      const controllerOptions: ControllerOption[] = controllerRows.map((item: any) => ({
        deviceId: item.deviceId, name: nameOf(item, item.deviceId),
      }));
      const deviceName = (id: string) => nameOf(nativeProps.deviceData.find((item: any) => item.deviceId === id), id);
      const moduleName = (id: string) => modules.find(item => item.extensionId === id)?.name ?? id;
      const keyboardActivate = (event: any) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); event.stopPropagation(); event.currentTarget.click();
        }
      };
      const restoreFocus = (previous: Element | null, cardKey?: string, nextCategory = category) => {
        setTimeout(() => {
          const controls = controlsRef.current;
          const active = document.activeElement;
          if (controls?.dataset.category !== nextCategory || (active !== document.body && active !== previous)) return;
          const target = (cardKey && selects.current.get(cardKey)) ||
            (nextCategory !== category && controls.querySelector<HTMLButtonElement>('[data-library-category][aria-pressed="true"]')) ||
            controls.querySelector<HTMLElement>('[data-library-type="all"]') ||
            controls.querySelector<HTMLElement>('.cfzn-loaded-filter input');
          target?.focus();
        }, 0);
      };
      const act = async (run: () => Promise<void>, focus?: string) => {
        const previous = document.activeElement;
        setError('');
        try { await run(); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
        rerender();
        if (focus) restoreFocus(previous, focus);
      };
      const changeCategory = (value: Category, fromShortcut = false) => {
        const previous = document.activeElement;
        setCategory(value);
        setError('');
        if (fromShortcut) restoreFocus(previous, undefined, value);
      };
      const button = (label: string, value: Category) => R.createElement('button', { key: value, type: 'button',
        className: 'cfzn-extension-category', 'data-library-category': value, 'aria-pressed': category === value, onKeyDown: keyboardActivate, onClick: () => changeCategory(value) }, label);
      const complete = isControllers ? controllerRows : isModules ? modules : stageEntries;
      const available = new Set<string>(modules.map(item => item.type));
      const selectedType = isModules && available.has(filter.type) ? filter.type : 'all';
      const isLoaded = (item: any) => isControllers ? deviceId === item.deviceId : isModules ? loadedIds.includes(item.extensionId) : nativeProps.vm.extensionManager.isExtensionLoaded(item.extensionURL || item.extensionId);
      const typed = isModules ? complete.filter((item: any) => selectedType === 'all' || item.type === selectedType) : complete;
      const compatibleEntries = isModules && !showAllModules ? typed.filter((item: any) => supportsModule(item, deviceId)) : typed;
      const modeEntries = filter.currentModeOnly ? compatibleEntries.filter((item: any) => {
        const modes = isControllers ? item.programMode : item.blockModes;
        return Array.isArray(modes) && modes.includes(mode);
      }) : compatibleEntries;
      const filtered = filter.loadedOnly ? modeEntries.filter(isLoaded) : modeEntries;
      const data = filtered.map((item: any) => {
        if (category === 'stage') return { ...item, rawURL: item.iconURL || '/branding/ccraft-icon.svg',
          isLoaded: isLoaded(item), disabled: busy || item.disabled };
        const kind = isControllers ? 'controller' : 'module', id = isControllers ? item.deviceId : item.extensionId, key = kind + '-' + id;
        const name = nameOf(item, id);
        const selected = isLoaded(item);
        const compatible = isControllers || supportsModule(item, deviceId);
        const canAdd = compatible && !item.disabled, disabled = busy || !canAdd;
        const removal = selected ? adapter.removalState({ kind, id }) : null;
        const reason = removal ? removalMessage(removal, name, moduleName) : '';
        const compatibility = isControllers ? '' : !deviceId ? '未选择主控板' : compatible ? '兼容当前主控' : '不支持当前主控';
        const support = isControllers ? '' : '支持：' + item.supportDevice.map(deviceName).join('、');
        const usage = isModules && item.blockModes.includes('upload') && !item.blockModes.includes('realtime') ? '积木仅上传模式' : '';
        const descriptionId = 'cfzn-card-info-' + key;
        const preparation = isControllers && hardware ? renderBoardToolchain(R, hardware, id, name,
          message => { if (mounted.current) setCardFeedback({ deviceId: id, message }); },
          cardFeedback.deviceId === id ? cardFeedback.message : '') : null;
        const select = R.createElement('button', { type: 'button', className: 'cfzn-card-select', 'aria-label': name,
          'aria-pressed': selected, 'aria-disabled': !!disabled, 'aria-describedby': descriptionId, disabled: busy, onKeyDown: keyboardActivate,
          ref: (node: HTMLButtonElement | null) => { if (node) selects.current.set(key, node); else selects.current.delete(key); },
          onClick: () => {
            if (disabled) return;
            const hint = isControllers && hardware ? boardSelectionHint(hardware, id) : '';
            if (hint) {
              setCardFeedback({ deviceId: id, message: hint });
              return;
            }
            setCardFeedback({ deviceId: '', message: '' });
            void act(() => isControllers ? adapter.selectController(item) : adapter.loadModule(id), key);
          } });
        const footer = isControllers ? null : R.createElement('div', { className: 'cfzn-card-footer' },
          R.createElement('div', { className: 'cfzn-card-actions' }, R.createElement('span', { className: 'cfzn-card-state' }, selected ? isControllers ? '当前主控' : '已添加' : ''),
            removal && R.createElement('button', { type: 'button', className: 'cfzn-card-remove', 'aria-label': '移除 ' + name,
              disabled: busy || !removal.allowed, title: reason || '从当前项目移除', 'aria-describedby': descriptionId, onKeyDown: keyboardActivate,
              onClick: (event: any) => { event.stopPropagation(); void act(() => isControllers ? adapter.clearController(id) : adapter.removeModule(id), key); } }, '移除')),
          R.createElement('div', { id: descriptionId, className: 'cfzn-card-info' },
            usage && R.createElement('div', null, usage), support && R.createElement('div', null, support), reason && R.createElement('div', null, reason)));
        return { ...item, featured: true, rawURL: item.iconURL, disabled, isLoaded: selected,
          cfznGroup: selected ? 'loaded' : canAdd ? 'available' : 'unavailable',
          cfznCard: { key, selected, select, footer, badge: preparation?.decoration || (compatibility && R.createElement('span', { className: 'cfzn-card-compatibility', title: support }, compatibility)) } };
      });
      const clearFilters = (clearSearch: () => void) => {
        const previous = document.activeElement;
        Object.assign(filter, defaultFilters);
        if (isModules) setShowAllModules(false);
        rerender();
        clearSearch();
        restoreFocus(previous);
      };
      const renderGroups = (items: any[], renderCard: (item: any, index: number) => any) => moduleGroups.flatMap(({ id, label }) => {
        const cards = items.flatMap((item, index) => item.cfznGroup === id ? [renderCard(item, index)] : []);
        if (!cards.length) return [];
        const heading = 'cfzn-module-group-' + id;
        return [R.createElement('section', { key: id, className: 'cfzn-module-group', 'data-cfzn-module-group': id, 'aria-labelledby': heading },
          R.createElement('h2', { id: heading }, label), R.createElement('div', { className: 'cfzn-module-grid' }, cards))];
      });
      const renderControllers = (items: any[], renderCard: (item: any, index: number) => any) =>
        R.createElement('div', { className: 'cfzn-controller-grid' }, ...items.map(renderCard));
      let emptyMessage = '没有符合筛选条件的扩展';
      if (isModules && !showAllModules && !deviceId) emptyMessage = '请先选择主控板，或勾选“显示全部模块”浏览目录。';
      else if (isModules && !showAllModules && !compatibleEntries.length) emptyMessage = '当前分类没有兼容此主控的模块，可勾选“显示全部模块”查看。';
      else if (filter.currentModeOnly && compatibleEntries.length && !modeEntries.length) emptyMessage =
        '当前分类在' + (realtime ? '编程模式' : '上传模式') + '下没有可用' + (isModules ? '模块。' : '主控。');

      const checkbox = (label: string, checked: boolean, onChange: (checked: boolean) => void, className = '') =>
        R.createElement('label', { className: 'cfzn-supported-filter ' + className },
          R.createElement('input', { type: 'checkbox', checked, onKeyDown: keyboardActivate, onChange: (event: any) => onChange(event.target.checked) }), label);
      const dependencies = deviceId && adapter.removalState({ kind: 'controller', id: deviceId }).reason === 'modules-loaded';
      const controls = R.createElement('div', { ref: controlsRef, className: 'cfzn-extension-controls', 'data-category': category, 'data-hardware': category !== 'stage' },
        R.createElement('div', { className: 'cfzn-extension-main-row' }, !nativeDevices && R.createElement('div', { className: 'cfzn-extension-categories', role: 'group', 'aria-label': '扩展分类' },
          button('主控扩展', 'controllers'), button('模块扩展', 'modules'), button('舞台扩展', 'stage')),
          checkbox('已加载', filter.loadedOnly, value => { filter.loadedOnly = value; rerender(); }, 'cfzn-loaded-filter'),
          category !== 'stage' && checkbox('仅当前模式', filter.currentModeOnly, value => { filter.currentModeOnly = value; rerender(); }),
          isModules && checkbox('显示全部模块', showAllModules, setShowAllModules),
          R.createElement('span', { className: 'cfzn-extension-status' + (deviceId ? ' cfzn-current-controller' : ''), role: 'status' }, busy ? '正在' + adapter.status.label + '…' : deviceId ? '当前主控：' + deviceName(deviceId) : '未选择主控板'),
          isModules && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', ref: factoryButton, disabled: busy,
            onKeyDown: keyboardActivate, onClick: () => setFactoryOpen(true) }, '自定义模块扩展'),
          isModules && !deviceId && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate, onClick: () => changeCategory('controllers', true) }, '选择主控'),
          dependencies && isControllers && !nativeDevices && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate, onClick: () => changeCategory('modules', true) }, '前往模块扩展'),
          isControllers && deviceId && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', disabled: busy || !adapter.removalState({ kind: 'controller', id: deviceId }).allowed,
            onKeyDown: keyboardActivate, onClick: () => { void act(() => adapter.clearController(deviceId), 'controller-' + deviceId); } }, '取消当前主控')),
        isModules && R.createElement('div', { className: 'cfzn-extension-types', role: 'group', 'aria-label': '扩展类型' },
          ...['all', ...Object.keys(typeNames).filter(key => available.has(key))].map(key => R.createElement('button', { key, type: 'button', className: 'cfzn-extension-type',
            'data-library-type': key, 'aria-pressed': selectedType === key, onKeyDown: keyboardActivate, onClick: () => { filter.type = key; rerender(); } }, typeNames[key]))),
        (error || adapter.status.error) && R.createElement('span', { className: 'cfzn-extension-error', role: 'alert' }, error || adapter.status.error),
        isModules && !factoryOpen && directory.status === 'error' && R.createElement('div', { className: 'cfzn-extension-main-row' },
          R.createElement('span', { className: 'cfzn-extension-error', role: 'alert' }, directory.error),
          R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate,
            onClick: () => void refreshDirectory().catch(() => {}) }, '重新读取私有模块')),
        adapter.status.recovery && R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate, onClick: () => {
          const url = URL.createObjectURL(new Blob([adapter.status.recovery!])); const link = document.createElement('a'); link.href = url; link.download = 'CCraft-恢复备份.ob'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } }, '下载恢复备份'));
      const factory = factoryOpen && R.createElement(Factory, {
        directory, refreshDirectory, currentDevice: deviceId, loadedIds, busy, Blockly: adapter.blocks, deviceName, controllerOptions, backRef: factoryBack,
        addToProject: (id: string) => adapter.loadModule(id),
        onExit: () => { restoreFactoryFocus.current = true; setFactoryOpen(false); },
      });
      return R.createElement(Library, { id: nativeDevices ? 'deviceLibrary' : 'extensionLibrary', title: nativeDevices ? '选择主控' : '选择扩展',
        autoClose: false, data, filterable: true, tags: category === 'stage' ? [] : null, isUnloadble: false,
        categoryControls: R.createElement(R.Fragment, null, controls, factory),
        cfznResetKey: category + ':' + selectedType,
        cfznMatchesKeyword: category === 'stage' ? undefined : matchesLibraryKeyword,
        cfznRenderGroups: isModules ? renderGroups : isControllers ? renderControllers : undefined,
        renderEmpty: (clearSearch: () => void, query: string) => R.createElement('div', { className: 'cfzn-extension-empty' },
          R.createElement('span', { role: 'status' }, emptyMessage),
          (query || selectedType !== 'all' || filter.loadedOnly || filter.currentModeOnly || (isModules && showAllModules)) &&
            R.createElement('button', { type: 'button', className: 'cfzn-extension-action', onKeyDown: keyboardActivate, onClick: () => clearFilters(clearSearch) }, '清除筛选')),
        onRequestClose: factoryOpen ? () => factoryBack.current?.() : busy ? () => {} : nativeProps.onRequestClose,
        onItemSelected: (item: any) => { if (category === 'stage' && item && !item.disabled) void act(() => adapter.selectStage(item)); } });
    };
    return R.createElement(Component, { nativeProps: props, stageCatalog, nativeDevices });
  };
}
