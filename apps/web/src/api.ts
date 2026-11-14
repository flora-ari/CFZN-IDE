import { ARCHIVE_MIME, archiveName } from './editor-protocol';

export interface Project {
  id: string;
  name: string;
  revision: number;
  format: 'openblock';
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const base = '/api/v1/projects';

async function request(path = '', init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { cache: 'no-store', ...init });
  } catch {
    throw new ApiError('NETWORK_ERROR', '无法连接项目服务。请确认本地 API 正在运行。', 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `项目服务请求失败（${response.status}）。`, response.status);
  }
  return response;
}

async function projectResponse(response: Response) {
  const body = await response.json() as { project: Project };
  return body.project;
}

const revisionHeader = ({ revision }: Project) => ({ 'If-Match': `"${revision}"` });

export const projectsApi = {
  async list() {
    return (await (await request()).json() as { items: Project[] }).items;
  },
  async get(id: string) {
    return projectResponse(await request(`/${encodeURIComponent(id)}`));
  },
  async content(project: Project) {
    return (await request(`/${encodeURIComponent(project.id)}/content`, { headers: revisionHeader(project) })).arrayBuffer();
  },
  async create(name: string, bytes: ArrayBuffer) {
    const body = new FormData();
    body.set('name', name);
    body.set('file', new Blob([bytes], { type: ARCHIVE_MIME }), archiveName(name));
    return projectResponse(await request('', { method: 'POST', body }));
  },
  async save(project: Project, bytes: ArrayBuffer) {
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
