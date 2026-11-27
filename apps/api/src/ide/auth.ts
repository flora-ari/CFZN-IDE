import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { decode, sign, verify } from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { ApiError } from '../common/api-error';
import type { IdeConfig } from './config';
import { MakerAccounts, type MakerCredentials, type MakerUser, unauthorized } from './maker';
import { SerialQueue, transaction } from './state';

export const IDE_AUTH_ROUTE = '/api/v1/ide/auth';
const ACCESS_TTL = 120 * 60;
const REFRESH_TTL = 7 * 24 * 60 * 60;
const ACCESS_COOKIE = 'cfzn_ide_access';
const REFRESH_COOKIE = 'cfzn_ide_refresh';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => Math.floor(Date.now() / 1000);
const invalidTicket = () => new ApiError(401, 'INVALID_SSO_TICKET', 'The SSO ticket is invalid or expired.');

interface Session {
  id: string;
  owner: string;
  maker_credentials: string;
  access_nonce: string;
  refresh_digest: string;
  expires: number;
}

export interface IdePrincipal {
  owner: string;
  user: MakerUser;
}

export function bearer(request: Request): string | undefined {
  const header = request.get('authorization');
  if (header === undefined) return undefined;
  const match = /^Bearer ([^\s,]+)$/i.exec(header);
  if (!match || match[1].length > 8192) throw unauthorized();
  return match[1];
}

function cookie(request: Request, name: string): string | undefined {
  const prefix = name + '=';
  const cookies = request.get('cookie')?.split(';').map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(prefix)) ?? [];
  return cookies.length === 1 ? cookies[0].slice(prefix.length) : undefined;
}

export class IdeAuth {
  private readonly queue = new SerialQueue();
  private readonly encryptionKey: Buffer;
  private readonly signingKey: Buffer;

  constructor(
    private readonly db: DatabaseSync,
    private readonly config: IdeConfig,
    private readonly maker: MakerAccounts,
  ) {
    this.encryptionKey = this.deriveSecret('maker-credentials');
    this.signingKey = this.deriveSecret('jwt-signing');
  }

  async login(username: string, password: string, response: Response) {
    const result = await this.maker.login(username, password);
    return this.newSession(result.user, result.credentials, response);
  }

  async principal(request: Request): Promise<IdePrincipal> {
    const token = bearer(request) ?? cookie(request, ACCESS_COOKIE);
    const claims = this.verifyToken(token, 'access');
    const session = this.session(claims.subject);
    if (!session || session.expires <= now() || session.access_nonce !== claims.nonce) throw unauthorized();
    const user = await this.maker.me(this.unseal(session.maker_credentials).access);
    if (String(user.id) !== session.owner) throw unauthorized();
    return { owner: session.owner, user };
  }

  async refresh(request: Request, explicitRefresh: string | undefined, response: Response) {
    const token = explicitRefresh ?? cookie(request, REFRESH_COOKIE);
    const claims = this.verifyToken(token, 'refresh');
    const hashed = digest(token!);
    return this.queue.run(claims.subject, async () => {
      const session = this.session(claims.subject);
      if (!session || session.expires <= now() || session.refresh_digest !== hashed) throw unauthorized();
      let credentials = this.unseal(session.maker_credentials);
      if (credentials.refresh) {
        credentials = await this.maker.refresh(credentials.refresh);
        // Persist the rotated Maker refresh even if its subsequent profile request is temporarily unavailable.
        this.db.prepare('UPDATE ide_sessions SET maker_credentials = ? WHERE id = ? AND refresh_digest = ?')
          .run(this.seal(credentials), session.id, hashed);
      }
      const user = await this.maker.me(credentials.access);
      if (String(user.id) !== session.owner) throw unauthorized();
      return this.issue(session.id, user, credentials, response, hashed);
    });
  }

  async logout(request: Request, explicitRefresh: string | undefined, response: Response): Promise<void> {
    for (const [name, path] of [[ACCESS_COOKIE, '/api/'], [REFRESH_COOKIE, IDE_AUTH_ROUTE + '/']]) {
      response.clearCookie(name, this.cookieOptions(path));
    }
    const explicitClaims = this.optionalToken(explicitRefresh, 'refresh');
    const refresh = explicitClaims ? explicitRefresh : cookie(request, REFRESH_COOKIE);
    let access: string | undefined;
    try { access = bearer(request); } catch { /* still clear valid browser credentials */ }
    const refreshClaims = explicitClaims ?? this.optionalToken(refresh, 'refresh');
    const accessClaims = this.optionalToken(access, 'access') ?? this.optionalToken(cookie(request, ACCESS_COOKIE), 'access');
    const sessionId = refreshClaims?.subject ?? accessClaims?.subject;
    if (!sessionId) return;
    await this.queue.run(sessionId, async () => {
      const session = this.session(sessionId);
      if (!session || (session.refresh_digest !== digest(refresh ?? '') &&
          !(accessClaims?.subject === sessionId && accessClaims.nonce === session.access_nonce))) return;
      this.db.prepare('DELETE FROM ide_sessions WHERE id = ?').run(sessionId);
      const credentials = this.unseal(session.maker_credentials);
      if (credentials.refresh) await this.maker.logout(credentials.refresh, credentials.access).catch(() => undefined);
    });
  }

