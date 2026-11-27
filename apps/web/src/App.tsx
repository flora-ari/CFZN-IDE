import { useEffect, useRef, useState } from 'react';
import { ApiError, projectsApi } from './api';
import type { Project } from './api';
import { EditorBridge } from './editor-bridge';
import type { EditorBootState } from './editor-bridge';
import { projectToolbarState } from './editor-protocol';
import type { EditorSnapshot, ProjectToolbarAction } from './editor-protocol';
import { ProjectNotice } from './ProjectNotice';
import type { Notice } from './ProjectNotice';
import { ProjectDrawer } from './ProjectDrawer';
import type { ProjectBatchFeedback } from './ProjectDrawer';
import { installSaveShortcut } from './save-shortcut';
import { checkIdeSession, ideLogout, ideProjectAttempt, subscribeIdeSession, watchIdeSession } from './ide-auth';
import type { IdeUser } from './ide-auth';
import { guestProjectHint, projectMaxBytes, projectTooLarge } from './ide-config';

type ImportFile = { bytes: ArrayBuffer; name: string };
type Drawer = 'projects' | null;
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function App({ account, guest = false }: { account?: IdeUser; guest?: boolean } = {}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<EditorBridge | null>(null);
  const workspace = useRef<HTMLElement>(null);
  const snapshotRef = useRef<EditorSnapshot | null>(null);
  const activeRef = useRef<Project | null>(null);
  const busyRef = useRef(false);
  const listEpoch = useRef(0);
  const importFromEditor = useRef<(file: ImportFile) => void>(() => undefined);
  const toolbarAction = useRef<(action: ProjectToolbarAction) => void>(() => undefined);
  const hasBeenReady = useRef(false);
  const allowNav = useRef(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [boot, setBoot] = useState<EditorBootState>({ phase: 'loading', message: '正在启动 CCraft 编辑器…' });
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [active, setActive] = useState<Project | null>(null);
  const [items, setItems] = useState<Project[]>([]);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [batchFeedback, setBatchFeedback] = useState<ProjectBatchFeedback | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [session, setSession] = useState<'active' | 'expired' | 'changed'>('active');
  const [checkingSession, setCheckingSession] = useState(false);

  function receive(state: EditorSnapshot) {
    if (snapshotRef.current && state.editVersion < snapshotRef.current.editVersion) return;
    snapshotRef.current = state;
    setSnapshot(state);
  }

  function select(project: Project | null) {
    activeRef.current = project;
    setActive(project);
  }

  function upsert(project: Project) {
    if (account) ideProjectAttempt();
    listEpoch.current++;
    setListLoading(false);
    setListError('');
    setItems((current) => [project, ...current.filter((entry) => entry.id !== project.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async function list() {
    if (guest) return;
    const epoch = ++listEpoch.current;
    setListLoading(true);
    setListError('');
    try {
      const projects = await projectsApi.list();
      if (epoch === listEpoch.current) {
        setItems(projects);
        const displayed = new Set(projects.map(project => project.id));
        setSelection(current => new Set([...current].filter(id => displayed.has(id))));
        const current = activeRef.current;
        if (current && !displayed.has(current.id)) select(null);
      }
    } catch (error) {
      if (epoch === listEpoch.current) setListError(error instanceof Error ? error.message : String(error));
    } finally {
      if (epoch === listEpoch.current) setListLoading(false);
    }
  }

  async function action(label: string, callback: () => Promise<void>, conflictId?: string) {
    if (busyRef.current || !bridge.current || !snapshotRef.current) return;
    busyRef.current = true;
    setBusy(label);
    try { await callback(); } catch (error) {
      const conflict = error instanceof ApiError && (error.status === 412 || error.code === 'REVISION_CONFLICT');
      const uncertain = account && error instanceof ApiError && (error.status === 0 || error.status >= 500) &&
        ['正在保存…', '正在重命名…', '正在删除…'].includes(label);
      setNotice({
        level: 'error', conflictId: conflict ? conflictId : undefined,
        message: conflict ? '这个项目已被其他窗口更新。可以重新载入最新版本，或将当前编辑另存为新项目。' :
          uncertain ? `${error.message} 此次操作的结果尚未确认，请刷新项目列表确认后再重试。` :
            error instanceof Error ? error.message : String(error),
      });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }

  async function confirmReplacement(message = '当前项目有未保存的更改。放弃更改并继续吗？') {
    const state = await bridge.current!.request('GET_STATE', undefined);
    receive(state);
    return !state.dirty || window.confirm(message);
  }

  function loginFromGuest() {
    if (!guest) return;
    return action('正在打开登录…', async () => {
      if (!await confirmReplacement('当前项目有未保存的更改。选择取消后可先使用工具栏导出。放弃更改并继续吗？')) return;
      allowNav.current = true;
      window.location.assign('/login');
    });
  }

  async function checkSessionFromToolbar() {
    if (guest || !account || session !== 'expired' || checkingSession) return;
    setCheckingSession(true);
    try { await checkIdeSession(); } catch (error) {
      setNotice({ level: 'error', message: error instanceof Error ? error.message : '无法验证登录状态。' });
    } finally { setCheckingSession(false); }
  }

  async function leaveAccount() {
    if (guest || !account || busyRef.current) return;
    busyRef.current = true;
    setBusy(session === 'changed' ? '正在切换账号…' : '正在退出…');
    try {
      const state = snapshotRef.current && await bridge.current?.request('GET_STATE', undefined);
      if (state) receive(state);
      if (state?.dirty && !window.confirm('当前项目有未保存的更改。选择取消后可先使用工具栏导出。放弃更改并继续吗？')) return;
      const currentSession = await checkIdeSession();
      if (currentSession !== 'changed') await ideLogout();
      allowNav.current = true;
      window.location.replace(currentSession === 'changed' ? '/' : '/login');
    } catch (error) {
      setNotice({ level: 'error', message: error instanceof Error ? error.message : '退出失败，请稍后重试。' });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }

  function newProject() {
    return action('正在新建…', async () => {
      if (!await confirmReplacement()) return;
      receive(await bridge.current!.request('NEW_PROJECT', undefined));
      select(null);
      setDrawer(null);
      setNotice({ level: 'success', message: '已新建项目。' });
    });
  }

  function openProject(id: string) {
    if (guest) return;
    return action('正在打开…', async () => {
      if (!await confirmReplacement()) return;
      const metadata = await projectsApi.get(id);
      const bytes = await projectsApi.content(metadata);
      if (account) ideProjectAttempt();
      receive(await bridge.current!.request('LOAD_PROJECT', { bytes, title: metadata.name }));
      if (account) ideProjectAttempt();
      select(metadata);
      upsert(metadata);
      setDrawer(null);
      setNotice({ level: 'info', message: `已打开「${metadata.name}」。` });
    }, id);
  }

  function importProject(file: ImportFile | File) {
    return action('正在导入…', async () => {
      if (!/\.(ob|sb3)$/i.test(file.name)) throw new Error('请选择 .ob 或 .sb3 项目文件。');
      if ((file instanceof File ? file.size : file.bytes.byteLength) > projectMaxBytes) throw new Error(projectTooLarge);
      if (!await confirmReplacement()) return;
      const title = file.name.replace(/\.(ob|sb3)$/i, '').trim().slice(0, 100) || '导入项目';
      const bytes = file instanceof File ? await file.arrayBuffer() : file.bytes;
      receive(await bridge.current!.request('LOAD_PROJECT', { bytes, title, dirty: true }));
      select(null);
      setDrawer(null);
      setNotice({ level: 'info', message: guest ? '项目已导入，点击导出可保存到本机。' : '项目已导入，点击保存后将加入项目列表。' });
    });
  }

  importFromEditor.current = (file) => { void importProject(file); };

  function saveProject(asNew = false) {
    if (guest || session !== 'active') return;
    const current = asNew ? null : activeRef.current;
    return action('正在保存…', async () => {
      const editor = bridge.current!;
      const archive = await editor.request('EXPORT_PROJECT', undefined);
      const title = archive.title.trim();
      if (!title || Array.from(title).length > 100) throw new Error('项目名称长度应为 1–100 个字符。');
      const keepCurrent = () => snapshotRef.current?.documentId === archive.documentId;
      let saved: Project;
      if (current) {
        saved = await projectsApi.save(current, archive.bytes);
        if (account) ideProjectAttempt();
        if (keepCurrent()) select(saved);
        if (saved.name !== title) {
          upsert(saved);
          saved = await projectsApi.rename(saved, title);
        }
      } else {
        saved = await projectsApi.create(title, archive.bytes);
      }
      upsert(saved);
      if (keepCurrent()) {
        select(saved);
        const state = await editor.request('MARK_SAVED', { documentId: archive.documentId, editVersion: archive.editVersion });
        receive(state);
        setNotice({ level: 'success', message: state.dirty ? '已保存较早版本，后续编辑仍未保存。' : `已保存「${saved.name}」。` });
      } else {
        setNotice({ level: 'success', message: `已保存「${saved.name}」，当前编辑器已切换到新项目。` });
      }
    }, current?.id);
  }

  function renameProject(project?: Project) {
    if (guest && project) return;
    const target = project && project.id === activeRef.current?.id ? activeRef.current : project;
    const title = target?.name ?? snapshotRef.current?.title ?? '';
    const answer = window.prompt('输入项目名称（1–100 个字符）', title);
    if (answer === null || answer.trim() === title) return;
    const name = answer.trim();
    return action('正在重命名…', async () => {
      if (!name || Array.from(name).length > 100) throw new Error('项目名称长度应为 1–100 个字符。');
      if (!target) {
        receive(await bridge.current!.request('SET_TITLE', { title: name }));
        setNotice({ level: 'success', message: `已重命名为「${name}」。` });
        return;
      }
      const documentId = snapshotRef.current?.documentId;
      const renamed = await projectsApi.rename(target, name);
      upsert(renamed);
      if (activeRef.current?.id === renamed.id && snapshotRef.current?.documentId === documentId) {
        select(renamed);
        receive(await bridge.current!.request('SET_TITLE', { title: name, persisted: true }));
      }
      setNotice({ level: 'success', message: `已重命名为「${name}」。` });
    }, target?.id);
  }

  function removeProject(project: Project) {
    if (guest) return;
    const target = activeRef.current?.id === project.id ? activeRef.current : project;
    if (!window.confirm(`删除「${target.name}」？这会移除${account ? '账号内' : '本地'}已保存的项目。`)) return;
    return action('正在删除…', async () => {
      await projectsApi.remove(target);
      forgetDeletedProject(target.id);
      setNotice({ level: 'success', message: `已删除「${target.name}」。` });
    }, target.id);
  }

  function forgetDeletedProject(id: string) {
    listEpoch.current++;
    setListLoading(false);
    setItems(current => current.filter(entry => entry.id !== id));
    setSelection(current => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (activeRef.current?.id === id) select(null);
  }

  function assertProjectAccount() {
    if (account && ideProjectAttempt().user.id !== account.id) {
      throw new ApiError('ACCOUNT_CHANGED', '账号已切换，请重新打开项目列表。', 409);
    }
  }

  function removeSelectedProjects(projects: readonly Project[]) {
    if (guest || session !== 'active' || listLoading || !projects.length) return;
    return action('正在删除所选项目…', async () => {
      setBatchFeedback(null);
      const issues: string[] = [];
      let attempted = 0;
      let removed = 0;
      let uncertain = 0;
      for (const project of projects) {
        try {
          assertProjectAccount();
          attempted++;
          await projectsApi.remove(project);
          forgetDeletedProject(project.id);
          removed++;
        } catch (error) {
          try { assertProjectAccount(); } catch (sessionError) {
            const message = sessionError instanceof Error ? sessionError.message : '登录状态已变化。';
            setNotice({ level: 'error', message: `批量删除已停止，已确认删除 ${removed} 个。${message}请刷新列表核对结果。` });
            return;
          }
          const unknown = error instanceof ApiError && (error.status === 0 || error.status >= 500);
          if (unknown) uncertain++;
          const reason = error instanceof Error ? error.message : String(error);
          issues.push(`「${project.name}」${unknown ? '删除结果未确认，请刷新列表后再操作。' : reason}`);
          if (unknown || (error instanceof ApiError && [401, 403].includes(error.status))) break;
        }
      }
      const unattempted = projects.length - attempted;
      const failed = issues.length - uncertain;
      const details = [`已删除 ${removed} 个项目`];
      if (failed) details.push(`${failed} 个删除失败`);
      if (uncertain) details.push(`${uncertain} 个删除结果未确认`);
      if (unattempted) details.push(`${unattempted} 个未处理`);
      setBatchFeedback({ message: `${details.join('，')}。`, issues });
    });
  }

  function exportSelectedProjects(projects: readonly Project[]) {
    if (guest || session !== 'active' || listLoading || !projects.length) return;
    return action('正在导出所选项目…', async () => {
      setBatchFeedback(null);
      try {
        const { exportSavedProjects } = await import('./project-batch-export');
        const file = await exportSavedProjects(projects, async project => {
          assertProjectAccount();
          try {
            const bytes = await projectsApi.content(project);
            assertProjectAccount();
            return bytes;
          } catch (error) {
            assertProjectAccount();
            throw new Error(`「${project.name}」${error instanceof Error ? error.message : String(error)}`);
          }
        });
        if (account) await checkIdeSession();
        assertProjectAccount();
        download(file.blob, file.name);
        setBatchFeedback({ message: `已导出 ${projects.length} 个已保存项目。` });
      } catch (error) {
        assertProjectAccount();
        setBatchFeedback({ message: '导出未完成。请核对项目列表后重试。', issues: [error instanceof Error ? error.message : String(error)] });
      }
    });
  }

  function exportProject() {
    return action('正在导出…', async () => {
      const archive = await bridge.current!.request('EXPORT_PROJECT', undefined);
      download(new Blob([archive.bytes], { type: archive.mimeType }), archive.fileName);
      setNotice({ level: 'info', message: `已导出 ${archive.fileName}。` });
    });
  }

  toolbarAction.current = (intent) => {
    if (guest && (intent === 'projects' || intent === 'save')) {
      setNotice({ level: 'info', message: guestProjectHint });
      return;
    }
    if (intent === 'login-account') void loginFromGuest();
    else if (intent === 'leave-account') void leaveAccount();
    else if (intent === 'verify-session') void checkSessionFromToolbar();
    else if (intent === 'projects') {
      setDrawer(current => current === 'projects' ? null : 'projects');
      if (drawer !== 'projects' && session === 'active') void list();
    } else if (snapshotRef.current && !busyRef.current) {
      if (intent === 'new') void newProject();
      else if (intent === 'save') void saveProject();
      else if (intent === 'export') void exportProject();
    }
  };

  function retryStartup() {
    const client = bridge.current;
    if (hasBeenReady.current || snapshotRef.current || !client?.canRetryStartup) return;
    client.dispose(); bridge.current = null;
    setBoot({ phase: 'loading', message: '正在启动 CCraft 编辑器…' });
    setStartupAttempt(attempt => attempt + 1);
  }

  useEffect(() => {
    if (!frame.current) return;
    const client = new EditorBridge(frame.current, {
      onState: receive,
      onReplace(state) { receive(state); select(null); setNotice(null); },
      onBootState: (state) => { if (state.phase === 'ready') hasBeenReady.current = true; setBoot(state); },
      onImport: (file) => importFromEditor.current(file),
      onImportError: (message) => setNotice({ level: 'error', message }),
      onToolbarAction: (intent) => toolbarAction.current(intent),
    });
    bridge.current = client;
    const warn = (event: BeforeUnloadEvent) => {
      if (snapshotRef.current?.dirty && !allowNav.current) { event.preventDefault(); event.returnValue = true; }
    };
    window.addEventListener('beforeunload', warn);
    const stopSave = installSaveShortcut(document, () => toolbarAction.current('save'),
      () => !guest && !!snapshotRef.current && !busyRef.current);
    return () => {
      stopSave();
      client.dispose();
      if (bridge.current === client) bridge.current = null;
      window.removeEventListener('beforeunload', warn);
    };
  }, [guest, startupAttempt]);

  useEffect(() => {
    if (guest || !account) return;
    const unsubscribe = subscribeIdeSession(state => {
      setSession(state);
      if (state !== 'active') {
        listEpoch.current++;
        setItems([]);
        setSelection(new Set());
        setBatchFeedback(null);
        setListLoading(false);
        setListError('');
        setDrawer(null);
      }
      if (state === 'changed') {
        select(null);
        setNotice(null);
      }
    });
    const stopWatch = watchIdeSession(() => { void checkIdeSession().catch(() => undefined); });
    return () => { stopWatch(); unsubscribe(); };
  }, [account, guest]);

  const disabled = Boolean(busy) || !snapshot;
  const cloudDisabled = guest || disabled || session !== 'active';
  const toolbarView = projectToolbarState(snapshot, active?.revision ?? null, busy, drawer);
  useEffect(() => {
    bridge.current?.setToolbarState({
      ...toolbarView,
      account: guest ? { name: '游客', session: 'active', guest: true, busy: Boolean(busy), checking: false } :
        account ? { name: account.username, session, busy: Boolean(busy), checking: checkingSession } : undefined,
    });
  }, [toolbarView.statusText, toolbarView.statusKind, toolbarView.documentActionsDisabled, drawer,
    account, guest, session, busy, checkingSession, startupAttempt]);
  useEffect(() => {
    if (drawer) workspace.current?.querySelector<HTMLElement>('.drawer:not([hidden]) button')?.focus();
  }, [drawer]);

  return (
    <div className="app" data-ide-authenticated={account ? '' : undefined}>
      {(boot.phase === 'slow' || boot.phase === 'error') && <section className={`editor-startup ${boot.phase}`} role={boot.phase === 'error' ? 'alert' : 'status'} data-testid="editor-startup-status">
        <p>{boot.message}</p>
        {boot.phase === 'error' && !snapshot && !hasBeenReady.current && <button type="button" className="button" onClick={retryStartup}>重新加载编辑器</button>}
      </section>}
      {notice && <ProjectNotice notice={notice} onClose={closing => setNotice(current => current === closing ? null : current)}>
        {notice.conflictId && <div className="notice-actions">
          <button type="button" className="button" disabled={cloudDisabled} onClick={() => { void openProject(notice.conflictId!); }}>重新载入</button>
          <button type="button" className="button" disabled={cloudDisabled} onClick={() => { void saveProject(true); }}>另存为新项目</button>
        </div>}
      </ProjectNotice>}
      <main ref={workspace} className="workspace" onKeyDown={event => { if (event.key === 'Escape' && drawer) setDrawer(null); }}>
        <iframe key={startupAttempt} ref={frame} src="/openblock.html" title="CCraft 编辑器" data-testid="openblock-frame" inert={busy === '正在打开…' || busy === '正在导入…' || busy === '正在新建…'} />
        {!guest && drawer === 'projects' && <ProjectDrawer title={snapshot?.title ?? 'CCraft作品'} activeId={active?.id}
          account={Boolean(account)} ready={session === 'active'} disabled={cloudDisabled}
          renameDisabled={active ? cloudDisabled : disabled} busy={busy} loading={listLoading}
          error={session === 'active' ? listError : '恢复登录后可查看账号项目。'} feedback={batchFeedback}
          projects={items} selected={selection} onSelection={setSelection} onClose={() => setDrawer(null)}
          onRefresh={() => { void list(); }} onOpen={id => { void openProject(id); }}
          onRename={project => { void renameProject(project); }} onRenameCurrent={() => { void renameProject(activeRef.current ?? undefined); }}
          onRemove={project => { void removeProject(project); }}
          onRemoveSelected={projects => { void removeSelectedProjects(projects); }}
          onExportSelected={projects => { void exportSelectedProjects(projects); }} />}
      </main>
    </div>
  );
}
