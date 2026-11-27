import type { AccountToolbarState } from './editor-protocol';
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { guestProjectHint } from './ide-config';
import './native-account-toolbar.css';

interface AccountMenuProps {
  account: AccountToolbarState;
  hidden: boolean;
  verify(): void;
  leave(): void;
  login(): void;
  uploadFirmware?: () => void;
  firmwareLabel: ReactNode;
}

// The embedded editor renders this component with its own React instance.
export function accountMenu(React: Pick<typeof import('react'), 'createElement' | 'useState' | 'useRef' | 'useEffect'>) {
  const h = React.createElement;
  return function AccountMenu({ account, hidden, verify, leave, login, uploadFirmware, firmwareLabel }: AccountMenuProps) {
    const [open, setOpen] = React.useState(false);
    const host = React.useRef<HTMLDivElement>(null);
    const trigger = React.useRef<HTMLButtonElement>(null);
    const expired = !account.guest && account.session === 'expired';
    const status = expired ? '登录已失效，当前编辑仍可导出。' :
      account.session === 'changed' ? '账号已切换。可先导出当前作品，再进入新账号。' : '';

    React.useEffect(() => {
      if (hidden) setOpen(false);
    }, [hidden]);
    React.useEffect(() => {
      if (!open) return;
      const dismiss = (event: PointerEvent) => {
        if (event.target instanceof Node && !host.current?.contains(event.target)) setOpen(false);
      };
      document.addEventListener('pointerdown', dismiss, true);
      return () => document.removeEventListener('pointerdown', dismiss, true);
    }, [open]);

    const closeAndFocus = () => {
      setOpen(false);
      trigger.current?.focus();
    };
    const action = (label: ReactNode, onClick: () => void, disabled = false) =>
      h('button', { type: 'button', onClick, disabled }, label);

    return h('div', {
      className: 'cfzn-account-tools', ref: host, hidden, 'data-testid': 'ide-account',
      onBlur: (event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeAndFocus(); }
      },
    }, h('button', {
      type: 'button', className: 'cfzn-account-trigger', ref: trigger, 'aria-expanded': open,
      'aria-controls': 'cfzn-account-actions', 'aria-label': account.guest ? account.name : `创客账号：${account.name}${status ? `，${status}` : ''}`,
      title: account.name, onClick: () => setOpen(value => !value),
    }, status && h('i', { className: 'cfzn-account-status-dot', 'aria-hidden': true }),
    h('span', { className: 'cfzn-account-name' }, account.name), h('i', { className: 'cfzn-account-caret', 'aria-hidden': true })),
    h('div', { id: 'cfzn-account-actions', className: 'cfzn-account-actions', hidden: !open },
      status && h('p', { role: 'status' }, status),
      account.guest && h('p', null, guestProjectHint),
      expired && h('a', { href: '/login', target: '_blank', rel: 'noopener noreferrer' }, '重新登录'),
      expired && action(account.checking ? '正在验证…' : '验证会话', verify, account.checking),
      uploadFirmware && action(firmwareLabel, () => { closeAndFocus(); uploadFirmware(); }),
      account.guest ? action('登录创客账号', () => { closeAndFocus(); login(); }, account.busy) :
        action(account.session === 'changed' ? '进入新账号' : '退出登录', leave, account.busy),
    ));
  };
}
