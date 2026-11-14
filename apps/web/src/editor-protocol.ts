export const PROTOCOL = 'cfzn.openblock';
export const VERSION = 1;
export const ARCHIVE_MIME = 'application/x.openblock.ob';

export interface EditorSnapshot {
  title: string;
  editVersion: number;
  documentId: number;
  dirty: boolean;
  running: boolean;
}

export interface ProjectArchive {
  bytes: ArrayBuffer;
  mimeType: typeof ARCHIVE_MIME;
  title: string;
  fileName: string;
  editVersion: number;
  documentId: number;
}

export interface ProjectToolbarState {
  statusText: string;
  statusKind: 'pending' | 'dirty' | 'saved' | 'unsaved';
  documentActionsDisabled: boolean;
  drawer: 'projects' | null;
}
export type ProjectToolbarAction = 'projects' | 'new' | 'export' | 'save';
export function isProjectToolbarState(value: unknown): value is ProjectToolbarState {
  if (!value || typeof value !== 'object') return false;
  const view = value as Partial<ProjectToolbarState>;
  return typeof view.statusText === 'string' && ['pending', 'dirty', 'saved', 'unsaved'].includes(view.statusKind ?? '') &&
    typeof view.documentActionsDisabled === 'boolean' && (view.drawer === null || view.drawer === 'projects');
}
export function isProjectToolbarAction(value: unknown): value is { action: ProjectToolbarAction } {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1) return false;
  return ['projects', 'new', 'export', 'save'].includes((value as { action?: string }).action ?? '');
}
export function projectToolbarState(snapshot: EditorSnapshot | null, revision: number | null, busy: string,
  drawer: ProjectToolbarState['drawer']): ProjectToolbarState {
  return {
    statusText: busy || (!snapshot ? '正在启动…' : snapshot.dirty ? '未保存的更改' : revision !== null ? `已保存 · v${revision}` : '未保存项目'),
    statusKind: busy || !snapshot ? 'pending' : snapshot.dirty ? 'dirty' : revision !== null ? 'saved' : 'unsaved',
    documentActionsDisabled: !!busy || !snapshot,
    drawer,
  };
}

export interface EditorRequests {
  GET_HARDWARE_STATE: { input: undefined; result: HardwareSnapshot };
  OPEN_HARDWARE_CONNECT: { input: undefined; result: HardwareSnapshot };
  DISCONNECT_HARDWARE: { input: undefined; result: HardwareSnapshot };
  HARDWARE_COMPILE: { input: { profileId?: string }; result: HardwareSnapshot };
  HARDWARE_UPLOAD: { input: { profileId?: string; portId?: string }; result: HardwareSnapshot };
  HARDWARE_CANCEL: { input: undefined; result: HardwareSnapshot };
  GET_STATE: { input: undefined; result: EditorSnapshot };
  NEW_PROJECT: { input: undefined; result: EditorSnapshot };
  LOAD_PROJECT: { input: { bytes: ArrayBuffer; title: string; dirty?: boolean }; result: EditorSnapshot };
  EXPORT_PROJECT: { input: undefined; result: ProjectArchive };
  SET_TITLE: { input: { title: string; persisted?: boolean }; result: EditorSnapshot };
  MARK_SAVED: { input: { documentId: number; editVersion: number }; result: EditorSnapshot };
  GET_PROJECT_JSON: { input: undefined; result: { json: string } };
  RUN: { input: undefined; result: EditorSnapshot };
  STOP: { input: undefined; result: EditorSnapshot };
}

export interface Envelope {
  protocol: typeof PROTOCOL;
  version: typeof VERSION;
  requestId?: string;
  type: string;
  payload?: unknown;
}

export function envelope(type: string, payload?: unknown, requestId?: string): Envelope {
  return { protocol: PROTOCOL, version: VERSION, type, payload, requestId };
}

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<Envelope>;
  return message.protocol === PROTOCOL && message.version === VERSION && typeof message.type === 'string';
}

export function archiveName(title: string) {
  return `${title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'OpenBlock'}.ob`;
}
import type { HardwareSnapshot } from './hardware-types';
