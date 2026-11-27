import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { ideLogin } from './ide-auth';
import { guestEditorUrl, ideAuthEnabled, makerPortal } from './ide-config';
import './style.css';
import './ide-login.css';

function Login() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await ideLogin(String(data.get('username') ?? '').trim(), String(data.get('password') ?? ''));
      form.reset();
      window.location.replace('/');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '登录失败，请稍后重试。');
      pending.current = false;
      setBusy(false);
    }
  }

  return <main className="ide-sign-in">
    <section className="ide-sign-in-card" aria-labelledby="login-heading">
      <img className="ide-sign-in-logo" src="/branding/ccraft-logo.png" alt="CCraft" />
      <h1 id="login-heading">使用创客账号登录</h1>
      <form onSubmit={submit} aria-busy={busy}>
        <label>用户名<input name="username" autoComplete="username" required disabled={busy} /></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label>
        {error && <p className="list-error" role="alert">{error}</p>}
        <button className="button primary" type="submit" disabled={busy}>{busy ? '正在登录…' : '登录'}</button>
      </form>
      <nav className="ide-sign-in-links" aria-label="其他入口">
        <a href={makerPortal}>返回创客平台</a>
        <a href={busy ? undefined : guestEditorUrl} role="link" aria-disabled={busy || undefined}
          onClick={event => { if (pending.current) event.preventDefault(); }}>游客进入</a>
      </nav>
    </section>
  </main>;
}

if (ideAuthEnabled) createRoot(document.getElementById('root')!).render(<Login />);
else window.location.replace('/');
