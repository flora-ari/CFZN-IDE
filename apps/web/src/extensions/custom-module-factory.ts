import type * as React from 'react';
import { selectableControllerIds, normalizeDeviceId, typeNames, type ControllerOption } from './catalog';
import { isStatementShape, validateCustomModuleDefinition,
  type CustomModuleBlock, type CustomModuleDefinition, type CustomModuleRecord } from './custom-module-definition';
import { makeFactoryEditor, type FactoryPanel } from './custom-module-factory-editor';
import { validateFactoryBlock, type FactoryReact } from './custom-module-factory-preview';
import { customModulesApi } from './custom-modules-api';
import './custom-module-factory.css';

export interface FactoryDirectory {
  status: 'loading' | 'ready' | 'error';
  items: CustomModuleRecord[];
  error: string;
}

export const factoryErrorMessage = (failure: unknown) => failure instanceof Error ? failure.message : String(failure);

type Screen =
  | { kind: 'list' }
  | { kind: 'detail'; item: CustomModuleRecord }
  | { kind: 'editor'; initial: CustomModuleDefinition; definition: CustomModuleDefinition; source?: CustomModuleRecord };
type Confirmation =
  | { kind: 'hide'; item: CustomModuleRecord }
  | { kind: 'discard'; back(): void }
  | { kind: 'delete'; block: CustomModuleBlock; remove(): void };

interface FactoryProps {
  directory: FactoryDirectory;
  refreshDirectory(): Promise<CustomModuleRecord[]>;
  currentDevice: string | null;
  loadedIds: string[];
  busy: boolean;
  Blockly: any;
  deviceName(id: string): string;
  controllerOptions: ControllerOption[];
  addToProject(id: string): Promise<void>;
  onExit(): void;
  backRef: { current: null | (() => void) };
}

