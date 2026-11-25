import { useEffect, useRef, useState } from 'react';
import { ApiError, projectsApi } from './api';
import type { Project } from './api';
import { EditorBridge } from './editor-bridge';
import type { EditorBootState } from './editor-bridge';
import { projectToolbarState } from './editor-protocol';
import type { EditorSnapshot, ProjectToolbarAction } from './editor-protocol';
import { ProjectNotice } from './ProjectNotice';
import type { Notice } from './ProjectNotice';
import { installSaveShortcut } from './save-shortcut';

type ImportFile = { bytes: ArrayBuffer; name: string };
type Drawer = 'projects' | null;
const formatDate = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const maxSize = 20 * 1024 * 1024;

function download(bytes: ArrayBuffer, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function App() {
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
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [boot, setBoot] = useState<EditorBootState>({ phase: 'loading', message: '正在启动 CCraft 编辑器…' });
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [active, setActive] = useState<Project | null>(null);
  const [items, setItems] = useState<Project[]>([]);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

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
    listEpoch.current++;
    setListLoading(false);
    setListError('');
    setItems((current) => [project, ...current.filter((entry) => entry.id !== project.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async function list() {
    const epoch = ++listEpoch.current;
    setListLoading(true);
    setListError('');
    try {
      const projects = await projectsApi.list();
      if (epoch === listEpoch.current) setItems(projects);
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
      const conflict = error instanceof ApiError && error.code === 'REVISION_CONFLICT';
      setNotice({
        level: 'error', conflictId: conflict ? conflictId : undefined,
        message: conflict ? '这个项目已被其他窗口更新。可以重新载入最新版本，或将当前编辑另存为新项目。' : error instanceof Error ? error.message : String(error),
      });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }

  async function confirmReplacement() {
    const state = await bridge.current!.request('GET_STATE', undefined);
    receive(state);
    return !state.dirty || window.confirm('当前项目有未保存的更改。放弃更改并继续吗？');
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
    return action('正在打开…', async () => {
      if (!await confirmReplacement()) return;
      const metadata = await projectsApi.get(id);
      const bytes = await projectsApi.content(metadata);
      receive(await bridge.current!.request('LOAD_PROJECT', { bytes, title: metadata.name }));
      select(metadata);
      upsert(metadata);
      setDrawer(null);
      setNotice({ level: 'info', message: `已打开「${metadata.name}」。` });
    }, id);
  }

  function importProject(file: ImportFile | File) {
    return action('正在导入…', async () => {
      if (!/\.(ob|sb3)$/i.test(file.name)) throw new Error('请选择 .ob 或 .sb3 项目文件。');
      if ((file instanceof File ? file.size : file.bytes.byteLength) > maxSize) throw new Error('项目文件超过 20 MiB。');
      if (!await confirmReplacement()) return;
      const title = file.name.replace(/\.(ob|sb3)$/i, '').trim().slice(0, 100) || '导入项目';
      const bytes = file instanceof File ? await file.arrayBuffer() : file.bytes;
      receive(await bridge.current!.request('LOAD_PROJECT', { bytes, title, dirty: true }));
      select(null);
      setDrawer(null);
      setNotice({ level: 'info', message: '项目已导入，点击保存后将加入项目列表。' });
    });
  }

  importFromEditor.current = (file) => { void importProject(file); };

  function saveProject(asNew = false) {
    const current = asNew ? null : activeRef.current;
    return action('正在保存…', async () => {
      const editor = bridge.current!;
      const archive = await editor.request('EXPORT_PROJECT', undefined);
      const title = archive.title.trim();
      if (!title || title.length > 100) throw new Error('项目名称长度应为 1–100 个字符。');
      const keepCurrent = () => snapshotRef.current?.documentId === archive.documentId;
      let saved: Project;
      if (current) {
        saved = await projectsApi.save(current, archive.bytes);
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
    const target = project && project.id === activeRef.current?.id ? activeRef.current : project;
    const title = target?.name ?? snapshotRef.current?.title ?? '';
    const answer = window.prompt('输入项目名称（1–100 个字符）', title);
    if (answer === null || answer.trim() === title) return;
    const name = answer.trim();
    return action('正在重命名…', async () => {
      if (!name || name.length > 100) throw new Error('项目名称长度应为 1–100 个字符。');
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
    const target = activeRef.current?.id === project.id ? activeRef.current : project;
    if (!window.confirm(`删除「${target.name}」？这会移除本地已保存的项目。`)) return;
    return action('正在删除…', async () => {
      await projectsApi.remove(target);
      listEpoch.current++;
      setListLoading(false);
      setItems((current) => current.filter((entry) => entry.id !== target.id));
      if (activeRef.current?.id === target.id) select(null);
      setNotice({ level: 'success', message: `已删除「${target.name}」。` });
    }, target.id);
  }

  function exportProject() {
    return action('正在导出…', async () => {
      const archive = await bridge.current!.request('EXPORT_PROJECT', undefined);
      download(archive.bytes, archive.mimeType, archive.fileName);
      setNotice({ level: 'info', message: `已导出 ${archive.fileName}。` });
    });
  }

  toolbarAction.current = (intent) => {
    if (intent === 'projects') {
      setDrawer(current => current === 'projects' ? null : 'projects');
      if (drawer !== 'projects') void list();
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
      if (snapshotRef.current?.dirty) { event.preventDefault(); event.returnValue = true; }
    };
    window.addEventListener('beforeunload', warn);
    const stopSave = installSaveShortcut(document, () => toolbarAction.current('save'), () => !!snapshotRef.current && !busyRef.current);
    return () => {
      stopSave();
      client.dispose();
      if (bridge.current === client) bridge.current = null;
      window.removeEventListener('beforeunload', warn);
    };
  }, [startupAttempt]);

  const disabled = Boolean(busy) || !snapshot;
  const toolbarView = projectToolbarState(snapshot, active?.revision ?? null, busy, drawer);
  useEffect(() => { bridge.current?.setToolbarState(toolbarView); },
    [toolbarView.statusText, toolbarView.statusKind, toolbarView.documentActionsDisabled, drawer]);
  useEffect(() => {
    if (drawer) workspace.current?.querySelector<HTMLElement>('.drawer:not([hidden]) button')?.focus();
  }, [drawer]);

  return (
    <div className="app">
      {(boot.phase === 'slow' || boot.phase === 'error') && <section className={`editor-startup ${boot.phase}`} role={boot.phase === 'error' ? 'alert' : 'status'} data-testid="editor-startup-status">
        <p>{boot.message}</p>
        {boot.phase === 'error' && !snapshot && !hasBeenReady.current && <button type="button" className="button" onClick={retryStartup}>重新加载编辑器</button>}
      </section>}
      {notice && <ProjectNotice notice={notice} onClose={closing => setNotice(current => current === closing ? null : current)}>
        {notice.conflictId && <div className="notice-actions">
          <button type="button" className="button" disabled={disabled} onClick={() => { void openProject(notice.conflictId!); }}>重新载入</button>
          <button type="button" className="button" disabled={disabled} onClick={() => { void saveProject(true); }}>另存为新项目</button>
        </div>}
      </ProjectNotice>}
      <main ref={workspace} className="workspace" onKeyDown={event => { if (event.key === 'Escape' && drawer) setDrawer(null); }}>
        <iframe key={startupAttempt} ref={frame} src="/openblock.html" title="CCraft 编辑器" data-testid="openblock-frame" inert={busy === '正在打开…' || busy === '正在导入…' || busy === '正在新建…'} />
        {drawer === 'projects' && <aside className="drawer" aria-label="项目列表" data-testid="project-panel">
          <div className="drawer-header"><div><p className="eyebrow">LOCAL WORKSPACE</p><h2>我的项目</h2></div><button type="button" className="icon-button" aria-label="关闭项目列表" onClick={() => setDrawer(null)}>×</button></div>
          <div className="current-project-row"><span>当前项目：{snapshot?.title ?? 'CCraft作品'}</span><button type="button" className="button" disabled={disabled} onClick={() => { void renameProject(activeRef.current ?? undefined); }}>重命名当前项目</button></div>
          <div className="projects-heading"><p className="drawer-copy">保存的项目存储在本机。</p><button type="button" className="button quiet" disabled={listLoading} onClick={() => { void list(); }}>刷新</button></div>
          {listLoading && <p role="status" className="drawer-copy">正在读取项目…</p>}
          {listError && <p role="alert" className="list-error">{listError}</p>}
          {!listLoading && !listError && !items.length && <p className="project-empty">还没有已保存的项目。</p>}
          <ul className="project-list" data-testid="project-list">
            {items.map((project) => <li className={project.id === active?.id ? 'current' : ''} key={project.id} data-testid="project-row" data-project-id={project.id}>
              <div><strong>{project.name}</strong><small>v{project.revision} · {formatDate.format(new Date(project.updatedAt))}</small></div>
              <div className="project-actions">
                <button type="button" className="button" disabled={disabled} onClick={() => { void openProject(project.id); }}>打开</button>
                <button type="button" className="button" disabled={disabled} onClick={() => { void renameProject(project); }}>重命名</button>
                <button type="button" className="button danger" disabled={disabled} onClick={() => { void removeProject(project); }}>删除</button>
              </div>
            </li>)}
          </ul>
        </aside>}
      </main>
    </div>
  );
}
