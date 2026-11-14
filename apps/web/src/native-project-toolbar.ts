import type { ProjectToolbarAction, ProjectToolbarState } from './editor-protocol';
import './native-project-toolbar.css';

interface EditorView { hidden: boolean; player: boolean; disabled: boolean }
export function nativeProjectToolbar(options: {
  editorView(): EditorView;
  action(action: ProjectToolbarAction): void;
  import(): void;
}) {
  let view: ProjectToolbarState = { statusText: '正在启动…', statusKind: 'pending', documentActionsDisabled: true, drawer: null };
  const subscribers = new Set<() => void>();
  const refresh = () => subscribers.forEach(listener => listener());
  const canRequest = (action: ProjectToolbarAction | 'import') => {
    const editor = options.editorView();
    return !editor.hidden && (action === 'projects' || !view.documentActionsDisabled && !editor.disabled);
  };
  const request = (action: ProjectToolbarAction | 'import') => {
    if (!canRequest(action)) return;
    if (action === 'import') options.import();
    else queueMicrotask(() => { if (canRequest(action)) options.action(action); });
  };
  let Component: any;
  return {
    refresh,
    canRequest,
    request,
    get state() { return view; },
    update(next: ProjectToolbarState) { view = next; refresh(); },
    render(React: any) {
      if (!Component) Component = function ProjectTools() {
        const [, update] = React.useState(0);
        const projectButton = React.useRef(null);
        const previousDrawer = React.useRef(view.drawer);
        const editor = options.editorView();
        React.useEffect(() => {
          const listener = () => update((value: number) => value + 1);
          subscribers.add(listener);
          return () => { subscribers.delete(listener); };
        }, []);
        React.useLayoutEffect(() => {
          if (previousDrawer.current === 'projects' && !view.drawer && !editor.hidden) {
            projectButton.current?.focus();
          }
          previousDrawer.current = view.drawer;
        });
        const disabled = view.documentActionsDisabled || editor.disabled;
        const button = (text: string, testId: string, intent: ProjectToolbarAction | 'import') => React.createElement('button', {
          type: 'button', key: intent, className: `cfzn-project-button${intent === 'save' ? ' cfzn-project-save' : ''}`,
          'data-testid': testId,
          disabled: intent === 'projects' ? false : disabled,
          ...(intent === 'projects' ? {
            'aria-expanded': view.drawer === intent, ref: projectButton,
          } : {}),
          onFocus: (event: FocusEvent) => {
            const button = event.currentTarget as HTMLElement;
            const group = button.parentElement!;
            if (group.scrollWidth <= group.clientWidth) return;
            const left = button.getBoundingClientRect().left - group.getBoundingClientRect().left + group.scrollLeft;
            if (left < group.scrollLeft) group.scrollLeft = left;
            else if (left + button.offsetWidth > group.scrollLeft + group.clientWidth) {
              group.scrollLeft = left + button.offsetWidth - group.clientWidth;
            }
          },
          onClick: () => request(intent),
        }, text);
        return React.createElement('div', {
          className: 'cfzn-project-tools', 'data-ui': true, role: 'group', 'aria-label': '项目操作',
          hidden: editor.hidden,
        }, button('项目', 'project-list-button', 'projects'), button('新建', 'new-project', 'new'),
        button('导入', 'import-project', 'import'), button('导出', 'export-project', 'export'),
        button('保存', 'save-project', 'save'),
        React.createElement('span', { role: 'status', 'aria-live': 'polite', 'data-testid': 'project-status',
          className: 'cfzn-project-status', 'data-kind': view.statusKind }, view.statusText));
      };
      return React.createElement(Component);
    },
  };
}
