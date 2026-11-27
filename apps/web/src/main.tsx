import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bindIdeUser, resolveIdeUser } from './ide-auth';
import type { IdeUser } from './ide-auth';
import { guestEditor, ideAuthEnabled } from './ide-config';
import './style.css';

function AuthenticatedEditor() {
  const [user, setUser] = useState<IdeUser | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void resolveIdeUser().then(account => {
      if (!current) return;
      if (account) {
        bindIdeUser(account);
        setUser(account);
      } else window.location.replace('/login');
    }).catch(failure => {
      if (current) setError(failure instanceof Error ? failure.message : '账号服务暂时不可用。');
    });
    return () => { current = false; };
  }, [attempt]);

  if (user) return <App account={user} />;
  return <main className="ide-session-start editor-startup" role={error ? 'alert' : 'status'}>
    {error ? <><p>{error}</p><button type="button" className="button" onClick={() => {
      setError('');
      setAttempt(value => value + 1);
    }}>重试</button></> : <p>正在检查创客账号…</p>}
  </main>;
}

createRoot(document.getElementById('root')!).render(guestEditor ? <App guest /> : ideAuthEnabled ? <AuthenticatedEditor /> : <App />);
