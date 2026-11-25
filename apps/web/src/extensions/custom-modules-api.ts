import { ApiError } from '../api';
import { parseCustomModuleRecord, type CustomModuleDefinition } from './custom-module-definition';

const base = '/api/v1/custom-modules';

async function request(path = '', init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(base + path, { cache: 'no-store', credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError('NETWORK_ERROR', '无法连接私有模块服务。请确认 IDE 项目服务正在运行。', 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? (response.status === 404 ? '当前会话无法访问该模块版本。' : '私有模块请求失败（' + response.status + '）。'),
      response.status);
  }
  return response;
}

async function list() {
  const { items } = await (await request()).json();
  if (!Array.isArray(items)) throw new Error('私有模块目录格式无效。');
  return items.map(parseCustomModuleRecord);
}

export const customModulesApi = {
  list() {
    // Serialize initial session creation across tabs at the same editor origin.
    return navigator.locks ? navigator.locks.request('cfzn-custom-modules-session', list) : list();
  },
  async get(id: string) {
    const { item } = await (await request('/' + encodeURIComponent(id))).json();
    return parseCustomModuleRecord(item);
  },
  async create(definition: CustomModuleDefinition) {
    const { item } = await (await request('', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definition }),
    })).json();
    return parseCustomModuleRecord(item);
  },
  async hide(id: string) {
    await request('/' + encodeURIComponent(id), { method: 'DELETE' });
  },
};
