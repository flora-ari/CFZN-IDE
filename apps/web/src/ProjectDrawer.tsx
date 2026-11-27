import { useEffect, useRef, useState } from 'react';
import type { Project } from './api';

const formatDate = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export interface ProjectBatchFeedback {
  message: string;
  issues?: string[];
}

interface ProjectDrawerProps {
  title: string;
  activeId?: string;
  account: boolean;
  ready: boolean;
  disabled: boolean;
  renameDisabled: boolean;
  busy: string;
  loading: boolean;
  error: string;
  feedback: ProjectBatchFeedback | null;
  projects: Project[];
  selected: ReadonlySet<string>;
  onSelection(ids: ReadonlySet<string>): void;
  onClose(): void;
  onRefresh(): void;
  onOpen(id: string): void;
  onRename(project?: Project): void;
  onRenameCurrent(): void;
  onRemove(project: Project): void;
  onRemoveSelected(projects: readonly Project[]): void;
  onExportSelected(projects: readonly Project[]): void;
}

function ConfirmProjectRemoval({ count, includesActive, onClose, onConfirm }: {
  count: number;
  includesActive: boolean;
  onClose(): void;
  onConfirm(): void;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = modal.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return <dialog ref={modal} className="project-confirm" aria-labelledby="project-confirm-title" aria-describedby="project-confirm-copy"
    onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h3 id="project-confirm-title">删除 {count} 个已选项目？</h3>
    <p id="project-confirm-copy">已保存的版本将被删除，且无法撤销。
      {includesActive && ' 当前编辑器的内容会保留为未保存项目。'}</p>
    <div className="project-confirm-actions">
      <button type="button" className="button" autoFocus onClick={onClose}>取消</button>
      <button type="button" className="button project-confirm-delete" onClick={onConfirm}>确认删除</button>
    </div>
  </dialog>;
}

export function ProjectDrawer({ title, activeId, account, ready, disabled, renameDisabled, busy, loading, error,
  feedback, projects, selected, onSelection, onClose, onRefresh, onOpen, onRename, onRenameCurrent, onRemove,
  onRemoveSelected, onExportSelected }: ProjectDrawerProps) {
  const selectAll = useRef<HTMLInputElement>(null);
  const [pendingRemoval, setPendingRemoval] = useState<readonly Project[] | null>(null);
  const selection = projects.filter(project => selected.has(project.id));
  const allSelected = projects.length > 0 && selection.length === projects.length;
  const partiallySelected = selection.length > 0 && !allSelected;
  const selectionDisabled = disabled || loading;
  const bulkDisabled = selectionDisabled || selection.length === 0;

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  function toggleProject(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelection(next);
  }

  return <aside className="drawer" aria-labelledby="project-drawer-title" data-testid="project-panel" aria-busy={loading}>
    <div className="drawer-header">
      <h2 id="project-drawer-title">我的项目</h2>
      <button type="button" className="icon-button" aria-label="关闭项目列表" onClick={onClose}>×</button>
    </div>
    <div className="current-project-row">
      <div><span>当前项目</span><strong>{title}</strong></div>
      <button type="button" className="button" disabled={renameDisabled} onClick={onRenameCurrent}>重命名当前项目</button>
    </div>
    <div className="projects-heading">
      <div><h3>已保存项目</h3><p className="drawer-copy">{account ? '当前创客账号' : '本机项目'}</p></div>
      <button type="button" className="button quiet" disabled={loading || !ready || Boolean(busy)} onClick={onRefresh}>刷新列表</button>
    </div>
    <div className="project-batch-bar" role="group" aria-label="批量操作">
      <div className="project-selection">
        <label className="project-check project-select-all">
          <input type="checkbox" ref={selectAll} checked={allSelected} aria-checked={partiallySelected ? 'mixed' : allSelected}
            disabled={selectionDisabled || projects.length === 0}
            onChange={event => onSelection(new Set(event.currentTarget.checked ? projects.map(project => project.id) : []))} />
          全选
        </label>
        <span className="project-selection-count" aria-live="polite">已选 {selection.length} / {projects.length}</span>
      </div>
      <div className="project-batch-actions">
        <button type="button" className="button primary" disabled={bulkDisabled} onClick={() => onExportSelected(selection)}>导出所选</button>
        <button type="button" className="button danger" disabled={bulkDisabled} onClick={() => setPendingRemoval(selection)}>删除所选</button>
      </div>
    </div>
    {loading && <p role="status" className="drawer-copy">正在读取项目…</p>}
    {busy && <p role="status" className="drawer-copy">{busy}</p>}
    {error && <p role="alert" className="list-error">{error}</p>}
    {feedback && <div className={`project-batch-feedback${feedback.issues?.length ? ' has-issues' : ''}`}>
      <p role={feedback.issues?.length ? 'alert' : 'status'}>{feedback.message}</p>
      {feedback.issues?.length ? <ul>{feedback.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
    </div>}
    {ready && !loading && !error && !projects.length && <p className="project-empty">还没有已保存的项目。保存当前作品后即可在这里查看。</p>}
    <ul className="project-list" data-testid="project-list">
      {projects.map(project => {
        const checked = selected.has(project.id);
        const current = project.id === activeId;
        return <li className={`project-row${current ? ' current' : ''}${checked ? ' selected' : ''}`} key={project.id}
          data-testid="project-row" data-project-id={project.id}>
          <label className="project-check">
            <input type="checkbox" checked={checked} disabled={selectionDisabled} aria-label={`选择项目 ${project.name}`}
              onChange={event => toggleProject(project.id, event.currentTarget.checked)} />
          </label>
          <div className="project-row-details">
            <strong>{project.name}</strong>
            <small>{current && <span className="project-current-label">当前</span>}v{project.revision} · {formatDate.format(new Date(project.updatedAt))}</small>
          </div>
          <div className="project-actions">
            <button type="button" className="button" disabled={disabled} onClick={() => onOpen(project.id)}>打开</button>
            <button type="button" className="button" disabled={disabled} onClick={() => onRename(project)}>重命名</button>
            <button type="button" className="button danger" disabled={disabled} onClick={() => onRemove(project)}>删除</button>
          </div>
        </li>;
      })}
    </ul>
    {pendingRemoval && <ConfirmProjectRemoval count={pendingRemoval.length}
      includesActive={pendingRemoval.some(project => project.id === activeId)}
      onClose={() => setPendingRemoval(null)} onConfirm={() => { setPendingRemoval(null); onRemoveSelected(pendingRemoval); }} />}
  </aside>;
}
