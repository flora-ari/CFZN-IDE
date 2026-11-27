import { createRoot } from 'react-dom/client';
import { exchangeIdeTicket } from './ide-auth';
import { ideAuthEnabled, makerPortal } from './ide-config';
import './style.css';
import './ide-login.css';

const tickets = new URLSearchParams(window.location.search).getAll('ticket');
window.history.replaceState(null, '', window.location.pathname);
const root = createRoot(document.getElementById('root')!);

function render(message: string, failed = false) {
  root.render(<main className="ide-sign-in">
    <section className="ide-sign-in-card" aria-labelledby="sso-heading">
      <img className="ide-sign-in-logo" src="/branding/ccraft-logo.png" alt="CCraft" />
      <h1 id="sso-heading">创客平台登录</h1>
      <p role={failed ? 'alert' : 'status'}>{message}</p>
      {failed && <a href={makerPortal}>返回创客平台</a>}
    </section>
  </main>);
}

if (!ideAuthEnabled) window.location.replace('/');
else if (tickets.length === 1 && tickets[0]) {
  render('正在验证创客平台登录…');
  void exchangeIdeTicket(tickets[0]).then(() => { window.location.replace('/'); }, () => {
    render('登录链接已失效或暂时无法验证。请从创客平台重新打开 IDE。', true);
  });
} else render('缺少有效的登录链接。请从创客平台重新打开 IDE。', true);
