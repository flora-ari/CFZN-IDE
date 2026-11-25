import type { FactoryReact } from './custom-module-factory-preview';

interface CodeField {
  label: string;
  value: string;
  readOnly?: boolean;
  height?: number;
  theme?: 'vs' | 'vs-dark';
  onChange?(value: string): void;
  onInsertReady?(insert: (text: string) => void): void;
}

export function makeFactoryCodeEditor(R: FactoryReact, NativeEditor: any) {
  return function FactoryCodeEditor({ label, value, readOnly = false, height = 180, theme = 'vs', onChange, onInsertReady }: CodeField) {
    const restoreTheme = R.useRef<(() => void) | null>(null);
    R.useLayoutEffect(() => () => restoreTheme.current?.(), []);
    return R.createElement('div', { className: 'cfzn-factory-monaco', 'data-factory-code': label },
      R.createElement('div', { className: 'cfzn-factory-code-label' }, label),
      R.createElement(NativeEditor, {
        language: 'cpp', value, height, width: '100%', theme,
        options: {
          ariaLabel: label, readOnly, automaticLayout: true, tabSize: 2,
          scrollBeyondLastLine: false, minimap: { enabled: false }, contextmenu: true,
          fontSize: 13,
        },
        editorWillMount: (monaco: { editor: { setTheme(name: string): void } }) => {
          // Standalone Monaco shares its theme with the upload editor behind the factory.
          const existing = document.querySelector('.cfzn-native-monaco .monaco-editor');
          const previous = ['readOnlyTheme', 'vs-dark', 'hc-black', 'vs'].find(name => existing?.classList.contains(name));
          if (previous) restoreTheme.current = () => monaco.editor.setTheme(previous);
        },
        editorDidMount: (editor: any) => onInsertReady?.(text => {
          if (editor.getRawOptions?.().readOnly || !editor.getModel()) return;
          const selection = editor.getSelection();
          if (!selection) return;
          editor.pushUndoStop();
          editor.executeEdits('cfzn-factory', [{ range: selection, text, forceMoveMarkers: true }]);
          editor.pushUndoStop();
          editor.focus();
        }),
        onChange: (next: string) => { if (!readOnly && next !== value) onChange?.(next); },
      }));
  };
}
