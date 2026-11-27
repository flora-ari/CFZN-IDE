import { ARCHIVE_MIME, archiveName } from './editor-protocol.ts';
import { ApiError } from './api-error.ts';
import { ideProjectAttempt, markIdeAccountChanged, recoverIdeProjectSession } from './ide-auth.ts';
import { guestEditor, guestProjectHint, ideAuthEnabled, projectMaxBytes, projectTooLarge } from './ide-config.ts';
export { ApiError } from './api-error.ts';

export interface Project {
  id: string;
  name: string;
  revision: number;
  format: 'openblock';
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

type ProjectResponse = Omit<Project, 'format' | 'sizeBytes' | 'createdAt'> &
  { size?: number; sizeBytes?: number; createdAt?: string };

const base = '/api/v1/projects';

async function request(path = '', init?: RequestInit) {
  if (guestEditor) throw new ApiError('GUEST_MODE', guestProjectHint, 403);
  const attempt = ideAuthEnabled ? ideProjectAttempt() : undefined;
  const write = init?.method !== undefined && init.method !== 'GET';
  const headers = new Headers(init?.headers);
  if (attempt) headers.set('X-IDE-Account-ID', encodeURIComponent(attempt.user.id));

  async function send() {
    try {
      return await fetch(`${base}${path}`, {
        cache: 'no-store', credentials: 'same-origin', redirect: 'error', ...init, headers,
      });
    } catch {
      throw new ApiError('NETWORK_ERROR', attempt ? '无法连接项目服务，请稍后重试。' : '无法连接项目服务。请确认本地 API 正在运行。', 0);
    }
  }

  let response = await send();
  if (attempt && response.status === 401) {
    await recoverIdeProjectSession(attempt);
    if (write) throw new ApiError('SESSION_RECOVERED', '登录已恢复。请确认项目状态后手动重试此次操作。', 401);
    response = await send();
  }
  if (!response.ok) {
    const error = await ApiError.fromResponse(response, '项目服务');
    if (attempt && error.code === 'ACCOUNT_CHANGED') markIdeAccountChanged();
    throw error;
  }
  if (attempt) ideProjectAttempt();
  return response;
}

function normalizeProject(project: ProjectResponse): Project {
  return {
    id: project.id, name: project.name, revision: project.revision, format: 'openblock',
    sizeBytes: project.sizeBytes ?? project.size ?? 0,
    createdAt: project.createdAt ?? project.updatedAt, updatedAt: project.updatedAt,
  };
}

async function projectResponse(response: Response) {
  const body = await response.json() as { project: ProjectResponse };
  return normalizeProject(body.project);
}

const revisionHeader = ({ revision }: Project) => ({ 'If-Match': `"${revision}"` });

function assertArchiveSize(bytes: ArrayBuffer) {
  if (bytes.byteLength > projectMaxBytes) throw new ApiError('PAYLOAD_TOO_LARGE', projectTooLarge, 413);
}

export const projectsApi = {
  async list() {
    return (await (await request()).json() as { items: ProjectResponse[] }).items.map(normalizeProject);
  },
  async get(id: string) {
    return projectResponse(await request(`/${encodeURIComponent(id)}`));
  },
  async content(project: Project) {
    return (await request(`/${encodeURIComponent(project.id)}/content`, { headers: revisionHeader(project) })).arrayBuffer();
  },
  async create(name: string, bytes: ArrayBuffer) {
    assertArchiveSize(bytes);
    const body = new FormData();
    body.set('name', name);
    body.set('file', new Blob([bytes], { type: ARCHIVE_MIME }), archiveName(name));
    return projectResponse(await request('', { method: 'POST', body }));
  },
  async save(project: Project, bytes: ArrayBuffer) {
    assertArchiveSize(bytes);
    return projectResponse(await request(`/${encodeURIComponent(project.id)}/content`, {
      method: 'PUT',
      headers: { ...revisionHeader(project), 'Content-Type': ARCHIVE_MIME },
      body: bytes,
    }));
  },
  async rename(project: Project, name: string) {
    return projectResponse(await request(`/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      headers: { ...revisionHeader(project), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }));
  },
  async remove(project: Project) {
    await request(`/${encodeURIComponent(project.id)}`, { method: 'DELETE', headers: revisionHeader(project) });
  },
};
