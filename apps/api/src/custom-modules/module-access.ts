import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ApiError } from '../common/api-error';
import type { LocalModuleStore } from './local-module.store';

export const CUSTOM_MODULE_ROUTE = '/api/v1/custom-modules';

export type OwnerScope = string & { readonly ownerScope: unique symbol };

export interface VerifiedModuleIdentity {
  issuer: string;
  subject: string;
  tenant?: string;
}

export interface CustomModuleIdentityResolver {
  /** Resolve an identity only after verifying it server-side. */
  resolve(request: Request): Promise<VerifiedModuleIdentity | null>;
}

const defaultOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const cookieLifetimeMs = 365 * 24 * 60 * 60 * 1000;
const digest = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const scope = (parts: string[]) => digest(parts) as OwnerScope;
const authRequired = () => new ApiError(401, 'CUSTOM_MODULE_AUTH_REQUIRED', 'A valid custom module session is required.');
const originDenied = () => new ApiError(403, 'CUSTOM_MODULE_ORIGIN_FORBIDDEN', 'Use an approved same-origin editor address.');

export class CustomModuleAccess {
  private readonly origins: URL[];

  constructor(
    private readonly store: LocalModuleStore,
    origins: readonly string[] = process.env.CUSTOM_MODULE_ORIGINS?.split(',').map((value) => value.trim()) ?? defaultOrigins,
    private readonly identity?: CustomModuleIdentityResolver,
  ) {
    this.origins = [...new Set(origins)].map((value) => {
      const url = URL.parse(value);
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
        throw new Error('Provide exact HTTP(S) origins in CUSTOM_MODULE_ORIGINS.');
      }
      return url;
    });
  }

  async resolve(request: Request, response: Response, bootstrap: boolean): Promise<OwnerScope> {
    const origin = this.requestOrigin(request);
    if (this.identity) return this.verifiedOwner(request);

    const name = `cfzn-module-session-${digest([origin.origin]).slice(0, 24)}`;
    const options = { path: CUSTOM_MODULE_ROUTE, httpOnly: true, sameSite: 'strict', secure: origin.protocol === 'https:' } as const;
    const prefix = `${name}=`;
    const cookies = request.get('cookie')?.split(';').map((cookie) => cookie.trim())
      .filter((cookie) => cookie.startsWith(prefix)) ?? [];
    if (cookies.length) {
      const token = cookies[0].slice(prefix.length);
      if (cookies.length === 1 && /^[0-9a-f]{64}$/.test(token)) {
        const owner = scope(['browser', origin.origin, token]);
        if (await this.store.hasBrowserOwner(owner)) return owner;
      }
      if (bootstrap) response.clearCookie(name, options);
      throw authRequired();
    }
    if (!bootstrap) throw authRequired();

    const token = randomBytes(32).toString('hex');
    const owner = scope(['browser', origin.origin, token]);
    if (!await this.store.reserveBrowserOwner(owner)) {
      throw new ApiError(503, 'CUSTOM_MODULE_IDENTITY_UNAVAILABLE', 'Try opening the custom module directory again.');
    }
    response.cookie(name, token, { ...options, maxAge: cookieLifetimeMs });
    return owner;
  }

  private requestOrigin(request: Request): URL {
    const supplied = request.get('origin');
    const site = request.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') throw originDenied();

    // The same-origin reverse proxy preserves Host. Forwarded headers are not identity inputs.
    const candidates = this.origins.filter((origin) => origin.host === request.get('host'));
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    if (supplied || !isRead) {
      const approved = candidates.find((origin) => origin.origin === supplied);
      if (approved) return approved;
    } else {
      const approved = candidates.length === 1 ? candidates[0] :
        candidates.find((origin) => origin.protocol === `${request.protocol}:`);
      if (approved) return approved;
    }
    throw originDenied();
  }

  private async verifiedOwner(request: Request): Promise<OwnerScope> {
    let identity: VerifiedModuleIdentity | null | undefined;
    try {
      identity = await this.identity?.resolve(request);
    } catch {
      throw new ApiError(503, 'CUSTOM_MODULE_IDENTITY_UNAVAILABLE', 'Custom module identity verification is unavailable.');
    }
    if (!identity || typeof identity.issuer !== 'string' || !identity.issuer.trim() ||
        typeof identity.subject !== 'string' || !identity.subject.trim() ||
        (identity.tenant !== undefined && (typeof identity.tenant !== 'string' || !identity.tenant.trim()))) {
      throw authRequired();
    }
    return scope(['account', identity.issuer, identity.tenant ?? '', identity.subject]);
  }
}