  async createTicket(token: string) {
    const user = await this.maker.me(token);
    const owner = String(user.id);
    const ticket = randomBytes(32).toString('base64url');
    const expires = now() + this.config.ticketTtl;
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM ide_sso_tickets WHERE expires <= ?').run(now());
      this.db.prepare('DELETE FROM ide_sso_tickets WHERE owner = ?').run(owner);
      this.db.prepare('INSERT INTO ide_sso_tickets VALUES (?, ?, ?, ?)').run(
        digest(ticket), owner, this.seal({ access: token }), expires,
      );
    });
    const entry = new URL('/sso', this.config.publicOrigin);
    entry.searchParams.set('ticket', ticket);
    return { ticket, expires_in: this.config.ticketTtl, entry_url: entry.href, exchange_path: IDE_AUTH_ROUTE + '/exchange/' };
  }

  async exchange(ticket: string, response: Response) {
    const hash = digest(ticket);
    const row = this.db.prepare('SELECT owner, maker_credentials FROM ide_sso_tickets WHERE digest = ? AND expires > ?')
      .get(hash, now()) as { owner: string; maker_credentials: string } | undefined;
    if (!row) throw invalidTicket();
    const credentials = this.unseal(row.maker_credentials);
    let user: MakerUser;
    try {
      user = await this.maker.me(credentials.access);
    } catch (error) {
      if (error instanceof ApiError && error.getStatus() === 401) throw invalidTicket();
      throw error;
    }
    if (String(user.id) !== row.owner) throw invalidTicket();
    const consumed = this.db.prepare('DELETE FROM ide_sso_tickets WHERE digest = ? AND expires > ?').run(hash, now());
    if (consumed.changes !== 1) throw invalidTicket();
    return this.newSession(user, credentials, response);
  }

  private newSession(user: MakerUser, credentials: MakerCredentials, response: Response) {
    this.db.prepare('DELETE FROM ide_sessions WHERE expires <= ?').run(now());
    return this.issue(randomUUID(), user, credentials, response);
  }

  private issue(id: string, user: MakerUser, credentials: MakerCredentials, response: Response, previous?: string) {
    const decoded = decode(credentials.access);
    const makerExpiry = typeof decoded === 'object' && typeof decoded?.exp === 'number' ? decoded.exp : undefined;
    const refreshTtl = !credentials.refresh && makerExpiry !== undefined
      ? Math.min(REFRESH_TTL, makerExpiry - now()) : REFRESH_TTL;
    const accessTtl = makerExpiry === undefined ? ACCESS_TTL : Math.min(ACCESS_TTL, makerExpiry - now());
    if (accessTtl < 1 || refreshTtl < 1) throw unauthorized();
    const nonce = randomUUID();
    const access = this.signToken(id, 'access', nonce, accessTtl);
    const refresh = this.signToken(id, 'refresh', randomUUID(), refreshTtl);
    const encrypted = this.seal(credentials);
    const expires = now() + refreshTtl;
    if (previous === undefined) {
      this.db.prepare('INSERT INTO ide_sessions VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, String(user.id), encrypted, nonce, digest(refresh), expires);
    } else {
      const updated = this.db.prepare(
        'UPDATE ide_sessions SET maker_credentials = ?, access_nonce = ?, refresh_digest = ?, expires = ? WHERE id = ? AND refresh_digest = ?',
      ).run(encrypted, nonce, digest(refresh), expires, id, previous);
      if (updated.changes !== 1) throw unauthorized();
    }
    response.cookie(ACCESS_COOKIE, access, { ...this.cookieOptions('/api/'), maxAge: accessTtl * 1000 });
    response.cookie(REFRESH_COOKIE, refresh, { ...this.cookieOptions(IDE_AUTH_ROUTE + '/'), maxAge: refreshTtl * 1000 });
    return { access, refresh, expires_in: accessTtl, user };
  }

  private session(id: string): Session | undefined {
    return this.db.prepare('SELECT * FROM ide_sessions WHERE id = ?').get(id) as unknown as Session | undefined;
  }

  private cookieOptions(path: string) {
    return { path, httpOnly: true, sameSite: 'lax' as const, secure: this.config.publicOrigin.startsWith('https:') };
  }

  private signToken(id: string, kind: string, nonce: string, expiresIn: number): string {
    return sign({ kind }, this.signingKey, {
      algorithm: 'HS256', issuer: 'cfzn-ide', audience: 'cfzn-ide', subject: id, jwtid: nonce, expiresIn,
    });
  }

  private optionalToken(token: string | undefined, kind: string) {
    try {
      return this.verifyToken(token, kind);
    } catch {
      return undefined;
    }
  }

  private verifyToken(token: string | undefined, kind: string): { subject: string; nonce: string } {
    if (!token || token.length > 8192) throw unauthorized();
    try {
      const claims = verify(token, this.signingKey, { algorithms: ['HS256'], issuer: 'cfzn-ide', audience: 'cfzn-ide' });
      if (typeof claims === 'object' && claims.kind === kind && claims.sub && claims.jti) {
        return { subject: claims.sub, nonce: claims.jti };
      }
    } catch {
      throw unauthorized();
    }
    throw unauthorized();
  }

  private deriveSecret(purpose: string): Buffer {
    return createHash('sha256').update(purpose + '\0' + this.config.sessionSecret).digest();
  }

  private seal(credentials: MakerCredentials): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  private unseal(value: string): MakerCredentials {
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as MakerCredentials;
  }
}
