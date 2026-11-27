import { ApiError } from './api-error.ts';

export type IdeUser = { id: string; username: string; displayName: string };
type SessionState = 'active' | 'expired' | 'changed';
type Attempt = { user: IdeUser; generation: number };

const authPath = '/api/v1/ide/auth/';
let boundUser: IdeUser | undefined;
let sessionState: SessionState = 'active';
let refreshGeneration = 0;
let lookup: Promise<IdeUser | null> | undefined;
const listeners = new Set<(state: SessionState) => void>();

async function authRequest(route: string, method: 'GET' | 'POST', body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`${authPath}${route}/`, {
      method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', '无法连接账号服务，请稍后重试。', 0);
  }
  if (!response.ok) throw await ApiError.fromResponse(response, '账号服务');
  return response;
}

async function readUser(): Promise<IdeUser> {
  const body = await (await authRequest('me', 'GET')).json();
  const user = body?.user ?? body;
  if ((typeof user?.id !== 'string' && typeof user?.id !== 'number') || !String(user.id) ||
      typeof user.username !== 'string') {
    throw new ApiError('INVALID_USER', '账号服务返回了无效的账号信息。', 502);
  }
  return {
    id: String(user.id), username: user.username,
    displayName: (typeof user.display_name === 'string' && user.display_name.trim()) || user.username,
  };
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export function resolveIdeUser() {
  if (!lookup) {
    lookup = (async () => {
      try { return await readUser(); } catch (error) {
        if (!isUnauthorized(error)) throw error;
      }
      try {
        await authRequest('refresh', 'POST');
        return await readUser();
      } catch (error) {
        if (isUnauthorized(error)) return null;
        throw error;
      }
    })().finally(() => { lookup = undefined; });
  }
  return lookup;
}

function setSessionState(state: SessionState) {
  if (state === sessionState || sessionState === 'changed') return;
  sessionState = state;
  for (const listener of listeners) listener(state);
}

export function bindIdeUser(user: IdeUser) {
  boundUser = user;
  setSessionState('active');
}

export function subscribeIdeSession(listener: (state: SessionState) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function checkIdeSession() {
  if (sessionState === 'changed') return sessionState;
  const user = await resolveIdeUser();
  setSessionState(!user ? 'expired' : user.id !== boundUser?.id ? 'changed' : 'active');
  return sessionState;
}

export function markIdeAccountChanged() {
  setSessionState('changed');
}

export function ideProjectAttempt(): Attempt {
  if (sessionState === 'changed') throw new ApiError('ACCOUNT_CHANGED', '账号已切换。请导出未保存项目，再进入新账号。', 409);
  if (!boundUser || sessionState === 'expired') throw new ApiError('UNAUTHORIZED', '登录已失效，请恢复原账号后重试。', 401);
  return { user: boundUser, generation: refreshGeneration };
}

export async function recoverIdeProjectSession(attempt: Attempt) {
  if (sessionState !== 'changed' && attempt.generation === refreshGeneration) {
    const generation = refreshGeneration;
    await checkIdeSession();
    if (generation === refreshGeneration) refreshGeneration++;
  }
  ideProjectAttempt();
}

const sessionChannelName = 'ccraft-ide-session';

export function watchIdeSession(check: () => void) {
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(sessionChannelName) : null;
  channel?.addEventListener('message', check);
  window.addEventListener('focus', check);
  return () => {
    channel?.close();
    window.removeEventListener('focus', check);
  };
}

function announceSessionChange() {
  if (typeof BroadcastChannel !== 'function') return;
  const channel = new BroadcastChannel(sessionChannelName);
  channel.postMessage(null);
  channel.close();
}

export async function ideLogin(username: string, password: string) {
  await authRequest('login', 'POST', { username, password });
  announceSessionChange();
}

export async function exchangeIdeTicket(ticket: string) {
  await authRequest('exchange', 'POST', { ticket });
  announceSessionChange();
}

export async function ideLogout() {
  await authRequest('logout', 'POST');
  setSessionState('expired');
  announceSessionChange();
}
