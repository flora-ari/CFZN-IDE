import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { ApiError } from '../common/api-error';
import type { IdeConfig } from './config';

export interface MakerUser extends Record<string, unknown> {
  id: string | number;
}

export interface MakerCredentials {
  access: string;
  refresh?: string;
}

export const makerUnavailable = () => new ApiError(503, 'MAKER_UNAVAILABLE', 'The Maker account service is unavailable.');
export const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue.');
export const restricted = () => new ApiError(403, 'ACCOUNT_RESTRICTED', 'This account cannot write projects.');

function user(value: unknown): MakerUser {
  const result = value as MakerUser | undefined;
  if (!result || (typeof result.id !== 'string' && typeof result.id !== 'number') ||
      (typeof result.id === 'number' && !Number.isSafeInteger(result.id)) ||
      !String(result.id).trim() || String(result.id).length > 256) throw makerUnavailable();
  return result;
}

function credentials(value: unknown): Required<MakerCredentials> {
  const result = value as MakerCredentials | undefined;
  if (!result || typeof result.access !== 'string' || !result.access ||
      typeof result.refresh !== 'string' || !result.refresh) throw makerUnavailable();
  return { access: result.access, refresh: result.refresh };
}

interface MakerRequestOptions {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  redirect: 'error';
  signal: AbortSignal;
}

export type MakerTransport = (url: string, options: MakerRequestOptions) => Promise<Response>;

async function readResponse(response: IncomingMessage): Promise<Response> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error('Maker response exceeded the allowed size.');
    chunks.push(chunk);
  }
  return new Response(size === 0 ? null : Buffer.concat(chunks), { status: response.statusCode });
}

const requestMaker: MakerTransport = (url, { method, headers, body, signal }) => {
  const send = url.startsWith('https:') ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = send(url, { method, headers, signal }, (response) => {
      void readResponse(response).then(resolve, reject);
    });
    request.once('error', reject);
    request.end(body);
  });
};

export class MakerAccounts {
  constructor(private readonly config: IdeConfig, private readonly request: MakerTransport = requestMaker) {}

  async login(username: string, password: string) {
    const value = await this.call('login', { username, password }, undefined,
      () => new ApiError(401, 'INVALID_CREDENTIALS', 'The username or password is incorrect.'));
    return { credentials: credentials(value), user: user((value as { user?: unknown })?.user) };
  }

  async me(access: string): Promise<MakerUser> {
    return user(await this.call('me', undefined, access));
  }

  async refresh(refresh: string): Promise<Required<MakerCredentials>> {
    return credentials(await this.call('refresh', { refresh }));
  }

  async logout(refresh: string, access: string): Promise<void> {
    await this.call('logout', { refresh }, access);
  }

  private async call(operation: string, body?: object, bearer?: string, rejected = unauthorized): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.makerHost) headers.Host = this.config.makerHost;
    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    let response: globalThis.Response;
    try {
      response = await this.request(this.config.makerBaseUrl + '/api/v1/auth/' + operation + '/', {
        method: body ? 'POST' : 'GET',
        headers, body: payload,
        redirect: 'error', signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw makerUnavailable();
    }
    if (response.status === 429) throw new ApiError(429, 'RATE_LIMITED', 'Try again in a minute.');
    if (response.status === 403) throw restricted();
    if (response.status === 400 || response.status === 401) throw rejected();
    if (!response.ok) throw makerUnavailable();
    if (operation === 'logout') return undefined;
    try {
      return await response.json();
    } catch {
      throw makerUnavailable();
    }
  }
}

export function assertWritable(user: MakerUser): void {
  if (user.is_banned === true || user.restriction) throw restricted();
}
