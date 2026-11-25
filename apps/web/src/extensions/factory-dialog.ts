import type * as React from 'react';
import type { FactoryReact } from './custom-module-factory-preview';
import './factory-dialog.css';

interface FactoryDialogProps {
  title: string;
  id?: string;
  size?: 'block' | 'code' | 'library';
  onClose(): void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  initialFocus?: React.RefObject<HTMLElement | null>;
  returnFocus?: React.RefObject<HTMLElement | null>;
}

const focusable = 'button, input, select, textarea, a[href], [contenteditable="true"], [tabindex]';

export function makeFactoryDialog(R: FactoryReact) {
  const h = R.createElement;
  return function FactoryDialog({ title, id = 'cfzn-factory-dialog', size = 'block', onClose, actions, children, initialFocus, returnFocus }: FactoryDialogProps) {
    const overlay = R.useRef<HTMLDivElement>(null);
    const panel = R.useRef<HTMLDivElement>(null);
    const close = R.useRef(onClose);
    const pressedBackdrop = R.useRef(false);
    close.current = onClose;

    R.useLayoutEffect(() => {
      const layer = overlay.current;
      const dialog = panel.current;
      if (!layer || !dialog) return;
      const document = layer.ownerDocument;
      const previous = returnFocus?.current ?? document.activeElement;
      const inactive: Element[] = [];
      for (let node: Element | null = layer; node?.parentElement && !node.classList.contains('cfzn-custom-factory'); node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && !sibling.hasAttribute('inert')) {
            sibling.setAttribute('inert', '');
            inactive.push(sibling);
          }
        }
      }
      (initialFocus?.current ?? dialog).focus({ preventScroll: true });

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.isComposing) return;
        const target = event.target instanceof Element ? event.target : null;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close.current();
        }
        if (event.key !== 'Tab') return;
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(element =>
          element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length &&
          getComputedStyle(element).visibility === 'visible');
        const first = items[0] ?? dialog;
        const last = items.at(-1) ?? dialog;
        if (!dialog.contains(target) || (event.shiftKey && (target === first || target === dialog)) || (!event.shiftKey && target === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      };
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('keydown', onKeyDown);
        for (const element of inactive) element.removeAttribute('inert');
        if (previous instanceof HTMLElement) {
          document.defaultView?.requestAnimationFrame(() => {
            if (previous.isConnected && !document.querySelector('.cfzn-factory-dialog-mask')) previous.focus({ preventScroll: true });
          });
        }
      };
    }, []);

    return h('div', { ref: overlay, className: 'cfzn-factory-dialog-mask',
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => { pressedBackdrop.current = event.currentTarget === event.target; },
      onClick: (event: React.MouseEvent<HTMLDivElement>) => {
        if (pressedBackdrop.current && event.currentTarget === event.target) onClose();
        pressedBackdrop.current = false;
      },
    }, h('div', {
      ref: panel, id, className: 'cfzn-factory-dialog cfzn-factory-dialog--' + size,
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-title', tabIndex: -1,
    }, h('header', { className: 'cfzn-factory-dialog-header' },
      h('h3', { id: id + '-title' }, title),
      h('button', { type: 'button', className: 'cfzn-factory-dialog-close', 'aria-label': '关闭弹窗', onClick: onClose }, '×')),
    h('div', { className: 'cfzn-factory-dialog-body' }, children),
    actions != null && h('footer', { className: 'cfzn-factory-dialog-footer' }, actions)));
  };
}