function newDefinition(currentDevice: string | null): CustomModuleDefinition {
  const device = normalizeDeviceId(currentDevice ?? '');
  return {
    name: '', version: '1.0.0', author: '', description: '', type: 'function', schemaVersion: 1,
    supportDevice: selectableControllerIds.includes(device) ? [device] : [],
    definitions: '', setup: '', blocks: [],
  };
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
const createdAt = (stamp: string) => Number.isFinite(Date.parse(stamp)) ? dateFormat.format(new Date(stamp)) : '';

export function makeCustomModuleFactory(R: FactoryReact, NativeEditor: any) {
  const h = R.createElement;
  const Editor = makeFactoryEditor(R, NativeEditor);
  const button = (label: string, onClick: () => void, props: React.ButtonHTMLAttributes<HTMLButtonElement> = {}) =>
    h('button', { type: 'button', className: 'cfzn-factory-button', ...props, onClick }, label);
  const primary = 'cfzn-factory-button cfzn-factory-primary';
  return function CustomModuleFactory({ directory, refreshDirectory, currentDevice, loadedIds, busy, Blockly, deviceName, controllerOptions,
    addToProject, onExit, backRef }: FactoryProps) {
    const [screen, setScreen] = R.useState<Screen>({ kind: 'list' });
    const [confirmation, setConfirmation] = R.useState<Confirmation | null>(null);
    const [panel, setPanel] = R.useState<FactoryPanel | null>(null);
    const [pending, setPending] = R.useState(false);
    const [notice, setNotice] = R.useState('');
    const [error, setError] = R.useState('');
    const pendingRef = R.useRef(false);
    const heading = R.useRef<HTMLHeadingElement>(null);
    const confirmationCancel = R.useRef<HTMLButtonElement>(null);
    const priorFocus = R.useRef<HTMLElement | null>(null);
    const factoryRoot = R.useRef<HTMLElement>(null);
    const scroll = R.useRef<HTMLDivElement>(null);
    const currentBoard = normalizeDeviceId(currentDevice ?? '');

    const navigate = (next: Screen) => {
      setError('');
      setNotice('');
      setPanel(null);
      setScreen(next);
    };
    const edit = (source?: CustomModuleRecord) => {
      const initial = source ? source.definition : newDefinition(currentDevice);
      navigate({ kind: 'editor', initial, definition: initial, source });
    };
    const ask = (next: Confirmation) => {
      priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setConfirmation(next);
    };
    const cancelConfirmation = () => {
      setConfirmation(null);
      requestAnimationFrame(() => priorFocus.current?.focus());
    };
    const requestBack = () => {
      if (pendingRef.current || busy) return;
      // OpenBlock also routes Escape to the containing extension library.
      if (factoryRoot.current?.querySelector('.cfzn-factory-dialog-mask')) return;
      if (confirmation) return cancelConfirmation();
      if (panel) return setPanel(null);
      if (screen.kind === 'list') return onExit();
      const back = () => navigate(screen.kind === 'editor' && screen.source
        ? { kind: 'detail', item: screen.source } : { kind: 'list' });
      if (screen.kind === 'editor' && JSON.stringify(screen.initial) !== JSON.stringify(screen.definition)) {
        ask({ kind: 'discard', back });
      } else back();
    };
    R.useLayoutEffect(() => {
      backRef.current = requestBack;
      return () => { backRef.current = null; };
    });
    R.useLayoutEffect(() => {
      if (scroll.current) scroll.current.scrollTop = 0;
      heading.current?.focus({ preventScroll: true });
    }, [screen.kind]);
    R.useLayoutEffect(() => {
      if (confirmation) confirmationCancel.current?.focus();
    }, [confirmation]);

    const run = async (action: () => Promise<void>) => {
      if (pendingRef.current || busy) return;
      pendingRef.current = true;
      setPending(true);
      setError('');
      setNotice('');
      try {
        await action();
      } catch (error) {
        setError(factoryErrorMessage(error));
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    };
    const save = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (screen.kind !== 'editor') return;
      void run(async () => {
        const draft = screen.definition;
        let definition: CustomModuleDefinition;
        try {
          definition = validateCustomModuleDefinition(draft);
        } catch (error) {
          const seen = new Set<string>();
          for (const [index, block] of draft.blocks.entries()) {
            let kind: 'edit' | 'logic' = 'edit';
            try {
              validateFactoryBlock({ ...block, code: isStatementShape(block.shape) ? '' : '0' });
              if (seen.has(block.key)) throw new Error('同一个模块内的积木 ID 必须唯一。');
              seen.add(block.key);
              kind = 'logic';
              validateFactoryBlock(block);
            } catch (problem) {
              setPanel({ kind, index });
              throw new Error((block.key || '未命名积木') + ' · ' + factoryErrorMessage(problem));
            }
          }
          throw error;
        }
        if (directory.status !== 'ready') await refreshDirectory();
        const saved = await customModulesApi.create(definition);
        navigate({ kind: 'list' });
        setNotice('已保存 ' + saved.definition.name + ' ' + saved.definition.version + '。可在模块扩展中添加。');
        await refreshDirectory().catch(() => {});
      });
    };
    const confirm = () => {
      if (!confirmation || pendingRef.current || busy) return;
      setConfirmation(null);
      if (confirmation.kind === 'discard') {
        confirmation.back();
        return;
      }
      if (confirmation.kind === 'delete') {
        confirmation.remove();
        setError('');
        requestAnimationFrame(() => document.getElementById('cfzn-factory-block-heading')?.focus());
        return;
      }
      const { item } = confirmation;
      void run(async () => {
        await customModulesApi.hide(item.id);
        navigate({ kind: 'list' });
        setNotice('已隐藏 ' + item.definition.name + ' ' + item.definition.version + '。');
        await refreshDirectory().catch(() => {});
        heading.current?.focus({ preventScroll: true });
      });
    };
    const addButton = (item: CustomModuleRecord) => {
      if (loadedIds.includes(item.id)) return h('span', { className: 'cfzn-factory-added' }, '已添加到作品');
      if (!currentBoard) return h('span', { className: 'cfzn-factory-hint' }, '选择主控后可添加到作品。');
      if (!item.definition.supportDevice.includes(currentBoard)) return h('span', { className: 'cfzn-factory-hint' }, '当前主控不受支持。');
      return button('添加到作品', () => void run(async () => {
        await addToProject(item.id);
        setNotice('已添加 ' + item.definition.name + ' 到作品。');
      }), { disabled: pending || busy });
    };
    const list = () => {
      if (directory.status === 'loading') return h('p', { role: 'status' }, '正在读取私有模块…');
      if (directory.status === 'error') return h('div', { className: 'cfzn-factory-directory-error' },
        h('p', { role: 'alert' }, directory.error), button('重新读取', () => void refreshDirectory().catch(() => {})));
      if (!directory.items.length) return h('p', { className: 'cfzn-factory-empty' }, '还没有自定义模块。');
      return h('ul', { className: 'cfzn-factory-list', 'aria-label': '私有模块列表' },
        directory.items.map(item => h('li', { key: item.id, 'data-cfzn-custom-module-id': item.id },
          h('div', { className: 'cfzn-factory-list-summary' },
            h('h3', null, item.definition.name, h('span', null, item.definition.version)),
            h('p', { className: 'cfzn-factory-hint' },
              [typeNames[item.definition.type], item.definition.author, createdAt(item.createdAt)].filter(Boolean).join(' · ')),
            item.definition.description && h('p', null, item.definition.description),
            h('p', { className: 'cfzn-factory-hint' }, item.definition.supportDevice.map(deviceName).join('、'))),
          h('div', { className: 'cfzn-factory-actions' },
            button('查看详情', () => navigate({ kind: 'detail', item }), { disabled: pending || busy, 'aria-label': '查看详情 ' + item.definition.name }),
            button('创建新版本', () => edit(item), { disabled: pending || busy, 'aria-label': '创建新版本 ' + item.definition.name }),
            addButton(item),
            button('隐藏', () => ask({ kind: 'hide', item }), { disabled: pending || busy, 'aria-label': '隐藏 ' + item.definition.name })))));
    };
    const definition = screen.kind === 'editor' ? screen.definition : screen.kind === 'detail' ? screen.item.definition : undefined;
    const headingText = screen.kind === 'list' ? '自定义模块扩展' : screen.kind === 'detail' ? '模块详情'
      : screen.source ? '创建模块新版本' : '新建自定义模块';
    const backText = screen.kind === 'list' ? '返回扩展库' : screen.kind === 'editor' ? '取消编辑' : '返回私有模块';
    const viewAttributes = confirmation ? { inert: '' } : {};
    return h('section', { ref: factoryRoot, className: 'cfzn-custom-factory', 'aria-labelledby': 'cfzn-custom-factory-title' },
      h('div', { ...viewAttributes, className: 'cfzn-factory-view' },
        h('header', { className: 'cfzn-factory-header' }, h('div', { className: 'cfzn-factory-heading' },
          button(backText, requestBack, { disabled: pending || busy }),
          h('h2', { id: 'cfzn-custom-factory-title', ref: heading, tabIndex: -1 }, headingText)),
          h('div', { className: 'cfzn-factory-actions' },
            screen.kind === 'list' && button('新建模块', () => edit(), { disabled: pending || busy, className: primary }),
            definition && button('生成预览', () => setPanel({ kind: 'preview' }), {
              disabled: pending || busy || !Blockly || !definition.blocks.length, 'aria-haspopup': 'dialog',
            }),
            screen.kind === 'editor' && h('button', { type: 'submit', form: 'cfzn-factory-editor', className: primary, disabled: pending || busy },
              pending ? '正在保存…' : screen.source ? '保存新版本' : '保存模块'),
            screen.kind === 'detail' && button('创建新版本', () => edit(screen.item), { disabled: pending || busy, className: primary }),
            screen.kind === 'detail' && addButton(screen.item))),
        error && h('p', { className: 'cfzn-factory-error', role: 'alert' }, error),
        notice && h('p', { className: 'cfzn-factory-notice', role: 'status' }, notice),
        h('div', { className: 'cfzn-factory-scroll' + (screen.kind === 'list' ? ' cfzn-factory-directory-scroll' : ''), ref: scroll },
          screen.kind === 'list' ? list() : definition && h(Editor, {
            key: screen.kind, definition, currentDevice, deviceName, controllerOptions, Blockly, panel, setPanel, pending: pending || busy,
            moduleId: screen.kind === 'detail' ? screen.item.id : undefined,
            confirmRemoveBlock: (block, remove) => ask({ kind: 'delete', block, remove }),
            readOnly: screen.kind === 'detail', onChange: definition => {
              if (screen.kind === 'editor') setScreen({ ...screen, definition });
            },
            submit: screen.kind === 'editor' ? save : undefined,
          }))),
      confirmation && h('div', { className: 'cfzn-factory-confirmation' },
        h('div', { className: 'cfzn-factory-panel', role: 'alertdialog', 'aria-modal': 'true',
          'aria-labelledby': 'cfzn-factory-confirmation-title' },
          h('h3', { id: 'cfzn-factory-confirmation-title' }, confirmation.kind === 'discard' ? '放弃草稿？'
            : confirmation.kind === 'delete' ? '删除此积木？' : '隐藏此版本？'),
          h('p', null, confirmation.kind === 'discard' ? '离开后会丢失这次编辑。'
            : confirmation.kind === 'delete' ? '从草稿中删除 ' + (confirmation.block.key || confirmation.block.message || '未命名积木') + '。'
            : confirmation.item.definition.name + ' ' + confirmation.item.definition.version + ' 将从模块目录移除。已引用此版本的作品仍可使用。'),
          h('div', { className: 'cfzn-factory-actions' },
            h('button', { type: 'button', className: 'cfzn-factory-button', onClick: cancelConfirmation, ref: confirmationCancel },
              confirmation.kind === 'discard' ? '继续编辑' : '取消'),
            button(confirmation.kind === 'discard' ? '放弃草稿' : confirmation.kind === 'delete' ? '确认删除' : '确认隐藏', confirm,
              { className: confirmation.kind === 'delete' ? 'cfzn-factory-button cfzn-factory-danger' : primary })))));
  };
}
