export interface SaveKey { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean; repeat: boolean }
export function matchesSaveKey(event: SaveKey, platform: string) {
  return event.key.toLowerCase() === 's' && !event.altKey && !event.shiftKey && !event.isComposing &&
    (event.ctrlKey || /mac|iphone|ipad/i.test(platform) && event.metaKey);
}

// Commit blur-based native fields, then restore only if the user has not moved elsewhere.
export async function commitFocusedEdit(document: Document) {
  const element = document.activeElement as HTMLElement | null;
  if (!element || element === document.body || element.closest('.monaco-editor')) { await new Promise(resolve => setTimeout(resolve, 0)); return; }
  const input = element as HTMLInputElement;
  let selection: [number, number, string | null] | undefined;
  try { if (typeof input.selectionStart === 'number') selection = [input.selectionStart, input.selectionEnd ?? input.selectionStart, input.selectionDirection]; } catch { /* Non-text input. */ }
  let moved = false;
  const mark = (event: Event) => { if (event.target !== element && event.target !== document.body) moved = true; };
  document.addEventListener('focusin', mark, true); document.addEventListener('pointerdown', mark, true);
  element.blur();
  await new Promise(resolve => setTimeout(resolve, 0));
  document.removeEventListener('focusin', mark, true); document.removeEventListener('pointerdown', mark, true);
  if (!moved && document.hasFocus() && element.isConnected && (document.activeElement === document.body || document.activeElement === element)) {
    element.focus({ preventScroll: true });
    if (selection) try { input.setSelectionRange(selection[0], selection[1], selection[2] as any); } catch { /* Selection unsupported. */ }
  }
}
export function installSaveShortcut(document: Document, save: () => void, allowed: () => boolean) {
  let committing = false;
  const listener = (event: KeyboardEvent) => {
    if (!matchesSaveKey(event, document.defaultView?.navigator.platform ?? '')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat || committing || !allowed()) return;
    committing = true;
    void commitFocusedEdit(document).then(() => { if (allowed()) save(); }).finally(() => { committing = false; });
  };
  document.addEventListener('keydown', listener, true);
  return () => document.removeEventListener('keydown', listener, true);
}
