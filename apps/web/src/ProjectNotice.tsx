import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface Notice { message: string; level: 'info' | 'error' | 'success'; conflictId?: string; duration?: number }

export function ProjectNotice({ notice, onClose, children }: { notice: Notice; onClose: (notice: Notice) => void; children?: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const clock = useRef<{ remaining: number; started: number; timer?: number }>({ remaining: 0, started: 0 });
  const duration = notice.level === 'error' || notice.conflictId ? 0 : notice.duration ?? 3000;
  function pause() {
    const current = clock.current;
    if (current.timer === undefined) return;
    window.clearTimeout(current.timer);
    current.timer = undefined;
    current.remaining = Math.max(0, current.remaining - (performance.now() - current.started));
  }
  function resume() {
    const current = clock.current;
    if (!duration || current.timer !== undefined || hovered.current || element.current?.contains(document.activeElement)) return;
    current.started = performance.now();
    current.timer = window.setTimeout(() => { current.timer = undefined; onClose(notice); }, current.remaining);
  }
  useEffect(() => {
    clock.current.remaining = duration;
    resume();
    return pause;
  }, [notice]);
  const icon = notice.level === 'success' ? 'M7 12l3 3 7-7' : notice.level === 'error' ? 'M8 8l8 8M16 8l-8 8' : 'M12 11v5M12 8h.01';
  return createPortal(<div ref={element} className={`notice ${notice.level}`} role={notice.level === 'error' ? 'alert' : 'status'} aria-atomic="true" data-testid="project-notice"
    onMouseEnter={() => { hovered.current = true; pause(); }} onMouseLeave={() => { hovered.current = false; resume(); }}
    onFocusCapture={pause} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) resume(); }}>
    <svg className="notice-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" /><path d={icon} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <div className="notice-content"><p className="notice-message">{notice.message}</p>{children}</div>
    <button type="button" className="notice-close" aria-label="关闭提示" onClick={() => onClose(notice)}>×</button>
  </div>, document.body);
}
